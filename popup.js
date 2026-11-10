const $ = id => document.getElementById(id);
$('version').textContent='v'+chrome.runtime.getManifest().version;
let snapshot, previewTab, busy=false, diagnostics=[], lastPage=null, lastPlan=null, lastStructure=null;
let replacementPreview=null;
let replacementTabActive=false,draftEdited=false;
const storage=chrome.storage.session;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function logView(){
 $('logCount').textContent=diagnostics.length+' событий';
 $('debugLog').textContent=diagnostics.map(e=>new Date(e.time).toLocaleTimeString('ru-RU')+' · '+e.action+' · '+JSON.stringify(e.details)).join('\n') || 'Событий пока нет';
}
async function record(action,details={}){
 diagnostics.push({time:new Date().toISOString(),action,details});diagnostics=diagnostics.slice(-30);
 while(diagnostics.length>1 && JSON.stringify(diagnostics).length>150000)diagnostics.shift();
 await storage.set({diagnostics});logView();
}
async function page(method,args=[],expectedTab){
 if(method==='capture')status('Читаю уже открытые поля исходной задачи…');
 if(['preview','expand'].includes(method))status('Готовлю целевой черновик и жду загрузки полей…');
 if(method==='apply')status('Заполняю поля сверху вниз. Жду обновления формы и появления зависимых полей…');
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id || !/^https?:/.test(tab.url||''))throw new Error('Откройте задачу Pyrus в обычной вкладке.');
 if(expectedTab && tab.id!==expectedTab)throw new Error('Вкладка изменилась. Повторите сопоставление.');
 if(['preview','apply','expand','cellProbeStart','replacePreview','replaceApply'].includes(method) && snapshot){
   if(tab.url===snapshot.url)throw new Error('Открыт источник. Перейдите в целевой черновик — исходная задача не раскрывается.');
   if(new URL(tab.url).origin!==new URL(snapshot.url).origin)throw new Error('Задачи должны быть на одном сервере Pyrus.');
 }
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['tables.js','adapter.js','expander.js','structure.js','catalog-recorder.js','cell-probe.js','transfer-runner.js','replacement.js']});
 const [response]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async(m,a,prepare)=>{
   const execute=async()=>{
   if(prepare.sourceUrl && ['preview','apply','expand','cellProbeStart','replacePreview','replaceApply'].includes(m) && location.href===prepare.sourceUrl)throw new Error('Открыт источник. Раскрытие отменено.');
   if(m==='replaceApply' && location.href!==a[1])throw new Error('Страница изменилась. Повторите поиск.');
   if(m==='apply' && prepare.targetUrl && location.href!==prepare.targetUrl)throw new Error('Страница изменилась. Повторите заполнение черновика.');
   if(['apply','replaceApply'].includes(m)){globalThis.pyrusCellProbe.discard();globalThis.pyrusPickerStatus=null;globalThis.pyrusTableStatus=null;}
   const before=m==='apply'?globalThis.pyrusTransfer.diagnose(prepare.sourceFields):null;
   const expansion=['preview','apply','expand'].includes(m) ? await globalThis.pyrusExpand.run({groupTitles:prepare.groupTitles,fields:prepare.fields}) : null;
   const data=m==='replacePreview'?globalThis.pyrusReplacement.preview(a[0]):m==='replaceApply'?await globalThis.pyrusReplacement.apply(a[0]):m==='cellProbeStart'?globalThis.pyrusCellProbe.start():m==='cellProbeStop'?globalThis.pyrusCellProbe.stop():m==='cellProbeCancel'?globalThis.pyrusCellProbe.discard():m==='capture'?await globalThis.pyrusTransfer.captureTables():m==='expand'?expansion:m==='structure'?globalThis.pyrusStructure():m==='pickerStructure'?globalThis.pyrusPickerFailureStructure || null:m==='recorderStart'?await globalThis.pyrusCatalogRecorder.start(a[0]):m==='recorderStop'?await globalThis.pyrusCatalogRecorder.stop():m==='recorderDiscard'?await globalThis.pyrusCatalogRecorder.discard():await globalThis.pyrusTransfer[m](...a);
   return {url:location.href,data,sourceSections:m==='capture'?globalThis.pyrusExpand.openedTitles():undefined,diagnostic:{...globalThis.pyrusTransfer.diagnose(prepare.sourceFields),beforeTransfer:before,expansion,sections:globalThis.pyrusExpand.inspect()}};
   };
   return ['apply','replaceApply'].includes(m)?globalThis.pyrusTransferRunner.start(execute,m==='replaceApply'?'replacement':'transfer'):await execute();
 },args:[method,args,{sourceUrl:snapshot?.url || null,targetUrl:previewTab?.url || null,sourceFields:snapshot?.fields || [],groupTitles:snapshot?.expandedGroups || [],fields:snapshot?(method==='apply'?snapshot.fields.filter(f=>args[1].includes(f.key)):snapshot.fields):[]}]});
 if(response?.result?.queued){window.close();return {queued:true};}
 if(!response?.result)throw new Error('Нет ответа от страницы. Обновите вкладку.');
 lastPage=response.result.diagnostic;await storage.set({lastPage});await record(method,{page:lastPage});
 return {...response.result,tabId:tab.id};
}
function reset(){$('fillAll').disabled=busy||!snapshot;$('fields').replaceChildren();$('review').hidden=true;$('apply').disabled=true;previewTab=undefined;}
async function loadSource(){
 snapshot=(await storage.get('snapshot')).snapshot;
 if(snapshot && snapshot.adapterVersion!=='pyrus-dom-v3'){
   await storage.remove('snapshot');snapshot=null;
   status('Распознавание полей обновлено. Сохраните исходную задачу заново.');
 }
 $('source').textContent=snapshot?snapshot.fields.length+' полей · '+new Date(snapshot.time).toLocaleString('ru-RU'):'Нет сохранённых полей';
}
function selection(){
 $('fillAll').disabled=busy||!snapshot;
 const all=[...$('fields').querySelectorAll('input:not(:disabled)')],n=all.filter(el=>el.checked).length;
 $('counts').textContent='Выбрано '+n+' из '+all.length;
 $('apply').textContent=n?'Заполнить выбранные поля ('+n+')':'Выберите поля для переноса';
 $('apply').disabled=busy||!n||!previewTab;
 $('replaceApply').disabled=busy||!replacementPreview?.ready;
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
 snapshot={adapterVersion:'pyrus-dom-v3',url:result.url,time:Date.now(),fields:result.data,expandedGroups:result.sourceSections||[]};await storage.set({snapshot});await loadSource();
 const emptyTables=result.data.filter(f=>f.kind==='pyrus-table'&&!f.value?.rows?.length).length;
 status('Поля сохранены. Перейдите в другую задачу того же шаблона.'+(emptyTables?'\nТаблиц без прочитанных строк: '+emptyTables+'. Если в них есть данные, дождитесь загрузки и сохраните поля заново.':''));
});

