const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const code=file=>fs.readFileSync(__dirname+'/'+file,'utf8');
const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function popup(saved={},execute){
 const w=new JSDOM(code('popup.html'),{runScripts:'outside-only',url:'https://extension.test/popup.html'}).window;
 const close=w.close.bind(w),calls=[],opened=[];let url='https://pyrus.test/t#uf42',closed=false;
 w.chrome={runtime:{getManifest:()=>JSON.parse(code('manifest.json'))},storage:{session:{
  get:async keys=>Object.fromEntries((typeof keys==='string'?[keys]:keys).map(key=>[key,saved[key]])),
  set:async values=>Object.assign(saved,values),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete saved[key];}
 }},tabs:{query:async()=>[{id:7,url}],create:async tab=>opened.push(tab)},scripting:{executeScript:async options=>{
  calls.push(options);if(execute)return execute(options,url);if(options.files)return [];
  const method=options.args[0];return [{result:method==='apply'||method==='replaceApply'?{queued:true}:{url,recognized:1,hasValues:true,data:method==='replacePreview'?{token:'token',ready:1,items:[{label:'Описание',before:'до',after:''}]}:[]}}];
 }}};
 w.close=()=>{closed=true;};w.eval(code('prefill.js'));await w.eval(code('popup.js'));
 return {w,saved,calls,opened,close,el:id=>w.document.getElementById(id),setUrl:value=>{url=value;},isClosed:()=>closed};
}

test('popup removes old reports without losing saved fields or replacement settings',async()=>{
 const saved={snapshot:{adapterVersion:'pyrus-dom-v3',url:'https://pyrus.test/t#id1',time:Date.now(),fields:[{key:'name',label:'Название',kind:'text',value:'Сохранить'}],sourceStructure:{old:true}},diagnostics:[{}],lastPage:{},lastPlan:{},catalogDiagnosticSalt:'old',tryPrefill:false,replacementDraft:{find:'a\nb',replace:'',mode:'contains',tab:'replacement'}};
 const ui=await popup(saved);try{
  assert.equal(saved.snapshot.fields[0].value,'Сохранить');assert.equal(saved.snapshot.sourceStructure,undefined);
  for(const key of ['diagnostics','lastPage','lastPlan','catalogDiagnosticSalt'])assert.equal(saved[key],undefined);
  assert.equal(ui.el('replaceFind').value,'a\nb');assert.equal(ui.el('replaceContains').checked,true);assert.equal(ui.el('replacementPanel').hidden,false);
  assert.equal(ui.el('tryPrefill').checked,false);ui.el('tryPrefill').checked=true;await ui.el('tryPrefill').onchange();assert.equal(saved.tryPrefill,true);
  assert.equal(ui.w.document.querySelector('#diagnose,#export,#formHandlers,#debug'),null);assert.equal(JSON.parse(code('manifest.json')).background,undefined);
  await ui.el('replacePreview').onclick();
  assert.deepEqual([...ui.calls.find(call=>call.files).files],['tables.js','adapter.js','expander.js','transfer-runner.js','replacement.js']);
  assert.equal(ui.el('replaceApply').disabled,false);assert.match(ui.el('replaceResults').textContent,/Пустое значение/);
  ui.el('replaceExact').checked=true;await ui.el('replaceExact').onchange();assert.equal(ui.el('replaceApply').disabled,true);assert.equal(saved.replacementDraft.mode,'exact');
  await ui.el('replaceFindClear').onclick();assert.equal(ui.el('replaceFind').value,'');assert.equal(ui.el('replacePreview').disabled,true);
 }finally{ui.close();}
});

test('whole-form fill keeps the usual path for an existing draft and blocks the source',async()=>{
 const saved={snapshot:{adapterVersion:'pyrus-dom-v3',time:Date.now(),url:'https://pyrus.test/t#id1',fields:[{key:'name',label:'Название',kind:'text',value:'Текст'}]}};
 const ui=await popup(saved);try{
  await ui.el('fillAll').onclick();
  assert.deepEqual(ui.calls.filter(call=>call.args).map(call=>call.args[0]),['preview','prefill','apply']);
  assert.equal(ui.calls.at(-1).args[2].fastPrefill,null);assert.equal(ui.isClosed(),true);assert.equal(ui.calls.some(call=>call.world==='MAIN'),false);
  ui.setUrl(saved.snapshot.url);const before=ui.calls.length;await ui.el('fillAll').onclick();assert.equal(ui.calls.length,before);assert.match(ui.el('status').textContent,/Открыт источник/);
 }finally{ui.close();}
});

