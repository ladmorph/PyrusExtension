const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const code=file=>fs.readFileSync(__dirname+'/'+file,'utf8');
const context={URL};vm.runInNewContext(code('prefill.js'),context);
const {parseNativeLink,buildLink,readBindings}=context.pyrusPrefill;
const plain=value=>JSON.parse(JSON.stringify(value));
const base='https://pyrus.test/t#uf42';

test('native links preserve Unicode, literal plus, empty values, tables and native date strings',()=>{
 const values=[['f11','текст & +\nещё'],['f12',''],['f21:1','VPN'],['f21:2','Вторая строка'],['f31','Thu Jan 01 2026 10:00:00 GMT+0300 (Москва)']];
 const input=base+values.map(([key,value])=>'&'+key+'='+encodeURIComponent(value)).join('');
 const parsed=parseNativeLink(input,'https://pyrus.test');assert.deepEqual(plain(parsed.params),values);assert.equal(parsed.url,input);assert.equal(parsed.formId,'42');
 assert.equal(parseNativeLink(base+'&f11=two+words').params[0][1],'two words');
});

test('native link validation rejects foreign servers, tasks, credentials and ambiguous parameters',()=>{
 for(const url of ['https://other.test/t#uf42&f1=x','https://u:p@pyrus.test/t#uf42&f1=x',base.replace('uf42','id42')+'&f1=x',base+'&other=x',base+'&f1=x&f01=y',base+'&f0=x',base+'&f1:0=x',base+'&f1=%FF',base])assert.throws(()=>parseNativeLink(url,'https://pyrus.test'),url);
 assert.throws(()=>parseNativeLink(base+'&f1='+'x'.repeat(100001)),/длинная/);
});

test('link builder uses confirmed IDs and atomically maps table columns by name',()=>{
 const fields=[{key:'name',kind:'text',value:'текст & +\nещё'},{key:'check',kind:'checkbox',value:true},{key:'table',kind:'pyrus-table',value:{columns:['Б','А'],rows:[['Б1','А1'],['Б2','А2']]}}];
 const before=JSON.stringify(fields),link=buildLink(base,fields,[{key:'name',id:'11'},{key:'check',id:12},{key:'table',columns:[{name:'А',id:'22',kind:'text'},{name:'Б',id:'21',kind:'text'}]}]);
 assert.deepEqual(plain(parseNativeLink(link.url).params),[['f11',fields[0].value],['f12','true'],['f21:1','Б1'],['f22:1','А1'],['f21:2','Б2'],['f22:2','А2']]);
 assert.equal(link.fieldCount,2);assert.equal(link.cellCount,4);assert.equal(link.skipped,0);assert.equal(JSON.stringify(fields),before);
});

test('unbound, complex and conflicting fields stay for the usual transfer',()=>{
 const fields=[{key:'ok',kind:'text',value:'ok'},{key:'catalog',kind:'pyrus-catalog',value:'Visible name'},{key:'multi',kind:'pyrus-multi-choice',value:['a']},{key:'unknown',kind:'text',value:'x'},{key:'a',kind:'text',value:'a'},{key:'b',kind:'text',value:'b'},{key:'table',kind:'pyrus-table',value:{columns:['А','Б'],rows:[['a','b']]}}];
 const bindings=[{key:'ok',id:11},{key:'catalog',id:12},{key:'multi',id:13},{key:'a',id:20},{key:'b',id:20},{key:'table',columns:[{name:'А',id:21,kind:'text'},{name:'Б',id:22,kind:'catalog'}]}];
 const link=buildLink(base,fields,bindings);assert.deepEqual(plain(link.keys),['ok']);assert.equal(link.skipped,6);assert.equal(link.cellCount,0);
 assert.throws(()=>buildLink(base,[fields[3]],[]),/надёжно/);
});

test('dates are validated and converted without changing opaque text fields',()=>{
 const fields=[{key:'day',kind:'text',date:true,value:'29.02.2028'},{key:'time',kind:'datetime-local',date:true,value:'2028-02-29T10:30'},{key:'invalid',kind:'date',date:true,value:'2026-02-30'},{key:'plain',kind:'text',value:'01.01.2026'}];
 const link=buildLink(base,fields,fields.map((f,i)=>({key:f.key,id:i+11}))),params=new Map(parseNativeLink(link.url).params);
 assert.equal(params.get('f11'),'20280229');assert.equal(params.get('f12'),new Date(2028,1,29,10,30).toString());assert.equal(params.has('f13'),false);assert.equal(params.get('f14'),'01.01.2026');
});

