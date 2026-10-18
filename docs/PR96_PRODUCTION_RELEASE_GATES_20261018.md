# PR #96 — Release readiness (18 Oktober 2026)

## Keputusan saat pemeriksaan: NO-GO untuk produksi

GitHub: branch PR #96 berangkat dari main tanpa konflik dan lulus static-audit; Vercel preview READY. **Ini bukan bukti UAT transaksi.**
Tidak ada perubahan ke saldo fisik, transaksi Pembelian atau jurnal produksi sebagai bagian dari pemeriksaan rilis ini.

### Masalah yang sudah diketahui dari pemeriksaan langsung

- Supabase produksi: 41 SKU dengan tracking opname, **23** menunjukkan selisih antara inventory_stock_reconciliation.system_qty dan inventory_ledger_balance. Gap terbesar 1.098 unit. Dashboard harus menampilkan kedua saldo secara jujur, bukan mengubah saldo otomatis.
- **54 resep seluruhnya draft; 0 verified**, sehingga alur konsumsi penjualan belum memiliki verifikasi resep yang dibutuhkan. Jangan backfill/verify massal.
- Hasnaria Staging Singapore `rynnpndtzjwpekbiwiif` ACTIVE_HEALTHY tetapi **belum memiliki tabel inventory_items, operational_runs, operational_run_items, atau fungsi RPC terkait**. Tidak bisa dianggap lingkungan UAT siap.
- `index.html` preview masih memakai Supabase produksi `bnnhmtkpdjlgehsvgoda`. Untuk mencegah posting tak sengaja, PR #96 sekarang menolak tindakan mutasi **Stock Opname upload**, **Purchase Excel import**, **koreksi saldo Stok**, dan **Operasional** dari preview yang masih terhubung ke backend produksi. Jalur modul lain belum dijamin sepenuhnya read-only di preview; jangan gunakan kredensial Owner nyata untuk menulis di URL preview.
- Dari log Supabase 24 jam terakhir terdapat **174 HTTP 500**: 134 pada `ui_finance_alerts`, 17 `ui_administration_overview_v1`, 17 `ui_administration_category_chart_v1`, 4 `get_finance_management_period_v1`, 1 `get_finance_period_pack_v1`, dan 1 `inventory_stock_reconciliation`. Error PostgreSQL `57014` (cancel/timeout) tercatat 174 kali. Masalah ini terjadi pada produksi yang masih memakai `main`, **belum boleh diatribusikan ke PR #96**.

### Perbaikan yang sudah dikerjakan di branch PR #96

1. Refresh saldo/infografis tidak lagi gagal total apabila pembacaan panel tambahan pending upload error.
2. Notifikasi update saat initial load aktif dipertahankan dan diulang sesudah loader idle; perubahan draft antar sesi diperbarui tanpa posting otomatis.
3. Guard penolakan mutasi dari preview yang masih menggunakan database produksi ditambahkan pada jalur upload Purchase, upload Stock, approval Opname melalui Operasional, dan entry koreksi Stok. Commit diuji dengan mock regresi.
4. Data historical Purchase, stock ledger, dan jurnal tetap tidak dimutasi sebagai bagian dari PR validation.

### Gerbang wajib sebelum rilis

- [ ] Backup database Supabase produksi yang **restorable** disediakan, checksum dan langkah rollback/recovery diverifikasi. Jangan berasumsi Vercel rollback mengembalikan transaksi database.
- [ ] Siapkan staging schema-only tanpa mereplikasi data pelanggan. Workflow `.github/workflows/hasnaria-staging-schema.yml` saat ini `validate-only` dan **tidak memulihkan skema secara permanen**. Proses restore yang benar ke staging memerlukan review terpisah serta kredensial di GitHub Actions Secrets, bukan dikirim lewat chat.
- [ ] Pastikan preview untuk UAT memakai staging Supabase (URL dan publishable key staging) dan tidak bergantung pada project ID produksi. Simulasi memakai data sintetis brand, user Owner/Staff dan 2+ SKU.
- [ ] UAT terautentikasi Owner: validasi file benar/salah/duplikat, draft 0 dan kuantitas positif, recovery draft parsial, submit, approve; hitung snapshot ledger yang tepat, satu checkpoint per SKU, refresh view Stok dan infografis. Uji Staff tidak dapat approval.
- [ ] UAT BELANJA: periode baru kosong → tepat satu insert atomik, jenis pembayaran single-source → Finance sesuai status, import ulang diblokir; periode lama tidak terhapus; mixed funding dan Majoo review-only tidak memposting; tidak ada jurnal ganda.
- [ ] Triage dan mitigasi timeout `ui_finance_alerts` dan Administrasi agar tidak menambah beban read setelah rilis; penanganan kegagalan harus jelas kepada Owner.
- [ ] Periksa konsistensi sumber Stock ↔ ledger dan sign-off atas 23 discrepancy yang telah ada (minimal tampilan transparan tanpa auto-post). Test manual login Owner/Staff di staging + bukti hasil tanpa data produksi.
- [ ] Audit Gate, Vercel preview, pr-head SHA dan staging sign-off harus cocok pada commit yang sama. Release ke `main` hanya setelah kondisi di atas tercapai.

### Prosedur release jika semua gerbang sudah lulus

1. Catat commit `main` terakhir sebagai target rollback dan verifikasi backup Supabase.
2. Pastikan GitHub checks dan Vercel untuk SHA PR terakhir READY.
3. Merge commit PR #96 menggunakan expected HEAD SHA agar tidak masuk commit belum dites.
4. Tunggu deployment production target main READY; lakukan GET/read-only smoke terlebih dahulu.
5. Jalankan smoke terautentikasi yang tidak mengubah data produksi, amati error 5xx/timeout, dan baru aktifkan proses operasional setelah Owner menerima.
6. Jika regression UI: rollback deployment Vercel ke commit produksi sebelumnya. **Database perlu prosedur pemulihan terpisah** jika ada perubahan transaksi.

### Lingkup di luar PR #96

PR #88 mencakup migration ledger/unit/lineage dengan gate backup yang belum terpenuhi; PR #83 mencakup penyederhanaan load Finance/Admin. Keduanya belum merged dan bercabang dari kode lama. Jangan merge tanpa rebase dan pengujian khusus.
