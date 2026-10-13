#!/usr/bin/env node
'use strict';
// Hasnaria staging: export ONLY production public schema via Supabase CLI.
// No data/roles/Auth users are exported; no production writes and no restore.
// Run on an authorized operator's machine or a protected credentialed runner.
//
// Required private env (NEVER commit, log or paste database connection strings):
//   HSN_PROD_READONLY_DB_URL = production PostgreSQL connection string
//   HSN_DB_READONLY_CONFIRMED = YES (operator asserts role is read-only)
// Usage: node scripts/export_hasnaria_staging_schema_only.js --outdir ABS_PRIVATE_FOLDER
// Safety test: node scripts/export_hasnaria_staging_schema_only.js --self-test
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const PROD='bnnhmtkpdjlgehsvgoda';
const STAGING='rynnpndtzjwpekbiwiif';
function validateSource(raw){
  if(!raw)throw Error('Private production read-only database URL is missing');
  let u;try{u=new URL(raw)}catch(_){throw Error('Invalid PostgreSQL URL')};
  if(!['postgresql:','postgres:'].includes(u.protocol))throw Error('Only PostgreSQL connections are allowed');
  const host=u.hostname.toLowerCase();
  const user=decodeURIComponent(u.username);
  const direct=host==='db.'+PROD+'.supabase.co'&&user.length>0;
  const pooler=host.endsWith('.pooler.supabase.com')&&user==='postgres.'+PROD;
  if(!direct&&!pooler)throw Error('BLOCK: connection target is not Hasnaria production; do not dump');
  if(host.includes(STAGING)||user.includes(STAGING))throw Error('BLOCK: connection targets staging');
  if(!u.password)throw Error('Missing database password (keep it private)');
  if(u.pathname!=='/postgres')throw Error('Unexpected database name');
  return true;
}
function verifyOutputDirectory(raw){
  if(!raw||!path.isAbsolute(raw))throw Error('--outdir must be an absolute, private folder path');
  const dir=path.resolve(raw);
  const repo=path.resolve(__dirname,'..')+path.sep;
  if(dir===path.resolve(__dirname,'..')||dir.startsWith(repo)){
    throw Error('BLOCK: schema export folder must be outside the Git repository');
  }
  if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw Error('Create the private output folder before running');
  return dir;
}
function selfTest(){
  const assert=require('node:assert/strict');
  assert.equal(validateSource('postgresql://readonly:dummy@db.'+PROD+'.supabase.co:5432/postgres'),true);
  assert.equal(validateSource('postgresql://postgres.'+PROD+':dummy@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'),true);
  for(const bad of [
    'postgresql://readonly:dummy@db.'+STAGING+'.supabase.co:5432/postgres',
    'postgresql://readonly:dummy@db.otherproject.supabase.co:5432/postgres',
    'https://db.'+PROD+'.supabase.co',
    'postgresql://readonly:dummy@db.'+PROD+'.supabase.co:5432/notpostgres'
  ]){
    assert.throws(()=>validateSource(bad));
  }
  assert.throws(()=>verifyOutputDirectory(path.resolve(__dirname,'..')));
  console.log('PASS: schema-only export guard rejects staging, unrelated hosts and Git output');
}
function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  const arg=process.argv.indexOf('--outdir');
  if(arg<0)throw Error('Usage: node scripts/export_hasnaria_staging_schema_only.js --outdir ABS_PRIVATE_FOLDER');
  const folder=verifyOutputDirectory(process.argv[arg+1]);
  validateSource(process.env.HSN_PROD_READONLY_DB_URL||'');
  if(process.env.HSN_DB_READONLY_CONFIRMED!=='YES'){
    throw Error('BLOCK: confirm production connection role is read-only with HSN_DB_READONLY_CONFIRMED=YES');
  }
  const cli=spawnSync('supabase',['--version'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(cli.error||cli.status!==0)throw Error('Supabase CLI unavailable. Install CLI and Docker per official documentation');
  const date=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*$/,'Z');
  const filename='hasnaria_public_schema_only_'+date+'.sql';
  const file=path.join(folder,filename);
  if(fs.existsSync(file))throw Error('BLOCK: refusing to overwrite an existing schema dump');
  // No --data-only, no --use-copy, no Auth data, no migration-history data.
  const args=['db','dump','--db-url',process.env.HSN_PROD_READONLY_DB_URL,
              '--schema','public','-f',file];
  const r=spawnSync('supabase',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(r.error||r.status!==0){
    if(fs.existsSync(file))fs.rmSync(file,{force:true});
    // Do not echo CLI stderr because it may contain the private connection URL.
    throw Error('Schema-only dump failed. Check private Supabase CLI/Docker connection and permissions');
  }
  const bytes=fs.statSync(file).size;
  if(bytes<1024)throw Error('Schema-only output unexpectedly small; do not restore');
  try{fs.chmodSync(file,0o600)}catch(_){}
  const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const manifest={
    source_project_ref:PROD,
    target_staging_project_ref:STAGING,
    schema:'public',schema_only:true,production_writes:false,
    no_business_row_data_exported:true,auth_storage_data_exported:false,
    exported_at_utc:new Date().toISOString(),
    sql_filename:filename,bytes,sha256,
    staging_restore_performed:false,review_required:true
  };
  const manifestFile=path.join(folder,filename+'.manifest.json');
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('PASS: schema-only SQL produced in your private output folder');
  console.log('SQL filename: '+filename);
  console.log('Bytes: '+bytes+', SHA-256: '+sha256);
  console.log('NEXT: review SQL for embedded literals/secrets before uploading or restoring');
  console.log('No schema or data was written to production or staging');
}
if(require.main===module){try{main()}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={validateSource,verifyOutputDirectory};
