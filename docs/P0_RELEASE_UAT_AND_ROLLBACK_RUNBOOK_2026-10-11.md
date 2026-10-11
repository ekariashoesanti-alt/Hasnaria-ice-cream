# HSN-P0 — Gate Rilis, UAT dan Rencana Pemulihan
**Versi:** 11 Oktober 2026  
**Status:** prosedur validasi; **PR #88 masih Draft**. Jangan mengubah produksi sebelum seluruh gate lulus.

## 1. Baseline yang sudah diverifikasi read-only pada produksi

File: `supabase/tests/p0_live_release_gate_read_only_20261011.sql`

| Gate / indikator | Hasil produksi | Ekspektasi rilis |
|---|---:|---|
| Pembelian kanonis September | 139 baris, Rp5.967.145 | Jumlah dan nilai tetap |
| Jurnal Pembelian September | 139 baris, Rp5.967.145 | Delta Pembelian = 0 dan delta double-entry = 0 |
| Penjualan September | 641 sumber / 641 jurnal | Tidak berubah dan `sync_required = false` |
| Receipt Pembelian kanonis yang sudah masuk Stok | 41 | Tidak dihapus / ditulis ulang |
| Receipt Pembelian kanonis menunggu satuan | 32, Rp2.360.255 | Tidak diposting otomatis |
| Status mapping yang butuh review | 33 | Tidak dipaksakan menjadi inventory |
| Beban non-stok | 33 | Tidak menambah Stok |
| Receipt historis terputus | 86 (47 September, 26 Juli, 13 Januari) | Tidak dihapus atau di-rebind otomatis |
| Receipt orphan pada SKU dengan opname, sebelum/pada baseline | 59 | Tetap untuk audit historis |
| Receipt orphan tanpa opname | 27 | Memerlukan baseline |
| Receipt orphan setelah opname | 0 | Tetap tidak ada tambahan |
| View audit orphan baru di produksi | Tidak terpasang | Tetap nol sampai change approval |
| Tabel attestasi satuan Owner di produksi | Tidak terpasang | Tetap nol sampai change approval |

**Status:** seluruh angka di atas diamati melalui `SELECT`; tidak ada deployment database yang dijalankan.

## 2. Verifikasi stok opname terhadap 32 transaksi tertunda

| Kelompok | Baris | Nilai | Kebijakan |
|---|---:|---:|---|
| Pembelian pada/sebelum opname terbaru | 18 | Rp1.636.555 | **Jangan** hitung ulang ke saldo berjalan; cek apakah sudah termasuk stok fisik |
| Pembelian sesudah opname | 7 | Rp177.500 | Calon posting terpisah **hanya jika** penerimaan fisik dan satuan telah dipastikan |
| Belum memiliki opname | 7 | Rp546.200 | Lakukan pencatatan baseline fisik dahulu atau review opening secara terotorisasi |

Verifikasi unit **tidak sama** dengan posting. Jangan mengubah `inventory_purchase_log` atau `inventory_movements` ketika Owner hanya menyimpan konversi dan bukti.

## 3. Gate Backup (wajib sebelum DDL)

**Belum selesai.** Konektor Supabase yang tersedia tidak menyediakan tindakan membuat serta menguji restore backup database. Belum ada salinan produksi yang dibuat oleh perubahan PR ini.

Administrator berwenang harus menyiapkan satu snapshot yang dapat dipulihkan sebelum apply DDL dan memastikan mencakup:
- `offline_purchase_history`, `purchase_import_evidence`, tabel `import_jobs` dan keputusan Owner.
- `inventory_items`, `inventory_purchase_log`, `inventory_movements`, `inventory_stock_opname`, `inventory_unit_conversions`, `private.purchase_stock_reviews`.
- Finance purchase/sales journals, basis sumber, dan tabel posting relevan.
- Definisi view, functions, triggers, policies, roles dan privileges, juga migrasi metadata.

Backup dinyatakan **lulus** hanya jika restore pada lingkungan terpisah berhasil, jumlah baris dan checksum/angka kontrol dibandingkan, dan administrator mencatat waktu snapshot, lokasi, pemilik, dan prosedur rollback.

**Jangan** menggunakan database produksi untuk tes restore.

### Rekomendasi khusus Hasnaria — Supabase Free

