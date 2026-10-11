#!/usr/bin/env node
'use strict';
/**
 * Hasnaria P0 staging isolation preflight. READ ONLY, no network or writes.
 * Local usage after building a dedicated staging bundle:
 * HASNARIA_STAGING_PROJECT_REF=<staging_ref> \
 * HASNARIA_STAGING_PUBLISHABLE_KEY=<staging_publishable_key> \
 * node scripts/p0_staging_isolation_gate.js dist
 * For CI/self-test: node scripts/p0_staging_isolation_gate.js --self-test
 * Never enter private Auth passwords or a Supabase secret/service-role key.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const PROD_REF='bnnhmtkpdjlgehsvgoda';
function inspect(html,files,ref,key){
 const errors=[];
 if(!/^[a-z0-9]{20}$/.test(ref||''))errors.push('Missing/invalid staging project ref');
 if(ref===PROD_REF)errors.push('Staging ref points to production');
 if(!/^sb_publishable_[a-zA-Z0-9_-]{8,}$/.test(key||''))errors.push('Expected a staging-only publishable key');
 const config=files['auth-bootstrap.js']||html;
 const url=config.match(/window\.HASNARIA_SB\s*=\s*["']([^"']+)["']/);
 const api=config.match(/window\.HASNARIA_KEY\s*=\s*["']([^"']+)["']/);
 if(!url||url[1]!=='https://'+ref+'.supabase.co')errors.push('HTML still points outside staging URL');
 if(!api||api[1]!==key)errors.push('HTML publishable key does not match staging');
 for(const [name,source] of Object.entries(files)){
  if(source.includes(PROD_REF))errors.push('Production Supabase project ref found in output '+name);
 }
 return errors;
}
function collect(dir){
 const out={};
 function scan(folder){
  for(const ent of fs.readdirSync(folder,{withFileTypes:true})){
   const file=path.join(folder,ent.name);
   if(ent.isDirectory())scan(file);
   else if(ent.isFile()&&/\.(html|js|json|css)$/.test(ent.name))out[path.relative(dir,file)]=fs.readFileSync(file,'utf8');
  }
 }
 scan(dir);return out;
}
function selfTest(){
 const ref='abcdefghijklmnopqrst',key='sb_publishable_STAGINGTEST123456';
 const good='<script>window.HASNARIA_SB="https://'+ref+'.supabase.co";window.HASNARIA_KEY="'+key+'";</script>';
 assert.deepEqual(inspect(good,{'index.html':good},ref,key),[]);
 assert.deepEqual(inspect('<html></html>',{'index.html':'<html></html>','auth-bootstrap.js':good},ref,key),[]);
 assert.ok(inspect(good,{'index.html':good},PROD_REF,key).length);
 assert.ok(inspect(good,{'index.html':good},ref,'sb_secret_REJECTED').length);
 const bad=good.replace(ref,PROD_REF);
 assert.ok(inspect(bad,{'index.html':bad},ref,key).length);
 assert.ok(inspect(good,{'index.html':good,'app.js':'const s="https://'+PROD_REF+'.supabase.co"'},ref,key).length);
 process.stdout.write('PASS: UAT staging isolation checks reject production, bad keys and mixed bundles\n');
}
if(require.main===module){
 if(process.argv.includes('--self-test'))selfTest();
 else{
  const dir=path.resolve(process.argv[2]||'dist');
  if(!fs.existsSync(path.join(dir,'index.html'))){
   process.stderr.write('BLOCK: isolated build output dist/index.html is missing\n');process.exitCode=1;
  }else{
   const ref=(process.env.HASNARIA_STAGING_PROJECT_REF||'').trim();
   const key=(process.env.HASNARIA_STAGING_PUBLISHABLE_KEY||'').trim();
   const files=collect(dir),errors=inspect(files['index.html']||'',files,ref,key);
   if(errors.length){
    errors.forEach(e=>process.stderr.write('BLOCK: '+e+'\n'));
    process.stderr.write('Do not click Save/Revoke/Import on this Preview until isolation passes\n');
    process.exitCode=1;
   }else{
    process.stdout.write('PASS: static staging output no longer references Hasnaria production\n');
    process.stdout.write('REQUIRED NEXT: verify browser network, staging-only Auth and tenant RLS\n');
   }
  }
 }
}
module.exports={inspect,collect};
