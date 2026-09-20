/* Hasnaria XLSX preload — single shared promise so Sales + Stock never load Excel parser twice */
(function(){
  'use strict';

  /* Pembelian ranking patch: keep Top Most/Fewest in sync with the selected period. */
  if(!document.getElementById('hasnaria-purchase-rankings-five-js')){
    var p=document.createElement('script');
    p.id='hasnaria-purchase-rankings-five-js';
    p.src='/purchase-rankings-five.js?v=1';
    p.async=true;
    document.head.appendChild(p);
  }

  /* Majoo exports may carry a stale worksheet dimension (for example A1:U4)
     even though real data extends farther. Repair !ref before sheet_to_json reads it. */
  if(!document.getElementById('hasnaria-purchase-majoo-range-fix-js')){
    var rf=document.createElement('script');
    rf.id='hasnaria-purchase-majoo-range-fix-js';
    rf.src='/purchase-majoo-range-fix.js?v=1';
    rf.async=true;
    document.head.appendChild(rf);
  }

  /* Pembelian dual-source import v2: Excel manual + Faktur Majoo + fuzzy cross-source dedup. */
  if(!document.getElementById('hasnaria-purchase-dual-source-css')){
    var l=document.createElement('link');
    l.id='hasnaria-purchase-dual-source-css';
    l.rel='stylesheet';
    l.href='/purchase-dual-source.css?v=1';
    document.head.appendChild(l);
  }
  if(!document.getElementById('hasnaria-purchase-dual-source-v2-js')){
    var d=document.createElement('script');
    d.id='hasnaria-purchase-dual-source-v2-js';
    d.src='/purchase-dual-source-v2.js?v=2';
    d.async=true;
    document.head.appendChild(d);
  }

  /* Pembelian chart redesign: larger trend chart + horizontal composition chart. */
  if(!document.getElementById('hasnaria-purchase-chart-redesign-js')){
    var c=document.createElement('script');
    c.id='hasnaria-purchase-chart-redesign-js';
    c.src='/purchase-chart-redesign.js?v=3';
    c.async=true;
    document.head.appendChild(c);
  }

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
