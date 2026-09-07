const fs = require('fs');
const path = require('path');

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label} marker is ambiguous`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function deferStyleAppendInFunction(source, functionMarker, nextFunctionMarker, styleId, label) {
  const start = source.indexOf(functionMarker);
  if (start < 0) throw new Error(`${label} function marker not found`);
  const end = source.indexOf(nextFunctionMarker, start + functionMarker.length);
  if (end < 0) throw new Error(`${label} next-function marker not found`);

  let segment = source.slice(start, end);
  const oldCreate = `if (!s) { s = document.createElement('style'); s.id = '${styleId}'; document.head.appendChild(s); }`;
  const newCreate = `var created = false;\n    if (!s) { s = document.createElement('style'); s.id = '${styleId}'; created = true; }`;
  segment = replaceOnce(segment, oldCreate, newCreate, `${label} style creation`);

  const textIndex = segment.indexOf('s.textContent =');
  if (textIndex < 0) throw new Error(`${label} textContent assignment missing`);
  const closeIndex = segment.lastIndexOf('\n  }');
  if (closeIndex < 0 || closeIndex < textIndex) throw new Error(`${label} function close marker missing`);

  segment = segment.slice(0, closeIndex) + '\n    if (created) document.head.appendChild(s);' + segment.slice(closeIndex);
  const appendIndex = segment.lastIndexOf('document.head.appendChild(s);');
  if (appendIndex < textIndex) throw new Error(`${label} style is still attached before CSS is populated`);

  return source.slice(0, start) + segment + source.slice(end);
}

function hardenRuntimeStyleAttachment(distDir) {
  const dist = path.resolve(distDir);
  const specs = [
    {
      file: 'sales-ui-patch.js',
      functionMarker: '  function injectStyle() {',
      nextFunctionMarker: '  function hideSalesPanels() {',
      styleId: 'hasnaria-sales-layout-style',
      label: 'Sales UI layout style'
    },
    {
      file: 'stock-monitor.js',
      functionMarker: '  function css() {',
      nextFunctionMarker: '  function chip(l) {',
      styleId: 'stk-css',
      label: 'Stock monitor style'
    }
  ];

  for (const spec of specs) {
    const file = path.join(dist, spec.file);
    if (!fs.existsSync(file)) throw new Error(`missing runtime style file: ${spec.file}`);
    const source = fs.readFileSync(file, 'utf8');
    const hardened = deferStyleAppendInFunction(
      source,
      spec.functionMarker,
      spec.nextFunctionMarker,
      spec.styleId,
      spec.label
    );
    fs.writeFileSync(file, hardened);
  }
}

module.exports = { deferStyleAppendInFunction, hardenRuntimeStyleAttachment };

if (require.main === module) {
  const dist = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(process.cwd(), 'dist');
  hardenRuntimeStyleAttachment(dist);
  console.log('Runtime style attachment hardening: PASS');
}
