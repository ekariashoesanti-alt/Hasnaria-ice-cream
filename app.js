(function () {
  'use strict';
  var CORE = 'https://cdn.jsdelivr.net/gh/ekariashoesanti-alt/Hasnaria-ice-cream@864e0349d18a56ef997216a89661deacf9a8c24a/app.js';
  var STOCK = '/stock-monitor.js?v=24';
  var SALES = '/sales-board.js?v=7';
  var SALES_UI = '/sales-ui-patch.js?v=4';
  function load(src, done) { var s=document.createElement('script'); s.src=src; s.async=false; s.onload=function(){if(done)done();}; s.onerror=function(){console.error('Hasnaria module gagal dimuat:',src);if(done)done();}; document.head.appendChild(s); }
  function fixStockLayout() { var host=document.getElementById('stok');if(!host)return;var form=host.querySelector('.stk-form');if(form){form.style.minWidth='0';form.style.maxWidth='100%';}var qty=host.querySelector('#stkBuy'),price=host.querySelector('#stkBuyPrice'),priceBox=price&&price.parentElement;if(priceBox){var units=priceBox.querySelectorAll('.unit');if(units.length)units[units.length-1].textContent='/ pcs';} }
  function recoveryUI() {
    if (!window.supabase || !window.HASNARIA_SB || !window.HASNARIA_KEY) return;
    var client = supabase.createClient(window.HASNARIA_SB, window.HASNARIA_KEY, { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'pkce', storageKey:'hasnaria-recovery' } });
    client.auth.onAuthStateChange(function(event) {
      if (event !== 'PASSWORD_RECOVERY') return;
      if (document.getElementById('hasnariaRecovery')) return;
      var box=document.createElement('div'); box.id='hasnariaRecovery';
      box.style='position:fixed;inset:0;z-index:99999;background:rgba(243,246,244,.98);display:grid;place-items:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
      box.innerHTML='<div style="width:min(430px,100%);background:#fff;border:1px solid #d7e2dc;border-radius:16px;padding:28px;box-shadow:0 18px 50px rgba(0,0,0,.12)"><h2 style="margin:0 0 8px">Buat password baru</h2><p style="font-size:13px;color:#66756e;margin-bottom:18px">Masukkan password baru untuk akun Hasnaria.</p><label style="font-size:12px;color:#66756e">Password baru</label><input id="hrp1" type="password" autocomplete="new-password" style="width:100%;padding:12px;border:1px solid #d5dfda;border-radius:10px;margin:6px 0 10px;box-sizing:border-box"><label style="font-size:12px;color:#66756e">Ulangi password</label><input id="hrp2" type="password" autocomplete="new-password" style="width:100%;padding:12px;border:1px solid #d5dfda;border-radius:10px;margin:6px 0 12px;box-sizing:border-box"><button id="hrpSave" style="width:100%;padding:12px;border:0;border-radius:10px;background:#176b55;color:#fff;font-weight:700;cursor:pointer">Simpan password</button><div id="hrpMsg" style="min-height:18px;margin-top:10px;font-size:12px;color:#b43b3b"></div></div>';
      document.body.appendChild(box);
      document.getElementById('hrpSave').onclick=async function(){
        var p1=document.getElementById('hrp1').value, p2=document.getElementById('hrp2').value, msg=document.getElementById('hrpMsg');
        if(p1.length<8){msg.textContent='Password minimal 8 karakter.';return;}
        if(p1!==p2){msg.textContent='Konfirmasi password tidak sama.';return;}
        msg.textContent='Menyimpan…';
        var r=await client.auth.updateUser({password:p1});
        if(r.error){msg.textContent=r.error.message;return;}
        msg.style.color='#166534'; msg.textContent='Password berhasil diubah. Mengalihkan ke login…';
        setTimeout(function(){client.auth.signOut().finally(function(){location.href=location.origin+location.pathname;});},1200);
      };
    });
  }
  function afterCore() {
    load(STOCK,function(){fixStockLayout();setTimeout(fixStockLayout,150);setTimeout(fixStockLayout,500);setTimeout(fixStockLayout,1200);});
    load(SALES,function(){load(SALES_UI);});
    document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(!b)return;var id=b.id||'',watch=id==='sSave'||id==='oSave'||id==='cSave'||id==='lzSave'||id==='svOpen'||id==='svHand'||id==='svClose'||b.hasAttribute('data-stk')||b.hasAttribute('data-ok')||b.hasAttribute('data-no')||b.hasAttribute('data-lzok')||b.hasAttribute('data-lzno');if(!watch)return;if(b.getAttribute('data-busy')==='1'){e.preventDefault();e.stopImmediatePropagation();return;}b.setAttribute('data-busy','1');setTimeout(function(){try{b.removeAttribute('data-busy');}catch(_){}},1800);},true);
  }
  recoveryUI();
  load(CORE,afterCore);
})();
