#!/usr/bin/env node
'use strict';
// Hasnaria Owner UAT gate: fail closed; all SQL is SELECT-only.
// No production credentials or service-role keys are accepted.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const PROD='bnnhmtkpdjlgehsvgoda';
const STAGE='rynnpndtzjwpekbiwiif';
const LIVE='https://hasnaria-business-analyzer.vercel.app';
const REQUIRED=['user_profiles','brands','offline_purchase_history','purchase_import_evidence','import_jobs','inventory_items','inventory_stock_opname','inventory_stock_reconciliation','finance_journal_entries','finance_journal_lines','approval_requests','approval_history'];

function assertTarget(dbUrl,previewUrl,stagingKey) {
  if(!dbUrl || !previewUrl || !stagingKey) throw Error('BLOCK: staging DB, Preview URL and staging publishable key are all mandatory');
  let db, web;
  try {db=new URL(dbUrl);web=new URL(previewUrl)}catch {throw Error('BLOCK: invalid staging connection/Preview URL')}
  if(!['postgres:','postgresql:'].includes(db.protocol)||!db.password||db.pathname!='/postgres') throw Error('BLOCK: PostgreSQL credentials must point to /postgres');
  const user=decodeURIComponent(db.username), host=db.hostname.toLowerCase();
  if(!(host==='db.'+STAGE+'.supabase.co' || (host.endsWith('.pooler.supabase.com') && user.endsWith('.'+STAGE))))
    throw Error('BLOCK: database is not the dedicated Singapore staging project');
  if(dbUrl.includes(PROD)) throw Error('BLOCK: production reference in staging DB URL');
  if(web.protocol!=='https:' || web.hostname==='hasnaria-business-analyzer.vercel.app' || web.hostname==='hasnaria-business-analyzer-git-main.vercel.app' || !web.hostname.endsWith('.vercel.app') || web.pathname!=='/' || web.search || web.hash || web.username || web.password)
    throw Error('BLOCK: testing requires a dedicated HTTPS Vercel Preview root, never production');
  if(!/^sb_publishable_[a-zA-Z0-9_-]{8,}$/.test(stagingKey)) throw Error('BLOCK: invalid staging-only publishable key');
  return {preview:web.origin};
}

function sqlReadOnly(dbUrl, query) {
  const out=spawnSync('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','--dbname',dbUrl,'--command',query],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000,maxBuffer:32768});
  if(out.error || out.status!==0) throw Error('BLOCK: staging read-only database preflight failed (SQL details suppressed)');
  return out.stdout.trim();
}
const identityQuery="select case when exists(select 1 from staging_guard.environment_identity where environment='staging' and region='ap-southeast-1' and supabase_project_ref='"+STAGE+"') then 'PASS' else 'BLOCK' end";
const missingQuery="select coalesce(string_agg(v.t,',' order by v.t),'') from (select t from unnest(array["+REQUIRED.map(t=>"'public."+t+"'").join(',')+"]) as t where to_regclass(t) is null) v";
const readUserQuery="select case when exists(select 1 from public.user_profiles where lower(role::text)='owner' and lower(status::text)='active') then 'PASS' else 'BLOCK' end";

async function inspectPreview(preview,key) {
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),12000);
  try{
    const resources=await Promise.all(['/', '/auth-bootstrap.js'].map(async suffix=>{
      const r=await fetch(preview+suffix,{signal:ac.signal,redirect:'error',headers:{'cache-control':'no-cache'}});
      if(!r.ok)throw Error('Preview resource unavailable');
      return await r.text();
    }));
    const emitted=resources.join('\n');
    if(emitted.includes(PROD) || !emitted.includes('https://'+STAGE+'.supabase.co') || !emitted.includes(key))
      throw Error('BLOCK: Preview is mixed, lacks staging key, or references production');
    return true;
  }catch {throw Error('BLOCK: staging-only Preview connection could not be proven')}
  finally{clearTimeout(timer)}
}
function selfTest(){
  const k='sb_publishable_TEST_STAGING_123456';
  const d='postgresql://postgres.'+STAGE+':pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
  const p='https://hasnaria-owner-stage-abc.vercel.app/';
  assert.equal(assertTarget(d,p,k).preview,p.slice(0,-1));
  for(const bad of [
    ['postgresql://postgres.'+PROD+':pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',p,k],
    [d,LIVE,k], [d,'http://example.vercel.app/',k], [d,p,'sb_secret_not_allowed'],
    [d,'https://hasnaria-owner-stage-abc.vercel.app/path',k],
    [d,'https://evil.example.com/',k],
    ['postgresql://postgres:pass@db.'+PROD+'.supabase.co/postgres',p,k]
  ])assert.throws(()=>assertTarget(...bad));
  assert.ok(missingQuery.includes('public.approval_requests'));
  console.log('PASS: Tokyo production, non-Preview URLs and privileged-key mistakes are rejected');
}
async function main(){
  if(process.argv.includes('--self-test')) return selfTest();
  if(process.env.GITHUB_REPOSITORY!=='ekariashoesanti-alt/Hasnaria-ice-cream'||process.env.GITHUB_REF!=='refs/heads/main')
    throw Error('BLOCK: manual UAT must run only from reviewed main');
  const db=process.env.HSN_STAGING_DB_URL,preview=process.env.HSN_OWNER_UAT_PREVIEW_URL,key=process.env.HSN_STAGING_PUBLISHABLE_KEY;
  const safe=assertTarget(db,preview,key);
  if(sqlReadOnly(db,identityQuery)!=='PASS')throw Error('BLOCK: staging identity marker missing');
  const missing=sqlReadOnly(db,missingQuery);
  if(missing)throw Error('BLOCK: staging schema incomplete: '+missing);
  if(sqlReadOnly(db,readUserQuery)!=='PASS')throw Error('BLOCK: synthetic active Owner profile not provisioned in staging');
  await inspectPreview(safe.preview,key);
  console.log('PASS: Singapore schema, Owner identity and isolated Preview verified');
  console.log('NOTE: this PRE-FLIGHT is NOT approval/upload/saldo/infographic UAT');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={assertTarget,selfTest,REQUIRED,STAGE,PROD};
