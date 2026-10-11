# Hasnaria — Tahap 0 dan P0 Prioritas 1: Baseline dan Pengamanan Ledger

Tanggal audit produksi: **11 Oktober 2026, 06:24 UTC (13:24 WIB)**.  
Status: **CHECKPOINT TERUKUR, BELUM BACKUP RESTORABLE, BELUM LIVE MIGRATION**.

## A. Snapshot checksum (read-only, BUKAN backup)

Query: `supabase/tests/p0_stage0_baseline_checksum_read_only_20261011.sql`.  
Metode: `md5(string_agg(row_to_json(row)::text, '\n' ORDER BY id::text))`.
Hanya untuk mendeteksi *drift* setelah perubahan; bukan bukti kriptografis terhadap penyerang, dan **tidak dapat merestorasi data yang hilang**.

| Tabel | Baris | Checksum baseline |
|---|---:|---|
| `inventory_items` | 198 | `838edb431cf7bd200fec4a44c71478a7` |
| `inventory_movements` | 8.590 | `b25210a0ee5ffbb880ec8a03ea76068d` |
| `inventory_purchase_log` | 703 | `e08dde40e12e96cd37727dfcd96bc7cd` |
| `inventory_stock_opname` | 194 | `44a82f525c861b25b2aed9a361da45ee` |
| `offline_purchase_history` | 1.059 | `b7964cea6ecafec3e13f2d654da708e1` |
| `purchase_import_evidence` | 232 | `fd1bbd66c4e2ef8bb46be2cae0223953` |

These checkpoints reflect the state **at the captured timestamp**. Subsequent legitimate user imports may change them. If comparing after deployment, reconcile each business event since this timestamp; do not blindly roll back user data because a checksum differs.

## B. Status orphan historis (produksi, SELECT-only)

| Bulan sumber receipt | Terputus | Dengan opname dan receipt sebelum/pada opname | Tanpa baseline opname |
|---|---:|---:|---:|
| Januari 2026 | 13 | 7 | 6 |
| Juli 2026 | 26 | 12 | 14 |
| September 2026 | 47 | 40 | 7 |
| **Total** | **86** | **59** | **27** |

- Semua **86 orphan receipts** punya tepat **1** movement `PURCHASE_RECEIPT` yang terhubung ke receipt UUID, bukan ke canonical Purchase UUID.
- **0** orphan receipt atau movement itu terjadi sesudah baseline opname terakhir pada tracked SKU, sehingga **0** sedang memengaruhi saldo *aktif* pada ledger yang berbasis opname.
- **703/703** receipt memiliki tepat satu movement; **0** movement terlepas, **0** mismatched SKU/date/qty, **0** movement ganda (teramati pada saat audit).
- Untuk 27 tanpa baseline, stok yang tampil tidak sedang bergantung pada movement tersebut karena ledger hanya mengaktifkan pergerakan sesudah opname. Namun **ini bukan jaminan stok fisik benar**. Pemilik proses harus meninjau fisik sebelum mengaktifkan tracking.
- Nilai histori receipt Majoo September (**Rp25.252.172**) adalah nilai bukti receipt lama, **tidak boleh dijumlahkan lagi** ke jurnal Pembelian September Rp5.967.145.
- Bukti Majoo faktur 47/47 match unik 1:1 (tanggal, nama/SKU, kuantitas, satuan, nilai). Ini hanya bukti eksternal, bukan sumber canonical baru. 39 receipt Januari/Juli belum mempunyai bukti faktur tersimpan.

## C. Pengamanan baru yang ditambahkan (PR #88 saja)

- `supabase/migrations/20261011110000_guard_purchase_stock_source_lineage.sql`: menahan source replacement yang akan merusak receipt aktif; belum terpasang di produksi.
- `supabase/migrations/20261011190000_guard_purchase_receipt_verified_units.sql`: menolak receipt dari source invalid/unverified, mengunci relink/update/delete yang tidak resmi.
- `supabase/migrations/20261011194500_private_orphan_receipt_evidence_triage.sql`: memetakan kandidat bukti faktur secara read-only dengan cardinality check.
- **Baru:** `supabase/migrations/20261011210000_private_orphan_active_ledger_gate.sql`: view PRIVATE read-only, memeriksa setiap receipt orphan terhadap movement sebenarnya dan baseline opname; status `BLOCK_RELEASE_ACTIVE_ORPHAN` atau `BLOCK_RELEASE_RECEIPT_MOVEMENT_MISMATCH` untuk kegagalan, status historis untuk row yang tidak memberi dampak saat ini.
- **Baru:** `tests/fixtures/p0-postgres-orphan-ledger-exposure.sql`: regression test terhadap kondisi tanpa opname, opname setelah receipt, opname sebelum receipt (*wajib gagal rilis*), missing movement (*wajib gagal*), duplicate movement (*wajib gagal*), dan perlindungan read access. Seluruh manipulasi kasus tepi berjalan hanya dalam transaksi yang di-ROLLBACK pada database CI disposable.
- **Baru:** `supabase/tests/p0_stage0_baseline_checksum_read_only_20261011.sql`: ulangi fingerprint tabel inti pada checkpoint sebelum/sesudah release.

## D. Release gate: ketentuan sebelum perbaikan data produksi

1. **BACKUP:** manual dump schema/data/roles Supabase Free **dan uji restore pada DB terpisah**; status **BELUM**. Checksum bukan backup. Pertahankan backup dokumen/foto di Storage secara terpisah.
2. **SOURCE VALIDITY:** semua source-linked receipt baru harus punya canonical UUID valid; guard sumber + guard receipt sudah diuji pada PostgreSQL disposable.
3. **ACTIVE ORPHAN EXPOSURE:** jalankan query/view audit. Setiap orphan baru setelah opname terakhir atau movement rusak = **STOP** dan investigasi. Pada baseline 11 Oktober hasil 0.
4. **HISTORY:** simpan 86 receipt + movement apa adanya sampai owner menyetujui koreksi dengan snapshot dan referensi faktur; **jangan hapus/reimport/rebind massal**.
5. **FINANCE:** 139/139 transaksi/jurnal Pembelian September, nilai Rp5.967.145, delta Rp0; 641/641 Penjualan September (baseline dari preflight).
6. **LIVE UAT:** setelah backup, audit Owner/Staff pada staging representatif dan siapkan rollback yang tidak menghapus bukti audit.

### Keputusan audit

**Secara pengukuran saat ini, target "tidak ada ledger aktif yang bergantung pada sumber Pembelian tidak valid" telah tercapai (0 exposure) tanpa mutasi data.**  
**Namun P0 nomor 1 belum closed/deployed** karena belum ada backup restorable, 86 UUID sumber lama belum dikoreksi secara terotorisasi, dan guard pencegahan masih Draft di PR #88. Prioritas berikutnya tetap pengamanan deployment yang valid, bukan mengarang rebind Purchase histori.

Lihat `docs/P0_RELEASE_UAT_AND_ROLLBACK_RUNBOOK_2026-10-11.md` untuk urutan backup, review, UAT, approval dan monitoring.
