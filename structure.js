(() => {
  // Read DOM structure only. Never read textContent, innerHTML, values, IDs or URLs.
  const tags=new Set(['DIV','SPAN','INPUT','TEXTAREA','SELECT','OPTION','LABEL','BUTTON','A','FORM','SECTION','MAIN','ARTICLE','TABLE','THEAD','TFOOT','TBODY','TR','TD','TH','DETAILS','SUMMARY','IFRAME','UL','LI','SVG','PATH','HEADER','NAV','FOOTER','BODY','CANVAS']);
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
      const tableNodes=[...doc.querySelectorAll('table,thead,tbody,tr,th,td,.formCell,[role="grid"],[role="gridcell"],[role="cell"]')];
      const seeds=[...new Set([...popup,...panelNodes,...tableNodes.slice(0,60),...all])];
      // Dedicated component trees cannot be displaced by unrelated page controls.
      // Read structural metadata only, including selected-token wrappers and cell editors.
      function components(selector) {
        const roots=[...doc.querySelectorAll(selector)];
        return {total:roots.length,truncated:roots.length>30,items:roots.slice(0,30).map((root,index)=>{
          let remaining=1200,truncated=false;
          function walk(el,depth){
            if(remaining--<=0){truncated=true;return null;}
            const node=describe(el);
            if(depth>=40 && el.children.length){truncated=true;return {...node,children:[]};}
            const children=[];
            for(const child of el.children){if(remaining<=0){truncated=true;break;}children.push(walk(child,depth+1));}
            return {...node,children};
          }
          const tree=walk(root,0);
          return {index,truncated,tree};
        })};
      }
      // Scan the entire document, not just known editable-table wrappers. Read-only
      // tables may use different containers or render their rows in sibling layers.
      const globalCandidates=[...doc.querySelectorAll('table,thead,tbody,tfoot,tr,td,th,canvas,[role="table"],[role="grid"],[role="row"],[role="cell"],[role="gridcell"],[class]')].filter(el=>
        /^(TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|CANVAS)$/.test(el.tagName) || ['table','grid','row','cell','gridcell'].includes(el.getAttribute('role')) || [...el.classList].some(c=>/[Tt]able|[Gg]rid|[Cc]ell|(?:^|__)row|Row/.test(c)));
      const priority=el=>/^(TD|TH)$/.test(el.tagName)||['cell','gridcell'].includes(el.getAttribute('role'))?0:el.tagName==='TR'||el.getAttribute('role')==='row'?1:2;
      const selected=globalCandidates.map((el,index)=>({el,index})).sort((a,b)=>priority(a.el)-priority(b.el)||a.index-b.index).slice(0,600);
      const tableDiscovery={total:globalCandidates.length,truncated:globalCandidates.length>600,samples:selected.map(({el,index})=>{
        const ancestors=[];for(let p=el.parentElement;p&&ancestors.length<20;p=p.parentElement)ancestors.push(describe(p));
        return {index,element:describe(el),knownTableRef:el.closest?.('.viewTableFieldNew')?reference(el.closest('.viewTableFieldNew')):null,ancestors,
          children:[...el.children].slice(0,40).map(describe),childrenTruncated:el.children.length>40,
          siblings:[...(el.parentElement?.children||[])].slice(0,40).map(describe)};
      })};
      return {tableDiscovery,components:{tables:components('.viewTableFieldNew'),multiValue:components('.horizontalMultiInput')},total:seeds.length,truncated:seeds.length>140,samples:seeds.slice(0,140).map((el,index)=>{
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
