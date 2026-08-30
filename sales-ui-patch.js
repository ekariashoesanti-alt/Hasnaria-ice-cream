(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru'];
  function hideSalesPanels() {
    var host = document.getElementById('sales');
    if (!host || host.classList.contains('hidden')) return;
    HIDDEN.forEach(function (label) {
      var nodes = host.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span,strong,b');
      Array.prototype.forEach.call(nodes, function (el) {
        var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text !== label || el.getAttribute('data-backend-hidden') === '1') return;
        var panel = el.closest('.card, .panel, .box, .section');
        if (!panel || panel === host) panel = el.parentElement;
        if (panel && panel !== host) { panel.setAttribute('data-backend-hidden', '1'); panel.style.display = 'none'; }
      });
    });
    var board = host.querySelector('.sale-board');
    if (board) {
      board.style.width = '100%';
      board.style.maxWidth = '100%';
      var wrap = board.querySelector('.sb-wrap');
      if (wrap) { wrap.style.width = '100%'; wrap.style.maxWidth = '100%'; }
    }
  }
  function start() {
    hideSalesPanels();
    new MutationObserver(hideSalesPanels).observe(document.body, { childList: true, subtree: true });
    setInterval(hideSalesPanels, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
