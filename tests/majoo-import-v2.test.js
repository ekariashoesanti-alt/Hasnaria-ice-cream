'use strict';

const assert = require('assert');
const path = require('path');

// sales-import-v2.js is a browser IIFE. Expose a minimal browser-like global.
global.window = global;
if (!global.crypto || !global.crypto.subtle) {
  global.crypto = require('crypto').webcrypto;
}

require(path.join(__dirname, '..', 'sales-import-v2.js'));
assert.strictEqual(typeof global.__HASNARIA_IMPORT_V2, 'function', 'importer v2 must register globally');

function file(name, matrix) {
  const payload = Buffer.from(JSON.stringify(matrix));
  return {
    name,
    size: payload.length,
    lastModified: 1788278400000,
    matrix,
    async arrayBuffer() {
      return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    }
  };
}

const header = [
  'No Transaksi',
  'Waktu Order',
  'Waktu Bayar',
  'Tanggal',
  'Produk',
  'SKU',
  'Qty',
  'Total Penjualan',
  'Metode Pembayaran',
  'Status',
  'Harga Jual'
];

const matrixA = [
  header,
  ['TRX-001', '01-09-2026 13:47:22', '01-09-2026 14:02:00', '2026-09-01', 'Odeng', 'OD-01', 2, 50000, 'Cash', 'Paid', 20000],
  ['TRX-001', '01-09-2026 13:47:22', '01-09-2026 14:02:00', '2026-09-01', 'Topokki', 'TP-01', 1, 50000, 'Cash', 'Paid', 10000],
  ['TRX-VOID', '01-09-2026 15:10:00', '01-09-2026 15:20:00', '2026-09-01', 'Sosis', 'SS-01', 1, 30000, 'QRIS', 'Refund', 30000]
];

// Same transaction appears in a second overlapping export. It must not double-count.
const matrixB = [
  header,
  ['TRX-001', '01-09-2026 13:47:22', '01-09-2026 14:02:00', '2026-09-01', 'Odeng', 'OD-01', 2, 50000, 'Cash', 'Paid', 20000],
  ['TRX-001', '01-09-2026 13:47:22', '01-09-2026 14:02:00', '2026-09-01', 'Topokki', 'TP-01', 1, 50000, 'Cash', 'Paid', 10000]
];

const calls = [];
function response(body) {
  return {
    ok: true,
    status: 200,
    async text() {
      if (body == null) return '';
      return typeof body === 'string' ? body : JSON.stringify(body);
    }
  };
}

global.fetch = async function mockFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const u = new URL(url);
  const key = method + ' ' + u.pathname + u.search;
  let body = null;
  if (options.body) body = JSON.parse(options.body);
  calls.push({ key, method, pathname: u.pathname, search: u.search, body });

  if (method === 'GET' && u.pathname.endsWith('/products')) return response([]);
  if (method === 'GET' && u.pathname.endsWith('/sales_import_batches')) return response([]);
  if (method === 'POST' && u.pathname.endsWith('/sales_import_batches')) return response([{ id: 'batch-1' }]);
  if (method === 'POST' && u.pathname.endsWith('/sales')) {
    return response(body.map((row, i) => ({ id: 'sale-' + (i + 1), external_transaction_id: row.external_transaction_id })));
  }
  if (method === 'DELETE' && u.pathname.endsWith('/sale_items')) return response(null);
  if (method === 'POST' && u.pathname.endsWith('/sale_items')) return response(null);
  if (method === 'GET' && u.pathname.endsWith('/daily_metrics')) return response([]);
  if (method === 'POST' && u.pathname.endsWith('/daily_metrics')) return response(null);
  if (method === 'PATCH' && u.pathname.endsWith('/sales_import_batches')) return response(null);

  throw new Error('Unhandled mock request: ' + key);
};

(async () => {
  const STATE = { stagedFiles: [], stagedFileType: '' };
  const statuses = [];
  let metricsReloads = 0;

  await global.__HASNARIA_IMPORT_V2(
    [file('majoo-a.xlsx', matrixA), file('majoo-b.xlsx', matrixB)],
    {
      STATE,
      BRAND: 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4',
      SB: 'https://example.supabase.co',
      KEY: 'sb_publishable_test',
      setImportStatus: (...args) => statuses.push(args),
      draw: () => {},
      getFileMatrix: async f => f.matrix,
      loadMetrics: async () => { metricsReloads += 1; },
      getTok: async () => 'test-access-token'
    }
  );

  assert.strictEqual(STATE.error, '', 'import should complete without STATE.error');
  assert.match(STATE.msg || '', /ternormalisasi/i, 'success message should confirm normalized import');
  assert.strictEqual(metricsReloads, 1, 'dashboard metrics should reload once');

  const salesPost = calls.find(c => c.method === 'POST' && c.pathname.endsWith('/sales'));
  assert(salesPost, 'sales upsert must happen');
  assert.strictEqual(salesPost.body.length, 1, 'overlap + refund must leave one active unique transaction');
  assert.strictEqual(salesPost.body[0].external_transaction_id, 'TRX-001');
  assert.strictEqual(salesPost.body[0].total_amount, 50000);
  assert.strictEqual(salesPost.body[0].cash_amount, 50000);
  assert.strictEqual(salesPost.body[0].sold_at, '2026-09-01', 'sold_at must keep the transaction date from Waktu Order');
  assert.strictEqual(salesPost.body[0].sold_hour, 13, 'sold_hour must come from Waktu Order, not Waktu Bayar');

  const itemsPost = calls.find(c => c.method === 'POST' && c.pathname.endsWith('/sale_items'));
  assert(itemsPost, 'sale_items insert must happen');
  assert.strictEqual(itemsPost.body.length, 2, 'overlapping export must not duplicate line items');
  assert(itemsPost.body.every(r => r.product_id === null), 'unmapped products must be preserved as raw items');
  assert.deepStrictEqual(itemsPost.body.map(r => r.external_sku).sort(), ['OD-01', 'TP-01']);

  const dailyPost = calls.find(c => c.method === 'POST' && c.pathname.endsWith('/daily_metrics'));
  assert(dailyPost, 'daily_metrics upsert must happen');
  assert.strictEqual(dailyPost.body.length, 1);
  assert.strictEqual(dailyPost.body[0].metric_date, '2026-09-01');
  assert.strictEqual(dailyPost.body[0].cash_revenue, 50000, 'refund and overlap must not inflate daily revenue');
  assert.strictEqual(dailyPost.body[0].transactions, 1, 'refund and overlap must not inflate transaction count');

  const batchCreate = calls.find(c => c.method === 'POST' && c.pathname.endsWith('/sales_import_batches'));
  assert(batchCreate, 'import batch must be recorded');
  assert.strictEqual(batchCreate.body.transaction_count, 1);
  assert.strictEqual(batchCreate.body.total_amount, 50000);

  const batchComplete = calls.find(c => c.method === 'PATCH' && c.pathname.endsWith('/sales_import_batches'));
  assert(batchComplete, 'batch must be finalized');
  assert.strictEqual(batchComplete.body.status, 'completed');

  assert(statuses.some(s => s[0] === 'success'), 'success status must be emitted');
  console.log('Majoo importer v2 smoke test: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
