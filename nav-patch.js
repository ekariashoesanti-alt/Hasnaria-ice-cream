(function () {
  'use strict';
  var LABELS = { dashboard: 'Hari ini', sales: 'Penjualan', ops: 'Keuangan', stok: 'Stok', shift: 'HR', social: 'Medsos' };
  function moveNav() {
    var app = document.getElementById('app'); var header = app && app.querySelector('header'); var head = header && header.querySelector('.head'); var tabs = document.getElementById('tabs');
    if (!head || !tabs) return;
    if (tabs.parentElement !== head) head.insertBefore(tabs, head.querySelector('.user-box') || null);
    tabs.classList.add('hasnaria-header-nav');
  }
  function styleButtons() {
    var tabs = document.getElementById('tabs'); if (!tabs) return;
    Array.prototype.forEach.call(tabs.querySelectorAll('.tab'), function (button) {
      var id = button.getAttribute('data-tab'); var label = LABELS[id];
      if (label) { if (button.textContent !== label) button.textContent = label; button.setAttribute('aria-label', label); button.style.display = ''; }
      else button.style.display = 'none';
    });
  }
  function syncGroupedContent() {
    var active = document.querySelector('#tabs .tab.on'); var id = active && active.getAttribute('data-tab');
    var team = document.getElementById('team'); var approval = document.getElementById('approval');
    if (id === 'shift') { if (team) team.classList.remove('hidden'); if (approval) approval.classList.add('hidden'); }
    else if (id === 'ops') { if (approval) approval.classList.remove('hidden'); if (team) team.classList.add('hidden'); }
    else { if (approval) approval.classList.add('hidden'); if (team) team.classList.add('hidden'); }
  }
  function injectStyle() {
    if (document.getElementById('hasnaria-tesla-nav-style')) return;
    var style = document.createElement('style'); style.id = 'hasnaria-tesla-nav-style';
    style.textContent = `
      #app > header { position: sticky; top: 0; z-index: 1000; background: #176955; color: #fff; border-bottom: 1px solid rgba(255,255,255,.12); box-shadow: 0 1px 8px rgba(0,0,0,.08); }
      #app > header .head { width: 100%; max-width: 1440px; min-height: 72px; padding: 8px 24px; margin: 0 auto; display: grid; grid-template-columns: 190px minmax(0,1fr) 230px; align-items: center; gap: 20px; flex-wrap: nowrap; box-sizing: border-box; }
      #app > header .head > div:first-child { grid-column: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-start; align-self: center; }
      #app > header .brand-logo { display: block; height: 46px; max-width: 160px; width: auto; object-fit: contain; object-position: left center; }
      #app > header .tagline { display: none; }
      #app > header .hasnaria-header-nav { grid-column: 2; display: flex; justify-content: center; align-items: center; gap: 2px; margin: 0; overflow: visible; min-width: 0; }
      #app > header .hasnaria-header-nav .tab { min-height: 40px; padding: 8px 14px; border-radius: 4px; background: transparent; color: #fff; font-size: 14px; font-weight: 600; line-height: 1.2; white-space: nowrap; transition: background-color .2s ease, color .2s ease; }
      #app > header .hasnaria-header-nav .tab:hover, #app > header .hasnaria-header-nav .tab.on { background: rgba(255,255,255,.16); color: #fff; }
      #app > header .user-box { grid-column: 3; justify-self: end; display: flex; align-items: center; gap: 10px; }
      #app > header .user-info { text-align: right; }
      #app > header .user-info #whoName { color: #fff; font-size: 13px; font-weight: 600; }
      #app > header .user-info #whoMeta { color: rgba(255,255,255,.72); font-size: 11px; }
      #app > header #logoutBtn { min-height: 36px; padding: 7px 13px; border: 1px solid rgba(255,255,255,.22); border-radius: 4px; background: rgba(255,255,255,.12); color: #fff; font-size: 13px; font-weight: 600; }
      #app > main.wrap { max-width: 1200px; padding-top: 18px; }

      /* Penjualan: dipadatkan agar dashboard utuh dan nyaman pada browser zoom 100%. */
      #sales .sb-wrap { padding: 14px 16px 16px; margin-bottom: 10px; border-radius: 14px; }
      #sales .sb-head { gap: 10px; }
      #sales .sb-head h2 { font-size: 20px; margin: 2px 0; }
      #sales .sb-head p { font-size: 11px; }
      #sales .sb-eyebrow { font-size: 10px; }
      #sales .sb-actions { gap: 6px; }
      #sales .sb-upload, #sales .sb-help { min-height: 36px; font-size: 12px; padding-left: 11px; padding-right: 11px; }
      #sales .sb-period { margin-top: 10px; gap: 8px; }
      #sales .sb-cal { gap: 7px; }
      #sales .sb-cal label { font-size: 11px; }
      #sales .sb-cal select, #sales .sb-cal input[type=date] { min-height: 32px; padding: 3px 7px; font-size: 11px; }
      #sales .sb-period span { font-size: 10px; }
      #sales .sb-toggle button { min-height: 30px; padding: 0 10px; font-size: 11px; }
      #sales .sb-kpis { gap: 8px; margin-top: 10px; }
      #sales .sb-kpi { padding: 10px 11px; border-radius: 11px; }
      #sales .sb-kpi-label { font-size: 10px; }
      #sales .sb-kpi-value { font-size: 18px; margin-top: 2px; }
      #sales .sb-kpi-sub { font-size: 10px; margin-top: 3px; }
      #sales .sb-grid-main { gap: 10px; margin-top: 10px; }
      #sales .sb-card { padding: 11px 12px; border-radius: 11px; }
      #sales .sb-card h3 { font-size: 14px; }
      #sales .sb-card-head span { font-size: 10px; }
      #sales .sb-chart { margin-top: 4px; }
      #sales .sb-bars { margin-top: 6px; }
      #sales .sb-bar-row { margin: 8px 0; }
      #sales .sb-bar-label { font-size: 11px; }
      #sales .sb-bar-track { height: 7px; margin-top: 5px; }
      #sales .sb-import-copy { margin-top: 6px; padding: 8px 10px; font-size: 10px; }
      #sales .sb-import-copy p { margin-top: 3px; }
      #sales .sb-import .sb-actions { margin-top: 7px; }
      #sales .sb-live-note { margin-top: 9px; padding: 7px 9px; font-size: 9.5px; }
      #sales .sb-legacy-note { margin-top: 5px; font-size: 10px; }
      @media (min-width: 901px) and (min-height: 760px) {
        #sales .sb-grid-main { grid-template-columns: minmax(0,1.7fr) minmax(280px,.8fr); }
      }

      @media (max-width: 900px) {
        #app > header .head { grid-template-columns: 1fr auto; min-height: 64px; padding: 8px 14px; gap: 10px; }
        #app > header .head > div:first-child { grid-column: 1; }
        #app > header .user-box { grid-column: 2; }
        #app > header .hasnaria-header-nav { grid-column: 1 / -1; grid-row: 2; justify-content: flex-start; overflow-x: auto; width: 100%; padding-bottom: 3px; }
        #app > header .hasnaria-header-nav .tab { padding: 7px 12px; }
        #app > header .user-info { display: none; }
      }
      @media (max-width: 600px) { #app > header .brand-logo { height: 38px; max-width: 140px; } #app > header #logoutBtn { padding: 7px 10px; } }
    `;
    document.head.appendChild(style);
  }
  function run() { injectStyle(); moveNav(); styleButtons(); syncGroupedContent(); }
  function start() { run(); new MutationObserver(function () { run(); }).observe(document.body, { childList: true, subtree: true }); setInterval(run, 1000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
