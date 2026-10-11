# Hasnaria — P0.3 & P0.4 Acceptance / Source Gap

**Audit:** 11 Oktober 2026 · **Branch:** `fix/hsn-p0-purchase-stock-lineage-20261011` · **PR #88 Draft**.
Semua query produksi dikerjakan **SELECT-only**. Belum ada merge, staging UAT login Owner/Staff, atau migrasi produksi.

## P0.3 — Pembelian September, 32 + 33 sumber yang berbeda

**Penting:** 32 dan 33 adalah antrean **terpisah**. Mereka bukan 65 transaksi yang boleh langsung ditambahkan ke Stok.

| Grup sumber | Baris | Nilai | Perlakuan |
|---|---:|---:|---|
| Mapping `exact_name`/`inventory_alias` valid tetapi receipt belum posted | **32** | **Rp2.360.255** | Periksa satuan/faktor dan dampak opname per transaksi; Owner approval tidak otomatis mengubah stok |
| Dari 32: sebelum/pada opname | **18** | **Rp1.636.555** | Jangan re-posting saldo yang sudah bisa tercakup fisik |
| Dari 32: setelah opname | **7** | **Rp177.500** | Calon posting *hanya* setelah satuan, baseline, bukti dan idempotensi disetujui |
| Dari 32: tanpa baseline | **7** | **Rp546.200** | Harus ada opname/opening yang diverifikasi; jangan auto-posting |
| `unmatched` tidak ada SKU/rule | **32** | **Rp588.670** | Owner harus memilih SKU, Beban, nonstok, atau tunda |
| `ambiguous_inventory_name` | **1** | **Rp5.000** | `ES BATU`, 2 kandidat SKU; Owner harus tentukan, jangan tebak |
| **Total antrean mapping** | **33** | **Rp593.670** | Hanya keputusan dokumenter, belum memposting |

Per 11 Oktober, seluruh 32 transaksi siap-mapping memiliki **satuan sumber kosong**, sehingga aman **untuk tidak posting** sampai bukti kemasan/nota selesai. P0.2 telah menyiapkan verifikasi master dan sumber unit. Contoh dari 33: **TOKEN** (Rp203.500), **CETAK MENU** (4 baris Rp35.000), **RETRIBUSI CFD** (2 baris Rp6.000). Tidak semua adalah stok; khusus TOKEN dan retribusi sangat tidak tepat dijadikan otomatis stok barang.

### Kode P0.3

- `supabase/migrations/20261011234000_p03_owner_purchase_mapping_decisions.sql`: private RLS owner approval evidence, `MAP_EXISTING_SKU`/`CLASSIFY_EXPENSE`/`NOT_FOR_STOCK`/`HOLD_FOR_EVIDENCE`; snapshot token; proper brand validation; reference record protection; audit revoke/one-active.
- `supabase/migrations/20261011235000_p03_p04_owner_readiness_reports.sql`: `owner_p03_work_queue_v1` returns both 32 pending units and 33 unresolved mapping rows on a chosen month. **NO mapping-rule application, no receipt posting, no finance mutation.**
- `owner-p03-p04-reconciliation-v1.js`: Owner Pembelian → **Periksa rekonsiliasi** → **Mapping & satuan**, list kelompok, detail dan keputusan Owner berbukti, filter bulan, preview/apply/revoke without direct business writes.
- `supabase/rollback/20261011234000_pause_p03_owner_mapping_reviews.sql`: emergency pause Owner review writes, audit remains readable.
- Synthetic PostgreSQL regression: valid source, wrong token blocked, ambiguity, evidence-only approval, historical revoke, Staff/anon denied, Source/Stock untouched, emergency pause.

## P0.4 — Periode transaksi Oktober: missing source, not proven sync failure

Query READ-ONLY `supabase/tests/p03_p04_release_gate_read_only_20261011.sql` ran successfully on the Hasnaria production project:

