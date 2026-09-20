(function(){
  'use strict';
  if(window.__HASNARIA_PURCHASE_CHART_REDESIGN)return;
  window.__HASNARIA_PURCHASE_CHART_REDESIGN=true;

  var BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  var GROUPS=['Operasi','Administrasi','Investasi','Karyawan'];
  var GROUP_CLASS={Operasi:'pa-c0',Administrasi:'pa-c1',Investasi:'pa-c2',Karyawan:'pa-c3'};
  var MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var db=null,fetching=null,hostObserver=null,timer=0;

  function addCss(){
    if(document.getElementById('hasnaria-purchase-chart-redesign-css'))return;
    var l=document.createElement('link');
    l.id='hasnaria-purchase-chart-redesign-css';
    l.rel='stylesheet';
    l.href='/purchase-chart-redesign.css?v=1';
    document.head.appendChild(l);
  }
  function clean(v){return String(v==null?'':v).trim().replace(/\s+/g,' ');}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function rawObj(r){if(r&&r.raw_data&&typeof r.raw_data==='object')return r.raw_data;if(r&&typeof r.raw_data==='string'){try{return JSON.parse(r.raw_data);}catch(_){}}return{};}
  function groupFallback(item,cat){
    var s=(clean(item)+' '+clean(cat)).toUpperCase();
    if(/GAJI|KARYAWAN|SERAGAM|JAS HUJAN|SANDAL|HANDUK|BANTAL|MAYBELLINE|KULOT|BAJU RENANG|MAKAN SIANG/.test(s))return'Karyawan';
    if(/INVEST|AKRILIK|FREEZER|FURNITURE|PERALATAN|MESIN|ASET/.test(s))return'Investasi';
    if(/FC LAPORAN|FOTOKOPI|PULPEN|ATK|KERTAS KASIR|KERTAS PRINT|LAPORAN|MAJOO|ADMIN/.test(s))return'Administrasi';
    return'Operasi';
  }
  function analyticsGroup(r){
    var raw=rawObj(r),group=clean(raw.analytics_group||raw.group||'');
    return GROUPS.indexOf(group)>=0?group:groupFallback(r.item_name,raw.analytics_category||raw.category||'');
  }
  function fmtMoney(v){
    var n=Number(v||0),a=Math.abs(n);
    if(a>=1e9)return'Rp '+(n/1e9).toLocaleString('id-ID',{maximumFractionDigits:1})+' M';
    if(a>=1e6)return'Rp '+(n/1e6).toLocaleString('id-ID',{maximumFractionDigits:2})+' jt';
    if(a>=1e3)return'Rp '+(n/1e3).toLocaleString('id-ID',{maximumFractionDigits:0})+' rb';
    return'Rp '+n.toLocaleString('id-ID',{maximumFractionDigits:0});
  }
  function axisMoney(v){return fmtMoney(v).replace(/^Rp\s*/, '');}
  function shortPeriod(p){return /^\d{4}-\d{2}/.test(String(p||''))?(MONTHS[Number(p.slice(5,7))-1]||'').slice(0,3)+' '+p.slice(2,4):'—';}
  function periodLabel(p){return /^\d{4}-\d{2}/.test(String(p||''))?(MONTHS[Number(p.slice(5,7))-1]||p.slice(5,7))+' '+p.slice(0,4):'—';}

  function loadRows(){
    if(fetching)return fetching;
    db=db||window.__HASNARIA_DB;
    if(!db)return Promise.reject(new Error('Database belum siap'));
    fetching=db.from('offline_purchase_history')
      .select('source_period,item_name,total_amount,raw_data')
      .eq('brand_id',BRAND)
      .order('source_period',{ascending:true})
      .limit(10000)
      .then(function(res){if(res.error)throw res.error;return res.data||[];})
      .finally(function(){fetching=null;});
    return fetching;
  }

  function filters(){
    var p=document.getElementById('paPeriod'),s=document.getElementById('paScope');
    return{period:p&&p.value?p.value:'',scope:s&&s.value?s.value:'all'};
  }
  function scoped(rows,period,scope){
    return rows.filter(function(r){
      if(String(r.source_period||'').slice(0,7)!==period)return false;
      return scope==='all'||analyticsGroup(r)===scope;
    });
  }
  function sum(rows){return rows.reduce(function(a,r){return a+Number(r.total_amount||0);},0);}
  function groupTotals(rows){
    var out={Operasi:0,Administrasi:0,Investasi:0,Karyawan:0};
    rows.forEach(function(r){var g=analyticsGroup(r);out[g]=(out[g]||0)+Number(r.total_amount||0);});
    return out;
  }

  function trendData(rows,selected,scope){
    if(!selected)return[];
    var year=selected.slice(0,4),set={};
    rows.forEach(function(r){
      var p=String(r.source_period||'').slice(0,7);
      if(/^\d{4}-\d{2}$/.test(p)&&p.slice(0,4)===year&&p<=selected)set[p]=1;
    });
    return Object.keys(set).sort().map(function(p){return{period:p,total:sum(scoped(rows,p,scope))};});
  }

  function niceAxisMax(v){
    if(!(v>0))return 1;
    var target=v*1.12,pow=Math.pow(10,Math.floor(Math.log(target)/Math.LN10)),scaled=target/pow,step;
    if(scaled<=1)step=1;else if(scaled<=2)step=2;else if(scaled<=2.5)step=2.5;else if(scaled<=5)step=5;else step=10;
    return step*pow;
  }

  function trendHtml(data){
    if(!data.length)return'<div class="pa-empty pa-chart-empty">Belum ada periode untuk ditampilkan.</div>';
    var rawMax=Math.max.apply(null,data.map(function(x){return x.total;}));
    if(!(rawMax>0))rawMax=1;
    var axisMax=niceAxisMax(rawMax),axisMin=-axisMax*.14;
    var W=900,H=280,left=78,right=28,top=32,bottom=36,pw=W-left-right,ph=H-top-bottom,span=axisMax-axisMin;
    var step=pw/Math.max(1,data.length),bw=Math.min(86,Math.max(42,step*.5));
    var y=function(v){return top+((axisMax-v)/span)*ph;};
    var zeroY=y(0);
    var s=['<div class="pa-redesign-trend"><svg class="pa-redesign-trend-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Total pengeluaran per periode">'];
    [0,.25,.5,.75,1].forEach(function(t){
      var val=axisMax*t,yy=y(val);
      s.push('<line class="pa-gridline" x1="'+left+'" y1="'+yy.toFixed(1)+'" x2="'+(W-right)+'" y2="'+yy.toFixed(1)+'"></line>');
      s.push('<text class="pa-axis pa-redesign-y" x="'+(left-12)+'" y="'+(yy+4).toFixed(1)+'" text-anchor="end">'+esc(axisMoney(val))+'</text>');
    });
    data.forEach(function(d,i){
      var cx=left+i*step+step/2,x=cx-bw/2,yy=y(d.total),hh=zeroY-yy;
      s.push('<rect class="pa-redesign-total-bar" x="'+x.toFixed(1)+'" y="'+yy.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(2,hh).toFixed(1)+'" rx="8"></rect>');
      s.push('<text class="pa-redesign-value" x="'+cx.toFixed(1)+'" y="'+Math.max(18,yy-10).toFixed(1)+'" text-anchor="middle">'+esc(fmtMoney(d.total))+'</text>');
      s.push('<text class="pa-axis pa-axis-x pa-redesign-x" x="'+cx.toFixed(1)+'" y="'+Math.min(H-8,zeroY+24).toFixed(1)+'" text-anchor="middle">'+esc(shortPeriod(d.period))+'</text>');
    });
    s.push('</svg><div class="pa-redesign-note">Total pengeluaran per periode · komposisi kategori dirinci pada grafik bawah</div></div>');
    return s.join('');
  }

  function compositionHtml(gt,total){
    if(!(total>0))return'<div class="pa-empty pa-chart-empty">Belum ada data komposisi.</div>';
    var W=900,H=76,x=8,y=20,w=884,h=32,cur=x,segments=[];
    GROUPS.forEach(function(g,idx){
      var v=Number(gt[g]||0),pct=total>0?v/total:0,sw=w*pct;
      if(sw<=0)return;
      var rx=(idx===0||idx===GROUPS.length-1)?10:0;
      segments.push('<rect class="'+GROUP_CLASS[g]+' pa-comp-segment" x="'+cur.toFixed(1)+'" y="'+y+'" width="'+Math.max(.5,sw).toFixed(1)+'" height="'+h+'" rx="'+rx+'"></rect>');
      cur+=sw;
    });
    var cards=GROUPS.map(function(g){
      var v=Number(gt[g]||0),p=total>0?v/total*100:0;
      return'<div class="pa-comp-metric"><div class="pa-comp-name"><i class="'+GROUP_CLASS[g]+'"></i><span>'+esc(g)+'</span></div><strong>'+p.toLocaleString('id-ID',{maximumFractionDigits:1})+'%</strong><small>'+esc(fmtMoney(v))+'</small></div>';
    }).join('');
    return'<div class="pa-comp-redesign"><div class="pa-comp-summary"><span>Total periode</span><strong>'+esc(fmtMoney(total))+'</strong></div><svg class="pa-comp-stack" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Komposisi kategori pengeluaran">'+segments.join('')+'</svg><div class="pa-comp-metrics">'+cards+'</div></div>';
  }

  function patch(rows){
    var root=document.getElementById('paRoot');
    if(!root||!root.isConnected)return;
    var f=filters();
    if(!f.period)return;
    var trend=root.querySelector('.pa-main-grid>.pa-trend')||root.querySelector('.pa-trend');
    var comp=root.querySelector('.pa-main-grid>article:nth-child(2)');
    if(!trend||!comp)return;

    var td=trendData(rows,f.period,f.scope);
    trend.innerHTML='<h2>Tren Pengeluaran Antar Periode</h2><p class="pa-sub">Perbandingan total pengeluaran bulanan untuk periode yang tersedia.</p>'+trendHtml(td);

    var cur=scoped(rows,f.period,f.scope),gt=groupTotals(cur),total=sum(cur);
    comp.innerHTML='<h2>Komposisi Kategori '+esc(periodLabel(f.period))+'</h2><p class="pa-sub">Proporsi pengeluaran berdasarkan kelompok biaya pada periode terpilih.</p>'+compositionHtml(gt,total);
    root.setAttribute('data-chart-redesign-period',f.period+'|'+f.scope);
  }

  function refresh(delay){
    clearTimeout(timer);
    timer=setTimeout(function(){loadRows().then(patch).catch(function(e){console.warn('Purchase chart redesign:',e&&e.message?e.message:e);});},delay==null?60:delay);
  }

  function boot(){
    addCss();
    var tries=0;(function wait(){
      var host=document.getElementById('pembelian');
      db=db||window.__HASNARIA_DB||null;
      if(host&&db){
        if(hostObserver)hostObserver.disconnect();
        hostObserver=new MutationObserver(function(mutations){
          if(mutations.some(function(m){return m.type==='childList'&&m.target===host;}))refresh(40);
        });
        hostObserver.observe(host,{childList:true,subtree:false});
        document.addEventListener('change',function(e){if(e.target&&(e.target.id==='paPeriod'||e.target.id==='paScope'))refresh(80);},true);
        document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#paUpload,[data-tab="pembelian"],#paUploadLegacy,#paUploadMajoo'):null;if(b)refresh(220);},true);
        refresh(80);
        return;
      }
      if(tries++<120)setTimeout(wait,100);
    })();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
