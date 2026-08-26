(function () {
  var src = "https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js";
  var s = document.createElement("script");
  s.src = src;
  s.async = false;
  s.onerror = function () {
    var el = document.getElementById("authMsg");
    if (el) el.textContent = "Gagal memuat aplikasi. Refresh halaman.";
  };
  document.head.appendChild(s);
})();
