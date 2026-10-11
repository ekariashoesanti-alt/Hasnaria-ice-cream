# Hasnaria — P0 Prioritas 2: Mapping SKU & Konversi Satuan
**Tanggal:** 11 Oktober 2026 — produksi SELECT-only  
**Status:** Perbaikan di PR #88. Belum diterapkan ke produksi. Jangan mengubah nilai Stok/Finance.

## A. Hasil audit produksi terverifikasi

File SQL produksi READ-ONLY: `supabase/tests/p0_unit_conversion_live_audit_read_only_20261011.sql`.

| Masalah/indikator | Data | Dampak |
|---|---:|---|
| SKU master bersatuan `purchase_unit` (placeholder) | **80 dari 198** | Satuan stok tidak sah/terinci; wajib verifikasi master sebelum posting |
| SKU master `pcs` | 53 | Bukan bukti bahwa 1 `pack` = 1 `pcs` |
| SKU master `porsi` | 48 | Tidak boleh auto diasumsikan = `pcs` atau gram |
| SKU master `gram` | 4 | Harus cocok kemasan/berat sebenarnya |
| SKU master `ml` | 3 | Harus cocok ml per botol/pack |
| SKU master lainnya | cup 7, galon 1, pack 1, pail 1 | Setiap satuan harus sesuai produk |
| Aturan `needs_verification` | **25 baris / 23 SKU** | Faktor adalah angka usulan, bukan izin posting |
| Aturan `verified` | **3 baris / 3 SKU** | Gunakan hanya jika source unit dan master unit cocok |
| Duplikat aturan draft persis per SKU/unit | **2 pasang** | NATA DE COCO (pack→gram:1000), SPRITE (botol→ml:390); perlu telaah, jangan dianggap dua persetujuan |
| Master unit bertentangan dengan target aturan | **1 SKU** | BAKSO AYAM master `pack`, aturan `pack→pcs:36` belum diverifikasi |
| Unit canonical Purchase September kosong | **139/139** | Tidak ada bukti unit pembelian per transaksi |
| Sudah ada linked Stock receipts September | 41 | Histori ini **tidak boleh ditulis ulang** |
| Pending siap-mapping tetapi unit kosong | **32** | 25 exact-name + 7 alias; semuanya harus melalui verifikasi satuan dan audit opname |
| Butuh mapping SKU manual September | **33** | 32 unmatched + 1 ambiguous; **tidak otomatis dianggap transaksi Stok** |

Semua 32 pending masih senilai **Rp2.360.255** dan terbagi:
- 18 transaksi / Rp1.636.555 sebelum/pada opname terbaru → tidak diposting ulang.
- 7 transaksi / Rp177.500 sesudah opname → calon posting hanya setelah verifikasi fisik.
- 7 transaksi / Rp546.200 tanpa baseline opname → wajib baseline/perlakuan opening resmi dahulu.
- 1 dari 32 (SIRUP MELON) langsung diblokir karena unit master masih `purchase_unit`.

## B. Satuan & konversi yang boleh dipakai

Tidak ada faktor konversi universal antara **gram, pack, buah, porsi, PCS**. Contoh:
- `1 pack → ? pcs`: harus sesuai isi kemasan produk yang benar (bisa 12/20/25/40, tidak boleh ditebak).
- `1 pack → ? gram`: harus sesuai berat produk tercetak atau ditimbang (jangan mengisi 1000 otomatis).
- `1 buah ↔ 1 pcs`: dapat dipertimbangkan sebagai padanan hanya jika SKU dan bukti menyatakan unit per item satuan; jangan otomatis terhadap seluruh data.
- `porsi ↔ pcs / gram`: memerlukan resep/standar berat per porsi yang disetujui; bukan sinonim satuan.
- `BAKSO AYAM`: Master `pack` vs target `pcs` **harus diputuskan oleh Owner lebih dulu**, kemudian aturan tepat disesuaikan secara terotorisasi. Jangan memaksa angka `36` yang masih draft.
- `NATA DE COCO` dan `SPRITE`: duplikasi aturan belum menambah stok, tetapi jangan ditandai verified massal.

## C. Yang telah diprogram (PR Draft)

1. `supabase/migrations/20261011220000_private_purchase_unit_mapping_triage.sql` menambahkan dua **view privat read-only**, security-invoker dan tanpa akses langsung Staff/anon:
  - `private.inventory_unit_conversion_triage_v1` mendeteksi master-unit conflict, dua verified rules, faktor berbeda, duplikasi draft, placeholder dan status belum diverifikasi.
  - `private.purchase_unit_mapping_gate_v1` menandai sumber Pending/Posted, konversi yang sah, satuan sumber kosong, placeholder dan konflik master.
2. Memperkuat `owner_purchase_unit_preview_v1`: tolak master yang bertentangan dengan sale-unit aturan, dua konversi verified untuk satu unit, dan faktor manual yang berbeda dari faktor verified. Token preview kini mengikat snapshot status/isi **semua aturan konversi SKU** serta inventory mapping/status; setelah ada perubahan rules, Owner harus preview ulang.
3. UI Owner `purchase-finance-alignment-v1.js` menampilkan **Perbaiki satuan master** jika master masih placeholder, tidak memunculkan form persetujuan unit pada item tersebut, dan tetap membedakan verifikasi dokumen dengan posting.
4. `tests/fixtures/p0-postgres-unit-mapping-triage.sql` menjalankan kasus safe/blocked secara isolasi dan me-`ROLLBACK` simulasi master conflict, duplikat verified, duplikat draft, dan placeholder. Tes ini **tidak menulis produksi**.
5. `tests/purchase-stock-lineage-guard.test.js` menguji keamanan SQL SELECT-only/private view dan UI blocked master.

## D. Gate operasional Owner agar P0 #2 ditutup

Sebelum rilis produksi:
- [ ] Backup Supabase Free sudah selesai dan **restore test berhasil** di database terpisah; backup Storage foto/nota dilakukan bila ada.
- [ ] Owner memeriksa seluruh **80 placeholder** untuk menentukan SKU yang benar-benar dipantau dan satuan masternya. Tidak semua harus diaktifkan sekaligus tanpa opname.
- [ ] Owner verifikasi dan tandatangani faktor **25 aturan draft**, khusus konflik BAKSO AYAM dan duplikasi NATA DE COCO / SPRITE.
- [ ] Owner/Staff terautentikasi menjalankan UAT Stage 4 di staging (termasuk tab Pembelian dan pengecekan Stock setelah UAT).
- [ ] Bukti invoice/kemasan sumber untuk **32 pending** disimpan terpisah sebagai data dokumentasi, bukan jurnal baru.
- [ ] **33 mapping belum selesai** harus diputuskan Inventory / Expense / Not Stock per sumber. Dilarang paksa semuanya ke Stock.
- [ ] Posting setelah opname dan dampak finansial ditangani di P0 #3 secara terpisah; tidak ada auto-add saldo dari verifikasi satuan.

**Keputusan:** unit mapping verification code berada di tahap siap diuji. P0 #2 **belum boleh ditandai selesai produksi** sampai Owner menyetujui master+konversi, backup+UAT terpenuhi dan migration deployment terotorisasi.
