# Hasnaria — Forensic Purchase → Stock Evidence Recovery (11 October 2026)

**Status:** investigasi SELECT produksi + query audit privat dalam PR #88. **Tidak ada data bisnis diubah.**

## Temuan berdasarkan sumber asli

| Kelompok histori receipt yang kehilangan canonical Purchase UUID | Qty baris | Keterangan |
|---|---:|---|
| September 2026 | 47 | **47 cocok 1:1** dengan bukti faktur impor Majoo |
| Juli 2026 | 26 | Belum ada bukti impor yang cocok dalam `purchase_import_evidence` |
| Januari 2026 | 13 | Belum ada bukti impor yang cocok dalam `purchase_import_evidence` |
| **Total** | **86** | Semua log fisik dipertahankan |

**Lima atribut dicocokkan secara bersamaan:**
`purchase_date` + nama SKU ternormalisasi + `qty` + `unit` + `total_amount`, dengan `brand_id` yang sama.

Hasil query produksi:
- **47/47** orphan September cocok ke tepat satu `purchase_import_evidence`; 47 faktur berbeda masing-masing diklaim oleh satu receipt.
- 47 bukti sumber memiliki `source_record_key` asli dan berasal dari `Ekspor_Faktur_Pembelian_20_09_26_12_15.xlsx` dengan `source_type='majoo'`.
- Referensi `inventory_purchase_log.source_history_id` yang lama tetap **tidak ditemukan** di `offline_purchase_history`. Pasangan Majoo **bukan** pengganti UUID canonical Purchase, karena transaksi canon September yang aktif adalah sumber Pembelian berbeda (`HASNARIA_PURCHASE_UNIFIED_2026-09.xlsx`).
- **39** orphans lain memerlukan arsip nota/berkas asli Januari/Juli.
- Seluruh 86 orphan: **59** pada SKU dengan opname dan tanggal transaksi <= opname terakhir; **27** tidak punya baseline opname; **0** tercatat setelah baseline opname terakhir pada SKU yang tracked.
- Nilai `total_amount` pada 47 receipt historis September berjumlah **Rp25.252.172**. Ini nilai historis menurut data Majoo, **bukan** selisih jurnal Keuangan dan **tidak boleh dijumlahkan sebagai expense baru**. Nilai 139 canonical Pembelian September yang aktif adalah Rp5.967.145; dua sistem ini punya sumber/cakupan berbeda.

## Penanganan di aplikasi

Migrasi audit `supabase/migrations/20261011194500_private_orphan_receipt_evidence_triage.sql` menambahkan **private security-invoker view** `private.inventory_receipt_lineage_triage_v1` yang hanya menampilkan status pencocokan, tanpa DML, tanpa grant baru kepada anon/authenticated, tanpa mengubah canonical atau Stock receipt.

Status dalam audit:
- `MAJOO_EVIDENCE_UNIQUE_REVIEW_ONLY`: bukti faktur Majoo teridentifikasi unik dan **hanya** untuk pemeriksaan.
- `OTHER_EVIDENCE_UNIQUE_REVIEW_ONLY`: bukti unik bukan Majoo, review sumber wajib.
- `AMBIGUOUS_EVIDENCE_MANUAL_REVIEW`: banyak bukti identik atau key dipakai beberapa receipt, tidak boleh disahkan otomatis.
- `NO_EVIDENCE_MATCH`: butuh nota atau file asli.

**Jangan** menjalankan migrasi histori massal, memindahkan `source_history_id` ke UUID `purchase_import_evidence.id`, atau mencatat nilai bukti Majoo sebagai transaksi Finance baru. Source lineage valid memerlukan pemisahan bertipe `canonical_purchase` versus `external_factuur_evidence`, serta penerimaan Owner dan pencatatan jejak audit.

## Guard Owner Undo — kompatibilitas dengan aplikasi

Sebelumnya guard P0 memblokir semua penghapusan receipt terkait canonical, termasuk `owner_stock_review_undo_v1`. Itu akan merusak fitur pembatalan review yang semestinya diperbolehkan.

Diperbaiki melalui:
- `20261011190000_guard_purchase_receipt_verified_units.sql`: BEFORE DELETE mengizinkan **hanya** receipt `owner_source_review` dengan row review privat yang cocok (`log_snapshot`, brand, source, SKU), telah ditandai `reverted_at`, `reverted_by=auth.uid()`, alasan pembatalan memadai, dan pemanggil lolos `private.owner_stock_review_assert_v1()`.
- `20261011193000_owner_review_undo_guard_compat.sql`: fungsi resmi Owner kini menandai review reverted **sebelum** DELETE, setelah pemeriksaan snapshot, periode, konsumsi, dan fingerprint Finance. Semua terjadi dalam satu transaksi; kegagalan DELETE membatalkan seluruh perubahan.

`authenticated` tidak mempunyai hak UPDATE atas `private.purchase_stock_reviews` di database produksi. Fitur yang mengubah hak ini harus diuji ulang secara eksplisit.

## Gerbang penerapan

- PostgreSQL 17 CI menjalankan view dan migration, tes 5-field match, penggandaan/ambiguity, serta simulated private Owner undo.
- CI berisi data sintetis: **belum** menjalankan fungsi Owner undo penuh dengan autentikasi nyata/seluruh tabel produksi.
- **Belum ada backup database produksi yang dibuat** dan belum ada persetujuan Owner tentang kemasan, Satuan stok, atau pembacaan saldo baru.
- **Tetap Draft / jangan merge / jangan jalankan DDL di produksi** sampai rollback, backup dan UAT disetujui.
