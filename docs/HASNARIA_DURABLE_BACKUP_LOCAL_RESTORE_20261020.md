# Backup Hasnaria ke OCI Batam — tanpa VM dan tanpa kunci tambahan

Status: mekanisme siap diuji. Backup permanen pertama hanya boleh dinyatakan BERHASIL setelah ada run GitHub Actions yang sukses.

## Arsitektur
Supabase Tokyo (akun baca saja) → GitHub Actions pg_dump → bucket **OCI Private** `hasnaria-backup-private` (namespace `axf1xcjq8gsy`, region `ap-batam-1`) → unduh kembali → cocokkan byte → restore di Docker PostgreSQL 17 sementara tanpa jaringan → hapus salinan sementara.

**Enkripsi:** seluruh objek di OCI Object Storage terenkripsi AES-256 saat disimpan dengan kunci yang dikelola Oracle (default, tidak dapat dimatikan), dan pemindahan file menggunakan HTTPS. Tidak ada lapisan age/client-side encryption pada jalur sederhana ini; artinya pemilik kredensial OCI yang sah dapat mengunduh serta mendekripsi file. Pakai bucket PRIVAT, least-privilege IAM, lindungi GitHub Environment, dan jangan buat Pre-Authenticated Request.

## Yang sudah diketahui dan tidak perlu diisi lagi
- Nama bucket: `hasnaria-backup-private`
- Namespace: `axf1xcjq8gsy`
- Region: `ap-batam-1`
- Customer Secret Keys OCI dibuat pengguna; pengguna melaporkan `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` telah dimasukkan ke GitHub Environment `hasnaria-backup-private` (keberadaan/nilainya belum dapat dibaca oleh konektor).
- Akun read-only Tokyo: `HSN_PROD_BACKUP_READONLY_DB_URL`, yang pernah lulus uji restore sementara.

## Kapan berjalan
Workflow `.github/workflows/hasnaria-recovery-proof.yml` menjalankan **satu kali backup** otomatis setelah perubahan workflow itu di-merge ke `main`. Bisa dijalankan ulang manual (Actions → Hasnaria OCI Protected SQL Backup and Recovery Proof → encrypted-backup, konfirmasi BACKUP_READONLY). Hanya branch `main` yang diperbolehkan.

Job memerlukan variabel private Environment hanya untuk kredensial database Tokyo dan Customer Secret Key OCI. Bila belum ada atau izin ditolak, job **BLOCK**, tidak boleh mengaku bahwa file sudah dibackup. Bucket OCI harus sudah Private dan sebaiknya Versioning aktif (cek pengaturan OCI Console; HeadBucket saja tidak memverifikasi pengaturan ini).

Ketika lulus, log akan mencatat `PASS: private OCI SQL backup and independent isolated PostgreSQL restore`, checksum SHA256 dan object key `OCI_BACKUP_KEY=hasnaria/YYYYMMDDTHHMMSSZ.dump`. Objek di OCI tidak otomatis terhapus oleh pembersihan runner; kunci disimpan dalam bucket yang terpisah dari AI ROOM.

Workflow manual `restore-proof` dapat menguji objek lama berdasarkan object key tersebut tanpa menulis apa pun ke Tokyo/Singapore.

## Batasan
- Ini SQL logical backup+restore, bukan recovery Supabase Auth API, token sesi, Storage blob luar SQL, konfigurasi Edge Functions atau secrets aplikasi.
- Workflow menolak backup bila tabel `storage.objects` berisi entri yang memerlukan prosedur file tersendiri.
- Tidak ada VM atau proyek database Supabase ketiga.
- Rilis operasional Stok/Pembelian tetap HOLD sampai uji Owner staging dan persetujuan rilis terpisah selesai; lihat Issue #111.
