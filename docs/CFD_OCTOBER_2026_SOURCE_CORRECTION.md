# HASNARIA — Koreksi audit transaksi CFD Oktober 2026

**Tanggal audit:** 8 November 2026. **Status:** bukti sumber diverifikasi; klasifikasi event belum disetujui per nomor transaksi. **Tidak ada mutasi production atau stok.**

## Empat data pembanding

| Sumber | SHA-256 / cakupan |
|---|---|
| Detail Transaksi Majoo CSV | `21277146db1163fb14b30d75aafdaf0686ed79e32ba15861c5624ca60ba494a9`; 824 nomor unik, termasuk satu transaksi prefix `CO/`; total Rp21.614.500 |
| Penjualan Per Periode Majoo XLSX | `9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83`; 31 hari Oktober, Rp21.614.500, 824 transaksi, 2.604 unit, refund Rp35.000 |
| Penjualan Produk Majoo XLSX | `ea801b3a0d2eb33ea135aba187daf04371acb3a49990eccb104b2ea46947f648`; 54 SKU, Rp20.992.500, 2.604 unit, refund Rp35.000 |
| Master SKU & BOM | 72 SKU produk, 61 bahan, 153 ekspor komponen BOM + 7 kandidat legacy review-only |

## Koreksi salah atribusi event

**JANGAN** menyebut transaksi `CS/01/261005/0024` sebagai pendapatan es krim CFD pada Minggu, 4 Oktober.

- Sumber POS: **Senin, 5 Oktober 2026 pukul 20:38:33 WIB**, jumlah **Rp1.512.000**.
- Produk yang dicantumkan: SOSIS AYAM, ODENG, Topokki Odeng, THAI TEA, French fries, KUAH ODENG.
- Jenis Order: `Lainnya`, pembayaran QRIS Mandiri.
- Ini **tidak cocok** dengan informasi bahwa event berlangsung Minggu sebelum 12.00 dan seluruh isinya es krim.
- Hanya tanggal/jam POS asli yang tersedia. Jangan membuat atau menggeser `event_date` ke Minggu tanpa catatan event dari Owner.

**Kandidat kuat satu transaksi rekap CFD:**
- `CS/01/261025/0001` pada **Minggu, 25 Oktober pukul 10:52:42 WIB**, **Rp281.000**.
- Produk: empat kemunculan `ICE CREAM BOWL` dan satu `Es krim Turkiy` pada satu receipt. Kemunculan nama bukan bukti jumlah unit sebenarnya.
- Hanya label **`needs_owner_confirmation`** yang dibenarkan sampai identitas event diverifikasi.

**Kandidat penjualan beruntun CFD:**
- **Minggu, 11 Oktober:** 27 receipts dari 07:00:25–09:30:46 WIB; Rp259.000, seluruh nama produk adalah es krim termasuk `CFD Ice Cream Turki`.
- Aturan pembacaan kandidat yang ditambahkan di `sales-reconciliation-v1.js`: jam POS di hari Minggu sebelum 12:00 WIB dan seluruh nama produk mengandung istilah `ice cream` atau `es krim`.
- Total kandidat dari seluruh Oktober: **28 transaksi / Rp540.000**, **bukan** otomatis omzet event yang disahkan dan **bukan** penyebab terbukti selisih Rp622.000.

## Kontrol penerimaan data

1. Semua **824 transaksi CSV** unik dan jumlah nominalnya Rp21.614.500. Satu receipt tambahan bernomor **`CO/01/261004/0001`** pada 4 Okt pukul 11:29:45, **Rp35.000**. Jangan membatasi importer hanya ke nomor `CS/` karena akan kehilangan satu transaksi.
2. Untuk **setiap tanggal 1–31 Oktober**, jumlah transaksi dan total omzet pada CSV sama persis dengan Penjualan Per Periode.
3. Penjualan Per Periode dan Rekap SKU sama-sama memiliki **2.604 unit**, sehingga tidak ada bukti bahwa 781 unit di antara 2.604 dan 1.823 kemunculan nama benar-benar hilang; CSV hanya tidak mengungkap qty per item.
4. **5 Oktober** memiliki 358 unit di Penjualan Per Periode tetapi hanya 53 kemunculan nama dalam CSV (selisih 305). **25 Oktober**: 135 unit vs 79 kemunculan (selisih 56). **11 Oktober**: 126 unit vs 94 (selisih 32).
5. **Selisih omzet Rp622.000** = Rp21.614.500 (receipt/periode) − Rp20.992.500 (SKU). Refund Rp35.000 cocok pada keduanya. Penyebab selisih ini tetap **OPEN** dan wajib dibandingkan dengan sumber itemized POS/discount/fee/tax. Nominal kandidat CFD Rp540.000 bukan hasil rekonsiliasi dengan selisih.
6. Laba kotor per-periode sumber = **Rp10.880.813,697638465**, sedangkan rekap SKU menjumlahkan laba kotor tercetak **Rp10.626.232,08**, berbeda sekitar **Rp254.581,62**. Definisi HPP/laba antar laporan belum dikonfirmasi; jangan mengalihkan salah satunya ke KPI secara otomatis.

## Perlakuan data & recovery

- Simpan timestamp POS asli, sumber file SHA-256, nomor transaksi, atribut audit/event, status review, aktor/waktu persetujuan, dan bukti konfirmasi terpisah. Klasifikasi kandidat CFD **tidak** mengubah tanggal/timestamp atau nominal transaksi.
- Jangan gabungkan dua laporan pendapatan menjadi pendapatan dua kali lipat. Jangan memproduksi qty SKU harian dari 1.823 kemunculan nama.
- Tidak boleh ada posting BOM/HPP/stok otomatis dari kandidat event, sampai unit per struk dan status resep divalidasi.
- Perubahan ini hanya di branch `feature/dual-source-sales-stage1-safe-import`. Sebelum merge, jika temuan tidak valid, revert kode kandidat dan hapus rencana label event; data production tetap utuh.

## Bukti pengujian

- `tests/sales-reconciliation-v1.test.js`: validasi campuran outlet, prefix `CO/`, penolakan pemindahan Senin Rp1.512.000 ke CFD, Sunday-morning es krim, 28 transaksi aktual = Rp540.000.
- Workbook audit independen: `HASNARIA_Audit_Koreksi_CFD_Oktober_2026.xlsx` dengan Ringkasan, 824 transaksi, 31 hari, 54 SKU, 28 kandidat dan pengecualian.
