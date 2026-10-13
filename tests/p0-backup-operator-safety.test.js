'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,'..','scripts','p0_backup_hsn_supabase_free.ps1'),'utf8');
test('private P0 backup script must fail closed without invoking a network', () => {
 for(const marker of [
  "$expectedProjectRef = 'bnnhmtkpdjlgehsvgoda'",
  "if ($dbUri.AbsolutePath -ne '/postgres')",
  "if (-not ($directDb -or $poolerDb))",
  "if (-not [IO.Path]::IsPathRooted($PrivateBackupDirectory))",
  "$backupRoot.StartsWith((",
  "if (Test-Path -LiteralPath $folder)",
  "restore_verified = $false",
  "auth_users_included = $false",
  "transactionally_consistent_snapshot_verified = $false",
  "--role-only", "--data-only", "--schema supabase_migrations"
 ]) assert.ok(src.includes(marker), 'missing backup safety marker: '+marker);
 assert.doesNotMatch(src,/supabase db (push|reset|start)|Invoke-Expression/i);
});
