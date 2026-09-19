const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildStrictIndexRuntime } = require('../scripts/build-index-runtime');
const { inventoryStyleBlocks } = require('../scripts/style-csp-inventory');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hasnaria-strict-index-'));

try {
  const result = buildStrictIndexRuntime(path.join(root, 'index.html'), out);
  const html = result.html;

  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html)) throw new Error('inline script survived production index build');
  if (/\son[a-z]+\s*=/i.test(html)) throw new Error('inline event handler survived production index build');
  if (!html.includes('/auth-bootstrap.js')) throw new Error('auth bootstrap script missing');
  if (!html.includes('/password-reset-bootstrap.js')) throw new Error('password reset bootstrap script missing');
  if (!html.includes('/owner-shell-guard.js?v=1')) throw new Error('owner shell guard missing from production index');
  if (html.indexOf('/owner-shell-guard.js?v=1') > html.indexOf('/app.js')) throw new Error('owner shell guard must load before app runtime');
  if (!html.includes('/owner-green.css?v=1')) throw new Error('Owner green palette missing from production index');
  if (html.indexOf('/owner-green.css?v=1') < html.indexOf('/erp.css')) throw new Error('Owner green palette must load after ERP stylesheet');
  if (!fs.readFileSync(path.join(root, 'owner-green.css'), 'utf8').includes('--hasnaria-green:#176b55')) throw new Error('Owner palette must use Hasnaria green');

  for (const name of ['auth-bootstrap.js', 'password-reset-bootstrap.js']) {
    const file = path.join(out, name);
    if (!fs.existsSync(file)) throw new Error(`${name} was not emitted`);
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (checked.status !== 0) throw new Error(checked.stderr || checked.stdout || `${name} syntax check failed`);
  }

  const auth = fs.readFileSync(path.join(out, 'auth-bootstrap.js'), 'utf8');
  if (!auth.includes('window.hasnariaGoogle')) throw new Error('Google OAuth function missing');
  if (!auth.includes("addEventListener('click'")) throw new Error('Google button event binding missing');

  const reset = fs.readFileSync(path.join(out, 'password-reset-bootstrap.js'), 'utf8');
  if (!reset.includes('resetPasswordForEmail')) throw new Error('password reset flow missing');

  const ownerGuard = fs.readFileSync(path.join(root, 'owner-shell-guard.js'), 'utf8');
  if (!ownerGuard.includes('__HASNARIA_OWNER_SHELL_BOOTSTRAPPED')) throw new Error('owner shell guard must be idempotent before static + fallback loading');

  const styleBlocks = inventoryStyleBlocks(root);
  if (styleBlocks.length < 6) throw new Error(`expected at least 6 unique inline style blocks, found ${styleBlocks.length}`);

  console.log('strict index runtime test: PASS');
  console.log('style CSP hash inventory:');
  for (const block of styleBlocks) console.log(`${block.hash}  ${block.source}#${block.index}`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
