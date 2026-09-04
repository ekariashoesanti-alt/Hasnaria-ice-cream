/* Hasnaria offline baseline bridge. Read-only: no second Supabase auth client. */
(function(){
  var SB=window.HASNARIA_SB, KEY=window.HASNARIA_KEY, BRAND='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4';
  function token(){
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i),v=localStorage.getItem(k);
      if(!v) continue;
      try{var j=JSON.parse(v); if(j&&j.access_token) return j.access_token;}catch(e){}
    }
    return null;
  }
  async function get(table,params){
    var t=token(); if(!t) throw new Error('Session belum tersedia. Silakan login kembali.');
    var q=new URLSearchParams(params||{});
    var r=await fetch(SB+'/rest/v1/'+table+'?'+q.toString(),{headers:{apikey:KEY,Authorization:'Bearer '+t}});
    if(!r.ok) throw new Error('Gagal membaca '+table+' ('+r.status+')');
    return r.json();
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]})}
  function rp(n){return 'Rp'+Number(n||0).toLocaleString('id-ID')}
  function ensure(){
    if(document.getElementById('offlineBaseline')) return;
    var app=document.getElementById('app'); if(!app) return;
    var box=document.createElement('section'); box.id='offlineBaseline'; box.className='card'; box.style.margin='16px 0';
    box.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h2 style="margin:0">Baseline Offline Hasnaria</h2><div style="opacity:.7;font-size:13px">Juli 2026 · RENCANA BELANJA JULI 2026.xlsx</div></div><button id="offlineRefresh" type="button">Sinkronkan</button></div><div id="offlineData" style="margin-top:12px"><span>Memuat data offline…</span></div>';
    app.appendChild(box); document.getElementById('offlineRefresh').onclick=load;
  }
  async function load(){
    ensure(); var out=document.getElementById('offlineData'); if(!out)return; out.innerHTML='Memuat…';
    try{
      var inv=await get('inventory_items',{brand_id:'eq.'+BRAND,source_period:'eq.2026-07-01',select:'category,item_name,stock_june,purchase_july,sold_july,stock_august,discrepancy'});
      var pur=await get('offline_purchase_history',{brand_id:'eq.'+BRAND,source_period:'eq.2026-07-01',select:'total_amount,payment_method'});
      var ops=await get('offline_ops_history',{brand_id:'eq.'+BRAND,source_period:'eq.2026-07-01',select:'section,item_name,amount'});
      var cats={}; inv.forEach(function(x){cats[x.category]=(cats[x.category]||0)+1});
      var ptotal=pur.reduce(function(a,x){return a+Number(x.total_amount||0)},0), ototal=ops.reduce(function(a,x){return a+Number(x.amount||0)},0);
      var discrepancies=inv.filter(function(x){return x.discrepancy!==null&&Number(x.discrepancy)!==0}).length;
      out.innerHTML='<div class="grid"><div><div class="label">Inventory</div><div class="metric">'+inv.length+' item</div></div><div><div class="label">Belanja offline</div><div class="metric">'+rp(ptotal)+'</div><small>'+pur.length+' baris</small></div><div><div class="label">Operasional offline</div><div class="metric">'+rp(ototal)+'</div><small>'+ops.length+' baris</small></div><div><div class="label">Selisih stok</div><div class="metric">'+discrepancies+' item</div></div></div><div style="margin-top:10px;font-size:13px">'+Object.keys(cats).map(function(k){return '<b>'+esc(k)+'</b>: '+cats[k]}).join(' · ')+'</div>';
    }catch(e){out.innerHTML='<span style="color:#b42318">'+esc(e.message)+'</span>'}
  }
  var n=0;(function wait(){ensure(); if(document.getElementById('app')&&!document.getElementById('app').classList.contains('hidden')) load(); else if(n++<120)setTimeout(wait,250)})();
})();
