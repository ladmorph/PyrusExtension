const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

function page(html,{observe=false}={}){
 const w=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true}).window;
 w.HTMLElement.prototype.getClientRects=function(){return this.isConnected && this.style.display!=='none'?[{}]:[];};
 const timer=w.setTimeout.bind(w),waits=[];
 if(!observe)w.MutationObserver=undefined;
 w.setTimeout=(fn,ms)=>{waits.push(ms);return timer(fn,1);};
 w.eval(fs.readFileSync(__dirname+'/adapter.js','utf8'));
 const source=w.pyrusTransfer.capture().map(f=>({...f,value:f.kind==='checkbox'?true:'new'}));
 return {w,source,waits,timer,apply:()=>w.pyrusTransfer.apply(source,source.map(f=>f.key),true)};
}
const input=label=>`<input aria-label="${label}">`;

test('scalar editors share one wait and preserve input/change events',async()=>{
 const p=page(input('A')+'<textarea aria-label="B"></textarea>'+input('C'));
 try{
  const events=[];
  for(const type of ['input','change'])p.w.document.addEventListener(type,e=>events.push(e.target.getAttribute('aria-label')+':'+type));
  const result=await p.apply();
  assert.deepEqual(p.waits,[300]);
  assert.deepEqual(events,['A:input','A:change','B:input','B:change','C:input','C:change']);
  assert.ok(result.every(r=>r.status==='dispatched'));
 }finally{p.w.close();}
});

test('large scalar batches yield every twenty writes',async()=>{
 const p=page(Array.from({length:41},(_,i)=>input('F'+i)).join(''));
 try{assert.ok((await p.apply()).every(r=>r.status==='dispatched'));assert.deepEqual(p.waits,[300,300,300]);}
 finally{p.w.close();}
});

test('batch settles before a checkbox and its asynchronous dependent field',async()=>{
 const p=page(input('A')+'<input type="checkbox" aria-label="Switch">');
 try{
  const writes=[];
  p.w.document.addEventListener('change',e=>{
   writes.push(e.target.getAttribute('aria-label'));
   if(e.target.type==='checkbox'){
    assert.equal(p.waits.length,1);
    p.timer(()=>p.w.document.body.insertAdjacentHTML('beforeend',input('Child')),0);
   }
  });
  p.source.push({key:'label:Child:text',label:'Child',kind:'text',value:'child'});
  assert.ok((await p.apply()).every(r=>r.status==='dispatched'));
  assert.deepEqual(writes,['A','Switch','Child']);assert.deepEqual(p.waits,[300,300,300]);
 }finally{p.w.close();}
});

test('missing editor is rediscovered after asynchronous scalar change',async()=>{
 const p=page(input('A'));
 try{
  p.w.document.querySelector('input').onchange=()=>p.timer(()=>p.w.document.body.insertAdjacentHTML('beforeend',input('B')),0);
  p.source.push({key:'label:B:text',label:'B',kind:'text',value:'child'});
  assert.ok((await p.apply()).every(r=>r.status==='dispatched'));
  assert.equal(p.w.document.querySelector('[aria-label=B]').value,'child');
 }finally{p.w.close();}
});

test('each scalar write resolves a fresh editor after synchronous replacement',async()=>{
 const p=page(input('A')+input('B'));
 try{
  const old=p.w.document.querySelector('[aria-label=B]');
  p.w.document.querySelector('[aria-label=A]').onchange=()=>old.replaceWith(old.cloneNode());
  assert.ok((await p.apply()).every(r=>r.status==='dispatched'));
  assert.equal(old.value,'');assert.equal(p.w.document.querySelector('[aria-label=B]').value,'new');
 }finally{p.w.close();}
});

test('batch verification detects values reset by an asynchronous rerender',async()=>{
 const p=page(input('A')+input('B'));
 try{
  p.w.document.querySelector('[aria-label=A]').onchange=()=>p.timer(()=>{p.w.document.querySelector('[aria-label=B]').value='';},0);
  const result=await p.apply();assert.equal(result[0].status,'dispatched');assert.equal(result[1].status,'unverified');
 }finally{p.w.close();}
});

test('final verification detects an earlier batch reset by a later controller',async()=>{
 const p=page(input('A')+'<input type="checkbox" aria-label="Switch">');
 try{
  p.w.document.querySelector('[type=checkbox]').onchange=()=>{p.w.document.querySelector('[aria-label=A]').value='';};
  const result=await p.apply();assert.equal(result[0].status,'unverified');assert.equal(result[1].status,'dispatched');
 }finally{p.w.close();}
});

test('native select remains a boundary before dependent scalar fields',async()=>{
 const p=page(input('A')+'<select aria-label="Choice"><option value=""></option><option value="new">New</option></select>'+input('B'));
 try{
  p.w.document.querySelector('select').onchange=()=>assert.equal(p.waits.length,1);
  assert.ok((await p.apply()).every(r=>r.status==='dispatched'));assert.deepEqual(p.waits,[300,300,300]);
 }finally{p.w.close();}
});

test('batching preserves filled values when overwrite is disabled',async()=>{
 const p=page(input('A')+'<input aria-label="B" value="keep">'+input('C'));
 try{
  const result=await p.w.pyrusTransfer.apply(p.source,p.source.map(f=>f.key),false);
  assert.equal(p.w.document.querySelector('[aria-label=B]').value,'keep');
  assert.deepEqual(Array.from(result,r=>r.status),['dispatched','skipped','dispatched']);
 }finally{p.w.close();}
});

test('a setter error does not misattribute pending batch results or stop later fields',async()=>{
 const p=page(input('A')+input('B')+input('C'));
 try{
  p.w.document.querySelector('[aria-label=B]').focus=()=>{throw new Error('test setter failure');};
  const result=await p.apply();
  assert.deepEqual(Array.from(result,r=>r.status),['dispatched','error','dispatched']);
  assert.deepEqual(Array.from(result,r=>r.sourceIndex),[0,1,2]);
  assert.equal(p.w.document.querySelector('[aria-label=C]').value,'new');
 }finally{p.w.close();}
});

test('MutationObserver settling detects an asynchronous replacement that rejects a value',async()=>{
 const p=page(input('A')+input('B'),{observe:true});
 try{
  p.w.document.querySelector('[aria-label=A]').onchange=()=>p.timer(()=>{
   const old=p.w.document.querySelector('[aria-label=B]'),fresh=old.cloneNode();
   fresh.value='';old.replaceWith(fresh);
  },0);
  const result=await p.apply();assert.equal(result[1].status,'unverified');
  assert.ok(p.waits.includes(250));
 }finally{p.w.close();}
});
