(() => {
 if(globalThis.pyrusTransferRunner)return;
 let running=false;
 globalThis.pyrusTransferRunner={start(execute,mode='transfer'){
  if(running)throw new Error('Заполнение уже выполняется на этой странице.');
  running=true;
  const banner=document.createElement('div');
  banner.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647;background:#fff;color:#172b4d;padding:16px;max-width:420px;border:2px solid #2874cf;border-radius:10px;font:14px sans-serif;box-shadow:0 4px 20px #0003';
  banner.textContent='Ожидаю фокус страницы Pyrus…';document.body.append(banner);
  // This task belongs to the page, not to the short-lived extension popup.
  setTimeout(async()=>{
   try{
    const deadline=Date.now()+30000;
    while(!document.hasFocus()){
     if(Date.now()>deadline)throw new Error('page-focus-timeout');
     await new Promise(resolve=>setTimeout(resolve,100));
    }
    banner.textContent=mode==='replacement'?'Заменяю значения. Оставьте эту вкладку активной…':'Заполняю черновик. Оставьте эту вкладку активной…';
    const result=await execute();
    const results=result.data.map(r=>({status:r.status,reason:r.reason,sourceIndex:r.sourceIndex,controllerIndex:r.controllerIndex,table:r.table,matching:r.matching||null}));
    await chrome.runtime.sendMessage({type:'pyrus-transfer-finished',diagnostic:result.diagnostic,results});
    const ok=results.filter(r=>r.status==='dispatched').length;
    banner.textContent=(mode==='replacement'?'Заменено: ':'Готово: ')+ok+'. Пропущено или требует проверки: '+(results.length-ok)+'. Проверьте результат и сохраните задачу в Pyrus. Отчёт доступен в расширении.';
   }catch(error){
    banner.textContent='Операция прервана. Откройте расширение и скачайте отчёт. Если вкладка была неактивна — повторите запуск.';
    await chrome.runtime.sendMessage({type:'pyrus-transfer-failed',category:error.message==='page-focus-timeout'?'page-focus-timeout':'OperationError'}).catch(()=>{});
   }finally{
    running=false;
    const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>banner.remove();banner.append(document.createElement('br'),close);
   }
  },100);
  return {queued:true};
 }};
})();
