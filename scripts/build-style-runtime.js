const fs = require('fs');
const path = require('path');

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label} marker is ambiguous`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function readExpression(source, start) {
  let quote = null;
  let escape = false;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') paren += 1;
    else if (ch === ')') paren -= 1;
    else if (ch === '[') bracket += 1;
    else if (ch === ']') bracket -= 1;
    else if (ch === '{') brace += 1;
    else if (ch === '}') brace -= 1;
    else if (ch === ';' && paren === 0 && bracket === 0 && brace === 0) {
      return { expression: source.slice(start, i).trim(), end: i + 1 };
    }
  }
  throw new Error('unterminated runtime style expression');
}

function hardenStyleFunction(source, functionMarker, nextFunctionMarker, styleId, label) {
  const start = source.indexOf(functionMarker);
  if (start < 0) throw new Error(`${label} function marker not found`);
  const end = source.indexOf(nextFunctionMarker, start + functionMarker.length);
  if (end < 0) throw new Error(`${label} next-function marker not found`);

  let segment = source.slice(start, end);
  const oldCreate = `if (!s) { s = document.createElement('style'); s.id = '${styleId}'; document.head.appendChild(s); }`;
  const newCreate = `if (s) return;\n    s = document.createElement('style'); s.id = '${styleId}';`;
  segment = replaceOnce(segment, oldCreate, newCreate, `${label} style creation`);

  const assignment = 's.textContent =';
  const textIndex = segment.indexOf(assignment);
  if (textIndex < 0) throw new Error(`${label} textContent assignment missing`);
  const parsed = readExpression(segment, textIndex + assignment.length);
  segment = segment.slice(0, textIndex) +
    `s.appendChild(document.createTextNode(${parsed.expression}));` +
    segment.slice(parsed.end);

  const closeIndex = segment.lastIndexOf('\n  }');
  if (closeIndex < 0 || closeIndex < textIndex) throw new Error(`${label} function close marker missing`);
  segment = segment.slice(0, closeIndex) + '\n    document.head.appendChild(s);' + segment.slice(closeIndex);

  const textNodeIndex = segment.indexOf('s.appendChild(document.createTextNode(');
  const appendIndex = segment.lastIndexOf('document.head.appendChild(s);');
  if (textNodeIndex < 0 || appendIndex < textNodeIndex) {
    throw new Error(`${label} style is not populated before attachment`);
  }
  if (segment.includes('s.textContent =')) throw new Error(`${label} still rewrites style.textContent`);

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
    const hardened = hardenStyleFunction(
      source,
      spec.functionMarker,
      spec.nextFunctionMarker,
      spec.styleId,
      spec.label
    );
    fs.writeFileSync(file, hardened);
  }
}

module.exports = { readExpression, hardenStyleFunction, hardenRuntimeStyleAttachment };

if (require.main === module) {
  const dist = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(process.cwd(), 'dist');
  hardenRuntimeStyleAttachment(dist);
  console.log('Runtime style attachment hardening: PASS');
}
