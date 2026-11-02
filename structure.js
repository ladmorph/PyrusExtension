(() => {
  // Read DOM structure only. Never read textContent, innerHTML, values, IDs or URLs.
  const tags=new Set(['DIV','SPAN','INPUT','TEXTAREA','SELECT','OPTION','LABEL','BUTTON','A','FORM','SECTION','MAIN','ARTICLE','TABLE','TBODY','TR','TD','TH','DETAILS','SUMMARY','IFRAME','UL','LI','SVG','PATH','HEADER','NAV','FOOTER','BODY']);
  const roles=new Set(['button','combobox','textbox','checkbox','radio','region','group','listbox','option','menu','navigation','dialog','tab','tabpanel','switch','row','cell','gridcell','grid','table']);
  globalThis.pyrusStructure = () => {
    let next=0;
    const refs=new WeakMap();
    const reference=el=>{if(!refs.has(el))refs.set(el,++next);return refs.get(el);};
    function describe(el) {
      if(!el || el.nodeType!==1)return null;
      const role=el.getAttribute('role');
      return {ref:reference(el),tag:tags.has(el.tagName)?el.tagName:'CUSTOM',
        classes:[...(el.classList||[])].filter(c=>/^[a-z_][a-z0-9_-]{0,79}$/i.test(c)).slice(0,16),
        attributeNames:[...el.attributes].map(a=>a.name).filter(n=>/^(data-[a-z0-9_-]+|aria-[a-z0-9_-]+|id|name|type|role|for|contenteditable|tabindex|disabled|readonly|open)$/i.test(n)).slice(0,24),
        role:roles.has(role)?role:null,
        expanded:['true','false'].includes(el.getAttribute('aria-expanded'))?el.getAttribute('aria-expanded'):null,
        inputType:el.tagName==='INPUT'?(['text','number','checkbox','radio','hidden','password','file','search','button','submit','email','tel','date'].includes(el.type)?el.type:'other'):null,
        visible:Boolean(el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden',
        childCount:el.children.length};
    }
    function samples(doc) {
      const all=[...doc.querySelectorAll('input,textarea,select,[contenteditable="true"],[aria-expanded],details>summary,.formFieldGroupTitle,.formFieldBaseWrapper__titleWrapper,[role="listbox"],[role="option"],[role="row"],.inputCompletion__popup,.completionTableMenuItem,.completionMenuItem')];
      const linked=[...new Set(all.flatMap(el=>['aria-owns','aria-controls'].flatMap(name=>(el.getAttribute(name)||'').split(/\s+/).filter(Boolean).map(id=>doc.getElementById(id)).filter(Boolean))))];
      const panelNodes=linked.flatMap(panel=>[panel,...panel.querySelectorAll('*')].slice(0,100));
      const popup=all.filter(el=>['listbox','option','row'].includes(el.getAttribute('role')) || el.matches?.('.inputCompletion__popup,.completionTableMenuItem,.completionMenuItem'));
      const seeds=[...new Set([...popup,...panelNodes,...all])];
      return {total:seeds.length,truncated:seeds.length>140,samples:seeds.slice(0,140).map((el,index)=>{
        const ancestors=[];let parent=el.parentElement;
        for(let i=0;parent&&i<7;i++,parent=parent.parentElement)ancestors.push(describe(parent));
        const ids=(el.getAttribute('aria-controls')||'').split(/\s+/).filter(Boolean);
        return {index,element:describe(el),ancestors,
          siblings:[...(el.parentElement?.children||[])].slice(0,24).map(describe),
          children:[...el.children].slice(0,24).map(describe),
          panels:ids.map(id=>describe(doc.getElementById(id))).filter(Boolean)};
      })};
    }
    const frames=[...document.querySelectorAll('iframe')].slice(0,10).map((el,index)=>{
      try {const doc=el.contentDocument;return doc?{index,accessible:true,...samples(doc)}:{index,accessible:false};}
      catch{return {index,accessible:false};}
    });
    return {format:'pyrus-dom-structure',schemaVersion:1,includesCssClasses:true,main:samples(document),frames};
  };
})();
