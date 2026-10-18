#!/usr/bin/env node
'use strict';
// Operator-controlled, SCHEMA-ONLY restore to Singapore staging.
// Source URL MUST have a dedicated read-only role. This never executes production writes.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {verifyUrl,quoteCheck,roleSql,stageSql,query,invoke}=require('./hasnaria_schema_only_actions');
const PROD='bnnhmtkpdjlgehsvgoda',STAGE='rynnpndtzjwpekbiwiif';
const countsSql=`select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p')) as tables,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('v','m')) as views,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') and c.relrowsecurity) as rls,
 (select count(*) from pg_policies where schemaname in ('public','private')) as policies,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')) as functions`.replace(/\s+/g,' ');
function parseCounts(s){
  const values=s.trim().split('|').map(x=>Number(x));
  if(values.length!==5||values.some(x=>!Number.isSafeInteger(x)||x<0))throw Error('BLOCK: unexpected object counts');
  const [tables,views,rls,policies,functions]=values;
  if(tables<30||views<10||rls<10||policies<10||functions<10)
    throw Error('BLOCK: source schema seems incomplete');
  return {tables,views,rls,policies,functions};
}
function assertionSql(expected) {
  // Numbers originate from PG catalog, validated as nonnegative safe integers.
  const guards=Object.entries(expected).map(([key,count])=>{
    const sql={
      tables:`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p')`,
      views:`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('v','m')`,
      rls:`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') and c.relrowsecurity`,
      policies:`select count(*) from pg_policies where schemaname in ('public','private')`,
      functions:`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')`
    }[key];
    if(!sql)throw Error('Unknown object contract');
    return `if (${sql}) <> ${count} then raise exception 'Staging ${key} parity failed'; end if;`;
  });
  return `do $guard$ begin
    if not exists (select 1 from staging_guard.environment_identity where environment='staging' and region='ap-southeast-1' and supabase_project_ref='${STAGE}') then
      raise exception 'Staging identity guard mismatch';
    end if;
    if (select count(*) from auth.users) <> 0 then raise exception 'Staging Auth must remain empty'; end if;
    if to_regclass('public.brands') is null or to_regclass('public.user_profiles') is null or to_regclass('public.offline_purchase_history') is null or to_regclass('public.finance_journal_entries') is null or to_regclass('public.inventory_items') is null then
      raise exception 'Essential schema objects missing';
    end if;
    if (select count(*) from public.brands) <> 0 or (select count(*) from public.user_profiles) <> 0 or (select count(*) from public.offline_purchase_history) <> 0 then
      raise exception 'Schema-only restore inserted forbidden production-like business rows';
    end if;
    ${guards.join('\n')}
  end $guard$;`;
}
function selfTest(){
  const result=parseCounts('100|181|91|120|210');
  assert.equal(result.tables,100);
  assert.match(assertionSql(result),/auth\.users/);
  assert.match(assertionSql(result),/Staging functions parity failed/);
  assert.throws(()=>parseCounts('1|0|0|0|0'));
  assert.throws(()=>parseCounts('abc|181|91|120|210'));
  assert.throws(()=>parseCounts('100|181|91|120|1;drop table public.brands'));
  console.log('PASS: schema-only parity, no business rows, and atomic failure tests');
}
function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  if(process.env.GITHUB_REPOSITORY!=='ekariashoesanti-alt/Hasnaria-ice-cream' ||
     process.env.GITHUB_REF!=='refs/heads/main' ||
     process.env.HSN_STAGING_SCHEMA_CONFIRM!=='RESTORE_SCHEMA_SINGAPORE')
    throw Error('BLOCK: reviewed main + exact manual staging confirmation required');
  const src=process.env.HSN_PROD_READONLY_DB_URL||'',dest=process.env.HSN_STAGING_DB_URL||'';
  verifyUrl(src,PROD,true);verifyUrl(dest,STAGE,false);
  if(query(src,roleSql)!=='OK')throw Error('BLOCK: production reader may write');
  if(query(dest,stageSql)!=='OK')throw Error('BLOCK: staging identity missing or target not empty');
  if(query(dest,'select count(*) from auth.users')!=='0')throw Error('BLOCK: staging already has real or synthetic Auth users');
  const expected=parseCounts(query(src,countsSql));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hasnaria-schema-staging-'));
  try{
    const file=path.join(dir,'schema.sql');
    invoke('supabase',['db','dump','--db-url',src,'--schema','public,private','-f',file]);
    const stat=fs.statSync(file);
    if(stat.size<3000||stat.size>50*1024*1024)throw Error('BLOCK: unexpected schema dump size');
    const sql=fs.readFileSync(file,'utf8');
    quoteCheck(sql);
    // psql --single-transaction wraps both schema.sql and the parity DO block.
    // If validation fails, nothing is committed to staging.
    const verification=assertionSql(expected);
    invoke('psql',['-X','-q','--single-transaction','--set=ON_ERROR_STOP=1','--dbname',dest,'--file',file,'--command',verification]);
    const checksum=crypto.createHash('sha256').update(sql).digest('hex');
    console.log('PASS: Singapore staging SCHEMA ONLY committed atomically');
    console.log('Objects: '+JSON.stringify(expected)+'; SQL SHA256: '+checksum);
    console.log('Auth users: 0; business data: 0; production: READ ONLY');
    console.log('NOT UAT: requires independent synthetic Auth, staging Preview and Owner/Staff tests');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
if(require.main===module){try{main()}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={parseCounts,assertionSql,selfTest};
