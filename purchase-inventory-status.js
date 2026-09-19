(function(){
  'use strict';
  if(window.__HASNARIA_PURCHASE_INVENTORY_STATUS)return;
  window.__HASNARIA_PURCHASE_INVENTORY_STATUS=true;

  var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var STOCK_CATS={'Makanan':1,'Minuman':1,'Ice Cream':1,'Snack':1,'Kemasan & Supplies':1};
  var db=null,observer=null,timer=0,fetching=null,lastRoot=null;

  function addCss(id,href){
    if(document.getElementById(id))return;
    var l=document.createElement('link');
    l.id=id;
    l.rel='stylesheet';
    l.href=href;
    document.head.appendChild(l);
  }
  function ensureCompactCss(){
    addCss('hasnaria-purchase-compact-css','/purchase-compact.css?v=2');
    addCss('hasnaria-purchase-width-fix-css','/purchase-width-fix.css?v=1');
  }
  function resetHorizontalViewport(){
    try{
      document.documentElement.scrollLeft=0;
      if(document.body)document.body.scrollLeft=0;
      if(window.scrollX)window.scrollTo(0,window.scrollY||0);
    }catch(_){}
  }

  function clean(v){return String(v==null?'':v).trim().replace(/\s+/g,' ');}
  function norm(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function periodLabel(p){if(!/^\d{4}-\d{2}/.test(String(p||'')))return'—';return(MONTHS[Number(p.slice(5,7))-1]||p.slice(5,7))+' '+p.slice(0,4);}
  function rawObj(r){if(r&&r.raw_data&&typeof r.raw_data==='object')return r.raw_data;if(r&&typeof r.raw_data==='string'){try{return JSON.parse(r.raw_data);}catch(_){}}return{};}
  function analytics(r){var raw=rawObj(r),cat=raw.analytics_category||raw.category||'',group=raw.analytics_group||'',kind=raw.analytics_kind||(raw.record_type==='RINGKASAN_BIAYA'?'cost_component':'purchase_item');return{category:cat,group:group,kind:kind};}

  function fallbackStockable(r){
    var a=analytics(r),u=clean(r.item_name).toUpperCase();
    if(a.kind!=='purchase_item')return false;
    if(a.group&&a.group!=='Operasi')return false;
    if(/TOKEN LISTRIK|LISTRIK|INTERNET|PAKET DATA|SEWA|GAJI|KARYAWAN|PROMOSI|MAJOO|FOTOKOPI|FC LAPORAN|PULPEN|ATK|LAPORAN|INVEST|AKRILIK|FREEZER|FURNITURE|MESIN|ASET/.test(u))return false;
    if(STOCK_CATS[a.category])return true;
    return /GAS|GALON|AQUA|AIR MINERAL|PLASTIK|KEMASAN|CUP|CONE|SENDOK|GARPU|MANGKOK|PAPER|TISU|TISSUE|SABUN|SUNLIGHT|DETERGEN|SARUNG TANGAN|BUSA|SEDOTAN|STRAW|BOTOL|TUTUP|BAHAN|BUMBU|ODENG|TOPOKKI|TTEOK|SOSIS|MIE|SIRUP|TEH|KRIMER|CREAMER|ICE CREAM|ES KRIM|TOPPING/.test(u);
  }

  function loadData(){
    if(fetching)return fetching;
    db=db||window.__HASNARIA_DB;
    if(!db)return Promise.reject(new Error('Database belum siap'));
    fetching=Promise.all([
      db.from('offline_purchase_history').select('source_period,item_name,total_amount,raw_data').eq('brand_id',BRAND).order('source_period',{ascending:true}).limit(10000),
      db.from('purchase_item_rules').select('source_name,normalized_source_name,inventory_item_id,rule_type,active').eq('brand_id',BRAND).eq('active',true).limit(2000),
      db.from('inventory_items').select('id,item_name,category').eq('brand_id',BRAND).limit(2000)
    ]).then(function(all){
      var purchase=all[0],rules=all[1],inventory=all[2];
      if(purchase.error)throw purchase.error;
      return{rows:purchase.data||[],rules:rules&&rules.error?[]:(rules.data||[]),inventory:inventory&&inventory.error?[]:(inventory.data||[])};
    }).finally(function(){fetching=null;});
    return fetching;
  }

  function buildIdentity(data){
    var inv={},invByNorm={},alias={};
    data.inventory.forEach(function(x){inv[x.id]=x;var n=norm(x.item_name);if(n)invByNorm[n]=x.id;});
    data.rules.forEach(function(x){if(x.rule_type!=='inventory_alias'||!x.inventory_item_id)return;var n=norm(x.normalized_source_name||x.source_name);if(n)alias[n]=x.inventory_item_id;});
    return function(r){
      var n=norm(r.item_name),id=alias[n]||invByNorm[n]||null,x=id?inv[id]:null;
      return{key:id?'inv:'+id:'name:'+n,name:x&&x.item_name?clean(x.item_name):clean(r.item_name),inventory:x||null,stockable:!!x||fallbackStockable(r)};
    };
  }

  function compute(data,selected){
    var identify=buildIdentity(data),pSet={},meta={},by={};
    data.rows.forEach(function(r){var p=String(r.source_period||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(p))pSet[p]=1;});
    var periods=Object.keys(pSet).sort().filter(function(p){return p<=selected;}),idx=periods.indexOf(selected);
    periods.forEach(function(p){by[p]={};});
    if(idx<0)return{shortage:[],discontinue:[],periods:periods};

    data.rows.forEach(function(r){
      var p=String(r.source_period||'').slice(0,7);if(periods.indexOf(p)<0||!(Number(r.total_amount||0)>0))return;
      var id=identify(r);if(!id.key||!id.stockable)return;
      if(!by[p][id.key])by[p][id.key]=0;by[p][id.key]+=Number(r.total_amount||0);
      if(!meta[id.key])meta[id.key]={name:id.name||clean(r.item_name),category:(id.inventory&&id.inventory.category)||analytics(r).category||'Persediaan'};
    });

    var shortage=[],discontinue=[];
    Object.keys(meta).forEach(function(k){
      if(by[selected]&&by[selected][k]>0)return;
      var last=-1;
      for(var i=idx-1;i>=0;i--){if(by[periods[i]]&&by[periods[i]][k]>0){last=i;break;}}
      if(last<0)return;
      var streak=idx-last,item={name:meta[k].name,category:meta[k].category,lastPeriod:periods[last],streak:streak,lastAmount:by[periods[last]][k]||0};
      if(streak>=3)discontinue.push(item);
      else if(streak>=1)shortage.push(item);
    });
    shortage.sort(function(a,b){return b.lastAmount-a.lastAmount||a.name.localeCompare(b.name);});
    discontinue.sort(function(a,b){return b.streak-a.streak||b.lastAmount-a.lastAmount||a.name.localeCompare(b.name);});
    return{shortage:shortage,discontinue:discontinue,periods:periods};
  }

  function listHtml(arr,type){
    if(!arr.length)return'<div class="pa-empty">'+(type==='shortage'?'Tidak ada item persediaan yang perlu perhatian pada periode ini.':'Belum ada item yang memenuhi aturan 3 periode tanpa pembelian.')+'</div>';
    var max=4,shown=arr.slice(0,max),more=arr.length-shown.length;
    return'<div class="pa-list'+(type==='discontinue'?' pa-list-muted':'')+'">'+shown.map(function(x){var badge=type==='discontinue'?'Discontinue':(x.streak+' / 3 periode');var note='Terakhir dibeli '+periodLabel(x.lastPeriod)+(type==='discontinue'?' · '+x.streak+' periode data valid tanpa pembelian':' · cek stok / reorder');return'<div><span>'+esc(x.name)+'</span><b>'+esc(badge)+'</b><small>'+esc(note)+'</small></div>';}).join('')+'</div>'+(more>0?'<div class="pa-stock-more">+'+more.toLocaleString('id-ID')+' item lainnya</div>':'');
  }

  function patch(status,root){
    if(!root||!root.isConnected)return;
    var kpis=root.querySelectorAll('.pa-kpis article');
    if(kpis.length){
      var k=kpis[kpis.length-1];
      k.innerHTML='<span>Status Persediaan</span><strong>'+status.shortage.length.toLocaleString('id-ID')+' kurang · '+status.discontinue.length.toLocaleString('id-ID')+' hapus</strong><small>bahan baku & perlengkapan stockable</small>';
    }
    var lower=root.querySelectorAll('.pa-lower-grid article');
    if(lower.length){
      var card=lower[lower.length-1];
      card.innerHTML='<div class="pa-stock-grid"><section class="pa-stock-section"><div class="pa-stock-head"><h2>Persediaan Kurang</h2><span class="pa-stock-count">'+status.shortage.length.toLocaleString('id-ID')+' item</span></div><p class="pa-sub">Tidak dibeli lagi selama 1–2 periode data valid.</p>'+listHtml(status.shortage,'shortage')+'</section><section class="pa-stock-section"><div class="pa-stock-head"><h2>Persediaan Hapus</h2><span class="pa-stock-count">'+status.discontinue.length.toLocaleString('id-ID')+' item</span></div><p class="pa-sub">Tidak dibeli ≥3 periode data valid berturut-turut.</p>'+listHtml(status.discontinue,'discontinue')+'</section></div>';
    }
    var insight=root.querySelector('.pa-insight ol');
    if(insight){
      var li=Array.prototype.slice.call(insight.querySelectorAll('li')).filter(function(x){return /item tidak muncul|discontinue|persediaan/i.test(x.textContent||'');})[0];
      var msg=status.shortage.length+' item masuk Persediaan Kurang dan '+status.discontinue.length+' item masuk Persediaan Hapus / Discontinue berdasarkan periode data valid.';
      if(li)li.textContent=msg;else if(status.shortage.length||status.discontinue.length){li=document.createElement('li');li.textContent=msg;insight.appendChild(li);}
    }
  }

  function refresh(force){
    clearTimeout(timer);timer=setTimeout(function(){
      resetHorizontalViewport();
      var root=document.getElementById('paRoot'),period=document.getElementById('paPeriod');
      if(!root||!period)return;
      if(!force&&root===lastRoot&&root.getAttribute('data-inventory-status-period')===period.value)return;
      lastRoot=root;root.setAttribute('data-inventory-status-period',period.value);
      loadData().then(function(data){patch(compute(data,period.value),root);}).catch(function(e){console.warn('Purchase inventory status:',e&&e.message?e.message:e);});
    },40);
  }

  function boot(){
    ensureCompactCss();
    resetHorizontalViewport();
    db=window.__HASNARIA_DB||null;
    var tries=0;(function wait(){
      db=db||window.__HASNARIA_DB||null;
      var host=document.getElementById('pembelian');
      if(db&&host){
        if(observer)observer.disconnect();
        observer=new MutationObserver(function(m){
          var replaced=m.some(function(x){return x.type==='childList'&&x.target===host;});
          if(replaced)refresh(true);
        });
        observer.observe(host,{childList:true,subtree:false});
        document.addEventListener('change',function(e){if(e.target&&e.target.id==='paPeriod')refresh(true);},true);
        document.addEventListener('click',function(e){
          var b=e.target&&e.target.closest?e.target.closest('#paUpload,[data-tab="pembelian"]'):null;
          if(b)setTimeout(function(){resetHorizontalViewport();refresh(true);},120);
        },true);
        window.addEventListener('resize',function(){resetHorizontalViewport();});
        resetHorizontalViewport();refresh(true);return;
      }
      if(tries++<120)setTimeout(wait,100);
    })();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
