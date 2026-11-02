const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const code=name=>fs.readFileSync(__dirname+'/../'+name,'utf8');
// Class names and nesting come from the user's structure report. Field text and behavior are synthetic.
const row=(title,content)=>`<div class="formField"><div class="formFieldBaseWrapper" data-test-id="form-field"><div class="formFieldBaseWrapper__content"><div class="formFieldBaseWrapper__titleWrapper">${title} *</div><div class="formFieldBaseWrapper__otherWrapper"><div class="formFieldBaseWrapper__inputWrapper"><div class="formFieldContent">${content}</div></div></div></div></div></div>`;
function page(html){
 const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://pyrus.test/task/1'});const w=dom.window;
 w.HTMLElement.prototype.getClientRects=function(){for(let el=this;el;el=el.parentElement)if(el.style.display==='none')return [];return [{}];};
 const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timer(fn,Math.min(ms,3));
 w.eval(code('expander.js'));w.eval(code('adapter.js'));return w;
}
test('Pyrus captures titled text, date and checkbox, excludes clipboard/search/comments',async()=>{
 const w=page(row('Описание','<div contenteditable="true" class="multiLineInputContent">Пример</div><div class="copyToClipboard"><textarea>ignore</textarea></div>')+row('Дата','<input class="formFieldDateInput__input" value="03.11.2026">')+row('Доступ','<div class="checkbox"><input class="checkbox__hiddenInput" type="checkbox" checked></div>')+'<input aria-label="Поиск" value="ignore"><div class="CommentSection"><div contenteditable="true">ignore</div></div>');
 const source=w.pyrusTransfer.capture();assert.equal(source.length,3);
 assert.equal(source[0].kind,'pyrus-text');assert.equal(source[0].label,'Описание');assert.equal(source[0].value,'Пример');
 const incoming=source.map(f=>({...f,value:f.kind==='checkbox'?false:f.kind==='pyrus-text'?'Новый текст':'04.11.2026'}));
 let changes=0;w.document.querySelector('[type=checkbox]').addEventListener('change',()=>changes++);
 const results=await w.pyrusTransfer.apply(incoming,incoming.map(f=>f.key),true);
 assert.equal(w.document.querySelector('.multiLineInputContent').textContent,'Новый текст');assert.equal(changes,1);
 assert.ok(results.every(r=>r.status==='dispatched'));w.close();
});
test('Pyrus opens groups but does not open comboboxes as sections',async()=>{
 const w=page('<div class="formField"><div class="formFieldBaseWrapper"><div class="formFieldGroupTitle">Раздел</div><div id="child" style="display:none">'+row('Текст','<div contenteditable="true" class="multiLineInputContent">abc</div>')+'</div></div></div>'+row('Каталог','<input role="combobox" aria-expanded="false" aria-controls="list"><div id="list" role="listbox"></div>'));
 const title=w.document.querySelector('.formFieldGroupTitle');title.onclick=()=>{title.classList.add('formFieldGroupTitle_expanded');w.document.getElementById('child').style.display='';};
 let comboClicks=0;w.document.querySelector('[role=combobox]').onclick=()=>comboClicks++;
 const report=await w.pyrusExpand.run();assert.equal(report.clicked,1);assert.equal(report.confirmedOpen,1);assert.equal(comboClicks,0);
 assert.ok(w.pyrusTransfer.capture().some(f=>f.key==='label:Раздел / Текст:pyrus-text'));w.close();
});
test('Pyrus fills exact single choice first, then reveals and fills dependent contenteditable',async()=>{
 const choice=row('Нужен доступ','<div class="formFieldRadio__content"><div class="formFieldInputCompletion"><input role="combobox" aria-owns="choices" class="formFieldInputCompletion__input"><span class="formFieldInputCompletion__dropdownIconWrapper"></span></div></div>');
 const w=page(choice+'<div id="conditional" style="display:none">'+row('Обоснование','<div contenteditable="true" class="multiLineInputContent"></div>')+'</div><ul id="choices" role="listbox" style="display:none"><li role="option">Да</li></ul>');
 const input=w.document.querySelector('[role=combobox]'),list=w.document.getElementById('choices');
 w.document.querySelector('.formFieldInputCompletion__dropdownIconWrapper').onclick=()=>list.style.display='';
 list.querySelector('li').onclick=()=>{input.value='Да';list.style.display='none';w.document.getElementById('conditional').style.display='';};
 const source=[{key:'label:Нужен доступ:pyrus-choice',label:'Нужен доступ',kind:'pyrus-choice',value:'Да'},{key:'label:Обоснование:pyrus-text',label:'Обоснование',kind:'pyrus-text',value:'Рабочая задача'}];
 assert.equal(w.pyrusTransfer.preview(source,false)[1].deferred,true);
 const results=await w.pyrusTransfer.apply(source,source.map(f=>f.key).reverse(),false);
 assert.ok(results.every(r=>r.status==='dispatched'),JSON.stringify(results));
 assert.equal(w.document.querySelector('.multiLineInputContent').textContent,'Рабочая задача');w.close();
});
test('Pyrus ambiguous choices do not select an arbitrary option and restore input',async()=>{
 const w=page(row('Выбор','<div class="formFieldRadio__content"><div class="formFieldInputCompletion"><input role="combobox" aria-owns="choices" value="Старое"></div></div>')+'<ul id="choices"><li role="option">Да</li><li role="option">Да</li></ul>');
 let clicks=0;w.document.querySelectorAll('li').forEach(el=>el.onclick=()=>clicks++);
 const source=[{key:'label:Выбор:pyrus-choice',label:'Выбор',kind:'pyrus-choice',value:'Да'}];
 const [r]=await w.pyrusTransfer.apply(source,[source[0].key],true);
 assert.equal(r.reason,'choice-ambiguous');assert.equal(clicks,0);assert.equal(w.document.querySelector('input').value,'Старое');w.close();
});
test('single catalog selects the exact table row, then fills dependent content',async()=>{
 const w=page(row('Система','<div class="formFieldCatalog__content"><div class="formFieldCatalog__mainContent"><div class="formFieldInputCompletion"><input role="combobox" aria-owns="catalogRows"><span class="formFieldInputCompletion__dropdownIconWrapper"></span></div></div></div>')+'<div id="conditional" style="display:none">'+row('Обоснование','<div contenteditable="true" class="multiLineInputContent"></div>')+'</div><table id="catalogRows" style="display:none"><tbody><tr><td>Система А</td><td>Основной контур</td></tr></tbody></table>');
 const input=w.document.querySelector('input'),table=w.document.getElementById('catalogRows'),sequence=[];
 w.document.querySelector('.formFieldInputCompletion__dropdownIconWrapper').onclick=()=>table.style.display='';
 table.querySelector('tr').onclick=()=>{sequence.push('catalog-selected');input.value='Система А';table.style.display='none';w.document.getElementById('conditional').style.display='';};
 w.document.querySelector('.multiLineInputContent').addEventListener('input',()=>sequence.push('child-filled'));
 assert.equal(w.pyrusTransfer.capture()[0].kind,'pyrus-catalog');
 const source=[{key:'label:Система:pyrus-catalog',label:'Система',kind:'pyrus-catalog',value:'Система А'},{key:'label:Обоснование:pyrus-text',label:'Обоснование',kind:'pyrus-text',value:'Причина'}];
 const results=await w.pyrusTransfer.apply(source,source.map(f=>f.key),false);
 assert.ok(results.every(r=>r.status==='dispatched'),JSON.stringify(results));assert.deepEqual(sequence,['catalog-selected','child-filled']);w.close();
});
test('ambiguous catalog blocks later writes and retains structural failure snapshot without values',async()=>{
 const w=page(row('Система','<div class="formFieldCatalog__content"><input role="combobox" aria-owns="catalogRows" value="Старое"></div>')+row('Текст','<div contenteditable="true" class="multiLineInputContent">Не менять</div>')+'<table id="catalogRows"><tbody><tr><td>Система А</td><td>1</td></tr><tr><td>Система А</td><td>2</td></tr></tbody></table>');
 w.eval(code('structure.js'));
 const source=[{key:'label:Система:pyrus-catalog',label:'Система',kind:'pyrus-catalog',value:'Система А'},{key:'label:Текст:pyrus-text',label:'Текст',kind:'pyrus-text',value:'SECRET_VALUE'}];
 const result=await w.pyrusTransfer.apply(source,source.map(f=>f.key),true);
 assert.equal(result[0].reason,'choice-ambiguous');assert.equal(result[1].status,'blocked');
 assert.equal(w.document.querySelector('.multiLineInputContent').textContent,'Не менять');
 assert.ok(w.pyrusPickerFailureStructure);assert.ok(!JSON.stringify(w.pyrusPickerFailureStructure).includes('SECRET_VALUE'));w.close();
});
test('omitting a differing catalog does not silently fill dependent fields',async()=>{
 const w=page(row('Система','<div class="formFieldCatalog__content"><input role="combobox" value="Другая"></div>')+row('Текст','<div contenteditable="true" class="multiLineInputContent">Старое</div>'));
 const source=[{key:'label:Система:pyrus-catalog',label:'Система',kind:'pyrus-catalog',value:'Нужная'},{key:'label:Текст:pyrus-text',label:'Текст',kind:'pyrus-text',value:'Новое'}];
 const [result]=await w.pyrusTransfer.apply(source,[source[1].key],true);
 assert.equal(result.reason,'unselected-controller');assert.equal(w.document.querySelector('.multiLineInputContent').textContent,'Старое');w.close();
});
test('target expansion opens only the copied groups',async()=>{
 const w=page('<div class="formField"><div class="formFieldGroupTitle">Нужная</div><div class="formFieldGroupTitle">Лишняя</div></div>');
 const titles=[...w.document.querySelectorAll('.formFieldGroupTitle')];titles.forEach(t=>t.onclick=()=>t.classList.add('formFieldGroupTitle_expanded'));
 await w.pyrusExpand.run({groupTitles:['Нужная']});assert.ok(titles[0].classList.contains('formFieldGroupTitle_expanded'));assert.ok(!titles[1].classList.contains('formFieldGroupTitle_expanded'));w.close();
});
test('popup capture reads source without expanding any sections',async()=>{
 const source=page(row('Открытое поле','<div contenteditable="true" class="multiLineInputContent">Текст</div>')+'<div class="formField"><div class="formFieldGroupTitle">Не открывать</div></div>');
 let clicks=0;source.document.querySelector('.formFieldGroupTitle').onclick=()=>clicks++;
 const ui=page(code('popup.html')),saved={};
 ui.chrome={runtime:{getManifest:()=>({version:'0.5.0'})},storage:{session:{async get(key){return typeof key==='string'?{[key]:saved[key]}:{...saved};},async set(value){Object.assign(saved,value);},async remove(key){delete saved[key];}}},tabs:{query:async()=>[{id:1,url:source.location.href}]},scripting:{executeScript:async opts=>{
   if(opts.files){opts.files.forEach(name=>source.eval(code(name)));return [];}
   return [{result:await source.eval('('+opts.func.toString()+')')(...opts.args)}];
 }}};
 await ui.eval(code('popup.js'));await ui.document.getElementById('capture').onclick();
 assert.equal(clicks,0);assert.equal(saved.snapshot.fields.length,1);assert.equal(saved.lastPage.expansion,null);
 assert.ok(!source.document.querySelector('.formFieldGroupTitle').classList.contains('formFieldGroupTitle_expanded'));source.close();ui.close();
});
test('catalog recorder captures manual choice and compares values without exposing them',async()=>{
 const w=page(row('SECRET_LABEL','<div class="formFieldCatalog__content"><input role="combobox" value="SECRET_VALUE" placeholder="SECRET_PLACEHOLDER" data-record-id="SECRET_ID"></div>')+'<table><tbody><tr><td>SECRET_VALUE</td><td>SECRET_COLUMN</td></tr></tbody></table>');
 Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto,configurable:true});w.TextEncoder=TextEncoder;
 w.eval(code('catalog-recorder.js'));
 const before=w.document.body.innerHTML;
 await w.pyrusCatalogRecorder.start('SALT_NOT_FOR_EXPORT');
 assert.equal(w.document.body.innerHTML,before);
 const input=w.document.querySelector('input');input.focus();input.click();
 const cell=w.document.querySelector('td');cell.click();input.blur();
 w.eval(code('catalog-recorder.js'));assert.equal(w.pyrusCatalogRecorder.status().running,true);
 const report=await w.pyrusCatalogRecorder.stop(),json=JSON.stringify(report);
 assert.ok(report.events.length>0);assert.ok(!json.includes('SECRET'));assert.ok(!json.includes('SALT_NOT_FOR_EXPORT'));
 const inputToken=report.events.flatMap(e=>e.nodes).find(n=>n.tag==='INPUT'&&n.signatures.value)?.signatures.value.token;
 const cellToken=report.events.flatMap(e=>e.nodes).find(n=>n.tag==='TD'&&n.signatures.text.length===12)?.signatures.text.token;
 assert.ok(inputToken);assert.equal(inputToken,cellToken);
 const count=report.events.length;input.click();assert.equal(w.pyrusCatalogRecorder.status().eventCount,count);
 await w.pyrusCatalogRecorder.discard();assert.equal((await w.pyrusCatalogRecorder.stop()).events.length,0);w.close();
});
test('catalog recorder ignores password values even inside a catalog wrapper',async()=>{
 const w=page(row('Справочник','<div class="formFieldCatalog__content"><input type="password" value="SECRET_PASSWORD"></div>'));
 w.eval(code('catalog-recorder.js'));await w.pyrusCatalogRecorder.start('salt');w.document.querySelector('input').click();
 const report=await w.pyrusCatalogRecorder.stop();
 const entry=report.events.flatMap(e=>e.nodes).find(n=>n.tag==='INPUT');
 assert.deepEqual(Object.keys(entry.signatures),[]);assert.deepEqual(Object.keys(entry.attributeSignatures),[]);w.close();
});
test('recorded Pyrus portal without ARIA linkage selects formatted catalog value by cell pointer events',async()=>{
 const w=page(row('Система','<div class="formFieldCatalog__content"><div class="formFieldInputCompletion"><input role="combobox" aria-owns="missing-owned-node"><span class="formFieldInputCompletion__dropdownIconWrapper"></span></div></div>')+row('Текст','<div contenteditable="true" class="multiLineInputContent"></div>')+'<div class="inputCompletion__popup" style="display:none"><div class="inputCompletion__popupContent"><table><tbody><tr class="completionTableMenuItem"><td>Сервис [А]</td><td>prod</td></tr></tbody></table></div></div>');
 const input=w.document.querySelector('input'),popup=w.document.querySelector('.inputCompletion__popup'),events=[];
 w.document.querySelector('.formFieldInputCompletion__dropdownIconWrapper').onclick=()=>{popup.style.display='';input.setAttribute('aria-expanded','true');};
 const cell=popup.querySelector('td');cell.onpointerdown=()=>events.push('pointerdown');cell.onmousedown=()=>events.push('mousedown');
 cell.onclick=()=>{events.push('click');input.value='Сервис [А], prod';input.setAttribute('aria-expanded','false');popup.style.display='none';};
 const source=[{key:'label:Система:pyrus-catalog',label:'Система',kind:'pyrus-catalog',value:'Сервис [А], prod'},{key:'label:Текст:pyrus-text',label:'Текст',kind:'pyrus-text',value:'Следующее поле'}];
 const result=await w.pyrusTransfer.apply(source,source.map(f=>f.key),false);
 assert.ok(result.every(r=>r.status==='dispatched'),JSON.stringify(result));assert.deepEqual(events,['pointerdown','mousedown','click']);w.close();
});
test('Pyrus catalog fallback query keeps exact matching against original full value',async()=>{
 const w=page(row('Система','<div class="formFieldCatalog__content"><input role="combobox" aria-owns="missing"></div>')+'<div class="inputCompletion__popup"><table><tbody></tbody></table></div>');
 const input=w.document.querySelector('input'),body=w.document.querySelector('tbody');
 input.addEventListener('input',()=>{
   if(input.value==='Сервис'){body.innerHTML='<tr class="completionTableMenuItem"><td>Сервис</td><td>prod</td></tr>';body.querySelector('td').onclick=()=>{input.value='Сервис, prod';w.document.querySelector('.inputCompletion__popup').style.display='none';};}
 });
 const source=[{key:'label:Система:pyrus-catalog',label:'Система',kind:'pyrus-catalog',value:'Сервис, prod'}];
 const [result]=await w.pyrusTransfer.apply(source,[source[0].key],false);assert.equal(result.status,'dispatched');w.close();
});
test('Pyrus portal does not accept a row with extra or differing words',async()=>{
 const w=page(row('Система','<div class="formFieldCatalog__content"><input role="combobox"></div>')+'<div class="inputCompletion__popup"><table><tbody><tr class="completionTableMenuItem"><td>Сервис</td><td>prod EXTRA</td></tr></tbody></table></div>');
 let selected=0;w.document.querySelector('td').onclick=()=>selected++;
 const source=[{key:'label:Система:pyrus-catalog',label:'Система',kind:'pyrus-catalog',value:'Сервис, prod'}];
 const [result]=await w.pyrusTransfer.apply(source,[source[0].key],false);assert.equal(result.reason,'choice-option-not-found');assert.equal(selected,0);w.close();
});
