const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = process.cwd();
const steps = [
  'vercel-build-check.js',
  'verify-staff-owner-stable.js',
  'patch-nav-runtime.js',
  'patch-owner-executive-p5.js',
  'patch-owner-executive-p6.js',
  'patch-owner-executive-p9.js',
  'patch-owner-executive-p8.js',
  'patch-p0-desktop-stability.js'
];

for (const step of steps) {
  const file = path.join(ROOT, 'scripts', step);
  const result = spawnSync(process.execPath, [file], { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    console.error(`Vercel build runner failed at ${step}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Vercel build runner failed at ${step} with exit ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log('Vercel build runner: PASS');


// P0 UAT safety: Vercel Preview always receives the isolated Singapore staging
// backend; Vercel Production keeps the original production backend untouched.
// Publishable keys are designed to ship to browsers. NEVER place a secret/service
// role key here. Fail closed on missing/stale output instead of mixing DBs.
if (process.env.VERCEL_ENV === 'preview' || process.env.HASNARIA_P0_STAGING_PREVIEW === '1') {
  const fs = require('node:fs');
  const path = require('node:path');
  const { inspect, collect } = require('./p0_staging_isolation_gate');
  const ref = 'rynnpndtzjwpekbiwiif';
  const fallbackKey = 'sb_publishable_aPnlp0dEfAuFxLrjX5RoUA_70BQjAZ8';
  const key = (process.env.HASNARIA_STAGING_PUBLISHABLE_KEY || fallbackKey).trim();
  if (!/^sb_publishable_[a-zA-Z0-9_-]{8,}$/.test(key)) throw Error('Only a staging publishable key is permitted');
  const dir = path.join(process.cwd(), 'dist');
  const file = path.join(dir, 'auth-bootstrap.js');
  if (!fs.existsSync(file)) throw Error('Preview BLOCKED: auth-bootstrap.js missing; do not use production DB');
  let source = fs.readFileSync(file, 'utf8');
  const urlPattern = /window\.HASNARIA_SB\s*=\s*["'][^"']+["']/g;
  const keyPattern = /window\.HASNARIA_KEY\s*=\s*["'][^"']+["']/g;
  if ([...source.matchAll(urlPattern)].length !== 1 || [...source.matchAll(keyPattern)].length !== 1) {
    throw Error('Preview BLOCKED: ambiguous Supabase auth bootstrap config');
  }
  source = source.replace(urlPattern, 'window.HASNARIA_SB = "https://' + ref + '.supabase.co"')
                 .replace(keyPattern, 'window.HASNARIA_KEY = "' + key + '"');
  fs.writeFileSync(file, source);
  const files = collect(dir);
  const issues = inspect(files['index.html'] || '', files, ref, key);
  if (issues.length) throw Error('Preview BLOCKED: ' + issues.join('; '));
  console.log('Vercel Preview: isolated Singapore Supabase staging verified; production references absent');
}
