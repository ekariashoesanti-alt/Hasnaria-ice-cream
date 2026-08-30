(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru', '5 Worst Performer (Qty)'];
  var timer = null;
  function hideSalesPanels(){var host=document.getElementById('sales');if(!host||host.classList.contains('hidden'))return;HIDDEN.forEach(function(label){Array.prototype.forEach.call(host.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span,strong,b'),function(el){var text=(el.textContent||'').replace(/\s+/g,' ').trim();if(text!==label)return;var panel=el.closest('.sb-card,.card,.panel,.box,.section')||el.parentElement;if(panel&&panel!==host){panel.setAttribute('data-backend-hidden','1');panel.style.display='none';}else if(el!==host)el.style.display='none';});});}
  function hideGraphFooter(){var host=document.getElementById('sales');if(!host)return;Array.prototype.forEach.call(host.querySelectorAll('div,p,span,small,footer'),function(el){var text=(el.textContent||'').replace(/\s+/g,' ').trim();if(text.indexOf('Data dashboard hanya berasal dari tabel')===0&&text.indexOf('daily_metrics')!==-1&&text.indexOf('Form omzet + kas harian tetap ada di bawah dashboard ini.')!==-1){el.style.display='none';}});}
  function injectStyle(){if(document.getElementById('hasnaria-sales-layout-style'))return;var s=document.createElement('style');s.id='hasnaria-sales-layout-style';s.textContent=`
#sales{width:100%!important;min-width:0;overflow:visible!important}
#sales .sale-board,#sales .sb-wrap{width:100%!important;max-width:none!important;min-width:0!important;margin-left:0!important;margin-right:0!important}
#sales .sb-wrap{padding:10px 14px!important}
#sales .sb-grid-main{display:grid!important;grid-template-columns:minmax(0,3fr) minmax(250px,1fr)!important;gap:10px!important;align-items:start}
#sales .sb-kpis{width:100%;min-width:0}
#sales .sb-card{min-width:0;overflow:hidden}
#sales .sb-grid-main>.sb-card:first-child .sb-chart{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important}
#sales .sales-right-stack{display:flex!important;flex-direction:column!important;gap:8px!important;min-width:0}
#sales .sales-right-stack .sb-card{width:100%!important;box-sizing:border-box!important;padding:10px 11px!important;margin:0!important}
#sales .sales-right-stack .sb-card h3{margin:0!important}
#sales .sales-right-stack .sb-bars{margin-top:4px!important}
#sales .sales-right-stack .sb-bar-row{margin:4px 0!important}
#sales .sales-right-stack .sb-live-note{margin-top:4px!important;padding:5px 7px!important}
#sales .sb-import{display:none!important}
@media(max-width:1100px) and (min-width:701px){#sales .sb-grid-main{grid-template-columns:minmax(0,2.5fr) minmax(230px,1fr)!important}}
@media(max-width:700px){#sales .sb-grid-main{grid-template-columns:1fr!important}#sales .sb-grid-main>.sb-card:first-child .sb-chart{width:100%!important;max-width:100%!important}}
`;
    document.head.appendChild(s);
  }
  function removeWorstEverywhere(){var host=document.getElementById('sales');if(!host)return;Array.prototype.forEach.call(host.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span,strong,b'),function(el){if((el.textContent||'').replace(/\s+/g,' ').trim()!=='5 Worst Performer (Qty)')return;var panel=el.closest('.sb-card,.card,.panel,.box,.section')||el.parentElement;if(panel&&panel!==host)panel.remove();else el.remove();});}
  function fit(){var host=document.getElementById('sales'),board=host&&host.querySelector('.sale-board');if(!host||host.classList.contains('hidden')||!board)return;board.style.transform='none';board.style.maxHeight='none';board.style.height='auto';board.style.overflow='visible';host.style.maxHeight='none';host.style.height='auto';host.style.overflow='visible';}
  function run(){injectStyle();hideSalesPanels();requestAnimationFrame(function(){removeWorstEverywhere();hideGraphFooter();fit();});}
  function start(){run();new MutationObserver(run).observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',run);timer=setInterval(run,800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
