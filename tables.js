(() => {
  const norm=v=>String(v??'').normalize('NFKC').replace(/\s+/g,' ').replace(/\s*\*\s*$/,'').trim();
  const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const roots=()=>[...document.querySelectorAll('.viewTableFieldNew')].filter(visible);
  const own=(root,selector)=>[...root.querySelectorAll(selector)].filter(el=>el.closest('.viewTableFieldNew')===root);
  function columns(root){
    const headers=own(root,'.headerHolder tr,.viewTableHeader tr,thead tr');
    const row=headers.find(el=>visible(el)&&el.querySelector('.headerCell'));
    return row?[...row.querySelectorAll('.headerCell')].map(el=>norm(el.textContent)):[];
  }
  const rows=root=>own(root,'tbody tr.viewTableRow,tbody tr.formRow,tbody tr').filter(el=>visible(el)&&!el.closest('tfoot,thead'));
  const cells=row=>{
    const direct=[...row.children].filter(el=>el.matches('td,[role="cell"],[role="gridcell"]'));
    // Pyrus marks data cells explicitly. Row numbers, selection controls and
    // virtualization spacer cells must not shift the column mapping.
    const dataCells=direct.filter(el=>el.matches('.viewTableCell,[data-col-idx]'));
    if(dataCells.length)return dataCells;
    return direct.filter(el=>!el.matches('.formCell_sticky,.stickyCell,.formCell_centralized')&&!el.querySelector('.stickyCell__rowSymbol'));
  };
  function read(cell){
    const text=cell.querySelector('.cellString__content');
    if(text)return norm(text.innerText??text.textContent);
    const input=cell.querySelector('input:not(.cellField__focusTarget):not([type="hidden"]),textarea,select');
    if(input)return input.type==='checkbox'?input.checked:norm(input.value);
    return norm(cell.textContent);
  }
  const data=root=>({columns:columns(root),rows:rows(root).map(row=>cells(row).map(read)).filter(row=>row.some(v=>v!==''&&v!==false))});
  function mapping(wanted,actual){
    if(!wanted.length||wanted.some(c=>!c)||new Set(wanted).size!==wanted.length||new Set(actual).size!==actual.length)throw Error('table-columns-ambiguous');
    const map=wanted.map(c=>actual.indexOf(c));
    if(map.some(i=>i<0))throw Error('table-columns-missing');
    return map;
  }
  function verify(root,value){
    try{const actual=data(root),map=mapping(value.columns,actual.columns);
      return actual.rows.length===value.rows.length&&value.rows.every((row,r)=>row.every((v,c)=>JSON.stringify(v)===JSON.stringify(actual.rows[r]?.[map[c]])));
    }catch{return false;}
  }
  async function apply(root,value,setValue){
    globalThis.pyrusTableStatus={rows:value.rows.length,columns:value.columns.length,sourceRowWidths:value.rows.map(row=>row.length),rowIndex:null,columnIndex:null,confirmedCells:0};
    const localSnapshot=()=>{
      const state=globalThis.pyrusTableStatus;
      const row=state.rowIndex===null?null:rows(root)[state.rowIndex];
      const cell=row&&state.columnIndex!==null?cells(row)[state.columnIndex]:null;
      const scope=cell||row||root;
      const nodes=[scope,...scope.querySelectorAll(cell?'*':'tbody,tr,.addRowButton,input,[contenteditable]'),...document.querySelectorAll('.inputCompletion__popup,.cellRadioButton__popuper,.cellRadioButton__popuper .dropdownList__control,[role="listbox"]')].slice(0,40);
      globalThis.pyrusTableStatus.context=nodes.map(el=>({tag:el.tagName,classes:[...el.classList].slice(0,8),visible:Boolean(visible(el)),children:el.children.length,disabled:Boolean(el.disabled),readOnly:Boolean(el.readOnly)}));
      globalThis.pyrusTableStatus.renderedRows=rows(root).length;
    };
    root.scrollIntoView?.({block:'center',behavior:'instant'});await pause(250);localSnapshot();
    const map=mapping(value.columns,columns(root));
    if(!value.rows.length)throw Error('table-source-empty');
    if(value.rows.some(row=>row.length!==value.columns.length))throw Error('table-source-incomplete');
    if(data(root).rows.length>value.rows.length)throw Error('table-extra-target-rows');
    for(let r=0;r<value.rows.length;r++){
      globalThis.pyrusTableStatus.rowIndex=r;globalThis.pyrusTableStatus.phase='find-row';
      let current=rows(root);
      if(current.length<=r){
        const buttons=own(root,'.addRowButton').filter(visible);
        if(buttons.length!==1)throw Error('table-add-row-ambiguous');
        globalThis.pyrusTableStatus.phase='add-row';
        buttons[0].scrollIntoView?.({block:'nearest',behavior:'instant'});
        buttons[0].click();
        for(let attempt=0;attempt<20&&rows(root).length<=r;attempt++)await pause(100);
        current=rows(root);localSnapshot();if(current.length<=r)throw Error('table-row-not-added');
      }
      for(let c=0;c<map.length;c++){
        globalThis.pyrusProgress?.update({detail:'Таблица · строка '+(r+1)+' из '+value.rows.length+' · столбец '+(c+1)+' из '+map.length});
        globalThis.pyrusTableStatus.phase='write-cell';
        globalThis.pyrusTableStatus.rowIndex=r;globalThis.pyrusTableStatus.columnIndex=c;
        localSnapshot();
        const cell=cells(rows(root)[r])[map[c]],valueToWrite=value.rows[r][c];
        if(!cell)throw Error('table-cell-missing');
        if(JSON.stringify(read(cell))===JSON.stringify(valueToWrite))continue;
        let el=cell.querySelector('.cellString__content[contenteditable="true"],input:not(.cellField__focusTarget):not([type="hidden"]),textarea,select');
        if(!el){cell.click();await pause(100);el=cell.querySelector('[contenteditable="true"],input:not(.cellField__focusTarget):not([type="hidden"]),textarea,select');}
        if(!el||el.disabled||el.readOnly)throw Error('table-editor-unsupported');
        const kind=el.matches('.cellString__content[contenteditable="true"]')?'pyrus-text':el.matches('.cellRadioButton__input,[role="combobox"]')?'pyrus-choice':el.type==='checkbox'?'checkbox':el.tagName==='SELECT'?'select':el.closest('.cellString__main')&&!el.hasAttribute('aria-autocomplete')?'text':null;
        if(!kind)throw Error('table-editor-unsupported');
        if(el.closest('.horizontalMultiInput')||el.matches('[type="file"],[type="password"]'))throw Error('table-editor-unsupported');
        const resolve=()=>cells(rows(root)[r]||{children:[]})[map[c]]?.querySelector('.cellRadioButton__input');
        try{await setValue({el,kind,resolve},valueToWrite);}catch(error){localSnapshot();throw error;}
        let accepted=false;
        for(let attempt=0;attempt<15;attempt++){const live=cells(rows(root)[r]||{children:[]})[map[c]];if(live&&JSON.stringify(read(live))===JSON.stringify(valueToWrite)){accepted=true;break;}await pause(100);}
        if(!accepted)throw Error('table-cell-not-confirmed');
        globalThis.pyrusTableStatus.confirmedCells++;
      }
    }
    if(!verify(root,value))throw Error('table-not-confirmed');
  }
  async function prepareCapture(){
    const positions=[...new Set([document.scrollingElement,...document.querySelectorAll('*')])].filter(el=>el&&(el===document.scrollingElement||el.scrollHeight>el.clientHeight||el.scrollWidth>el.clientWidth||el.scrollTop||el.scrollLeft)).map(el=>[el,el.scrollTop,el.scrollLeft]);
    const captured=new Map();
    try{for(const root of roots()){
      root.scrollIntoView?.({block:'center',behavior:'instant'});await pause(200);
      captured.set(root,data(root));
    }}finally{for(const [el,top,left] of positions){el.scrollTop=top;el.scrollLeft=left;}}
    return captured;
  }
  // Replacement addresses individual rendered cells; it never rewrites a whole table.
  function replacementCells(readback=false){
    return roots().flatMap(root=>rows(root).flatMap((row,r)=>cells(row).map((cell,c)=>({root,cell,r,c}))))
      .map(({root,cell,r,c})=>{
        const el=cell.querySelector('.cellString__content,input:not(.cellField__focusTarget):not([type="hidden"]),textarea,select');
        if(!el || !visible(el) || (!readback&&(el.disabled || el.readOnly || el.closest('[contenteditable="false"]'))) || el.closest('.horizontalMultiInput'))return null;
        const kind=el.matches(readback?'.cellString__content':'.cellString__content[contenteditable="true"]')?'pyrus-text':el.matches('.cellRadioButton__input')?'pyrus-choice':el.tagName==='SELECT'&&!el.multiple?'select':el.tagName==='TEXTAREA'?'textarea':el.closest('.cellString__main')&&el.matches('input[type="text"],input:not([type])')&&!el.hasAttribute('aria-autocomplete')?'text':null;
        if(!kind)return null;
        const title=norm(root.querySelector('.viewTableFieldNew__title .formFieldTitle__textValue,.viewTableFieldNew__title')?.textContent)||'Таблица';
        const value=kind==='pyrus-text'?(el.innerText??el.textContent):el.value;
        return {el,cell,root,r,c,rowCount:rows(root).length,columnNames:columns(root),kind,value,label:title+' · строка '+(r+1)+' · '+(columns(root)[c]||'столбец '+(c+1)),resolve:()=>cells(rows(root)[r]||{children:[]})[c]?.querySelector('.cellRadioButton__input')};
      }).filter(Boolean);
  }
  globalThis.pyrusTables={roots,data,verify,apply,prepareCapture,replacementCells};
})();
