(() => {
 const id=value=>{
  if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<=0))return null;
  const text=String(value??'');return /^\d+$/.test(text)&&/[1-9]/.test(text)?text.replace(/^0+/,''):null;
 };
 function route(input,origin,requireFields){
  let url;try{url=new URL(String(input).trim(),origin?origin+'/t':undefined);}catch{throw Error('Вставьте полную ссылку на предзаполненную форму Pyrus.');}
  if(!/^https?:$/.test(url.protocol)||url.username||url.password||origin&&url.origin!==origin)throw Error('Ссылка должна вести на тот же сервер Pyrus.');
  if(!/\/t\/?$/.test(url.pathname))throw Error('Поддерживаются ссылки Pyrus вида /t#uf123&f1=значение.');
  const parts=url.hash.slice(1).split('&'),match=/^uf(\d+)$/.exec(parts.shift()||'');
  if(!match||!id(match[1]))throw Error('Откройте обычный новый черновик: его адрес должен содержать #uf и номер формы.');
  const params=[],seen=new Set();
  for(const part of parts){
   const separator=part.indexOf('=');if(separator<0)throw Error('В ссылке есть неподдерживаемый параметр.');
   let key,value;try{key=decodeURIComponent(part.slice(0,separator));value=decodeURIComponent(part.slice(separator+1).replace(/\+/g,' '));}catch{throw Error('Ссылка содержит повреждённое кодирование текста.');}
   const field=/^f(\d+)(?::(\d+))?$/.exec(key);
   if(!field||!id(field[1])||field[2]&&!id(field[2]))throw Error('В ссылке поддерживаются только параметры полей f123 и ячеек f123:1.');
   key='f'+id(field[1])+(field[2]?':'+id(field[2]):'');
   if(seen.has(key))throw Error('В ссылке одно поле указано несколько раз.');seen.add(key);params.push([key,value]);
  }
  if(requireFields&&!params.length)throw Error('В ссылке нет предзаполненных полей.');
  return {base:url.origin+url.pathname+url.search+'#uf'+match[1],origin:url.origin,formId:id(match[1]),params};
 }
 const join=(base,params)=>base+params.map(([key,value])=>'&'+key+'='+encodeURIComponent(value)).join('');
 function parseNativeLink(input,origin){
  const parsed=route(input,origin,true),url=join(parsed.base,parsed.params);
  if(url.length>100000)throw Error('Ссылка слишком длинная. Используйте обычный перенос полей.');
  return {...parsed,url};
 }
 function dateValue(value){
  const text=String(value),iso=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text),local=/^(\d{2})\.(\d{2})\.(\d{4})(?:[, ]+(\d{2}):(\d{2}))?$/.exec(text),compact=/^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if(!iso&&!local&&!compact)throw Error('date-format');
  const parts=iso||compact,year=Number(parts?parts[1]:local[3]),month=Number(parts?parts[2]:local[2]),day=Number(parts?parts[3]:local[1]),hour=Number(iso?.[4]||local?.[4]||0),minute=Number(iso?.[5]||local?.[5]||0),second=Number(iso?.[6]||0),date=new Date(year,month-1,day,hour,minute,second);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day||date.getHours()!==hour||date.getMinutes()!==minute||date.getSeconds()!==second)throw Error('date-value');
  return iso?.[4]||local?.[4]?date.toString():String(year).padStart(4,'0')+String(month).padStart(2,'0')+String(day).padStart(2,'0');
 }
 function scalar(value,isDate=false){
  if(typeof value==='boolean')return String(value);
  if(typeof value==='number'){if(!Number.isFinite(value))throw Error('number');return String(value);}
  if(typeof value!=='string')throw Error('unsupported-value');
  return isDate&&value?dateValue(value):value;
 }
 function buildLink(base,fields,bindings,totalFields=fields.length){
  const parsed=route(base,undefined,false),byKey=new Map(bindings.map(binding=>[binding.key,binding]));
  const supported=new Set(['text','textarea','pyrus-text','number','date','datetime-local','checkbox','select','pyrus-choice','email','tel','url','time','month','week']);
  const simpleColumns=new Set(['text','string','textarea','number','money','choice','select','checkbox','date','datetime','datetime-local','time','email','phone','url']);
  const groups=[];
  for(const field of fields){
   const binding=byKey.get(field.key);if(!binding)continue;
   try{
    if(field.kind==='pyrus-table'){
     const value=field.value;if(!value?.rows?.length||value.rows.some(row=>row.length!==value.columns.length))continue;
     const columns=value.columns.map(name=>{const matches=(binding.columns||[]).filter(column=>column.name===name);return matches.length===1?matches[0]:null;});
     if(columns.some(column=>!id(column?.id)||!simpleColumns.has(column.kind))||new Set(columns.map(column=>id(column.id))).size!==columns.length)continue;
     const params=value.rows.flatMap((row,r)=>row.map((cell,c)=>['f'+id(columns[c].id)+':'+(r+1),scalar(cell,['date','datetime','datetime-local'].includes(columns[c].kind))]));
     groups.push({key:field.key,table:true,ids:columns.map(column=>id(column.id)),params});
    }else if(supported.has(field.kind)&&id(binding.id)){
     groups.push({key:field.key,table:false,ids:[id(binding.id)],params:[['f'+id(binding.id),scalar(field.value,field.date)]]});
    }
   }catch{}
  }
  // An uncertain binding must not write a second field through the same number.
  const owners=new Map();for(const group of groups)for(const fieldId of group.ids)owners.set(fieldId,(owners.get(fieldId)||0)+1);
  const accepted=groups.filter(group=>group.ids.every(fieldId=>owners.get(fieldId)===1)),params=accepted.flatMap(group=>group.params);
  if(!params.length)throw Error('Не удалось надёжно определить номера подходящих полей. Используйте обычный перенос или готовую ссылку из Pyrus.');
  const url=join(parsed.base,params);if(url.length>100000)throw Error('Ссылка слишком длинная. Используйте обычный перенос полей.');
  return {url,fieldCount:accepted.filter(group=>!group.table).length,cellCount:accepted.filter(group=>group.table).reduce((sum,group)=>sum+group.params.length,0),skipped:Math.max(0,totalFields-accepted.length),keys:accepted.map(group=>group.key)};
 }
 // Runs in MAIN only when creating a prefilled link. Reads confirmed field
 // numbers, never calls React handlers and never changes the current form.
 function readBindings(fields,expectedUrl){
  if(location.href!==expectedUrl)throw Error('Страница изменилась. Повторите подготовку ссылки.');
  const numeric=value=>{if(!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isSafeInteger(value))return null;const text=String(value);return /^\d+$/.test(text)&&/[1-9]/.test(text)?text.replace(/^0+/,''):null;};
  const norm=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').replace(/\s*\*\s*$/,'').trim();
  const own=(object,key)=>{if(object&&(typeof object==='object'||typeof object==='function'))try{const entry=Object.getOwnPropertyDescriptor(object,key);return entry&&'value'in entry?entry.value:undefined;}catch{}};
  const name=model=>[own(model,'name'),own(model,'fieldName'),own(model,'title'),own(model,'label')].find(value=>typeof value==='string');
  const modelId=model=>numeric(own(model,'fieldId')??own(model,'field_id')??own(model,'id'));
  const kind=model=>{const value=own(model,'type')??own(model,'kind');return typeof value==='string'?value.toLowerCase():null;};
  function models(anchor,label){
   const found=[],seen=new WeakSet();
   for(const element of [anchor,anchor?.parentElement].filter(Boolean)){
    const key=Object.getOwnPropertyNames(element).find(key=>/^__react(?:Fiber|InternalInstance)\$/.test(key));
    let fiber=key&&own(element,key);
    for(let depth=0;fiber&&depth<20;depth++,fiber=own(fiber,'return')){
     if(seen.has(fiber))break;seen.add(fiber);const props=own(fiber,'memoizedProps');
     if(norm(name(props))===label&&numeric(own(props,'fieldId')))found.push({id:own(props,'fieldId'),name:label,type:own(props,'type')});
     for(const key of ['field','formField','fieldModel','model','column']){
      const candidate=own(props,key),nested=key==='column'?own(candidate,'field'):null;
      if(norm(name(candidate))===label&&modelId(candidate))found.push(candidate);
      if(norm(name(nested))===label&&modelId(nested))found.push(nested);
     }
    }
   }
   return found;
  }
  function explicit(elements){
   const ids=[];
   for(const element of elements.filter(Boolean)){
    for(const key of ['data-field-id','data-fieldid','data-form-field-id']){const value=numeric(element.getAttribute?.(key));if(value)ids.push(value);}
    for(const key of ['name','id']){const match=/^(?:f|field[_-])(\d+)(?::\d+)?$/.exec(element.getAttribute?.(key)||'');if(match&&numeric(match[1]))ids.push(numeric(match[1]));}
   }
   return ids;
  }
  const unique=ids=>{const values=[...new Set(ids.filter(Boolean))];return values.length===1?values[0]:null;};
  const nodes=[...document.querySelectorAll('input,textarea,select,[contenteditable="true"],.viewTableFieldNew')],result=[];
  for(const field of fields){
   const element=nodes[field.domIndex];if(!element)continue;
   const root=field.kind==='pyrus-table'?element:element.closest('.formFieldBaseWrapper,[data-field-id],[data-fieldid],.form-field,.field-row,.form-group');
   if(!root)continue;
   const title=field.kind==='pyrus-table'?root.querySelector('.viewTableFieldNew__title .formFieldTitle__textValue,.viewTableFieldNew__title,.formFieldBaseWrapper__titleWrapper'):root.querySelector('.formFieldBaseWrapper__titleWrapper .formFieldTitle__textValue,.formFieldBaseWrapper__titleWrapper');
   if(norm(title?.textContent)!==norm(field.label))continue;
   const groups=[];for(let parent=root.parentElement;parent;parent=parent.parentElement)if(parent.matches('.formField,.formFieldGroup')){const title=parent.querySelector('.formFieldGroupTitle');if(title&&title.closest('.formField,.formFieldGroup')===parent&&!root.contains(title))groups.unshift(norm(title.querySelector('.formFieldTitle__textValue')?.textContent||title.textContent));}
   if(JSON.stringify(groups.filter(Boolean))!==JSON.stringify(field.groups||[]))continue;
   if(field.kind!=='pyrus-table'){
    const direct=explicit([element,root]),native=models(element,norm(field.label));
    const fieldId=unique(direct.length?direct:native.map(modelId));if(fieldId)result.push({key:field.key,id:fieldId});
   }else{
    const tableModels=models(root,norm(field.label)),children=tableModels.flatMap(model=>['fields','columns','children'].flatMap(key=>Array.isArray(own(model,key))?own(model,key):[]));
    const headers=[...root.querySelectorAll('.headerCell')].filter(header=>header.closest('.viewTableFieldNew')===root);
    const columns=field.value.columns.map(label=>{
     const matching=headers.filter(header=>norm(header.textContent)===norm(label)),header=matching.length===1?matching[0]:null;
     const native=[...children.filter(model=>norm(name(model))===norm(label)),...models(header,norm(label))];
     const direct=explicit([header]),fieldId=unique(direct.length?direct:native.map(modelId));
     let type=native.map(kind).find(Boolean);
     if(!type&&header){
      const index=headers.indexOf(header),row=root.querySelector('tbody tr'),direct=row?[...row.children].filter(cell=>cell.matches('td,[role="cell"],[role="gridcell"]')):[],data=direct.filter(cell=>cell.matches('.viewTableCell,[data-col-idx]'));
      const cell=(data.length?data:direct.filter(cell=>!cell.matches('.formCell_sticky,.stickyCell,.formCell_centralized')&&!cell.querySelector('.stickyCell__rowSymbol')))[index];
      if(cell?.querySelector('.cellString__content'))type='text';else if(cell?.querySelector('.cellRadioButton__input'))type='choice';else if(cell?.querySelector('input[type="checkbox"]'))type='checkbox';
     }
     return {name:label,id:fieldId,kind:type||'unknown'};
    });
    result.push({key:field.key,columns});
   }
  }
  return result;
 }
 globalThis.pyrusPrefill={parseNativeLink,buildLink,readBindings};
})();
