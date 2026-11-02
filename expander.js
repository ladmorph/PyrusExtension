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
  globalThis.pyrusExpand = {
    inspect: () => ({eligibleCollapsed:candidates().length,totalCollapsedMarkers:document.querySelectorAll('details:not([open]) > summary,[aria-expanded="false"],.formFieldGroupTitle:not(.formFieldGroupTitle_expanded)').length}),
    run: async (options={}) => {
      const started=Date.now(), attempted=new WeakSet();
      const normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').replace(/\s*\*\s*$/,'').trim();
      const relevant=()=>candidates().filter(el=>!Array.isArray(options.groupTitles) || !el.matches?.('.formFieldGroupTitle') || options.groupTitles.includes(normalize(el.querySelector('.formFieldTitle__textValue')?.textContent || el.textContent)));
      const report={eligibleBefore:relevant().length,clicked:0,confirmedOpen:0,errors:0,remaining:0,limited:false};
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
      if(report.remaining)report.limited=true;
      report.elapsedMs=Date.now()-started;
      return report;
    }
  };
})();
