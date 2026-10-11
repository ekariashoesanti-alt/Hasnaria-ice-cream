# HSN — P0.1 / P0.2 Penutupan Aman dan Daftar Bukti Owner
**11 Oktober 2026 · Branch PR #88 · HOLD produksi**  
Paket review Owner: `Hasnaria_P0_1_2_Paket_Verifikasi_Owner.xlsx` dibagikan secara privat melalui percakapan, **tidak boleh dipush ke repository publik** karena dapat berisi informasi supplier dan bukti nota setelah diisi.

## Dasar penerimaan prioritas P0.1

**Target:** Tidak ada ledger aktif yang bergantung pada referensi sumber Pembelian invalid.

Hasil SELECT-only produksi terbaru:
- 703/703 `inventory_purchase_log` memiliki tepat satu `PURCHASE_RECEIPT` movement yang matching SKU, tanggal, kuantitas dan merek; mismatch 0.
- 86 receipt memiliki UUID sumber Pembelian lama yang tidak lagi ada di Purchase kanonis; semuanya tetap disimpan dengan movement historisnya.
- 0/86 orphan receipt maupun movement berdampak pada saldo ledger yang berbasis opname terakhir.
- 59 orphan ada pada/sebelum opname fisik terakhir; 27 tanpa baseline opname dan karena itu **tidak dapat dianggap sebagai stok fisik sah**.
- 47/47 September orphan memiliki pasangan bukti invoice Majoo unik; 39 Januari/Juli masih membutuhkan faktur asli.
- Tidak boleh menautkan otomatis receipt Majoo ke baris Pembelian September baru, menduplikasi jurnal keuangan, atau menghapus 86 referensi.

**Yang sudah dibangun di PR:** guard source identity, guard receipt mutation, pasangan Owner undo audit, private forensic triage dan private release gate berdasarkan aktivitas setelah opname. CI Postgres membuktikan mode normal dan gagal-rilis saat movement hilang/ganda atau orphan masuk setelah opname.

**Batas penutupan:** Kode P0.1 boleh masuk setelah restore backup + UAT. Penutupan historis baru bisa disahkan Owner setelah 39 faktur asal dilengkapi atau dibuat keputusan pengecualian historis tertulis per bukti; tidak perlu (dan tidak boleh) memanipulasi saldo aktif demi menghilangkan tanda orphan di laporan.

## Dasar penerimaan prioritas P0.2

**Target:** SKU dan kuantitas bekerja dalam satuan stok master yang sah dan faktor konversi disahkan Owner berdasarkan kemasan fisik/faktur.

Snapshot produksi:
- 198 SKU; 80 masih `purchase_unit` placeholder.
- 28 aturan kemasan: 25 `needs_verification` dan 3 `verified`.
- Dua draft ganda: `NATA DE COCO` (pack→gram 1000) dan `SPRITE` (botol→ml 390). Tidak boleh verified ganda; tidak boleh hapus histori sembarangan.
- Satu konflik: `BAKSO AYAM` master `pack`, aturan `pack→pcs 36`; keputusan master fisik harus didahulukan.
- Semua 139 Purchase September kanonis tidak memiliki `unit_text` sumber; 32 baris mapped-unposted tetap menunggu bukti. 33 baris unmatched/ambiguous harus diklasifikasi Inventory/Expense/Exclude lebih dahulu.

**Temuan tambahan yang diperbaiki:** fungsi produksi `private.apply_inventory_unit_conversion` sebelumnya menulis/mengaktifkan komponen resep dengan `qty_per_sale=1/faktor` setelah nilai kemasan di-verified. Ini mencampur **kemasan Pembelian** dan **resep Penjualan** dan dapat mengubah jumlah konsumsi Stok yang sah.

**Fix staged baru:** `supabase/migrations/20261011223000_owner_conversion_no_recipe_bom.sql`
1. Jalur RPC konversi lama diblokir dengan pesan yang mengarahkan ke proses Owner.
2. RPC ERP `resolve_inventory_conversion` mempertahankan interface; implementasi kini memerlukan `owner_stock_review_assert_v1()`, alasan audit min. 20 karakter, input positif, satuan master sah, satuan beli/target konsisten, tidak ada duplikat serta tidak mengizinkan koreksi faktor verified lama secara diam-diam.
3. Trigger `security_invoker` pada katalog konversi menjaga perubahan aturan verified dari akses langsung tanpa konteks RPC Owner; dengan cek execution role selain marker transaksi, pengguna tidak bisa sekadar menyetel marker sendiri.
4. Tidak ada INSERT/UPDATE resep/BOM, Stock receipt/movement, ataupun Finance pada proses verifikasi konversi. BOM tetap diatur alur resep terpisah berdasarkan pengukuran porsi.
5. ERP Owner meminta **referensi nota/foto kemasan, alasan, serta konfirmasi pemeriksaan fisik**. Formulir bukan bukti bahwa ukuran kemasan benar sebelum Owner menyetujui.
6. CI PostgreSQL sintetis mengecek kontrak lama diblokir, langsung UPDATE/DELETE verified diblokir, cross-brand/Staff tidak bisa menyetujui, satuan master tidak cocok, duplikat, dan no-BOM/no-Stock/no-Finance regression.

### Langkah Owner yang wajib dilakukan

Pakai workbook review pada percakapan:
- **Konversi:** untuk setiap 25 draft, isi keputusan, faktor fisik terkonfirmasi, referensi bukti, pemeriksa. Jangan membenarkan angka usulan hanya karena telah ada di sistem.
- **Master SKU:** untuk 80 placeholder, pilih satuan yang benar berdasarkan bahan nyata. Jika barang tidak perlu tracking, catat alasannya; tidak perlu memaksakan `pcs`.
- **Pending Pembelian:** 32 mapped source harus diverifikasi **per nota** via Owner UI; 18 sebelum/pada opname, 7 sesudah, 7 tanpa baseline.
- **P0.1:** 39 faktur Januari/Juli dicari, dan 47 bukti Majoo September dikonfirmasi bukan transaksi kanonis baru.

## Gate rilis mutlak (belum terpenuhi)

1. **Supabase Free dump tiga komponen** (`roles.sql`, `schema.sql`, `data.sql`) + SHA256 dan *restore test* terpisah selesai. Skrip operator: `scripts/p0_backup_hsn_supabase_free.ps1`. Konektor saat ini tidak menyediakan akses membuat backup/restore. **Belum dijalankan**.
2. Owner upload kembali workbook terisi + bukti fisik (dengan hak akses privat). Persetujuan tidak boleh dipalsukan atau diisi AI dari perkiraan.
3. Reconcile semua Purchase/Sales journals, `inventory_purchase_log` dan movement counts, lalu UAT role Owner/Staff pada staging data representatif.
4. Setelah release approver menyetujui, apply migrasi berurutan; jalankan guard rollback yang tidak menghapus histori, cek P0.1 active exposure tetap 0 dan P0.2 approved verification tidak menyentuh resep/Finance.

**Status:** kode dan tes P0.1 + P0.2 lengkap untuk kandidat UAT di branch. **Belum boleh disebut selesai operasional / live** karena backup+restore dan keputusan bukti Owner belum tersedia. **KEEP PR #88 DRAFT**.