action('fillAll',async()=>{
 reset();await loadSource();if(!snapshot)throw new Error('Сначала сохраните исходные поля.');
 const keys=snapshot.fields.map(f=>f.key);
 await record('transfer-start',{selectedIndices:snapshot.fields.map((_,i)=>i),overwrite:$('overwrite').checked,mode:'all'});
 const target=await page('preview',[snapshot.fields,$('overwrite').checked]);
 if(!target.diagnostic.recognized)throw new Error('В черновике не распознаны поля. Скачайте отчёт диагностики.');
 previewTab={id:target.tabId,url:target.url};
 const result=await page('apply',[snapshot.fields,keys,$('overwrite').checked,snapshot.expandedGroups||[]],target.tabId);
 if(result.queued)return;
 await record('transfer',{requested:keys.length,results:result.data.map(r=>({status:r.status,reason:r.reason,sourceIndex:r.sourceIndex,controllerIndex:r.controllerIndex,table:r.table,matching:r.matching||null}))});
 const ok=result.data.filter(r=>r.status==='dispatched').length;
 const rest=result.data.filter(r=>r.status!=='dispatched');reset();
 status('Готово: '+ok+'. Пропущено или требует проверки: '+rest.length+'. Проверьте результат и сохраните задачу в Pyrus.'+(rest.length?'\n'+rest.map(r=>r.label+': '+r.message).join('\n'):''));
});

