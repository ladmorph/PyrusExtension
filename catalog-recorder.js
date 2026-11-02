(() => {
  if(globalThis.pyrusCatalogRecorder)return;
  let running=false, salt='', events=[], pending=[], observer=null, timer=null, field=null, fieldIndex=-1;
  let refs=new WeakMap(), next=0, omitted=0, captured=0, startedAt=null;
  const visible=el=>Boolean(el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden';
  const ref=el=>{if(!refs.has(el))refs.set(el,++next);return refs.get(el);};
  async function signature(raw){
    const value=String(raw??'').normalize('NFKC').replace(/\s+/g,' ').trim();
    const result={empty:!value,length:value.length};
    if(value.length>2000){result.omitted=true;return result;}
    if(globalThis.crypto?.subtle){
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+'\0'+value));
      result.token=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }else result.tokenUnavailable=true;
    return result;
  }
  function describe(el){
    if(!el || el.nodeType!==1)return null;
    const secret=el.matches('input[type="password"],input[type="file"]');
    const data={ref:ref(el),tag:/^[A-Z]{1,12}$/.test(el.tagName)?el.tagName:'CUSTOM',classes:[...el.classList].filter(c=>/^[a-z_][a-z0-9_-]{0,79}$/i.test(c)).slice(0,20),visible:visible(el),attributes:[...el.attributes].map(a=>a.name).filter(n=>/^(data-|aria-)/.test(n)||['id','name','role','type','tabindex'].includes(n)).slice(0,30),childCount:el.children.length};
    // Raw strings exist only in these local promises. Only salted fingerprints leave the page.
    const samples=secret?{}:{text:el.textContent??'',...('value' in el && !['BUTTON','OPTION'].includes(el.tagName)?{value:el.value}:{}),...(el.hasAttribute('placeholder')?{placeholder:el.getAttribute('placeholder')}:{}),...(el.hasAttribute('aria-valuetext')?{ariaValueText:el.getAttribute('aria-valuetext')}:{})};
    const relations=['aria-controls','aria-owns','aria-activedescendant'].map(name=>({name,targets:(el.getAttribute(name)||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)).filter(Boolean).map(ref)})).filter(r=>r.targets.length);
    data.relations=relations;
    data.checked=['checkbox','radio'].includes(el.type)?el.checked:null;
    data.expanded=['true','false'].includes(el.getAttribute('aria-expanded'))?el.getAttribute('aria-expanded'):null;
    const role=el.getAttribute('role');data.role=['combobox','listbox','option','row','cell','gridcell','grid','table','dialog','button','textbox'].includes(role)?role:null;
    const attrs=secret?[]:[...el.attributes].filter(a=>/^(data-|aria-)/.test(a.name)||['id','name'].includes(a.name)).slice(0,20).map(a=>[a.name,a.value]);
    return Promise.all([
      Promise.all(Object.entries(samples).map(async([key,value])=>[key,await signature(value)])),
      Promise.all(attrs.map(async([key,value])=>[key,await signature(value)]))
    ]).then(([entries,attributes])=>({...data,signatures:Object.fromEntries(entries),attributeSignatures:Object.fromEntries(attributes)}));
  }
  function snapshot(kind,target,added=[]){
    if(!running)return;
    if(captured>=40){omitted++;return;}
    captured++;
    if(field && !field.isConnected)field=document.querySelectorAll('.formFieldBaseWrapper')[fieldIndex] || null;
    const roots=[target,field,...added.slice(0,4)].filter(el=>el?.nodeType===1);
    const nodes=new Set();
    for(const root of roots){
      let el=root;for(let i=0;el&&i<7;i++,el=el.parentElement)nodes.add(el);
      if(root===field || added.includes(root))for(const child of [...root.querySelectorAll('*')].slice(0,90))nodes.add(child);
    }
    // ARIA-owned popups can live outside the form subtree.
    for(const el of [...nodes])for(const name of ['aria-owns','aria-controls'])for(const id of (el.getAttribute(name)||'').split(/\s+/).filter(Boolean)){
      const panel=document.getElementById(id);if(panel){nodes.add(panel);[...panel.querySelectorAll('*')].slice(0,120).forEach(n=>nodes.add(n));}
    }
    const list=[...nodes].slice(0,180);
    const time=new Date().toISOString();
    const parentRefs=new Map(list.map(el=>[el,el.parentElement?ref(el.parentElement):null]));
    const targetRef=target?.nodeType===1?ref(target):null;
    const truncated=nodes.size>180;
    const task=Promise.all(list.map(async el=>({...await describe(el),parent:parentRefs.get(el)}))).then(nodes=>{events.push({time,kind,target:targetRef,truncated,nodes});}).catch(()=>{events.push({time,kind,error:'snapshot-failed'});});
    pending.push(task);
  }
  function handle(event){
    if(!running)return;
    const target=event.target?.nodeType===1?event.target:null;if(!target)return;
    const row=target.closest('.formFieldBaseWrapper');
    if(row?.querySelector('.formFieldCatalog__content,.formFieldCatalog__mainContent')){
      field=row;fieldIndex=[...document.querySelectorAll('.formFieldBaseWrapper')].indexOf(row);
    }
    if(!field)return;
    if(event.type==='keydown'&&!['Enter','Tab','ArrowDown','ArrowUp','Escape'].includes(event.key))return;
    snapshot(event.type==='keydown'?'key:'+event.key:event.type,target);
  }
  const types=['pointerdown','click','focusin','input','change','focusout','keydown'];
  async function stop(){
    running=false;clearTimeout(timer);observer?.disconnect();observer=null;
    types.forEach(type=>document.removeEventListener(type,handle,true));
    await Promise.all(pending);pending=[];
    return {format:'pyrus-catalog-recording',schemaVersion:1,startedAt,endedAt:new Date().toISOString(),running:false,omitted,includesRawValues:false,includesCssClasses:true,events:events.sort((a,b)=>a.time.localeCompare(b.time))};
  }
  globalThis.pyrusCatalogRecorder={
    start:async secretSalt=>{
      if(running)await stop();
      salt=secretSalt;events=[];pending=[];field=null;fieldIndex=-1;refs=new WeakMap();next=0;omitted=0;captured=0;startedAt=new Date().toISOString();running=true;
      types.forEach(type=>document.addEventListener(type,handle,true));
      observer=new MutationObserver(mutations=>{
        if(!field)return;
        const added=mutations.flatMap(m=>[...m.addedNodes]).filter(n=>n.nodeType===1);
        clearTimeout(timer);timer=setTimeout(()=>snapshot('dom-update',field,added),180);
      });
      observer.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
      return {running:true};
    },
    status:()=>({running,eventCount:captured,omitted}),
    stop,
    discard:async()=>{await stop();events=[];field=null;salt='';return {cleared:true};}
  };
})();
