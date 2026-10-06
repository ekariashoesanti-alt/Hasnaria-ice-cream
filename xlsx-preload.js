/* Hasnaria XLSX preload — single shared promise so Sales + Stock never load Excel parser twice */
(function(){
  'use strict';

  /* Majoo exports may carry a stale worksheet dimension (for example A1:U4)
     even though real data extends farther. Repair !ref before sheet_to_json reads it. */
  if(!document.getElementById('hasnaria-purchase-majoo-range-fix-js')){
    var rf=document.createElement('script');
    rf.id='hasnaria-purchase-majoo-range-fix-js';
    rf.src='/purchase-majoo-range-fix.js?v=1';
    rf.async=true;
    document.head.appendChild(rf);
  }

  /* Pembelian dual-source styling. */
  if(!document.getElementById('hasnaria-purchase-dual-source-css')){
    var l=document.createElement('link');
    l.id='hasnaria-purchase-dual-source-css';
    l.rel='stylesheet';
    l.href='/purchase-dual-source.css?v=1';
    document.head.appendChild(l);
  }

  /* IMPORTANT: legacy RENCANA BELANJA safe merge must register its capture
     handler before dual-source v2 attaches the normal input onchange handler.
     Otherwise a race can send the same workbook through the old destructive
     rebuild path first. */
  function loadDualSourceV2(){
    if(document.getElementById('hasnaria-purchase-dual-source-v2-js'))return;
    var d=document.createElement('script');
    d.id='hasnaria-purchase-dual-source-v2-js';
    d.src='/purchase-dual-source-v2.js?v=3';
    d.async=true;
    document.head.appendChild(d);
  }

  if(!document.getElementById('hasnaria-purchase-excel-safe-merge-v3-js')){
    var sm=document.createElement('script');
    sm.id='hasnaria-purchase-excel-safe-merge-v3-js';
    sm.src='/purchase-excel-safe-merge-v3.js?v=3';
    sm.async=true;
    sm.onload=loadDualSourceV2;
    sm.onerror=function(){console.error('Safe merge Pembelian gagal dimuat; memuat fallback dual-source.');loadDualSourceV2();};
    document.head.appendChild(sm);
  }else{
    loadDualSourceV2();
  }

  /* Canonical Purchase source: value → expense journal, quantity → Stock. */
  if(!document.getElementById('hasnaria-purchase-finance-alignment-css')){
    var afc=document.createElement('link');
    afc.id='hasnaria-purchase-finance-alignment-css';
    afc.rel='stylesheet';
    afc.href='/purchase-finance-alignment-v1.css?v=5';
    document.head.appendChild(afc);
  }
  if(!document.getElementById('hasnaria-purchase-finance-alignment-js')){
    var af=document.createElement('script');
    af.id='hasnaria-purchase-finance-alignment-js';
    af.src='/purchase-finance-alignment-v1.js?v=10';
    af.async=true;
    document.head.appendChild(af);
  }

  /* Owner Finance/Stock is intentionally NOT loaded here.
     owner-shell-guard owns that runtime so legacy and v4 renderers cannot race. */

  if (window.XLSX) { window.__HASNARIA_XLSX_READY = Promise.resolve(window.XLSX); return; }
  if (window.__HASNARIA_XLSX_READY) return;
  window.__HASNARIA_XLSX_READY = new Promise(function(resolve,reject){
    var s=document.createElement('script');
    s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.async=true;
    s.onload=function(){
      if(window.XLSX) resolve(window.XLSX);
      else reject(new Error('Parser Excel tidak tersedia.'));
    };
    s.onerror=function(){reject(new Error('Gagal memuat parser Excel.'));};
    document.head.appendChild(s);
  });
})();