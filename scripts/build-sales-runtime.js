const fs = require('fs');
const path = require('path');

const PARTS = [0, 1, 2, 3, 4].map((n) => `sales-board.part${n}.js`);
const IMPORTER = 'sales-import-v2.js';

function replaceOnce(code, search, replacement, label) {
  const first = code.indexOf(search);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (code.indexOf(search, first + search.length) >= 0) throw new Error(`${label} marker is ambiguous`);
  return code.slice(0, first) + replacement + code.slice(first + search.length);
}

function patchLegacySalesSource(source) {
  let code = source;

  code = replaceOnce(
    code,
    'function revenue(v) { var n=num(v); if(n==null) return null; return (n>0 && n<10000) ? n*1000 : n; }',
    'function revenue(v) { var n=num(v); return n==null ? null : n; }',
    'sales revenue normalization'
  );

  code = replaceOnce(
    code,
    'async function ensureXLSX() {\n    if (window.XLSX) return;',
    'async function ensureXLSX() {\n    if (window.XLSX) return;\n    if (window.__HASNARIA_XLSX_READY) { await window.__HASNARIA_XLSX_READY; if (window.XLSX) return; }',
    'XLSX preload coordination'
  );

  const importerPattern = /async function importFiles\(fileOrFiles\) \{[\s\S]*?\n  function importFile\(f\) \{ return importFiles\(f\); \}/g;
  const matches = code.match(importerPattern) || [];
  if (matches.length !== 1) throw new Error(`legacy Majoo importer marker count=${matches.length}`);

  code = code.replace(
    importerPattern,
    "async function importFiles(fileOrFiles) {\n    if (typeof window.__HASNARIA_IMPORT_V2 !== 'function') throw new Error('Importer Majoo v2 belum siap. Silakan refresh halaman.');\n    return window.__HASNARIA_IMPORT_V2(fileOrFiles, { STATE: STATE, BRAND: BRAND, SB: SB, KEY: KEY, setImportStatus: setImportStatus, draw: draw, getFileMatrix: getFileMatrix, loadMetrics: loadMetrics, getTok: getTok });\n  }\n\n  function importFile(f) { return importFiles(f); }"
  );

  return code;
}

function buildCanonicalSalesRuntime(rootDir, destination) {
  const root = path.resolve(rootDir);
  for (const part of PARTS) {
    const file = path.join(root, part);
    if (!fs.existsSync(file)) throw new Error(`missing ${part}`);
  }
  const importerPath = path.join(root, IMPORTER);
  if (!fs.existsSync(importerPath)) throw new Error(`missing ${IMPORTER}`);

  const assembled = PARTS.map((part) => fs.readFileSync(path.join(root, part), 'utf8')).join('');
  if (!assembled.includes('Hasnaria Sales')) throw new Error('assembled sales source looks empty');

  const patched = patchLegacySalesSource(assembled);
  const importer = fs.readFileSync(importerPath, 'utf8');
  const output = [
    '/* Hasnaria Sales canonical runtime — generated at build time; do not edit dist output directly. */',
    importer,
    patched
  ].join('\n');

  if (/sales-board\.part[0-4]\.js|chunks\.join\(|function patchSource\(/.test(output)) {
    throw new Error('runtime loader marker leaked into canonical Sales artifact');
  }
  if (!output.includes('window.__HASNARIA_IMPORT_V2')) throw new Error('Majoo importer v2 missing from canonical Sales artifact');

  if (destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, output);
  }
  return output;
}

module.exports = {
  PARTS,
  IMPORTER,
  patchLegacySalesSource,
  buildCanonicalSalesRuntime
};

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const destination = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'dist', 'sales-board.js');
  buildCanonicalSalesRuntime(root, destination);
  console.log(`Canonical Sales runtime written: ${path.relative(root, destination)}`);
}
