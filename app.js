(function () {
  var CORE = "https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js";
  var OFFLINE = "/offline-sync.js";
  var loaded = false;
  function loadScript(src, onload) {
    var s = document.createElement("script"); s.src = src; s.async = false;
    if (onload) s.onload = onload;
    s.onerror = function () { var m=document.getElementById("authMsg"); if(m)m.textContent="Gagal memuat komponen Hasnaria. Silakan refresh halaman."; };
    document.body.appendChild(s);
  }
  function load() { if(loaded)return; loaded=true; loadScript(CORE,function(){loadScript(OFFLINE);}); }
  if(typeof window.supabase!=="undefined") load(); else { var tries=0; (function wait(){ if(typeof window.supabase!=="undefined")return load(); if(tries++>100){var m=document.getElementById("authMsg");if(m)m.textContent="Pustaka login belum siap. Silakan refresh halaman.";return;} setTimeout(wait,50); })(); }
})();
