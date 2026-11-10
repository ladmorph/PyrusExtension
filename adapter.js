(() => {
  const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
  const valueText = value => String(value ?? '').normalize('NFKC').replace(/\s+/g,' ').trim();
  const rowSelector = '.formFieldBaseWrapper,[data-field-id],[data-fieldid],.form-field,.field-row,.form-group';
  const isPicker = kind => ['pyrus-choice','pyrus-catalog','pyrus-person','pyrus-multi-choice'].includes(kind);
  const populated = value => Array.isArray(value)?value.length>0:typeof value==='string'?value.trim().length>0:value!==''&&value!==false&&value!=null;
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
  function inventory(source=false,includeHidden=false) {
    const nodes = [...document.querySelectorAll(source?'input,textarea,select,[contenteditable="true"],.multiLineInputContent,.formFieldSimpleView,.horizontalMultiInput,.formFieldPersonView':'input,textarea,select,[contenteditable="true"]')];
    const pyrusPage=Boolean(document.querySelector?.('.formFieldBaseWrapper'));
    const fields=nodes.filter(el => !el.closest('[role="dialog"]') &&
      !el.closest('.copyToClipboard,.viewTableSearch,.formCell,.CommentSection,nav,[role="search"]') &&
      (!pyrusPage || el.closest('.formFieldBaseWrapper')) &&
      !['hidden','password','file','submit','button','reset','search'].includes(el.type) &&
      (source || (!el.disabled && !el.readOnly && !el.closest('.checkbox_disabled'))) &&
      (!source || !el.closest('.horizontalMultiInput') || el.matches('.horizontalMultiInput')) &&
      (includeHidden || visible(el) || (el.type==='checkbox' && visible(el.closest('.checkbox'))))).map(el => {
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
      const label=normalize(title?.textContent),groups=groupPath(root);
      // Read table contents only when this inventory actually needs their value.
      // The memo belongs to this inventory; never carry it across field writes.
      let value;
      const readValue=()=>value??=(globalThis.pyrusTables.data(root));
      if(label)fields.push({el:root,key:`table:${groups.join(' / ')} / ${label}`,label,groups,fieldId:'',kind:'pyrus-table',get value(){return readValue();},get unsupported(){return !readValue().columns.length;},radioValue:null});
    }
    return globalThis.pyrusTables?fields.sort((a,b)=>a.el===b.el?0:a.el.compareDocumentPosition(b.el)&2?1:-1):fields;
  }
  const serial = f => { const {el, ...rest} = f; return rest; };
  function plan(source, overwrite, requestedKeys=null) {
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
    // All source fields still participate in ownership/ambiguity checks, even
    // when only one selected field needs a value and a reason right now.
    return source.map((s,index) => {
      if(requestedKeys&&!requestedKeys.has(s.key))return null;
      const matches=direct[index].length?direct[index]:pool(s,index);
      const duplicates = sourceKeyCounts.get(s.key) > 1;
      const shared=matches.length===1&&!direct[index].length&&(fallbackOwners.get(matches[0])||[]).some(i=>i!==index);
      const ambiguous=duplicates || matches.length>1 || shared;
      const rawTarget=matches.length===1&&!ambiguous?matches[0]:null;
      // Empty and filled states of the same Pyrus picker can have different wrappers.
      const target=rawTarget && isPicker(s.kind)&&isPicker(rawTarget.kind)&&s.kind!=='pyrus-choice'?{...rawTarget,kind:s.kind}:rawTarget;
      const filled = target && (target.kind==='pyrus-table'?target.value.rows.length>0:populated(target.value));
      let reason = ambiguous ? 'Неоднозначное совпадение' : !target ? 'Поле не найдено в целевом черновике' : s.unsupported || target.unsupported ? 'Тип поля пока не поддерживается' : target.kind === 'radio' ? 'Радиогруппа: требуется адаптер' : filled && target.kind!=='pyrus-table' && !overwrite && JSON.stringify(target.value)!==JSON.stringify(s.value) ? 'В целевой задаче уже заполнено' : '';
      if (!reason && ['select','multi-select'].includes(target.kind)) {
        const values = Array.isArray(s.value) ? s.value : [s.value];
        if (values.some(v => ![...target.el.options].some(o => o.value === v))) reason = 'В списке нет исходного значения';
      }
      if(!reason && isPicker(target.kind) && s.value==='' && target.value!=='')reason='Очистка списка Pyrus пока не поддерживается';
      if(!reason && target.kind==='pyrus-multi-choice' && (!Array.isArray(s.value) || target.value.some(v=>!s.value.includes(v))))reason='В целевом множественном поле есть лишние варианты: автоматическое удаление пока не поддерживается';
      if(s.kind==='pyrus-table'&&!s.value?.rows?.length)reason='Строки таблицы источника не прочитаны или таблица пуста';
      const tablePending=target?.kind==='pyrus-table'&&!target.value.columns.length&&!s.unsupported&&s.value?.rows?.length>0;
      if(tablePending)reason='Столбцы таблицы ещё не загружены';
      const deferred = Boolean(tablePending || (!target && !ambiguous && !s.unsupported && s.kind !== 'radio'));
      return { key:s.key, label:s.label, kind:s.kind, value:s.value, reason, deferred, target,
        matching:{mode:ambiguous?'ambiguous':!target?'missing':direct[index].length?'exact-key':s.fieldId&&s.fieldId===rawTarget.fieldId?'field-id':'unique-label'} };
    }).filter(Boolean);
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
    let el=field.el;
    const refresh=()=>{const current=field.resolve?.();if(current&&current!==el)el=current;};
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
    refresh();return el;
  }
  async function choose(field,value) {
    let el=field.el;
    const previous=el.value;
    const tableChoice=el.matches('.cellRadioButton__input');
    const popupSelector=tableChoice?'.cellRadioButton__popuper':'.inputCompletion__popup';
    const closePicker=()=>{
      el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
      el.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',bubbles:true}));
      el.blur();
    };
    if(field.kind!=='pyrus-multi-choice' && valueText(previous)===valueText(value))return;
    const existingPopups=new Set([...document.querySelectorAll(popupSelector)].filter(visible));
    const refresh=()=>{const current=field.resolve?.();if(current&&current!==el)el=current;};
    if(tableChoice){
      el=await openTableChoice(field);
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
        const optionSelector=tableChoice?'.dropdownList__control,[role="option"]':field.kind==='pyrus-catalog'?'.completionTableMenuItem,[role="option"],[role="row"],tbody tr':'.completionMenuItem,[role="option"]';
        let candidates=[...new Set(panels.flatMap(p=>[...p.querySelectorAll(optionSelector)]))].filter(o=>visible(o)&&o.getAttribute('aria-disabled')!=='true');
        // A row can contain a role=option; count its clickable item only once.
        candidates=candidates.filter(o=>!candidates.some(other=>other!==o && o.contains(other)));
        const options=candidates.filter(o=>!o.disabled && (tableChoice?valueText((o.querySelector('.dropdownList__itemTextContent')||o.querySelector('.dropdownList__itemText')||o).textContent)===valueText(value):matchOption(o,value,field.kind==='pyrus-catalog')));
        if(options.length>1)throw new Error('choice-ambiguous');
        if(options.length===1){activateOption(options[0],value,field.kind==='pyrus-catalog');await delay(200);closePicker();return;}
      }
      throw new Error('choice-option-not-found');
    }catch(e){
      if(!tableChoice)writeNative(el,previous);closePicker();throw e;
    }
  }
  async function setValue(field, value, preparedTable=false,overwrite=true) {
    const el = field.el;
    if(field.kind==='pyrus-table')return globalThis.pyrusTables.apply(el,value,setValue,preparedTable,overwrite);
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
    replacementFields: (readback=false) => inventory(readback).filter(f=>f.kind!=='pyrus-table' && !f.el.closest('.viewTableFieldNew,.horizontalMultiInput') && !f.unsupported && ['text','textarea','pyrus-text','select','pyrus-choice','pyrus-catalog','pyrus-person'].includes(f.kind)),
    replacementTables: () => inventory().filter(f=>f.kind==='pyrus-table'),
    setReplacementValue: setValue,
    fieldCount: () => inventory().length,
    hasFilledValues: () => inventory(true,true).some(field=>field.kind==='pyrus-table'?field.value.rows.length>0:field.kind==='richtext'?populated(field.el.textContent):populated(field.value))||[...document.querySelectorAll('.viewTableFieldNew .cellString__content,.viewTableFieldNew input:not([type="hidden"]):not(.cellField__focusTarget),.viewTableFieldNew textarea,.viewTableFieldNew select')].some(el=>populated(el.matches('.cellString__content')?el.textContent:el.type==='checkbox'?el.checked:el.value))||[...document.querySelectorAll('.formFieldBaseWrapper input[type="file"]')].some(el=>el.files?.length),
    prefillFields: (source,overwrite) => {
      const selector='input,textarea,select,[contenteditable="true"],.viewTableFieldNew',nodes=[...document.querySelectorAll(selector)];
      return plan(source,overwrite).filter(field=>!field.reason&&field.target).map(field=>({key:field.key,label:field.target.label,groups:field.target.groups,kind:field.target.kind,value:field.value,fieldId:field.target.fieldId,domIndex:nodes.indexOf(field.target.el),date:field.target.el.matches?.('.formFieldDateInput__input')||field.target.kind==='date'||field.target.kind==='datetime-local'}));
    },
    prefillMatches: (source,keys) => {
      const selected=new Set(keys),current=plan(source,true,selected);
      return current.length===selected.size&&current.every(field=>field.target&&!field.reason&&(field.target.kind==='pyrus-table'?globalThis.pyrusTables.verify(field.target.el,field.value):JSON.stringify(field.target.value)===JSON.stringify(field.value)));
    },
    capture: () => inventory(true).map(serial),
    captureTables: async () => {
      const baseline=inventory(true);
      const tables=await globalThis.pyrusTables.prepareCapture();
      // Keep the source order and the data read while each table was rendered.
      return baseline.map(f=>serial(f.kind==='pyrus-table'&&tables.has(f.el)?{...f,value:tables.get(f.el),unsupported:!tables.get(f.el).columns.length}:f));
    },
    preview: (source, overwrite) => plan(source, overwrite).map(({target,matching,...r}) => r),
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
      const selectedKeys=new Set(keys),selectedFields=source.filter(f=>selectedKeys.has(f.key));
      const ordered = selectedFields.map(f => f.key);
      const sourceIndices=new Map();source.forEach((f,index)=>{if(!sourceIndices.has(f.key))sourceIndices.set(f.key,index);});
      const groupTitles=[...new Set([...expandedGroups,...source.flatMap(f=>f.groups || [])])];
      // A selected dependent field must not bypass an earlier differing picker.
      const lastSelected=source.reduce((last,f,i)=>selectedKeys.has(f.key)?i:last,-1);
      const requiredPickers=source.slice(0,lastSelected+1).map((field,index)=>({field,index})).filter(({field})=>isPicker(field.kind) && valueText(field.value)!=='' && !selectedKeys.has(field.key));
      let blocked=false;
      for (const key of ordered) {
        const sourceIndex=sourceIndices.get(key),original=source[sourceIndex],fieldKeys=new Set([key]);
        globalThis.pyrusProgress?.update({completed:result.length,total:ordered.length,stage:'Заполнение полей',label:original.label||'Поле',detail:''});
        if(blocked){result.push({label:original.label || 'Поле',status:'blocked',reason:'blocked-by-picker',message:'Не заполнено: предыдущий справочник или список не удалось перенести. Исправьте его и повторите перенос.'});continue;}
        // Check only preceding controllers, after earlier selected fields have been filled.
        const precedingPickers=requiredPickers.filter(({index})=>index<sourceIndex);
        const requestedKeys=new Set([key,...precedingPickers.map(({field})=>field.key)]);
        const currentPlan=plan(source,overwrite,requestedKeys);
        const controller=precedingPickers.find(({field})=>{
          const p=currentPlan.find(p=>p.key===field.key);
          if(p?.matching.mode==='missing')return false;
          return !p?.target || valueText(p.target.value)!==valueText(field.value);
        });
        if(controller){
          result.push({label:original.label,status:'blocked',reason:'unselected-controller',controllerIndex:controller.index,message:'Не заполнено: предыдущее управляющее поле не выбрано для переноса и отличается от источника.'});blocked=true;continue;
        }
        let p = currentPlan.find(p=>p.key===key),preparedRoot=null;
        // Conditional controls may mount asynchronously after an earlier input/change.
        if (p?.deferred&&!p.target) {
          for(let attempt=0;attempt<6 && p.deferred&&!p.target;attempt++) {
            await pause(250);
            if(globalThis.pyrusExpand)await globalThis.pyrusExpand.run({groupTitles,fields:selectedFields});
            p=plan(source,overwrite,fieldKeys).find(p=>p.key===key);
          }
        }
        // Load each matched table before checking its editors or protecting
        // existing values: neither can be decided from an unrendered table.
        if(p?.target?.kind==='pyrus-table'&&!original.unsupported&&original.value?.rows?.length){
          globalThis.pyrusProgress?.update({detail:'Жду загрузки строк и столбцов таблицы…'});
          try{await globalThis.pyrusTables.prepare(p.target.el);preparedRoot=p.target.el;}
          catch{
            result.push({label:p.label,status:'error',reason:'table-prepare-failed',message:'Не удалось загрузить таблицу. Остальные поля продолжают заполняться.'});
            continue;
          }
          p=plan(source,overwrite,fieldKeys).find(p=>p.key===key);
        }
        if (!p || p.reason) {
          if(!p || p.matching.mode==='missing'){
            result.push({label:p?.label || source[sourceIndex].label,status:'skipped',reason:'missing',message:'Поле отсутствует в целевой форме. Пропущено, перенос продолжается.'});
            continue;
          }
          result.push({label:p?.label || 'Поле',status:'skipped',reason:p?.reason || 'missing',message:p?.deferred&&p.kind!=='pyrus-table'?'Поле не появилось после заполнения предыдущих. Проверьте условие отображения.':p?.reason || 'Не найдено'});
          if(isPicker(original?.kind) && valueText(p?.target?.value)!==valueText(original.value))blocked=true;
          continue;
        }
        try {
          if(p.target.kind==='pyrus-table'?globalThis.pyrusTables.verify(p.target.el,p.value):JSON.stringify(p.target.value)===JSON.stringify(p.value)){
            result.push({label:p.label,status:'dispatched',reason:'already-matched',message:'Значение уже совпадает с источником.'});continue;
          }
          const written=await setValue(p.target, p.value, preparedRoot===p.target.el,overwrite);
          await waitForUpdate(p.target.kind==='pyrus-catalog');
          if(globalThis.pyrusExpand)await globalThis.pyrusExpand.run({groupTitles,fields:selectedFields});
          const resolved=plan(source,true,fieldKeys).find(f=>f.key===key);
          const accepted=Boolean(resolved?.target && !resolved.reason && resolved.matching.mode!=='ambiguous' && (p.target.kind==='pyrus-table'?globalThis.pyrusTables.verify(resolved.target.el,written?.expected||p.value,written?.allowExtraRows):JSON.stringify(resolved.target.value)===JSON.stringify(p.value)));
          if(!accepted && isPicker(p.target.kind))blocked=true;
          const preserved=accepted&&written&&(written.preservedCells||written.extraRows);
          result.push({label:p.label,status:accepted?(preserved?'partial':'dispatched'):'unverified',reason:accepted?(preserved?'existing-values-preserved':'dom-value-matched'):'dom-value-mismatch',message:preserved?'Заполнено пустых ячеек: '+written.writtenCells+'. Сохранено заполненных ячеек: '+written.preservedCells+'. Дополнительных строк сохранено: '+written.extraRows+'.':accepted?'Значение передано. Проверьте сохранение в Pyrus.':'Значение не подтверждено в DOM. Проверьте поле вручную.'});
        }
        catch (e) { if(p.target.kind==='pyrus-table'){const choiceError=['choice-ambiguous','choice-popup-ambiguous','choice-option-not-found'].includes(e.message);const reason=choiceError?e.message:/^table-(columns-ambiguous|columns-missing|source-empty|source-incomplete|extra-target-rows|add-row-ambiguous|row-not-added|cell-missing|editor-unsupported|cell-not-confirmed|not-confirmed)$/.test(e.message)?e.message:'table-write-failed';result.push({label:p.label,status:'error',reason,message:'Таблица заполнена не полностью: '+reason+'. Остальные поля продолжают заполняться.'});continue;} if(isPicker(p.target.kind))blocked=true; const reason=['choice-ambiguous','choice-popup-ambiguous','choice-option-not-found'].includes(e.message)?e.message:'setter-failed'; result.push({label:p.label,status:'error',reason,message:reason==='choice-option-not-found'?'Точный вариант списка не найден. Исходный текст поиска восстановлен.':reason==='choice-ambiguous'?'Найдено несколько одинаковых вариантов списка. Выбор отменён.':reason==='choice-popup-ambiguous'?'Открыто несколько списков. Закройте лишние и повторите перенос.':'Не удалось установить значение. Проверьте поле вручную.'}); }
      }
      globalThis.pyrusProgress?.update({completed:ordered.length,total:ordered.length,stage:'Проверка результата',label:'',detail:''});
      return result.map((entry,index)=>({...entry,sourceIndex:sourceIndices.get(ordered[index])}));
    }
  };
})();
