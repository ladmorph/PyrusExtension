const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('applies in source order and discovers conditional target after earlier input',async()=>{
 const writes=[];
 class Input {
  constructor(label,visible=true){this.label=label;this.visible=visible;this.tagName='INPUT';this.type='text';this.labels=[{textContent:label}];this._value='';}
  get value(){return this._value;}
  set value(v){this._value=v;writes.push(this.label);}
  getAttribute(){return null;} closest(){return null;}
  getClientRects(){return this.visible?[{}]:[];}
  dispatchEvent(e){if(this.label==='A'&&e.type==='change')child.visible=true;}
 }
 const parent=new Input('A'),child=new Input('B',false),nodes=[parent,child];
 const ctx={document:{querySelectorAll:()=>nodes,getElementById:()=>null},HTMLInputElement:Input,Event:class{constructor(type){this.type=type;}},getComputedStyle:()=>({visibility:'visible'}),setTimeout:fn=>queueMicrotask(fn)};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/adapter.js','utf8'),ctx);
 const source=[{key:'label:A:text',label:'A',kind:'text',value:'yes'},{key:'label:B:text',label:'B',kind:'text',value:'child'}];
 assert.equal(ctx.pyrusTransfer.preview(source,false)[1].deferred,true);
 const results=await ctx.pyrusTransfer.apply(source,['label:B:text','label:A:text'],false);
 assert.deepEqual(writes,['A','B']);assert.equal(child.value,'child');
 assert.equal(results[0].status,'dispatched');assert.equal(results[1].status,'dispatched');
});
test('reports a conditional field that never appears',async()=>{
 const ctx={document:{querySelectorAll:()=>[],getElementById:()=>null},getComputedStyle:()=>({visibility:'visible'}),setTimeout:fn=>queueMicrotask(fn)};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/adapter.js','utf8'),ctx);
 const source=[{key:'label:X:text',label:'X',kind:'text',value:'secret'}];
 const [result]=await ctx.pyrusTransfer.apply(source,['label:X:text'],false);
 assert.equal(result.status,'skipped');assert.match(result.message,/не появилось/);
});
