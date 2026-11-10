const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const probe=fs.readFileSync(__dirname+'/form-handlers.js','utf8');
function page(html='<div class="formFieldBaseWrapper"><input value="SECRET_VALUE" aria-label="SECRET_LABEL" id="SECRET_ID"></div>'){
 const w=new JSDOM(html,{runScripts:'outside-only',url:'https://secret.test/task/SECRET_TASK?token=SECRET_TOKEN'}).window;
 w.HTMLElement.prototype.getClientRects=function(){for(let el=this;el;el=el.parentElement)if(el.hidden||el.style.display==='none')return [];return [{}];};
 w.eval(probe);return w;
}

test('form handler probe reports only fixed names and sizes without invoking page code',()=>{
 const w=page();let calls=0,getters=0;
 try{
  const props={fields:[{id:'SECRET_FIELD_ID',value:'SECRET_FIELD_VALUE'}],onChange(){calls++;},SECRET_CUSTOM_KEY:'SECRET_OTHER'};
  Object.defineProperty(props,'formData',{get(){getters++;throw Error('SECRET_GETTER');}});
  class Owner {setFieldValues(){calls++;}}
  const owner=new Owner();owner.props=props;
  const fiber={memoizedProps:props,stateNode:owner,return:null};
  w.document.querySelector('div')['__reactFiber$SECRET_SUFFIX']=fiber;
  const before=w.document.body.innerHTML,report=w.inspectPyrusFormHandlers(),json=JSON.stringify(report);
  assert.ok(report.bulkCandidateCount>0);assert.ok(report.candidates.some(c=>c.bulkMethods.includes('setFieldValues')));
  assert.ok(report.candidates.some(c=>c.collections.some(v=>v.name==='fields'&&v.length===1)));
  assert.equal(calls,0);assert.equal(getters,0);assert.equal(w.document.body.innerHTML,before);
  assert.ok(!json.includes('SECRET'));assert.ok(!json.includes('secret.test'));assert.ok(!json.includes('function'));
 }finally{w.close();}
});

test('host props can be inspected without a fiber and do not imply bulk filling support',()=>{
 const w=page();
 try{
  w.document.querySelector('input')['__reactProps$private']={onChange(){throw Error('must not run');},value:'SECRET'};
  const report=w.inspectPyrusFormHandlers();
  assert.ok(report.reactAnchors>0);assert.equal(report.bulkCandidateCount,0);
  assert.ok(report.candidates.some(c=>c.singleMethods.includes('onChange')));
 }finally{w.close();}
});

test('Vue handler inspection remains read only and ignores private method names',()=>{
 const w=page();let calls=0;
 try{
  w.document.querySelector('div').__vueParentComponent={props:{onFieldsChange(){calls++;},rows:['SECRET'],SECRET_METHOD(){calls++;}},parent:null};
  const report=w.inspectPyrusFormHandlers();
  assert.ok(report.vueAnchors>0);assert.ok(report.bulkCandidateCount>0);assert.equal(calls,0);
  assert.ok(!JSON.stringify(report).includes('SECRET'));
 }finally{w.close();}
});

test('cycles and deeply nested models are bounded without running accessors',()=>{
 const w=page();let getters=0;
 try{
  const fiber={memoizedProps:{onChange(){}},stateNode:{}};fiber.return=fiber;
  w.document.querySelector('div')['__reactFiber$cycle']=fiber;
  assert.doesNotThrow(()=>w.inspectPyrusFormHandlers());
  let chain=null;for(let i=0;i<220;i++)chain={memoizedProps:{onChange(){}},stateNode:{},return:chain};
  w.document.querySelector('div')['__reactFiber$cycle']=chain;
  Object.defineProperty(chain.memoizedProps,'setValues',{get(){getters++;throw Error('must not run');}});
  const report=w.inspectPyrusFormHandlers();assert.equal(report.limited,true);assert.equal(getters,0);
  assert.ok(JSON.stringify(report).length<100000);
 }finally{w.close();}
});

test('pages without Pyrus form scopes produce no framework candidates',()=>{
 const w=page('<input value="SECRET_VALUE">');
 try{const report=w.inspectPyrusFormHandlers();assert.equal(report.scopeCount,0);assert.equal(report.candidates.length,0);}
 finally{w.close();}
});

