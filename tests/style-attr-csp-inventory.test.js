const path = require('path');
const { inventoryStyleAttributes } = require('../scripts/style-attr-csp-inventory');

const root = path.resolve(__dirname, '..');
const items = inventoryStyleAttributes(root);

if (!items.length) throw new Error('expected inline style attributes in current runtime');
for (const item of items) {
  if (!/^'sha256-[A-Za-z0-9+/=]+'$/.test(item.hash)) throw new Error(`invalid style attribute hash: ${item.hash}`);
  if (!item.value.trim()) throw new Error(`empty style attribute from ${item.source}`);
}

console.log(`style attribute CSP inventory test: PASS (${items.length} unique values)`);
for (const item of items) console.log(`${item.hash}  ${item.source}  ${item.value}`);
