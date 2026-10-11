# HSN-P0 — Antrean Verifikasi Unit & Mapping Stok
**Disusun 11 Oktober 2026 dari laporan Supabase produksi, mode read-only.**
Status: **PENDING OWNER REVIEW / NO LIVE DATA CHANGED**

## Prinsip keputusan

- Semua pembelian September 2026 yang bersumber dari canonical mempunyai `unit_text` kosong. **Tidak boleh menyimpulkan satuan beli dari angka kuantitas**.
- Isi kemasan usulan dalam `inventory_unit_conversions` dengan status `needs_verification` **hanya estimasi**; tidak cukup untuk mengubah saldo. Verifikasi melalui kemasan/nota/foto/opname, lalu masukkan satuan beli, satuan stok, faktor isi, serta tanggal berlaku.
- Data `inventory_purchase_log` yang sudah diposting tidak diedit oleh sinkronisasi otomatis baru. Pembetulan histori perlu review terpisah.
- Periode September sudah memiliki opname pada beberapa SKU. Sebelum melakukan penerimaan historis yang tertunda, bedakan pembelian sebelum/sesudah baseline opname dan hindari double count.

## A — Pembelian pending bernilai terbesar (persetujuan satuan dulu)

| SKU | Unit master | Baris pending | Quantity sumber (belum terkonversi) | Nilai pembelian pending | Yang perlu dipastikan |
|---|---|---:|---:|---:|---|
| ICE CREAM PAIL | pail | 2 | 3 | Rp450.000 | 1 pembelian = berapa pail; cek pemasukan sebelum/sesudah opname |
| ODENG | porsi | 1 | 5 | Rp400.000 | Satuan beli pack/buah? Estimasi sebelumnya 12 porsi per pack, **belum verified** |
| CONE BOWL | pcs | 1 | 240 | Rp240.000 | Apakah 240 benar pcs atau unit pack |
| SAUS TOPOKKI | porsi | 1 | 1 | Rp209.900 | Satuan/volume saus; gram tidak boleh otomatis jadi porsi |
| TOPOKKI | porsi | 1 | 5 | Rp136.455 | Apakah jumlah beli adalah pack? Estimasi 50 porsi/pack belum verified |
| MIE SEDAP | pcs | 1 | 40 | Rp112.000 | Apakah jumlah beli berarti 40 pcs |
| ICE CREAM POTONG MATCHA | porsi | 1 | 20 | Rp105.000 | Konfirmasi potong = porsi dan baseline |
| SOSIS | pcs | 2 | 4 | Rp102.000 | Apakah 4 adalah jumlah pack atau pcs |
| MIE KUNING | porsi | 2 | 106 | Rp89.200 | Apakah 106 = porsi siap pakai |
| DUMPLING CHEESE | pcs | 2 | 3 | Rp84.000 | Estimasi 14 pcs/pack belum verified |
| CHIKUWA | porsi | 2 | 2 | Rp57.000 | Estimasi 42 porsi/pack belum verified |
| DUMPLING AYAM | pcs | 2 | 2 | Rp57.000 | Estimasi 25 pcs/pack belum verified |
| FISHROLL | pcs | 2 | 2 | Rp51.500 | Estimasi 20 pcs/pack belum verified |
| SALMON STIK | porsi | 2 | 2 | Rp48.000 | Konfirmasi pack vs porsi |
| SPRITE | ml | 1 | 5 | Rp47.500 | Estimasi 390 ml/botol belum verified |
| EKOR UDANG | pcs | 1 | 1 | Rp34.000 | Konfirmasi pcs vs pack |
| CUMI KEMBANG | pcs | 1 | 1 | Rp29.000 | Estimasi 25 pcs/pack belum verified |
| CRAB STIK | porsi | 1 | 1 | Rp24.500 | Konfirmasi pack vs porsi |
| SIRUP MELON | purchase_unit | 1 | 1 | Rp20.500 | **Unit master belum operasional**; tentukan ml/botol |
| BAKSO IKAN | pcs | 1 | 1 | Rp20.000 | Estimasi 40 pcs/pack belum verified |
| SCALLOP | pcs | 1 | 1 | Rp14.500 | Estimasi 25 pcs/pack belum verified |
| JELLY | gram | 1 | 1 | Rp13.300 | Estimasi 1000 gram/pack belum verified |
| SABUN PEL | pcs | 1 | 1 | Rp7.900 | Konfirmasi 1 botol/pcs |
| NATA DE COCO | gram | 1 | 2 | Rp7.000 | Estimasi 1000 gram/pack belum verified |

**Catatan:** kuantitas dari SKU berbeda tidak dijumlahkan menjadi stok total. Nilai pending seluruhnya masih bagian dari nominal Pembelian/Keuangan yang telah terjurnal; pembukuan stok tidak membuat biaya baru.

## B — Histori sudah terposting, perlu investigasi satuan

- **SIOMAY**: 2 baris receipt September tercatat dalam `pack` sedangkan master SKU `pcs`; estimasi 20 pcs/pack belum disetujui.
- **BAKSO IKAN**: 2 receipt `pack` → master `pcs`; estimasi 40 pcs/pack belum disetujui.
- **BAKSO UDANG**: 3 receipt `pack` → master `pcs`; estimasi 40 pcs/pack belum disetujui.
- **SCALLOP**: 1 receipt `pack` → master `pcs`; estimasi 25 pcs/pack belum disetujui.
- **BAKSO AYAM**: faktor usulan `pack→pcs` ada, tetapi master stok masih `pack` (unit target konversi `pcs` tidak cocok); perlu review master satuan.
- **NATA DE COCO / SPRITE**: lebih dari satu baris master konversi; database guard sengaja menuntut tepat satu faktor verified yang cocok untuk menghindari ambiguitas.

Jangan mengedit delapan receipt yang sudah posted tersebut secara otomatis. Cocokkan jumlah fisik dan tanggal opname, lalu usulkan koreksi movement yang audit-able.

## C — Mapping transaksi perlu diputuskan (33 pembelian)

Contoh prioritas: `TOKEN` Rp203.500 berlabel unmatched namun tampak sebagai pengeluaran utilitas, `GALON DEPAN/BELAKANG` berulang, `SAUS TOPOKKI ROSE`, `CHICKEN KARAGE`, dan `SIRUP STROBERI / LECHY`; `ES BATU` memiliki nama inventaris yang ambigu.

Untuk setiap baris pilih salah satu:
- **Beban operasional/non-stok**, tidak membuat movement;
- **Bahan/kemasan stok**, setelah cocok SKU, satuan, faktor, dan bukti;
- **Perlu verifikasi/ditahan**, jika informasi belum mencukupi.

Tidak ada keputusan otomatis dibuat oleh dokumen ini.

## D — Bukti yang diperlukan sebelum koreksi

Untuk SKU yang disetujui, dokumentasikan nama sumber barang, barcode/foto kemasan jika ada, kuantitas beli, satuan beli, faktor konversi, unit master, tanggal efektif, kondisi sebelum atau sesudah opname, nama pemeriksa, serta referensi nota. Baru kemudian uji pada database isolasi dan lakukan koreksi terukur dengan rollback.

**Jangan merge PR #88 atau jalankan `sync_purchase_quantity_stock_v1` untuk mengejar saldo selama data satuan belum diverifikasi.**
