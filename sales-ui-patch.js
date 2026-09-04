(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru'];
  function injectStyle() {
    var s = document.getElementById('hasnaria-sales-layout-style');
    if (!s) { s = document.createElement('style'); s.id = 'hasnaria-sales-layout-style'; document.head.appendChild(s); }
    s.textContent = `
#app:has(#sales:not(.hidden)) > main.wrap{max-width:1200px;padding-top:8px!important;padding-bottom:12px!important;box-sizing:border-box}
#sales{width:100%!important;min-width:0;overflow:auto!important}
#sales > *:not(.sale-board){display:none!important}
#sales .sale-board,#sales .sb-wrap{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;display:flex!important;flex-direction:column!important;overflow:visible!important}
#sales .sb-wrap{padding:8px 12px 16px!important;box-sizing:border-box}
#sales .sb-head{gap:8px!important;flex:0 0 auto}
#sales .sb-head h2{font-size:20px!important;margin:0!important}
#sales .sb-head p,#sales .sb-eyebrow{display:none!important}
#sales .sb-upload,#sales .sb-help{min-height:34px!important;padding:0 12px!important;font-size:12px!important}
#sales .sb-period{margin-top:8px!important;gap:8px!important;flex:0 0 auto}
#sales .sb-period span{display:none!important}
#sales .sb-live-note,#sales .sb-legacy-note{display:none!important}
#sales .sb-kpis{width:100%;min-width:0;margin-top:8px!important;gap:8px!important;flex:0 0 auto;grid-template-columns:repeat(4,minmax(0,1fr))!important}
#sales .sb-kpi{padding:10px 12px!important;overflow:visible!important;min-width:0}
#sales .sb-kpi-value{font-size:15px!important;margin-top:2px!important;line-height:1.25;white-space:nowrap;overflow:visible!important}
#sales .sb-kpi-sub{margin-top:2px!important;font-size:11px!important}
#sales .sb-grid-main{display:grid!important;grid-template-columns:minmax(0,1.7fr) minmax(240px,.82fr)!important;gap:10px!important;align-items:stretch;margin-top:8px!important}
#sales .sales-right-stack{display:flex!important;flex-direction:column!important;gap:10px!important;min-width:0}
#sales .sales-right-stack .sb-card{width:100%!important;box-sizing:border-box!important;padding:10px 12px!important;margin:0!important}
#sales .sb-card{min-width:0;overflow:visible}
#sales .sb-trend{padding:10px 12px!important}
#sales .sb-trend .sb-chart{width:100%!important;max-width:100%!important;height:auto!important;min-height:180px;margin:0!important}
#sales .sb-import{display:none!important}
#sales .majoo-file-status{margin-left:8px;display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 10px;border:1px solid #d4dfd9;background:#fff;border-radius:10px;color:#176b55;font-size:12px;font-weight:700;max-width:280px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
#sales .majoo-file-status.ready{background:#eef7f3;border-color:#b9d9cd}
@media(max-width:900px){#sales .sb-grid-main{grid-template-columns:1fr!important}#sales .sb-kpis{grid-template-columns:1fr 1fr!important}}
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
      if (t === 'Top 5 Seller (Qty)') top = card;
      if (t === '5 Worst Performer (Qty)') worst = card;
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
  function textReplace(root, from, to) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) { if ((node.nodeValue || '').indexOf(from) >= 0) node.nodeValue = node.nodeValue.replace(from, to); });
  }
  function installMajooQueue() {
    var host = document.getElementById('sales');
    if (!host || host.classList.contains('hidden')) return;
    var input = host.querySelector('input[type="file"]');
    if (!input) return;
    var actions = input.closest('.sb-actions') || input.parentElement;
    var upload = host.querySelector('.sb-upload');
    if (upload) textReplace(upload, 'Update', 'Upload');
    var submit = host.querySelector('.sb-help');
    if (submit) textReplace(submit, 'Format Majoo', 'Submit');
    if (!input.__hasnariaQueueInstalled) {
      input.__hasnariaQueueInstalled = true;
      input.__hasnariaOriginalChange = input.onchange;
      input.__hasnariaQueuedFile = null;
      input.onchange = function () {
        var file = input.files && input.files[0];
        input.__hasnariaQueuedFile = file || null;
        showFileStatus(file);
      };
    }
    var status = host.querySelector('.majoo-file-status');
    if (!status) {
      status = document.createElement('span');
      status.className = 'majoo-file-status';
      status.textContent = 'Belum ada file dipilih';
      if (actions) actions.appendChild(status);
      else if (submit && submit.parentElement) submit.parentElement.appendChild(status);
    }
    function showFileStatus(file) {
      var el = host.querySelector('.majoo-file-status');
      if (!el) return;
      if (!file) { el.className = 'majoo-file-status'; el.textContent = 'Belum ada file dipilih'; return; }
      el.className = 'majoo-file-status ready';
      el.textContent = '✓ ' + file.name + ' — siap disubmit';
    }
    if (submit && !submit.__hasnariaSubmitInstalled) {
      submit.__hasnariaSubmitInstalled = true;
      submit.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var file = input.__hasnariaQueuedFile;
        if (!file) { showFileStatus(null); return; }
        var original = input.__hasnariaOriginalChange;
        if (typeof original === 'function') {
          original.call(input, { target: input, currentTarget: input, type: 'change' });
        }
      });
    }
  }
  var scheduled = false;
  function run() {
    injectStyle();
    hideSalesPanels();
    hideFooterOnly();
    hideLeftover();
    stackRight();
    installMajooQueue();
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
