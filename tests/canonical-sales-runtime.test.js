const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildCanonicalSalesRuntime } = require('../scripts/build-sales-runtime');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hasnaria-sales-runtime-'));
const output = path.join(tempDir, 'sales-board.js');

try {
  const runtime = buildCanonicalSalesRuntime(root, output);

  if (!runtime.includes('window.__HASNARIA_IMPORT_V2')) throw new Error('Majoo importer v2 is missing');
  if (!runtime.includes('window.__HASNARIA_PRODUCT_REPORT_V1')) throw new Error('Monthly SKU parser is missing from canonical runtime');
  if (!runtime.includes('window.__HASNARIA_SALES_RECONCILE_V1')) throw new Error('Read-only reconciler missing from canonical runtime');
  if (!runtime.includes('window.__HASNARIA_SCOPE_BRIDGE_V1')) throw new Error('Evidence-gated revenue scope bridge missing from canonical runtime');
  if (!runtime.includes('economic_event_key')) throw new Error('Cross-source economic-event deduplication guard missing');
  if (!runtime.includes('sbReportReconcileChoose')) throw new Error('Read-only reconciliation UI missing');
  if (!runtime.includes('Simpan ke Staging Singapore')) throw new Error('Explicit Singapore save UI action missing');
  if (!runtime.includes('resolveSingaporeOutlet(BRAND,token,KEY)')) throw new Error('Singapore Owner/Outlet resolution missing');
  if (!runtime.includes('singaporeUatApproved:!targetProd')) throw new Error('Singapore test source gate missing');
  if (!runtime.includes('tokyoReviewApproved:targetProd,reviewOnly:targetProd')) throw new Error('Tokyo review-only source gate missing');
  if (!runtime.includes('enableWrite:true,confirmed:true')) throw new Error('Explicit Owner save confirmation guard missing');
  if (!runtime.includes('isTokyoProduction(SB)')) throw new Error('Exact Tokyo project endpoint guard missing');
  if (!runtime.includes('resolveProductionOutlet(BRAND,token,KEY)')) throw new Error('Owner production outlet resolution missing');
  if (!runtime.includes('renderReportSourceChoiceModal')) throw new Error('Flagged two-source modal missing');
  const excelChangeStart = runtime.indexOf('if (fileInput) {');
  const excelChangeEnd = runtime.indexOf('var btnCancelFile',excelChangeStart);
  if(excelChangeStart<0 || excelChangeEnd<=excelChangeStart) throw new Error('Excel file input handler missing');
  const excelChange = runtime.slice(excelChangeStart,excelChangeEnd);
  if(!excelChange.includes('STATE.showReportPreview=true;')) throw new Error('SKU Excel should open result preview after file parse');
  if(!excelChange.includes('}finally{') || !excelChange.includes("STATE.importStatus=null;"))
    throw new Error('Excel parsing 15% blocking overlay not cleared on both success and error');
  if(!excelChange.includes("!STATE.importing && STATE.importStatus && STATE.importStatus.type==='progress'"))
    throw new Error('Legacy Excel file-selection status must also unblock after parsing');

  if (!runtime.includes('renderReportPreviewModal')) throw new Error('Read-only product preview missing');
  if (!runtime.includes('Selisih cakupan laporan')) throw new Error('Majoo scope reconciliation disclosure missing');
  if (!runtime.includes('laporan-produk-tambahan-kolom-refund')) throw new Error('Official Majoo product-report definition missing');
  if (!runtime.includes('Penjualan Ekstra / Sub Ekstra')) throw new Error('Majoo extra-option audit guidance missing');
  if (!runtime.includes('raw: !!preciseNumbers')) throw new Error('Original numeric HPP precision missing for SKU workbook');
  if (!runtime.includes("var mode = preciseNumbers ? 'sku_precision' : 'legacy_display';")) throw new Error('SKU and legacy Excel matrix caches not isolated');
  if (!runtime.includes('cellDates: !preciseNumbers')) throw new Error('Legacy date parsing protection missing');
  if (!runtime.includes('return n==null ? null : n;')) throw new Error('revenue normalization patch missing');
  if (!runtime.includes('window.__HASNARIA_XLSX_READY')) throw new Error('XLSX preload coordination patch missing');
  if (!runtime.includes('return window.__HASNARIA_IMPORT_V2(fileOrFiles')) throw new Error('importFiles v2 delegation missing');
  if (!runtime.includes('.sb-w-100{width:100%}')) throw new Error('Sales width utility classes missing');
  if (!runtime.includes("' sb-w-' + Math.max(0, Math.min(100, Math.round(barWidth)))")) throw new Error('SKU bar width class patch missing');
  if (!runtime.includes("sb-status-fill sb-w-'+Math.max(3,Math.min(100,Math.round(Number(s.percent)||0)))")) throw new Error('import progress width class patch missing');
  if (runtime.includes('style="width:')) throw new Error('inline Sales width style survived canonical compilation');

  const forbidden = [
    'sales-board.part0.js',
    'sales-board.part1.js',
    'sales-board.part2.js',
    'sales-board.part3.js',
    'sales-board.part4.js',
    "chunks.join('')",
    'function patchSource(',
    "style=\"width:' + barWidth.toFixed(1)",
    "style=\"width:'+Math.max(3,Math.min(100,s.percent||0))"
  ];
  for (const marker of forbidden) {
    if (runtime.includes(marker)) throw new Error(`runtime marker leaked: ${marker}`);
  }

  if (runtime.includes('return (n>0 && n<10000) ? n*1000 : n;')) {
    throw new Error('legacy revenue scaling heuristic survived compilation');
  }

  const checked = spawnSync(process.execPath, ['--check', output], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(checked.stderr || checked.stdout || 'node --check failed');

  console.log('canonical sales runtime test: PASS');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
