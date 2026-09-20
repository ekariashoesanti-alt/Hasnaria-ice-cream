(function(){
  'use strict';
  if(window.__HASNARIA_PURCHASE_RANKINGS_FIVE)return;
  window.__HASNARIA_PURCHASE_RANKINGS_FIVE=true;

  var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var GROUPS=['Operasi','Administrasi','Investasi','Karyawan'];
  var db=null,observer=null,timer=0,fetching=null;

  function clean(v){return String(v==null?'':v).trim().replace(/\s+/g,' ');}
  function norm(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function rawObj(r){if(r&&r.raw_data&&typeof r.raw_data==='object')return r.raw_data;if(r&&typeof r.raw_data==='string'){try{return JSON.parse(r.raw_data);}catch(_){}}return{};}
  function groupFallback(item,cat){var s=(clean(item)+' '+clean(cat)).toUpperCase();if(/GAJI|KARYAWAN|SERAGAM|JAS HUJAN|SANDAL|HANDUK|BANTAL|MAYBELLINE|KULOT|BAJU RENANG|MAKAN SIANG/.test(s))return'Karyawan';if(/INVEST|AKRILIK|FREEZER|FURNITURE|PERALATAN|MESIN|ASET/.test(s))return'Investasi';if(/FC LAPORAN|FOTOKOPI|PULPEN|ATK|KERTAS KASIR|KERTAS PRINT|LAPORAN|MAJOO|ADMIN/.test(s))return'Administrasi';return'Operasi';}
  function analytics(r){var raw=rawObj(r),cat=raw.analytics_category||raw.category||'',group=raw.analytics_group||groupFallback(r.item_name,cat),kind=raw.analytics_kind||(raw.record_type==='RINGKASAN_BIAYA'?'cost_component':'purchase_item');return{group:GROUPS.indexOf(group)>=0?group:groupFallback(r.item_name,cat),kind:kind};}
  function fmtMoney(v){var n=Number(v||0),a=Math.abs(n);if(a>=1e9)return'Rp '+(n/1e9).toLocaleString('id-ID',{maximumFractionDigits:1})+' M';if(a>=1e6)return'Rp '+(n/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';if(a>=1e3)return'Rp '+(n/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';return'Rp '+n.toLocaleString('id-ID',{maximumFractionDigits:0});}
  function pct(v){if(v==null||!isFinite(v))return'NEW';return(v>0?'+':'')+v.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';}

  function totals(rows,period,scope){
    var out={};
    rows.forEach(function(r){
      if(String(r.source_period||'').slice(0,7)!==period)return;
      var a=analytics(r);
      if(a.kind!=='purchase_item')return;
      if(scope!=='all'&&a.group!==scope)return;
      var name=clean(r.item_name||'Tanpa nama'),key=norm(name),amount=Number(r.total_amount||0);
      if(!key||!(amount>0))return;
      if(!out[key])out[key]={name:name,total:0};
      out[key].total+=amount;
    });
    return out;
  }

  function rankingRows(items,max){
    max=max||1;
    return items.map(function(x){
      var cls=x.change!=null&&x.change<0?'pa-down':'pa-up';
      return '<div class="pa-bar-row"><span class="pa-bar-name">'+esc(x.name)+'</span><progress max="'+max+'" value="'+x.total+'"></progress><b>'+esc(fmtMoney(x.total))+'</b><em class="'+cls+'">'+esc(pct(x.change))+'</em></div>';
    }).join('');
  }

  function replaceCard(card,items,isFewest){
    if(!card)return;
    var h=card.querySelector('h2');
    if(!h){h=document.createElement('h2');card.insertBefore(h,card.firstChild);}
    h.textContent='';
    Array.prototype.slice.call(card.children).forEach(function(el){if(el!==h)el.remove();});
    if(isFewest)card.classList.add('pa-fewest');else card.classList.remove('pa-fewest');
    if(!items.length){
      var empty=document.createElement('div');
      empty.className='pa-empty';
      empty.textContent='Belum ada item pembelian pada periode ini.';
      card.appendChild(empty);
      return;
    }
    var max=Math.max.apply(null,items.map(function(x){return x.total;}))||1;
    var wrap=document.createElement('div');
    wrap.className='pa-bars';
    wrap.innerHTML=rankingRows(items,max);
    card.appendChild(wrap);
  }

  function apply(rows){
    var host=document.getElementById('pembelian'),periodEl=document.getElementById('paPeriod'),scopeEl=document.getElementById('paScope');
    if(!host||host.classList.contains('hidden')||!periodEl)return;
    var period=String(periodEl.value||'').slice(0,7),scope=scopeEl?scopeEl.value:'all';
    if(!period)return;
    var periods={};
    rows.forEach(function(r){var p=String(r.source_period||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(p))periods[p]=1;});
    var ps=Object.keys(periods).sort(),idx=ps.indexOf(period),prevPeriod=idx>0?ps[idx-1]:null;
    var cur=totals(rows,period,scope),prev=prevPeriod?totals(rows,prevPeriod,scope):{};
    var all=Object.keys(cur).map(function(k){var x=cur[k],pv=prev[k]?prev[k].total:0;return{name:x.name,total:x.total,change:pv>0?(x.total-pv)/pv*100:null};}).filter(function(x){return x.total>0;});
    var top=all.slice().sort(function(a,b){return b.total-a.total||a.name.localeCompare(b.name);}).slice(0,5);
    var fewest=all.slice().sort(function(a,b){return a.total-b.total||a.name.localeCompare(b.name);}).slice(0,5);
    replaceCard(host.querySelector('.pa-lower-grid>.pa-top'),top,false);
    replaceCard(host.querySelector('.pa-lower-grid>article:nth-child(2)'),fewest,true);
  }

  function fetchAndApply(){
    db=db||window.__HASNARIA_DB;
    if(!db)return;
    if(fetching)return fetching.then(apply).catch(function(){});
    fetching=db.from('offline_purchase_history').select('source_period,item_name,total_amount,raw_data').eq('brand_id',BRAND).order('source_period',{ascending:true}).limit(10000).then(function(r){if(r.error)throw r.error;return r.data||[];}).finally(function(){fetching=null;});
    return fetching.then(apply).catch(function(e){console.warn('Purchase rankings:',e&&e.message?e.message:e);});
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(fetchAndApply,70);}
  function boot(){
    var tries=0;(function wait(){
      db=db||window.__HASNARIA_DB||null;
      var host=document.getElementById('pembelian');
      if(db&&host){
        if(observer)observer.disconnect();
        observer=new MutationObserver(function(m){if(m.some(function(x){return x.type==='childList'&&x.target===host;}))schedule();});
        observer.observe(host,{childList:true,subtree:false});
        document.addEventListener('change',function(e){if(e.target&&(e.target.id==='paPeriod'||e.target.id==='paScope'))setTimeout(schedule,20);},true);
        document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-tab="pembelian"],#paUpload'):null;if(b)setTimeout(schedule,180);},true);
        schedule();return;
      }
      if(tries++<120)setTimeout(wait,100);
    })();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
