(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru'];
  function injectStyle() {
    var s = document.getElementById('hasnaria-sales-layout-style');
    if (!s) { s = document.createElement('style'); s.id = 'hasnaria-sales-layout-style'; document.head.appendChild(s); }
    s.textContent = `
#app:has(#sales:not(.hidden)) > main.wrap{max-width:1280px;height:calc(100vh - 84px);max-height:calc(100vh - 84px);padding:6px 0 8px!important;box-sizing:border-box;overflow:hidden}
#sales{width:100%!important;height:100%!important;min-width:0;overflow:hidden!important}
#sales > *:not(.sale-board){display:none!important}
#sales .sale-board{width:100%!important;height:100%!important;max-width:none!important;min-width:0!important;margin:0!important;display:block!important;overflow:hidden!important}
#sales .sb-wrap{width:100%!important;height:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:11px 14px 12px!important;box-sizing:border-box;display:flex!important;flex-direction:column!important;overflow:hidden!important}
#sales .sb-head{gap:10px!important;flex:0 0 auto;min-height:48px}
#sales .sb-head h2{font-size:21px!important;margin:0!important;line-height:1.15}
#sales .sb-head p{font-size:11.5px!important;margin-top:2px!important}
#sales .sb-eyebrow{font-size:10px!important}
#sales .sb-upload-wrap{gap:6px!important}
#sales .sb-btn-upload,#sales .sb-btn-submit,#sales .sb-btn-format{min-height:34px!important}
#sales .sb-period{margin-top:7px!important;gap:7px!important;flex:0 0 auto}
#sales .sb-live-note,#sales .sb-legacy-note{display:none!important}
#sales .sb-kpis{width:100%;min-width:0;margin-top:7px!important;gap:7px!important;flex:0 0 auto;grid-template-columns:repeat(4,minmax(0,1fr))!important}
#sales .sb-kpi{padding:8px 11px!important;overflow:hidden!important;min-width:0;border-radius:10px!important}
#sales .sb-kpi-label{font-size:10.5px!important}
#sales .sb-kpi-value{font-size:17px!important;margin-top:2px!important;line-height:1.2;white-space:nowrap;overflow:hidden!important;text-overflow:ellipsis}
#sales .sb-kpi-sub{margin-top:2px!important;font-size:10px!important}
#sales .sb-grid-main{display:grid!important;grid-template-columns:minmax(0,1.7fr) minmax(270px,.9fr)!important;grid-template-rows:minmax(0,1fr) 178px!important;gap:8px!important;align-items:stretch!important;margin-top:8px!important;flex:1 1 auto;min-height:0!important;overflow:hidden!important}
#sales .sales-right-stack{display:flex!important;flex-direction:column!important;gap:8px!important;min-width:0;min-height:0}
#sales .sales-right-stack .sb-card{width:100%!important;box-sizing:border-box!important;padding:10px 12px!important;margin:0!important;min-height:0!important;overflow:hidden!important}
#sales .sb-card{min-width:0;overflow:hidden!important;border-radius:12px!important}
#sales .sb-card-head{margin-bottom:4px!important}
#sales .sb-card h3{font-size:14px!important}
#sales .sb-card-head span{font-size:10px!important}
#sales .sb-trend{padding:10px 12px!important;min-height:0!important;height:100%!important}
#sales .sb-trend .sb-chart{width:100%!important;max-width:100%!important;height:calc(100% - 34px)!important;min-height:0!important;margin:0!important;display:block!important}
#sales .sb-chart-hint{font-size:9px!important;margin-top:1px!important}
#sales .sb-bars{margin-top:2px!important}
#sales .sb-bar-row{margin:4px 0!important}
#sales .sb-bar-track{height:6px!important;margin-top:3px!important}
#sales .sb-hourly-average{grid-column:1 / -1!important;grid-row:2!important;height:100%!important;min-height:0!important;padding:9px 12px!important}
#sales .sb-hourly-average .sb-hourly-chart{width:100%!important;max-width:100%!important;height:calc(100% - 31px)!important;max-height:none!important;min-height:0!important}
#sales .sb-hourly-average .sb-card-head{margin-bottom:2px!important}
#sales .sb-hourly-peak-label{font-size:10px!important;margin-top:0!important}
#sales .sb-import{display:none!important}
@media(max-width:980px){
  #app:has(#sales:not(.hidden)) > main.wrap{height:auto;max-height:none;overflow:visible;padding:8px 0 12px!important}
  #sales{height:auto!important;overflow:visible!important}
  #sales .sale-board,#sales .sb-wrap{height:auto!important;overflow:visible!important}
  #sales .sb-grid-main{grid-template-columns:1fr!important;grid-template-rows:auto!important;overflow:visible!important}
  #sales .sb-hourly-average{grid-column:1!important;grid-row:auto!important;height:auto!important}
  #sales .sb-hourly-average .sb-hourly-chart{height:auto!important;max-height:145px!important}
}
@media(max-width:640px){
  #sales .sb-kpis{grid-template-columns:1fr!important}
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
