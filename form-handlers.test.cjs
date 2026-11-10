const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const probe=fs.readFileSync(__dirname+'/form-handlers.js','utf8');
function page(html='<div class="formFieldBaseWrapper"><input value="SECRET_VALUE" aria-label="SECRET_LABEL" id="SECRET_ID"></div>'){
 const w=new JSDOM(html,{runScripts:'outside-only',url:'https://secret.test/task/SECRET_TASK?token=SECRET_TOKEN'}).window;
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
  let chain=null;for(let i=0;i<100;i++)chain={memoizedProps:{onChange(){}},stateNode:{},return:chain};
  w.document.querySelector('div')['__reactFiber$cycle']=chain;
  Object.defineProperty(chain.memoizedProps,'setValues',{get(){getters++;throw Error('must not run');}});
  const report=w.inspectPyrusFormHandlers();assert.equal(report.limited,true);assert.equal(getters,0);
  assert.ok(report.candidates.length<=80);assert.ok(JSON.stringify(report).length<100000);
 }finally{w.close();}
});

test('pages without Pyrus form scopes produce no framework candidates',()=>{
 const w=page('<input value="SECRET_VALUE">');
 try{const report=w.inspectPyrusFormHandlers();assert.equal(report.scopeCount,0);assert.equal(report.candidates.length,0);}
 finally{w.close();}
});
