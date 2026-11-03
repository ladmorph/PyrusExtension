const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(html){
 const dom=new JSDOM(html,{url:'https://pyrus.example/task/draft',runScripts:'outside-only'}),w=dom.window;
 w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{}];};
 for(const file of ['tables.js','adapter.js','replacement.js'])w.eval(fs.readFileSync(__dirname+'/'+file,'utf8'));
 return w;
}
const options=(find='test',replace='test2',mode='exact')=>({find,replace,mode});
const field=(id,value)=>`<label>${id}<input id="${id}" value="${value}"></label>`;
const table=`<div class="viewTableFieldNew"><div class="viewTableFieldNew__title"><span class="formFieldTitle__textValue">Товары</span></div><table><thead><tr><th class="headerCell">Описание</th><th class="headerCell">Список</th></tr></thead><tbody><tr class="viewTableRow"><td class="viewTableCell formCell"><div class="cellString__main"><div class="cellString__content" contenteditable="true">test</div></div></td><td class="viewTableCell formCell"><input class="cellRadioButton__input" value="keep"></td></tr></tbody></table></div>`;
test('replacement previews without writing, changes ordinary and table text only, and is single use',async()=>{
 const w=setup(field('name','test')+field('extra','test test')+table);
 const plan=w.pyrusReplacement.preview(options());
 assert.equal(plan.ready,2);
 assert.equal(w.document.querySelector('input').value,'test');
 assert.match(plan.items[1].label,/строка 1/);
 const result=await w.pyrusReplacement.apply(plan.token);
 assert.equal(result.filter(r=>r.status==='dispatched').length,2);
 assert.equal(w.document.querySelector('#name').value,'test2');
 assert.equal(w.document.querySelector('#extra').value,'test test');
 assert.equal(w.document.querySelector('.cellString__content').textContent,'test2');
 assert.equal(w.document.querySelector('.cellRadioButton__input').value,'keep');
 await assert.rejects(w.pyrusReplacement.apply(plan.token),/устарел/);w.close();
});
test('literal substring replacement preserves whitespace, case and replacement dollar signs',async()=>{
 const w=setup('<label>Text<textarea> test.*\ntest.* TEST.* </textarea></label>');
 let plan=w.pyrusReplacement.preview(options('test.*','$&','contains'));
 assert.equal(plan.items[0].after,' $&\n$& TEST.* ');
 await w.pyrusReplacement.apply(plan.token);
 plan=w.pyrusReplacement.preview(options('$&','','contains'));
 await w.pyrusReplacement.apply(plan.token);
 assert.equal(w.document.querySelector('textarea').value,' \n TEST.* ');w.close();
});
test('changed, disabled, removed and navigated controls cannot be overwritten',async()=>{
 const w=setup(field('a','test')+field('b','test')+field('c','test'));
 const plan=w.pyrusReplacement.preview(options());
 w.document.querySelector('#a').value='manual';w.document.querySelector('#b').disabled=true;w.document.querySelector('#c').remove();
 const result=await w.pyrusReplacement.apply(plan.token);
 assert.ok(result.every(r=>r.status==='skipped'));
 assert.equal(w.document.querySelector('#a').value,'manual');
 w.document.querySelector('#a').value='test';
 const next=w.pyrusReplacement.preview(options());w.history.pushState({},'','/other');
 await assert.rejects(w.pyrusReplacement.apply(next.token),/устарел/);w.close();
});
test('select requires an available option, unsupported and hidden controls are excluded',async()=>{
 const w=setup('<label>Choice<select><option value="test">test</option><option value="test2">test2</option></select></label>'+field('locked','test')+'<label>Hidden<input hidden value="test"></label><label>Multiple<select multiple><option selected>test</option></select></label>');
 w.document.querySelector('#locked').readOnly=true;
 let plan=w.pyrusReplacement.preview(options('test','missing'));
 assert.equal(plan.ready,0);assert.match(plan.items[0].reason,/нет единственного/);
 plan=w.pyrusReplacement.preview(options());assert.equal(plan.ready,1);
 await w.pyrusReplacement.apply(plan.token);
 assert.equal(w.document.querySelector('select').value,'test2');
 assert.throws(()=>w.pyrusReplacement.preview(options('','x')),/непустой/);w.close();
});
test('unique remounted fields are rebound, reordered table rows skipped; errors do not stop other fields',async()=>{
 const w=setup(field('a','test')+field('b','test')+table);
 let plan=w.pyrusReplacement.preview(options());
 const first=w.document.querySelector('#a');first.replaceWith(first.cloneNode(true));
 const row=w.document.querySelector('tbody tr');row.parentNode.insertBefore(row.cloneNode(true),row);
 const result=await w.pyrusReplacement.apply(plan.token);
 assert.equal(result.filter(r=>r.status==='dispatched').length,2);
 assert.equal(w.document.querySelector('#a').value,'test2');
 assert.equal(w.document.querySelector('#b').value,'test2');
 assert.equal(row.querySelector('.cellString__content').textContent,'test');
 const original=w.pyrusTransfer.setReplacementValue;
 w.document.querySelector('#a').value='test';
 w.pyrusTransfer.setReplacementValue=async(f,v)=>{if(f.el.id==='a')throw Error('secret');return original(f,v);};
 plan=w.pyrusReplacement.preview(options());
 const errors=await w.pyrusReplacement.apply(plan.token);
 assert.equal(errors[0].status,'error');assert.ok(!JSON.stringify(errors).includes('secret'));w.close();
});
test('native select matches visible labels, rejects duplicate labels and rechecks options',async()=>{
 const w=setup('<label>Choice<select><option value="123">test</option><option value="456">test2</option></select></label>');
 let plan=w.pyrusReplacement.preview(options());
 assert.equal(plan.items[0].before,'test');
 await w.pyrusReplacement.apply(plan.token);assert.equal(w.document.querySelector('select').value,'456');
 w.document.querySelector('select').value='123';plan=w.pyrusReplacement.preview(options());
 w.document.querySelectorAll('option')[1].disabled=true;
 const result=await w.pyrusReplacement.apply(plan.token);assert.equal(result[0].status,'skipped');
 w.document.querySelectorAll('option')[1].disabled=false;
 w.document.querySelector('select').append(w.document.querySelectorAll('option')[1].cloneNode(true));
 plan=w.pyrusReplacement.preview(options());assert.equal(plan.ready,0);w.close();
});
test('table list replacement selects an existing option without typing in its display input',async()=>{
 const w=setup(table);const input=w.document.querySelector('.cellRadioButton__input');input.value='test';let typed=0,selected=0;
 input.addEventListener('input',()=>typed++);
 input.onclick=()=>{
  if(w.document.querySelector('.cellRadioButton__popuper'))return;
  w.document.body.insertAdjacentHTML('beforeend','<div class="cellRadioButton__popuper"><button class="dropdownList__control"><span class="dropdownList__itemTextContent">test2</span></button></div>');
  w.document.querySelector('.dropdownList__itemTextContent').onclick=()=>{input.value='test2';selected++;};
 };
 const plan=w.pyrusReplacement.preview(options());const result=await w.pyrusReplacement.apply(plan.token);
 assert.equal(result.filter(r=>r.status==='dispatched').length,2);assert.equal(selected,1);assert.equal(typed,0);w.close();
});
test('missing table list option leaves its original value and continues other replacements',async()=>{
 const w=setup(table+field('after','test'));const input=w.document.querySelector('.cellRadioButton__input');input.value='test';
 const timer=w.setTimeout.bind(w);w.setTimeout=fn=>timer(fn,0);
 const plan=w.pyrusReplacement.preview(options());const result=await w.pyrusReplacement.apply(plan.token);
 assert.equal(result.filter(r=>r.status==='error').length,1);assert.equal(input.value,'test');
 assert.equal(w.document.querySelector('#after').value,'test2');w.close();
});
test('expired preview cannot write',async()=>{
 const w=setup(field('name','test'));const plan=w.pyrusReplacement.preview(options());
 const now=w.Date.now();w.Date.now=()=>now+600001;
 await assert.rejects(w.pyrusReplacement.apply(plan.token),/устарел/);assert.equal(w.document.querySelector('input').value,'test');w.close();
});
test('popup persists replacement draft across reopen, invalidates preview, protects source and excludes texts from diagnostics',async()=>{
 const dom=new JSDOM(fs.readFileSync(__dirname+'/popup.html','utf8'),{url:'https://extension.example',runScripts:'outside-only'}),w=dom.window;
 const saved={},calls=[];let url='https://pyrus.example/draft',closed=false;
 w.chrome={runtime:{getManifest:()=>({version:'0.9.7'})},storage:{session:{get:async key=>typeof key==='string'?{[key]:saved[key]}:saved,set:async obj=>Object.assign(saved,obj),remove:async key=>{delete saved[key];}}},tabs:{query:async()=>[{id:1,url}]},scripting:{executeScript:async opts=>{
  if(opts.files)return [];
  calls.push(opts.args);
  return [{result:opts.args[0]==='replaceApply'?{queued:true}:{url,data:{token:'token',ready:1,items:[{label:'Name',before:'SECRET_FIND',after:'SECRET_REPLACE'}]},diagnostic:{recognized:1}}}];
 }}};
 w.close=()=>{closed=true;};
 await w.eval(fs.readFileSync(__dirname+'/popup.js','utf8'));
 const el=id=>w.document.getElementById(id);
 el('replacementTab').click();assert.equal(el('replacementPanel').hidden,false);assert.equal(el('transferPanel').hidden,true);
 el('replaceFind').value='SECRET_FIND';el('replaceWith').value='SECRET_REPLACE';
 await el('replacePreview').onclick();assert.equal(el('replaceApply').disabled,false);
 assert.match(el('replaceResults').textContent,/SECRET_FIND/);assert.ok(!JSON.stringify(saved.diagnostics).includes('SECRET'));
 el('replaceWith').dispatchEvent(new w.Event('input'));assert.equal(el('replaceApply').disabled,true);
 await el('replacePreview').onclick();await el('replaceApply').onclick();assert.equal(closed,true);
 assert.equal(calls.at(-1)[0],'replaceApply');assert.equal(calls.at(-1)[1][1],url);
 el('replaceFind').value='';el('replaceWith').value='';url='https://other.example/clipboard';
 await w.eval(fs.readFileSync(__dirname+'/popup.js','utf8'));
 assert.equal(el('replaceFind').value,'SECRET_FIND');assert.equal(el('replaceWith').value,'SECRET_REPLACE');
 assert.equal(el('replacementPanel').hidden,false);assert.equal(el('replaceApply').disabled,true);
 await el('replaceClear').onclick();assert.equal(saved.replacementDraft,undefined);
 url='https://pyrus.example/draft';
 saved.snapshot={adapterVersion:'pyrus-dom-v3',url,time:Date.now(),fields:[]};
 await w.eval(fs.readFileSync(__dirname+'/popup.js','utf8'));const previous=calls.length;
 el('replaceFind').value='test';
 await el('replacePreview').onclick();assert.equal(calls.length,previous);assert.match(el('status').textContent,/Открыт источник/);
 dom.window.document.body.remove();
});
test('replacement confirms the logical field after input remounts the editor and after a whole table redraw',async()=>{
 const w=setup(field('name','test')+table);
 const original=w.document.querySelector('#name');
 original.addEventListener('input',()=>{const fresh=original.cloneNode();fresh.value=original.value;original.replaceWith(fresh);});
 const text=w.document.querySelector('.cellString__content');
 text.addEventListener('input',()=>{const root=w.document.querySelector('.viewTableFieldNew');root.replaceWith(root.cloneNode(true));});
 const plan=w.pyrusReplacement.preview(options());const result=await w.pyrusReplacement.apply(plan.token);
 assert.ok(result.every(r=>r.status==='dispatched'));
 assert.ok(result.every(r=>r.replacement.verification.originalConnected===false));w.close();
});
test('value rejected by page is reported with private structural verification, without claiming success',async()=>{
 const w=setup(field('name','test'));
 const timer=w.setTimeout.bind(w);w.setTimeout=fn=>timer(fn,0);
 const input=w.document.querySelector('input');input.addEventListener('change',()=>{input.value='test';});
 const plan=w.pyrusReplacement.preview(options());const result=await w.pyrusReplacement.apply(plan.token);
 assert.equal(result[0].reason,'replacement-not-confirmed');assert.equal(result[0].replacement.verification.sameAsBefore,true);
 assert.equal(result[0].replacement.verification.targetFound,true);assert.ok(!JSON.stringify(result).includes('test2'));w.close();
});
test('duplicate logical keys are never chosen after remount',async()=>{
 const w=setup(field('name','test'));const plan=w.pyrusReplacement.preview(options());
 w.document.body.insertAdjacentHTML('beforeend',field('name','test'));
 const result=await w.pyrusReplacement.apply(plan.token);assert.equal(result[0].status,'skipped');w.close();
});
test('readback can confirm fields made readonly by the page, but never writes to locked controls',async()=>{
 const w=setup(field('name','test')+table);
 const input=w.document.querySelector('#name');input.addEventListener('change',()=>{input.readOnly=true;});
 const text=w.document.querySelector('.cellString__content');text.addEventListener('input',()=>text.setAttribute('contenteditable','false'));
 const plan=w.pyrusReplacement.preview(options());const result=await w.pyrusReplacement.apply(plan.token);
 assert.ok(result.every(r=>r.status==='dispatched'));
 const next=w.pyrusReplacement.preview(options('test2','test3'));assert.equal(next.ready,0);w.close();
});
test('replacement report uses its own attempt and excludes saved draft and source values',async()=>{
 const dom=new JSDOM(fs.readFileSync(__dirname+'/popup.html','utf8'),{url:'https://extension.example',runScripts:'outside-only'}),w=dom.window;
 const saved={snapshot:{adapterVersion:'pyrus-dom-v3',time:Date.now(),url:'https://pyrus.example/source',fields:[{kind:'text',value:'SECRET_SOURCE'}]},replacementDraft:{find:'SECRET_FIND',replace:'SECRET_REPLACE',mode:'contains',tab:'replacement'},diagnostics:[{action:'transfer-start',time:'old',details:{selectedIndices:[0]}},{action:'transfer',details:{results:[{status:'dispatched'}]}},{action:'replacement-start',time:'new',details:{requested:2}},{action:'replaceApply',details:{page:{recognized:3}}},{action:'replacement',details:{results:[{status:'dispatched'},{status:'error',reason:'replacement-not-confirmed',replacement:{kind:'text',verification:{targetFound:true,actualLength:4}}}]}}]};
 w.chrome={runtime:{getManifest:()=>({version:'0.9.7'})},storage:{session:{get:async key=>typeof key==='string'?{[key]:saved[key]}:saved,set:async obj=>Object.assign(saved,obj)}}};
 let blob;w.Blob=Blob;w.URL.createObjectURL=b=>{blob=b;return 'blob:test';};w.URL.revokeObjectURL=()=>{};
 const create=w.document.createElement.bind(w.document);w.document.createElement=tag=>{const el=create(tag);if(tag==='a')el.click=()=>{};return el;};
 await w.eval(fs.readFileSync(__dirname+'/popup.js','utf8'));await w.document.getElementById('export').onclick();
 const text=await blob.text(),report=JSON.parse(text);
 assert.equal(report.operation,'replacement');assert.equal(report.attempt.started,'new');assert.equal(report.source,null);
 assert.equal(report.attempt.successCount,1);assert.equal(report.attempt.failures[0].replacement.verification.targetFound,true);
 assert.ok(!text.includes('SECRET'));w.close();
});
