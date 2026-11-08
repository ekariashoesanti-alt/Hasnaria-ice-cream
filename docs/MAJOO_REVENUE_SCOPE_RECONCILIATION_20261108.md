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

## Tahap lanjutan — Evidence-gated Revenue Scope Bridge

Modul sumber `sales-scope-bridge-v1.js` kini ikut dibundel ke runtime Sales Preview dan **bersifat read-only murni**. Tujuannya bukan membuat jurnal koreksi, tetapi menerima rincian bukti laporan Majoo jika suatu saat tersedia tanpa mengalihkan Rp622.000 ke akun sembarang.

**Status data pada 8 November 2026:** belum ada rincian nilai pajak, biaya layanan, ekstra/sub-ekstra, diskon transaksi, atau pembulatan yang tervalidasi untuk menjelaskan Rp622.000. Karena itu kalkulasi saat ini adalah:

- Omzet struk: Rp21.614.500; omzet produk: Rp20.992.500.
- Penyesuaian dengan referensi sumber yang dapat ditelusuri: **Rp0 teralokasi** (bukan berarti komponen transaksi sesungguhnya nol).
- **Saldo belum teralokasi: Rp622.000**.
- Refund kedua laporan Rp35.000, konsisten.
- `review_status=EVIDENCE_PENDING` dan `stock_posting_allowed=false`.

**Bila laporan pendukung tersedia kemudian:** setiap entri bukti harus memiliki tipe laporan, komponen, tanda (+ biaya/ekstra, − diskon), nominal dua desimal, tanggal bulan dan outlet yang identik, SHA-256 berkas, referensi baris asli, serta kunci komponen ekonomi agar nilai yang sama dari dua laporan tidak dihitung berulang.

- Komponen yang diperbolehkan: diskon transaksi, pajak, biaya layanan, ongkos kirim, ekstra, pembulatan, dan penyesuaian lain yang harus ditinjau.
- Modul memblokir referensi baris yang identik maupun kunci komponen ekonomi yang berulang, bulan/outlet berbeda, arah penambahan yang tidak sesuai tipe komponen, presisi berlebih dan nilai yang tak terbatas.
- Hash dan referensi dalam entri merupakan **metadata yang harus diverifikasi terhadap file asli secara terpisah**; memasukkan string SHA-256 tidak dengan sendirinya membuktikan keaslian dokumen.
- Bila nominal seluruh entri kebetulan sama dengan Rp622.000, status hanya menjadi `MATH_MATCH_OWNER_REVIEW`. Aplikasi tetap menetapkan `owner_approval_recorded=false` dan `posting_authorized=false`, tanpa mutation database.
- UI Preview menampilkan saldo yang belum dialokasikan; **belum ada antarmuka impor/approval baru untuk laporan Ekstra atau Ringkasan**. Tidak boleh mengklaim rekonsiliasi final sebelum bukti sumber asli dan Owner signoff tersedia.

Pengujian `tests/sales-scope-bridge-v1.test.js` dan canonical runtime mencakup nilai awal Rp622.000, skenario bukti sintetis yang kebetulan seimbang, duplikasi lintas laporan, refund yang tidak cocok, perbedaan outlet dan larangan posting stok. CI mewajibkan seluruhnya lulus.

**Rollback:** revert PR atau matikan flag Preview. Modifikasi ini tidak menambahkan tabel/migrasi, tidak mengubah transaksi production, dan tidak membuat mutasi stok di Singapore.

## Keputusan Owner — Source of Truth KPI dan SKU (8 November 2026)

Tidak perlu menahan perkembangan proyek untuk menebak alokasi Rp622.000. Sumber data ditetapkan **berdasarkan jenis metrik** dengan validasi yang dapat diaudit:

| Metrik | Sumber utama | Angka Oktober 2026 |
|---|---|---:|
| Omzet bruto | Detail Transaksi Majoo; diverifikasi 1:1 terhadap Penjualan per Periode 31 hari | Rp21.614.500 |
| Refund | Detail Transaksi dan konfirmasi total semua laporan | Rp35.000 |
| Omzet bersih | Detail Transaksi (bruto−refund) | Rp21.579.500 |
| Nomor dan waktu transaksi, metode bayar, jenis order | Detail Transaksi Majoo | 824 struk |
| Unit terjual dan ranking SKU | Laporan Penjualan Produk | 54 SKU, 2.604 unit |
| HPP SKU sumber Majoo | Laporan Penjualan Produk, **bukan** proyeksi dari nilai struk | HPP sumber; evaluasi definisi sebelum laba total |
| Konsumsi stok | Unit SKU × BOM **yang disetujui**, dengan opening-stock valid | 0 posting sebelum approval |

**Bukan double revenue:** Rp20.992.500 pada Laporan Penjualan Produk adalah atribut pembanding/detail SKU, **bukan tambahan** pada Rp21.614.500. Selisih Rp622.000 tetap dilabeli `UNALLOCATED_SOURCE_SCOPE_GAP`, tidak dialokasikan ke SKU atau omzet baru.

**Bukan laba gabungan final:** nilai HPP di Laporan Produk hanya boleh dipakai sebagai HPP di dalam cakupan laporan produk. Jangan kurangi omzet Detail Transaksi dengan HPP tersebut dan menyebut selisihnya laba final tanpa kesepakatan definisi.

**Status implementasi:** `sales-reconciliation-v1.js` menerbitkan objek `source_authority` dan `sales-board.part1.js` menampilkannya pada Preview. Semua flag otorisasi menolak overwrite KPI produksi dan posting stok. Belum ada migrasi atau perubahan transaksi production dalam penetapan ini.

**Gate rilis:** sebelum mengalihkan KPI resmi dari 484 transaksi historis di Tokyo ke 824 transaksi pada ekspor asli, lakukan UAT Owner, deduplikasi lintas sumber dan verifikasi cutover per-bulan, dengan backup dan rollback; jangan menimpa production otomatis.
