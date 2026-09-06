/* Hasnaria sales-board multipart loader v42 — correct Majoo monetary units + shared XLSX loader */
(function () {
  'use strict';
  var PARTS = [
    '/sales-board.part0.js?v=41',
    '/sales-board.part1.js?v=41',
    '/sales-board.part2.js?v=41',
    '/sales-board.part3.js?v=41',
    '/sales-board.part4.js?v=41'
  ];
  function showError(msg) {
    var host=document.getElementById('sales');
    if(!host){console.error('Hasnaria sales-board load failed:',msg);return;}
    host.innerHTML='<div style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:12px 0;font-family:sans-serif;font-size:13px"><b>Dashboard Penjualan gagal dimuat.</b><br>Coba refresh halaman (tekan F5). Kalau masih gagal, screenshot pesan ini dan kirim ke admin:<br><code style="font-size:11px;word-break:break-all">'+String(msg)+'</code></div>';
  }
  function fail(e){console.error('Hasnaria sales-board load failed:',e);showError(e&&e.message?e.message:e);}
  function ensureSalesTab(){
    var tabs=document.getElementById('tabs');if(!tabs)return false;
    var btn=tabs.querySelector('[data-tab="sales"]');
    if(!btn){btn=document.createElement('button');btn.type='button';btn.className='tab';btn.setAttribute('data-tab','sales');btn.setAttribute('aria-label','Penjualan');btn.textContent='Penjualan';tabs.insertBefore(btn,tabs.firstChild?tabs.children[1]||null:null);}
    btn.style.display='';btn.textContent='Penjualan';
    btn.onclick=function(){
      ['dashboard','sales','ops','stok','shift','social','approval','team','sistem'].forEach(function(id){var el=document.getElementById(id);if(el)el.classList.toggle('hidden',id!=='sales');});
      tabs.querySelectorAll('.tab').forEach(function(b){b.classList.toggle('on',b===btn);});
      setTimeout(function(){if(typeof window.__hasnariaReloadSales==='function')window.__hasnariaReloadSales();},80);
    };
    return true;
  }
  function watchSalesTab(){var tries=0;function tick(){if(ensureSalesTab()||tries++>80)return;setTimeout(tick,100);}tick();try{var tabs=document.getElementById('tabs');if(tabs&&window.MutationObserver)new MutationObserver(function(){ensureSalesTab();}).observe(tabs,{childList:true});}catch(_){} }
  function patchSource(code){
    // 1) Never infer x1,000 for legitimate rupiah values below Rp10.000.
    code=code.replace(
      /function revenue\(v\) \{ var n=num\(v\); if\(n==null\) return null; return \(n>0 && n<10000\) \? n\*1000 : n; \}/,
      'function revenue(v) { var n=num(v); return n==null ? null : n; }'
    );
    // 2) Sales and Stock share the same XLSX parser promise. This removes the
    // duplicate CDN load/race that made Excel uploads feel slow on first use.
    code=code.replace(
      "async function ensureXLSX() {\n    if (window.XLSX) return;",
      "async function ensureXLSX() {\n    if (window.XLSX) return;\n    if (window.__HASNARIA_XLSX_READY) { await window.__HASNARIA_XLSX_READY; if (window.XLSX) return; }"
    );
    return code;
  }
  Promise.all(PARTS.map(function(u){return fetch(u,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(u+' HTTP '+r.status);return r.text();});}))
    .then(function(chunks){
      var code=chunks.join('');
      if(code.indexOf('Hasnaria Sales')<0)throw new Error('reassembled sales-board looks empty');
      code=patchSource(code);
      var s=document.createElement('script');s.text=code;document.head.appendChild(s);watchSalesTab();
    }).catch(fail);
})();
