const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { buildCanonicalSalesRuntime } = require('./build-sales-runtime');
const { buildStrictIndexRuntime } = require('./build-index-runtime');
const { hardenRuntimeStyleAttachment } = require('./build-style-runtime');
const { inventoryStyleBlocks } = require('./style-csp-inventory');
const { inventoryStyleAttributes } = require('./style-attr-csp-inventory');

const ROOT = process.cwd();
const PARTS = [0, 1, 2, 3, 4].map((n) => `sales-board.part${n}.js`);
const SOURCE_ONLY_FILES = new Set([...PARTS, 'sales-import-v2.js']);
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'dist']);
const DEV_ONLY_DIRS = new Set(['.git', '.github', 'docs', 'supabase', 'tests', 'scripts', 'dist', 'node_modules']);
const DEV_ONLY_FILES = new Set(['README.md', 'vercel.json']);
const REQUIRED_RUNTIME_FILES = [
  'index.html',
  'auth-bootstrap.js',
  'password-reset-bootstrap.js',
  'app.js',
  'password-policy.js',
  'core-app.js',
  'stock-monitor.js',
  'sales-board.js',
  'sales-ui-patch.js',
  'xlsx-preload.js'
];
const TEXT_RUNTIME_RE = /\.(?:html?|js|css)$/i;
const STATIC_ASSET_RE = /\.(?:html?|js|css|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|map)$/i;

function fail(message) {
  console.error(`Vercel build gate failed: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited with ${result.status}`);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known' && entry.isDirectory()) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function normalizeLocalAssetRef(raw) {
  const withoutQuery = String(raw || '').split('#')[0].split('?')[0];
  if (!withoutQuery || withoutQuery.startsWith('/')) return null;
  const decoded = withoutQuery.replace(/^\/+/, '');
  if (!decoded || !STATIC_ASSET_RE.test(decoded)) return null;
  return decoded;
}

