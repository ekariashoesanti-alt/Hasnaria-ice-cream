# HASNARIA — Simulasi SKU → BOM → Stok Oktober 2026 (Singapore UAT)

**Status 8 Nov 2026:** SQL read-only sudah diterapkan dan lolos assertion pada Singapore staging. Semua hasil merupakan kebutuhan bahan *berdasarkan satuan resep sumber Majoo*, BUKAN saldo stok atau bukti pengeluaran gudang. **Tidak ada perubahan Tokyo production.**

## Perhitungan dan keputusan sumber data

- Omzet dan jumlah struk **berasal dari Detail Penjualan Majoo** (824 struk, Rp21.614.500 bruto); tidak digunakan untuk mengarang qty SKU per struk.
- **2.604 unit dari 54 SKU** berasal dari Penjualan Produk Majoo, sebagai acuan satu-satunya untuk simulasi konsumsi bahan per SKU bulanan.
- Master Majoo: 72 produk, 61 bahan, 153 baris resep hasil ekspor. Di antara resep tersebut, **138 baris** berlaku pada **47 SKU terjual (2.300 unit)** dan menghasilkan kebutuhan **55 jenis bahan**.
- **7 SKU dengan 304 unit** hanya memiliki kandidat BOM legacy, bukan komposisi hasil ekspor siap pakai: DD91 (47), DD95 (18), DR56 (46), FO41 (3), FO51 (76), FO91 (4), FO92 (110). Belum ada satu pun resep disetujui untuk stok.
- **30 SKU / 927 unit** = resep sumber ada, tanpa `Pack`/`Porsi`, tetapi tetap butuh review Owner dan konversi stok.
- **17 SKU / 1.373 unit** = resep sumber ada, mengandung baris `Pack` atau `Porsi`, perlu verifikasi kuantitas kemasan. Simulasi memiliki 17 baris sumber terkait dan **6 bahan berisiko konversi**.

## Enam prioritas konversi yang belum terverifikasi

| Ingredient SKU | Bahan | Satuan resep Majoo | Kebutuhan bruto sumber | Mempengaruhi |
|---|---|---|---:|---:|
| #FO19 | Kue beras topokki | Pack | 673 | 5 SKU |
| #FO09 | Dumpling cheese | Pack | 276 | 3 SKU |
| #FO18 | Siomay | Pack | 240 | 3 SKU |
| #IC09 | Wafel cone | Pack | 109 | 1 SKU |
| #IC05 | Ice cream scoop | Porsi | 84 | 3 SKU |
| #FO08 | Dumpling ayam | Pack | 82 | 2 SKU |

**DILARANG menganggap angka `673 Pack` sebagai 673 kemasan fisik yang benar-benar dikeluarkan.** Data Majoo membutuhkan pemeriksaan apakah `Pack` di resep sebenarnya berarti satu item, satu kemasan beli, satu porsi, atau unit operasional lain. Konversi menjadi kemasan gudang harus berbasis isi dan satuan riil yang ditandatangani Owner.

**Catatan unit lainnya:** 13 macam ejaan/satuan resep sumber termasuk `Gram`, `ML`, `Mililiter`, `Buah`, `BUAH`, `Pieces`, `Pcs`, `PCS`, `BUTIR`, `BIJI`, `SACHET`, `Pack`, `Porsi`. Jangan menjumlahkan angka Gram+ML+Pack menjadi satu total. Satuan resep cocok persis dengan `source_unit` ingredient master pada 138 baris; ini **belum membuktikan kecocokan terhadap stok pembelian/warehouse**.

## Refund dan free item

- Dari 4 refund unit pada Penjualan Produk, hanya **2 unit SKU FO61 (Topokki Odeng)** mempunyai BOM hasil ekspor; sisanya adalah 1 × DD95 dan 1 × DR56, keduanya legacy-only.
- Pada FO61, indikasi potensi refund BOM tercatat sebagai **2 unit ODENG TIPIS**, **2 unit Kue Beras (Pack sumber)**, **100 Gram Saus**, dan **2 PCS Mangkuk 360**. Ini **tidak berarti bahan dikembalikan ke gudang**. Refund setelah makanan diracik dapat tetap menghabiskan bahan; simulasi menampilkan exposure terpisah dan **tidak menguranginya otomatis dari gross**.
- FO91 `KUAH TOMYAM` (4 unit) dan FO92 `KUAH ODENG` (110 unit) harus diperiksa untuk menghindari pengeluaran bahan sup dobel bila menjadi item complimentary pada produk utama atau paket.
- Seluruh 55 ringkasan bahan dan 138 baris komponen mempunyai `stock_posting_allowed=false`, `conversion_verified=false`, dan `simulation_only=true`.

## Bukti implementasi staging

- `supabase/uat/singapore/20261108180000_bom_readonly_simulation_v2.sql` berisi 3 view privat: `bom_demand_component_preview_v2`, `bom_ingredient_demand_preview_v2`, `bom_sku_readiness_gate_v2`. Semua `security_invoker=true`, `REVOKE ALL` untuk browser roles, dan **tidak ada trigger/mutasi ledger**.
- `supabase/uat/singapore/assert_bom_readonly_simulation_v2.sql` memverifikasi jumlah 54 SKU / 2.604 unit; 47+7 cakupan, 138 komponen, 55 bahan, 13 satuan asli; 17 risiko Pack/Porsi; 0 approval/posting; semua sumber cocok ke view raw sebelumnya, dan `sales`/`sale_items`/`inventory_movements` tetap 0 di Singapore.
- GitHub Audit Gate mewajibkan keberadaan dua skrip dan penanda keamanan; assertion SQL dieksekusi secara terpisah di staging dan sudah **PASS**.

## Gerbang rilis sebelum pengurangan stok riil

1. Validasi konversi keenam bahan berisiko (isi per pack, satuan gudang, waste/yield bila ada), serta semua BOM lain dan tanggal berlaku.
2. Verifikasi tujuh BOM legacy, termasuk produk gratis Kuah agar tidak dicatat dua kali.
3. Rekonsiliasi fisik opening stock, pembelian/retur, dan pemakaian; bedakan resep teoretis dari pemakaian aktual.
4. Tentukan kebijakan transaksi refund/void dan event CFD terkait stok.
5. Owner melakukan verifikasi dan persetujuan yang diaudit per SKU/versi resep. Baru setelah backup, dry-run, perbandingan ledger, dan rollback, pertimbangkan mekanisme posting stok idempotent. **Belum dibangun/diaktifkan di tahap ini.**

## Recovery

Ketiga view v2 bersifat tambahan di skema Singapore privat. Bila perlu rollback, `DROP VIEW hasnaria_uat.bom_sku_readiness_gate_v2; DROP VIEW hasnaria_uat.bom_ingredient_demand_preview_v2; DROP VIEW hasnaria_uat.bom_demand_component_preview_v2;` dalam transaksi terkontrol; tabel sumber, laporan dan stok tidak berubah. Branch tetap PR draft dan dapat di-revert sebelum rilis.
