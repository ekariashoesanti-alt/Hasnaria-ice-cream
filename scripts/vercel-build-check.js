const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const PARTS = [0, 1, 2, 3, 4].map((n) => `sales-board.part${n}.js`);
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'dist']);
const DEV_ONLY_DIRS = new Set(['.git', '.github', 'docs', 'supabase', 'tests', 'scripts', 'dist', 'node_modules']);
const DEV_ONLY_FILES = new Set(['README.md', 'vercel.json']);
const REQUIRED_RUNTIME_FILES = [
  'index.html',
  'app.js',
  'password-policy.js',
  'core-app.js',
  'stock-monitor.js',
  'sales-board.js',
  'sales-ui-patch.js',
  'xlsx-preload.js',
  'sales-import-v2.js',
  ...PARTS
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

function assertRuntimeArtifactClosure(dist) {
  for (const rel of REQUIRED_RUNTIME_FILES) {
    const target = path.join(dist, rel);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`dist missing required runtime file: ${rel}`);
  }
  if (fs.existsSync(path.join(dist, 'sales-board-core.js'))) fail('obsolete sales-board-core.js leaked into dist');

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
    for (const ref of collectRootRelativeStaticRefs(text)) {
      const target = path.resolve(dist, ref);
      const distRoot = path.resolve(dist) + path.sep;
      if (!target.startsWith(distRoot)) fail(`runtime asset escapes dist: /${ref} referenced by ${path.relative(dist, file)}`);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        fail(`missing runtime asset /${ref} referenced by ${path.relative(dist, file)}`);
      }
    }
  }

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

const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
  if (DEV_ONLY_DIRS.has(entry.name) || DEV_ONLY_FILES.has(entry.name)) continue;
  const src = path.join(ROOT, entry.name);
  const dst = path.join(dist, entry.name);
  fs.cpSync(src, dst, { recursive: true });
}

if (!fs.existsSync(path.join(dist, 'index.html'))) fail('dist/index.html was not produced');
assertRuntimeArtifactClosure(dist);
console.log('Vercel build gate: PASS');
