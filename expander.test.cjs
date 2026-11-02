const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(){
 const nodes=[],panels=new Map();
 const context={document:{querySelectorAll:()=>nodes.filter(n=>n.state==='false'),getElementById:id=>panels.get(id)},getComputedStyle:()=>({visibility:'visible'}),setTimeout:fn=>queueMicrotask(fn)};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/expander.js','utf8'),context);
 function node(id,options={}){
  const el={tagName:options.tag||'BUTTON',type:'button',state:'false',isConnected:true,clicks:0,getClientRects:()=>[{}],getAttribute(name){return name==='aria-expanded'?this.state:name==='aria-controls'?id:name==='role'?options.role||null:null;},closest(selector){return selector.startsWith('nav')?(options.navigation?{}:null):(options.outside?null:{});},click(){this.clicks++;this.state='true';options.onClick?.();}};
  panels.set(id,{getAttribute:()=>null,querySelector:()=>({})});nodes.push(el);return el;
 }
 return {api:context.pyrusExpand,node};
}
test('no eligible sections returns without scheduling waits',async()=>{
 const context={document:{querySelectorAll:()=>[]},getComputedStyle:()=>({visibility:'visible'}),setTimeout:()=>{throw new Error('Unexpected wait');}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/expander.js','utf8'),context);
 const report=await context.pyrusExpand.run({groupTitles:[]});assert.equal(report.clicked,0);assert.equal(report.remaining,0);
});
test('opens nested sections and never collapses open sections',async()=>{
 const f=fixture();let nested;
 const parent=f.node('parent',{onClick:()=>{nested=f.node('child');}});
 const result=await f.api.run();assert.equal(result.clicked,2);assert.equal(result.confirmedOpen,2);assert.equal(result.remaining,0);
 await f.api.run();assert.equal(parent.clicks,1);assert.equal(nested.clicks,1);
});
test('excludes navigation, outside-form controls and comboboxes',async()=>{
 const f=fixture(),nodes=[f.node('nav',{navigation:true}),f.node('outside',{outside:true}),f.node('combo',{role:'combobox'}),f.node('input',{tag:'INPUT'})];
 const result=await f.api.run();assert.equal(result.clicked,0);for(const n of nodes)assert.equal(n.clicks,0);
});
test('does not retry a control that failed to expand',async()=>{
 const f=fixture(),el=f.node('stuck');el.click=function(){this.clicks++;};
 const result=await f.api.run();assert.equal(el.clicks,1);assert.equal(result.remaining,1);assert.equal(result.limited,true);
});
test('caps clicks on large forms',async()=>{
 const f=fixture();for(let i=0;i<105;i++)f.node('panel'+i);
 const result=await f.api.run();assert.equal(result.clicked,100);assert.equal(result.limited,true);
});
