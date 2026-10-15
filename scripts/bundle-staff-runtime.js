/* Build-only Staff page payload packer.
 * The source HTML/modules stay separate and testable. Both entrypoints receive
 * byte-identical output with versioned, same-origin JS/CSS bundles.
 * No minification, eval, source map upload, or change to third-party SDK.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
const paths=['staff.html','staff/index.html'];
function ensure(ok,message){if(!ok)throw new Error('Staff payload bundle: '+message);}
function digest(contents){return crypto.createHash('sha256').update(contents).digest('hex').slice(0,12);}
function localAsset(name){ensure(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(js|css)$/.test(name),'invalid file '+name);const f=path.join(dist,name);ensure(fs.existsSync(f),'missing '+name);return fs.readFileSync(f,'utf8');}
function pack(html){
  const styles=[],scripts=[];
  const cssRE=/<link\s+rel="stylesheet"\s+href="\/([^"?]+\.css)\?v=[^"]+"\s*>/g;
  const jsRE=/<script\s+defer\s+src="\/([^"?]+\.js)\?v=[^"]+"\s*><\/script>/g;
  for(const item of html.matchAll(cssRE))styles.push(item[1]);
  for(const item of html.matchAll(jsRE))scripts.push(item[1]);
  ensure(styles.length===8,'expected 8 Staff CSS files; got '+styles.length);
  ensure(scripts.length===12,'expected 12 local Staff JS files; got '+scripts.length);
  ensure(scripts[0]==='staff-compat-v1.js','legacy Android shim must load before SDK');
  ensure(new Set(styles).size===styles.length&&new Set(scripts).size===scripts.length,'duplicate assets');
  ensure(html.includes('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0'),'pinned SDK script missing');
  const css=styles.map(f=>localAsset(f)).join('\n/* next stylesheet */\n');
  // Compatibility shim must stay before the vendor SDK on older Android.
  const js=scripts.slice(1).map(f=>localAsset(f)).join('\n;\n/* next module */\n');
  const jsFile='staff-runtime.bundle.js',cssFile='staff-styles.bundle.css';
  const cssUrl='/'+cssFile+'?v='+digest(css),jsUrl='/'+jsFile+'?v='+digest(js);
  ensure(!html.includes(jsFile)&&!html.includes(cssFile),'double bundle');
  let next=html.replace(cssRE,'').replace(jsRE,(tag,name)=>name==='staff-compat-v1.js'?tag:'');
  ensure(next.includes('</head>')&&next.includes('</body>'),'missing document boundaries');
  next=next.replace('</head>','  <link rel="stylesheet" href="'+cssUrl+'">\n</head>');
  next=next.replace('</body>','  <script defer src="'+jsUrl+'"></script>\n</body>');
  return {html:next,css,js,cssUrl,jsUrl,styles,scripts};
}
const original=fs.readFileSync(path.join(dist,paths[0]),'utf8');
ensure(original===fs.readFileSync(path.join(dist,paths[1]),'utf8'),'entrypoints not byte-identical');
const result=pack(original);
fs.writeFileSync(path.join(dist,'staff-styles.bundle.css'),result.css);
fs.writeFileSync(path.join(dist,'staff-runtime.bundle.js'),result.js);
const checked=spawnSync(process.execPath,['--check',path.join(dist,'staff-runtime.bundle.js')],{stdio:'inherit'});
ensure(!checked.error&&checked.status===0,'assembled JS syntax failed');
for(const file of paths)fs.writeFileSync(path.join(dist,file),result.html);
ensure(!/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(result.html),'inline script disallowed');
ensure(result.html.includes(result.cssUrl)&&result.html.includes(result.jsUrl),'bundle URLs missing');
ensure((result.html.match(/<script\s+defer\s+src=/g)||[]).length===3,'expected shim, vendor and local bundle');
console.log('Staff low-bandwidth build: PASS; '+result.styles.length+' CSS => 1, '+(result.scripts.length-1)+' feature JS => 1 plus Android shim, raw JS '+result.js.length+' B; versioned by content hash.');
