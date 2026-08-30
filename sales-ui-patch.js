(function () {
  'use strict';
  var HIDDEN = ['Omzet + kas harian', 'Data terbaru'];
  var timer = null;
  function hideSalesPanels(){var host=document.getElementById('sales');if(!host||host.classList.contains('hidden'))return;HIDDEN.forEach(function(label){Array.prototype.forEach.call(host.querySelectorAll('h1,h2,h3,h4,h5,h6,div,p,span,strong,b'),function(el){var text=(el.textContent||'').replace(/\s+/g,' ').trim();if(text!==label||el.getAttribute('data-backend-hidden')==='1')return;var panel=el.closest('.card,.panel,.box,.section')||el.parentElement;if(panel&&panel!==host){panel.setAttribute('data-backend-hidden','1');panel.style.display='none';}});});}
  function injectStyle(){if(document.getElementById('hasnaria-sales-layout-style'))return;var s=document.createElement('style');s.id='hasnaria-sales-layout-style';s.textContent=`
#sales{width:100%!important;min-width:0;overflow:visible!important}
#sales .sale-board,#sales .sb-wrap{width:100%!important;max-width:none!important;min-width:0!important;margin-left:0!important;margin-right:0!important}
#sales .sb-wrap{padding:10px 14px!important}
#sales .sb-grid-main{display:grid!important;grid-template-columns:minmax(0,3fr) minmax(250px,1fr)!important;gap:10px!important;align-items:start}
#sales .sb-kpis{width:100%;min-width:0}
#sales .sb-card{min-width:0;overflow:hidden}
#sales .sb-grid-main>.sb-card:first-child .sb-chart{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important}
#sales .sales-right-stack{display:flex!important;flex-direction:column!important;gap:8px!important;min-width:0}
#sales .sales-right-stack .sb-card{width:100%!important;min-height:0!important;height:auto!important;box-sizing:border-box!important;padding:10px 11px!important;margin:0!important}
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
  function textOf(el){return(el.textContent||'').replace(/\s+/g,' ').trim();}
  function findHeading(card,wanted){var found=null;Array.prototype.some.call(card.querySelectorAll('h1,h2,h3,h4,h5,h6'),function(h){if(textOf(h)===wanted){found=h;return true;}return false;});return found;}
  function sectionParts(card,heading){var head=heading.closest('.sb-card-head')||heading.parentElement,parts=[head],n=head.nextElementSibling;while(n){if(n.classList&&n.classList.contains('sb-card-head'))break;if(n.classList&&(n.classList.contains('sb-live-note')||n.classList.contains('sb-legacy-note')))break;parts.push(n);n=n.nextElementSibling;}return parts;}
  function splitPerformerBoxes(){var host=document.getElementById('sales');if(!host||host.classList.contains('hidden'))return;var grids=host.querySelectorAll('.sb-grid-main');for(var gi=0;gi<grids.length;gi++){var grid=grids[gi];if(grid.getAttribute('data-performers-split')==='1')continue;var cards=Array.prototype.slice.call(grid.querySelectorAll(':scope > .sb-card'));var performerCard=null;cards.some(function(c){if(findHeading(c,'Top 5 Seller (Qty)')||findHeading(c,'5 Worst Performer (Qty)')){performerCard=c;return true;}return false;});if(!performerCard)continue;var top=findHeading(performerCard,'Top 5 Seller (Qty)'),worst=findHeading(performerCard,'5 Worst Performer (Qty)');if(!top||!worst)continue;var stack=document.createElement('div');stack.className='sales-right-stack';function makeCard(heading){var c=document.createElement('div');c.className='sb-card';sectionParts(performerCard,heading).forEach(function(node){c.appendChild(node);});return c;}stack.appendChild(makeCard(top));stack.appendChild(makeCard(worst));performerCard.replaceWith(stack);grid.setAttribute('data-performers-split','1');}}
  function equalizePerformerBoxes(){var host=document.getElementById('sales');if(!host)return;var stack=host.querySelector('.sales-right-stack');if(!stack)return;var boxes=stack.querySelectorAll(':scope > .sb-card');if(boxes.length<2)return;boxes.forEach(function(b){b.style.height='auto';b.style.minHeight='0';});var max=0;boxes.forEach(function(b){max=Math.max(max,b.getBoundingClientRect().height);});boxes.forEach(function(b){b.style.height=Math.ceil(max)+'px';});}
  function fit(){var host=document.getElementById('sales'),board=host&&host.querySelector('.sale-board');if(!host||host.classList.contains('hidden')||!board)return;board.style.transform='none';board.style.maxHeight='none';board.style.height='auto';board.style.overflow='visible';host.style.maxHeight='none';host.style.height='auto';host.style.overflow='visible';equalizePerformerBoxes();}
  function run(){injectStyle();hideSalesPanels();requestAnimationFrame(function(){splitPerformerBoxes();fit();});}
  function start(){run();new MutationObserver(run).observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',run);timer=setInterval(run,1200);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
