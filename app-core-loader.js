(function(){'use strict';
var CORE='/app-core.js?v=20260902';
function load(src,done){var s=document.createElement('script');s.src=src;s.async=false;s.onload=function(){done&&done()};s.onerror=function(){console.error('Hasnaria module gagal dimuat:',src);done&&done()};document.head.appendChild(s)}
function afterCore(){
 load('/stock-monitor.js?v=25',function(){setTimeout(function(){window.fixStockLayout&&window.fixStockLayout()},100)});
 load('/sales-board.js?v=8',function(){load('/sales-ui-patch.js?v=5')});
}
load(CORE,afterCore);
})();
