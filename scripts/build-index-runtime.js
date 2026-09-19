const fs = require('fs');
const path = require('path');

const GOOGLE_BINDING = `\n(function bindHasnariaGoogleButton() {\n  function bind() {\n    var btn = document.getElementById('googleBtn');\n    if (!btn || btn.__hasnariaGoogleBound) return;\n    btn.__hasnariaGoogleBound = true;\n    btn.addEventListener('click', function (event) {\n      if (typeof window.hasnariaGoogle === 'function') window.hasnariaGoogle(event);\n    });\n  }\n  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });\n  else bind();\n})();\n`;
const OWNER_SHELL_TAG = '<script src="/owner-shell-guard.js?v=1"></script>';
const OWNER_PALETTE_TAG = '<link rel="stylesheet" href="/owner-green.css?v=1">';

function fail(message) {
  throw new Error(`Index runtime build failed: ${message}`);
}

function buildStrictIndexRuntime(sourceIndexPath, outputDir) {
  const source = fs.readFileSync(sourceIndexPath, 'utf8');
  const extracted = [];

  let html = source.replace(/<script(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi, function (_full, attrs, code) {
    const body = String(code || '').trim();
    if (!body) fail('empty inline script encountered');

    let name;
    let output = body + '\n';
    if (body.includes('window.HASNARIA_SB') && body.includes('window.hasnariaGoogle')) {
      name = 'auth-bootstrap.js';
      output += GOOGLE_BINDING;
    } else if (body.includes('resetPasswordForEmail') && body.includes('resetBtn')) {
      name = 'password-reset-bootstrap.js';
    } else {
      fail('unknown inline script block; update the compiler explicitly before release');
    }

    if (extracted.some((item) => item.name === name)) fail(`duplicate inline runtime block: ${name}`);
    extracted.push({ name, code: output });
    return `<script src="/${name}"></script>`;
  });

  if (extracted.length !== 2) fail(`expected exactly 2 inline scripts, found ${extracted.length}`);
  if (!extracted.some((item) => item.name === 'auth-bootstrap.js')) fail('auth bootstrap block not found');
  if (!extracted.some((item) => item.name === 'password-reset-bootstrap.js')) fail('password reset bootstrap block not found');

  html = html.replace(/\s+onclick=(['"])return\s+hasnariaGoogle\(event\)\1/gi, '');

  const erpCssTag = html.match(/<link rel="stylesheet" href="\/erp\.css[^\"]*">/i);
  if (!erpCssTag) fail('ERP stylesheet reference missing');
  if (!html.includes(OWNER_PALETTE_TAG)) html = html.replace(erpCssTag[0], erpCssTag[0] + '\n' + OWNER_PALETTE_TAG);
  if (!html.includes(OWNER_PALETTE_TAG)) fail('Owner green palette reference missing');
  if (html.indexOf(OWNER_PALETTE_TAG) < html.indexOf(erpCssTag[0])) fail('Owner green palette must load after ERP stylesheet');

  const appTag = html.match(/<script src="\/app\.js[^\"]*"><\/script>/i);
  if (!appTag) fail('application runtime script reference missing');
  if (!html.includes(OWNER_SHELL_TAG)) html = html.replace(appTag[0], OWNER_SHELL_TAG + '\n' + appTag[0]);
  if (!html.includes(OWNER_SHELL_TAG)) fail('owner shell guard reference missing');
  if (html.indexOf(OWNER_SHELL_TAG) > html.indexOf(appTag[0])) fail('owner shell guard must load before app runtime');

  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html)) fail('inline script remained in production index');
  if (/\son[a-z]+\s*=/i.test(html)) fail('inline event handler remained in production index');
  if (!html.includes('<script src="/auth-bootstrap.js"></script>')) fail('auth bootstrap reference missing');
  if (!html.includes('<script src="/password-reset-bootstrap.js"></script>')) fail('password reset bootstrap reference missing');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  for (const item of extracted) fs.writeFileSync(path.join(outputDir, item.name), item.code);

  return { html, extracted };
}

if (require.main === module) {
  const root = process.cwd();
  buildStrictIndexRuntime(path.join(root, 'index.html'), path.join(root, 'dist'));
  console.log('Strict index runtime build: PASS');
}

module.exports = { buildStrictIndexRuntime };
