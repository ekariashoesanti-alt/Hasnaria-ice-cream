/* HSN-005 — Owner single-render navigation guard.
 * Keeps the legacy modules available, but prevents Owner top navigation from
 * calling core-app's full render() after the modern Sales/Stock/ERP views mount.
 * Non-owner roles are intentionally untouched.
 */
(function () {
  'use strict';

  var SECTION_IDS = ['dashboard','sales','pembelian','ops','stok','shift','social','approval','team','sistem'];
  var OWNER_TABS = ['dashboard','sales','pembelian','ops','stok','shift','social','sistem'];
  var GROUPS = {
    ops: ['ops','approval'],
    shift: ['shift','team']
  };
  var state = {
    active: 'dashboard',
    initialized: false,
    scheduled: false,
    salesRetries: 0,
    stockNudgeAt: 0
  };

  function context() {
    return window.__HASNARIA_CONTEXT || null;
  }

  function isOwner() {
    var c = context();
    return !!(c && c.role === 'owner');
  }

  function section(id) {
    return document.getElementById(id);
  }

  function currentActive() {
    var on = document.querySelector('#tabs .tab.on[data-tab]');
    var id = on && on.getAttribute('data-tab');
    if (OWNER_TABS.indexOf(id) >= 0) return id;
    for (var i = 0; i < OWNER_TABS.length; i++) {
      var el = section(OWNER_TABS[i]);
      if (el && !el.classList.contains('hidden')) return OWNER_TABS[i];
    }
    return 'dashboard';
  }

  function visibleIds(id) {
    return GROUPS[id] ? GROUPS[id].slice() : [id];
  }

  function setVisibility(id) {
    var visible = visibleIds(id);
    SECTION_IDS.forEach(function (name) {
      var el = section(name);
      if (el) el.classList.toggle('hidden', visible.indexOf(name) < 0);
    });
    var tabs = document.querySelectorAll('#tabs .tab[data-tab]');
    Array.prototype.forEach.call(tabs, function (button) {
      button.classList.toggle('on', button.getAttribute('data-tab') === id);
    });
  }

  function ensureDashboard() {
    var host = section('dashboard');
    if (!host || host.classList.contains('hidden')) return;
    if (host.querySelector('.erp-top')) return;
    if (window.HasnariaERP && typeof window.HasnariaERP.mount === 'function') {
      window.HasnariaERP.mount();
    }
  }

  function ensureSales() {
    var host = section('sales');
    if (!host || host.classList.contains('hidden')) return;
    if (host.querySelector('.sale-board')) {
      state.salesRetries = 0;
      return;
    }
    if (typeof window.__hasnariaReloadSales === 'function') {
      state.salesRetries = 0;
      window.__hasnariaReloadSales();
      return;
    }
    if (state.salesRetries >= 40) return;
    state.salesRetries += 1;
    setTimeout(function () {
      if (isOwner() && state.active === 'sales') ensureSales();
    }, 100);
  }

  function ensureStock() {
    var host = section('stok');
    if (!host || host.classList.contains('hidden') || host.querySelector('.sr-shell')) return;
    var now = Date.now();
    if (now - state.stockNudgeAt < 350) return;
    state.stockNudgeAt = now;
    // stock-reconcile-v2 owns its own MutationObserver. A child mutation wakes it
    // after programmatic ERP navigation without calling any stock write path.
    var marker = document.createElement('span');
    marker.hidden = true;
    marker.setAttribute('data-owner-shell-stock-nudge', '1');
    host.appendChild(marker);
    host.removeChild(marker);
  }

  function patchContext() {
    var c = context();
    if (!c || c.role !== 'owner') return;
    if (c.navigate !== safeNavigate) c.navigate = safeNavigate;
  }

  function dispatchNavigate(id) {
    try {
      document.dispatchEvent(new CustomEvent('hasnaria:owner-shell-navigate', { detail: { tab: id } }));
    } catch (_) {}
  }

  function safeNavigate(id) {
    if (!isOwner()) return false;
    if (OWNER_TABS.indexOf(id) < 0) return false;
    state.active = id;
    state.initialized = true;
    state.salesRetries = 0;
    setVisibility(id);
    patchContext();
    if (id === 'dashboard') ensureDashboard();
    if (id === 'sales') ensureSales();
    if (id === 'stok') setTimeout(ensureStock, 0);
    dispatchNavigate(id);
    return true;
  }

  function reconcile() {
    if (!isOwner()) return;
    if (!state.initialized) {
      state.active = currentActive();
      state.initialized = true;
    }
    patchContext();
    setVisibility(state.active);
    if (state.active === 'dashboard') ensureDashboard();
    if (state.active === 'sales') ensureSales();
    if (state.active === 'stok') ensureStock();
  }

  function scheduleReconcile() {
    if (state.scheduled) return;
    state.scheduled = true;
    setTimeout(function () {
      state.scheduled = false;
      reconcile();
    }, 0);
  }

  // Capture phase is deliberate: stop the legacy tab's target/bubble handler
  // before it calls setTab()->render(). We use stopPropagation (not
  // stopImmediatePropagation) so Stock's own document-capture listener can
  // still run on the same node.
  document.addEventListener('click', function (event) {
    if (!isOwner()) return;
    var target = event.target && event.target.closest ? event.target.closest('#tabs .tab[data-tab]') : null;
    if (!target) return;
    var id = target.getAttribute('data-tab');
    if (OWNER_TABS.indexOf(id) < 0) return;
    event.preventDefault();
    event.stopPropagation();
    safeNavigate(id);
  }, true);

  function start() {
    if (!document.body) return;
    var observer = new MutationObserver(scheduleReconcile);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleReconcile();
  }

  window.__HASNARIA_OWNER_SHELL = {
    navigate: safeNavigate,
    isOwner: isOwner,
    getActive: function () { return state.active; },
    reconcile: reconcile
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
