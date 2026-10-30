# HASNARIA — Audit Perhitungan Stok dari Data Eksisting

**Tanggal pemeriksaan:** 30 Oktober 2026 · **Cakupan:** produksi Supabase `bnnhmtkpdjlgehsvgoda`, brand Hasnaria.  
**Pembatas:** tidak menambah data mentah, tidak menyetujui BOM, tidak memposting penjualan/pembelian baru, tidak mengubah/menghapus riwayat. Semua pemeriksaan menggunakan SELECT terhadap sumber yang sudah masuk.

## Rumus tunggal

`SALDO SISTEM (SKU) = HASIL OPNAME FISIK TERAKHIR + PENERIMAAN YANG SUDAH DIPOSTING SETELAH TANGGAL OPNAME - PEMAKAIAN PENJUALAN YANG SUDAH DIPOSTING SETELAH TANGGAL OPNAME + GERAKAN SAH LAIN SETELAH OPNAME`

Jenis `BASELINE` dan `OPNAME_CORRECTION` tidak dijumlahkan lagi setelah baseline opname untuk mencegah perhitungan ganda. Karena sumber saat ini hanya memakai tanggal (bukan waktu transaksi/opname yang terverifikasi), movement **pada hari opname** tidak dianggap otomatis sebelum atau sesudah opname, melainkan ditandai untuk audit. Untuk 157 SKU tanpa opname yang disahkan, `opening_qty` dari master diperlakukan **provisional**, bukan stok fisik yang tervalidasi.

## Pemeriksaan independen terhadap 198 SKU

| Pengujian | Hasil |
| --- | ---: |
| Master SKU | 198 |
| SKU dengan stok fisik awal terdaftar | 41 |
| SKU tanpa stok fisik awal | 157 |
| Perhitungan ulang independen berbeda dari saldo view ledger | **0 dari 41** |
| Movement total | 8.590 |
| Penerimaan pembelian terposting | 703 |
| Receipt tanpa referensi pembelian asal | **0** |
| Receipt beda SKU, tanggal, atau kuantitas dari purchase log | **0** |
| Receipt di purchase log tanpa movement | **0** |
| Pengurangan penjualan terposting | 7.565 |
| Pengurangan tanpa sale item asal | **0** |
| Pengurangan dengan tanggal tidak sama dengan sale | **0** |
| Duplikasi untuk pasangan sale_item+inventory_item | **0** |
| Movement berkuantitas nol | 44 (40 BASELINE, 4 OPNAME_CORRECTION; bukan salah hitung) |
| Pengurangan historis berlabel `BOM_BASELINE_ESTIMATE_V1` | 635 |
| Pengurangan estimasi di atas baseline opname terakhir | 40, pada 2 SKU |
| Movement pada tanggal opname terakhir | 24 pada 9 SKU |
| Saldo negatif | 7 SKU |
| Purchase log tanpa satuan eksplisit | 597 dari 703 |
| Pemetaan purchase yang perlu perhatian konversi/verifikasi | 80 |
| Detail penjualan Oktober | 1.035 |
| Detail penjualan Oktober yang telah diposting ke stok | **0** |
| Penerimaan pembelian Oktober dalam inventory_purchase_log | **0** |
| Resep produk berstatus draft | 54 |

**Arti hasil:** ketepatan ARITMETIKA 0 kesalahan untuk 41 SKU ber-opname bukan bukti stok fisik atau kelengkapan seluruh input sudah benar. Ketiadaan transaksi Oktober dalam ledger **tidak** membenarkan memposting nilai simulasi berdasarkan draft BOM. Juga, `qty=0` pada opening/correction movement adalah informasi transaksi, bukan otomatis data invalid.

## Contoh pembuktian riil

- MIE KUNING (unit porsi; opname 5 September): `97 + 96 - 167 = 26` porsi; selisih rumus = 0. Ada 7 movement pada hari opname yang tetap harus diinterpretasikan berdasarkan sumber waktu.
- AIR MINERAL BESAR (pcs; opname 5 September): `22 + 0 - 29 = -7`; selisih rumus = 0. Minus pada saldo ledger adalah indikator ada sesuatu perlu diperiksa, **bukan** kepastian stok fisik minus.
- MATCHA (gram; opname 5 September): `12 + 0 - 420 = -408`; total pemakaian mencakup catatan estimasi BOM sehingga perlu kontrol kualitas sumber.

## Tindakan teknis pada fase ini

1. Tambahkan view `ui_stock_formula_verification_v1` (security_invoker + authenticated only) yang menghitung ulang angka secara **independen dari view ledger** untuk semua SKU berdasarkan sumber existing.
2. Tampilkan di `Stok → Periksa Hitungan`: stok awal, penerimaan, pemakaian, hasil hitung, saldo sistem, dan penanda risiko, **tanpa mengubah saldo**.
3. Tandai pada dashboard bahwa stok belum terverifikasi penuh; tampilkan jumlah SKU tanpa opname dan item penjualan periode terpilih yang belum tertaut.
4. Unit test memaksa empat kaidah: *no physical baseline = unknown, not zero; arithmetic gap = 0 for matched SKU; same-day movements flagged; source uncertainty ≠ formula error.*

## Persyaratan rilis, pemulihan, dan batas kepercayaan

- Periksa SQL invoker/RLS dan pastikan anon tidak dapat membaca laporan audit.
- Audit pasca-deploy harus menunjukkan 198 SKU, 41 tracked, 157 untracked, **0 mismatches**, total movement 8.590, posting Oktober 0.
- Jika fitur audit gagal dimuat, aplikasi tetap menampilkan stok lama disertai status `Belum dapat diperiksa`, tidak mengubah data produksi. Untuk membatalkan UI, revert PR/deploy sebelum commit. View baru bersifat read-only dan tidak dipakai untuk jurnal.
- Karena data Oktober belum lengkap dan satuan/konversi pembelian belum seluruhnya terverifikasi, permintaan *0 error stok fisik* **tidak dapat dibuktikan** tanpa bukti sumber tambahan; penerimaan/penjualan yang tidak ada tidak boleh ditebak.

## Pekerjaan selanjutnya tanpa data baru

1. Dengan data existing, cocokkan silang purchase import ke tabel penerimaan dan data keuangan, tandai unit/alias yang perlu konversi, **jangan mengimputasi kuantitas**.
2. Periksa jejak waktu dari import/penjualan/opname untuk movement tanggal sama; jika waktu peristiwa tidak tersedia, pertahankan tanda ketidakpastian.
3. Validasi draft BOM dari dokumen yang **sudah tersimpan** jika ada bukti; jangan auto-approve.
4. Audit tren dan stock moving agar metrik yang tidak didukung sumber tidak disajikan sebagai angka pasti.

**Status pekerjaan ini: pemeriksaan dan kejelasan angka, bukan pemulihan stok Oktober secara otomatis.**
