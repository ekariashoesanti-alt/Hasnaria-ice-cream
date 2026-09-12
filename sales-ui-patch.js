(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru'];

  function injectStyle() {
    var s = document.getElementById('hasnaria-sales-layout-style');
    if (!s) { s = document.createElement('style'); s.id = 'hasnaria-sales-layout-style'; document.head.appendChild(s); }
    s.textContent = `
#app:has(#sales:not(.hidden)) > main.wrap{max-width:1240px;padding-top:8px!important;padding-bottom:12px!important;box-sizing:border-box}
#sales{width:100%!important;min-width:0;overflow:visible!important}
#sales > *:not(.sale-board){display:none!important}
#sales .sale-board,#sales .sb-wrap{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;display:flex!important;flex-direction:column!important;overflow:visible!important}
#sales .sb-wrap{padding:12px 16px 18px!important;box-sizing:border-box}
#sales .sb-head{gap:10px!important;flex:0 0 auto}
#sales .sb-head h2{font-size:21px!important;margin:0!important}
#sales .sb-head p,#sales .sb-eyebrow{display:block!important}
#sales .sb-period{margin-top:10px!important;gap:8px!important;flex:0 0 auto}
#sales .sb-live-note,#sales .sb-legacy-note{display:none!important}
#sales .sb-kpis{width:100%;min-width:0;margin-top:10px!important;gap:10px!important;flex:0 0 auto;grid-template-columns:repeat(4,minmax(0,1fr))!important}
#sales .sb-kpi{padding:12px 14px!important;overflow:visible!important;min-width:0}
#sales .sb-kpi-value{font-size:17px!important;margin-top:3px!important;line-height:1.25;white-space:nowrap;overflow:visible!important}
#sales .sb-kpi-sub{margin-top:3px!important;font-size:11px!important}
#sales .sb-grid-main{display:grid!important;grid-template-columns:minmax(0,1.7fr) minmax(260px,.88fr)!important;gap:12px!important;align-items:stretch;margin-top:10px!important}
#sales .sales-right-stack{display:flex!important;flex-direction:column!important;gap:12px!important;min-width:0}
#sales .sales-right-stack .sb-card{width:100%!important;box-sizing:border-box!important;padding:12px 14px!important;margin:0!important}
#sales .sb-card{min-width:0;overflow:visible}
#sales .sb-trend{padding:12px 14px!important}
#sales .sb-trend .sb-chart{width:100%!important;max-width:100%!important;height:auto!important;min-height:180px;margin:0!important}
#sales .sb-import{display:none!important}
@media(min-width:981px){
  #app:has(#sales:not(.hidden)){height:100dvh;overflow:hidden}
  #app:has(#sales:not(.hidden)) > header{height:80px;overflow:hidden}
  #app:has(#sales:not(.hidden)) > main.wrap{height:calc(100dvh - 80px);max-height:calc(100dvh - 80px);display:flex;flex-direction:column;overflow:hidden;padding-top:6px!important;padding-bottom:8px!important}
  #app:has(#sales:not(.hidden)) > main.wrap > .tabs{flex:0 0 40px;margin-bottom:6px!important}
  #sales{flex:1 1 auto;min-height:0!important;overflow:hidden!important}
  #sales .sale-board,#sales .sb-wrap{height:100%!important;min-height:0!important;overflow:hidden!important}
  #sales .sb-wrap{padding:7px 12px 8px!important}
  #sales .sb-head{gap:6px!important;min-height:34px}
  #sales .sb-head h2{font-size:18px!important;line-height:1.1}
  #sales .sb-head p{font-size:10.5px!important;line-height:1.15}
  #sales .sb-eyebrow{font-size:9px!important}
  #sales .sb-upload-wrap{gap:5px!important}
  #sales .sb-btn-upload,#sales .sb-btn-submit,#sales .sb-btn-format{min-height:30px!important;padding:0 9px!important;font-size:10.5px!important}
  #sales .sb-period{margin-top:5px!important;gap:5px!important}
  #sales .sb-cal{gap:5px!important}
  #sales .sb-cal label,#sales .sb-cal b,#sales .sb-cal span{font-size:10px!important}
  #sales .sb-cal select,#sales .sb-cal input[type=date]{min-height:28px!important;padding:2px 6px!important;font-size:10px!important}
  #sales .sb-toggle button{min-height:27px!important;padding:0 9px!important;font-size:10px!important}
  #sales .sb-kpis{margin-top:5px!important;gap:6px!important}
  #sales .sb-kpi{padding:6px 9px!important;border-radius:10px!important}
  #sales .sb-kpi-label{font-size:9.5px!important}
  #sales .sb-kpi-value{font-size:15px!important;margin-top:1px!important;line-height:1.1}
  #sales .sb-kpi-sub{font-size:9px!important;margin-top:1px!important;line-height:1.1}
  #sales .sb-grid-main{flex:1 1 auto;min-height:0!important;grid-template-columns:minmax(0,1.72fr) minmax(260px,.9fr)!important;grid-template-rows:minmax(0,1fr)!important;gap:7px!important;margin-top:6px!important;overflow:hidden}
  #sales:has([data-mode="daily"].on) .sb-grid-main{grid-template-rows:minmax(0,1fr) clamp(116px,18vh,158px)!important}
  #sales .sb-trend{grid-column:1;grid-row:1;min-height:0!important;padding:8px 10px!important;display:flex;flex-direction:column}
  #sales .sb-card-head{margin-bottom:3px!important}
  #sales .sb-card h3{font-size:12.5px!important;line-height:1.15}
  #sales .sb-card-head span{font-size:9px!important;line-height:1.1}
  #sales .sb-trend .sb-chart-wrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
  #sales .sb-trend .sb-chart{width:100%!important;max-width:100%!important;min-height:0!important;height:100%!important;flex:1 1 auto;margin:0!important}
  #sales .sb-chart-hint{font-size:8.5px!important;line-height:1.1;margin-top:1px!important}
  #sales .sales-right-stack{grid-column:2;grid-row:1;min-height:0!important;gap:7px!important}
  #sales .sales-right-stack .sb-card{flex:1 1 0;min-height:0!important;padding:7px 9px!important;overflow:hidden!important;display:flex;flex-direction:column}
  #sales .sb-sku-metric-toggle button{padding:1px 6px!important;font-size:9px!important}
  #sales .sb-bars{margin-top:2px!important;flex:1 1 auto;min-height:0;display:grid;grid-template-rows:repeat(5,minmax(0,1fr));align-content:stretch}
  #sales .sb-bar-row{margin:1px 0!important;min-height:0}
  #sales .sb-bar-label{font-size:9.5px!important;line-height:1.05;gap:4px!important}
  #sales .sb-bar-label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:58%}
  #sales .sb-share{font-size:8px!important}
  #sales .sb-bar-rank{width:15px!important;height:15px!important;font-size:8px!important;margin-right:5px!important}
  #sales .sb-bar-track{height:4px!important;margin:2px 0 0 20px!important}
  #sales .sb-hourly-average{grid-column:1 / -1!important;grid-row:2!important;min-height:0!important;height:auto!important;padding:6px 10px!important;overflow:hidden!important;display:flex;flex-direction:column}
  #sales .sb-hourly-average .sb-hourly-body,#sales .sb-hourly-average .sb-hourly-chart-wrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
  #sales .sb-hourly-average .sb-hourly-chart{width:100%!important;max-width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;flex:1 1 auto}
  #sales .sb-hourly-peak-label{font-size:8.5px!important;line-height:1.1;margin-top:0!important}
}
@media(max-width:980px){
  #sales .sb-grid-main{grid-template-columns:1fr!important}
  #sales .sb-kpis{grid-template-columns:1fr 1fr!important}
}
@media(max-width:640px){
  #sales .sb-kpis{grid-template-columns:1fr!important}
}
`;
  }

  function ensureTrendAlignCss() {
    if (document.getElementById('hasnaria-sales-trend-align-css')) return;
    var l = document.createElement('link');
    l.id = 'hasnaria-sales-trend-align-css';
    l.rel = 'stylesheet';
    l.href = '/sales-trend-align.css?v=1';
    document.head.appendChild(l);
  }

  function hideSalesPanels() {
    var host = document.getElementById('sales');
    if (!host || host.classList.contains('hidden')) return;
    HIDDEN.forEach(function (label) {
      Array.prototype.forEach.call(host.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span,strong,b'), function (el) {
        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text !== label) return;
        var panel = el.closest('.sb-card,.card,.panel,.box,.section') || el.parentElement;
        if (panel && panel !== host) panel.style.display = 'none';
        else if (el !== host) el.style.display = 'none';
      });
    });
  }

  function hideFooterOnly() {
    var host = document.getElementById('sales');
    if (!host) return;
    host.querySelectorAll('.sb-live-note,.sb-legacy-note,.sb-import').forEach(function (el) { el.style.display = 'none'; });
  }

  function stackRight() {
    var host = document.getElementById('sales');
    if (!host || host.classList.contains('hidden')) return;
    var top = null, worst = null;
    Array.prototype.forEach.call(host.querySelectorAll('.sb-card'), function (card) {
      var h = card.querySelector('h3');
      if (!h) return;
      var t = (h.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.indexOf('Top 5 Seller') >= 0) top = card;
      if (t.indexOf('Worst Performer') >= 0) worst = card;
    });
    if (!top) return;
    var firstGrid = top.closest('.sb-grid-main') || host.querySelector('.sb-grid-main');
    if (!firstGrid) return;
    var stack = firstGrid.querySelector('.sales-right-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'sales-right-stack';
      var trend = firstGrid.querySelector('.sb-trend') || firstGrid.firstElementChild;
      if (trend && trend.nextSibling) firstGrid.insertBefore(stack, trend.nextSibling);
      else firstGrid.appendChild(stack);
    }
    if (top.parentElement !== stack) stack.appendChild(top);
    if (worst && worst.parentElement !== stack) stack.appendChild(worst);
    Array.prototype.forEach.call(host.querySelectorAll('.sb-grid-main'), function (grid) {
      if (grid === firstGrid) return;
      if (!grid.querySelector('.sb-trend') && !grid.querySelector('.sales-right-stack')) grid.style.display = 'none';
    });
  }

  function hideLeftover() {
    var host = document.getElementById('sales');
    if (!host) return;
    Array.prototype.forEach.call(host.children, function (ch) {
      if (!ch.classList.contains('sale-board')) ch.style.display = 'none';
    });
  }

  function normalizeProductLabels() {
    var host = document.getElementById('sales');
    if (!host || host.classList.contains('hidden')) return;
    Array.prototype.forEach.call(host.querySelectorAll('*'), function (el) {
      if (el.children.length) return;
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text === 'Produk Terjual (Qty)') el.textContent = 'Kemunculan Produk';
      else if (el.matches && el.matches('[data-sku-metric="qty"]') && text === 'Qty') el.textContent = 'Kemunculan';
      else if (/^\d[\d.]* SKU terdaftar$/.test(text)) el.textContent = text.replace(' SKU terdaftar', ' menu unik');
      else if (/^\d[\d.]* pcs(?:\s|$|\()/.test(text)) el.textContent = text.replace(/ pcs\b/, '×');
    });
  }

  var scheduled = false;
  function run() {
    injectStyle();
    ensureTrendAlignCss();
    hideSalesPanels();
    hideFooterOnly();
    hideLeftover();
    stackRight();
    normalizeProductLabels();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; run(); });
  }
  function start() {
    run();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
