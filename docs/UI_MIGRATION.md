# HSN-010 — Migrasi UI ke GitHub dan Vercel

Scope disepakati 18 September 2026: migrasi UI terlebih dahulu; Next.js/TypeScript ditunda untuk menghemat kredit.

- Repository: ekariashoesanti-alt/Hasnaria-ice-cream, asal aplikasi aktif dan terhubung ke Vercel.
- Production: `main`, proyek `hasnaria-business-analyzer`.
- Backend/Auth tetap Supabase `bnnhmtkpdjlgehsvgoda`; PR ini tidak menambah migration/schema database.
- Login, password reset, upload pembelian + tahun, importer penjualan, stok/opname/resep, keuangan/approval, HR, pemasaran, dan pengaturan memakai implementasi existing.
- Shell sidebar navy/blue/white dari UI Site dimigrasikan. Ringkasan menggunakan `get_ui_bootstrap_v4`; inventory, costing, action queue dan audit dimuat saat halaman dibuka.
- Views utama: `ui_inventory_items`, `ui_hpp_blockers`, `ui_erp_action_queue_v4`, `ui_recent_erp_audit`. Data tetap melalui authenticated client dan RLS; brand response diverifikasi.
- Nilai laba hanya berasal dari kolom verified backend. Null ditampilkan sebagai belum tersedia; tidak ada estimasi HPP.
- Daftar rincian dibatasi 500 baris dan diberi label; dashboard bulanan mengikuti maksimal 12 periode dari bootstrap.
- Tidak ada env/server secret baru untuk runtime static. Konfigurasi public Supabase existing dipertahankan.
- ChatGPT Site tetap hidup. Jangan menganggap seluruh roadmap ERP sudah selesai.

## ERP Action Center

Action Center sekarang dapat menyelesaikan workflow berikut melalui RPC Supabase setelah Owner mengisi form dan menekan submit:

- pack conversion → `resolve_inventory_conversion`
- recipe verification + `effective_from` → `resolve_product_recipe_verification_v2`
- sale-item mapping → `resolve_sale_item_product_mapping`
- selling-price confirmation → `resolve_product_selling_price`
- historical inventory baseline → `resolve_inventory_baseline_candidate`
- financing review → `resolve_financing_payment_candidate`
- invalid purchase quantity per source row → `resolve_purchase_quantity_override`
- unmatched purchase classification → `resolve_purchase_item_rule`
- unverified inventory classification → `resolve_purchase_item_rule`

Kontrol keselamatan:

- Tidak ada action bisnis yang auto-confirm saat halaman dibuka.
- Semua mutation membutuhkan alasan/catatan audit.
- Pack size dan quantity multiplier tidak diberi default tebakan.
- Invalid quantity diselesaikan per `source_history_id`; suggestion hanya ditampilkan bila backend menandainya deterministik.
- Unmatched purchase tidak diberi klasifikasi default. Item ambigu seperti `PINES` tetap menunggu keputusan Owner.
- Posting transaksi historis pada purchase rule adalah checkbox eksplisit dan default **tidak aktif**.
- Financing `cash_paid` membutuhkan tanggal dan nominal kas; PAYLATER/utang tidak otomatis dianggap cash-out.
- Baseline historis diberi peringatan bahwa nilainya bukan stock opname hari ini.
- Recipe verification tidak berlaku sebelum `effective_from`.
- Setelah RPC sukses, bootstrap/action queue dimuat ulang.

Action yang masih diarahkan ke modul/manual workflow karena belum memiliki input aman yang cukup di Action Center: zero-amount purchase, missing recipe, missing component cost, dan untracked stock/physical opname.

PR/deployment sendiri tidak menulis data bisnis. Write hanya terjadi jika Owner yang sudah login secara eksplisit mengirim form action; backend RLS/RPC tetap menjadi enforcement utama.

## Verifikasi

Jalankan `node scripts/vercel-build-check.js`. Gate meliputi syntax, importer, authority `user_profiles`, password policy, canonical runtime, CSP, tracker, integrasi shell ERP, dan kontrak parameter RPC Action Center.

Build style diperbaiki agar pemasangan stylesheet tidak masuk ke fungsi loader CSS sebelahnya. Regression test mengeksekusi wiring runtime dan menjaga modul existing Penjualan/Pembelian/Keuangan/Stok tetap tersedia.

Preview harus diverifikasi sebelum merge. Automated gate dan Vercel preview harus hijau. Pemeriksaan authenticated Owner tetap dilakukan read-only terlebih dahulu; jangan mengirim impor, konfirmasi biaya, atau transaksi percobaan hanya untuk smoke test.

## Pengembangan selanjutnya

Next.js App Router + TypeScript adalah pekerjaan terpisah setelah migrasi UI ini. Pertahankan sumber dan perilaku seluruh modul sampai ada pengganti yang terverifikasi.
