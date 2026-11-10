// Passed directly to chrome.scripting in MAIN. Keep all dependencies inside the
// function: it only inspects descriptors, never calls page methods or getters.
function inspectPyrusFormHandlers(){
  const bulk=new Set(['setValues','setFieldValues','setFields','setFormValues','setFormData','updateFields','updateValues','updateFormValues','replaceFields','onFieldsChange','onValuesChange','onFormChange','onFormDataChange','handleFieldsChange','handleValuesChange','handleFormChange','changeFields','onDataChange','onTableChange','setRows','onRowsChange','updateRows']);
  const single=new Set(['setValue','setFieldValue','updateField','updateValue','onFieldChange','onChange','onValueChange','handleChange','handleFieldChange']);
  const collections=['fields','values','formFields','formValues','formData','rows'];
  const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
  const own=(owner,key)=>{
    if(!object(owner))return;
    try{const descriptor=Object.getOwnPropertyDescriptor(owner,key);return descriptor&&'value'in descriptor?descriptor.value:undefined;}catch{}
  };
  const scopes=[...document.querySelectorAll('.formView,.formFieldBaseWrapper,.viewTableFieldNew')];
  const anchors=[...new Set(scopes.slice(0,32).flatMap(scope=>[scope,scope.querySelector('input,textarea,select,[contenteditable],.formCell')]).filter(Boolean))];
  const report={format:'pyrus-form-handlers',schemaVersion:1,inspectionOnly:true,scopeCount:scopes.length,anchorCount:anchors.length,reactAnchors:0,vueAnchors:0,ownersInspected:0,limited:scopes.length>32,bulkCandidateCount:0,candidates:[]};
  const seenOwners=new WeakSet(),seenComponents=new WeakSet();
  function inspect(owner,framework,anchorIndex,depth,container){
    if(!object(owner)||seenOwners.has(owner))return;
    if(report.ownersInspected>=300){report.limited=true;return;}
    seenOwners.add(owner);report.ownersInspected++;
    const methods=new Set();let level=owner;
    for(let n=0;n<4&&object(level);n++){
      for(const name of [...bulk,...single])if(typeof own(level,name)==='function')methods.add(name);
      try{level=Object.getPrototypeOf(level);}catch{break;}
    }
    if(!methods.size)return;
    if(report.candidates.length>=80){report.limited=true;return;}
    // Only fixed protocol names and collection sizes leave the page. Never
    // enumerate user data keys, inspect collection members or serialize values.
    const data=collections.flatMap(name=>{
      const value=own(owner,name);
      return Array.isArray(value)?[{name,kind:'array',length:own(value,'length')}]:value&&typeof value==='object'?[{name,kind:'object'}]:[];
    });
    const bulkMethods=[...methods].filter(name=>bulk.has(name));
    if(bulkMethods.length)report.bulkCandidateCount++;
    report.candidates.push({framework,anchorIndex,depth,container,bulkMethods,singleMethods:[...methods].filter(name=>single.has(name)),collections:data});
  }
  function walk(component,framework,anchorIndex){
    let depth=0;
    for(;object(component)&&depth<32;depth++){
      if(seenComponents.has(component))return;
      seenComponents.add(component);
      if(report.ownersInspected>=300){report.limited=true;return;}
      if(framework==='react'){
        inspect(own(component,'memoizedProps'),framework,anchorIndex,depth,'props');
        const instance=own(component,'stateNode');
        inspect(instance,framework,anchorIndex,depth,'instance');
        inspect(own(instance,'props'),framework,anchorIndex,depth,'instance-props');
        component=own(component,'return');
      }else{
        for(const key of ['props','setupState','exposed','ctx'])inspect(own(component,key),framework,anchorIndex,depth,key);
        const options=own(component,'$options');inspect(own(options,'methods'),framework,anchorIndex,depth,'methods');
        component=own(component,'parent')||own(component,'$parent');
      }
    }
    if(object(component))report.limited=true;
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
