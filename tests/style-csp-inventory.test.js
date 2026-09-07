const path = require('path');
const { inventoryStyleBlocks } = require('../scripts/style-csp-inventory');

const root = path.resolve(__dirname, '..');
const blocks = inventoryStyleBlocks(root);

if (blocks.length < 6) throw new Error(`expected at least 6 unique style blocks, found ${blocks.length}`);
if (!blocks.some((x) => x.source === 'index.html')) throw new Error('index style block missing');
if (!blocks.some((x) => x.source === 'sales-board.part4.js')) throw new Error('Sales style block missing');
if (!blocks.some((x) => x.source === 'stock-monitor.js')) throw new Error('Stock style block missing');
if (!blocks.some((x) => x.source === 'nav-patch.js')) throw new Error('Navigation style blocks missing');
if (!blocks.some((x) => x.source === 'sales-ui-patch.js')) throw new Error('Sales UI style block missing');

console.log('style CSP inventory test: PASS');
for (const block of blocks) console.log(`${block.hash}  ${block.source}#${block.index}`);
