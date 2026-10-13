# Hasnaria Supabase Free: read-only logical backup operator handoff.
# Run LOCALLY from an authorized Windows administrator workstation.
# Never run from CI or publish SQL dumps, passwords, or connection strings.
# This only backs up CLI-accessible roles/schema/data and migration metadata.
# Verify managed auth/storage coverage separately; this is NOT a full-project backup.
# Prerequisites: Supabase CLI, Docker Desktop running, accessible database.
# The source is READ ONLY; this script will NEVER restore/delete/replay data.
# IMPORTANT: Store backups on an encrypted and owner-only drive.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [ValidateNotNullOrEmpty()]
  [string] $PrivateBackupDirectory
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:HSN_SUPABASE_DB_URL)) {
  throw 'HSN_SUPABASE_DB_URL belum ada. Set hanya dalam session PowerShell privat; jangan simpan ke Git atau log.'
}
# BLOCK wrong Supabase project before invoking any dump.
$expectedProjectRef = 'bnnhmtkpdjlgehsvgoda'
try { $dbUri = [Uri] $env:HSN_SUPABASE_DB_URL } catch { throw 'URL PostgreSQL tidak valid.' }
if ($dbUri.Scheme -notin @('postgres', 'postgresql')) { throw 'Hanya URL PostgreSQL diperbolehkan.' }
if ($dbUri.AbsolutePath -ne '/postgres') { throw 'Database target bukan postgres; dump dihentikan.' }
$dbUser = [Uri]::UnescapeDataString(($dbUri.UserInfo -split ':', 2)[0])
if ($dbUri.UserInfo -notmatch ':') { throw 'URL harus memiliki password privat.' }
$directDb = ($dbUri.Host -eq ('db.' + $expectedProjectRef + '.supabase.co') -and $dbUser.Length -gt 0)
$poolerDb = ($dbUri.Host -match '(^|\.)pooler\.supabase\.com
  throw 'Supabase CLI belum ada. Install sesuai dokumentasi resmi terlebih dahulu.'
}
if (-not (Get-Command 'docker' -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop tidak ditemukan. Supabase CLI dump membutuhkannya.'
}
& docker info --format '{{.ServerVersion}}' 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop belum berjalan.'
}

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$folder = Join-Path $PrivateBackupDirectory ('Hasnaria_P0_'+$timestamp)
if (Test-Path -LiteralPath $folder) { throw 'Folder backup bertimestamp sudah ada; penimpaan ditolak.' }
[void](New-Item -Path $folder -ItemType Directory -ErrorAction Stop)
$roleFile = Join-Path $folder 'roles.sql'
$schemaFile = Join-Path $folder 'schema.sql'
$dataFile = Join-Path $folder 'data.sql'
$historySchemaFile = Join-Path $folder 'history_schema.sql'
$historyDataFile = Join-Path $folder 'history_data.sql'
$manifest = Join-Path $folder 'backup_manifest.json'
$files = @($roleFile,$schemaFile,$dataFile,$historySchemaFile,$historyDataFile)

Write-Host 'Memulai dump LOGIS Supabase ke folder pribadi. Jangan upload hasil ke GitHub.' -ForegroundColor Yellow
# --db-url is read-only for db dump. Do NOT use db reset or db push.
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $roleFile --role-only
if ($LASTEXITCODE -ne 0) { throw 'Dump roles gagal. Jangan lanjut migrasi produksi.' }
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $schemaFile
if ($LASTEXITCODE -ne 0) { throw 'Dump schema gagal. Jangan lanjut migrasi produksi.' }
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $dataFile --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
if ($LASTEXITCODE -ne 0) { throw 'Dump data gagal. Jangan lanjut migrasi produksi.' }
# Migration history is separately excluded from the default CLI-managed dump.
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $historySchemaFile --schema supabase_migrations
if ($LASTEXITCODE -ne 0) { throw 'Dump skema histori migrasi gagal; backup belum memenuhi gate rilis.' }
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $historyDataFile --use-copy --data-only --schema supabase_migrations
if ($LASTEXITCODE -ne 0) { throw 'Dump data histori migrasi gagal; backup belum memenuhi gate rilis.' }

