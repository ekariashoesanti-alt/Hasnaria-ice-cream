# Hasnaria Business Analyzer

Dashboard operasional & bisnis live untuk **Hasnaria**.

**Live:** https://hasnaria-business-analyzer.vercel.app

## Fitur saat ini

- Login / Signup (Supabase Auth)
- **Dashboard**: Omzet 30 hari, growth, average ticket, pembelian, waste, kompensasi
- **Penjualan**: Input data harian + tabel
- **Operasional**: Input pembelian, waste, kompensasi dengan batas Authority
- **Medsos**: Input performa konten Instagram/TikTok
- **Authority**: Matrix keputusan + 5 Aturan Emas
- Diagnosis otomatis + rekomendasi aksi

## Authority Limits (sudah diimplementasi di UI)

| Jenis              | Batas Head of Store     |
|--------------------|-------------------------|
| Pembelian rutin    | Rp 1.500.000 / transaksi |
| Kompensasi         | Rp 50.000               |
| Di atas batas      | Wajib approval Owner    |

## Tech Stack

- HTML + Vanilla JS
- Supabase (Auth + Postgres)
- Chart.js
- Deployed on Vercel

## Database tables yang dipakai

- `brands`
- `daily_metrics`
- `social_contents`
- `expenses` (pembelian / waste / kompensasi)

## Next roadmap

- Role-based access (Owner / Head of Store / PIC)
- Stock opname & variance
- Laporan harian otomatis ke Owner
- Multi-outlet
