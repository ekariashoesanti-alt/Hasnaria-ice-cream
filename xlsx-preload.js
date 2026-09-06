(function(){
  if (window.XLSX) return;
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  s.async=true;
  document.head.appendChild(s);
})();
