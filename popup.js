const $ = id => document.getElementById(id);
let snapshot, previewTab, busy=false, diagnostics=[], lastPage=null, lastPlan=null, lastStructure=null;
const storage=chrome.storage.session;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function logView(){
 $('logCount').textContent=diagnostics.length+' событий';
 $('debugLog').textContent=diagnostics.map(e=>new Date(e.time).toLocaleTimeString('ru-RU')+' · '+e.action+' · '+JSON.stringify(e.details)).join('\n') || 'Событий пока нет';
}
async function record(action,details={}){
 diagnostics.push({time:new Date().toISOString(),action,details});diagnostics=diagnostics.slice(-100);
 await storage.set({diagnostics});logView();
}
async function page(method,args=[],expectedTab){
 if(method==='capture')status('Читаю уже открытые поля исходной задачи…');
 if(['preview','expand'].includes(method))status('Готовлю целевой черновик и жду загрузки полей…');
 if(method==='apply')status('Заполняю поля сверху вниз. Жду обновления формы и появления зависимых полей…');
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id || !/^https?:/.test(tab.url||''))throw new Error('Откройте задачу Pyrus в обычной вкладке.');
 if(expectedTab && tab.id!==expectedTab)throw new Error('Вкладка изменилась. Повторите сопоставление.');
 if(['preview','apply','expand'].includes(method) && snapshot){
   if(tab.url===snapshot.url)throw new Error('Открыт источник. Перейдите в целевой черновик — исходная задача не раскрывается.');
   if(new URL(tab.url).origin!==new URL(snapshot.url).origin)throw new Error('Задачи должны быть на одном сервере Pyrus.');
 }
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['tables.js','adapter.js','expander.js','structure.js','catalog-recorder.js']});
 const [response]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async(m,a,prepare)=>{
   if(prepare.sourceUrl && ['preview','apply','expand'].includes(m) && location.href===prepare.sourceUrl)throw new Error('Открыт источник. Раскрытие отменено.');
   const before=m==='apply'?globalThis.pyrusTransfer.diagnose(prepare.sourceFields):null;
   const expansion=['preview','apply','expand'].includes(m) ? await globalThis.pyrusExpand.run({groupTitles:prepare.groupTitles,fields:prepare.fields}) : null;
   const data=m==='capture'?await globalThis.pyrusTransfer.captureTables():m==='expand'?expansion:m==='structure'?globalThis.pyrusStructure():m==='pickerStructure'?globalThis.pyrusPickerFailureStructure || null:m==='recorderStart'?await globalThis.pyrusCatalogRecorder.start(a[0]):m==='recorderStop'?await globalThis.pyrusCatalogRecorder.stop():m==='recorderDiscard'?await globalThis.pyrusCatalogRecorder.discard():await globalThis.pyrusTransfer[m](...a);
   return {url:location.href,data,sourceStructure:m==='capture'?globalThis.pyrusStructure():undefined,sourceSections:m==='capture'?globalThis.pyrusExpand.openedTitles():undefined,diagnostic:{...globalThis.pyrusTransfer.diagnose(prepare.sourceFields),beforeTransfer:before,expansion,sections:globalThis.pyrusExpand.inspect()}};
 },args:[method,args,{sourceUrl:snapshot?.url || null,sourceFields:snapshot?.fields || [],groupTitles:snapshot?.expandedGroups || [],fields:snapshot?(method==='apply'?snapshot.fields.filter(f=>args[1].includes(f.key)):snapshot.fields):[]}]});
 if(!response?.result)throw new Error('Нет ответа от страницы. Обновите вкладку.');
 lastPage=response.result.diagnostic;await storage.set({lastPage});await record(method,{page:lastPage});
 return {...response.result,tabId:tab.id};
}
function reset(){$('fields').replaceChildren();$('review').hidden=true;$('apply').disabled=true;previewTab=undefined;}
async function loadSource(){
 snapshot=(await storage.get('snapshot')).snapshot;
 if(snapshot && snapshot.adapterVersion!=='pyrus-dom-v3'){
   await storage.remove('snapshot');snapshot=null;
   status('Распознавание полей обновлено. Сохраните исходную задачу заново.');
 }
 $('source').textContent=snapshot?snapshot.fields.length+' полей · '+new Date(snapshot.time).toLocaleString('ru-RU'):'Нет сохранённых полей';
}
function selection(){
 const all=[...$('fields').querySelectorAll('input:not(:disabled)')],n=all.filter(el=>el.checked).length;
 $('counts').textContent='Выбрано '+n+' из '+all.length;
 $('apply').textContent=n?'Заполнить выбранные поля ('+n+')':'Выберите поля для переноса';
 $('apply').disabled=busy||!n||!previewTab;
}
function action(id,fn){$(id).onclick=async()=>{
 if(busy)return;busy=true;const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{await fn();}catch(e){
 status(e.message,true);
 // Do not persist arbitrary error messages: they can contain page data.
 await record('error',{operation:id,category:e instanceof TypeError?'TypeError':'OperationError'}).catch(()=>{});
 }finally{busy=false;buttons.forEach(b=>b.disabled=false);selection();}
};}
action('capture',async()=>{
 reset();const result=await page('capture');
 if(!result.data.length)throw new Error('В открытых разделах поля не найдены. Включите редактирование. Скачайте отчёт — для этой разметки нужен адаптер.');
 snapshot={adapterVersion:'pyrus-dom-v3',url:result.url,time:Date.now(),fields:result.data,sourceStructure:result.sourceStructure||null,expandedGroups:result.sourceSections||[]};await storage.set({snapshot});await loadSource();
 status('Поля сохранены. Перейдите в другую задачу того же шаблона.');
});
action('preview',async()=>{
 reset();await loadSource();if(!snapshot)throw new Error('Сначала сохраните исходные поля.');
 const result=await page('preview',[snapshot.fields,$('overwrite').checked]);
 if(!result.diagnostic.recognized){await record('recognition-failed',{stage:'target'});throw new Error('В целевой форме не распознано ни одного поля. Перенос заблокирован. В диагностике нажмите «Скачать структуру страницы» и пришлите файл.');}
 if(result.url===snapshot.url)throw new Error('Открыта исходная задача. Перейдите в другую задачу.');
 if(new URL(result.url).origin!==new URL(snapshot.url).origin)throw new Error('Задачи должны быть на одном сервере Pyrus.');
 previewTab={id:result.tabId,url:result.url};
 lastPlan=result.data.map((f,index)=>({index,reason:f.deferred?'conditional-pending':f.reason||'ready',matching:f.matching||null}));await storage.set({lastPlan});
 for(const f of result.data){
 const label=document.createElement('label');label.className='field'+(f.reason&&!f.deferred?' blocked':'');
 const cb=document.createElement('input');cb.type='checkbox';cb.value=f.key;cb.disabled=Boolean(f.reason)&&!f.deferred;cb.checked=!cb.disabled;cb.onchange=selection;
 const detail=document.createElement('small');detail.textContent=f.deferred?'Ожидает появления после заполнения предыдущих полей':f.reason||'Значение: '+JSON.stringify(f.value).slice(0,180);
 label.append(cb,document.createTextNode(' '+f.label),detail);label.dataset.label=f.label.toLocaleLowerCase('ru');$('fields').append(label);
 }
 $('search').value='';$('review').hidden=false;
 const ready=result.data.filter(f=>!f.reason||f.deferred).length,pending=result.data.filter(f=>f.deferred).length;await record('matching',{ready,pending,skipped:result.data.length-ready});
 status('Доступно для выбора: '+ready+' (ожидают появления: '+pending+'). Порядок заполнения — сверху вниз по исходной форме. Проверьте совпадение шаблонов.');
});
$('overwrite').onchange=()=>{reset();status('Настройка замены изменена. Повторите сопоставление.');};
$('search').oninput=()=>{const q=$('search').value.trim().toLocaleLowerCase('ru');[...$('fields').children].forEach(row=>row.hidden=!row.dataset.label.includes(q));};
for(const [id,value] of [['selectAll',true],['selectNone',false]])action(id,async()=>{
 $('fields').querySelectorAll('input:not(:disabled)').forEach(el=>{if(!el.closest('label').hidden)el.checked=value;});
});
action('apply',async()=>{
 const keys=[...$('fields').querySelectorAll('input:checked:not(:disabled)')].map(el=>el.value);
 if(!keys.length||!previewTab)throw new Error('Повторите сопоставление и выберите поля.');
 await record('transfer-start',{selectedIndices:snapshot.fields.map((f,i)=>keys.includes(f.key)?i:null).filter(i=>i!==null),overwrite:$('overwrite').checked});
 const current=await page('preview',[snapshot.fields,$('overwrite').checked],previewTab.id);
 if(current.url!==previewTab.url)throw new Error('Страница изменилась. Повторите сопоставление.');
 const result=await page('apply',[snapshot.fields,keys,$('overwrite').checked,snapshot.expandedGroups||[]],previewTab.id);
 await record('transfer',{requested:keys.length,results:result.data.map(r=>({status:r.status,reason:r.reason,sourceIndex:r.sourceIndex,controllerIndex:r.controllerIndex,matching:r.matching||null}))});
 reset();status(result.data.map(r=>r.label+': '+r.message).join('\n'));
});
action('clear',async()=>{await storage.remove('snapshot');await loadSource();reset();status('Сохранённые поля удалены.');});
action('diagnose',async()=>{
 await page('diagnose');$('debug').open=true;
 status('Страница проверена. Элементов: '+lastPage.totalControls+', распознано: '+lastPage.recognized+'. Можно скачать отчёт.');
});
action('expand',async()=>{
 if(!snapshot)throw new Error('Сначала сохраните исходную задачу, затем перейдите в целевой черновик.');
 reset();status('Раскрываю разделы и жду загрузки полей…');
 const result=await page('expand');const r=result.data;
 status('Нажато разделов: '+r.clicked+'. Подтверждено раскрытие: '+r.confirmedOpen+'. Осталось распознанных свёрнутых: '+r.remaining+'. Если разделы остались закрыты — скачайте отчёт диагностики.');
});
action('structure',async()=>{
 const result=await page('structure');lastStructure=result.data;
 const report={format:'pyrus-structure-debug',schemaVersion:2,createdAt:new Date().toISOString(),extension:chrome.runtime.getManifest().version,browser:navigator.userAgent,diagnostic:lastPage,structure:lastStructure};
 download(report,'pyrus-structure');
 status('Техническая структура скачана. Пришлите файл. Текст, значения, идентификаторы и адрес страницы не включены; CSS-классы включены.');
});
action('pickerStructure',async()=>{
 const result=await page('pickerStructure');
 if(!result.data)throw new Error('Снимка ошибки списка пока нет. Повторите перенос справочника и нажмите эту кнопку после ошибки.');
 download({format:'pyrus-picker-structure',schemaVersion:1,extension:chrome.runtime.getManifest().version,diagnostic:lastPage,structure:result.data},'pyrus-picker');
 status('Снимок структуры раскрытого списка скачан. Пришлите JSON — он поможет адаптировать выбор строки.');
});
function download(report,prefix){
 const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
action('recorderStart',async()=>{
 let salt=(await storage.get('catalogDiagnosticSalt')).catalogDiagnosticSalt;
 if(!salt){salt=crypto.randomUUID()+crypto.randomUUID();await storage.set({catalogDiagnosticSalt:salt});}
 await page('recorderStart',[salt]);
 status('Запись включена. Закройте окно расширения, нажмите нужный справочник, найдите значение и выберите строку вручную. Затем откройте расширение и нажмите «Завершить и скачать запись». Перед уходом на другую страницу обязательно скачайте запись.');
});
action('recorderStop',async()=>{
 const result=await page('recorderStop');
 if(!result.data.events.length)throw new Error('Событий справочника нет. Включите запись, закройте расширение и вручную нажмите поле справочника на странице.');
 download({extension:chrome.runtime.getManifest().version,browser:navigator.userAgent,...result.data},'pyrus-catalog-recording');
 status('Обезличенная запись скачана. Пришлите JSON и укажите: это источник или целевой черновик.');
});
action('recorderDiscard',async()=>{await page('recorderDiscard');status('Запись справочника остановлена и удалена из памяти страницы.');});
action('export',async()=>{
 let targetStructure=null,structureStatus='unavailable';
 const previousPage=lastPage;
 try{const current=await page('structure');if(current.url!==snapshot?.url){targetStructure=current.data;structureStatus='captured';}else{structureStatus='source-is-active';}}catch{structureStatus='capture-failed';}
 await record('export');
 const report={format:'pyrus-transfer-debug',schemaVersion:1,createdAt:new Date().toISOString(),extension:chrome.runtime.getManifest().version,browser:navigator.userAgent,source:snapshot?{count:snapshot.fields.length,kinds:snapshot.fields.reduce((a,f)=>(a[f.kind]=(a[f.kind]||0)+1,a),{})}:null,lastPage,lastPlan,events:diagnostics};
 report.sourceTables=(snapshot?.fields||[]).filter(f=>f.kind==='pyrus-table').map((f,index)=>({index,rows:f.value.rows.length,columns:f.value.columns.length,unsupported:f.unsupported}));
 report.structures={source:snapshot?.sourceStructure||null,target:targetStructure,status:structureStatus,sourceMissing:!snapshot?.sourceStructure};
 report.lastTransferPage=previousPage;
 const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='pyrus-debug-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 status('Отчёт скачан. Приложите JSON к сообщению и опишите ожидаемый результат.');
});
action('clearLogs',async()=>{diagnostics=[];lastPage=null;lastPlan=null;lastStructure=null;await storage.remove(['diagnostics','lastPage','lastPlan']);logView();status('Диагностика очищена.');});
(async()=>{const saved=await storage.get(['diagnostics','lastPage','lastPlan']);diagnostics=saved.diagnostics||[];lastPage=saved.lastPage||null;lastPlan=saved.lastPlan||null;logView();await loadSource();reset();})().catch(e=>status(e.message,true));
