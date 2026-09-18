# HSN-010 — Migrasi UI ke GitHub dan Vercel

Scope disepakati 18 September 2026: migrasi UI terlebih dahulu; Next.js/TypeScript ditunda untuk menghemat kredit.

- Repository: ekariashoesanti-alt/Hasnaria-ice-cream, asal aplikasi aktif dan terhubung ke Vercel.
- Production: main, proyek hasnaria-business-analyzer.
- Backend/Auth tetap Supabase bnnhmtkpdjlgehsvgoda, tanpa perubahan schema/data.
- Login, password reset, upload pembelian + tahun, importer penjualan, stok/opname/resep, keuangan/approval, HR, pemasaran, dan pengaturan memakai implementasi existing.
- Shell sidebar navy/blue/white dari UI Site dimigrasikan. Ringkasan menggunakan get_ui_bootstrap_v4; inventory, costing, action queue dan audit dimuat saat halaman dibuka.
- Views: ui_inventory_items, ui_hpp_blockers, ui_erp_action_queue_v4, ui_recent_erp_audit. Data tetap melalui authenticated client dan RLS; brand response diverifikasi.
- Nilai laba hanya berasal dari kolom verified backend. Null ditampilkan sebagai belum tersedia; tidak ada estimasi HPP.
- Daftar rincian dibatasi 500 baris dan diberi label; dashboard bulanan mengikuti maksimal 12 periode dari bootstrap.
- Drawer tindakan menampilkan petunjuk dan membuka modul existing. Form resolusi RPC baru belum termasuk migrasi UI ini.
- Tidak ada env/server secret baru untuk runtime static. Konfigurasi public Supabase existing dipertahankan.
- ChatGPT Site tetap hidup. Jangan menganggap seluruh roadmap ERP sudah selesai.

## Verifikasi

Jalankan `node scripts/vercel-build-check.js`. Gate meliputi syntax, importer, authority user_profiles, password policy, canonical runtime, CSP dan tracker.

Build style diperbaiki agar pemasangan stylesheet tidak masuk ke fungsi loader CSS sebelahnya (ReferenceError s). Regression test mengeksekusi loader hasil build.

Preview harus diverifikasi sebelum merge. Lakukan pemeriksaan read-only tanpa mengirim impor, konfirmasi biaya, atau transaksi percobaan ke produksi.

## Pengembangan selanjutnya

Next.js App Router + TypeScript adalah pekerjaan terpisah setelah migrasi UI ini. Pertahankan sumber dan perilaku seluruh modul sampai ada pengganti yang terverifikasi.
