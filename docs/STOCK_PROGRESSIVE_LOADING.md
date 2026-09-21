# Stock Progressive Loading

Tujuan perubahan ini adalah mempercepat tampilan data Stok tanpa mengubah sumber data, formula saldo, atau schema database.

## Urutan loading

1. Aplikasi tidak mengunduh runtime Stock v3 sampai Tab Stok benar-benar dibuka.
2. Saat Tab Stok dibuka, satu query `inventory_stock_reconciliation` menjadi critical path.
3. Setelah data utama tampil, lookup Incoming PO dan BOM berjalan sebagai supplemental loading saat browser idle.
4. Receipt hanya dibaca untuk line PO terbuka yang relevan; jika tidak ada PO terbuka, query receipt dilewati.
5. Kegagalan supplemental loading tidak mengosongkan atau memblokir data utama.

## Data utama

Data yang harus bisa tampil terlebih dahulu: Material, Pembelian setelah opname, Pemakaian, Stok Opname, Selisih, Min/Par, Status awal, dan Saldo.

## Data supplemental

Incoming PO, Kebutuhan setelah mempertimbangkan incoming, serta Days Cover/BOM dilengkapi setelah tabel utama terlihat. Selama proses ini UI menampilkan placeholder, bukan angka nol palsu.

Tidak ada perubahan schema Supabase atau mutasi terhadap data transaksi dalam patch ini.
