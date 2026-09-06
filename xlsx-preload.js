/* Hasnaria XLSX preload — single shared promise so Sales + Stock never load Excel parser twice */
(function(){
  'use strict';
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
