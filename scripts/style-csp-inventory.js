const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STYLE_JS_FILES = [
  'sales-ui-patch.js',
  'nav-patch.js',
  'stock-monitor.js',
  'sales-board.part4.js'
];

function sha256Source(text) {
  return `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;
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
  throw new Error('unterminated style textContent expression');
}

function evaluateStaticString(expression, file) {
  if (/\$\{/.test(expression)) throw new Error(`${file}: style template interpolation is not allowed in hashed style blocks`);
  let value;
  try {
    value = Function(`"use strict"; return (${expression});`)();
  } catch (e) {
    throw new Error(`${file}: failed to evaluate static style expression: ${e.message}`);
  }
  if (typeof value !== 'string') throw new Error(`${file}: style expression did not evaluate to a string`);
  return value;
}

function extractJsStyleBlocks(root) {
  const blocks = [];
  for (const rel of STYLE_JS_FILES) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    const re = /([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\((['"])style\2\)/g;
    let match;
    let count = 0;
    while ((match = re.exec(source))) {
      const variable = match[1];
      const assignRe = new RegExp(`${variable.replace(/[$]/g, '\\$&')}\\.textContent\\s*=`, 'g');
      assignRe.lastIndex = re.lastIndex;
      const assign = assignRe.exec(source);
      if (!assign || assign.index - match.index > 3000) {
        throw new Error(`${rel}: style element has no nearby static textContent assignment`);
      }
      const exprStart = assign.index + assign[0].length;
      const parsed = readExpression(source, exprStart);
      const css = evaluateStaticString(parsed.expression, rel);
      blocks.push({ source: rel, index: count, css, hash: sha256Source(css) });
      count += 1;
    }
    if (!count) throw new Error(`${rel}: expected at least one style element`);
  }
  return blocks;
}

function extractIndexStyleBlocks(root) {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const blocks = [];
  const re = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi;
  let match;
  let index = 0;
  while ((match = re.exec(source))) {
    blocks.push({ source: 'index.html', index, css: match[1], hash: sha256Source(match[1]) });
    index += 1;
  }
  if (!blocks.length) throw new Error('index.html: expected at least one inline style block');
  return blocks;
}

function inventoryStyleBlocks(root) {
  const blocks = [...extractIndexStyleBlocks(root), ...extractJsStyleBlocks(root)];
  const unique = [];
  const seen = new Set();
  for (const block of blocks) {
    if (seen.has(block.hash)) continue;
    seen.add(block.hash);
    unique.push(block);
  }
  return unique;
}

if (require.main === module) {
  const root = process.cwd();
  const blocks = inventoryStyleBlocks(root);
  for (const block of blocks) console.log(`${block.hash}  ${block.source}#${block.index}`);
}

module.exports = { inventoryStyleBlocks, sha256Source };