foreach($file in $files) {
  if(-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw ('Berkas hasil dump tidak ditemukan: '+(Split-Path $file -Leaf))
  }
  $size=(Get-Item -LiteralPath $file).Length
  if($size -lt 16) {
    throw ('Berkas backup kosong/tidak lengkap: '+(Split-Path $file -Leaf))
  }
}

# Manifest deliberately contains no passwords, connection string or row data.
$meta = @{
  project = 'Hasnaria (bnnhmtkpdjlgehsvgoda)'
  snapshot_utc = $timestamp
  backup_kind = 'manual_logical_dump'
  source_mutated = $false
  restore_verified = $false
  source_project_ref_validated = $true
  restored_into_isolated_database = $false
  auth_users_included = $false
  transactionally_consistent_snapshot_verified = $false
  physical_storage_objects_included = $false
  auth_users_restored_and_login_tested = $false
  auth_schema_data_scope = 'NOT VERIFIED: CLI-managed schema may be excluded; project has live Auth users'
  migration_history_dumped = $true
  roles_schema_data_dumped = $true
  recovery_scope = 'PARTIAL: multi-step dump is not an atomic snapshot; Auth login, private managed schemas, and independent restore still require separate checks'
  restore_gate = 'HOLD until restored successfully into a separate database'
  files = @($files | ForEach-Object {
    $info=Get-Item -LiteralPath $_
    $hash=Get-FileHash -LiteralPath $_ -Algorithm SHA256
    @{filename=$info.Name; size_bytes=$info.Length; sha256=$hash.Hash}
  })
}
$meta | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifest -Encoding UTF8
Write-Host ('File dump tersedia di: '+$folder) -ForegroundColor Green
Write-Host 'PENTING: CLI standar dapat mengecualikan data Auth dan Storage managed schemas.' -ForegroundColor Yellow
Write-Host 'Restore dan uji 4 akun Auth, aturan akses, migration history, dan semua objek pendukung di tempat terpisah sebelum rilis.' -ForegroundColor Yellow
Write-Host 'Belum aman merge/migrasi: lakukan RESTORE TERPISAH dan verifikasi jumlah/checksum lebih dulu.' -ForegroundColor Yellow
Write-Host 'Backup SQL memuat data privat; amankan di drive terenkripsi dan jangan bagikan ke publik.' -ForegroundColor Yellow
 -and $dbUser -eq ('postgres.' + $expectedProjectRef))
