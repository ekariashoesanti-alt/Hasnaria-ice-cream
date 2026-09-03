(function(){
'use strict';
var SB=window.HASNARIA_SB,KEY=window.HASNARIA_KEY;
if(!SB||!KEY||typeof supabase==='undefined')return;
var db=window.__HASNARIA_DB;
if(!db)return;
var roles=[['owner','Admin / Owner'],['head_store','Head Store'],['marketing','Marketing'],['pic','PIC'],['pelaksana','Pelaksana']],statuses=[['active','Aktif'],['pending','Menunggu'],['suspended','Ditangguhkan']];
function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[c]})}
async function me(){var a=await db.auth.getUser();if(a.error||!a.data.user)return null;var q=await db.from('user_profiles').select('id,brand_id,role,status').eq('id',a.data.user.id).maybeSingle();return q.data||null}
function owner(p){return p&&p.role==='owner'&&p.status==='active'}
async function syncRoster(id,role,email,name){
  var q=await db.from('products').select('id,name').eq('brand_id',arguments.length?undefined:undefined);
  if(q.error)return;
  var rows=(q.data||[]).filter(function(x){return String(x.name||'').indexOf('HASNARIA_USER|'+id+'|')===0});
  var encoded='HASNARIA_USER|'+id+'|'+role+'|'+(email||'')+'|'+String(name||'').replace(/\|/g,'/');
  if(rows.length) await db.from('products').update({name:encoded}).eq('id',rows[0].id);
  else await db.from('products').insert({brand_id:arguments[1],name:encoded,selling_price:0,cogs:0,active:true});
}
async function load(){var sec=document.getElementById('sistem');if(!sec)return;var m=await me();if(!owner(m))return;sec.innerHTML='<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h2>Pengaturan User</h2><div class="small">Kelola role dan status akses pengguna Hasnaria.</div></div><button class="primary" id="usRefresh">Refresh</button></div><div id="usMsg" class="msg"></div><div id="usTable" style="margin-top:12px;overflow:auto">Memuat pengguna…</div></div>';
var box=document.getElementById('usTable'),msg=document.getElementById('usMsg'),q=await db.from('user_profiles').select('id,display_name,full_name,email,role,status,brand_id,created_at').eq('brand_id',m.brand_id).order('created_at',{ascending:true});if(q.error){box.innerHTML='<div class="redbox">Gagal memuat: '+esc(q.error.message)+'</div>';return}
box.innerHTML='<table><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>'+q.data.map(function(u){return '<tr data-id="'+esc(u.id)+'"><td><b>'+esc(u.full_name||u.display_name||'-')+'</b></td><td>'+esc(u.email||'-')+'</td><td><select class="us-role">'+roles.map(function(x){return '<option value="'+x[0]+'" '+(x[0]===u.role?'selected':'')+'>'+x[1]+'</option>'}).join('')+'</select></td><td><select class="us-status">'+statuses.map(function(x){return '<option value="'+x[0]+'" '+(x[0]===u.status?'selected':'')+'>'+x[1]+'</option>'}).join('')+'</select></td><td><button class="us-save">Simpan</button></td></tr>'}).join('')+'</tbody></table>';
document.getElementById('usRefresh').onclick=load;Array.prototype.forEach.call(box.querySelectorAll('.us-save'),function(btn){btn.onclick=async function(){var tr=btn.closest('tr'),id=tr.dataset.id,role=tr.querySelector('.us-role').value,status=tr.querySelector('.us-status').value;var target=q.data.find(function(x){return x.id===id});if(id===m.id&&(role!=='owner'||status!=='active')){msg.textContent='Akun Admin aktif tidak boleh dinonaktifkan atau diturunkan dari Owner.';return}if(role==='owner'&&id!==m.id&&!confirm('Jadikan user ini Admin / Owner?'))return;btn.disabled=true;var r=await db.from('user_profiles').update({role:role,status:status,updated_at:new Date().toISOString()}).eq('id',id).eq('brand_id',m.brand_id);if(!r.error&&target){var rows=await db.from('products').select('id,name').eq('brand_id',m.brand_id).like('name','HASNARIA_USER|%');if(!rows.error){var hit=(rows.data||[]).find(function(x){return String(x.name||'').split('|')[1]===id});var encoded='HASNARIA_USER|'+id+'|'+role+'|'+(target.email||'')+'|'+String(target.full_name||target.display_name||'').replace(/\|/g,'/');if(hit)await db.from('products').update({name:encoded}).eq('id',hit.id);else await db.from('products').insert({brand_id:m.brand_id,name:encoded,selling_price:0,cogs:0,active:true});}}btn.disabled=false;if(r.error){msg.textContent='Gagal: '+r.error.message;return}msg.style.color='#166534';msg.textContent='Perubahan berhasil disimpan.';setTimeout(load,400)}})}
function addTab(){var tabs=document.getElementById('tabs');if(!tabs||document.getElementById('userSettingsTab'))return;var b=document.createElement('button');b.id='userSettingsTab';b.className='tab';b.textContent='Pengaturan';b.onclick=function(){Array.prototype.forEach.call(tabs.querySelectorAll('.tab'),function(x){x.classList.remove('on')});b.classList.add('on');document.querySelectorAll('#app main section').forEach(function(s){s.classList.add('hidden')});document.getElementById('sistem').classList.remove('hidden');load()};tabs.appendChild(b)}
async function gate(){var m=await me();if(owner(m))addTab()}
function start(){var tries=0;(function wait(){if(document.getElementById('app')&&document.getElementById('tabs')){gate();return}if(tries++<20)setTimeout(wait,500)})();}
db.auth.onAuthStateChange(function(ev){if(ev==='SIGNED_IN'||ev==='INITIAL_SESSION')setTimeout(gate,0)});
start();
})();
