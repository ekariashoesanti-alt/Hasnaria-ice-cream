# HASNARIA — Rekonsiliasi cakupan omzet Majoo (Oktober 2026)

**Status:** analisis READ-ONLY; selisih nominal per komponen belum ditentukan. DILARANG mengubah KPI, sales, HPP, stok atau klasifikasi CFD berdasarkan dokumen ini.

## Bukti faktual dari file asli

| Pembanding | Nilai |
|---|---:|
| CSV Detil Penjualan, 824 transaksi | Rp21.614.500 |
| XLSX Penjualan per Periode, 31 hari / 824 transaksi | Rp21.614.500 |
| XLSX Penjualan Produk, 54 SKU / 2.604 unit | Rp20.992.500 |
| Semua 54 SKU: total qty × harga jual Master Majoo | Rp20.992.500 |
| Selisih total struk minus produk | **Rp622.000** |
| Refund kedua sumber | Rp35.000 |
| Jumlah unit per periode dan SKU | 2.604 |
| Jumlah komisi harian pada file Penjualan per Periode | **Rp0** |

**Keterangan penting:** penjualan produk bulanan pada setiap SKU persis sesuai dengan harga Master yang diekspor 8 November 2026; selisih tidak muncul dari perhitungan qty × daftar harga produk. Kesesuaian harga Master **tidak** membuktikan bahwa setiap struk memiliki harga yang sama—terdapat variasi pada tingkat transaksi.

## Dokumentasi resmi Majoo

- **Definisi laporan produk**: Majoo menyebut angka total penjualan produk dapat berbeda dari Ringkasan Penjualan karena beberapa komponen pada tingkat transaksi, termasuk **pajak dan diskon transaksi**. Sumber: https://majoo.id/informasi-update/laporan-produk-tambahan-kolom-refund
- **Definisi Ringkasan Penjualan**: Majoo merinci penjualan kotor, ongkos kirim, biaya layanan/MDR, pembulatan, pajak, biaya lain, promosi dan biaya administrasi sebagai komponen laporan. Sumber: https://majoo.id/panduan-pengguna/detail/184
- **Laporan Penjualan Ekstra**: menu *Penjualan > Laporan > Laporan Produk > Penjualan Ekstra* untuk penjualan opsi/tambahan. Sumber: https://majoo.id/panduan-pengguna/detail/194
- **Laporan Penjualan Sub Ekstra**: menu *Penjualan > Laporan > Laporan Produk > Penjualan Sub Ekstra*. Sumber: https://majoo.id/panduan-pengguna/detail/195

Penjelasan dokumentasi tersebut memberikan **mekanisme perbedaan cakupan**, tetapi belum membuktikan angka Rp622.000 berasal dari salah satu komponen tertentu pada HASNARIA. Laporan per-periode memiliki total komisi Rp0 sehingga komisi yang terlihat di sana bukan penjelasan langsung.

## Indikator prioritas dari CSV

- Ada **51 struk** yang tidak bisa dibentuk secara aritmetika hanya dengan jumlah unit bulat dari nama produk yang tercantum dan harga rata-rata SKU pada rekap; **44 di antaranya** menyebut ICE CREAM BOWL. Ini hanya screening, bukan kesalahan pembukuan yang dipastikan.
- Dari **25 struk** dengan satu nama produk *ICE CREAM BOWL*, harga struk mencakup Rp8.000, Rp10.000, Rp11.000, Rp12.000, Rp13.000, Rp22.000, dan Rp24.000, sedangkan harga IC60 pada Master Rp5.000/unit.
- **19 struk satu-nama-produk** tidak sesuai kelipatan harga SKU, **17 di antaranya ICE CREAM BOWL**. Rincian modifier/topping/qty per struk tidak tersedia dalam CSV.
- **25 Oktober** 10:52 WIB, struk Rp281.000 dengan empat kemunculan ICE CREAM BOWL dan satu Es krim Turkiy tidak bisa menjadi kelipatan Rp5.000 tanpa informasi tambahan; kandidat event CFD tetap belum dikonfirmasi.
- **5 Oktober** 20:38 WIB, struk Rp1.512.000 berisi makanan/minuman campur **bukan** bukti CFD es krim.
- Tidak ada SKU tak terdaftar dari 54 nama yang dijual; semuanya cocok dengan Master.

## Urutan kontrol untuk menyelesaikan Rp622.000 tanpa risiko menambah omzet ganda

1. **Unduh Ringkasan Penjualan Majoo** untuk 1–31 Oktober 2026, outlet Hasnaria Ice Cream, Excel/PDF dengan perincian pajak, biaya layanan, MDR, ongkos kirim, pembulatan, biaya lainnya, promosi/diskon, refund dan biaya administrasi. Buat bridge per komponen, bukan asumsi.
2. **Unduh Penjualan Ekstra dan Penjualan Sub Ekstra** untuk bulan dan outlet sama. Cocokkan nilai opsi/topping, khususnya terkait ICE CREAM BOWL, dengan laporan Ringkasan dan transaksi terpilih.
3. Jika bridge masih belum nol, ambil **detail item per struk** (qty, harga unit aktual, modifier/extra, diskon item dan transaksi), mulai dari 51 struk screening, terutama IC60 dan struk Rp281.000.
4. Jika ada perbedaan kategori/terminologi per laporan, tandai sebagai `SCOPE_PENDING`. Simpan SHA-256 file, waktu impor, nomor struk, dan catatan Owner. Jangan mengalokasikan sisa gap sebagai pendapatan baru.
5. **Persamaan kontrol:** struk bruto (Rp21.614.500) – produk bruto (Rp20.992.500) = **komponen transaksi belum terurai (+Rp622.000)**. Menjadi *CLOSED* hanya jika jumlah komponen berlabel terverifikasi persis Rp622.000, dengan definisi tidak tumpang tindih dan disetujui Owner.

## Sistem HASNARIA

Preview Singapore diberi bagian *Selisih cakupan laporan* serta tautan dokumentasi resmi. Ini hanya menunjukkan anomali, **tidak melakukan reclass, refund, pemindahan tanggal POS, pembukuan HPP, pengurangan persediaan atau posting stok**. PR #185 tetap draft sampai audit itemisasi, BOM, UI Owner, dan rollback lulus.
