(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru'];
  function injectStyle() {
    var s = document.getElementById('hasnaria-sales-layout-style');
    if (!s) { s = document.createElement('style'); s.id = 'hasnaria-sales-layout-style'; document.head.appendChild(s); }
    s.textContent = `
#app:has(#sales:not(.hidden)){height:100vh;overflow:hidden}
#app:has(#sales:not(.hidden)) > main.wrap{max-width:1200px;padding-top:6px!important;padding-bottom:6px!important;height:calc(100vh - 72px);overflow:hidden;box-sizing:border-box}
#sales{width:100%!important;min-width:0;height:100%!important;overflow:hidden!important}
#sales > *:not(.sale-board){display:none!important}
#sales .sale-board,#sales .sb-wrap{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;height:100%!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
#sales .sb-wrap{padding:6px 12px 6px!important;box-sizing:border-box}
#sales .sb-head{gap:6px!important;flex:0 0 auto}
#sales .sb-head h2{font-size:18px!important;margin:0!important}
#sales .sb-head p,#sales .sb-eyebrow{display:none!important}
#sales .sb-upload,#sales .sb-help{min-height:32px!important;padding:0 10px!important;font-size:12px!important}
#sales .sb-period{margin-top:6px!important;gap:6px!important;flex:0 0 auto}
#sales .sb-period span{display:none!important}
#sales .sb-cal select,#sales .sb-cal input[type=date]{min-height:30px!important}
#sales .sb-toggle button{min-height:28px!important;padding:0 9px!important}
#sales .sb-live-note,#sales .sb-legacy-note,#sales .sb-import{display:none!important}
#sales .sb-kpis{width:100%;min-width:0;margin-top:6px!important;gap:6px!important;flex:0 0 auto}
#sales .sb-kpi{padding:7px 10px!important}
#sales .sb-kpi-value{font-size:17px!important;margin-top:1px!important}
#sales .sb-kpi-sub{margin-top:1px!important}
#sales .sb-grid-main{display:grid!important;grid-template-columns:minmax(0,1.7fr) minmax(240px,.82fr)!important;gap:8px!important;align-items:stretch;flex:1 1 auto!important;min-height:0!important;margin-top:6px!important}
#sales .sales-right-stack{display:flex!important;flex-direction:column!important;gap:8px!important;min-width:0;height:100%;min-height:0}
#sales .sales-right-stack .sb-card{width:100%!important;box-sizing:border-box!important;padding:8px 10px!important;margin:0!important;flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
#sales .sales-right-stack .sb-card h3{margin:0!important;font-size:13px!important}
#sales .sales-right-stack .sb-bars{margin-top:4px!important;flex:1;min-height:0;overflow:hidden}
#sales .sales-right-stack .sb-bar-row{margin:4px 0!important}
#sales .sales-right-stack .sb-empty-list{padding:10px!important;margin:6px 0 0!important}
#sales .sb-card{min-width:0;overflow:hidden}
#sales .sb-trend{display:flex;flex-direction:column;min-height:0;height:100%;padding:8px 10px!important}
#sales .sb-trend .sb-chart{width:100%!important;max-width:100%!important;height:100%!important;flex:1 1 auto;min-height:0;margin:0!important}
#sales .sb-ok{margin-top:4px!important;padding:6px 8px!important;flex:0 0 auto}
#sales .majoo-file-status{margin-left:8px;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 10px;border:1px solid #d4dfd9;background:#fff;border-radius:10px;color:#176b55;font-size:12px;font-weight:700;max-width:280px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
#sales .majoo-file-status.ready{background:#eef7f3;border-color:#b9d9cd}
@media(max-width:900px){#sales .sb-grid-main{grid-template-columns:1fr!important}#app:has(#sales:not(.hidden)){height:auto;overflow:auto}#app:has(#sales:not(.hidden)) > main.wrap{height:auto;overflow:visible}}
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
    host.querySelectorAll('.sb-live-note,.sb-legacy-note').forEach(function (el) { el.style.display = 'none'; });
    Array.prototype.forEach.call(host.querySelectorAll('div,p,span,small,footer'), function (el) {
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (text.indexOf('Data dashboard hanya berasal dari tabel') === 0) el.style.display = 'none';
      if (text.indexOf('Form omzet + kas harian tetap ada') === 0) el.style.display = 'none';
    });
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
  function lockPage() {
    var host = document.getElementById('sales');
    var on = !!(host && !host.classList.contains('hidden'));
    document.documentElement.style.overflow = on ? 'hidden' : '';
    document.body.style.overflow = on ? 'hidden' : '';
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
          input.__hasnariaSubmitting = true;
          original.call(input, { target: input, currentTarget: input, type: 'change' });
          setTimeout(function () { input.__hasnariaSubmitting = false; }, 50);
        }
      });
    }
  }
  function run() {
    injectStyle();
    hideSalesPanels();
    hideFooterOnly();
    hideLeftover();
    stackRight();
    lockPage();
    installMajooQueue();
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
