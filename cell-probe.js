(() => {
  if(globalThis.pyrusCellProbe)return;
  let phase='idle',cell=null,report=null,banner=null,observer=null,timer=null,expiry=null,generation=0;
  const types=['pointerdown','mousedown','pointerup','mouseup','click','dblclick','focusin','focusout','keydown'];
  const visible=el=>Boolean(el?.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden';
  const describe=el=>el?.nodeType===1?{tag:el.tagName,classes:[...el.classList].slice(0,10),connected:el.isConnected,visible:visible(el),disabled:Boolean(el.disabled),readOnly:Boolean(el.readOnly)}:null;
  function state(){
    const input=cell?.querySelector('.cellRadioButton__input');
    const rect=input?.getBoundingClientRect();
    const hit=rect?document.elementFromPoint?.(rect.left+rect.width/2,rect.top+rect.height/2):null;
    const panels=[...document.querySelectorAll('.cellRadioButton__popuper')].filter(visible);
    return {documentFocused:document.hasFocus(),visibility:document.visibilityState,input:describe(input),active:describe(document.activeElement),hit:describe(hit),hitIsInput:hit===input,panelCount:panels.length,optionCount:panels.reduce((n,p)=>n+p.querySelectorAll('.dropdownList__control').length,0)};
  }
  function message(text){if(banner)banner.textContent=text;}
  function append(item){if(!report)return;if(report.events.length<80)report.events.push(item);else report.omitted++;}
  function cleanup(){types.forEach(t=>document.removeEventListener(t,handle,true));observer?.disconnect();observer=null;clearTimeout(timer);clearTimeout(expiry);banner?.remove();banner=null;}
  async function automatic(run){
    phase='automatic';message('Проверяю автоматическое открытие. Пока не нажимайте ячейку.');report.before=state();
    try{const opened=await globalThis.pyrusTransfer.openTableChoice({el:cell.querySelector('.cellRadioButton__input'),resolve:()=>cell?.querySelector('.cellRadioButton__input')});report.replacedEditors=opened.refreshed;}
    catch(e){report.automaticError=['TypeError','ReferenceError'].includes(e.name)?e.name:'OpenError';}
    await new Promise(resolve=>setTimeout(resolve,700));if(run!==generation)return;
    report.automatic=state();
    const input=cell?.querySelector('.cellRadioButton__input');
    input?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));input?.blur();
    phase='manual';message('Теперь откройте этот список вручную. Затем в расширении нажмите «Скачать сравнение ячейки». Значение выбирать необязательно.');
  }
  function handle(event){
    const target=event.target?.nodeType===1?event.target:null;if(!target||banner?.contains(target))return;
    if(phase==='select'){
      const candidate=target.closest('.formCell');if(!candidate?.querySelector('.cellRadioButton__input'))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(event.type==='click'){cell=candidate;phase='queued';message('Ячейка выбрана. Начинаю проверку…');const run=generation;setTimeout(()=>{if(run===generation)void automatic(run);},150);}
      return;
    }
    if(!['automatic','manual'].includes(phase)||!(cell?.contains(target)||target.closest('.cellRadioButton__popuper')))return;
    if(event.type==='keydown'&&!['Enter','Escape','F2','ArrowDown','ArrowUp','Tab'].includes(event.key))return;
    const entry={phase,type:event.type,trusted:event.isTrusted,target:describe(target),buttons:event.buttons??null,key:event.type==='keydown'?event.key:undefined};
    append(entry);queueMicrotask(()=>{entry.defaultPrevented=event.defaultPrevented;entry.after=state();});
  }
  globalThis.pyrusCellProbe={
    start(){cleanup();generation++;cell=null;phase='select';report={format:'pyrus-cell-comparison',schemaVersion:1,startedAt:new Date().toISOString(),previousTablePicker:globalThis.pyrusTableStatus?.picker||null,events:[],omitted:0};
      banner=document.createElement('div');banner.style.cssText='position:fixed;top:12px;right:12px;z-index:2147483647;max-width:420px;padding:16px;background:#163c46;color:white;font:14px sans-serif;border-radius:8px;box-shadow:0 3px 16px #0005';document.body.append(banner);
      message('Нажмите проблемную ячейку со списком. Первый щелчок только выберет её для диагностики.');
      types.forEach(t=>document.addEventListener(t,handle,true));
      observer=new MutationObserver(()=>{if(!cell||!['automatic','manual'].includes(phase))return;clearTimeout(timer);timer=setTimeout(()=>append({phase,type:'dom-update',after:state()}),100);});
      observer.observe(document.body,{subtree:true,childList:true,attributes:true});
      expiry=setTimeout(()=>{report.expired=true;phase='expired';generation++;cleanup();},180000);
      return {phase};
    },
    stop(){if(!report)return null;report.finishedPhase=phase;report.final=cell?state():null;generation++;cleanup();phase='stopped';return report;},
    discard(){generation++;cleanup();phase='idle';report=null;cell=null;return {cleared:true};}
  };
})();
