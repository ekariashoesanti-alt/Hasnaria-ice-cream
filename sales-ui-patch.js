(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru'];
  function injectStyle() {
    if (document.getElementById('hasnaria-sales-layout-style')) return;
    var s = document.createElement('style');
    s.id = 'hasnaria-sales-layout-style';
    s.textContent = `
#sales{width:100%!important;min-width:0;overflow:visible!important}
#sales > *:not(.sale-board){display:none!important}
#sales .sale-board,#sales .sb-wrap{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important}
#sales .sb-wrap{padding:4px 14px 6px!important}
#sales .sb-live-note,#sales .sb-legacy-note,#sales .sb-import{display:none!important}
#sales .sb-grid-main{display:grid!important;grid-template-columns:minmax(0,1.7fr) minmax(260px,.82fr)!important;gap:10px!important;align-items:stretch}
#sales .sales-right-stack{display:flex!important;flex-direction:column!important;gap:10px!important;min-width:0;height:100%}
#sales .sales-right-stack .sb-card{width:100%!important;box-sizing:border-box!important;padding:10px 11px!important;margin:0!important;flex:1 1 0;min-height:0;display:flex;flex-direction:column}
#sales .sales-right-stack .sb-card h3{margin:0!important;font-size:13px!important}
#sales .sales-right-stack .sb-bars{margin-top:4px!important;flex:1}
#sales .sales-right-stack .sb-bar-row{margin:5px 0!important}
#sales .sb-kpis{width:100%;min-width:0;margin-top:5px!important}
#sales .sb-card{min-width:0;overflow:hidden}
#sales .sb-trend{display:flex;flex-direction:column}
#sales .sb-trend .sb-chart{width:100%!important;max-width:100%!important;margin:2px 0 0!important;flex:1}
@media(max-width:900px){#sales .sb-grid-main{grid-template-columns:1fr!important}}
`;
    document.head.appendChild(s);
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
    host.querySelectorAll('.sb-live-note,.sb-legacy-note').forEach(function (el) { el.style.display = 'none'; });
    Array.prototype.forEach.call(host.querySelectorAll('div,p,span,small,footer'), function (el) {
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (text.indexOf('Data dashboard hanya berasal dari tabel') === 0) el.style.display = 'none';
      if (text.indexOf('Form omzet + kas harian tetap ada') === 0) el.style.display = 'none';
    });
  }
  function removeWorst() {
    var host = document.getElementById('sales');
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('.sb-card'), function (card) {
      var h = card.querySelector('h3');
      if (h && (h.textContent || '').replace(/\s+/g, ' ').trim() === '5 Worst Performer (Qty)') card.remove();
    });
  }
  function stackRight() {
    var host = document.getElementById('sales');
    if (!host || host.classList.contains('hidden')) return;
    var top = null;
    Array.prototype.forEach.call(host.querySelectorAll('.sb-card'), function (card) {
      var h = card.querySelector('h3');
      if (h && (h.textContent || '').replace(/\s+/g, ' ').trim() === 'Top 5 Seller (Qty)') top = card;
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
  }
  function hideLeftover() {
    var host = document.getElementById('sales');
    if (!host) return;
    Array.prototype.forEach.call(host.children, function (ch) {
      if (!ch.classList.contains('sale-board')) ch.style.display = 'none';
    });
  }
  function fitOneView() {
    var host = document.getElementById('sales');
    var board = host && host.querySelector('.sale-board');
    if (!host || host.classList.contains('hidden') || !board) return;
    board.style.transform = 'none';
    board.style.maxHeight = 'none';
    board.style.height = 'auto';
    board.style.overflow = 'visible';
    host.style.maxHeight = 'none';
    host.style.height = 'auto';
    host.style.overflow = 'visible';
  }
  function run() {
    injectStyle();
    hideSalesPanels();
    hideFooterOnly();
    removeWorst();
    hideLeftover();
    stackRight();
    fitOneView();
  }
  function start() {
    run();
    new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', run);
    setInterval(run, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