Pemeriksaan konektor Supabase pada 11 Oktober 2026: organisasi `Hasnaria Ice Cream` memakai `plan=free`. Berdasarkan dokumentasi resmi Supabase (https://supabase.com/docs/guides/platform/backups), backup otomatis harian yang dapat dipulihkan tersedia pada paket Pro/Team/Enterprise; untuk Free, Supabase merekomendasikan **ekspor logis manual** menggunakan `supabase db dump`.

Petunjuk resmi: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

Langkah administrator yang tidak mengubah database sumber:

1. Gunakan PC/lingkungan pengelola yang dipercaya dengan Supabase CLI, PostgreSQL client, dan koneksi PostgreSQL yang sah. Ambil koneksi DB dari Dashboard Supabase; jangan tempel kata sandi di GitHub/PR/CI log.
2. Simpan connection string dalam `HSN_SUPABASE_DB_URL` pada terminal lokal (jangan dipublikasikan). Buat direktori backup di drive pribadi terenkripsi, bukan di repository.
3. Jalankan dump roles, schema, dan data ke tiga file yang berbeda. `-x` mengecualikan tabel internal vector-storage yang disebut dalam dokumentasi resmi, bukan data Hasnaria:
   ```powershell
   supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f .\roles.sql --role-only
   supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f .\schema.sql
   supabase db dump --db-url $env:HSN_SUPABASE_DB_URL -f .\data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
   ```
4. Pastikan dump file tidak kosong, catat checksum SHA-256, waktu dump, lokasi penyimpanan privat dan ukuran file, serta cek apakah skema `private` dan jurnal diikutkan.
5. **Wajib latihan restore** ke database sementara TERPISAH, bukan produksi. Ikuti petunjuk resmi tentang pemulihan roles dan urutan schema/data, lalu cocokkan angka `p0_live_release_gate_read_only_20261011.sql`, 139/641 transaksi, 41 receipt kanonis, 86 orphan, dan fingerprint keuangan.
6. Verifikasi ulang dokumen/binary file yang berada di Supabase Storage karena backup database hanya memuat metadata objek, bukan file Storage itu sendiri. Jika aplikasi mengandalkan foto nota/kemasan, ekspor objek terkait secara terpisah dari bucket sesuai izin.
7. Bila backup atau restore tidak lengkap: **HOLD**, jangan jalankan migrasi atau merge sebagai rilis produksi.

Catatan: tiga perintah di atas adalah prosedur administrator, **belum dijalankan** oleh konektor ChatGPT; tidak boleh diklaim sebagai backup yang sudah ada. Tidak ada upgrade berbayar yang dilakukan.

### Gate pemulihan Auth, histori migrasi, dan Storage — verifikasi 11 Oktober 2026

**Hasil query SELECT-only pada sumber produksi (08:22 UTC / 15:22 WIB):**

| Komponen | Jumlah | Implikasi |
|---|---:|---|
| Akun `auth.users` | **4** | Target restore HARUS mempertahankan data akun yang sah, lalu diuji login; jangan menganggap export `public` mencakup Auth |
| Identitas `auth.identities` | **4** | Relasi identitas–akun harus konsisten setelah restore |
| Catatan `supabase_migrations.schema_migrations` | **296** | Harus diekspor dan dipulihkan sebagai riwayat migrasi; jangan menghasilkan file kosong |
| Supabase Storage buckets | **0** | Tidak ada bucket Storage milik Supabase untuk disalin pada snapshot ini |
| Supabase Storage metadata objects | **0** | Tidak ada objek Storage pada snapshot; tetap cek apabila ada upload setelah checkpoint |
| Receipt–movement | **703/703** | Tidak boleh berubah tanpa transaksi bisnis baru yang tercatat |
| Pembelian/Jurnal September | **139/139**, Rp5.967.145 | Delta Rp0 |
| Penjualan/Jurnal September | **641/641** | Sync tidak diperlukan |

**Penting:** `supabase db dump` secara standar mengabaikan schema terkelola tertentu, termasuk `auth` dan `storage` (lihat [referensi CLI](https://supabase.com/docs/reference/cli/global-flags)). Dump peran/skema/data bukan jaminan dapat memulihkan 4 pengguna beserta login. Panduan khusus Auth: https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects.

Skrip privat `scripts/p0_backup_hsn_supabase_free.ps1` kini menambahkan `history_schema.sql` dan `history_data.sql`, mencatat SHA-256 dan menandai `auth_users_restored_and_login_tested=false` sampai bukti nyata tersedia. Jangan menaruh dump, token, hash password, atau akun nyata dalam PR/GitHub Actions/artifact publik.

Langkah acceptance setelah administrator memiliki backup privat:
1. Administrator mengikuti dokumentasi resmi untuk memulihkan **Auth users/identities dan skema terkait** ke **instans TERPISAH**, tanpa menimpa Auth produksi. Validasi akses sesuai otoritas; pengujian identitas tidak dilakukan menggunakan akun asli tanpa izin.
2. Jalankan query `supabase/tests/p0_restore_acceptance_read_only_20261011.sql` pada sumber dan target hasil restore. Cocokkan seluruh metrik, angka keuangan, serta checksum di `supabase/tests/p0_stage0_baseline_checksum_read_only_20261011.sql`.
3. Pastikan 296 riwayat migrasi kembali utuh, fungsi/trigger/RLS tetap tersedia, dan hasil uji login Owner/Staff pada staging berhasil.
4. Periksa ulang Storage buckets/objects sesaat sebelum backup. Jika tidak lagi nol, salin objek berkas asli secara privat melalui workflow Storage terotorisasi dan lakukan uji download pada target. Database dump bukan salinan file fisik.
5. **Tidak boleh mencentang `restore_verified` hanya karena berkas dump dapat dibuat.** Pemulihan end-to-end dan otorisasi login wajib dinyatakan PASS oleh administrator.

**Status saat ini:** SQL audit telah dijalankan dan hasil cocok dengan baseline bisnis sebelumnya; **file dump aktual, pemulihan Auth dan restore belum dilaksanakan**. Gate tetap HOLD tanpa biaya langganan baru.

## 4. UAT Owner / Staff di lingkungan staging berisi data representatif

**Belum dijalankan dengan akun nyata.** CI PostgreSQL hanya menggunakan fixture sintetis dan simulasi role.

| Kasus | Ekspektasi |
|---|---|
| Owner membuka Pembelian September | Ringkasan 139, keuangan tetap selaras |
| Owner membuka Verifikasi Satuan | Antrean 32 item: 25 `exact_name`, 7 `inventory_alias` |
| Owner memilih transaksi sebelum/pada opname | Muncul peringatan baseline, tidak ada posting |
| Owner memilih transaksi pasca-opname | Dapat pratinjau, belum ada posting |
| Owner mengisi satuan "pack" dan konversi sesuai bukti | Pratinjau `qty sumber × multiplier = unit stok`, identitas sumber tertahan dalam token |
| Owner mengubah satuan/faktor setelah pratinjau | Token lama dibatalkan, harus pratinjau ulang |
| Owner menyimpan bukti lengkap | 1 row `private.purchase_unit_attestations_v1`, **0** baris baru Stok/Finance |
| Owner menyetujui duplikat sumber | Ditolak oleh unique-index dan pemeriksaan server |
| Owner membatalkan approval sebelum posting | Catatan approval ditandai revoked, masih bisa diaudit |
| Staff mencoba RPC langsung | Ditolak server (bukan hanya UI) |
| Anon/merek lain mencoba akses | Ditolak server |
| Undo Review Stok lama | RPC resmi dengan validasi snapshot, consumption, dan fingerprint Finance masih bekerja |
| Ponsel 100% zoom | Tabel modal dapat digeser secara horizontal; tombol input dan pesan error tidak terpotong |

Setiap kasus diberi bukti Owner, waktu, hasil `PASS/FAIL`, dan cap screenshot hanya pada lingkungan staging.

### UAT tambahan — Master SKU fisik Owner (Stage 11, belum dilakukan)

| Kasus | Hasil yang wajib |
|---|---|
| Owner membuka **Verifikasi satuan master SKU** | Tampil **14 SKU** berkaitan dengan tracking, receipt, BOM aktif atau Pembelian pending pada snapshot |
| Owner memilih **Tampilkan seluruh placeholder** | Menampilkan **80 SKU** pada snapshot; review tidak mengubah master |
| Staff atau pengguna belum login mencoba RPC queue/preview/apply/revoke | Ditolak server |
| Satuan `purchase_unit`/unknown dicoba sebagai hasil final | Ditolak dengan pesan |
| Owner menyimpan `DOCUMENT_UNIT` dengan nota/foto dan alasan sah | 1 catatan audit privat saja, `inventory_items.unit` **tidak berubah** |
| Master/konversi diubah setelah preview | Token usang gagal; diminta preview ulang |
| Owner membatalkan review | Keputusan lama berstatus revoked dan tetap bisa diaudit |
| Operator menjalankan pause `20261011233000` pada staging | Approval/revoke ditolak, queue dan catatan lama tetap terbaca |
| Owner logout atau app disembunyikan | Modal sensitif tidak tertinggal |
| Periksa checksum/ledger sesudah uji | Receipt 703/movement 703, Stock/BOM/Finance sama, kecuali transaksi sah baru yang diidentifikasi |

**Dokumen pelaksanaan:** `docs/P0_2_OWNER_MASTER_UNIT_STAGE11_2026-10-11.md`. Angka 14/80 adalah snapshot SELECT produksi 11 Oktober 2026; jangan hard-code angka ini sebagai syarat permanen jika transaksi atau master bertambah.

## 5. Release sequence (baru setelah semua gate)

1. Bekukan jendela re-import Pembelian dan sinkronisasi Stock; ambil snapshot teruji dan baseline dari SQL preflight.
2. Selesaikan konflik schema/migration dengan `main` terkini, dan konfirmasi semua CI + preview pada commit release.
3. Terapkan migrasi **sesuai urutan timestamp** setelah backup dan test: `20261011110000` (source lineage), `20261011180000` (stock view), `20261011190000` (posting-unit guard), `20261011193000` (Owner Undo), `20261011194500` (orphan factuur triage), `20261011200000` (Owner unit review), `20261011210000` (orphan active-ledger gate), `20261011220000` (SKU unit triage), `20261011223000` (Owner verified-conversion no-BOM), `20261011230000` (Owner orphan documentary review), `20261011233000` (Owner master SKU documentary unit approval, no Stock updates). Jangan jalankan alur UI review sebelum SQL terkait terpasang dan role staging terbukti.
4. Uji baca keuangan/stok langsung; pastikan `finance_purchase_reconciliation_monthly_v1` delta nol, stok dibandingkan ledger, dan 86 orphan tetap ada.
5. Uji login Owner dan Staff; pastikan role enforcement Owner, formular bukti, token, revoke, serta semua modul tetap terbuka.
6. Aktifkan client version hanya setelah RPC tersedia; monitor error posting, quantity conversion, permission, Finance delta.
7. Jika gagal, hentikan pengiriman dan terapkan rollback/manual pause yang sesuai tanpa menghapus data bisnis; jika ada kerusakan riil data, gunakan snapshot teruji + audit per transaksi, bukan SQL delete/reimport massal.

## 6. Emergency control

- `supabase/rollback/20261011180000_restore_stock_reconciliation.sql` memulihkan definisi view Stok lama (hanya setelah menilai apakah rumus lama justru menyesatkan).
- `supabase/rollback/20261011190000_pause_purchase_stock_sync.sql` menghentikan posting sinkronisasi Stock baru tanpa menghidupkan implementasi lama yang tidak aman.
- `supabase/rollback/20261011200000_pause_owner_unit_attestations.sql` menonaktifkan approval baru sambil mempertahankan bukti Owner dan antrean baca.
- `supabase/rollback/20261011223000_pause_owner_conversion_no_bom.sql` menonaktifkan approval konversi baru tanpa mengaktifkan fungsi lama yang menulis BOM.
- `supabase/rollback/20261011230000_pause_owner_orphan_receipt_reviews.sql` menonaktifkan review historis baru dan revoke, mempertahankan bukti serta antrean baca.
- `supabase/rollback/20261011233000_pause_owner_master_unit_reviews.sql` menghentikan approval/revoke satuan master SKU sementara tanpa menyentuh historis, Stok, atau BOM.
- Guard lineage/receipt lebih aman tetap aktif daripada dihapus secara otomatis. Pembatalan guard hanya melalui review DBA dan rollback snapshot resmi bila memang diperlukan.

**Keputusan rilis:** **HOLD** sampai backup+restore nyata, verifikasi fisik/satuan Owner, UAT terautentikasi, dan persetujuan pemilik proses. Tidak ada keputusan merge/deploy otomatis dari file ini.
