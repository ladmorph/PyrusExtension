const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function adapter(specs) {
  const nodes = specs.map(s => ({tagName:s.options?'SELECT':'INPUT',type:s.kind||'text',value:s.value ?? '',checked:s.checked ?? false,options:s.options?.map(value=>({value})),disabled:false,readOnly:false,labels:[{textContent:s.label}],getAttribute:()=>null,closest:()=>null,getClientRects:()=>[{}]}));
  const context = {document:{querySelectorAll:s=>s==='iframe'?[]:nodes,getElementById:()=>null},getComputedStyle:()=>({visibility:'visible'})};
  vm.createContext(context); vm.runInContext(fs.readFileSync(__dirname+'/adapter.js','utf8'),context); return context.pyrusTransfer;
}
test('matches labels and protects existing target values',()=>{
  const source=adapter([{label:'Название *',value:'Новое'}]).capture();
  const target=adapter([{label:'Название',value:'Старое'}]);
  assert.match(target.preview(source,false)[0].reason,/заполнено/);
  assert.equal(target.preview(source,true)[0].reason,'');
});
test('duplicate labels never match silently',()=>{
  const source=adapter([{label:'Имя',value:'А'}]).capture();
  assert.match(adapter([{label:'Имя'},{label:'Имя'}]).preview(source,true)[0].reason,/Неоднозначное/);
});
test('missing and incompatible fields are reported',()=>{
  const source=adapter([{label:'Отдел',value:'1',options:['1']}]).capture();
  assert.match(adapter([]).preview(source,false)[0].reason,/не найдено/);
  assert.match(adapter([{label:'Отдел',options:['2']}]).preview(source,true)[0].reason,/нет исходного/);
});
test('unchecked checkbox is retained as false',()=>{
  const source=adapter([{label:'Доступ',kind:'checkbox',checked:false}]).capture();
  const row=adapter([{label:'Доступ',kind:'checkbox',checked:true}]).preview(source,true)[0];
  assert.equal(row.value,false); assert.equal(row.reason,'');
});
test('diagnostic report excludes labels and values',()=>{
  const diagnostic=adapter([{label:'SECRET_EMPLOYEE',value:'SECRET_VALUE'},{label:'Password',kind:'password',value:'SECRET_PASSWORD'}]).diagnose();
  const json=JSON.stringify(diagnostic);
  assert.equal(diagnostic.totalControls,2);
  assert.equal(diagnostic.recognized,1);
  assert.ok(!json.includes('SECRET'));
  assert.ok(!json.includes('Password'));
});
test('diagnostic lists ambiguous controls and hidden unsupported fields',()=>{
  const diagnostic=adapter([{label:'Имя'},{label:'Имя'},{label:'Файл',kind:'file'}]).diagnose();
  assert.equal(diagnostic.ambiguousControls,2);
  assert.equal(diagnostic.controls[2].recognized,false);
});
