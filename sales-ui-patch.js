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

  function fitSales() {
    var host = document.getElementById('sales');
    if (!host || host.classList.contains('hidden')) return;
    var board = host.querySelector('.sale-board');
    var main = document.querySelector('#app > main.wrap');
    if (!board || !main) return;

    board.style.transform = 'none';
    board.style.width = '100%';
    board.style.maxWidth = '100%';
    board.style.margin = '0';
    host.style.height = 'auto';
    host.style.overflow = 'visible';

    /* Pakai seluruh lebar media view. Kolom kanan tidak boleh terpotong. */
    var availableWidth = Math.max(320, main.clientWidth);
    var naturalWidth = board.scrollWidth;
    if (naturalWidth > availableWidth) {
      board.style.width = '100%';
      board.style.maxWidth = '100%';
      board.style.overflow = 'hidden';
    }

    /* Atur tinggi box berdasarkan tinggi viewport, bukan mengecilkan seluruh UI.
       Header + tab tetap; isi Penjualan dibuat lebih rapat agar terbaca besar. */
    var header = document.querySelector('#app > header');
    var tabs = document.getElementById('tabs');
    var availableHeight = window.innerHeight -
      (header ? header.getBoundingClientRect().height : 0) -
      (tabs ? tabs.getBoundingClientRect().height : 0) - 42;
    if (availableHeight <= 0) return;

    var naturalHeight = board.scrollHeight;
    if (naturalHeight <= availableHeight) return;

    /* Hanya kompres spacing/tinggi box, font tidak dikecilkan. */
    board.classList.add('sales-compact-height');
    var stillTooTall = board.scrollHeight > availableHeight;
    if (stillTooTall) {
      board.classList.add('sales-ultra-compact-height');
    }

    if (board.scrollHeight > availableHeight) {
      board.style.maxHeight = availableHeight + 'px';
      board.style.overflow = 'hidden';
    }
  }

  function injectResponsiveStyle() {
    if (document.getElementById('hasnaria-sales-viewport-style')) return;
    var s = document.createElement('style');
    s.id = 'hasnaria-sales-viewport-style';
    s.textContent = `
      #sales { width:100%; min-width:0; }
      #sales .sale-board, #sales .sb-wrap { width:100% !important; max-width:100% !important; min-width:0 !important; }
      #sales .sb-grid-main, #sales .sb-kpis { min-width:0; width:100%; }
      #sales .sb-grid-main > *, #sales .sb-kpi { min-width:0; }
      #sales .sb-card { min-width:0; overflow:hidden; }
      #sales .sb-chart, #sales .sb-bars { min-width:0; overflow:hidden; }
      #sales .sb-bar-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #sales .sales-compact-height .sb-wrap { padding-top:10px !important; padding-bottom:10px !important; }
      #sales .sales-compact-height .sb-period { margin-top:7px !important; }
      #sales .sales-compact-height .sb-kpis { margin-top:7px !important; gap:6px !important; }
      #sales .sales-compact-height .sb-kpi { padding:7px 9px !important; }
      #sales .sales-compact-height .sb-kpi-value { font-size:17px !important; }
      #sales .sales-compact-height .sb-grid-main { margin-top:7px !important; gap:7px !important; }
      #sales .sales-compact-height .sb-card { padding:8px 10px !important; }
      #sales .sales-compact-height .sb-bar-row { margin:5px 0 !important; }
      #sales .sales-compact-height .sb-live-note { margin-top:5px !important; padding:5px 7px !important; }
      #sales .sales-ultra-compact-height .sb-wrap { padding-top:7px !important; padding-bottom:7px !important; }
      #sales .sales-ultra-compact-height .sb-head { gap:5px !important; }
      #sales .sales-ultra-compact-height .sb-head h2 { font-size:18px !important; }
      #sales .sales-ultra-compact-height .sb-period { margin-top:5px !important; gap:5px !important; }
      #sales .sales-ultra-compact-height .sb-kpis { margin-top:5px !important; gap:5px !important; }
      #sales .sales-ultra-compact-height .sb-kpi { padding:5px 7px !important; }
      #sales .sales-ultra-compact-height .sb-kpi-label,
      #sales .sales-ultra-compact-height .sb-kpi-sub { font-size:9px !important; }
      #sales .sales-ultra-compact-height .sb-kpi-value { font-size:16px !important; }
      #sales .sales-ultra-compact-height .sb-grid-main { margin-top:5px !important; gap:5px !important; }
      #sales .sales-ultra-compact-height .sb-card { padding:6px 8px !important; }
      #sales .sales-ultra-compact-height .sb-card h3 { margin-bottom:2px !important; }
      #sales .sales-ultra-compact-height .sb-bar-row { margin:3px 0 !important; }
      #sales .sales-ultra-compact-height .sb-live-note { display:none !important; }
      @media (min-width:901px) {
        #sales .sb-grid-main { grid-template-columns:minmax(0,1fr) minmax(300px,0.58fr) !important; }
      }
      @media (max-width:1100px) and (min-width:701px) {
        #sales .sb-grid-main { grid-template-columns:minmax(0,1fr) minmax(250px,0.55fr) !important; }
      }
      @media (max-width:700px) {
        #sales .sb-grid-main { grid-template-columns:1fr !important; }
      }
    `;
    document.head.appendChild(s);
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
    if (timer) clearInterval(timer);
    timer = setInterval(run, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
