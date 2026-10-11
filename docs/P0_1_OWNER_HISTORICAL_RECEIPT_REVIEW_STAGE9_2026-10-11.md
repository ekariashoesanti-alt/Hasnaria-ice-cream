# Hasnaria P0.1 — Alur Audit Owner untuk 86 Referensi Pembelian Historis

**Tanggal:** 11 Oktober 2026  
**Branch:** `fix/hsn-p0-purchase-stock-lineage-20261011` / PR #88 (Draft)  
**Status:** Uji integrasi PostgreSQL sintetis lulus; belum diaktifkan pada Supabase produksi.

## Mengapa histori tidak boleh direkonstruksi otomatis

Ada 86 penerimaan Stok yang masih menyimpan `source_history_id` Pembelian lama namun UUID kanonisnya tidak lagi ada. Per 11 Oktober:
- **47 September** mempunyai pasangan unik 1:1 bukti eksternal Majoo; faktur eksternal **bukan** baris Pembelian kanonis yang boleh dibuat otomatis.
- **26 Juli + 13 Januari = 39** belum mempunyai bukti faktur asal yang sama-sama meyakinkan.
- **59** berada sebelum/pada opname SKU, **27** tidak mempunyai baseline opname. Seluruh **86** memiliki movement penerimaan masing-masing; **0** ditemukan berdampak pada saldo aktif setelah opname, **0** movement hilang/duplikat.
- Jangan menyisipkan baris Purchase baru, menghapus/menautkan ulang receipt UUID, mengubah ledger Stock, atau menambah jurnal Keuangan hanya untuk menghilangkan penanda orphan.

## Implementasi Stage 9 dalam PR #88

| Lokasi | Perubahan |
|---|---|
| `supabase/migrations/20261011230000_owner_orphan_receipt_evidence_reviews.sql` | Tabel RLS privat dengan bukti Owner, review snapshot, keputusan, histori revoke, satu review aktif per receipt |
| `private.owner_orphan_receipt_queue_v1` | Antrean lintas periode, membedakan bukti unik, dokumen belum ada, status integritas, dan keputusan terdokumentasi |
| `private.owner_orphan_receipt_preview_v1` | Validasi Owner+brand, integritas movement dan opname, status unik/ambigu; token snapshot mencakup sumber/bukti/qty/tanggal/nilai |
| `private.owner_orphan_receipt_apply_v1` | Simpan keputusan audit, bukti, alasan dan identitas pemeriksa; menolak stale preview, approval ganda, tanpa Stock/Finance write |
| `private.owner_orphan_receipt_revoke_v1` | Batalkan persetujuan dengan alasan dan jejak histori; tidak menghapus baris lama |
| `public.owner_orphan_receipt_*_v1` | Empat wrapper untuk RPC yang tetap memverifikasi Owner server-side; anon tidak memiliki EXECUTE |
| `owner-orphan-receipt-review-v1.js` + `index.html` | Antrean review khusus Owner di tab **Pembelian → Tinjau ledger lama**, filter periode historis, preview, save, revoke; UI tidak memiliki jalur mutasi Purchase/Stock/Finance |
| `supabase/rollback/20261011230000_pause_owner_orphan_receipt_reviews.sql` | Pause INSERT review dan revoke, sementara queue baca serta histori bukti tetap ada |
| `tests/fixtures/p0-postgres-owner-orphan-*.sql` | Simulasi faktur unik, faktur duplikat/ambigu, token salah, approval ganda, revoke, Staff/anon tanpa akses, emergency pause |

### Keputusan Owner yang tersedia

- **CONFIRM_EXTERNAL_EVIDENCE:** hanya untuk receipt dengan **satu** kandidat faktur eksternal unik berdasarkan tanggal, SKU/nama, qty, satuan dan nominal; Owner tetap wajib mengecek dokumen aslinya dan menyimpan referensi bukti. Ini bukan tautan Purchase baru.
- **REQUEST_ORIGINAL_SOURCE:** bila tidak ada bukti cocok atau kandidat ambigu, minta faktur sumber lama dan simpan status pekerjaan. Tidak menghapus histori.
- **KEEP_HISTORICAL_AUDIT:** dokumentasikan alasan mengapa receipt dipertahankan sebagai riwayat untuk review lanjutan. Tidak menganggap fisik Stok sudah diverifikasi.
- **Revoke:** bila Owner menemukan kesalahan pada keputusan, pembatalan dicatat dengan alasan, dan antrean kembali membutuhkan review.

Semua keputusan adalah **dokumentasi**, bukan close-out otomatis: ledger lama tetap mempunyai UUID sumber terputus dan akan muncul dalam audit sumber. Status resolusi per receipt dapat dinilai selesai secara operasional hanya berdasarkan bukti/pengecualian tertulis yang disetujui Owner.

### Hak akses dan keamanan

1. Tabel review berada dalam schema `private`, RLS aktif, tanpa GRANT baca/tulis langsung untuk `anon` maupun `authenticated`.
2. Fungsi PRIVATE `SECURITY DEFINER` mengharuskan `private.owner_stock_review_assert_v1()`, memastikan user Owner aktif serta brand-nya.
3. Semua modifikasi review dilakukan melalui snapshot/token dengan advisory lock per receipt dan UNIQUE satu approval aktif.
4. Jika receipt memiliki movement rusak, source menjadi aktif setelah opname, atau faktur ambigu hendak dikonfirmasi sebagai cocok, operasi ditolak di server.
5. Selama migrasi belum diterapkan, UI preview tidak dapat menyimpan review. Produksi `main` tetap memakai modul lama.

## UAT Owner/Staff yang belum terpenuhi

Di staging **setelah** backup/restorable restore tervalidasi:

1. Owner membuka Pembelian → **Tinjau ledger lama**, melihat 86 receipt sesuai tiga bulan histori.
2. Meninjau 47 kandidat faktur Majoo **satu per satu**, mencocokkan dokumen aslinya dan memasukkan reference + alasan min. 30 karakter. Jangan isi otomatis.
3. Mencatat permintaan dokumen/pengecualian bertanda tangan untuk 39 receipt tanpa faktur.
4. Menguji pembatalan keputusan dan melihat riwayat audit tersimpan.
5. Staff dan anonim tidak dapat mengakses queue maupun memanggil RPC apply/revoke langsung.
6. Periksa total receipt 703, movement 703, status active orphan 0, jurnal Pembelian 139/139 dan Penjualan 641/641 tidak berubah.
7. Pastikan tampilan ponsel, pergantian tab, periode, modal, dan input tetap nyaman, dengan tidak membuat refresh Pembelian mengubah data yang sedang diisi.

**Rilis ditahan:** Supabase Free restorable backup dan UAT login Owner/Staff nyata belum dilaksanakan. Vercel Preview terbaru ditolak karena **build-rate limit akun** (bukan pengujian aplikasi); jangan mengklaim Preview ini lulus. CI otomatis **#1640 SUCCESS** (uji PostgreSQL + audit kode).

## Status P0.1/P0.2

- P0.1: alat keamanan dan alur audit Owner telah siap sebagai kandidat UAT, namun 86 keputusan riil belum dibuat, 39 masih butuh pembuktian atau pengecualian historis Owner. Tidak ada pemulihan data fiktif.
- P0.2: pengamanan verifikasi satuan dan isolasi BOM dari faktor kemasan telah diuji; 14 SKU master prioritas dan 25 aturan draft masih menunggu bukti fisik Owner.
- **Status akhir:** PR Draft; **NO MERGE / NO PRODUCTION MIGRATION** sampai backup+restore, approval asli dan UAT selesai.