test('ready native links stay on the current server and open without changing the draft',async()=>{
 const ui=await popup();try{
  ui.el('nativePrefillUrl').value='https://other.test/t#uf42&f11=x';await ui.el('openNativePrefill').onclick();assert.equal(ui.opened.length,0);assert.match(ui.el('status').textContent,/тот же сервер/);
  ui.el('nativePrefillUrl').value='https://pyrus.test/t#uf42&f11='+encodeURIComponent('строка & +');await ui.el('openNativePrefill').onclick();assert.equal(ui.opened.length,1);assert.equal(new URL(ui.opened[0].url).origin,'https://pyrus.test');assert.equal(ui.isClosed(),true);
 }finally{ui.close();}
});

test('page transfer survives popup closure, waits for focus and releases its running lock',async()=>{
 const w=new JSDOM('<body></body>',{runScripts:'outside-only'}).window;let focused=false,called=0;
 w.document.hasFocus=()=>focused;w.eval(code('transfer-runner.js'));
 try{
  assert.equal(w.pyrusTransferRunner.start(async()=>{called++;return {data:[{status:'dispatched'}]};}).queued,true);assert.equal(w.chrome,undefined);
  assert.throws(()=>w.pyrusTransferRunner.start(async()=>{}),/уже выполняется/);await tick(130);assert.equal(called,0);focused=true;await tick(130);
  assert.equal(called,1);assert.match(w.document.body.textContent,/Готово: 1/);assert.equal(w.pyrusProgress,undefined);
  w.document.querySelector('button').click();assert.equal(w.document.querySelector('.pyrus-operation-progress'),null);
  assert.equal(w.pyrusTransferRunner.start(async()=>({data:[]})).queued,true);await tick(120);
 }finally{w.close();}
});

test('progress shows fields, cell detail and all results without storing reports',async()=>{
 const w=new JSDOM('<body></body>',{runScripts:'outside-only'}).window;w.document.hasFocus=()=>true;w.eval(code('transfer-runner.js'));
 let finish;const pending=new Promise(resolve=>{finish=resolve;});try{
  w.pyrusTransferRunner.start(async()=>{w.pyrusProgress.update({total:4,completed:1,stage:'Заполнение полей',label:'Описание',detail:'Таблица · строка 2 из 5'});await pending;return {data:[{status:'dispatched'},...Array.from({length:5},(_,i)=>({status:'partial',label:'Таблица '+i,message:'Сохранены значения '+i}))]};});
  assert.equal(w.document.querySelector('[role=progressbar]').hasAttribute('aria-valuenow'),false);await tick(130);
  assert.equal(w.document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'25');assert.match(w.document.body.textContent,/строка 2 из 5/);
  finish();await tick(20);assert.equal(w.pyrusProgress,undefined);assert.match(w.document.body.textContent,/Завершено с замечаниями/);assert.match(w.document.querySelector('details').textContent,/Сохранены значения 4/);assert.equal(w.document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'100');
 }finally{w.close();}
});

test('operation errors keep changes visible and restore the previous progress reporter',async()=>{
 const w=new JSDOM('<input value="сохранить">',{runScripts:'outside-only'}).window;w.document.hasFocus=()=>true;w.eval(code('transfer-runner.js'));
 const previous={update(){}};w.pyrusProgress=previous;try{
  w.pyrusTransferRunner.start(async()=>{throw Error('private failure');});await tick(130);
  assert.equal(w.pyrusProgress,previous);assert.equal(w.document.querySelector('input').value,'сохранить');assert.match(w.document.body.textContent,/Операция прервана/);assert.ok(!w.document.body.textContent.includes('private failure'));
 }finally{w.close();}
});
