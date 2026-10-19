'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verifyBackupUrl,PROD,USER}=require('../scripts/hasnaria_backup_connection_guard.js');
test('Tokyo session pooler with dedicated backup role is allowed',()=>{
 assert.equal(verifyBackupUrl('postgresql://'+USER+'.'+PROD+':newbackup_TESTpassword@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'),true);
});
test('Tokyo direct connection with backup-only role is allowed',()=>{
 assert.equal(verifyBackupUrl('postgresql://'+USER+':testpassword@db.'+PROD+'.supabase.co:5432/postgres'),true);
});
test('wrong role, project and pooler mode are rejected',()=>{
 const bad=[
 'postgresql://postgres.'+PROD+':pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
 'postgresql://hsn_schema_reader.'+PROD+':pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
 'postgresql://'+USER+'.rynnpndtzjwpekbiwiif:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
 'postgresql://'+USER+'.'+PROD+':pass@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
 'postgresql://'+USER+'.'+PROD+':pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/template1',
 'postgresql://'+USER+'.'+PROD+'@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
 'postgresql://'+USER+'.'+PROD+':pass@evil.pooler.example.com:5432/postgres'
 ];
 for (const url of bad) assert.throws(()=>verifyBackupUrl(url),/BLOCK:/);
});
