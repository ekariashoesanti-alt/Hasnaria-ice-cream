# Hasnaria Command Center

Live: https://hasnaria-business-analyzer.vercel.app

Hasnaria Command Center adalah aplikasi operasional untuk penjualan, stok, pengeluaran, approval, tim, dan monitoring bisnis.

## Arsitektur

- Frontend: static HTML/JavaScript di Vercel.
- Database/Auth: Supabase project `Hasnaria Project`.
- Runtime core: `core-app.js` di repository ini. Jangan memuat application core dari commit GitHub/CDN eksternal.
- Sales UI: `sales-board.js` merakit `sales-board.part0.js` s.d. `sales-board.part4.js` dan menggunakan `sales-import-v2.js` untuk import Majoo.
- Excel parser: SheetJS melalui shared loader `xlsx-preload.js`.

## Source of truth

1. `main` adalah source of truth aplikasi production.
2. Production Vercel tidak boleh dipromosikan dari commit yang tidak menjadi bagian dari `main`.
3. Perubahan production dilakukan melalui branch + Pull Request.
4. PR harus lulus `Hasnaria Audit Gate` dan Vercel Preview sebelum merge.
5. Jangan mengosongkan/mengedit salah satu `sales-board.part*.js` tanpa memastikan hasil gabungan kelima part tetap JavaScript yang valid.

## Supabase migration policy

- `supabase/migrations/` adalah history schema yang harus sesuai dengan migration history Supabase production.
- Setiap DDL production harus mempunyai file migration timestamped di repository.
- Jangan melakukan perubahan schema manual tanpa mencatat migration yang sama di Git.
- Jangan menyimpan `service_role`, `sb_secret_*`, atau credential privileged lain di frontend/repository.
- Frontend hanya menggunakan Supabase publishable key; authorization tetap ditegakkan oleh RLS/database.

## Role dan authority

Role aplikasi:

- Owner
- Head of Store
- Marketing
- PIC Shift
- Pelaksana
- Pending

`public.user_profiles` adalah authority role/status/brand di database. Record legacy `HASNARIA_USER|...` pada `products` hanya bridge kompatibilitas untuk UI lama dan tidak boleh menjadi sumber authority baru.

User baru masuk sebagai `pending` dan menunggu aktivasi Owner. Perubahan role/status/brand dilindungi oleh RLS/trigger database.

## Import Majoo

Importer normalized menggunakan external transaction ID untuk mencegah transaksi ganda. Transaksi void/refund dikeluarkan dari penjualan aktif. Produk yang belum ada di katalog tetap dapat disimpan sebagai raw `item_name` / `external_sku`.

Sebelum perubahan importer dipromosikan ke production, lakukan rekonsiliasi satu export `Detail Transaksi` Majoo yang diketahui benar dan cocokkan minimal:

- jumlah transaksi aktif;
- omzet periode;
- jumlah void/refund;
- rentang tanggal;
- detail item utama.

## CI / release gate

`Hasnaria Audit Gate` memeriksa:

- syntax seluruh JavaScript;
- syntax sales multipart setelah lima file digabung;
- integritas snapshot `core-app.js`;
- importer normalized dan migration wajib;
- kebocoran credential privileged;
- marker hardening migration;
- konfigurasi security header Vercel.

Urutan release yang benar:

`branch -> PR -> CI hijau -> Vercel Preview READY -> smoke/reconciliation -> merge main -> production`

Jika salah satu gate gagal, jangan promote deployment ke production.
