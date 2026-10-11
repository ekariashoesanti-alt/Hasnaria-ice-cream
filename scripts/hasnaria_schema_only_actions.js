#!/usr/bin/env node
'use strict';
// Schema-only copy to Hasnaria Singapore, with no artifacts, backups or customer rows.
// Do NOT print private connection URLs or SQL in public GitHub Actions logs.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const PROD='bnnhmtkpdjlgehsvgoda';
const STAGE='rynnpndtzjwpekbiwiif';
function verifyUrl(raw,ref,source){
  if(!raw)throw Error('Required private PostgreSQL URL is missing');
  let u;try{u=new URL(raw)}catch(_){throw Error('Malformed PostgreSQL URL')}
  if(!['postgres:','postgresql:'].includes(u.protocol))throw Error('Database URL protocol not allowed');
  const host=u.hostname.toLowerCase(),username=decodeURIComponent(u.username);
  const direct=host==='db.'+ref+'.supabase.co'&&!!username;
  const pooler=host.endsWith('.pooler.supabase.com')&&username.endsWith('.'+ref);
  if(!direct&&!pooler)throw Error('BLOCK: database project ref mismatch');
  if(!u.password||u.pathname!=='/postgres')throw Error('BLOCK: missing password or unexpected database name');
  if(u.searchParams.has('options')||u.hash)throw Error('BLOCK: unexpected connection options');
  if(source&&(/^(postgres|supabase_admin|supabase_auth_admin|service_role)$/i.test(username)||/^postgres\./i.test(username)))
    throw Error('BLOCK: production requires a dedicated non-admin read-only role');
  return true;
}
function invoke(command,args){
  const r=spawnSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:14*60*1000,maxBuffer:4*1024*1024});
  if(r.error||r.status!==0)throw Error('Blocked: '+command+' failed (details hidden from public Actions logs)');
  return (r.stdout||'').trim();
}
function quoteCheck(sql){
  if(/^\s*\\(?:connect|copy|include|i|!|o|gexec)\b/im.test(sql))throw Error('BLOCK: disallowed psql meta-command in schema');
  if(/^\s*(?:BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;/im.test(sql))throw Error('BLOCK: transaction control in exported schema');
  if(/^\s*COPY\s+[\w".]+\s+(?:\([^;]*\)\s*)?FROM\s+stdin/im.test(sql))throw Error('BLOCK: data COPY statement in schema export');
  if(sql.includes(PROD+'.supabase.co')||sql.includes(STAGE+'.supabase.co'))
    throw Error('BLOCK: schema contains project URLs; manual offline review required');
}
function query(db,sql){
  return invoke('psql',['-X','-q','-A','-t','--set=ON_ERROR_STOP=1','--dbname',db,'--command',sql]);
}
const roleSql=[
'select case when',
'coalesce((select rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls from pg_catalog.pg_roles where rolname=current_user),true)',
"or has_database_privilege(current_user,current_database(),'CREATE')",
"or has_schema_privilege(current_user,'public','CREATE')",
"or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') and has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))",
"then 'DENY' else 'OK' end"
].join(' ');
const stageSql=[
'select case when',
"exists (select 1 from staging_guard.environment_identity where environment='staging' and region='ap-southeast-1' and supabase_project_ref='rynnpndtzjwpekbiwiif')",
"and (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v','m'))=0",
"then 'OK' else 'DENY' end"
].join(' ');
function selfTest(){
  assert.equal(verifyUrl('postgresql://hsn_schema_reader:test@db.'+PROD+'.supabase.co:5432/postgres',PROD,true),true);
  assert.equal(verifyUrl('postgresql://hsn_schema_reader.'+PROD+':test@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',PROD,true),true);
  assert.equal(verifyUrl('postgresql://postgres.'+STAGE+':test@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',STAGE,false),true);
  for(const u of [
    'postgresql://postgres:test@db.'+PROD+'.supabase.co:5432/postgres',
    'postgresql://postgres.'+PROD+':test@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
    'postgresql://hsn_schema_reader:test@db.'+STAGE+'.supabase.co:5432/postgres',
    'postgresql://hsn_schema_reader:test@db.unrelated.supabase.co:5432/postgres',
    'https://hsn_schema_reader:test@db.'+PROD+'.supabase.co:5432/postgres'
  ])assert.throws(()=>verifyUrl(u,PROD,true));
  assert.throws(()=>quoteCheck('COPY public.sales FROM stdin;'));
  assert.throws(()=>quoteCheck('COMMIT;'));
  assert.throws(()=>quoteCheck("select 'https://"+PROD+".supabase.co'"));
  quoteCheck('CREATE TABLE public.demo(id integer);');
  console.log('PASS: environment, project, account and SQL guards');
}
function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  if(process.env.GITHUB_REPOSITORY!=='ekariashoesanti-alt/Hasnaria-ice-cream'||process.env.GITHUB_REF!=='refs/heads/main')
    throw Error('BLOCK: manual workflow must run from Hasnaria main');
  const mode=process.env.HSN_SCHEMA_OPERATION||'validate-only';
  if(!['validate-only','restore-staging'].includes(mode))throw Error('Invalid operation');
  if(mode==='restore-staging'&&process.env.HSN_RESTORE_CONFIRM!=='RESTORE_TO_SINGAPORE_STAGING')
    throw Error('BLOCK: explicit staging restore confirmation required');
  const src=process.env.HSN_PROD_READONLY_DB_URL||'';
  const dest=process.env.HSN_STAGING_DB_URL||'';
  verifyUrl(src,PROD,true);verifyUrl(dest,STAGE,false);
  if(query(src,roleSql)!=='OK')throw Error('BLOCK: source database role has write privileges');
  if(query(dest,stageSql)!=='OK')throw Error('BLOCK: target is not empty Singapore staging with valid identity');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hasnaria-schema-'));
  try{
    const dump=path.join(temp,'schema-only.sql');
    invoke('supabase',['db','dump','--db-url',src,'--schema','public,private','-f',dump]);
    const stat=fs.statSync(dump);
    if(stat.size<3000||stat.size>50*1024*1024)throw Error('Unexpected schema export size');
    const sql=fs.readFileSync(dump,'utf8');
    quoteCheck(sql);
    const sha=crypto.createHash('sha256').update(sql).digest('hex');
    // Trial: a transaction on staging, with forced ROLLBACK before closing.
    invoke('psql',['-X','-q','--set=ON_ERROR_STOP=1','--dbname',dest,'--command','BEGIN','--file',dump,'--command','ROLLBACK']);
    if(query(dest,stageSql)!=='OK')throw Error('BLOCK: staging changed after trial');
    console.log('PASS: public + private schema exported; Singapore trial rolled back');
    console.log('SQL size: '+stat.size+' bytes; SHA-256: '+sha);
    if(mode==='restore-staging'){
      // Separate manual run with confirmation. All-or-nothing restore to Singapore.
      invoke('psql',['-X','-q','--set=ON_ERROR_STOP=1','--dbname',dest,'--single-transaction','--file',dump]);
      const count=query(dest,"select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')");
      if(Number(count)<80)throw Error('STOP: staging catalog parity incomplete; DBA review required');
      console.log('RESTORED: only Singapore staging changed (public tables: '+count+')');
    }else console.log('VALIDATE ONLY: no permanent database changes; no raw SQL uploaded');
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
if(require.main===module){try{main()}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={verifyUrl,quoteCheck,selfTest};