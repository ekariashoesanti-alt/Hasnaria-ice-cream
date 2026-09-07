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
