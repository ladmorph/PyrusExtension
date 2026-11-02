(() => {
  const fieldScope = '.formFieldBaseWrapper,.formField,[data-field-id],[data-fieldid],.form-field,.field-row,.form-group,form';
  const collapsedSelector='details:not([open]) > summary,[aria-expanded="false"][aria-controls],.formFieldGroupTitle:not(.formFieldGroupTitle_expanded)';
  function candidates() {
    return [...document.querySelectorAll(collapsedSelector)].filter(el => {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden' || el.disabled) return false;
      if (el.closest('nav,header,footer,[role="navigation"],[role="dialog"],[role="menu"],[role="listbox"]')) return false;
      if (!el.closest(fieldScope)) return false;
      if(el.matches?.('.formFieldGroupTitle'))return !el.classList.contains('formFieldGroupTitle_expanded');
      if (el.tagName === 'SUMMARY') return true;
      if (!['BUTTON','DIV','SPAN','A'].includes(el.tagName)) return false;
      if (el.tagName === 'BUTTON' && el.type !== 'button') return false;
      if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href') !== '#') return false;
      const role = el.getAttribute('role');
      if (role && role !== 'button') return false;
      const ids = (el.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean);
      return ids.some(id => {
        const panel = document.getElementById(id);
        if (!panel || ['listbox','menu','tree','dialog'].includes(panel.getAttribute('role'))) return false;
        return Boolean(panel.querySelector('input,textarea,select,[contenteditable="true"],[data-field-id],[data-fieldid],.form-field,.field-row,.form-group')) || panel.getAttribute('role') === 'region';
      });
    });
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  const titleText=el=>String(el.querySelector('.formFieldTitle__textValue')?.textContent || el.textContent || '').normalize('NFKC').replace(/\s+/g,' ').replace(/\s*\*\s*$/,'').trim();
  globalThis.pyrusExpand = {
    openedTitles:()=>[...new Set([...document.querySelectorAll('.formFieldGroupTitle_expanded')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(titleText).filter(Boolean))],
    inspect: () => ({eligibleCollapsed:candidates().length,totalCollapsedMarkers:document.querySelectorAll('details:not([open]) > summary,[aria-expanded="false"],.formFieldGroupTitle:not(.formFieldGroupTitle_expanded)').length}),
    run: async (options={}) => {
      const started=Date.now(), attempted=new WeakSet();
      const normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').replace(/\s*\*\s*$/,'').trim();
      const fields=options.fields || [];
      const paths=fields.flatMap(f=>f.groups || []);
      // Old snapshots may lack field paths. Their source sections are hints, never
      // permission to expand the entire draft when no matching title is found.
      const allowed=[...new Set([...paths,...(paths.length?[]:options.groupTitles || [])].map(normalize).filter(Boolean))];
      const selective=options.groupTitles!==undefined || options.fields!==undefined;
      function needed(el){
        if(!selective)return true;
        if(allowed.includes(titleText(el)))return true;
        const scope=el.closest('.viewTableFieldNew') || el.closest('.formFieldGroup,details') || el.closest('.formFieldBaseWrapper,.formField');
        if(!scope)return false;
        // A hidden child may already exist in the DOM. Open its ancestors without
        // opening unrelated siblings, even if the source had no group metadata.
        return [...scope.querySelectorAll('.formFieldGroupTitle,.formFieldBaseWrapper__titleWrapper')].some(title=>{
          if(title.matches('.formFieldGroupTitle'))return title!==el && title.closest('.formFieldGroup,.formFieldBaseWrapper,.formField')!==scope && allowed.includes(titleText(title));
          const label=titleText(title);
          return fields.some(f=>normalize(f.label)===label);
        });
      }
      const relevant=()=>candidates().filter(needed);
      const report={eligibleBefore:relevant().length,totalEligibleBefore:candidates().length,requestedTitleCount:allowed.length,mode:selective?'selected-target-groups':'all-target-groups',clicked:0,confirmedOpen:0,errors:0,remaining:0,limited:false};
      if(!report.eligibleBefore){
        report.unmatchedTitleCount=allowed.filter(name=>![...document.querySelectorAll('.formFieldGroupTitle')].some(el=>titleText(el)===name)).length;
        report.unrelatedCollapsed=candidates().length;report.elapsedMs=Date.now()-started;
        return report;
      }
      // Several passes discover nested sections that mount after a parent opens.
      for(let pass=0;pass<8;pass++) {
        const pending=relevant().filter(el=>!attempted.has(el));
        if(!pending.length){await pause(250);if(!relevant().some(el=>!attempted.has(el)))break;continue;}
        for(const el of pending){
          if(report.clicked>=100 || Date.now()-started>8000){report.limited=true;break;}
          attempted.add(el);
          // Recheck: opening a parent can change another candidate's state.
          if(!el.isConnected || !relevant().includes(el))continue;
          try {
            el.click();report.clicked++;await pause(60);
            if(el.matches?.('.formFieldGroupTitle') ? el.classList.contains('formFieldGroupTitle_expanded') : el.tagName==='SUMMARY' ? el.parentElement.open : el.getAttribute('aria-expanded')==='true')report.confirmedOpen++;
          }catch{report.errors++;}
        }
        if(report.limited)break;
        await pause(250);
      }
      await pause(350);
      report.remaining=relevant().length;
      report.unmatchedTitleCount=allowed.filter(name=>![...document.querySelectorAll('.formFieldGroupTitle')].some(el=>titleText(el)===name)).length;
      report.unrelatedCollapsed=candidates().length-report.remaining;
      if(report.remaining)report.limited=true;
      report.elapsedMs=Date.now()-started;
      return report;
    }
  };
})();
