const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { hardenRuntimeStyleAttachment } = require('../scripts/build-style-runtime');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hasnaria-style-runtime-'));

try {
  for (const name of ['sales-ui-patch.js', 'stock-monitor.js']) {
    fs.copyFileSync(path.join(root, name), path.join(tmp, name));
  }

  hardenRuntimeStyleAttachment(tmp);

  for (const name of ['sales-ui-patch.js', 'stock-monitor.js']) {
    const file = path.join(tmp, name);
    const source = fs.readFileSync(file, 'utf8');
    const textIndex = source.indexOf('s.textContent =');
    const appendIndex = source.indexOf('document.head.appendChild(s);', textIndex);
    if (textIndex < 0 || appendIndex < 0 || appendIndex < textIndex) {
      throw new Error(`${name}: style attachment order is not CSP-safe`);
    }
    if (/document\.head\.appendChild\(s\);\s*\}\s*s\.textContent\s*=/.test(source)) {
      throw new Error(`${name}: empty style element can still be attached before CSS assignment`);
    }
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (checked.status !== 0) throw new Error(checked.stderr || checked.stdout || `${name} syntax check failed`);
  }

  console.log('runtime style attachment test: PASS');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
