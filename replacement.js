(() => {
 if(globalThis.pyrusReplacement)return;
 let plan=null;
 const fields=()=>[...globalThis.pyrusTransfer.replacementFields(),...globalThis.pyrusTables.replacementCells()].map(f=>f.kind==='select'?{...f,value:f.el.selectedOptions[0]?.textContent??''}:f);
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
 // Match the same DOM control after each write. Detached/reordered cells are skipped.
 function live(entry){
  const candidates=fields().filter(f=>entry.cell?f.cell===entry.cell&&f.r===entry.r&&f.c===entry.c:f.el===entry.el);
  return candidates.length===1?candidates[0]:null;
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
   for(const entry of currentPlan.entries){
    if(entry.reason){results.push({status:'skipped',reason:'replacement-unsupported'});continue;}
    if(location.href!==currentPlan.url){results.push({status:'skipped',reason:'replacement-page-changed'});break;}
    const target=live(entry);
    if(!target || target.value!==entry.before){results.push({status:'skipped',reason:'replacement-value-changed'});continue;}
    try{
     const option=target.kind==='select'?selectOption(target,entry.after):null;
     if(target.kind==='select'&&!option){results.push({status:'skipped',reason:'replacement-option-changed'});continue;}
     await globalThis.pyrusTransfer.setReplacementValue(target,option?option.value:entry.after);
     let accepted=false;
     for(let n=0;n<15;n++){
      await pause(100);const updated=live(entry);
      if(updated?.value===entry.after){accepted=true;break;}
     }
     results.push({status:accepted?'dispatched':'error',reason:accepted?'dom-value-matched':'replacement-not-confirmed'});
    }catch{results.push({status:'error',reason:'replacement-write-failed'});}
   }
   return results;
  }
 };
})();