const field=(label,value='',id='')=>'<div class="formFieldBaseWrapper"'+(id?' data-field-id="'+id+'"':'')+'><div class="formFieldBaseWrapper__titleWrapper"><span class="formFieldTitle__textValue">'+label+'</span></div><input value="'+value+'"></div>';
function page(html,url=base){
 const w=new JSDOM(html,{url,runScripts:'outside-only'}).window;w.HTMLElement.prototype.getClientRects=()=>[{}];
 const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timer(fn,Math.min(ms,3));
 for(const file of ['tables.js','adapter.js','expander.js'])w.eval(code(file));return w;
}
const bindings=(w,fields)=>w.eval('('+readBindings.toString()+')')(fields,w.location.href);

test('binding reads only matching native models and never calls getters or handlers',()=>{
 const w=page(field('Описание')+field('Другое'));try{
  const [first,second]=w.document.querySelectorAll('input');let getters=0,handlers=0;
  const model={id:11,name:'Описание',type:'text'};Object.defineProperty(model,'label',{get(){getters++;throw Error('getter');}});
  first.__reactFiber$fixture={memoizedProps:{field:model,onChange(){handlers++;}},return:null};
  second.__reactFiber$fixture={memoizedProps:{field:{id:12,name:'Несовпадение',type:'text'}},return:null};
  const source=w.pyrusTransfer.capture().map(f=>({...f,value:'Новый текст'})),descriptors=w.pyrusTransfer.prefillFields(source,false),before=w.document.body.innerHTML;
  assert.deepEqual(plain(bindings(w,descriptors)),[{key:source[0].key,id:'11'}]);assert.equal(getters,0);assert.equal(handlers,0);assert.equal(w.document.body.innerHTML,before);
  descriptors[0].label='Другой заголовок';assert.equal(bindings(w,descriptors).length,0);
  assert.throws(()=>w.eval('('+readBindings.toString()+')')(descriptors,base+'&f1=x'),/изменилась/);
 }finally{w.close();}
});

test('binding requires the same section and ignores conflicting explicit numbers',()=>{
 const w=page('<div class="formFieldGroup"><div class="formFieldGroupTitle">Раздел</div>'+field('Описание','','11')+'</div>');try{
  const source=w.pyrusTransfer.capture().map(f=>({...f,value:'text'})),descriptors=w.pyrusTransfer.prefillFields(source,false);
  assert.equal(bindings(w,descriptors)[0].id,'11');descriptors[0].groups=[];assert.equal(bindings(w,descriptors).length,0);
  descriptors[0].groups=['Раздел'];w.document.querySelector('input').name='f12';assert.equal(bindings(w,descriptors).length,0);
 }finally{w.close();}
});

test('table bindings keep sticky data columns and exclude the row number',()=>{
 const w=page('<div class="viewTableFieldNew"><div class="viewTableFieldNew__title">Таблица</div><table><thead><tr><th class="headerCell" data-field-id="21">А</th><th class="headerCell" data-field-id="22">Б</th></tr></thead><tbody><tr><td>1</td><td class="viewTableCell formCell formCell_sticky"><div class="cellString__content" contenteditable="true"></div></td><td class="viewTableCell formCell"><input class="cellRadioButton__input"></td></tr></tbody></table></div>');try{
  const source=w.pyrusTransfer.capture();source[0].value.rows=[['Текст','Вариант']];
  const found=bindings(w,w.pyrusTransfer.prefillFields(source,false));
  assert.deepEqual(plain(found[0].columns),[{name:'А',id:'21',kind:'text'},{name:'Б',id:'22',kind:'choice'}]);assert.equal(buildLink(base,w.pyrusTransfer.prefillFields(source,false),found).cellCount,2);
 }finally{w.close();}
});

