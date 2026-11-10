const $=id=>document.getElementById(id);
$('version').textContent='v'+chrome.runtime.getManifest().version;
const storage=chrome.storage.session;
let snapshot,previewTab,busy=false,replacementPreview=null,replacementTabActive=false,draftEdited=false,prefillEdited=false,preparedPrefill=null;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
const replacementMode=()=>document.querySelector('input[name="replaceMode"]:checked')?.value||'exact';
function setReplacementMode(mode){document.querySelectorAll('input[name="replaceMode"]').forEach(input=>input.checked=input.value===(mode==='contains'?'contains':'exact'));}
async function page(method,args=[],expectedTab,fastPrefill=null){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id||!/^https?:/.test(tab.url||''))throw Error('Откройте задачу Pyrus в обычной вкладке.');
 if(expectedTab&&tab.id!==expectedTab)throw Error('Вкладка изменилась. Повторите сопоставление.');
 if(['preview','apply','prefill','replacePreview','replaceApply'].includes(method)&&snapshot){
  if(tab.url===snapshot.url)throw Error('Открыт источник. Перейдите в целевой черновик — исходная задача не раскрывается.');
  if(new URL(tab.url).origin!==new URL(snapshot.url).origin)throw Error('Задачи должны быть на одном сервере Pyrus.');
 }
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['tables.js','adapter.js','expander.js','transfer-runner.js','replacement.js']});
 const [response]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async(m,a,prepare)=>{
  // Remove listeners and retained reports left by older extension versions.
  for(const key of ['pyrusCatalogRecorder','pyrusCellProbe'])try{await globalThis[key]?.discard?.();}catch{}
  for(const key of ['pyrusCatalogRecorder','pyrusCellProbe','pyrusStructure','pyrusPickerFailureStructure','pyrusPickerStatus','pyrusTableStatus'])delete globalThis[key];
  const execute=async()=>{
   if(prepare.sourceUrl&&location.href===prepare.sourceUrl&&m!=='capture')throw Error('Открыт источник. Перейдите в целевой черновик.');
   if(m==='replaceApply'&&location.href!==a[1])throw Error('Страница изменилась. Повторите поиск.');
   if(m==='apply'&&prepare.targetUrl&&location.href!==prepare.targetUrl)throw Error('Страница изменилась. Повторите заполнение черновика.');
   if(m==='apply'&&prepare.fastPrefill&&!globalThis.pyrusTransfer.hasFilledValues()){
    const destination=new URL(prepare.fastPrefill.url),current=new URL(location.href);
    if(destination.origin===current.origin&&destination.pathname===current.pathname&&/^#uf\d+(?:&|$)/.test(current.hash)&&destination.hash.split('&')[0]===current.hash.split('&')[0]){
     globalThis.pyrusProgress?.update({stage:'Предзаполнение по ссылке',detail:'Ожидаю обновления формы…'});
     location.hash=destination.hash;
     // Keep this operation alive in the SPA while Pyrus applies native values.
     // Always continue with the usual field transfer after this bounded wait.
     let stable=0;const deadline=Date.now()+5000;
     while(Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,200));
      const live=new URL(location.href);
      if(live.origin!==destination.origin||live.pathname!==destination.pathname||live.hash.split('&')[0]!==destination.hash.split('&')[0])throw Error('Страница изменилась. Повторите заполнение.');
      stable=globalThis.pyrusTransfer.prefillMatches(a[0],prepare.fastPrefill.keys)?stable+1:0;
      if(stable>=3)break;
     }
    }
   }
   if(['preview','apply','prefill'].includes(m))await globalThis.pyrusExpand.run({groupTitles:prepare.groupTitles,fields:prepare.fields});
   const transfer=globalThis.pyrusTransfer;
   const data=m==='capture'?await transfer.captureTables():m==='replacePreview'?globalThis.pyrusReplacement.preview(a[0]):m==='replaceApply'?await globalThis.pyrusReplacement.apply(a[0]):m==='prefill'?transfer.prefillFields(...a):await transfer[m](...a);
   return {url:location.href,data,recognized:m==='preview'?transfer.fieldCount():undefined,hasValues:m==='prefill'?transfer.hasFilledValues():undefined,sourceSections:m==='capture'?globalThis.pyrusExpand.openedTitles():undefined};
  };
  return ['apply','replaceApply'].includes(m)?globalThis.pyrusTransferRunner.start(execute,m==='replaceApply'?'replacement':'transfer'):await execute();
 },args:[method,args,{sourceUrl:snapshot?.url||null,targetUrl:previewTab?.url||null,fastPrefill,groupTitles:snapshot?.expandedGroups||[],fields:snapshot?(method==='apply'?snapshot.fields.filter(f=>args[1].includes(f.key)):snapshot.fields):[]}]});
 if(response?.result?.queued){window.close();return {queued:true};}
 if(!response?.result)throw Error('Нет ответа от страницы. Обновите вкладку.');
 return {...response.result,tabId:tab.id};
}
function resetPrefill(){preparedPrefill=null;$('prefillResult').hidden=true;$('prefillSummary').textContent='';$('prefillUrl').value='';}
function reset(){$('fields').replaceChildren();$('review').hidden=true;previewTab=undefined;resetPrefill();selection();}
async function loadSource(){
 snapshot=(await storage.get('snapshot')).snapshot;
 if(snapshot&&snapshot.adapterVersion!=='pyrus-dom-v3'){await storage.remove('snapshot');snapshot=null;status('Распознавание полей обновлено. Сохраните исходную задачу заново.');}
 $('source').textContent=snapshot?snapshot.fields.length+' полей · '+new Date(snapshot.time).toLocaleString('ru-RU'):'Нет сохранённых полей';
}
function selection(){
 $('fillAll').disabled=busy||!snapshot;$('preparePrefill').disabled=busy||!snapshot;
 const all=[...$('fields').querySelectorAll('input:not(:disabled)')],n=all.filter(input=>input.checked).length;
 $('counts').textContent='Выбрано '+n+' из '+all.length;
 $('apply').textContent=n?'Заполнить выбранные поля ('+n+')':'Выберите поля для переноса';
 $('apply').disabled=busy||!n||!previewTab;
 $('replacePreview').disabled=busy||!$('replaceFind').value.length;
 $('replaceApply').disabled=busy||!replacementPreview?.ready;
 $('replaceApply').textContent=replacementPreview?.ready?'Применить замену ('+replacementPreview.ready+')':'Применить замену';
 $('replaceFindClear').disabled=busy||!$('replaceFind').value.length;
 $('replaceWithClear').disabled=busy||!$('replaceWith').value.length;
 $('prefillOpen').disabled=busy||!preparedPrefill;
 $('openNativePrefill').disabled=busy||!$('nativePrefillUrl').value.trim();
}
function action(id,fn){$(id).onclick=async()=>{
 if(busy)return;busy=true;document.querySelectorAll('button').forEach(button=>button.disabled=true);
 try{await fn();}catch(error){status(error.message,true);}
 finally{busy=false;document.querySelectorAll('button').forEach(button=>button.disabled=false);selection();}
};}
action('capture',async()=>{
 reset();const result=await page('capture');
 if(!result.data.length)throw Error('В открытых разделах поля не найдены. Раскройте нужные разделы и повторите сохранение.');
 snapshot={adapterVersion:'pyrus-dom-v3',url:result.url,time:Date.now(),fields:result.data,expandedGroups:result.sourceSections||[]};
 await storage.set({snapshot});await loadSource();
 const empty=result.data.filter(f=>f.kind==='pyrus-table'&&!f.value?.rows?.length).length;
 status('Поля сохранены. Перейдите в другую задачу того же шаблона.'+(empty?'\nТаблиц без прочитанных строк: '+empty+'. Если в них есть данные, дождитесь загрузки и сохраните поля заново.':''));
});
action('fillAll',async()=>{
 reset();await loadSource();if(!snapshot)throw Error('Сначала сохраните исходные поля.');
 const target=await page('preview',[snapshot.fields,$('overwrite').checked]);
 if(!target.recognized)throw Error('В черновике не распознаны поля. Раскройте нужные разделы и проверьте режим редактирования.');
 previewTab={id:target.tabId,url:target.url};
 let fast=null;
 if($('tryPrefill').checked)try{
  const candidate=await page('prefill',[snapshot.fields,$('overwrite').checked],target.tabId);
  if(!candidate.hasValues){
   const [bindings]=await chrome.scripting.executeScript({target:{tabId:target.tabId},world:'MAIN',func:pyrusPrefill.readBindings,args:[candidate.data,candidate.url]});
   const link=pyrusPrefill.buildLink(candidate.url,candidate.data,bindings?.result||[],snapshot.fields.length);
   if(link.url!==snapshot.url)fast=link;
  }
 }catch{}
 const result=await page('apply',[snapshot.fields,snapshot.fields.map(f=>f.key),$('overwrite').checked,snapshot.expandedGroups||[]],target.tabId,fast);
 if(result.queued)return;
 const ok=result.data.filter(r=>r.status==='dispatched').length,rest=result.data.filter(r=>r.status!=='dispatched');reset();
 status('Готово: '+ok+'. Пропущено или требует проверки: '+rest.length+'. Проверьте результат и сохраните задачу в Pyrus.'+(rest.length?'\n'+rest.map(r=>r.label+': '+r.message).join('\n'):''));
});
action('preview',async()=>{
 reset();await loadSource();if(!snapshot)throw Error('Сначала сохраните исходные поля.');
 const result=await page('preview',[snapshot.fields,$('overwrite').checked]);
 if(!result.recognized)throw Error('В целевой форме не распознаны поля. Раскройте нужные разделы и проверьте режим редактирования.');
 previewTab={id:result.tabId,url:result.url};
 for(const field of result.data){
  const label=document.createElement('label');label.className='field'+(field.reason&&!field.deferred?' blocked':'');
  const cb=document.createElement('input');cb.type='checkbox';cb.value=field.key;cb.disabled=Boolean(field.reason)&&!field.deferred;cb.checked=!cb.disabled;cb.onchange=selection;
  const detail=document.createElement('small');detail.textContent=field.deferred?(field.kind==='pyrus-table'?'Таблица будет проверена после загрузки строк и столбцов':'Ожидает появления после заполнения предыдущих полей'):field.reason||'Значение: '+JSON.stringify(field.value).slice(0,180);
  label.append(cb,document.createTextNode(' '+field.label),detail);label.dataset.label=field.label.toLocaleLowerCase('ru');$('fields').append(label);
 }
 $('search').value='';$('review').hidden=false;
 const ready=result.data.filter(f=>!f.reason||f.deferred).length,pending=result.data.filter(f=>f.deferred).length;
 status('Доступно для выбора: '+ready+' (ожидают появления: '+pending+'). Проверьте совпадение шаблонов.');
});
$('overwrite').onchange=()=>{reset();status('Настройка замены изменена. Нажмите «Заполнить черновик».');};
$('tryPrefill').onchange=()=>{prefillEdited=true;return storage.set({tryPrefill:$('tryPrefill').checked}).catch(()=>status('Не удалось сохранить настройку предзаполнения.',true));};
$('search').oninput=()=>{const query=$('search').value.trim().toLocaleLowerCase('ru');[...$('fields').children].forEach(row=>row.hidden=!row.dataset.label.includes(query));};
for(const [id,value] of [['selectAll',true],['selectNone',false]])action(id,async()=>{$('fields').querySelectorAll('input:not(:disabled)').forEach(input=>{if(!input.closest('label').hidden)input.checked=value;});});
action('apply',async()=>{
 const keys=[...$('fields').querySelectorAll('input:checked:not(:disabled)')].map(input=>input.value);
 if(!keys.length||!previewTab)throw Error('Повторите сопоставление и выберите поля.');
 const current=await page('preview',[snapshot.fields,$('overwrite').checked],previewTab.id);
 if(current.url!==previewTab.url)throw Error('Страница изменилась. Повторите сопоставление.');
 const result=await page('apply',[snapshot.fields,keys,$('overwrite').checked,snapshot.expandedGroups||[]],previewTab.id);
 if(result.queued)return;reset();status(result.data.map(r=>r.label+': '+r.message).join('\n'));
});
action('clear',async()=>{await storage.remove('snapshot');await loadSource();reset();status('Сохранённые поля удалены.');});
action('preparePrefill',async()=>{
 resetPrefill();await loadSource();if(!snapshot)throw Error('Сначала сохраните исходные поля.');
 const target=await page('prefill',[snapshot.fields,$('overwrite').checked]);
 const [response]=await chrome.scripting.executeScript({target:{tabId:target.tabId},world:'MAIN',func:pyrusPrefill.readBindings,args:[target.data,target.url]});
 preparedPrefill=pyrusPrefill.buildLink(target.url,target.data,response?.result||[],snapshot.fields.length);
 $('prefillUrl').value=preparedPrefill.url;$('prefillResult').hidden=false;
 $('prefillSummary').textContent='Подготовлено полей: '+preparedPrefill.fieldCount+'. Ячеек таблиц: '+preparedPrefill.cellCount+'.'+(preparedPrefill.skipped?' Для обычного переноса осталось полей: '+preparedPrefill.skipped+'.':'');
 status('Ссылка подготовлена. Откройте новый черновик, проверьте подстановку и при необходимости дополните его обычным переносом.');
});
action('prefillOpen',async()=>{if(!preparedPrefill)throw Error('Сначала подготовьте ссылку.');await chrome.tabs.create({url:preparedPrefill.url,active:true});window.close();});
$('nativePrefillUrl').oninput=selection;
action('openNativePrefill',async()=>{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 const origin=snapshot?new URL(snapshot.url).origin:new URL(tab?.url||'').origin;
 const parsed=pyrusPrefill.parseNativeLink($('nativePrefillUrl').value,origin);
 await chrome.tabs.create({url:parsed.url,active:true});window.close();
});
function invalidateReplacement(){replacementPreview=null;$('replaceApply').disabled=true;$('replaceResults').replaceChildren();$('replaceSummary').textContent='';selection();}
function saveReplacementDraft(){
 draftEdited=true;selection();
 return storage.set({replacementDraft:{find:$('replaceFind').value,replace:$('replaceWith').value,mode:replacementMode(),tab:replacementTabActive?'replacement':'transfer'}}).catch(()=>status('Не удалось сохранить настройки замены.',true));
}
for(const id of ['replaceFind','replaceWith']){
 $(id).oninput=()=>{invalidateReplacement();return saveReplacementDraft();};
 $(id).onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!$('replacePreview').disabled){event.preventDefault();$('replacePreview').click();}};
}
document.querySelectorAll('input[name="replaceMode"]').forEach(input=>input.onchange=()=>{invalidateReplacement();return saveReplacementDraft();});
for(const [button,input] of [['replaceFindClear','replaceFind'],['replaceWithClear','replaceWith']])$(button).onclick=async()=>{if(busy)return;$(input).value='';invalidateReplacement();await saveReplacementDraft();$(input).focus();};
function showTab(replacement){
 replacementTabActive=replacement;$('transferPanel').hidden=replacement;$('replacementPanel').hidden=!replacement;
 $('transferTab').setAttribute('aria-selected',String(!replacement));$('replacementTab').setAttribute('aria-selected',String(replacement));
 status(replacement?'Найдите совпадения и проверьте список изменений.':'Выберите действие переноса.');
}
$('transferTab').onclick=()=>{if(!busy){showTab(false);return saveReplacementDraft();}};
$('replacementTab').onclick=()=>{if(!busy){showTab(true);return saveReplacementDraft();}};
action('replaceClear',async()=>{
 draftEdited=true;$('replaceFind').value='';$('replaceWith').value='';setReplacementMode('exact');invalidateReplacement();
 await storage.remove('replacementDraft');$('replaceFind').focus();status('Настройки замены очищены.');
});
action('replacePreview',async()=>{
 invalidateReplacement();await saveReplacementDraft();
 const options={find:$('replaceFind').value,replace:$('replaceWith').value,mode:replacementMode()};
 if(!options.find)throw Error('Введите текст поиска.');
 const result=await page('replacePreview',[options]);replacementPreview={...result.data,tabId:result.tabId,url:result.url};
 $('replaceSummary').textContent='Найдено: '+result.data.items.length+' · Можно заменить: '+result.data.ready;
 for(const item of result.data.items){
  const row=document.createElement('div');row.className='replacement-item'+(item.reason?' is-blocked':'');
  const title=document.createElement('b');title.textContent=item.label;
  const values=document.createElement('div');values.className='replacement-values';
  for(const [caption,value] of [['Было',item.before],['Будет',item.after]]){
   const cell=document.createElement('div'),label=document.createElement('span'),text=document.createElement('pre');
   label.className='value-caption';label.textContent=caption;text.textContent=value===''?'Пустое значение':value;
   if(value==='')text.className='empty-value';cell.append(label,text);values.append(cell);
  }
  row.append(title,values);if(item.reason){const reason=document.createElement('small');reason.textContent=item.reason;row.append(reason);}$('replaceResults').append(row);
 }
 status(result.data.ready?'Проверьте список и примените замену.':'Нет доступных замен. Проверьте текст и раскройте нужные разделы формы.');
 $('replaceSummary').scrollIntoView?.({block:'start'});
});
action('replaceApply',async()=>{
 if(!replacementPreview?.ready)throw Error('Сначала найдите совпадения.');
 const preview=replacementPreview;invalidateReplacement();
 const result=await page('replaceApply',[preview.token,preview.url],preview.tabId);
 if(result.queued)return;
 const ok=result.data.filter(r=>r.status==='dispatched').length;
 status('Заменено: '+ok+'. Пропущено или требует проверки: '+(result.data.length-ok)+'. Проверьте форму и сохраните задачу в Pyrus.');
});
(async()=>{
 await storage.remove(['diagnostics','lastPage','lastPlan','catalogDiagnosticSalt']);
 const saved=await storage.get(['snapshot','replacementDraft','tryPrefill']);
 if(saved.snapshot&&Object.hasOwn(saved.snapshot,'sourceStructure')){delete saved.snapshot.sourceStructure;await storage.set({snapshot:saved.snapshot});}
 await loadSource();reset();
 if(!prefillEdited&&typeof saved.tryPrefill==='boolean')$('tryPrefill').checked=saved.tryPrefill;
 if(!draftEdited&&saved.replacementDraft){
  const draft=saved.replacementDraft;$('replaceFind').value=typeof draft.find==='string'?draft.find:'';$('replaceWith').value=typeof draft.replace==='string'?draft.replace:'';
  setReplacementMode(draft.mode);showTab(draft.tab==='replacement');
 }
 selection();
})().catch(error=>status(error.message,true));