action('cellProbeStart',async()=>{
 if(!snapshot)throw new Error('Сначала сохраните источник и перейдите в черновик.');
 await page('cellProbeStart');status('Закройте окно расширения и нажмите проблемную ячейку. Следуйте подсказке на странице.');
});
action('cellProbeStop',async()=>{
 const result=await page('cellProbeStop');if(!result.data)throw new Error('Сначала запустите проверку одной ячейки.');
 download({extension:chrome.runtime.getManifest().version,...result.data},'pyrus-cell-comparison');
 status('Сравнение скачано. Пришлите этот файл; повторять перенос всей формы не нужно.');
});
action('cellProbeCancel',async()=>{await page('cellProbeCancel');status('Проверка ячейки отменена.');});
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
 const detail=document.createElement('small');detail.textContent=f.deferred?(f.matching?.sourceKind==='pyrus-table'?'Таблица будет проверена после загрузки строк и столбцов':'Ожидает появления после заполнения предыдущих полей'):f.reason||'Значение: '+JSON.stringify(f.value).slice(0,180);
 label.append(cb,document.createTextNode(' '+f.label),detail);label.dataset.label=f.label.toLocaleLowerCase('ru');$('fields').append(label);
 }
 $('search').value='';$('review').hidden=false;
 const ready=result.data.filter(f=>!f.reason||f.deferred).length,pending=result.data.filter(f=>f.deferred).length;await record('matching',{ready,pending,skipped:result.data.length-ready});
 status('Доступно для выбора: '+ready+' (ожидают появления: '+pending+'). Порядок заполнения — сверху вниз по исходной форме. Проверьте совпадение шаблонов.');
});
$('overwrite').onchange=()=>{reset();status('Настройка замены изменена. Нажмите «Заполнить черновик».');};
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
 if(result.queued)return;
 await record('transfer',{requested:keys.length,results:result.data.map(r=>({status:r.status,reason:r.reason,sourceIndex:r.sourceIndex,controllerIndex:r.controllerIndex,table:r.table,matching:r.matching||null}))});
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

