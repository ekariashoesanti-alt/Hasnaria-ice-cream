# Hasnaria backup permanen: OCI Object Storage Batam (tanpa VM)

Status: **kode siap, bucket/credentials belum terverifikasi**. Backup SQL
sementara dari Tokyo SUKSES pada GitHub Actions run #39366534620.
Backup terenkripsi OCI **belum ada** sampai workflow nyata sukses.

## Arsitektur sederhana
Supabase Tokyo read-only → GitHub Actions pg_dump → enkripsi age → bucket
PRIVATE OCI Object Storage `ap-batam-1` → unduh lagi → verifikasi byte
sama → (run terpisah) dekripsi dan restore ke PostgreSQL 17 sementara
`--network none`. Container dan file lokal selalu dihapus.
Tidak ada VM, tidak ada database ketiga dan tidak memakai bucket AI ROOM.

## Hanya konfigurasi satu kali
1. Di OCI Console region **Indonesia North (Batam)**, buat satu bucket
   **khusus Hasnaria**; misalnya `hasnaria-backup-private`.
   Set **Private (NoPublicAccess)**, **Standard**, dan **Object Versioning: Enabled**.
   Jangan membuat Pre-Authenticated Request atau memilih bucket AI ROOM.
   Simpan nama bucket serta *Object Storage namespace* dari OCI Console.
2. Buat OCI **Customer Secret Key** untuk akun IAM yang hanya mendapat akses
   baca/tulis object di bucket Hasnaria tersebut. Customer Secret Key menghasilkan
   pasangan **Access Key + Secret Key** untuk S3-compatible API; itu bukan
   OCI API signing key biasa. Simpan rahasianya di GitHub Environments, tidak di chat.
3. Gunakan GitHub Repository → Settings → Environments →
   `hasnaria-backup-private`. Set nilai-nilai ini:

   | Name | Type | Description |
   |---|---|---|
   | `HSN_PROD_BACKUP_READONLY_DB_URL` | Secret | Akun Tokyo read-only yang sudah lulus sebelumnya |
   | `HSN_BACKUP_S3_BUCKET` | Variable | Nama bucket privat Hasnaria di OCI |
   | `HSN_OCI_NAMESPACE` | Variable | Object Storage namespace OCI |
   | `AWS_ACCESS_KEY_ID` | Secret | OCI Customer Secret **Access Key** |
   | `AWS_SECRET_ACCESS_KEY` | Secret | OCI Customer Secret **Secret Key** |
   | `HSN_BACKUP_AGE_RECIPIENT` | Variable | Public age recipient dari keypair backup |
   | `HSN_BACKUP_AGE_IDENTITY` | Secret | Private age identity, simpan salinan aman di luar GitHub |

   GitHub Actions memakai region `ap-batam-1` dan endpoint:
   `https://<namespace>.compat.objectstorage.ap-batam-1.oraclecloud.com`.
   Tidak perlu mengatur AWS region, membuat akun AWS, membuat OCI VM atau
   memasang server. OCI mengenkripsi objek secara bawaan; backup tetap
   dienkripsi age **sebelum** diunggah.

   Buat age keypair di komputer tepercaya dengan `age-keygen`.
   Jangan mengirim private identity, DB URL atau Customer Secret ke percakapan.

**Catatan keamanan:** endpoint S3-compatible OCI mendukung HeadBucket,
PutObject, GetObject, tetapi tidak mendukung AWS
`GetBucketPublicAccessBlock` atau `GetBucketVersioning`.
Karena itu sifat PRIVATE + Versioning bucket harus diverifikasi di OCI Console;
workflow hanya memeriksa endpoint/bucket kredensial, mengecek kembali ciphertext,
mengenkripsi file, dan memulihkan SQL. IAM harus membatasi akses bucket.

## Setelah konfigurasi, satu kali backup nyata + bukti restore
GitHub Actions → `Hasnaria Encrypted Backup and Recovery Proof`:

A. Branch main, action `encrypted-backup`, confirmation `BACKUP_READONLY`.
   Lihat `Encrypted offsite archive verified; object key: hasnaria/<UTC>.age`.

B. Branch main, action `restore-proof`, confirmation `RESTORE_DISPOSABLE`,
   backup_key = exact object key yang ditampilkan A. Semua restore hanya terjadi
   di container sementara, **bukan** Tokyo/Singapore.

   **Sukses** bila restore + checksum + keseimbangan jurnal + paritas stok +
   Auth SQL/RLS/migrations lolos.

## Batasan
Ini proof SQL backup; bukan pemulihan file Storage eksternal, Auth API/session,
atau layanan Supabase runtime. Rilis data-write Stok/Pembelian tetap HOLD
sampai pengujian Owner staging disetujui. Tidak ada biaya VM, tetapi kapasitas
Object Storage, request dan retensi bisa dikenai biaya di luar kuota gratis.
