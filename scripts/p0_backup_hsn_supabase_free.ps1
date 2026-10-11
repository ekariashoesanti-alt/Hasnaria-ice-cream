# Hasnaria Supabase Free: read-only logical backup operator handoff.
# Run LOCALLY from an authorized Windows administrator workstation.
# Never run from CI or publish SQL dumps, passwords, or connection strings.
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
$manifest = Join-Path $folder 'backup_manifest.json'
$files = @($roleFile,$schemaFile,$dataFile)

Write-Host 'Memulai dump LOGIS Supabase ke folder pribadi. Jangan upload hasil ke GitHub.' -ForegroundColor Yellow
# --db-url is read-only for db dump. Do NOT use db reset or db push.
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $roleFile --role-only
if ($LASTEXITCODE -ne 0) { throw 'Dump roles gagal. Jangan lanjut migrasi produksi.' }
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $schemaFile
if ($LASTEXITCODE -ne 0) { throw 'Dump schema gagal. Jangan lanjut migrasi produksi.' }
& supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f $dataFile --use-copy --data-only
if ($LASTEXITCODE -ne 0) { throw 'Dump data gagal. Jangan lanjut migrasi produksi.' }

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
  restore_gate = 'HOLD until restored successfully into a separate database'
  files = @($files | ForEach-Object {
    $info=Get-Item -LiteralPath $_
    $hash=Get-FileHash -LiteralPath $_ -Algorithm SHA256
    @{filename=$info.Name; size_bytes=$info.Length; sha256=$hash.Hash}
  })
}
$meta | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifest -Encoding UTF8
Write-Host ('File dump tersedia di: '+$folder) -ForegroundColor Green
Write-Host 'Belum aman merge/migrasi: lakukan RESTORE TERPISAH dan verifikasi jumlah/checksum lebih dulu.' -ForegroundColor Yellow
Write-Host 'Backup SQL memuat data privat; amankan di drive terenkripsi dan jangan bagikan ke publik.' -ForegroundColor Yellow
