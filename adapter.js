(() => {
  const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
  const valueText = value => String(value ?? '').normalize('NFKC').replace(/\s+/g,' ').trim();
  const rowSelector = '.formFieldBaseWrapper,[data-field-id],[data-fieldid],.form-field,.field-row,.form-group';
  const isPicker = kind => ['pyrus-choice','pyrus-catalog','pyrus-person','pyrus-multi-choice'].includes(kind);
  const tokens=container=>[...new Set([...container.querySelectorAll('.multiInputToken .token__text')].map(el=>valueText(el.textContent)).filter(Boolean))].sort();
  const compatible = (a,b) => a.kind===b.kind || (a.kind!=='pyrus-multi-choice'&&b.kind!=='pyrus-multi-choice'&&isPicker(a.kind)&&isPicker(b.kind)&&(a.kind==='pyrus-choice'||b.kind==='pyrus-choice')) || (['text','textarea','pyrus-text'].includes(a.kind)&&['text','textarea','pyrus-text'].includes(b.kind)&&!a.unsupported&&!b.unsupported);
  const visible = el => Boolean(el?.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
  function groupPath(row) {
    const labels=[];
    for(let parent=row?.parentElement;parent;parent=parent.parentElement) {
      if(!parent.matches?.('.formField,.formFieldGroup'))continue;
      const title=parent.querySelector('.formFieldGroupTitle');
      if(title && title.closest('.formField,.formFieldGroup')===parent && !row.contains(title))labels.unshift(normalize(title.querySelector('.formFieldTitle__textValue')?.textContent || title.textContent));
    }
    return labels.filter(Boolean);
  }
  function inventory(source=false) {
    const nodes = [...document.querySelectorAll(source?'input,textarea,select,[contenteditable="true"],.multiLineInputContent,.formFieldSimpleView,.horizontalMultiInput,.formFieldPersonView':'input,textarea,select,[contenteditable="true"]')];
    const pyrusPage=Boolean(document.querySelector?.('.formFieldBaseWrapper'));
    const fields=nodes.filter(el => !el.closest('[role="dialog"]') &&
      !el.closest('.copyToClipboard,.viewTableSearch,.formCell,.CommentSection,nav,[role="search"]') &&
      (!pyrusPage || el.closest('.formFieldBaseWrapper')) &&
      !['hidden','password','file','submit','button','reset','search'].includes(el.type) &&
      (source || (!el.disabled && !el.readOnly && !el.closest('.checkbox_disabled'))) &&
      (!source || !el.closest('.horizontalMultiInput') || el.matches('.horizontalMultiInput')) &&
      (visible(el) || (el.type==='checkbox' && visible(el.closest('.checkbox'))))).map(el => {
      const row = el.closest(rowSelector);
      const pyrus=Boolean(row?.matches?.('.formFieldBaseWrapper'));
      const labelled = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
      const title=pyrus ? row.querySelector('.formFieldBaseWrapper__titleWrapper .formFieldTitle__textValue') || row.querySelector('.formFieldBaseWrapper__titleWrapper') : null;
      const label = normalize(title?.textContent || el.getAttribute('aria-label') || labelled || [...(el.labels || [])].map(n => n.textContent).join(' ') || row?.querySelector('label,.field-name,.field-title')?.textContent);
      const id = row?.getAttribute('data-field-id') || row?.getAttribute('data-fieldid') || '';
      const editable=el.isContentEditable || el.getAttribute('contenteditable')==='true';
      const plainPyrusText=pyrus && (editable||source) && el.matches('.multiLineInputContent');
      const multiChoice=pyrus && ((el.getAttribute('role')==='combobox' && el.closest('.horizontalMultiInput') && el.closest('.formFieldRadio__content')) || (source && el.matches('.horizontalMultiInput') && Boolean(row.querySelector('.formFieldRadio__button,.formFieldRadio__content'))));
      const singleCombo=pyrus && (el.getAttribute('role')==='combobox' || (source && el.matches('.formFieldSimpleView') && (el.matches('.formFieldInputCompletion') || row.querySelector('.formFieldRadio__button')))) && !el.closest('.horizontalMultiInput');
      const personView=source && pyrus && el.matches('.formFieldPersonView');
      const personChoice=personView || (singleCombo && row.querySelector('.personFieldAvatar,.formFieldInputCompletion__personAvatar'));
      const scalarChoice=singleCombo && !personChoice;
      const catalogChoice=pyrus && el.getAttribute('role')==='combobox' && el.closest('.formFieldCatalog__content,.formFieldCatalog__mainContent') && !el.closest('.horizontalMultiInput');
      const kind = multiChoice ? 'pyrus-multi-choice' : plainPyrusText ? 'pyrus-text' : personChoice ? 'pyrus-person' : catalogChoice ? 'pyrus-catalog' : scalarChoice ? 'pyrus-choice' : el.tagName === 'SELECT' ? (el.multiple ? 'multi-select' : 'select') : editable ? 'richtext' : el.type || 'text';
      const unsupported = (source && pyrus && el.matches('.horizontalMultiInput') && !multiChoice) || !multiChoice && !scalarChoice && !catalogChoice && !personChoice && (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') || el.closest('[role="combobox"]')) || kind === 'richtext';
      const value = personView ? valueText(el.querySelector('.avatarWithTextContent')?.textContent) : multiChoice ? tokens(el.closest('.horizontalMultiInput')) : ['checkbox','radio'].includes(kind) ? el.checked : kind === 'multi-select' ? [...el.selectedOptions].map(o => o.value) : plainPyrusText ? (el.innerText ?? el.textContent) : editable ? '' : source && pyrus && el.matches('.formFieldSimpleView') ? (el.querySelector('.formFieldSimpleView__placeholder')?'':valueText(el.textContent)) : el.value;
      const groups=pyrus ? groupPath(row) : [];
      const path=groups.join(' / ');
      const key = id ? `field:${id}:${kind}` : label ? `label:${path ? path+' / ' : ''}${label}:${kind}` : '';
      return { el, key, groups, fieldId:id, label: label || (id ? `Поле ${id}` : 'Без названия'), kind, value, unsupported: Boolean(unsupported), radioValue: kind === 'radio' ? el.value : null };
    }).filter(f => f.key).map(f => ({...f, key: f.kind === 'radio' ? `${f.key}:${f.radioValue}` : f.key}));
    for(const root of globalThis.pyrusTables?.roots()||[]){
      const title=root.querySelector('.viewTableFieldNew__title .formFieldTitle__textValue') || root.querySelector('.viewTableFieldNew__title') || root.querySelector('.formFieldBaseWrapper__titleWrapper');
      const label=normalize(title?.textContent),groups=groupPath(root),value=globalThis.pyrusTables.data(root);
      if(label)fields.push({el:root,key:`table:${groups.join(' / ')} / ${label}`,label,groups,fieldId:'',kind:'pyrus-table',value,unsupported:!value.columns.length,radioValue:null});
    }
    return globalThis.pyrusTables?fields.sort((a,b)=>a.el===b.el?0:a.el.compareDocumentPosition(b.el)&2?1:-1):fields;
  }
  const serial = f => { const {el, ...rest} = f; return rest; };
  function plan(source, overwrite) {
    const targets = inventory();
    // Index this inventory only; never reuse DOM matches across field writes.
    const byKey=new Map(),byLabel=new Map(),byFieldId=new Map(),sourceKeyCounts=new Map();
    const add=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
    for(const t of targets){add(byKey,t.key,t);add(byLabel,normalize(t.label),t);if(t.fieldId)add(byFieldId,t.fieldId,t);}
    for(const s of source)sourceKeyCounts.set(s.key,(sourceKeyCounts.get(s.key)||0)+1);
    const direct=source.map(s=>byKey.get(s.key)||[]);
    const directOwners=new Map();
    direct.forEach((matches,index)=>{if(matches.length===1)add(directOwners,matches[0],index);});
    const pools=new Map();
    const pool=(s,index)=>{
      if(pools.has(index))return pools.get(index);
      const byId=s.fieldId?(byFieldId.get(s.fieldId)||[]).filter(t=>compatible(s,t)):[];
      const candidates=byId.length?byId:(byLabel.get(normalize(s.label))||[]).filter(t=>compatible(s,t)&&!(s.fieldId&&t.fieldId&&s.fieldId!==t.fieldId));
      const available=candidates.filter(t=>!(directOwners.get(t)||[]).some(i=>i!==index));
      pools.set(index,available);return available;
    };
    const fallbackOwners=new Map();
    source.forEach((s,index)=>{if(!direct[index].length)for(const t of pool(s,index))add(fallbackOwners,t,index);});
    return source.map((s,index) => {
      const matches=direct[index].length?direct[index]:pool(s,index);
      const duplicates = sourceKeyCounts.get(s.key) > 1;
      const shared=matches.length===1&&!direct[index].length&&(fallbackOwners.get(matches[0])||[]).some(i=>i!==index);
      const ambiguous=duplicates || matches.length>1 || shared;
      const rawTarget=matches.length===1&&!ambiguous?matches[0]:null;
      // Empty and filled states of the same Pyrus picker can have different wrappers.
      const target=rawTarget && isPicker(s.kind)&&isPicker(rawTarget.kind)&&s.kind!=='pyrus-choice'?{...rawTarget,kind:s.kind}:rawTarget;
      const filled = target && (target.kind==='pyrus-table'?target.value.rows.length>0:Array.isArray(target.value) ? target.value.length > 0 : target.value !== '' && target.value !== false);
      let reason = ambiguous ? 'Неоднозначное совпадение' : !target ? 'Поле не найдено после раскрытия — скачайте отчёт' : s.unsupported || target.unsupported ? 'Нестандартное поле: требуется адаптер' : target.kind === 'radio' ? 'Радиогруппа: требуется адаптер' : filled && !overwrite && JSON.stringify(target.value)!==JSON.stringify(s.value) ? 'В целевой задаче уже заполнено' : '';
      if (!reason && ['select','multi-select'].includes(target.kind)) {
        const values = Array.isArray(s.value) ? s.value : [s.value];
        if (values.some(v => ![...target.el.options].some(o => o.value === v))) reason = 'В списке нет исходного значения';
      }
      if(!reason && isPicker(target.kind) && s.value==='' && target.value!=='')reason='Очистка списка Pyrus пока не поддерживается';
      if(!reason && target.kind==='pyrus-multi-choice' && (!Array.isArray(s.value) || target.value.some(v=>!s.value.includes(v))))reason='В целевом множественном поле есть лишние варианты: автоматическое удаление пока не поддерживается';
      if(s.kind==='pyrus-table'&&!s.value?.rows?.length)reason='Строки таблицы источника не прочитаны или таблица пуста';
      const deferred = !target && !ambiguous && !s.unsupported && s.kind !== 'radio';
      return { key:s.key, label:s.label, value:s.value, reason, deferred, target,
        matching:{mode:ambiguous?'ambiguous':!target?'missing':direct[index].length?'exact-key':s.fieldId&&s.fieldId===rawTarget.fieldId?'field-id':'unique-label',sourceKind:s.kind,targetKind:rawTarget?.kind||null,candidates:matches.length,sameLabel:(byLabel.get(normalize(s.label))||[]).length,sourceLabelLength:normalize(s.label).length,sourceGroupDepth:(s.groups||[]).length,targetGroupDepth:(rawTarget?.groups||[]).length} };
    });
  }
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function writeNative(el,value) {
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function matchOption(option,value,catalog){
    const wanted=valueText(value);
    if(!wanted)return false;
    const cells=catalog?[...option.querySelectorAll('td,[role="cell"],[role="gridcell"]')].filter(visible):[];
    const named=option.querySelector('.completionMenuItem__name');
    if(valueText(option.textContent)===wanted || (named && valueText(named.textContent)===wanted) || cells.some(cell=>valueText(cell.textContent)===wanted))return true;
    // Pyrus can render the selected value as several column texts separated by punctuation.
    // Require all nonempty visible cells, in order, with no extra words or digits.
    const texts=cells.map(cell=>valueText(cell.textContent)).filter(Boolean);
    if(texts.length<2)return false;
    const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const separator='[\\s,;:|/()\\[\\]—–-]*';
    return new RegExp('^'+separator+texts.map(escape).join(separator)+separator+'$','u').test(wanted);
  }
  function activateOption(option,value,catalog){
    const cells=catalog?[...option.querySelectorAll('td,[role="cell"],[role="gridcell"]')].filter(visible):[];
    const target=cells.find(cell=>valueText(cell.textContent)===valueText(value)) || cells[0] || option.querySelector('.dropdownList__itemTextContent') || option.querySelector('.dropdownList__itemText') || option.querySelector('.completionMenuItem__name') || option;
    target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'mouse',button:0}));
    target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));
    target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'mouse',button:0}));
    target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0}));
    target.click();
  }
  async function openTableChoice(field){
    const documentFocusedAtStart=document.hasFocus?.()??null;
    let el=field.el,refreshed=0;
    const refresh=()=>{const current=field.resolve?.();if(current&&current!==el){el=current;refreshed++;}};
    el.closest('.formCell')?.querySelector('.cellField__focusTarget')?.focus();
    await delay(50);refresh();
    for(const type of ['pointerdown','mousedown','focus','pointerup','mouseup','click']){
      refresh();if(!el.isConnected)throw Error('table-editor-detached');
      if(type==='focus')el.focus();
      else{
        const rect=el.getBoundingClientRect();
        const init={bubbles:true,cancelable:true,button:0,buttons:type.endsWith('down')?1:0,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,pointerType:'mouse',pointerId:1,isPrimary:true};
        el.dispatchEvent(type.startsWith('pointer')?new PointerEvent(type,init):new MouseEvent(type,init));
      }
      await delay(20);
    }
    refresh();return {el,refreshed,documentFocusedAtStart};
  }
  async function choose(field,value) {
    let el=field.el;
    const previous=el.value;
    const tableChoice=el.matches('.cellRadioButton__input');
    const popupSelector=tableChoice?'.cellRadioButton__popuper':'.inputCompletion__popup';
    globalThis.pyrusPickerStatus={outcome:'opening',kind:field.kind,tableChoice};
    const closePicker=()=>{
      el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
      el.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',bubbles:true}));
      el.blur();
    };
    globalThis.pyrusPickerFailureStructure=null;
    if(field.kind!=='pyrus-multi-choice' && valueText(previous)===valueText(value)){globalThis.pyrusPickerStatus={outcome:'already-matched',kind:field.kind};return;}
    let panelCount=0,optionCount=0;
    const existingPopups=new Set([...document.querySelectorAll(popupSelector)].filter(visible));
    const opening={tableChoice,refreshed:0};
    globalThis.pyrusPickerStatus.opening=opening;
    const refresh=()=>{const current=field.resolve?.();if(current&&current!==el){el=current;opening.refreshed++;}};
    if(tableChoice){
      const opened=await openTableChoice(field);el=opened.el;opening.refreshed+=opened.refreshed;opening.documentFocusedAtStart=opened.documentFocusedAtStart;
    }else{
      el.focus();
      const icon=el.closest('.formFieldInputCompletion')?.querySelector('.formFieldInputCompletion__dropdownIconWrapper');
      if(icon)icon.click();else el.click();
    }
    // Table choice input displays the selected label; it is not a search editor.
    if(!tableChoice)writeNative(el,value);
    try {
      const searchQueries=[...new Set([String(value),String(value).split(/[,;:|/(\[]/)[0].trim(),String(value).trim().split(/\s+/).slice(0,2).join(' '),String(value).trim().split(/\s+/)[0]].filter(Boolean))];
      for(let attempt=0;attempt<(field.kind==='pyrus-catalog'?40:20);attempt++) {
        if(field.kind==='pyrus-catalog' && attempt>0 && attempt%10===0 && searchQueries[attempt/10])writeNative(el,searchQueries[attempt/10]);
        await delay(150);
        if(tableChoice)refresh();
        const ids=[...(el.getAttribute('aria-owns')||'').split(/\s+/),...(el.getAttribute('aria-controls')||'').split(/\s+/)].filter(Boolean);
        let panels=ids.map(id=>document.getElementById(id)).filter(p=>p&&visible(p));
        if(!panels.length){
          let popups=[...document.querySelectorAll(popupSelector)].filter(visible);
          if(popups.length>1){
            const opened=popups.filter(p=>!existingPopups.has(p));
            if(opened.length===1)popups=opened;
          }
          if(popups.length>1)throw new Error('choice-popup-ambiguous');
          if(popups.length===1 && (document.activeElement===el || el.getAttribute('aria-expanded')==='true' || tableChoice&&!existingPopups.has(popups[0])))panels=popups;
          else if(!popups.length){const lists=[...document.querySelectorAll('[role="listbox"]')].filter(visible);if(lists.length===1)panels=lists;}
        }
        panelCount=panels.length;
        const optionSelector=tableChoice?'.dropdownList__control,[role="option"]':field.kind==='pyrus-catalog'?'.completionTableMenuItem,[role="option"],[role="row"],tbody tr':'.completionMenuItem,[role="option"]';
        let candidates=[...new Set(panels.flatMap(p=>[...p.querySelectorAll(optionSelector)]))].filter(o=>visible(o)&&o.getAttribute('aria-disabled')!=='true');
        // A row can contain a role=option; count its clickable item only once.
        candidates=candidates.filter(o=>!candidates.some(other=>other!==o && o.contains(other)));
        optionCount=candidates.length;
        const options=candidates.filter(o=>!o.disabled && (tableChoice?valueText((o.querySelector('.dropdownList__itemTextContent')||o.querySelector('.dropdownList__itemText')||o).textContent)===valueText(value):matchOption(o,value,field.kind==='pyrus-catalog')));
        if(options.length>1)throw new Error('choice-ambiguous');
        if(options.length===1){activateOption(options[0],value,field.kind==='pyrus-catalog');await delay(200);closePicker();globalThis.pyrusPickerStatus={outcome:'selected',kind:field.kind,panelCount,optionCount};return;}
      }
      throw new Error('choice-option-not-found');
    }catch(e){
      const reason=['choice-ambiguous','choice-popup-ambiguous','choice-option-not-found'].includes(e.message)?e.message:'picker-error';
      globalThis.pyrusPickerStatus={outcome:reason,kind:field.kind,panelCount,optionCount,opening,inputConnected:el.isConnected,visiblePopupCount:[...document.querySelectorAll(popupSelector)].filter(visible).length};
      if(globalThis.pyrusStructure)try{globalThis.pyrusPickerFailureStructure=globalThis.pyrusStructure();}catch{}
      if(!tableChoice)writeNative(el,previous);closePicker();throw e;
    }
  }
  async function setValue(field, value) {
    const el = field.el;
    if(field.kind==='pyrus-table'){await globalThis.pyrusTables.apply(el,value,setValue);return;}
    if(field.kind==='pyrus-multi-choice'){
      const container=el.closest('.horizontalMultiInput');
      for(const item of value){
        if(tokens(container).includes(item))continue;
        const current=container.querySelector('input[role="combobox"]');
        if(!current)throw new Error('multi-input-missing');
        await choose({...field,el:current},item);
        let accepted=false;
        for(let attempt=0;attempt<10;attempt++){if(tokens(container).includes(item)){accepted=true;break;}await delay(100);}
        if(!accepted)throw new Error('multi-token-not-confirmed');
      }
      return;
    }
    if(isPicker(field.kind)){await choose(field,value);return;}
    if(field.kind==='checkbox'){if(el.checked!==value)el.click();return;}
    if(field.kind==='pyrus-text'){
      el.focus();
      const selection=document.getSelection?.();
      if(selection && typeof document.execCommand==='function'){
        const range=document.createRange();range.selectNodeContents(el);selection.removeAllRanges();selection.addRange(range);
        if(!document.execCommand('insertText',false,String(value)))el.textContent=String(value);
        selection.removeAllRanges();
      }else el.textContent=String(value);
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();return;
    }
    el.focus?.();
    if (el.tagName === 'SELECT' && el.multiple) [...el.options].forEach(o => { o.selected = value.includes(o.value); });
    else {
      const prop = field.kind === 'checkbox' ? 'checked' : 'value';
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, prop).set.call(el, value);
    }
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    el.blur?.();
  }
  globalThis.pyrusTransfer = {
    replacementFields: () => inventory().filter(f=>f.kind!=='pyrus-table' && !f.el.closest('.viewTableFieldNew,.horizontalMultiInput') && !f.unsupported && ['text','textarea','pyrus-text','select','pyrus-choice','pyrus-catalog','pyrus-person'].includes(f.kind)),
    setReplacementValue: setValue,
    openTableChoice,
    diagnose: (source=[]) => {
      const nodes = [...document.querySelectorAll('input,textarea,select,[contenteditable="true"]')];
      const recognized = inventory();
      const kinds = {};
      for (const f of recognized) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
      const duplicates = recognized.filter(f => recognized.filter(t => t.key === f.key).length > 1).length;
      // Explicit allowlist: no text, values, HTML, URLs, identifiers or CSS classes.
      return {
        totalControls: nodes.length, recognized: recognized.length,
        unsupported: recognized.filter(f => f.unsupported).length,
        ambiguousControls: duplicates, kinds,
        picker:globalThis.pyrusPickerStatus || null,
        table:globalThis.pyrusTableStatus || null,
        comparison: source.slice(0,200).map((s,index)=>{
          const matches=recognized.map((f,targetIndex)=>({f,targetIndex})).filter(({f})=>normalize(f.label)===normalize(s.label));
          const titles=[...(document.querySelectorAll('.formFieldBaseWrapper__titleWrapper') || [])].filter(el=>normalize(el.querySelector?.('.formFieldTitle__textValue')?.textContent || el.textContent)===normalize(s.label));
          return {sourceIndex:index,kind:s.kind,labelLength:normalize(s.label).length,groupDepth:(s.groups||[]).length,hasFieldId:Boolean(s.fieldId),sourceEmpty:s.value==='' || s.value==null,
            titleNodes:titles.length,hiddenTitleNodes:titles.filter(el=>!visible(el)).length,
            targetControls:titles.slice(0,3).flatMap(title=>[...(title.closest(rowSelector)?.querySelectorAll('input,textarea,select,[contenteditable],.formFieldSimpleView')||[])].slice(0,8).map(el=>({tag:el.tagName,visible:visible(el),disabled:Boolean(el.disabled),readOnly:Boolean(el.readOnly),editable:el.getAttribute('contenteditable'),classes:[...(el.classList||[])].slice(0,5)}))),
            candidates:matches.slice(0,20).map(({f,targetIndex})=>({targetIndex,kind:f.kind,groupDepth:f.groups.length,compatible:compatible(s,f),sameKey:f.key===s.key,sameValue:JSON.stringify(f.value)===JSON.stringify(s.value),textComparison:typeof f.value==='string'&&typeof s.value==='string'?{sourceLength:s.value.length,targetLength:f.value.length,sourceLines:s.value.split(/\r?\n/).length,targetLines:f.value.split(/\r?\n/).length,sameNormalizedWhitespace:valueText(s.value)===valueText(f.value)}:null,sameGroupPath:JSON.stringify(f.groups)===JSON.stringify(s.groups||[]),hasFieldId:Boolean(f.fieldId)}))};
        }),
        frames: document.querySelectorAll('iframe').length,
        truncated: nodes.length > 200,
        controls: nodes.slice(0,200).map((el,index) => ({
          index,
          tag: ['INPUT','TEXTAREA','SELECT'].includes(el.tagName) ? el.tagName : 'EDITABLE',
          type: ['text','number','date','datetime-local','email','tel','url','checkbox','radio','hidden','password','file','search','submit','button','reset','time','month','week','range','color'].includes(el.type) ? el.type : 'other',
          visible: Boolean(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden',
          disabled: Boolean(el.disabled), readOnly: Boolean(el.readOnly),
          hasLabel: Boolean(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.labels?.length),
          hasFieldContainer: Boolean(el.closest(rowSelector)),
          recognized: recognized.some(f => f.el === el)
        }))
      };
    },
    capture: () => inventory(true).map(serial),
    captureTables: async () => {
      const baseline=inventory(true);
      const tables=await globalThis.pyrusTables.prepareCapture();
      // Keep the source order and the data read while each table was rendered.
      return baseline.map(f=>serial(f.kind==='pyrus-table'&&tables.has(f.el)?{...f,value:tables.get(f.el),unsupported:!tables.get(f.el).columns.length}:f));
    },
    preview: (source, overwrite) => plan(source, overwrite).map(({target,...r}) => r),
    apply: async (source, keys, overwrite, expandedGroups=[]) => {
      const result = [];
      const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
      const waitForUpdate = (catalog=false) => new Promise(resolve => {
        if (typeof MutationObserver === 'undefined') { setTimeout(resolve,300); return; }
        let quiet, deadline;
        const finish = () => { observer.disconnect(); clearTimeout(quiet); clearTimeout(deadline); resolve(); };
        const observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(finish,catalog?700:250); });
        observer.observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});
        quiet=setTimeout(finish,catalog?1000:300);deadline=setTimeout(finish,catalog?6000:1500);
      });
      // Source inventory is in document order, regardless of selection/search order in the popup.
      const ordered = source.filter(f => keys.includes(f.key)).map(f => f.key);
      const groupTitles=[...new Set([...expandedGroups,...source.flatMap(f=>f.groups || [])])];
      // A selected dependent field must not bypass an earlier differing picker.
      const lastSelected=source.reduce((last,f,i)=>keys.includes(f.key)?i:last,-1);
      const requiredPickers=source.slice(0,lastSelected+1).filter(f=>isPicker(f.kind) && valueText(f.value)!=='' && !keys.includes(f.key));
      let blocked=false;
      for (const key of ordered) {
        // Check only preceding controllers, after earlier selected fields have been filled.
        const sourceIndex=source.findIndex(f=>f.key===key);
        const controller=requiredPickers.find(f=>source.indexOf(f)<sourceIndex && (()=>{
          const p=plan(source,overwrite).find(p=>p.key===f.key);
          if(p?.matching.mode==='missing')return false;
          return !p?.target || valueText(p.target.value)!==valueText(f.value);
        })());
        if(!blocked && controller){
          result.push({label:source[sourceIndex].label,status:'blocked',reason:'unselected-controller',controllerIndex:source.indexOf(controller),message:'Не заполнено: предыдущее управляющее поле не выбрано для переноса и отличается от источника.'});blocked=true;continue;
        }
        if(blocked){result.push({label:source.find(f=>f.key===key)?.label || 'Поле',status:'blocked',reason:'blocked-by-picker',message:'Не заполнено: предыдущий справочник или список не удалось перенести. Исправьте его и повторите перенос.'});continue;}
        let p = plan(source, overwrite).find(p => p.key === key);
        // Conditional controls may mount asynchronously after an earlier input/change.
        if (p?.deferred) {
          for(let attempt=0;attempt<6 && p.deferred;attempt++) {
            await pause(250);
            if(globalThis.pyrusExpand)await globalThis.pyrusExpand.run({groupTitles,fields:source.filter(f=>keys.includes(f.key))});
            p=plan(source,overwrite).find(p=>p.key===key);
          }
        }
        if (!p || p.reason) {
          if(!p || p.matching.mode==='missing'){
            result.push({label:p?.label || source[sourceIndex].label,status:'skipped',reason:'missing',message:'Поле отсутствует в целевой форме. Пропущено, перенос продолжается.'});
            continue;
          }
          result.push({label:p?.label || 'Поле',status:'skipped',reason:p?.reason || 'missing',message:p?.deferred?'Поле не появилось после заполнения предыдущих. Проверьте условие отображения.':p?.reason || 'Не найдено'});
          const original=source.find(f=>f.key===key);
          if(isPicker(original?.kind) && valueText(p?.target?.value)!==valueText(original.value))blocked=true;
          continue;
        }
        try {
          if(JSON.stringify(p.target.value)===JSON.stringify(p.value)){
            result.push({label:p.label,status:'dispatched',reason:'already-matched',message:'Значение уже совпадает с источником.'});continue;
          }
          await setValue(p.target, p.value);
          await waitForUpdate(p.target.kind==='pyrus-catalog');
          if(globalThis.pyrusExpand)await globalThis.pyrusExpand.run({groupTitles,fields:source.filter(f=>keys.includes(f.key))});
          const resolved=plan(source,true).find(f=>f.key===key);
          const accepted=Boolean(resolved?.target && !resolved.reason && resolved.matching.mode!=='ambiguous' && (p.target.kind==='pyrus-table'?globalThis.pyrusTables.verify(resolved.target.el,p.value):JSON.stringify(resolved.target.value)===JSON.stringify(p.value)));
          if(!accepted && isPicker(p.target.kind))blocked=true;
          result.push({label:p.label,status:accepted?'dispatched':'unverified',reason:accepted?'dom-value-matched':'dom-value-mismatch',message:accepted?'Значение передано. Проверьте сохранение в Pyrus.':'Значение не подтверждено в DOM. Проверьте поле вручную.'});
        }
        catch (e) { if(p.target.kind==='pyrus-table'){const choiceError=['choice-ambiguous','choice-popup-ambiguous','choice-option-not-found'].includes(e.message);if(globalThis.pyrusTableStatus){globalThis.pyrusTableStatus.picker=globalThis.pyrusPickerStatus||null;globalThis.pyrusTableStatus.errorType=['TypeError','ReferenceError','RangeError'].includes(e.name)?e.name:'Error';}const reason=choiceError?e.message:/^table-(columns-ambiguous|columns-missing|source-empty|source-incomplete|extra-target-rows|add-row-ambiguous|row-not-added|cell-missing|editor-unsupported|cell-not-confirmed|not-confirmed)$/.test(e.message)?e.message:'table-write-failed';result.push({label:p.label,status:'error',reason,table:globalThis.pyrusTableStatus||null,message:'Таблица заполнена не полностью: '+reason+'. Остальные поля продолжают заполняться.'});continue;} if(isPicker(p.target.kind))blocked=true; const reason=['choice-ambiguous','choice-popup-ambiguous','choice-option-not-found'].includes(e.message)?e.message:'setter-failed'; result.push({label:p.label,status:'error',reason,message:reason==='choice-option-not-found'?'Точный вариант списка не найден. Исходный текст поиска восстановлен.':reason==='choice-ambiguous'?'Найдено несколько одинаковых вариантов списка. Выбор отменён.':reason==='choice-popup-ambiguous'?'Открыто несколько списков. Закройте лишние и повторите перенос.':'Не удалось установить значение. Скачайте отчёт диагностики.'}); }
      }
      const finalPlan=plan(source,true);
      return result.map((entry,index)=>({...entry,sourceIndex:source.findIndex(f=>f.key===ordered[index]),matching:finalPlan.find(f=>f.key===ordered[index])?.matching||null}));
    }
  };
})();
