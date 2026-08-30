(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru'];
  var timer = null;

  function hideSalesPanels() {
    var host = document.getElementById('sales');
    if (!host || host.classList.contains('hidden')) return;
    HIDDEN.forEach(function (label) {
      Array.prototype.forEach.call(host.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span,strong,b'), function (el) {
        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text !== label || el.getAttribute('data-backend-hidden') === '1') return;
        var panel = el.closest('.card, .panel, .box, .section') || el.parentElement;
        if (panel && panel !== host) { panel.setAttribute('data-backend-hidden', '1'); panel.style.display = 'none'; }
      });
    });
  }

  function injectResponsiveStyle() {
    if (document.getElementById('hasnaria-sales-viewport-style')) return;
    var s = document.createElement('style');
    s.id = 'hasnaria-sales-viewport-style';
    s.textContent = `
      #sales { width:100%; min-width:0; overflow:visible !important; }
      #sales .sale-board, #sales .sb-wrap { width:100% !important; max-width:none !important; min-width:0 !important; margin-left:0 !important; margin-right:0 !important; }
      #sales .sb-grid-main, #sales .sb-kpis { width:100%; min-width:0; }
      #sales .sb-grid-main > *, #sales .sb-kpi { min-width:0; }
      #sales .sb-card { min-width:0; overflow:hidden; }
      #sales .sb-chart, #sales .sb-bars { min-width:0; overflow:hidden; }
      #sales .sb-bar-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

      /* Tinggi dipangkas lewat spacing, BUKAN crop dan BUKAN transform scale. */
      #sales .sales-compact-height .sb-wrap { padding:10px 14px !important; }
      #sales .sales-compact-height .sb-head { gap:6px !important; }
      #sales .sales-compact-height .sb-head h2 { margin:1px 0 !important; }
      #sales .sales-compact-height .sb-period { margin-top:6px !important; gap:6px !important; }
      #sales .sales-compact-height .sb-cal { gap:5px !important; }
      #sales .sales-compact-height .sb-kpis { margin-top:6px !important; gap:6px !important; }
      #sales .sales-compact-height .sb-kpi { padding:7px 9px !important; }
      #sales .sales-compact-height .sb-kpi-value { margin-top:1px !important; }
      #sales .sales-compact-height .sb-grid-main { margin-top:6px !important; gap:7px !important; }
      #sales .sales-compact-height .sb-card { padding:8px 10px !important; }
      #sales .sales-compact-height .sb-card h3 { margin-bottom:2px !important; }
      #sales .sales-compact-height .sb-chart { margin-top:2px !important; }
      #sales .sales-compact-height .sb-bars { margin-top:3px !important; }
      #sales .sales-compact-height .sb-bar-row { margin:4px 0 !important; }
      #sales .sales-compact-height .sb-bar-track { margin-top:3px !important; }
      #sales .sales-compact-height .sb-import-copy { margin-top:4px !important; padding:6px 8px !important; }
      #sales .sales-compact-height .sb-import .sb-actions { margin-top:5px !important; }
      #sales .sales-compact-height .sb-live-note { margin-top:4px !important; padding:5px 7px !important; }

      @media (min-width:901px) {
        #sales .sb-grid-main { grid-template-columns:minmax(0,1fr) minmax(270px,0.52fr) !important; }
      }
      @media (max-width:1100px) and (min-width:701px) {
        #sales .sb-grid-main { grid-template-columns:minmax(0,1fr) minmax(235px,0.5fr) !important; }
      }
      @media (max-width:700px) {
        #sales .sb-grid-main { grid-template-columns:1fr !important; }
      }
    `;
    document.head.appendChild(s);
  }

  function fitSales() {
    var host = document.getElementById('sales');
    var board = host && host.querySelector('.sale-board');
    var main = document.querySelector('#app > main.wrap');
    if (!host || host.classList.contains('hidden') || !board || !main) return;

    /* Reset semua mekanisme crop/scale dari versi sebelumnya. */
    board.style.transform = 'none';
    board.style.maxHeight = 'none';
    board.style.height = 'auto';
    board.style.overflow = 'visible';
    host.style.maxHeight = 'none';
    host.style.height = 'auto';
    host.style.overflow = 'visible';

    board.classList.remove('sales-compact-height');

    var header = document.querySelector('#app > header');
    var tabs = document.getElementById('tabs');
    var available = window.innerHeight -
      (header ? header.getBoundingClientRect().height : 0) -
      (tabs ? tabs.getBoundingClientRect().height : 0) - 34;

    if (available > 0 && board.scrollHeight > available) {
      board.classList.add('sales-compact-height');
    }
    /* Jangan pernah memotong isi. Jika tinggi layar sangat pendek, browser tetap
       boleh scroll daripada menghilangkan informasi. */
  }

  function run() {
    injectResponsiveStyle();
    hideSalesPanels();
    requestAnimationFrame(fitSales);
  }

  function start() {
    run();
    new MutationObserver(run).observe(document.body, { childList:true, subtree:true });
    window.addEventListener('resize', run);
    timer = setInterval(run, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
