const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { buildCanonicalSalesRuntime } = require('./build-sales-runtime');
const { buildStrictIndexRuntime } = require('./build-index-runtime');

function hashStyle(value) {
  return `'sha256-${crypto.createHash('sha256').update(value).digest('base64')}'`;
}

function collectStyleAttributes(text, source, out) {
  const re = /\sstyle=(['"])([\s\S]*?)\1/gi;
  let match;
  while ((match = re.exec(text))) {
    const value = match[2];
    if (!value) continue;
    out.push({ source, value, hash: hashStyle(value) });
  }
}

function inventoryStyleAttributes(root) {
  const out = [];
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hasnaria-style-attr-'));
  try {
    buildStrictIndexRuntime(path.join(root, 'index.html'), tmp);
    collectStyleAttributes(fs.readFileSync(path.join(tmp, 'index.html'), 'utf8'), 'index.html', out);

    const salesPath = path.join(tmp, 'sales-board.js');
    buildCanonicalSalesRuntime(root, salesPath);
    collectStyleAttributes(fs.readFileSync(salesPath, 'utf8'), 'sales-board.js', out);

    for (const name of ['app.js','core-app.js','stock-monitor.js','sales-ui-patch.js','nav-patch.js','offline-sync.js']) {
      const p = path.join(root, name);
      if (fs.existsSync(p)) collectStyleAttributes(fs.readFileSync(p, 'utf8'), name, out);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const uniq = new Map();
  for (const item of out) if (!uniq.has(item.value)) uniq.set(item.value, item);
  return [...uniq.values()].sort((a, b) => a.value.localeCompare(b.value));
}

if (require.main === module) {
  const root = process.cwd();
  const items = inventoryStyleAttributes(root);
  for (const item of items) console.log(`${item.hash}  ${item.source}  ${item.value}`);
  console.log(`style attribute CSP inventory: ${items.length} unique values`);
}

module.exports = { hashStyle, inventoryStyleAttributes };
