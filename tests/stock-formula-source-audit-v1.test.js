'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');
const js=read('stock-control-v3.js');
const css=read('stock-control-v3.css');
const sql=read('supabase/migrations/20261030235000_stock_formula_source_audit_v1.sql');

test('independent formula reconstructs balance with post-opname movements and no writes',()=>{
  assert.match(sql,/create or replace view public\.ui_stock_formula_verification_v1\s+with\s*\(security_invoker=true\)/i);
  assert.match(sql,/distinct on \(o\.brand_id,o\.inventory_item_id\)/i);
  assert.match(sql,/m\.movement_date>o\.opname_date/);
  assert.match(sql,/m\.movement_date=o\.opname_date/);
  assert.match(sql,/o\.physical_qty\+mr\.receipts_after_opname-mr\.usage_after_opname\+mr\.other_movements_after_opname/);
  assert.match(sql,/b\.independently_calculated_qty-b\.existing_ledger_qty/);
  assert.match(sql,/then 'NO_PHYSICAL_BASELINE'/);
  assert.match(sql,/then 'ARITHMETIC_MISMATCH'/);
  assert.match(sql,/then 'OPNAME_DAY_AMBIGUOUS'/);
  assert.match(sql,/then 'ESTIMATED_BOM_USAGE'/);
  assert.match(sql,/then 'NEGATIVE_LEDGER'/);
  assert.match(sql,/FORMULA_MATCH_SOURCE_NOT_CERTIFIED/);
  assert.match(sql,/revoke all on public\.ui_stock_formula_verification_v1 from public,anon/);
  assert.match(sql,/grant select on public\.ui_stock_formula_verification_v1 to authenticated,service_role/);
  assert.doesNotMatch(sql,/^\s*(insert|delete|update|truncate)\s+(?:into\s+|from\s+)?public\./im);
});

test('untracked SKU has null independent balance, not fabricated zero',()=>{
  assert.match(sql,/case when o\.opname_date is not null then[\s\S]*?else null end as independently_calculated_qty/);
  assert.match(js,/if\(!x\.has_physical_baseline\)flags\.push\('Belum ada stok fisik awal'\)/);
  assert.match(js,/var expected=hasBaseline\?fmt\(x\.independently_calculated_qty\):'Belum bisa dihitung'/);
  assert.match(js,/var existing=hasBaseline\?fmt\(x\.existing_ledger_qty\):'Belum terverifikasi'/);
});

test('read-only audit is lazy-loaded on Owner request and paginated, no posting actions',()=>{
  assert.match(js,/function loadFormulaAudit\(\)/);
  assert.match(js,/ui_stock_formula_verification_v1\?/);
  assert.match(js,/data-sc4-modal="formula-audit"/);
  assert.match(js,/data-sc20-page/);
  assert.match(js,/sc20FormulaSearch/);
  assert.match(js,/pageSize=12/);
  assert.match(js,/Saldo stok belum terverifikasi penuh/);
  assert.match(js,/Selisih hitung 0 hanya berarti rumus cocok/);
  assert.match(js,/Data penjualan yang belum diposting serta Pembelian yang belum terbukti diterima/);
  const section=js.slice(js.indexOf('async function loadFormulaAudit()'),js.indexOf('function renderModal()'));
  assert.ok(section.length>500);
  assert.doesNotMatch(section,/method:\s*['"](?:POST|PATCH|DELETE|PUT)/i);
  assert.doesNotMatch(section,/\brpc\(/);
  assert.doesNotMatch(section,/insert into|update public\./i);
  assert.match(css,/\.sc20-integrity/);
  assert.match(css,/\.sc20-table/);
});

test('mocked Owner UI shows precise formula and missing-data warnings',()=>{
  const start=js.indexOf('function renderFormulaAudit(){');
  const end=js.indexOf('function renderStockIntegrityWarning(){',start);
  assert.ok(start>0&&end>start);
  const mocked={
    S:{formulaLoading:false,formulaError:'',formulaLoaded:true,formulaPage:1,formulaSearch:'',
      formulaRows:[
        {inventory_item_id:'a',item_name:'MIE KUNING',unit:'porsi',opname_date:'2026-09-05',physical_qty:97,
          receipts_after_opname:96,usage_after_opname:167,other_movements_after_opname:0,
          independently_calculated_qty:26,existing_ledger_qty:26,arithmetic_difference:0,
          has_physical_baseline:true,same_day_ambiguous_rows:7,estimated_bom_usage_rows:0},
        {inventory_item_id:'b',item_name:'AIR MINERAL BESAR',unit:'pcs',opname_date:'2026-09-05',physical_qty:22,
          receipts_after_opname:0,usage_after_opname:29,other_movements_after_opname:0,
          independently_calculated_qty:-7,existing_ledger_qty:-7,arithmetic_difference:0,
          has_physical_baseline:true,same_day_ambiguous_rows:0,estimated_bom_usage_rows:0},
        {inventory_item_id:'c',item_name:'BAHAN BARU',unit:'pcs',opname_date:null,physical_qty:null,
          receipts_after_opname:null,usage_after_opname:null,other_movements_after_opname:null,
          independently_calculated_qty:null,existing_ledger_qty:0,arithmetic_difference:null,
          has_physical_baseline:false,same_day_ambiguous_rows:0,estimated_bom_usage_rows:0}
      ]},
    fmt:v=>Number(v).toLocaleString('id-ID'),num:v=>Number(v)||0,
    esc:v=>String(v),dateLabel:v=>v?String(v):'-',
    signed:v=>(Number(v)>0?'+':'')+Number(v),
    isOwner:()=>true
  };
  const html=vm.runInNewContext(js.slice(start,end)+';renderFormulaAudit()',mocked);
  assert.match(html,/97/);
  assert.match(html,/96/);
  assert.match(html,/167/);
  assert.match(html,/26/);
  assert.match(html,/-7/);
  assert.match(html,/Belum bisa dihitung/);
  assert.match(html,/7 transaksi di hari opname/);
  assert.match(html,/Saldo sistem minus/);
  assert.match(html,/0<\/b><span>Selisih perhitungan/);
});

test('new JS/CSS versions are pinned and full Stock release checks retained',()=>{
  assert.match(js,/stock-control-v3\.css\?v=33/);
  for(const f of ['stock-monitor.js','stock-v3-runtime-fix.js']){
    assert.match(read(f),/stock-control-v3\.js\?v=39/);
  }
  assert.match(read('scripts/vercel-build-check.js'),/stock-formula-source-audit-v1\.test\.js/);
});
