#!/usr/bin/env node
'use strict';
// Read-only schema preflight for Hasnaria Singapore: no permanent restore, artifacts, or customer rows.
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
  if(source && ![ 'hsn_schema_reader', 'hsn_schema_reader.'+PROD ].includes(username))
    throw Error('BLOCK: source must be hsn_schema_reader (read-only role)');
  if(!source && ![ 'postgres', 'postgres.'+STAGE ].includes(username))
    throw Error('BLOCK: Singapore destination must be the designated postgres staging role');
  if(u.port!=='5432')throw Error('BLOCK: use session pooler or direct PostgreSQL port 5432');
  return true;
}
function invoke(command,args){
  const r=spawnSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:14*60*1000,maxBuffer:4*1024*1024});
  if(r.error||r.status!==0){
    const error=String(r.stderr||'').toLowerCase();
    // Never print STDERR; PostgreSQL messages may contain hostnames and SQL.
    let reason='UNCLASSIFIED';
    if(/password authentication failed|invalid password|sasl authentication failed/.test(error))reason='INVALID_PASSWORD';
    else if(/tenant or user not found|role .* does not exist/.test(error))reason='INVALID_POOLER_USERNAME_OR_ROLE';
    else if(/could not translate host|name or service not known|nodename nor servname/.test(error))reason='DNS_LOOKUP';
    else if(/no route to host|network is unreachable|connection refused|timeout expired|connection timed out/.test(error))reason='NETWORK_CONNECTION';
    else if(/permission denied|must be (?:owner|member)|insufficient privilege/.test(error))reason='INSUFFICIENT_DB_PERMISSIONS';
    else if(/invalid port number|invalid connection option|could not parse.*connection/.test(error))reason='BAD_CONNECTION_URI';
    else if(/error:|fatal:/.test(error))reason='DB_SQL_OR_SERVER_ERROR';
    else if(r.error)reason='RUNNER_COMMAND_NOT_AVAILABLE';
    throw Error('Blocked: '+command+' failed ['+reason+']');
  }
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
  // The hosted runner has no system psql; use PostgreSQL 17 in Docker.
  // Connections are passed only as masked environment variables.
  const key=db===process.env.HSN_PROD_READONLY_DB_URL?'HSN_PROD_READONLY_DB_URL':
    db===process.env.HSN_STAGING_DB_URL?'HSN_STAGING_DB_URL':null;
  if(!key)throw Error('BLOCK: unknown SQL connection');
  try{return invoke('docker',[
    'run','--rm','--network','host','--env',key,
    'postgres:17','sh','-ec',
    'exec psql -X -q -A -t --no-password --set=ON_ERROR_STOP=1 --dbname="$'+key+'" --command="$1"',
    'hsn-sql',sql
  ]);}catch(e){throw Error('BLOCK: '+(key==='HSN_PROD_READONLY_DB_URL'?'TOKYO_SOURCE':'SINGAPORE_TARGET')+' connection: '+e.message)}
}
const roleSql=[
'select case when',
'coalesce((select rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls from pg_catalog.pg_roles where rolname=current_user),true)',
"or has_database_privilege(current_user,current_database(),'CREATE')",
"or has_schema_privilege(current_user,'public','CREATE')",
"or has_schema_privilege(current_user,'private','CREATE')",
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
  if(!['validate-only','restore-staging'].includes(mode))throw Error('BLOCK: unknown operation');
  if(mode==='restore-staging' && (process.env.HSN_STAGING_RESTORE_APPROVED!=='RESTORE_SCHEMA_ONLY_SINGAPORE' || process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'))
    throw Error('BLOCK: explicit staging restore approval required');
  const src=process.env.HSN_PROD_READONLY_DB_URL||'';
  const dest=process.env.HSN_STAGING_DB_URL||'';
  verifyUrl(src,PROD,true);verifyUrl(dest,STAGE,false);
  if(query(src,roleSql)!=='OK')throw Error('BLOCK: source database role has write privileges');
  if(query(dest,stageSql)!=='OK')throw Error('BLOCK: target is not empty Singapore staging with valid identity');
  if(query(dest,"SELECT case when exists(SELECT 1 FROM pg_roles WHERE rolname='hsn_schema_reader' AND NOT rolcanlogin) then 'OK' else 'DENY' end")!=='OK')
    throw Error('BLOCK: staging is missing the safe NOLOGIN ACL placeholder role');
  // Supabase provisions matching supabase_admin default privileges in both
  // databases. PostgreSQL rightly forbids ordinary postgres login from
  // changing defaults FOR ROLE supabase_admin; never elevate that account.
  const adminDefaultsSql=[
    "SELECT coalesce(string_agg(n.nspname||':'||d.defaclobjtype||':'||d.defaclacl::text,'|' ORDER BY n.nspname,d.defaclobjtype),'')",
    "FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace",
    "WHERE pg_get_userbyid(d.defaclrole)='supabase_admin' AND n.nspname IN ('public','private')"
  ].join(' ');
  if(query(src,adminDefaultsSql)!==query(dest,adminDefaultsSql))
    throw Error('BLOCK: Supabase-admin default grants differ between Tokyo and Singapore');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hasnaria-schema-'));
  try{
    const dump=path.join(temp,'schema-only.sql');
    // Supabase CLI db dump attempts to SET ROLE postgres and fails with a
    // strictly read-only custom login. Use PostgreSQL 17's pg_dump directly.
    // --schema-only never copies business rows, passwords, or customer data.
    // Retain ACLs/policies, and omit ownership rewrites of staging-managed roles.
    invoke('docker',[
      'run','--rm','--network','host',
      // Match the host runner UID/GID so the ephemeral pg_dump file can be
      // read and removed without loosening its 0600 permissions.
      '--user',String(process.getuid())+':'+String(process.getgid()),
      '--volume',temp+':/schema',
      '--env','HSN_PROD_READONLY_DB_URL',
      'postgres:17','sh','-ec',
      'exec pg_dump --no-password --schema-only --no-owner --schema=public --schema=private --dbname="$HSN_PROD_READONLY_DB_URL" --file=/schema/schema-only.sql'
    ]);
    const stat=fs.statSync(dump);
    if(stat.size<3000||stat.size>50*1024*1024)throw Error('Unexpected schema export size');
    let sql=fs.readFileSync(dump,'utf8');
    quoteCheck(sql);
    // Supabase creates the public schema on every new project. A plain pg_dump
    // would fail with SQLSTATE 42P06 when restoring Tokyo's public schema to
    // an otherwise empty Singapore project. Never drop the staging public schema.
    const publicCreate=/^CREATE SCHEMA public;\r?$/gm;
    const publicCreateCount=(sql.match(publicCreate)||[]).length;
    if(publicCreateCount!==1)throw Error('BLOCK: expected exactly one public schema definition in export');
    sql=sql.replace(publicCreate,'CREATE SCHEMA IF NOT EXISTS public;');
    // Retain staging's identical managed admin defaults; they cannot be
    // changed by the unprivileged staging postgres role (SQLSTATE 42501).
    // Only remove full-line commands for this exact managed owner.
    const managedDefaults=/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA (?:public|private) (?:GRANT|REVOKE) [^;\r\n]*;\r?$/gm;
    const managedDefaultCount=(sql.match(managedDefaults)||[]).length;
    if(managedDefaultCount<1||managedDefaultCount>30)
      throw Error('BLOCK: unexpected Supabase-admin default grants export');
    sql=sql.replace(managedDefaults,'-- Managed Supabase-admin default ACL already equivalent on Singapore');
    fs.writeFileSync(dump,sql,{encoding:'utf8',mode:0o600});
    const sha=crypto.createHash('sha256').update(sql).digest('hex');
    // The dump may contain PostgreSQL 17 psql meta-commands such as \\restrict.
    // Use the same major-version client for trial and restore (Ubuntu's psql may be 16).
    // Test all SQL inside a transaction that is ALWAYS rolled back.
    invoke('docker',[
      'run','--rm','--network','host','--volume',temp+':/schema',
      '--env','HSN_STAGING_DB_URL','postgres:17','sh','-ec',
      'exec psql -X -q --set=ON_ERROR_STOP=1 --dbname="$HSN_STAGING_DB_URL" --command="BEGIN" --file=/schema/schema-only.sql --command="ROLLBACK"'
    ]);
    if(query(dest,stageSql)!=='OK')throw Error('BLOCK: staging changed after trial');
    console.log('PASS: public + private schema exported; Singapore trial rolled back');
    console.log('SQL size: '+stat.size+' bytes; SHA-256: '+sha);
    if(mode==='restore-staging'){
      // One transaction: no half-restored schema on any SQL error.
      // A staging-only credential performs the DDL; never pass production for --dbname.
      invoke('docker',[
        'run','--rm','--network','host','--volume',temp+':/schema',
        '--env','HSN_STAGING_DB_URL','postgres:17','sh','-ec',
        'exec psql -X --single-transaction -q --set=ON_ERROR_STOP=1 --dbname="$HSN_STAGING_DB_URL" --file=/schema/schema-only.sql'
      ]);
      const tables=query(dest,"SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')");
      const views=query(dest,"SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m')");
      const control=query(dest,"SELECT count(*) FROM staging_guard.environment_identity WHERE environment='staging' AND region='ap-southeast-1' AND supabase_project_ref='rynnpndtzjwpekbiwiif'");
      // Match the schema metrics captured before release. No historical row data.
      if(Number(tables)<87||Number(views)<176||control!=='1')throw Error('RESTORE CHECK FAILED: staging catalog incomplete; inspect staging before UAT');
      console.log('STAGING SCHEMA RESTORED: tables='+tables+' views='+views+' identity='+control);
    }else{
      console.log('VALIDATE ONLY: no permanent database changes; no raw SQL uploaded');
    }
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
if(require.main===module){try{main()}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={verifyUrl,quoteCheck,selfTest};