async function hybrid({existing=false,noBindings=false,disabled=false,navigate=false,ignoreNative=false,lateExisting=false}={}){
 const target=page(field('Первое',existing?'Сохранить':'',noBindings?'':'11')+field('Второе'));
 const source=target.pyrusTransfer.capture().map((f,i)=>({...f,value:i?'Вручную':'По ссылке'}));
 const ui=new JSDOM(code('popup.html'),{url:'https://extension.test/popup.html',runScripts:'outside-only'}).window;
 const close=ui.close.bind(ui);let completion,hashChanges=0,closed=false;
 if(ignoreNative){let now=0;target.Date.now=()=>now+=250;}
 target.pyrusTransferRunner={version:2,start(fn){if(lateExisting)target.document.querySelector('input').value='Введено пока ждём';completion=fn();return {queued:true};}};
 target.addEventListener('hashchange',()=>{
  hashChanges++;
  if(navigate){target.history.replaceState(null,'','/t#uf99');return;}
  const value=new URLSearchParams(target.location.hash.split('&').slice(1).join('&')).get('f11');if(value!==null&&!ignoreNative)target.document.querySelector('input').value=value;
  // Pyrus may consume the parameters after applying them.
  target.history.replaceState(null,'','/t#uf42');
 });
 const saved={snapshot:{adapterVersion:'pyrus-dom-v3',url:'https://pyrus.test/t#id1',time:Date.now(),fields:source}};
 ui.chrome={runtime:{getManifest:()=>({version:'0.10.0'})},storage:{session:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,saved[key]])),set:async values=>Object.assign(saved,values),remove:async()=>{}}},tabs:{query:async()=>[{id:7,url:target.location.href}]},scripting:{executeScript:async options=>{
  if(options.files){for(const file of options.files)target.eval(code(file));return [];}
  return [{result:await target.eval('('+options.func.toString()+')')(...options.args)}];
 }}};
 ui.close=()=>{closed=true;};ui.eval(code('prefill.js'));await ui.eval(code('popup.js'));ui.document.getElementById('tryPrefill').checked=!disabled;
 await ui.document.getElementById('fillAll').onclick();
 return {target,ui,completion,hashChanges:()=>hashChanges,closed:()=>closed,close(){target.close();close();}};
}

test('empty form tries its native link first, then fills the remaining fields normally',async()=>{
 const fixture=await hybrid();try{
  const result=await fixture.completion;assert.equal(fixture.hashChanges(),1);assert.equal(fixture.closed(),true);
  assert.deepEqual([...fixture.target.document.querySelectorAll('input')].map(el=>el.value),['По ссылке','Вручную']);assert.ok(result.data.every(row=>row.status==='dispatched'));
 }finally{fixture.close();}
});

test('existing values, unknown bindings and disabling links all use ordinary blank filling',async()=>{
 for(const options of [{existing:true},{noBindings:true},{disabled:true},{lateExisting:true}]){
  const fixture=await hybrid(options);try{
   await fixture.completion;assert.equal(fixture.hashChanges(),0);assert.equal(fixture.target.document.querySelectorAll('input')[1].value,'Вручную');assert.equal(fixture.target.document.querySelector('input').value,options.existing?'Сохранить':options.lateExisting?'Введено пока ждём':'По ссылке');
  }finally{fixture.close();}
 }
});

test('ignored native parameters time out and fall back to ordinary filling',async()=>{
 const fixture=await hybrid({ignoreNative:true});try{
  const result=await fixture.completion;assert.equal(fixture.hashChanges(),1);assert.ok(result.data.every(row=>row.status==='dispatched'));assert.deepEqual([...fixture.target.document.querySelectorAll('input')].map(el=>el.value),['По ссылке','Вручную']);
 }finally{fixture.close();}
});

test('hidden filled fields and hidden table cells keep the draft out of native navigation',()=>{
 const w=page(field('Пустое')+'<div style="display:none">'+field('Скрытое','Сохранить')+'</div>');try{
  w.HTMLElement.prototype.getClientRects=function(){return this.closest('[style="display:none"]')?[]:[{}];};
  assert.equal(w.pyrusTransfer.hasFilledValues(),true);
  w.document.querySelectorAll('input')[1].value='';assert.equal(w.pyrusTransfer.hasFilledValues(),false);
  w.document.body.insertAdjacentHTML('beforeend','<div class="viewTableFieldNew" style="display:none"><div class="cellString__content">Сохранить ячейку</div></div>');assert.equal(w.pyrusTransfer.hasFilledValues(),true);
 }finally{w.close();}
});

test('navigating to another form during native prefill stops ordinary writes',async()=>{
 const fixture=await hybrid({navigate:true});try{
  await assert.rejects(fixture.completion,/Страница изменилась/);assert.equal(fixture.target.document.querySelectorAll('input')[1].value,'');
 }finally{fixture.close();}
});
