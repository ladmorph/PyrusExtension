(() => {
 if(globalThis.pyrusTransferRunner?.version===2)return;
 let running=false;
 globalThis.pyrusTransferRunner={version:2,start(execute,mode='transfer'){
  if(running)throw Error('Операция уже выполняется на этой странице.');
  running=true;
  const banner=document.createElement('div');banner.className='pyrus-operation-progress';
  banner.setAttribute('role','region');banner.setAttribute('aria-label','Ход операции Pyrus');
  banner.style.cssText='position:fixed;right:20px;top:20px;z-index:2147483647;width:380px;max-width:calc(100vw - 40px);box-sizing:border-box;background:#fff;color:#172b4d;padding:20px;border:1px solid #dce6ed;border-radius:18px;font:14px/1.5 Segoe UI,sans-serif;box-shadow:0 12px 48px #1235';
  const style=document.createElement('style');style.textContent='.pyrus-operation-progress .pyrus-progress-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#087f72,#35c1a1);transition:width .3s ease}.pyrus-operation-progress .pyrus-progress-track{height:9px;border-radius:99px;background:#e9f0f4;overflow:hidden;margin:14px 0 8px}.pyrus-operation-progress button{border:0;background:#eaf3f1;color:#086657;border-radius:8px;padding:7px 16px;margin-top:12px;cursor:pointer;font:600 13px Segoe UI,sans-serif}.pyrus-operation-progress details{max-height:220px;overflow:auto;font-size:12px;margin-top:8px}.pyrus-operation-progress summary{cursor:pointer}';
  const title=document.createElement('b');title.textContent=mode==='replacement'?'Замена значений':'Заполнение черновика';title.style.cssText='font-size:16px;display:block';
  const stage=document.createElement('div');stage.textContent='Ожидаю фокус страницы Pyrus…';stage.style.marginTop='6px';
  const track=document.createElement('div');track.className='pyrus-progress-track';track.setAttribute('role','progressbar');track.setAttribute('aria-label','Обработано полей');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
  const fill=document.createElement('div');fill.className='pyrus-progress-fill';fill.style.width='0%';track.append(fill);
  const count=document.createElement('div');count.style.cssText='font-size:12px;color:#617088';count.textContent='Подготовка…';
  const label=document.createElement('div');label.style.cssText='margin-top:8px;overflow-wrap:anywhere';
  const detail=document.createElement('div');detail.style.cssText='font-size:12px;color:#617088;white-space:pre-line';
  const hint=document.createElement('div');hint.style.cssText='font-size:12px;color:#617088;margin-top:10px';hint.textContent='Оставьте вкладку активной до завершения.';
  banner.append(style,title,stage,track,count,label,detail,hint);document.body.append(banner);
  let state={completed:0,total:null};const previousProgress=globalThis.pyrusProgress;
  const progress={update(next){
   state={...state,...next};
   if(next.stage!==undefined)stage.textContent=next.stage;if(next.label!==undefined)label.textContent=next.label;if(next.detail!==undefined)detail.textContent=next.detail;
   if(state.total!==null){const percent=state.total?Math.min(100,Math.max(0,Math.round(100*state.completed/state.total))):100;fill.style.width=percent+'%';track.setAttribute('aria-valuenow',String(percent));count.textContent=state.completed+' из '+state.total+' · '+percent+'%';}
  }};
  globalThis.pyrusProgress=progress;
  setTimeout(async()=>{
   try{
    const deadline=Date.now()+30000;
    while(!document.hasFocus()){if(Date.now()>deadline)throw Error('page-focus-timeout');await new Promise(resolve=>setTimeout(resolve,100));}
    progress.update({stage:'Подготовка формы'});const result=await execute();
    const ok=result.data.filter(row=>row.status==='dispatched').length,rest=result.data.filter(row=>row.status!=='dispatched');
    progress.update({completed:result.data.length,total:state.total??result.data.length,stage:(mode==='replacement'?'Заменено: ':'Готово: ')+ok+'. Пропущено или требует проверки: '+rest.length+'.',label:'',detail:''});
    title.textContent=rest.length?'Завершено с замечаниями':'Готово';
    if(rest.length){
     fill.style.background='#d69a25';
     const reasons={'replacement-value-changed':'Поле изменилось после поиска. Повторите поиск.','replacement-not-confirmed':'Pyrus не подтвердил новое значение. Проверьте поле.','replacement-option-changed':'Вариант списка изменился или недоступен.','replacement-page-changed':'Страница изменилась. Операция остановлена.','replacement-unsupported':'Замена для этого поля недоступна.','choice-option-not-found':'В списке нет точного варианта.','choice-ambiguous':'Найдено несколько одинаковых вариантов.','choice-popup-ambiguous':'Открыто несколько списков. Закройте лишние.','table-columns-missing':'В черновике отсутствуют нужные столбцы таблицы.','table-columns-ambiguous':'Не удалось однозначно сопоставить столбцы.','table-editor-unsupported':'Тип ячейки пока не поддерживается.','table-cell-not-confirmed':'Новое значение ячейки не подтверждено.','table-not-confirmed':'Проверьте значения таблицы.','table-extra-target-rows':'В целевой таблице есть дополнительные строки. Проверьте их вручную.'};
     const message=row=>(row.label||'Поле '+((row.sourceIndex??0)+1)).slice(0,140)+': '+(reasons[row.reason]||row.message||'Проверьте значение вручную.');
     detail.textContent=rest.slice(0,3).map(message).join('\n');
     if(rest.length>3){const more=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('div');summary.textContent='Ещё '+(rest.length-3)+' результатов';list.style.whiteSpace='pre-line';list.textContent=rest.slice(3).map(message).join('\n');more.append(summary,list);banner.append(more);}
    }
    hint.textContent='Проверьте результат и сохраните задачу в Pyrus.';
   }catch(error){
    title.textContent='Операция прервана';fill.style.background='#cf5260';stage.textContent=error.message==='page-focus-timeout'?'Не удалось дождаться фокуса страницы.':'Повторите поиск или заполнение.';
    label.textContent='';detail.textContent='';hint.textContent='Уже внесённые изменения остаются в форме. Проверьте их перед повторным запуском.';
   }finally{
    running=false;if(globalThis.pyrusProgress===progress)globalThis.pyrusProgress=previousProgress;
    const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>banner.remove();banner.append(close);
   }
  },100);
  return {queued:true};
 }};
})();
