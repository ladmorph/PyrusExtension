const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('form handler diagnostics run read only in the page world and export no source data',async()=>{
 const {JSDOM}=require('jsdom');
 const target=new JSDOM('<div class="formFieldBaseWrapper"><input value="SECRET_VALUE"></div>',{runScripts:'outside-only',url:'https://secret.test/task/SECRET_ID'}).window;
 target.HTMLElement.prototype.getClientRects=()=>[{}];
 const ui=new JSDOM(fs.readFileSync(__dirname+'/popup.html','utf8'),{runScripts:'outside-only'}).window;
 const saved={snapshot:{adapterVersion:'pyrus-dom-v3',time:Date.now(),url:target.location.href,fields:[{key:'SECRET_KEY',label:'SECRET_LABEL',kind:'text',value:'SECRET_SNAPSHOT'}]}};
 const extensionVersion=JSON.parse(fs.readFileSync(__dirname+'/manifest.json','utf8')).version;
 let blob,filename,calls=0;
 ui.Blob=Blob;ui.URL.createObjectURL=value=>{blob=value;return 'blob:test';};ui.URL.revokeObjectURL=()=>{};
 ui.HTMLAnchorElement.prototype.click=function(){filename=this.download;};ui.setTimeout=()=>0;
 ui.chrome={runtime:{getManifest:()=>({version:extensionVersion})},storage:{session:{async get(key){return typeof key==='string'?{[key]:saved[key]}:{...saved};},async set(value){Object.assign(saved,value);},async remove(key){delete saved[key];}}},tabs:{query:async()=>[{id:10,url:target.location.href}]},scripting:{executeScript:async options=>{
  calls++;assert.equal(options.world,'MAIN');assert.equal(options.target.tabId,10);assert.equal(options.files,undefined);
  return [{result:target.eval('('+options.func.toString()+')')()}];
 }}};
 try{
  ui.eval(fs.readFileSync(__dirname+'/form-handlers.js','utf8'));await ui.eval(fs.readFileSync(__dirname+'/popup.js','utf8'));
  const before=target.document.body.innerHTML;
  await ui.document.getElementById('formHandlers').onclick();
  assert.equal(calls,1);assert.equal(target.document.body.innerHTML,before);assert.equal(ui.document.getElementById('version').textContent,'v'+extensionVersion);
  assert.match(filename,/^pyrus-form-handlers-/);
  const json=await blob.text(),report=JSON.parse(json);
  assert.equal(report.inspectionOnly,true);assert.equal(report.scopeCount,1);assert.ok(!json.includes('SECRET'));assert.ok(!json.includes('secret.test'));
  assert.equal(saved.snapshot.fields[0].value,'SECRET_SNAPSHOT');
  target.document.body.innerHTML='<div class="formView"><input value="SECRET_FIRST"></div><div class="formView"><input value="SECRET_SECOND"></div>';
  filename=null;const multipleForms=target.document.body.innerHTML;
  await ui.document.getElementById('formHandlers').onclick();
  assert.equal(filename,null);assert.match(ui.document.getElementById('status').textContent,/текстовое поле/);
  assert.equal(target.document.body.innerHTML,multipleForms);
  const focused=target.document.querySelectorAll('input')[1];focused.focus();
  await ui.document.getElementById('formHandlers').onclick();
  assert.match(filename,/^pyrus-form-handlers-/);assert.equal(target.document.activeElement,focused);
  const focusedReport=await blob.text();assert.equal(JSON.parse(focusedReport).context.selection,'focused-form');assert.ok(!focusedReport.includes('SECRET'));
  const callsBeforeInvalidUrl=calls;
  ui.chrome.tabs.query=async()=>[{id:10,url:'chrome://extensions'}];
  await ui.document.getElementById('formHandlers').onclick();assert.equal(calls,callsBeforeInvalidUrl);
 }finally{target.close();ui.close();}
});
test('popup diagnostics survives reopen and exports a report without page data',async()=>{
  const ids=[...fs.readFileSync(__dirname+'/popup.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const elements=Object.fromEntries(ids.map(id=>[id,{id,disabled:false,children:[],classList:{toggle(){}},querySelectorAll:()=>[],replaceChildren(){},append(){},value:'',checked:false}]));
  const saved={snapshot:{adapterVersion:'pyrus-dom-v3',time:Date.now(),url:'https://secret.example/task/123?token=SECRET',fields:[{key:'label:SECRET_NAME:text',label:'SECRET_NAME',kind:'text',value:'SECRET_VALUE'}]}};
  const storage={async get(keys){return typeof keys==='string'?{[keys]:saved[keys]}:{...saved};},async set(obj){const next={...saved,...obj};if(JSON.stringify(next).length>200000)throw new Error('Session storage quota bytes exceeded');Object.assign(saved,obj);},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete saved[k];}};
  saved.snapshot.sourceStructure={legacyTree:'x'.repeat(300000)};
  saved.diagnostics=[{action:'old',details:{large:'x'.repeat(300000)}}];
  let blob,downloaded=false;
  class TestURL extends URL { static createObjectURL(b){blob=b;return 'blob:test';} static revokeObjectURL(){} }
  const context={document:{getElementById:id=>elements[id],querySelectorAll:()=>ids.map(id=>elements[id]).filter(e=>['capture','preview','apply','diagnose','export','clearLogs','clear','selectAll','selectNone'].includes(e.id)),createElement:()=>({click(){downloaded=true;}})},chrome:{storage:{session:storage},runtime:{getManifest:()=>({version:'0.2.0'})},tabs:{query:async()=>[{id:1,url:'https://secret.example/task/123'}]},scripting:{executeScript:async opts=>opts.files?[]:[{result:{url:'https://secret.example/task/123',data:{},diagnostic:{totalControls:4,recognized:2}}}]}},navigator:{userAgent:'TestBrowser'},URL:TestURL,Blob,setTimeout:()=>0};
  vm.createContext(context);const code=fs.readFileSync(__dirname+'/popup.js','utf8');
  await vm.runInContext(code,context);
  assert.equal(saved.snapshot.sourceStructure,undefined);
  assert.equal(saved.snapshot.fields[0].value,'SECRET_VALUE');
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
  let closed=false;context.window={close(){closed=true;}};
  context.chrome.scripting.executeScript=async opts=>opts.files?[]:[{result:opts.args[0]==='apply'?{queued:true}:{url:'https://secret.example/task/other',data:[],diagnostic:{recognized:1}}}];
  // Recreate the popup context so window.close is available.
  await vm.runInContext(code,vm.createContext({...context}));
  await elements.fillAll.onclick();
  assert.equal(closed,true);
  for(let i=0;i<40;i++)await elements.diagnose.onclick();
  assert.ok(saved.diagnostics.length<=30);
  await elements.clearLogs.onclick();
  assert.equal(saved.diagnostics,undefined);
});

test('page transfer waits for page focus and persists completion independently of popup',async()=>{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;
 let focused=false,called=0;const messages=[];
 w.document.hasFocus=()=>focused;
 w.chrome={runtime:{sendMessage:async m=>{messages.push(m);return {ok:true};}}};
 w.eval(fs.readFileSync(__dirname+'/transfer-runner.js','utf8'));
 const pending=w.pyrusTransferRunner.start(async()=>{called++;return {data:[{status:'dispatched',sourceIndex:0}],diagnostic:{recognized:1}};});
 assert.equal(pending.queued,true);
 assert.throws(()=>w.pyrusTransferRunner.start(async()=>{}),/уже выполняется/);
 await new Promise(r=>setTimeout(r,150));assert.equal(called,0);
 focused=true;
 await new Promise(r=>setTimeout(r,180));assert.equal(called,1);
 assert.equal(messages[0].type,'pyrus-transfer-finished');
 assert.equal(messages[0].results[0].status,'dispatched');
 assert.match(w.document.body.textContent,/Готово: 1/);w.close();
});

test('background persists diagnostics after popup closure and ignores external senders',async()=>{
 let listener;const saved={diagnostics:[{action:'transfer-start'}]};
 const context={chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}},storage:{session:{get:async()=>saved,set:async data=>Object.assign(saved,data)}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/background.js','utf8'),context);
 const message={type:'pyrus-transfer-finished',diagnostic:{recognized:2},results:[{status:'dispatched'}]};
 assert.equal(listener(message,{id:'other',tab:{id:1}},()=>{}),undefined);
 await new Promise(resolve=>listener(message,{id:'test',tab:{id:1}},resolve));
 assert.equal(saved.lastPage.recognized,2);
 assert.deepEqual(saved.diagnostics.map(e=>e.action),['transfer-start','apply','transfer']);
});
test('progress shows measured fields, table detail, warnings and cleans up its reporter',async()=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;
 w.document.hasFocus=()=>true;const messages=[];w.chrome={runtime:{sendMessage:async m=>{messages.push(m);return {ok:true};}}};
 w.eval(fs.readFileSync(__dirname+'/transfer-runner.js','utf8'));
 let finish;const pending=new Promise(resolve=>{finish=resolve;});
 w.pyrusTransferRunner.start(async()=>{
  w.pyrusProgress.update({total:4,completed:1,stage:'Заполнение полей',label:'Поле примера'});
  w.pyrusProgress.update({detail:'Таблица · строка 2 из 5'});
  await pending;
  return {data:[{status:'dispatched'},{status:'error'},{status:'dispatched'},{status:'dispatched'}],diagnostic:{recognized:4}};
 });
 assert.equal(w.document.querySelector('[role=progressbar]').hasAttribute('aria-valuenow'),false);
 await new Promise(r=>setTimeout(r,150));
 assert.equal(w.document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'25');
 assert.match(w.document.body.textContent,/1 из 4 · 25%/);assert.match(w.document.body.textContent,/строка 2 из 5/);
 finish();await new Promise(r=>setTimeout(r,25));
 assert.equal(w.document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'100');
 assert.match(w.document.body.textContent,/Завершено с замечаниями/);assert.equal(w.pyrusProgress,undefined);
 assert.equal(messages[0].mode,'transfer');w.document.querySelector('button').click();assert.equal(w.document.querySelector('.pyrus-operation-progress'),null);w.close();
});
test('background separates replacement results from earlier transfer attempts',async()=>{
 let listener;const saved={diagnostics:[{action:'transfer-start'},{action:'transfer',details:{results:[{status:'dispatched'}]}},{action:'replacement-start'}]};
 const context={chrome:{runtime:{id:'test',onMessage:{addListener(fn){listener=fn;}}},storage:{session:{get:async()=>saved,set:async data=>Object.assign(saved,data)}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/background.js','utf8'),context);
 const message={type:'pyrus-transfer-finished',mode:'replacement',diagnostic:{recognized:2},results:[{status:'error',reason:'replacement-not-confirmed',replacement:{kind:'text',verification:{targetFound:true}}}]};
 await new Promise(resolve=>listener(message,{id:'test',tab:{id:1}},resolve));
 assert.deepEqual(saved.diagnostics.slice(-2).map(e=>e.action),['replaceApply','replacement']);
 assert.equal(saved.diagnostics.at(-1).details.results[0].replacement.verification.targetFound,true);
});
