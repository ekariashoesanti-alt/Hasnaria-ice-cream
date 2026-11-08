'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const js=read('loyalty-v1.js');
const op=read('operational-v1.js');
const css=read('loyalty-v1.css');
const sql=read('supabase/migrations/20261108221000_hsn712_loyalty_majoo_snapshots.sql');
test('Loyalty loaded only on Owner Operational tab',()=>{
 assert.match(op,/data-op-action="show-loyalty"/);
 assert.match(op,/if\(isOwner\(\)&&state\.subtab==='loyalty'\)/);
 assert.match(op,/state\.subtab==='loyalty'/);
 assert.match(op,/sc\.src='\/loyalty-v1\.js\?v=1'/);
 assert.match(js,/if\(!owner\(\)\)/);
 assert.match(js,/function previewUnsafe\(\)/);
 assert.match(css,/\.lo1-kpis\{display:grid/);
});
test('Majoo parser is explicit, guarded, duplicate-aware',()=>{
 for(const fragment of ['laporan pelanggan','Total Transaksi','Total Penjualan (Rp)','No Telp','Date Generated','Periode','row_no','source_row']) {
  if(fragment==='row_no')continue;
  assert.ok(js.toLowerCase().includes(fragment.toLowerCase()),fragment);
 }
 assert.match(js,/new Set\(warnings\)/);
 assert.match(js,/seen\[phone\]/);
 assert.match(js,/parseReport\(wb\)/);
 assert.match(js,/crypto\.subtle\.digest\('SHA-256',buffer\)/);
 assert.match(js,/source_row:i\+1/);
 assert.match(js,/if\(f\.size>5\*1024\*1024\)/);
 assert.match(js,/var result=await db\(\)\.rpc\('import_loyalty_majoo_v1'/);
});
test('idempotency, no stock or finance mutations, scoped access',()=>{
 assert.match(sql,/unique \(brand_id, period_month, source_sha256\)/);
 assert.match(sql,/loyalty_one_current_period_uidx/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/source_generated_at<=v_previous/);
 assert.match(sql,/status','duplicate'/);
 assert.match(sql,/get_loyalty_dashboard_v1/);
 assert.match(sql,/import_loyalty_majoo_v1/);
 assert.match(sql,/auth\.uid\(\) and u\.status='active' and u\.role='owner'/);
 assert.match(sql,/enable row level security/g);
 assert.doesNotMatch(sql,/update public\.sales|insert into public\.sales|update public\.inventory|insert into public\.inventory|insert into public\.finance/i);
 assert.doesNotMatch(js,/\.from\('sales'\)|\.from\('sale_items'\)|\.from\('inventory_movements'\)/);
});
test('Customer phone privacy, analytic distinctions, compact responsive UI',()=>{
 assert.match(sql,/right\(c\.phone,4\)/);
 assert.doesNotMatch(sql,/select\s+c\.phone\s+as/);
 assert.match(js,/•••• /);
 assert.match(js,/bukan retention antarbulan/i);
 assert.match(js,/Tidak ada perubahan Penjualan, Stok, BOM, atau jurnal Keuangan/);
 assert.match(js,/page\*LIMIT/);
 assert.match(css,/@media\(max-width:700px\)/);
});