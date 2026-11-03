(() => {
 if(globalThis.pyrusReplacement)return;
 let plan=null;
 function fields(readback=false){
  const tables=globalThis.pyrusTransfer.replacementTables();
  return [...globalThis.pyrusTransfer.replacementFields(readback),...globalThis.pyrusTables.replacementCells(readback).map(f=>({...f,tableKey:tables.find(t=>t.el===f.root)?.key}))].map(f=>f.kind==='select'?{...f,value:f.el.selectedOptions[0]?.textContent??''}:f);
 }
 function selectOption(field,value){
  const matches=[...field.el.options].filter(o=>!o.disabled&&!o.closest('optgroup[disabled]')&&o.textContent===value);
  return matches.length===1?matches[0]:null;
 }
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function transformed(value,options){
  if(typeof value!=='string')return value;
  if(options.mode==='exact')return value===options.find?options.replace:value;
  return value.split(options.find).join(options.replace);
 }
 // Rebind only a unique logical field. Never guess between duplicate fields or resized tables.
 function live(entry,readback=false){
  const candidates=fields(readback).filter(f=>{
   const singlePicker=kind=>['pyrus-choice','pyrus-catalog','pyrus-person'].includes(kind);
   if(f.kind!==entry.kind&&!(readback&&singlePicker(f.kind)&&singlePicker(entry.kind)))return false;
   if(!entry.cell)return !f.cell&&(f.key===entry.key||(readback&&entry.fieldId&&f.fieldId===entry.fieldId));
   if(f.r!==entry.r||f.c!==entry.c||f.rowCount!==entry.rowCount||JSON.stringify(f.columnNames)!==JSON.stringify(entry.columnNames))return false;
   if(entry.cell.isConnected&&f.cell!==entry.cell)return false;
   return entry.tableKey?f.tableKey===entry.tableKey:f.root===entry.root;
  });
  return candidates.length===1?candidates[0]:null;
 }
 const equal=(a,b)=>typeof a==='string'&&typeof b==='string'?a.replace(/\r\n/g,'\n')===b.replace(/\r\n/g,'\n'):a===b;
 function verification(entry,target){
  return {targetFound:Boolean(target),originalConnected:entry.el.isConnected,sameAsBefore:target?equal(target.value,entry.before):false,expectedLength:entry.after.length,actualLength:typeof target?.value==='string'?target.value.length:null,normalizedWhitespaceEqual:typeof target?.value==='string'?target.value.replace(/\s+/g,' ').trim()===entry.after.replace(/\s+/g,' ').trim():false};
 }
 globalThis.pyrusReplacement={
  preview(options){
   if(!options || typeof options.find!=='string' || !options.find.length || typeof options.replace!=='string' || !['exact','contains'].includes(options.mode))throw Error('Введите непустой текст поиска и выберите режим замены.');
   const entries=fields().flatMap(f=>{
    const after=transformed(f.value,options);
    if(after===f.value)return [];
    const reason=f.kind==='select'&&!selectOption(f,after)?'В списке нет единственного доступного варианта':f.kind.startsWith('pyrus-')&&f.kind!=='pyrus-text'&&!after?'Очистка списка не поддерживается':'';
    return [{...f,before:f.value,after,reason}];
   });
   plan={token:crypto.randomUUID(),url:location.href,time:Date.now(),entries};
   return {token:plan.token,items:entries.map((f,index)=>({index,label:f.label,before:f.before,after:f.after,reason:f.reason})),ready:entries.filter(f=>!f.reason).length};
  },
  async apply(token){
   if(!plan || token!==plan.token || location.href!==plan.url || Date.now()-plan.time>600000)throw Error('Предпросмотр устарел. Повторите поиск.');
   const currentPlan=plan;plan=null;const results=[];
   for(const [index,entry] of currentPlan.entries.entries()){
    globalThis.pyrusProgress?.update({completed:index,total:currentPlan.entries.length,stage:'Замена значений',label:entry.label,detail:''});
    const finish=(status,reason,extra={})=>results.push({status,reason,label:entry.label,sourceIndex:index,replacement:{kind:entry.kind,table:Boolean(entry.cell),rowIndex:entry.r??null,columnIndex:entry.c??null,...extra}});
    if(entry.reason){finish('skipped','replacement-unsupported');continue;}
    if(location.href!==currentPlan.url){finish('skipped','replacement-page-changed');break;}
    const target=live(entry);
    if(!target || target.value!==entry.before){finish('skipped','replacement-value-changed',{verification:verification(entry,target)});continue;}
    try{
     const option=target.kind==='select'?selectOption(target,entry.after):null;
     if(target.kind==='select'&&!option){finish('skipped','replacement-option-changed');continue;}
     await globalThis.pyrusTransfer.setReplacementValue(target,option?option.value:entry.after);
     let accepted=false,stable=0,updated=null;
     for(let n=0;n<30;n++){
      await pause(100);
      if(location.href!==currentPlan.url)break;
      updated=live(entry,true);
      stable=updated&&equal(updated.value,entry.after)?stable+1:0;
      if(stable>=3){accepted=true;break;}
     }
     finish(accepted?'dispatched':'error',accepted?'dom-value-matched':'replacement-not-confirmed',{verification:verification(entry,updated)});
    }catch(error){finish('error',['choice-ambiguous','choice-popup-ambiguous','choice-option-not-found'].includes(error.message)?error.message:'replacement-write-failed',{verification:verification(entry,live(entry,true))});}
   }
   globalThis.pyrusProgress?.update({completed:results.length,total:currentPlan.entries.length,stage:'Проверка результата',label:'',detail:''});
   return results;
  }
 };
})();
