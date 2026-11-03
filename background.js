// Keep diagnostics after the popup closes; session storage remains extension-only.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id || !sender.tab || !['pyrus-transfer-finished','pyrus-transfer-failed'].includes(message?.type))return;
 (async()=>{
  const saved=await chrome.storage.session.get('diagnostics');
  const diagnostics=(saved.diagnostics||[]).slice(-28),time=new Date().toISOString();
  const replacement=message.mode==='replacement';
  if(message.type==='pyrus-transfer-finished'){
   diagnostics.push({time,action:replacement?'replaceApply':'apply',details:{page:message.diagnostic}});
   diagnostics.push({time,action:replacement?'replacement':'transfer',details:{requested:message.results.length,results:message.results}});
   while(diagnostics.length>2 && JSON.stringify(diagnostics).length>150000)diagnostics.shift();
   await chrome.storage.session.set({diagnostics,lastPage:message.diagnostic});
  }else{
   diagnostics.push({time,action:'error',details:{operation:replacement?'replaceApply':'apply',category:message.category}});
   while(diagnostics.length>1 && JSON.stringify(diagnostics).length>150000)diagnostics.shift();
   await chrome.storage.session.set({diagnostics});
  }
 })().then(()=>respond({ok:true}),()=>respond({ok:false}));
 return true;
});
