(function () {
  var CORE = "https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js";
  var originalCreate;
  function hideJalur() {
    document.querySelectorAll("#dashboard .card").forEach(function (card) {
      if (card.textContent && card.textContent.indexOf("Jalur komando") !== -1) card.style.display = "none";
    });
  }
  function bindTabMemory() {
    if (window.__hasnariaTabBound) return;
    window.__hasnariaTabBound = true;
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest(".tab") : null;
      if (!t) return;
      var id = t.getAttribute("data-tab");
      if (!id) return;
      try { sessionStorage.setItem("hasnaria_tab", id); } catch (err) {}
    });
    var tabs = document.getElementById("tabs");
    if (!tabs) return;
    new MutationObserver(function () {
      var saved = null;
      try { saved = sessionStorage.getItem("hasnaria_tab"); } catch (err) {}
      if (!saved || saved === "dashboard") return;
      var btn = tabs.querySelector('.tab[data-tab="' + saved + '"]');
      if (btn && !btn.classList.contains("on")) btn.click();
    }).observe(tabs, { childList: true });
  }
  function bindSaveGuard() {
    if (window.__hasnariaSaveGuard) return;
    window.__hasnariaSaveGuard = true;
    document.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      var id = b.id || "";
      var watch = id === "sSave" || id === "oSave" || id === "cSave" || id === "lzSave" || id === "svOpen" || id === "svHand" || id === "svClose" || b.hasAttribute("data-stk") || b.hasAttribute("data-ok") || b.hasAttribute("data-no") || b.hasAttribute("data-lzok") || b.hasAttribute("data-lzno");
      if (!watch) return;
      if (b.getAttribute("data-busy") === "1") { e.preventDefault(); e.stopImmediatePropagation(); return; }
      b.setAttribute("data-busy", "1");
      setTimeout(function () { try { b.removeAttribute("data-busy"); } catch (err) {} }, 1800);
    }, true);
  }
  function patch() {
    if (typeof window.supabase === "undefined" || !window.supabase.createClient) return setTimeout(patch, 40);
    if (!originalCreate) originalCreate = window.supabase.createClient;
    if (!window.__hasnariaAuthPatched) {
      window.supabase.createClient = function (url, key, options) {
        options = options || {};
        options.auth = Object.assign({}, options.auth || {}, { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" });
        return originalCreate.call(window.supabase, url, key, options);
      };
      window.__hasnariaAuthPatched = true;
    }
    if (window.__hasnariaCoreLoaded) return;
    window.__hasnariaCoreLoaded = true;
    var s = document.createElement("script");
    s.src = CORE;
    s.onload = function () {
      bindTabMemory();
      bindSaveGuard();
      var mon = document.createElement("script");
      mon.src = "/stock-monitor.js?v=p014";
      mon.onerror = function () {
        var f = document.createElement("script");
        f.src = "https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@0d63bfa98e3ebcf83bacc53bb7e9131c0ed9873d/stock-monitor.js";
        document.body.appendChild(f);
      };
      mon.async = false;
      document.body.appendChild(mon);
      setTimeout(hideJalur, 400);
      setTimeout(hideJalur, 1200);
      var dash = document.getElementById("dashboard");
      if (dash) new MutationObserver(hideJalur).observe(dash, { childList: true, subtree: true });
    };
    s.onerror = function () {
      window.__hasnariaCoreLoaded = false;
      var m = document.getElementById("authMsg");
      if (m) m.textContent = "Gagal memuat Command Center. Refresh halaman.";
    };
    document.body.appendChild(s);
  }
  patch();
})();
