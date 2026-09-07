const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const PARTS = [0, 1, 2, 3, 4].map((n) => `sales-board.part${n}.js`);
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'dist']);

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
    if (entry.name.startsWith('.') && entry.name !== '.well-known') {
      if (entry.isDirectory()) continue;
    }
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
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

const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const DEV_ONLY_DIRS = new Set(['.git', '.github', 'docs', 'supabase', 'tests', 'scripts', 'dist', 'node_modules']);
const DEV_ONLY_FILES = new Set(['README.md', 'vercel.json']);
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (DEV_ONLY_DIRS.has(entry.name) || DEV_ONLY_FILES.has(entry.name)) continue;
  const src = path.join(ROOT, entry.name);
  const dst = path.join(dist, entry.name);
  fs.cpSync(src, dst, { recursive: true });
}

if (!fs.existsSync(path.join(dist, 'index.html'))) fail('dist/index.html was not produced');
console.log('Vercel build gate: PASS');