action('formHandlers',async()=>{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id||!/^https?:/.test(tab.url||''))throw new Error('Откройте форму Pyrus в обычной вкладке.');
 const [response]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:inspectPyrusFormHandlers});
 const report=response?.result;
 if(!report?.scopeCount)throw new Error('На странице не найдена форма Pyrus. Откройте черновик и раскройте нужные разделы.');
 download({...report,createdAt:new Date().toISOString(),extension:chrome.runtime.getManifest().version},'pyrus-form-handlers');
 status('Диагностика заполнения скачана. Снимите отдельно обычный новый черновик и заполненную встроенную копию. Подпишите файлы и пришлите оба. Наличие обработчиков ещё не подтверждает возможность массового заполнения.');
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
 const start=diagnostics.map(e=>['transfer-start','replacement-start'].includes(e.action)).lastIndexOf(true);
 const attempt=start<0?diagnostics.slice(-10):diagnostics.slice(start);
 const operation=attempt[0]?.action==='replacement-start'||(start<0&&[...attempt].reverse().find(e=>['replacement','transfer'].includes(e.action))?.action==='replacement')?'replacement':'transfer';
 const transfer=[...attempt].reverse().find(e=>e.action===operation);
 const pageState=[...attempt].reverse().find(e=>e.action===(operation==='replacement'?'replaceApply':'apply'))?.details?.page || lastPage;
 const results=transfer?.details?.results || [];
 const failures=results.filter(r=>r.status!=='dispatched');
 const indices=new Set(failures.map(r=>r.sourceIndex));
 const report={format:operation==='replacement'?'pyrus-replacement-debug':'pyrus-transfer-debug',schemaVersion:2,operation,createdAt:new Date().toISOString(),extension:chrome.runtime.getManifest().version,
  source:operation==='transfer'&&snapshot?{count:snapshot.fields.length}:null,
  attempt:{started:attempt.find(e=>e.action===operation+'-start')?.time||null,completed:Boolean(transfer),selected:attempt.find(e=>e.action===operation+'-start')?.details||null,successCount:results.filter(r=>r.status==='dispatched').length,failures},
  lastPage:pageState?{recognized:pageState.recognized,table:transfer?null:pageState.table||null,picker:pageState.picker||null,expansion:pageState.expansion||null,comparison:operation==='replacement'?[]:(pageState.comparison||[]).filter(f=>indices.has(f.sourceIndex))}:null,
  sourceTables:operation==='replacement'?[]:(snapshot?.fields||[]).flatMap((f,index)=>f.kind==='pyrus-table'&&indices.has(index)?[{sourceIndex:index,rows:f.value.rows.length,columns:f.value.columns.length,rowWidths:f.value.rows.map(row=>row.length)}]:[]),
  errors:attempt.filter(e=>e.action==='error').map(e=>({time:e.time,details:e.details}))};
 download(report,'pyrus-debug');
 status('Компактный отчёт скачан: последняя попытка, ошибки и локальный контекст. Полная структура доступна отдельной кнопкой.');
});
action('clearLogs',async()=>{diagnostics=[];lastPage=null;lastPlan=null;lastStructure=null;await storage.remove(['diagnostics','lastPage','lastPlan']);logView();status('Диагностика очищена.');});
function invalidateReplacement(){replacementPreview=null;$('replaceApply').disabled=true;$('replaceResults').replaceChildren();$('replaceSummary').textContent='';}
function saveReplacementDraft(){
 draftEdited=true;
 return storage.set({replacementDraft:{find:$('replaceFind').value,replace:$('replaceWith').value,mode:$('replaceMode').value,tab:replacementTabActive?'replacement':'transfer'}}).catch(()=>status('Не удалось сохранить настройки замены.',true));
}
for(const id of ['replaceFind','replaceWith','replaceMode']){$(id).oninput=()=>{invalidateReplacement();return saveReplacementDraft();};$(id).onchange=$(id).oninput;}
function showTab(replacement){
 replacementTabActive=replacement;
 $('transferPanel').hidden=replacement;$('replacementPanel').hidden=!replacement;
 $('transferTab').setAttribute('aria-selected',String(!replacement));$('replacementTab').setAttribute('aria-selected',String(replacement));
 $('status').textContent=replacement?'Найдите совпадения в текущем черновике.':'Выберите действие переноса.';
}
$('transferTab').onclick=()=>{if(!busy){showTab(false);return saveReplacementDraft();}};$('replacementTab').onclick=()=>{if(!busy){showTab(true);return saveReplacementDraft();}};
action('replaceClear',async()=>{
 draftEdited=true;$('replaceFind').value='';$('replaceWith').value='';$('replaceMode').value='exact';invalidateReplacement();
 await storage.remove('replacementDraft');status('Настройки замены очищены.');
});
action('replacePreview',async()=>{
 invalidateReplacement();
 await saveReplacementDraft();
 const options={find:$('replaceFind').value,replace:$('replaceWith').value,mode:$('replaceMode').value};
 if(!options.find)throw Error('Введите текст поиска.');
 const result=await page('replacePreview',[options]);
 replacementPreview={...result.data,tabId:result.tabId,url:result.url};
 $('replaceSummary').textContent='Совпадений: '+result.data.items.length+'. Доступно для замены: '+result.data.ready+'.';
 for(const item of result.data.items){
  const row=document.createElement('div');row.className='replacement-item';
  const title=document.createElement('b');title.textContent=item.label;
  const detail=document.createElement('small');detail.textContent=item.before+' → '+(item.after||'(пусто)')+(item.reason?'\n'+item.reason:'');
  row.append(title,detail);$('replaceResults').append(row);
 }
 status(result.data.ready?'Проверьте найденные изменения и нажмите «Применить замену».':'Нет доступных замен. Проверьте текст поиска и откройте нужные разделы формы.');
});
action('replaceApply',async()=>{
 if(!replacementPreview?.ready)throw Error('Сначала найдите совпадения.');
 const preview=replacementPreview;
 invalidateReplacement();
 await record('replacement-start',{requested:preview.items.length});
 const result=await page('replaceApply',[preview.token,preview.url],preview.tabId);
 if(result.queued)return;
 const ok=result.data.filter(r=>r.status==='dispatched').length;
 status('Заменено: '+ok+'. Пропущено или требует проверки: '+(result.data.length-ok)+'. Проверьте форму и сохраните задачу в Pyrus.');
});

(async()=>{
 // Migrate old snapshots before any write: a full DOM tree can exhaust session quota.
 const previous=(await storage.get('snapshot')).snapshot;
 if(previous && Object.hasOwn(previous,'sourceStructure')){
  delete previous.sourceStructure;
  await storage.remove(['diagnostics','lastPage','lastPlan']);
  await storage.set({snapshot:previous});
 }
 const old=(await storage.get('diagnostics')).diagnostics||[];
 if(JSON.stringify(old).length>150000)await storage.remove(['diagnostics','lastPage','lastPlan']);
 const saved=await storage.get(['diagnostics','lastPage','lastPlan','replacementDraft']);diagnostics=saved.diagnostics||[];lastPage=saved.lastPage||null;lastPlan=saved.lastPlan||null;logView();await loadSource();reset();
 if(!draftEdited&&saved.replacementDraft){
  const draft=saved.replacementDraft;
  $('replaceFind').value=typeof draft.find==='string'?draft.find:'';$('replaceWith').value=typeof draft.replace==='string'?draft.replace:'';$('replaceMode').value=draft.mode==='contains'?'contains':'exact';showTab(draft.tab==='replacement');
 }
})().catch(e=>status(e.message,true));