test('focused copy form is inspected instead of many background task fields',()=>{
 const background='<div class="formView">'+Array.from({length:200},()=>'<div class="formFieldBaseWrapper"><input></div>').join('')+'</div>';
 const w=page(background+'<div role="dialog"><div class="formView"><div class="formFieldBaseWrapper"><input value="SECRET_COPY"></div></div></div>');
 try{
  const main=w.document.querySelector('.formView'),copy=w.document.querySelector('[role="dialog"] .formView'),input=copy.querySelector('input');
  main['__reactFiber$main']={memoizedProps:{setFields(){}},return:null};
  copy['__reactFiber$copy']={memoizedProps:{setFieldValues(){throw Error('must not run');}},return:null};
  input.focus();const before=w.document.body.innerHTML,report=w.inspectPyrusFormHandlers();
  assert.equal(report.context.selection,'focused-form');assert.ok(report.pageScopeCount>report.scopeCount);
  assert.ok(report.candidates.some(c=>c.bulkMethods.includes('setFieldValues')));
  assert.ok(!report.candidates.some(c=>c.bulkMethods.includes('setFields')));
  assert.equal(w.document.body.innerHTML,before);assert.ok(!JSON.stringify(report).includes('SECRET'));
 }finally{w.close();}
});

test('visible copy dialogs are selected before the background when no field is focused',()=>{
 const w=page('<div class="formView"><div class="formFieldBaseWrapper"><input></div></div><div role="dialog" style="display:none"><div class="formFieldBaseWrapper"><input></div></div><div role="dialog"><div class="formFieldBaseWrapper"><input></div></div>');
 try{
  const dialogs=w.document.querySelectorAll('[role="dialog"]');
  dialogs[0]['__reactFiber$hidden']={memoizedProps:{setFields(){}},return:null};
  dialogs[1]['__reactFiber$copy']={memoizedProps:{setFieldValues(){}},return:null};
  const report=w.inspectPyrusFormHandlers();assert.equal(report.context.selection,'visible-dialog');
  assert.equal(report.context.visibleDialogs,1);assert.ok(report.candidates.some(c=>c.bulkMethods.includes('setFieldValues')));
  assert.ok(!report.candidates.some(c=>c.bulkMethods.includes('setFields')));
 }finally{w.close();}
});

test('form owners above deep DOM component chains are reached before leaf editor noise',()=>{
 const w=page();
 try{
  let fiber={memoizedProps:{setValues(){throw Error('must not run');}},return:null};
  for(let i=0;i<120;i++)fiber={memoizedProps:{onChange(){}},stateNode:w.document.createElement('div'),return:fiber};
  w.document.querySelector('div')['__reactFiber$deep']=fiber;
  const report=w.inspectPyrusFormHandlers();assert.ok(report.candidates.some(c=>c.bulkMethods.includes('setValues')));
  assert.ok(!report.limitReasons.includes('owners'));
 }finally{w.close();}
});

test('known nested form models expose method metadata without reading field members',()=>{
 const w=page();let getters=0,calls=0;
 try{
  const data={};Object.defineProperty(data,'SECRET_ID',{get(){getters++;throw Error('must not read');}});
  w.document.querySelector('div')['__reactFiber$nested']={memoizedProps:{formModel:{actions:{setValues(){calls++;},fields:[data]}}},return:null};
  const report=w.inspectPyrusFormHandlers();assert.ok(report.candidates.some(c=>c.bulkMethods.includes('setValues')));
  assert.equal(getters,0);assert.equal(calls,0);assert.ok(!JSON.stringify(report).includes('SECRET'));
 }finally{w.close();}
});

test('ambiguous pages request focus instead of silently inspecting the first form',()=>{
 const w=page('<div class="formView"><div class="formFieldBaseWrapper"><input></div></div><div class="formView"><div class="formFieldBaseWrapper"><input></div></div>');
 try{const report=w.inspectPyrusFormHandlers();assert.equal(report.needsFocus,true);assert.equal(report.candidates.length,0);}
 finally{w.close();}
});

test('a later shorter chain reaches owners missed by a deep scan and retains bulk candidates',()=>{
 const w=page();
 try{
  let shared={memoizedProps:{setValues(){throw Error('must not run');}},return:null};
  for(let i=0;i<80;i++)shared={memoizedProps:{onChange(){}},return:shared};
  let deep=shared;for(let i=0;i<120;i++)deep={memoizedProps:{onChange(){}},return:deep};
  w.document.querySelector('div')['__reactFiber$deep']=deep;
  w.document.querySelector('input')['__reactFiber$short']=shared;
  const report=w.inspectPyrusFormHandlers();assert.ok(report.limitReasons.includes('depth'));
  assert.ok(report.candidates.some(c=>c.bulkMethods.includes('setValues')));
 }finally{w.close();}
});
