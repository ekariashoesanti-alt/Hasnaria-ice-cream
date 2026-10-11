'use strict';

// P0 regression: a destructive canonical Purchase re-import must never touch
// evidence/history before verifying its Stock receipts. No Supabase calls here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'purchase-excel-safe-merge-v3.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261011110000_guard_purchase_stock_source_lineage.sql'), 'utf8');

async function runUpload({receipts = [], queryError = null, allowConfirm = true} = {}) {
  let onChange, confirmCount = 0;
  const requests = [], writes = [], toasts = [];
  const db = {
    from(table) {
      const q = {table};
      const b = {
        select(fields) { q.fields = fields; return b; },
        eq(k, v) { (q.filters ||= []).push(['eq',k,v]); return b; },
        gte(k, v) { (q.filters ||= []).push(['gte',k,v]); return b; },
        lte(k, v) { (q.filters ||= []).push(['lte',k,v]); return b; },
        limit(n) {
          q.limit = n; requests.push(q);
          if (table !== 'inventory_purchase_log') writes.push(q);
          return Promise.resolve(queryError ? {error: queryError} : {data: receipts, error: null});
        },
        insert() { writes.push({table, verb: 'insert'}); return Promise.resolve({error: null}); },
        update() { writes.push({table, verb: 'update'}); return b; }
      };
      return b;
    },
    rpc(name) { writes.push({verb:'rpc', name}); return Promise.resolve({error:null}); }
  };
  const sheet = {};
  const XLSX = {
    read() { return {SheetNames:['BELANJA'], Sheets:{BELANJA:sheet}}; },
    utils: {
      sheet_to_json() {
        return [
          ['Tanggal','Nama','Jumlah','Harga','Total','Tunai'],
          ['2026-09-04','ODENG',1,10000,10000,10000]
        ];
      },
      decode_cell() { return {r:0,c:0}; },
      decode_range() { return {s:{r:0,c:0},e:{r:1,c:5}}; },
      encode_range() { return 'A1:F2'; }
    }
  };
  const document = {
    addEventListener(type, cb) { if (type === 'change') onChange = cb; },
    getElementById() { return null; },
    createElement() { return {isConnected:true, remove() { this.isConnected=false; }}; },
    body:{appendChild(node) { toasts.push(node); }}
  };
  const sandbox = {
    window:{__HASNARIA_DB:db, XLSX},
    document, XLSX, Date, Math, Number, String, Object, RegExp, Array, JSON, Error, Promise,
    console:{error(){}}, confirm() { confirmCount++; return allowConfirm; },
    setTimeout() {}, clearTimeout() {}
  };
  vm.runInNewContext(source, sandbox, {filename:'purchase-excel-safe-merge-v3.js'});
  const input = {id:'purchaseExcelFile', value:'', files:[{name:'RENCANA BELANJA SEPTEMBER.xlsx', arrayBuffer: async()=>new ArrayBuffer(1)}]};
  assert.equal(typeof onChange,'function');
  onChange({target:input, preventDefault(){}, stopImmediatePropagation(){}});
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  return {requests, writes, toasts:toasts.map(x=>x.textContent), confirmCount, input};
}

test('linked or orphan Stock receipts stop canonical import before any evidence mutation', async () => {
  const r = await runUpload({receipts:[{id:'posted-stock-1'}]});
  assert.equal(r.requests.length,1);
  assert.equal(r.requests[0].table,'inventory_purchase_log');
  assert.equal(r.requests[0].limit,1);
  assert.equal(r.writes.length,0);
  assert.equal(r.confirmCount,0);
  assert.match(r.toasts.join(' '),/ditahan: sudah ada penerimaan Stok/);
});

test('preflight query failure also fails closed, no side effects', async () => {
  const r = await runUpload({queryError:{message:'no inventory read permission'}});
  assert.equal(r.writes.length,0);
  assert.equal(r.confirmCount,0);
  assert.match(r.toasts.join(' '),/Preflight relasi Stok gagal/);
});

test('new period with zero receipts proceeds to normal confirmation', async () => {
  const r = await runUpload({receipts:[],allowConfirm:false});
  assert.equal(r.writes.length,0);
  assert.equal(r.confirmCount,1);
  assert.equal(r.toasts.length,0);
});

test('database guard is enforced before delete and semantic updates', () => {
  assert.match(migration,/before delete or update of/i);
  assert.match(migration,/inventory_purchase_log/i);
  assert.match(migration,/source_history_id\s*=\s*v_source/i);
  assert.match(migration,/before delete or update of\s+id, brand_id/i);
  assert.match(migration,/new\.id is not distinct from old\.id/i);
  assert.doesNotMatch(migration,/v_source\s*:=\s*new\.id\s*;/i);
  assert.match(migration,/raise exception using/i);
  assert.doesNotMatch(migration,/^\s*delete\s+from\s+public\./im);
  assert.doesNotMatch(migration,/^\s*update\s+public\./im);
  assert.doesNotMatch(migration,/^\s*insert\s+into\s+public\./im);
});


const parityMigration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261011180000_stock_reconciliation_ledger_parity.sql'), 'utf8');
const recoveryPreview = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'tests', 'purchase_stock_recovery_preflight_v1.sql'), 'utf8');

test('Stock screen reads only posted verified movements, not proposed draft BOM', () => {
  assert.match(parityMigration,/create or replace view public\.inventory_stock_reconciliation/i);
  assert.match(parityMigration,/security_invoker\s*=\s*true/i);
  assert.match(parityMigration,/LEFT JOIN inventory_movements m/i);
  assert.match(parityMigration,/m\.movement_type = 'SALE_CONSUMPTION'/i);
  assert.match(parityMigration,/m\.movement_date > b_1\.baseline_date/i);
  assert.match(parityMigration,/m\.movement_date <= CURRENT_DATE/i);
  assert.doesNotMatch(parityMigration,/JOIN inventory_recipe_components/i);
  assert.doesNotMatch(parityMigration,/JOIN sale_items\s+si/i);
});

test('recovery preview has no data-changing statements or action RPCs', () => {
  const stripped = recoveryPreview.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(stripped,/\b(insert\s+into|update\s+\w|delete\s+from|truncate\s+|drop\s+table|alter\s+table|call\s+)\b/i);
  assert.match(stripped,/BLOCK_SOURCE_UNIT_MISSING/);
  assert.match(stripped,/NEGATIVE_IS_VIRTUAL_RECIPE_USAGE/);
  assert.match(stripped,/finance_sales_sync_status_v1/);
});