if (-not ($directDb -or $poolerDb)) { throw 'BLOCK: URL bukan produksi Tokyo Hasnaria.' }
if (-not [IO.Path]::IsPathRooted($PrivateBackupDirectory)) { throw 'Folder backup harus path absolut di drive terenkripsi.' }
if (-not (Test-Path -LiteralPath $PrivateBackupDirectory -PathType Container)) { throw 'Buat folder pribadi terlebih dahulu.' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd([IO.Path]::DirectorySeparatorChar)
$backupRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $PrivateBackupDirectory).Path).TrimEnd([IO.Path]::DirectorySeparatorChar)
if ($backupRoot.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $backupRoot.StartsWith(($repoRoot + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) {
  throw 'BLOCK: output backup tidak boleh berada dalam repository Git.'
}
if (-not (Get-Command 'supabase' -ErrorAction SilentlyContinue)) {
  throw 'Supabase CLI belum ada. Install sesuai dokumentasi resmi terlebih dahulu.'
}
if (-not (Get-Command 'docker' -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop tidak ditemukan. Supabase CLI dump membutuhkannya.'
}
& docker info --format '{{.ServerVersion}}' 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop belum berjalan.'
}

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$folder = Join-Path $PrivateBackupDirectory ('Hasnaria_P0_'+$timestamp)
[void](New-Item -Path $folder -ItemType Directory -Force)
$roleFile = Join-Path $folder 'roles.sql'
$schemaFile = Join-Path $folder 'schema.sql'
$dataFile = Join-Path $folder 'data.sql'
$historySchemaFile = Join-Path $folder 'history_schema.sql'
$historyDataFile = Join-Path $folder 'history_data.sql'
$manifest = Join-Path $folder 'backup_manifest.json'
$files = @($roleFile,$schemaFile,$dataFile,$historySchemaFile,$historyDataFile)

Write-Host 'Memulai dump LOGIS Supabase ke folder pribadi. Jangan upload hasil ke GitHub.' -ForegroundColor Yellow
# --db-url is read-only for db dump. Do NOT use db reset or db push.
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $roleFile --role-only
if ($LASTEXITCODE -ne 0) { throw 'Dump roles gagal. Jangan lanjut migrasi produksi.' }
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $schemaFile
if ($LASTEXITCODE -ne 0) { throw 'Dump schema gagal. Jangan lanjut migrasi produksi.' }
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $dataFile --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
if ($LASTEXITCODE -ne 0) { throw 'Dump data gagal. Jangan lanjut migrasi produksi.' }
# Migration history is separately excluded from the default CLI-managed dump.
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $historySchemaFile --schema supabase_migrations
if ($LASTEXITCODE -ne 0) { throw 'Dump skema histori migrasi gagal; backup belum memenuhi gate rilis.' }
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $historyDataFile --use-copy --data-only --schema supabase_migrations
if ($LASTEXITCODE -ne 0) { throw 'Dump data histori migrasi gagal; backup belum memenuhi gate rilis.' }

foreach($file in $files) {
  if(-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw ('Berkas hasil dump tidak ditemukan: '+(Split-Path $file -Leaf))
  }
  $size=(Get-Item -LiteralPath $file).Length
  if($size -lt 16) {
    throw ('Berkas backup kosong/tidak lengkap: '+(Split-Path $file -Leaf))
  }
}

# Manifest deliberately contains no passwords, connection string or row data.
$meta = @{
  project = 'Hasnaria (bnnhmtkpdjlgehsvgoda)'
  snapshot_utc = $timestamp
  backup_kind = 'manual_logical_dump'
  source_mutated = $false
  restore_verified = $false
  physical_storage_objects_included = $false
  auth_users_restored_and_login_tested = $false
  auth_schema_data_scope = 'NOT VERIFIED: CLI-managed schema may be excluded; project has live Auth users'
  migration_history_dumped = $true
  roles_schema_data_dumped = $true
  recovery_scope = 'PARTIAL: files, Auth login, custom managed-schema changes, and restore still require separate checks'
  restore_gate = 'HOLD until restored successfully into a separate database'
  files = @($files | ForEach-Object {
    $info=Get-Item -LiteralPath $_
    $hash=Get-FileHash -LiteralPath $_ -Algorithm SHA256
    @{filename=$info.Name; size_bytes=$info.Length; sha256=$hash.Hash}
  })
}
$meta | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifest -Encoding UTF8
Write-Host ('File dump tersedia di: '+$folder) -ForegroundColor Green
Write-Host 'PENTING: CLI standar dapat mengecualikan data Auth dan Storage managed schemas.' -ForegroundColor Yellow
Write-Host 'Restore dan uji 4 akun Auth, aturan akses, migration history, dan semua objek pendukung di tempat terpisah sebelum rilis.' -ForegroundColor Yellow
Write-Host 'Belum aman merge/migrasi: lakukan RESTORE TERPISAH dan verifikasi jumlah/checksum lebih dulu.' -ForegroundColor Yellow
Write-Host 'Backup SQL memuat data privat; amankan di drive terenkripsi dan jangan bagikan ke publik.' -ForegroundColor Yellow
