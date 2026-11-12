# HSN-417 — Stock Item Trace, Stage 2A (Preview only)

## Keputusan desain
Mempertahankan dashboard empat KPI dan dua grafik. Detail tambahan muncul di modal Stok → Posisi SKU → klik nama barang, hanya untuk Owner, dan **hanya memanggil sumber saat dibuka**.

## Fakta read-only Supabase 12 November 2026
- 198 master SKU, 194 registri SKU internal (kode INV-*) dan **0 SKU asal Majoo terverifikasi**; jenis registri 132 bahan, 62 kemasan.
- 8.590 mutasi ledger historis, item dengan mutasi terbanyak 2.038; checkpoint opname tersedia untuk 41 barang, terakhir 12 September.
- Tabel barang diterima resmi belum memiliki dokumen (0 goods_receipts). Log pembelian lama tidak sama dengan penerimaan fisik yang diverifikasi.
- Audit workbook Majoo 8 November berisi 72 produk, 61 bahan dan 153 BOM, **kandidat pemetaan/dosis**. Tidak dapat digunakan untuk mengisi SKU Majoo otomatis atau mengesahkan konversi.

## Diimplementasikan
- Identitas ERP asli dari inventory_sku_registry: code, type, source, base unit, status. SKU dan satuan Majoo tetap "Belum terverifikasi" jika tidak ada mapping berdokumen. Awalan '#' tidak dihilangkan.
- Ledger item diambil dengan filter brand+inventory_item_id, urutan deterministik tanggal transaksi → waktu pencatatan → ID. Saldo dihitung dari opname fisik terakhir sebelum membagi halaman menjadi 25 baris; 2.500 baris maksimum (gagal-tertutup jika terpotong).
- Mutasi pada hari opname ditandai ambigu dan tidak dijumlah dua kali. Tanpa checkpoint / ledger parsial / delta invalid, saldo unknown, bukan nol.
- Data terkait: komponen resep, log pembelian, opname, dokumen penerimaan jika ada. Tautan hanya ada untuk record yang relasi ID-nya cocok; sale_item tanpa dokumen belum dapat diklik.
- Tombol Kembali ke daftar menjaga search/category/status/page. Desktop & mobile menggunakan modal existing; Role Owner-only, query brand-scoped dan RLS existing.
- Tidak ada write/DDL/cron/auto-post, rilis main maupun production.

## Gate berikutnya
HSN-417 tetap REVIEW hingga build gate dan preview lulus serta Owner mengonfirmasi tampilan/logika dan akses di 100% zoom. Tahap 2B wajib menunggu ekspor daftar Produk + Bahan dan kartu mutasi Majoo asli (SKU persis, outlet, unit asli, waktu, kuantitas, nomor dokumen, file/row), plus keputusan pemetaan dari Owner. Tahap 3 arus periode/ekspor belum dimulai.

Rollback: hapus perubahan frontend di PR stacked; database tidak berubah.
