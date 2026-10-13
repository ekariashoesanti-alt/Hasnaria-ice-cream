'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'..','purchase-finance-alignment-v1.js'),'utf8');
test('P0.2 source-unit verification is accessible only to Owner',()=>{
 for(const marker of ['owner_purchase_unit_queue_v1','owner_purchase_unit_preview_v1','owner_purchase_unit_apply_v1','owner_purchase_unit_revoke_v1','unitAllowed()','data-pfa-unit-open','data-pfa-unit-preview','data-pfa-unit-apply'])assert.ok(js.includes(marker),'missing '+marker);
 assert.match(js,/c&&c.role==='owner'/);
 assert.match(js,/unitSession===window.__HASNARIA_CONTEXT/);
 assert.match(js,/Tidak ada posting|Tidak ada posting stok|tidak mengubah/i);
});
test('Post-import notification NEVER writes Stock without physical unit review',()=>{
 assert.doesNotMatch(js,/\.rpc\(\s*['"]sync_purchase_quantity_stock_v1['"]/);
 assert.doesNotMatch(js,/syncStockForPeriod\s*\(/);
 assert.match(js,/addEventListener\(['"]hasnaria:purchase-imported['"],function\(\)\{resetData\(\);loadPeriods\(\)\.then\(function\(\)\{load\(true\)\}\)\},true\)/);
 assert.match(js,/Penerimaan Stok hanya dibukukan setelah satuan dan bukti diperiksa/);
});
test('Unit-approval RPC never writes receipt, movement or accounting directly',()=>{
 assert.doesNotMatch(js,/\.from\(['"](?:inventory_purchase_log|inventory_movements|journal_entries|accounting_entries)['"]\)/);
 assert.match(js,/Simpan bukti verifikasi/);
});
