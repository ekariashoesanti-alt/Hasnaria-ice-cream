'use strict';
// Guard for Tokyo full-read, zero-write PostgreSQL backup-only login.
// No network access or credential output.
const PROD='bnnhmtkpdjlgehsvgoda';
const USER='hsn_backup_reader';
function verifyBackupUrl(raw) {
  if (!raw || typeof raw !== 'string') throw Error('BLOCK: missing backup DB URL');
  let u;
  try { u=new URL(raw); } catch { throw Error('BLOCK: invalid DB URL'); }
  if (!['postgres:','postgresql:'].includes(u.protocol)) throw Error('BLOCK: invalid DB scheme');
  if (!u.password || u.pathname!=='/postgres' || u.port!=='5432' || u.search || u.hash)
    throw Error('BLOCK: missing password, nonstandard database, query, or port');
  const direct=u.hostname==='db.'+PROD+'.supabase.co' && decodeURIComponent(u.username)===USER;
  const sessionPooler=u.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(u.username)===USER+'.'+PROD;
  if (!(direct||sessionPooler)) throw Error('BLOCK: backup-only role or production project not matched');
  return true;
}
if (require.main===module) {
 try { verifyBackupUrl(process.env.HSN_PROD_BACKUP_READONLY_DB_URL); console.log('PASS: Tokyo backup-only URL format'); }
 catch(e){ console.error(e.message); process.exitCode=1; }
}
module.exports={verifyBackupUrl,PROD,USER};
