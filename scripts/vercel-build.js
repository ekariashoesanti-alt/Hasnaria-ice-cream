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
