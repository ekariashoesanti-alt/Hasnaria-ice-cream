(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru'];
  var timer = null;
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
  }
  function fitSalesToViewport() {
    var host = document.getElementById('sales');
    if (!host || host.classList.contains('hidden')) return;
    var board = host.querySelector('.sale-board');
    if (!board) return;
    var main = document.querySelector('#app > main.wrap');
    if (!main) return;
    board.style.transform = 'none';
    board.style.transformOrigin = 'top left';
    board.style.height = 'auto';
    board.style.width = '100%';
    board.style.maxWidth = '100%';
    var header = document.querySelector('#app > header');
    var tabs = document.getElementById('tabs');
    var available = window.innerHeight - (header ? header.getBoundingClientRect().height : 0) - (tabs ? tabs.getBoundingClientRect().height : 0) - 38;
    var natural = board.scrollHeight;
    if (available <= 0 || natural <= 0) return;
    var scale = Math.min(1, available / natural);
    if (scale < 0.995) {
      board.style.width = (100 / scale) + '%';
      board.style.transform = 'scale(' + scale + ')';
      board.style.transformOrigin = 'top left';
      host.style.height = Math.ceil(natural * scale) + 'px';
      host.style.overflow = 'hidden';
    } else {
      host.style.height = 'auto';
      host.style.overflow = 'visible';
    }
  }
  function run() { hideSalesPanels(); requestAnimationFrame(function () { fitSalesToViewport(); }); }
  function start() {
    run();
    new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', run);
    if (timer) clearInterval(timer);
    timer = setInterval(run, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
