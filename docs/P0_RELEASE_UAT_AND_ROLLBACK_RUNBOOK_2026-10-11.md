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

## 5. Release sequence (baru setelah semua gate)

1. Bekukan jendela re-import Pembelian dan sinkronisasi Stock; ambil snapshot teruji dan baseline dari SQL preflight.
2. Selesaikan konflik schema/migration dengan `main` terkini, dan konfirmasi semua CI + preview pada commit release.
3. Terapkan migrasi sesuai urutan nama: `20261011110000` (source lineage), `20261011180000` (stock view), `20261011190000` (posting-unit guard), `20261011193000` (Owner Undo compatibility), `20261011194500` (private orphan triage), `20261011200000` (Owner unit documentary review).
4. Uji baca keuangan/stok langsung; pastikan `finance_purchase_reconciliation_monthly_v1` delta nol, stok dibandingkan ledger, dan 86 orphan tetap ada.
5. Uji login Owner dan Staff; pastikan role enforcement Owner, formular bukti, token, revoke, serta semua modul tetap terbuka.
6. Aktifkan client version hanya setelah RPC tersedia; monitor error posting, quantity conversion, permission, Finance delta.
7. Jika gagal, hentikan pengiriman dan terapkan rollback/manual pause yang sesuai tanpa menghapus data bisnis; jika ada kerusakan riil data, gunakan snapshot teruji + audit per transaksi, bukan SQL delete/reimport massal.

## 6. Emergency control

- `supabase/rollback/20261011180000_restore_stock_reconciliation.sql` memulihkan definisi view Stok lama (hanya setelah menilai apakah rumus lama justru menyesatkan).
- `supabase/rollback/20261011190000_pause_purchase_stock_sync.sql` menghentikan posting sinkronisasi Stock baru tanpa menghidupkan implementasi lama yang tidak aman.
- `supabase/rollback/20261011200000_pause_owner_unit_attestations.sql` menonaktifkan approval baru sambil mempertahankan bukti Owner dan antrean baca.
- Guard lineage/receipt lebih aman tetap aktif daripada dihapus secara otomatis. Pembatalan guard hanya melalui review DBA dan rollback snapshot resmi bila memang diperlukan.

**Keputusan rilis:** **HOLD** sampai backup+restore nyata, verifikasi fisik/satuan Owner, UAT terautentikasi, dan persetujuan pemilik proses. Tidak ada keputusan merge/deploy otomatis dari file ini.