| Bukti transaksi berperiode **Oktober 2026** | Hasil |
|---|---:|
| Penjualan `sales.sold_at` Oktober | **0** |
| Pembelian `offline_purchase_history.purchase_date` Oktober | **0** |
| Faktur `purchase_import_evidence.purchase_date` Oktober | **0** |
| Sales batches `period_from/to` mencakup Oktober | **0** |
| Sales import jobs mencakup Oktober | **0** |
| Purchasing import jobs mencakup Oktober | **0** |

**Bukti impor yang dibuat pada 1 Oktober, bukan transaksi Oktober:**
- 1 purchasing import job **completed** untuk **September**, `rows_total=288,rows_posted=288`, tetapi canonical Purchase September adalah 139 baris: job `rows_posted` tidak boleh dianggap hitungan transaksi kanonis satu banding satu.
- 1 sales import job **staged** untuk **September**, `rows_total=641,rows_posted=0`; terpisah ada **1 sales batch September completed dan 1 failed**, masing-masing `row_count=641`.
- Tabel `sales` sudah memiliki 641 transaksi September dan 641 jurnal Keuangan September. Failed batch September bukan bukti kegagalan impor Oktober; perlu audit historis tersendiri jika ingin menutup status batch.
- Tidak ditemukan file Oktober yang relevan dalam pencarian Library/Google Drive yang tersedia saat audit. Ini tidak membuktikan file tidak ada di tempat lain.

### Kode P0.4

- `private.owner_p04_import_readiness_v1(date)` menghitung SOURCE BUSINESS MONTH dari `sold_at/purchase_date`, serta membandingkan periode `import_jobs` dan `sales_import_batches` terhadap bulan yang dipilih. Tanggal `created_at` (misalnya 1 Oktober) **tidak** dipakai untuk menyimpulkan periode transaksi.
- Status yang eksplisit: `NO_SOURCE_UPLOAD_FOUND`, `UPLOAD_ATTEMPT_NO_CANONICAL_DATA`, `PRESENT_IN_CANONICAL`. Indikator batch gagal tetap ditampilkan terpisah.
- UI Owner pada Pembelian → **Periksa rekonsiliasi** → **Kelengkapan periode**: pilih bulan (default Oktober pada Oktober 2026) dan tampilkan tindakan yang diperlukan. Tidak ada transaksi fiktif atau upload otomatis.

### Ketentuan menutup P0.4 secara operasional

Owner harus mendapatkan **file export Majoo Penjualan Oktober** dan **file Pembelian Oktober yang asli**, memverifikasi tanggal bisnis, dan mengunggah lewat menu impor normal (sesuai governance). Setelah itu:
1. Database menunjukkan transaksi berdasarkan tanggal bisnis Oktober, bukan tanggal unggah.
2. Jumlah dan nilai Pembelian/penjualan cocok dengan file asal dan jurnal, serta tidak ada batch gagal aktif yang menghalangi.
3. Uji idempotensi reload dan hak akses Owner/Staff. Jangan mengganti sumber September agar terlihat menjadi Oktober.
4. Jika file sumber belum ada, tampilkan **BELUM ADA IMPOR SUMBER OKTOBER**. Jangan mengklaim sinkronisasi error jika belum ada upload.

### Rilis P0.3/P0.4

**Teknis (branch):** migration dan UI dibuat, PHPUnit? tidak — tes JavaScript/Node + PostgreSQL 17 synthetic; semuanya harus lulus pada HEAD terbaru sebelum rilis. Backup restorable dan staged authenticated UAT masih wajib.

**Data nyata:** P0.3 belum bisa closed hingga 32 bukti satuan & keputusan 33 mapping ditandatangani Owner dan posting pasca-opname dilakukan dengan mekanisme transaksi terotorisasi yang tidak menggandakan saldo; P0.4 belum bisa closed hingga source October yang sesungguhnya diunggah, diverifikasi, dan direkonsiliasi.
