# HSN-010 — Migrasi UI ke GitHub dan Vercel

Scope disepakati 18 September 2026: migrasi UI terlebih dahulu; Next.js/TypeScript ditunda untuk menghemat kredit.

- Repository: ekariashoesanti-alt/Hasnaria-ice-cream, asal aplikasi aktif dan terhubung ke Vercel.
- Production: `main`, proyek `hasnaria-business-analyzer`.
- Backend/Auth tetap Supabase `bnnhmtkpdjlgehsvgoda`. Migration yang dibutuhkan Action Center disimpan di `supabase/migrations/` dan harus tetap sinkron dengan backend live.
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
- missing recipe draft → `save_product_recipe_draft`
- recipe verification + `effective_from` → `resolve_product_recipe_verification_v2`
- missing component cost → `resolve_inventory_item_cost_verification`
- sale-item mapping → `resolve_sale_item_product_mapping`
- selling-price confirmation → `resolve_product_selling_price`
- historical inventory baseline → `resolve_inventory_baseline_candidate`
- financing review → `resolve_financing_payment_candidate`
- invalid purchase quantity per source row → `resolve_purchase_quantity_override`
- unmatched purchase classification → `resolve_purchase_item_rule`
- unverified inventory classification → `resolve_purchase_item_rule`
- zero-amount purchase → `resolve_zero_amount_purchase_candidate`
- physical stock / untracked stock → `resolve_physical_stock_opname`

Kontrol keselamatan:

- Tidak ada action bisnis yang auto-confirm saat halaman dibuka.
- Semua mutation membutuhkan alasan/catatan audit.
- Pack size dan quantity multiplier tidak diberi default tebakan.
- Invalid quantity diselesaikan per `source_history_id`; suggestion hanya ditampilkan bila backend menandainya deterministik.
- Unmatched purchase tidak diberi klasifikasi default. Item ambigu seperti `PINES` tetap menunggu keputusan Owner.
- Posting transaksi historis pada purchase rule adalah checkbox eksplisit dan default **tidak aktif**.
- Zero-amount purchase tidak menulis ulang raw import. Owner harus memilih `actual_amount` dengan nominal > 0 berdasarkan bukti atau `exclude`; tidak ada nominal default.
- Resolution zero-amount disimpan terpisah dan diaudit. `actual_amount` menjadi effective amount downstream; `exclude` mengeluarkan baris dari mapping/posting.
- Physical stock opname hanya menerima qty fisik >= 0, tanggal <= hari ini, dan alasan. `system_qty` dibaca dari ledger; tidak ada tebakan quantity atau valuation.
- Financing `cash_paid` membutuhkan tanggal dan nominal kas; PAYLATER/utang tidak otomatis dianggap cash-out.
- Baseline historis diberi peringatan bahwa nilainya bukan stock opname hari ini.
- Missing recipe disimpan sebagai **draft**. Draft tidak mengurangi stok dan tidak digunakan HPP.
- Recipe yang sudah verified hanya menghasilkan `SALE_CONSUMPTION` dan verified COGS untuk transaksi pada/ setelah `effective_from`.
- Perubahan komponen recipe otomatis membuka kembali status menjadi draft dan membersihkan derived COGS/inventory consumption yang tidak lagi valid.
- Sebanyak 2.694 legacy `SALE_CONSUMPTION` rows yang berasal dari recipe belum verified dibersihkan secara deterministik saat temporal rule diaktifkan; transaksi penjualan sumber tidak diubah.
- Missing component cost diselesaikan per **inventory item**, bukan per produk. Satu verified cost dapat membuka beberapa produk yang memakai komponen yang sama.
- Verified component cost tersimpan sebagai histori temporal (`unit_cost`, `effective_from`, `source_reference`, verifier). Workflow ini tidak mengubah quantity stok maupun raw purchase history.
- Histori harga pembelian yang belum trusted hanya ditampilkan sebagai **referensi** dan tidak diprefill sebagai verified cost. Saat implementasi, item yang masih butuh input Owner adalah `MIE KUNING`, `BERAS`, dan `SAUS GOCHUJANG`; belum ada manual cost verification yang dibuat otomatis.
- HPP temporal memilih cost terverifikasi terakhir yang berlaku pada tanggal transaksi. Valuasi inventory memakai latest verified cost sampai hari ini.
- Setelah RPC sukses, bootstrap/action queue dimuat ulang.

Semua tipe blocker utama di Action Center sekarang memiliki workflow resolusi aman. Namun data bisnis masih tetap menunggu input Owner untuk item yang membutuhkan bukti; implementasi UI/RPC tidak berarti blocker tersebut sudah diselesaikan.

Write bisnis hanya terjadi jika Owner yang sudah login secara eksplisit mengirim form action; backend RLS/RPC tetap menjadi enforcement utama.

## Verifikasi

Jalankan `node scripts/vercel-build-check.js`. Gate meliputi syntax, importer, authority `user_profiles`, password policy, canonical runtime, CSP, tracker, integrasi shell ERP, dan kontrak parameter RPC Action Center.

Regression test menjaga modul existing Penjualan/Pembelian/Keuangan/Stok tetap tersedia, memvalidasi parameter RPC, memastikan recipe draft terpisah dari verification, menolak duplicate component/qty <= 0, dan menolak verified cost tanpa nominal positif, tanggal berlaku valid, serta sumber bukti.

Final automated gate: GitHub Hasnaria Audit Gate dan Vercel Preview harus hijau pada head PR. Supabase security advisor tidak menemukan vulnerability database baru; warning yang masih ada hanya pengaturan Auth `Leaked Password Protection Disabled`. Performance advisor setelah FK index fix hanya melaporkan unused-index INFO pada workload saat ini.

Preview harus diverifikasi sebelum merge. Pemeriksaan authenticated Owner tetap dilakukan read-only terlebih dahulu; jangan mengirim impor, konfirmasi biaya, recipe, verified cost, stock opname, atau transaksi percobaan hanya untuk smoke test.

## Pengembangan selanjutnya

Next.js App Router + TypeScript adalah pekerjaan terpisah setelah migrasi UI ini. Pertahankan sumber dan perilaku seluruh modul sampai ada pengganti yang terverifikasi.