function collectRootRelativeStaticRefs(text) {
  const refs = new Set();
  const re = /(?:["'`(=])\/([^"'`()<>\\\s]+)(?=["'`)\s>])/g;
  let match;
  while ((match = re.exec(text))) {
    const ref = normalizeLocalAssetRef(match[1]);
    if (ref) refs.add(ref);
  }
  return refs;
}

function getCspValue() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  } catch (e) {
    fail(`invalid vercel.json: ${e.message}`);
  }
  const headers = (config.headers || []).flatMap((rule) => rule.headers || []);
  const csp = headers.find((header) => String(header.key || '').toLowerCase() === 'content-security-policy');
  if (!csp || !csp.value) fail('Content-Security-Policy header missing from vercel.json');
  return String(csp.value);
}

function directive(csp, name) {
  return csp.split(';').map((x) => x.trim()).find((x) => new RegExp(`^${name}\\b`, 'i').test(x)) || '';
}

function assertStrictScriptCsp(dist) {
  const csp = getCspValue();
  const scriptDirective = directive(csp, 'script-src');
  if (!scriptDirective) fail('script-src directive missing from CSP');
  if (/'unsafe-inline'/.test(scriptDirective)) fail("script-src still allows 'unsafe-inline'");

  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html)) fail('inline script leaked into production index.html');
  if (/\son[a-z]+\s*=/i.test(html)) fail('inline event handler leaked into production index.html');
  if (!html.includes('/auth-bootstrap.js')) fail('production index missing auth bootstrap');
  if (!html.includes('/password-reset-bootstrap.js')) fail('production index missing password reset bootstrap');

  console.log('Strict script CSP production gate: PASS');
}

function assertHashedStyleCsp() {
  const csp = getCspValue();
  const styleDirective = directive(csp, 'style-src');
  const styleAttrDirective = directive(csp, 'style-src-attr');
  if (!styleDirective) fail('style-src directive missing from CSP');
  if (!styleAttrDirective) fail('style-src-attr directive missing from CSP');
  if (/'unsafe-inline'/.test(styleDirective)) fail("style-src still allows 'unsafe-inline'");
  if (/'unsafe-inline'/.test(styleAttrDirective)) fail("style-src-attr still allows 'unsafe-inline'");
  if (!/'unsafe-hashes'/.test(styleAttrDirective)) fail("style-src-attr must use 'unsafe-hashes' for approved static style attributes");

  const blocks = inventoryStyleBlocks(ROOT);
  const expectedBlocks = new Set(blocks.map((x) => x.hash));
  const declaredBlocks = new Set(styleDirective.match(/'sha256-[A-Za-z0-9+/=]+'/g) || []);
  for (const hash of expectedBlocks) {
    if (!declaredBlocks.has(hash)) fail(`style-src missing required hash: ${hash}`);
  }
  for (const hash of declaredBlocks) {
    if (!expectedBlocks.has(hash)) fail(`style-src contains stale/untracked hash: ${hash}`);
  }
  if (declaredBlocks.size !== expectedBlocks.size) fail('style-src hash inventory size mismatch');

  const attrs = inventoryStyleAttributes(ROOT);
  const expectedAttrs = new Set(attrs.map((x) => x.hash));
  const declaredAttrs = new Set(styleAttrDirective.match(/'sha256-[A-Za-z0-9+/=]+'/g) || []);
  for (const hash of expectedAttrs) {
    if (!declaredAttrs.has(hash)) fail(`style-src-attr missing required hash: ${hash}`);
  }
  for (const hash of declaredAttrs) {
    if (!expectedAttrs.has(hash)) fail(`style-src-attr contains stale/untracked hash: ${hash}`);
  }
  if (declaredAttrs.size !== expectedAttrs.size) fail('style-src-attr hash inventory size mismatch');

  console.log(`Hashed style element CSP gate: PASS (${expectedBlocks.size} hashes)`);
  console.log(`Hashed style attribute CSP gate: PASS (${expectedAttrs.size} hashes)`);
}

function assertCanonicalSalesRuntime(dist) {
  const salesPath = path.join(dist, 'sales-board.js');
  const sales = fs.readFileSync(salesPath, 'utf8');
  const forbidden = [
    'sales-board.part0.js',
    'sales-board.part1.js',
    'sales-board.part2.js',
    'sales-board.part3.js',
    'sales-board.part4.js',
    "chunks.join('')",
    'function patchSource(',
    "fetch('/sales-import-v2.js",
    "style=\"width:' + barWidth.toFixed(1)",
    "style=\"width:'+Math.max(3,Math.min(100,s.percent||0))"
  ];
  for (const marker of forbidden) {
    if (sales.includes(marker)) fail(`legacy Sales runtime marker leaked into production: ${marker}`);
  }
  if (!sales.includes('window.__HASNARIA_IMPORT_V2')) fail('canonical Sales runtime is missing Majoo importer v2');
  if (!sales.includes('return window.__HASNARIA_IMPORT_V2(fileOrFiles')) fail('canonical Sales runtime is not delegating to importer v2');
  if (!sales.includes('.sb-w-100{width:100%}')) fail('canonical Sales runtime is missing width utility classes');
  console.log('Canonical Sales production artifact: PASS');
}

function assertRuntimeArtifactClosure(dist) {
  for (const rel of REQUIRED_RUNTIME_FILES) {
    const target = path.join(dist, rel);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`dist missing required runtime file: ${rel}`);
  }
  if (fs.existsSync(path.join(dist, 'sales-board-core.js'))) fail('obsolete sales-board-core.js leaked into dist');
  for (const sourceOnly of SOURCE_ONLY_FILES) {
    if (fs.existsSync(path.join(dist, sourceOnly))) fail(`source-only Sales file leaked into dist: ${sourceOnly}`);
  }

  const files = walk(dist, []);
  for (const file of files) {
    const rel = path.relative(dist, file);
    const segments = rel.split(path.sep);
    if (segments.some((segment) => segment.startsWith('.') && segment !== '.well-known')) {
      fail(`hidden file leaked into dist: ${rel}`);
    }
    if (segments.some((segment) => DEV_ONLY_DIRS.has(segment)) || DEV_ONLY_FILES.has(rel)) {
      fail(`development-only file leaked into dist: ${rel}`);
    }
  }

  for (const file of files) {
    if (!TEXT_RUNTIME_RE.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/setAttribute\(\s*['"]style['"]/.test(text)) fail(`runtime uses blocked setAttribute('style') in ${path.relative(dist, file)}`);
    if (/\.style\.cssText\s*=/.test(text)) fail(`runtime uses blocked style.cssText assignment in ${path.relative(dist, file)}`);
    if (/document\.head\.appendChild\(s\);\s*\}\s*s\.textContent\s*=/.test(text)) {
      fail(`runtime attaches empty style element before CSS assignment in ${path.relative(dist, file)}`);
    }
    for (const ref of collectRootRelativeStaticRefs(text)) {
      const target = path.resolve(dist, ref);
      const distRoot = path.resolve(dist) + path.sep;
      if (!target.startsWith(distRoot)) fail(`runtime asset escapes dist: /${ref} referenced by ${path.relative(dist, file)}`);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        fail(`missing runtime asset /${ref} referenced by ${path.relative(dist, file)}`);
      }
    }
  }

  assertStrictScriptCsp(dist);
  assertHashedStyleCsp();
  assertCanonicalSalesRuntime(dist);
  console.log('Runtime artifact closure: PASS');
}

for (const file of walk(ROOT)) {
  if (!file.endsWith('.js')) continue;
  const base = path.basename(file);
  if (/^sales-board\.part\d+\.js$/.test(base)) continue;
  run(process.execPath, ['--check', file]);
}

for (const part of PARTS) {
  if (!fs.existsSync(path.join(ROOT, part))) fail(`missing ${part}`);
}
const assembled = PARTS.map((part) => fs.readFileSync(path.join(ROOT, part), 'utf8')).join('');
const assembledPath = path.join(os.tmpdir(), 'hasnaria-sales-board-assembled.js');
fs.writeFileSync(assembledPath, assembled);
run(process.execPath, ['--check', assembledPath]);

run(process.execPath, ['tests/majoo-import-v2.test.js']);
run(process.execPath, ['tests/native-user-profiles.test.js']);
run(process.execPath, ['tests/password-policy.test.js']);
run(process.execPath, ['tests/canonical-sales-runtime.test.js']);
run(process.execPath, ['tests/strict-index-runtime.test.js']);
run(process.execPath, ['tests/style-csp-inventory.test.js']);
run(process.execPath, ['tests/style-attr-csp-inventory.test.js']);
run(process.execPath, ['tests/style-runtime-build.test.js']);

const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
  if (DEV_ONLY_DIRS.has(entry.name) || DEV_ONLY_FILES.has(entry.name) || SOURCE_ONLY_FILES.has(entry.name)) continue;
  const src = path.join(ROOT, entry.name);
  const dst = path.join(dist, entry.name);
  fs.cpSync(src, dst, { recursive: true });
}

buildStrictIndexRuntime(path.join(ROOT, 'index.html'), dist);
run(process.execPath, ['--check', path.join(dist, 'auth-bootstrap.js')]);
run(process.execPath, ['--check', path.join(dist, 'password-reset-bootstrap.js')]);
buildCanonicalSalesRuntime(ROOT, path.join(dist, 'sales-board.js'));
run(process.execPath, ['--check', path.join(dist, 'sales-board.js')]);
hardenRuntimeStyleAttachment(dist);
run(process.execPath, ['--check', path.join(dist, 'sales-ui-patch.js')]);
run(process.execPath, ['--check', path.join(dist, 'stock-monitor.js')]);

if (!fs.existsSync(path.join(dist, 'index.html'))) fail('dist/index.html was not produced');
assertRuntimeArtifactClosure(dist);
console.log('Vercel build gate: PASS');
