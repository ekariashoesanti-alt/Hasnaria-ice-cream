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
  var scheduled = false;
  function run() {
    injectStyle();
    hideSalesPanels();
    hideFooterOnly();
    hideLeftover();
    stackRight();
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
