const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('structure captures class hierarchy without reading text, values, IDs or URLs',()=>{
 function el(tag,classes,parent=null){return {
  nodeType:1,tagName:tag,type:'text',classList:classes,parentElement:parent,children:[],
  attributes:[{name:'id',value:'SECRET_ID'},{name:'aria-label',value:'SECRET_LABEL'}],
  getClientRects:()=>[{}],getAttribute:name=>['role','aria-expanded','aria-controls','aria-owns'].includes(name)?null:(()=>{throw Error('Unexpected attribute read: '+name);})(),
  get textContent(){throw Error('Text leak');},get value(){throw Error('Value leak');},get innerHTML(){throw Error('HTML leak');},get id(){throw Error('ID leak');}
 };}
 const row=el('DIV',['custom-field-row']),control=el('INPUT',['custom-editor'],row);row.children=[control];
 const doc={querySelectorAll:selector=>selector==='iframe'?[]:[control],getElementById:()=>null};
 const context={document:doc,getComputedStyle:()=>({visibility:'visible'})};vm.createContext(context);
 vm.runInContext(fs.readFileSync(__dirname+'/structure.js','utf8'),context);
 const report=context.pyrusStructure(),json=JSON.stringify(report);
 assert.match(json,/custom-field-row/);assert.match(json,/custom-editor/);assert.ok(!json.includes('SECRET'));
 assert.equal(report.main.samples[0].ancestors[0].ref,report.main.samples[0].element.ref===1?2:1);
});
