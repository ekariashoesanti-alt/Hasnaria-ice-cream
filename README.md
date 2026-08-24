# Hasnaria Business Analyzer

Dashboard bisnis live untuk Hasnaria (Data → Trend → Diagnosis → Action).

## Fitur
- Login / Signup (Supabase Auth)
- Dashboard omzet 30 hari, growth, average ticket
- Input penjualan harian
- Input performa konten Instagram / TikTok
- Diagnosis otomatis + rekomendasi aksi

## Tech
- Pure HTML + Vanilla JS
- Supabase (Auth + Postgres)
- Chart.js

## Deploy
Repo ini siap di-deploy ke Vercel.

1. Import project di Vercel dari GitHub repo ini
2. Framework Preset: Other / Static
3. Deploy

Aplikasi sudah terhubung ke Supabase project Hasnaria.

## Struktur Database (Supabase)
- `brands`
- `daily_metrics`
- `social_contents`
- `products`, `sales`, `sale_items`, `expenses` (siap untuk pengembangan lanjutan)

## Next Development
- Authority Matrix & limit rupiah
- Input pembelian / waste / kompensasi
- Role-based access (Owner / Head of Store / PIC)
- Laporan harian otomatis
