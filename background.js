// Keep diagnostics after the popup closes; session storage remains extension-only.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id || !sender.tab || !['pyrus-transfer-finished','pyrus-transfer-failed'].includes(message?.type))return;
 (async()=>{
  const saved=await chrome.storage.session.get('diagnostics');
  const diagnostics=saved.diagnostics||[],time=new Date().toISOString();
  if(message.type==='pyrus-transfer-finished'){
   diagnostics.push({time,action:'apply',details:{page:message.diagnostic}});
   diagnostics.push({time,action:'transfer',details:{requested:message.results.length,results:message.results}});
   await chrome.storage.session.set({diagnostics:diagnostics.slice(-100),lastPage:message.diagnostic});
  }else{
   diagnostics.push({time,action:'error',details:{operation:'apply',category:message.category}});
   await chrome.storage.session.set({diagnostics:diagnostics.slice(-100)});
  }
 })().then(()=>respond({ok:true}),()=>respond({ok:false}));
 return true;
});
