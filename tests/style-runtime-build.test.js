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
    const textNodeIndex = source.indexOf('s.appendChild(document.createTextNode(');
    const appendIndex = source.indexOf('document.head.appendChild(s);', textNodeIndex);
    if (textNodeIndex < 0 || appendIndex < 0 || appendIndex < textNodeIndex) {
      throw new Error(`${name}: style text node is not attached before the style element`);
    }
    if (!source.includes('if (s) return;')) {
      throw new Error(`${name}: static style is not single-shot`);
    }
    if (source.includes('s.textContent =')) {
      throw new Error(`${name}: connected style textContent rewrite survived build hardening`);
    }
    if (/document\.head\.appendChild\(s\);\s*\}\s*s\.(?:textContent|appendChild)/.test(source)) {
      throw new Error(`${name}: style element can still be attached before CSS is populated`);
    }
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (checked.status !== 0) throw new Error(checked.stderr || checked.stdout || `${name} syntax check failed`);
  }

  console.log('runtime style attachment test: PASS');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
