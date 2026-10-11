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


## E. Urutan verifikasi fisik SKU yang benar-benar berdampak (audit read-only baru)

Dari **80** master SKU yang masih menggunakan satuan sementara `purchase_unit`, hanya **14 SKU** yang terkait alur aktif/historis yang harus diamankan terlebih dahulu. **66 SKU lainnya** pada saat audit tidak memiliki tracking aktif, receipt, BOM aktif, ataupun Pembelian kanonis September yang sedang tertunda. Jangan lakukan mass-update pada 80 SKU.

| Nama SKU | Temuan | Gate Owner |
|---|---|---|
| SIRUP MELON | Pembelian September pending dan receipt historis | Master unit wajib ditetapkan sebelum approval dan posting |
| NORI | Komponen resep aktif | Satuan master perlu cocok dengan takaran pemakaian sebenarnya |
| BUMBU ODENG | Tracking aktif dan receipt historis | Pastikan baseline opname dan unit |
| BUMBU TOMYUM | Tracking aktif dan receipt historis | Pastikan baseline opname dan unit |
| BINTANG | Tracking aktif | Verifikasi master terhadap stok fisik |
| CONE | Tracking aktif | Verifikasi PCS/boks per kemasan |
| SAUS SACHET PEDAS | Tracking aktif | Verifikasi jumlah sachet dan satuan stok |
| CUP 12 OZ | Receipt historis | Verifikasi stok unit tanpa menulis ulang receipt |
| CUP 16 OZ | Receipt historis | Verifikasi stok unit tanpa menulis ulang receipt |
| CUP 8 OZ | Receipt historis | Verifikasi stok unit tanpa menulis ulang receipt |
| ICE CREAM | Receipt historis | Verifikasi ukuran kemasan, pail/porsi sesuai produk |
| MIE KOREA | Receipt historis | Verifikasi unit/pack |
| PLASTIK 1 KG | Receipt historis | Verifikasi unit bukti supplier |
| SIRUP COCOPANDAN | Receipt historis | Verifikasi liter/ml/botol dan konversi |

**Kebijakan rilis:** dari 14 ini, SIRUP MELON, NORI dan 5 tracked aktif diprioritaskan untuk mencegah gangguan saldo/penjualan. SKU dengan histori saja tetap butuh review sebelum riwayat lama di-replay. SKU lain yang belum terkait alur inventori dapat dikelola bertahap; **tidak boleh otomatis dikonversi**.

### F. Isolasi resep/BOM dari verifikasi faktor kemasan

Migrasi tambahan `supabase/migrations/20261011223000_owner_conversion_no_recipe_bom.sql` (hanya branch) menonaktifkan jalur lama yang tanpa sengaja mengubah `inventory_recipe_components.qty_per_sale` menjadi `1 / units_per_purchase_unit`. Mengubah faktor kemasan **tidak boleh** otomatis membuat/mengaktifkan/menimpa BOM.

- Fungsi ERP `resolve_inventory_conversion` tetap memakai antarmuka yang sama namun mengharuskan Owner, bukti kemasan/nota, audit alasan dan kecocokan satuan master. **Tidak ada Stock movement atau Finance DML.**
- Trigger validasi `security invoker` memastikan penanda transaksi `set_config` **tidak dapat dipalsukan oleh pengguna** untuk memaksa VERIFIED. Pengujian menggunakan role `authenticated` sungguhan pada PostgreSQL fixture membuktikan UPDATE dan INSERT VERIFIED dengan marker palsu ditolak.
- Kunci transaksi per `brand_id + inventory_item_id` dan unique partial index VERIFIED mencegah dua persetujuan bersamaan menghasilkan faktor verified berkonflik.
- Tetap dibutuhkan persetujuan Owner terhadap angka fisik. **Tidak ada aturan produksi yang otomatis dinaikkan dari draft menjadi verified.**

**Hasil tes otomatis:** GitHub Hasnaria Audit Gate **#1600** (Postgres integration + JS/build static audit) sukses. Seluruh perubahan ini belum diterapkan ke Supabase produksi. Real backup/restoration dan UAT akun Owner+Staff masih diperlukan sebelum merge.
