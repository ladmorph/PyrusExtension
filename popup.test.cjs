const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('popup diagnostics survives reopen and exports a report without page data',async()=>{
  const ids=[...fs.readFileSync(__dirname+'/popup.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const elements=Object.fromEntries(ids.map(id=>[id,{id,disabled:false,children:[],classList:{toggle(){}},querySelectorAll:()=>[],replaceChildren(){},append(){},value:'',checked:false}]));
  const saved={snapshot:{adapterVersion:'pyrus-dom-v3',time:Date.now(),url:'https://secret.example/task/123?token=SECRET',fields:[{key:'label:SECRET_NAME:text',label:'SECRET_NAME',kind:'text',value:'SECRET_VALUE'}]}};
  const storage={async get(keys){return typeof keys==='string'?{[keys]:saved[keys]}:{...saved};},async set(obj){Object.assign(saved,obj);},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete saved[k];}};
  saved.snapshot.sourceStructure={main:{samples:[{element:{tag:'TD',classes:['formCell']}}]}};
  let blob,downloaded=false;
  class TestURL extends URL { static createObjectURL(b){blob=b;return 'blob:test';} static revokeObjectURL(){} }
  const context={document:{getElementById:id=>elements[id],querySelectorAll:()=>ids.map(id=>elements[id]).filter(e=>['capture','preview','apply','diagnose','export','clearLogs','clear','selectAll','selectNone'].includes(e.id)),createElement:()=>({click(){downloaded=true;}})},chrome:{storage:{session:storage},runtime:{getManifest:()=>({version:'0.2.0'})},tabs:{query:async()=>[{id:1,url:'https://secret.example/task/123'}]},scripting:{executeScript:async opts=>opts.files?[]:[{result:{url:'https://secret.example/task/123',data:{},diagnostic:{totalControls:4,recognized:2}}}]}},navigator:{userAgent:'TestBrowser'},URL:TestURL,Blob,setTimeout:()=>0};
  vm.createContext(context);const code=fs.readFileSync(__dirname+'/popup.js','utf8');
  await vm.runInContext(code,context);
  await elements.diagnose.onclick();
  assert.equal(saved.diagnostics[0].action,'diagnose');
  // Reopen popup: persisted logs and counts must be restored.
  await vm.runInContext(code,vm.createContext({...context}));
  assert.match(elements.logCount.textContent,/1/);
  await elements.export.onclick();
  assert.ok(downloaded);
  const text=await blob.text(), report=JSON.parse(text);
  assert.equal(report.source.count,1);
  assert.equal(report.schemaVersion,2);
  assert.equal(report.structures,undefined);
  assert.ok(text.length<6000);



  assert.equal(report.lastPage.recognized,2);
  assert.ok(!text.includes('SECRET'));
  assert.ok(!text.includes('secret.example'));
  // Target with zero recognized fields must never be advertised as ready.
  context.chrome.tabs.query=async()=>[{id:1,url:'https://secret.example/task/other'}];
  context.chrome.scripting.executeScript=async opts=>opts.files?[]:[{result:{url:'https://secret.example/task/other',data:[{label:'SECRET_NAME',key:'secret',reason:'missing',deferred:true}],diagnostic:{totalControls:12,recognized:0}}}];
  await elements.preview.onclick();
  assert.match(elements.status.textContent,/Перенос заблокирован/);
  assert.equal(elements.apply.disabled,true);
  const calls=[];
  context.chrome.scripting.executeScript=async opts=>{
    if(opts.files)return [];
    calls.push(opts.args);
    return [{result:{url:'https://secret.example/task/other',tabId:1,data:opts.args[0]==='apply'?[{status:'dispatched',reason:'dom-value-matched',label:'SECRET_NAME',sourceIndex:0,message:'Готово'}]:[{key:'label:SECRET_NAME:text',label:'SECRET_NAME',reason:''}],diagnostic:{recognized:1}}}];
  };
  await elements.fillAll.onclick();
  assert.deepEqual(calls.map(args=>args[0]),['preview','apply']);
  assert.equal(calls[1][1][1][0],'label:SECRET_NAME:text');
  assert.match(elements.status.textContent,/Готово: 1/);
  await elements.clearLogs.onclick();
  assert.equal(saved.diagnostics,undefined);
});
