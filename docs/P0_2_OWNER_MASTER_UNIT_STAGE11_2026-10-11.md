# Hasnaria — Stage 11: Verifikasi Owner terhadap Satuan Master SKU

**11 Oktober 2026 · PR #88 (Draft) · Produksi tidak diubah**

## Kenapa tahap tambahan ini dibutuhkan

Verifikasi konversi `pack → pcs/gram/ml` tidak berguna bila SKU tujuan masih memakai placeholder `purchase_unit`. Sebelum tahap ini, Owner sudah mempunyai fitur verifikasi satuan transaksi Pembelian dan faktor konversi, tetapi **belum memiliki proses aman untuk mencatat satuan MASTER SKU yang disahkan**. Mengedit `inventory_items.unit` langsung berpotensi salah menafsirkan opname, pemakaian resep/BOM, dan histori receipt dengan satuan lama.

### Hasil audit produksi SELECT-only

| Indikator | Jumlah |
|---|---:|
| Seluruh SKU Hasnaria | 198 |
| Master SKU bersatuan `purchase_unit`/kosong | **80** |
| Memiliki kaitan nyata dengan receipt, tracking, resep aktif atau Purchase pending | **14** |
| Belum terkait dengan empat jalur di atas | **66** |
| SKU placeholder dengan Pending Pembelian | **1** — SIRUP MELON |
| SKU placeholder dengan resep aktif | **1** — NORI |

**14 SKU prioritas:**
BINTANG, BUMBU ODENG, BUMBU TOMYUM, CONE, CUP 12 OZ, CUP 16 OZ, CUP 8 OZ, ICE CREAM, MIE KOREA, NORI, PLASTIK 1 KG, SAUS SACHET PEDAS, SIRUP COCOPANDAN, SIRUP MELON.

Daftar ini tergantung status produksi saat dibaca. Jika produk baru diaktifkan/receipts diimpor, query akan memperbarui prioritas; jangan mengambil angka 14 sebagai kuota permanen.

## Implementasi dalam branch

1. **`supabase/migrations/20261011233000_owner_master_unit_evidence_review.sql`**
   - Private `inventory_master_unit_attestations_v1` dengan RLS, tanpa akses tabel langsung Staff/anon.
   - Owner `owner_master_unit_queue_v1(boolean)` mengembalikan SKU aktif yang masih placeholder. Opsi `p_critical_only=false` menampilkan seluruh placeholder.
   - Preview membaca master SKU saat ini, opname terakhir, jumlah movement/receipt, komponen resep aktif, Purchase pending serta seluruh katalog aturan konversi SKU. Snapshot ditandatangani token; perubahan objek di antara preview dan simpan meminta preview ulang.
   - Keputusan: `DOCUMENT_UNIT` (berdasarkan bukti satuan nyata), `HOLD_FOR_EVIDENCE` (tunggu bukti), `NOT_FOR_STOCK` (keputusan Owner bahwa barang tidak perlu tracking, **tidak otomatis mematikan tracking**).
   - Apply menyimpan catatan Owner, bukti dan alasan dengan locking serta satu keputusan aktif per SKU. Revoke menjaga histori bukti sebelumnya.
   - **Tidak ada UPDATE ke `inventory_items.unit`, tidak membuat/mengubah movement, receipt, opening, opname, BOM atau Finance.**

2. **`owner-master-unit-review-v1.js`** tampil pada halaman Pembelian untuk Owner: tombol **Periksa SKU prioritas**, filter 14 prioritas versus seluruh placeholder, informasi ketergantungan, pilihan keputusan, isian bukti, preview, simpan dan batalkan. Client tidak memiliki jalur mutasi tabel bisnis langsung; hak Owner diverifikasi ulang di server.
3. **`tests/fixtures/p0-postgres-owner-master-unit-attestations.sql`** menggunakan SKU sintetis prioritas dengan resep aktif, SKU tanpa dependensi, input placeholder ditolak, snapshot/master berubah ditolak, token palsu ditolak, duplikat review ditolak, revoke mempertahankan audit dan tidak ada perubahan Stok/BOM. Seluruh fixture berjalan dalam transaksi yang di-**ROLLBACK** dan tidak mencemari baseline regresi lama.
4. Perluasan `tests/fixtures/p0-postgres-owner-unit-roles.sql`: Staff, logged-out dan anonymous dilarang mengakses Owner master-unit queue/approval. Pengujian statis memastikan SQL dan UI tidak mengubah tabel bisnis.
5. **GitHub Audit Gate #1672 SUCCESS**, Postgres integration dan static-audit lulus pada commit `e9b74a32cb8be08a635121d0e23813487d7668b8`.

## Mekanisme penyelesaian Owner (setelah aman rilis)

| Langkah | Tindakan Owner | Akibat ke produksi |
|---|---|---|
| 1 | Mulai dari 14 SKU prioritas, pilih berdasarkan apakah tracked, receipt, resep aktif atau pembelian pending | Baca saja |
| 2 | Periksa kemasan/bahan dan bukti nota/foto atau pengukuran fisik | Di luar sistem |
| 3 | `DOCUMENT_UNIT` dengan unit spesifik dan referensi bukti; atau `HOLD_FOR_EVIDENCE` / `NOT_FOR_STOCK` dengan alasan yang sah | Catatan audit privat saja |
| 4 | Pastikan untuk setiap SKU bersatuan baru, receipt lama, movement, opname dan kuantitas resep mempunyai kebijakan rekonsiliasi eksplisit | Belum ada perubahan |
| 5 | Hanya setelah backup dan restore, implementasi migrasi **master-unit apply yang terpisah** dengan review DBA dan kontrol snapshot historis | **Belum diimplementasikan / belum diizinkan** |
| 6 | Verifikasi ulang Purchases 139/139, Sales 641/641, Stock 703/703 serta tidak ada receipt tanpa source baru | Gate rilis |

Keputusan fisik tidak dapat dibuat oleh AI dari angka `units_per_purchase_unit` lama saja. Khusus **NORI** resep aktif, **SIRUP MELON** Pembelian pending, dan **BUMBU ODENG/TOMYUM** yang tracking aktif, perubahan master wajib mempertimbangkan efek historis sebelum diterapkan.

## Status akhir

- Kode review dan tes simulasi siap pada branch.
- 14/80 **belum disetujui Owner**; catatan baru belum ada di produksi.
- Data produksi dan existing unit belum diubah.
- Backup restorable + uji Auth/staging belum ada.
- **P0.2 masih OPEN sampai bukti fisik disetujui, diimplementasikan secara terkontrol dan UAT berhasil.** Jangan merge/deploy PR sebelum gate tersebut.
