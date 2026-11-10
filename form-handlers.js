// Passed directly to chrome.scripting in MAIN. Keep all dependencies inside the
// function: it only inspects descriptors, never calls page methods or getters.
function inspectPyrusFormHandlers(){
  const bulk=new Set(['setValues','setFieldValues','setFields','setFormValues','setFormData','setFormFields','setFieldsValue','setFieldsValues','updateFields','updateValues','updateFormValues','updateFormData','updateFormFields','replaceFields','onFieldsChange','onFieldsChanged','onValuesChange','onValuesChanged','onFormChange','onFormDataChange','onFormFieldsChange','onFormValuesChange','onChangeFields','onChangeValues','handleFieldsChange','handleValuesChange','handleFormChange','handleChangeFields','handleChangeValues','changeFields','changeFieldValues','onFieldValuesChange','onDataChange','onTableChange','setRows','onRowsChange','updateRows']);
  const single=new Set(['setValue','setFieldValue','updateField','updateValue','onFieldChange','onChangeField','onChange','onValueChange','onFieldValueChange','handleChange','handleFieldChange']);
  const collections=['fields','values','formFields','formValues','formData','rows'];
  const bridges=['model','formModel','form','controller','formController','actions'];
  const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
  const descriptor=(owner,key)=>{if(object(owner))try{return Object.getOwnPropertyDescriptor(owner,key);}catch{}};
  const own=(owner,key)=>{const entry=descriptor(owner,key);return entry&&'value'in entry?entry.value:undefined;};
  const visible=el=>{
    if(!el.getClientRects().length)return false;
    const style=getComputedStyle(el);return !el.hidden&&style.display!=='none'&&style.visibility!=='hidden';
  };
  const scopeSelector='.formView,.formFieldBaseWrapper,.viewTableFieldNew';
  const pageScopes=[...document.querySelectorAll(scopeSelector)];
  const hasForm=el=>el.matches(scopeSelector)||el.querySelector(scopeSelector);
  const dialogs=[...document.querySelectorAll('[role="dialog"],dialog')].filter(el=>visible(el)&&hasForm(el));
  const forms=[...document.querySelectorAll('.formView')].filter(visible);
  const active=document.activeElement;
  const focused=active?.matches('input:not([type="hidden"]):not([type="password"]):not([type="file"]),textarea,select,[contenteditable="true"]')&&active.closest(scopeSelector)?active:null;
  let root=document,selection='document';
  if(focused&&(!dialogs.length||dialogs.some(dialog=>dialog.contains(focused)))){
    const dialog=focused.closest('[role="dialog"],dialog'),form=focused.closest('.formView');
    if(form&&(!dialog||dialog.contains(form))){root=form;selection='focused-form';}
    else if(dialog){root=dialog;selection='focused-dialog';}
    else{root=focused.closest(scopeSelector);selection='focused-field';}
  }else if(dialogs.length){root=dialogs[dialogs.length-1];selection='visible-dialog';}
  else if(forms.length===1){root=forms[0];selection='single-form';}
  const scopes=[...(root.matches?.(scopeSelector)?[root]:[]),...root.querySelectorAll(scopeSelector)].filter(visible);
  const limits={scopes:48,depth:160,owners:1200,candidates:120};
  const reasons=new Set(),markLimit=reason=>{reasons.add(reason);report.limited=true;report.limitReasons=[...reasons];};
  const report={format:'pyrus-form-handlers',schemaVersion:2,inspectionOnly:true,pageScopeCount:pageScopes.length,scopeCount:scopes.length,anchorCount:0,reactAnchors:0,vueAnchors:0,ownersInspected:0,limited:false,limitReasons:[],limits,needsFocus:selection==='document'&&(forms.length>1||scopes.length>limits.scopes),context:{selection,visibleDialogs:dialogs.length,visibleForms:forms.length,focusedControl:Boolean(focused&&root.contains(focused))},bulkCandidateCount:0,candidates:[]};
  if(report.needsFocus)return report;
  if(scopes.length>limits.scopes)markLimit('scopes');
  // Cover the whole chosen form, including late tables. A popup appended after
  // a large completed task must never be lost behind the first page controls.
  const sampled=scopes.length<=limits.scopes?scopes:Array.from({length:limits.scopes},(_,i)=>scopes[Math.round(i*(scopes.length-1)/(limits.scopes-1))]);
  const anchors=[...new Set([...(root!==document?[root]:[]),...(focused&&root.contains(focused)?[focused]:[]),...sampled.flatMap(scope=>[scope,scope.querySelector('input,textarea,select,[contenteditable],.formCell')])].filter(Boolean))];
  report.anchorCount=anchors.length;
  const seenOwners=new WeakSet(),seenComponents=new WeakSet();
  function inspect(owner,framework,anchorIndex,depth,container,bridgeDepth=0){
    if(!object(owner)||seenOwners.has(owner))return;
    if(report.ownersInspected>=limits.owners){markLimit('owners');return;}
    seenOwners.add(owner);report.ownersInspected++;
    const methods=new Set(),resolved=new Set();let level=owner;
    for(let n=0;n<4&&object(level);n++){
      for(const name of [...bulk,...single]){
        if(resolved.has(name))continue;
        const entry=descriptor(level,name);if(!entry)continue;resolved.add(name);
        if('value'in entry&&typeof entry.value==='function')methods.add(name);
      }
      try{level=Object.getPrototypeOf(level);}catch{break;}
    }
    if(methods.size){
      const bulkMethods=[...methods].filter(name=>bulk.has(name));
      if(bulkMethods.length)report.bulkCandidateCount++;
      let slot=report.candidates.length;
      if(slot>=limits.candidates){
        markLimit('candidates');slot=bulkMethods.length?report.candidates.findIndex(candidate=>!candidate.bulkMethods.length):-1;
      }
      if(slot>=0){
        // Only fixed protocol names and collection sizes leave the page.
        // Do not enumerate user keys, collection members or field values.
        const data=collections.flatMap(name=>{
          const value=own(owner,name);
          return Array.isArray(value)?[{name,kind:'array',length:own(value,'length')}]:value&&typeof value==='object'?[{name,kind:'object'}]:[];
        });
        report.candidates[slot]={framework,anchorIndex,depth,container,bulkMethods,singleMethods:[...methods].filter(name=>single.has(name)),collections:data};
      }
    }
    if(bridgeDepth<2)for(const key of bridges)inspect(own(owner,key),framework,anchorIndex,depth,container+'.'+key,bridgeDepth+1);
  }
  function walk(component,framework,anchorIndex){
    const chain=[],path=new WeakSet();
    while(object(component)&&chain.length<limits.depth){
      if(path.has(component)){markLimit('cycle');component=null;break;}
      path.add(component);chain.push(component);
      component=framework==='react'?own(component,'return'):own(component,'parent')||own(component,'$parent');
    }
    if(object(component))markLimit('depth');
    // Inspect shared form owners before leaf editors consume the budget. Seen
    // components skip inspection only, never traversal to unvisited ancestors.
    for(let depth=chain.length-1;depth>=0;depth--){
      const current=chain[depth];if(seenComponents.has(current))continue;seenComponents.add(current);
      if(report.ownersInspected>=limits.owners){markLimit('owners');return;}
      if(framework==='react'){
        inspect(own(current,'memoizedProps'),framework,anchorIndex,depth,'props');
        const instance=own(current,'stateNode');
        if(object(instance)&&!(instance instanceof Node)){
          inspect(instance,framework,anchorIndex,depth,'instance');
          inspect(own(instance,'props'),framework,anchorIndex,depth,'instance-props');
        }
      }else{
        for(const key of ['props','setupState','exposed','ctx'])inspect(own(current,key),framework,anchorIndex,depth,key);
        const options=own(current,'$options');inspect(own(options,'methods'),framework,anchorIndex,depth,'methods');
      }
    }
  }
  anchors.forEach((anchor,index)=>{
    let names=[];try{names=Object.getOwnPropertyNames(anchor);}catch{return;}
    let react=false,vue=false;
    for(const name of names){
      if(/^__react(?:Fiber|InternalInstance|Container)\$/.test(name)){react=true;walk(own(anchor,name),'react',index);}
      if(/^__reactProps\$/.test(name)){react=true;inspect(own(anchor,name),'react',index,0,'host-props');}
      if(name==='__vueParentComponent'||name==='__vue__'){vue=true;walk(own(anchor,name),'vue',index);}
    }
    if(react)report.reactAnchors++;if(vue)report.vueAnchors++;
  });
  return report;
}
