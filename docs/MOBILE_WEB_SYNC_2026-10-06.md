# HSN-011 — Sinkronisasi HP Owner/Staff dan web

Implementasi siap ditinjau. Status **REVIEW** karena rekonsiliasi dengan akun Owner dan Staff asli pada produksi belum dilakukan.

## Perilaku yang diperbaiki

HP Owner, HP Staff, dan web tetap menggunakan Supabase Hasnaria yang sama. Pembacaan latar belakang berjalan setiap 30 detik saat aplikasi terlihat dan online, saat kembali ke aplikasi, serta setelah perubahan tersimpan. Sinyal antartab hanya membawa penanda perubahan; data bisnis dan token tidak disalin ke kanal tersebut.

| Layar | Data yang disegarkan | Perlindungan saat refresh |
|---|---|---|
| Owner HP | Pegawai, approval absensi, lokasi, supervisor | Shell/header/nav tetap; editor dan detail pegawai dipertahankan |
| Staff HP | Sesi/modul, absensi, riwayat/koreksi, direktori pegawai | Respons sesi/bulan lama ditolak; form koreksi tetap |
| Gudang HP | Ringkasan harian, kuantitas, riwayat, antrean supervisor | Tanggal pada form terikat ke snapshot; form aktif tidak ditimpa saat lewat tengah malam |
| Rekonsiliasi Pembelian HP | Antrean dan opsi pembayaran/akun | Pilihan diikat ke ID transaksi, tetap saat urutan/baris berubah |
| Owner web | Ringkasan CEO, Penjualan, Pembelian, Keuangan, Administrasi, Stok, Operasional | Hanya layar aktif; bulan/filter/dialog/draft tetap; data sama tidak merender ulang |

Polling hanya membaca laporan yang tersimpan. Approval, posting stok, rebuild jurnal, tutup buku, dan impor tetap menggunakan tindakan serta kontrol database yang sudah ada. Transaksi yang masih menunggu persetujuan tidak dipaksakan menjadi transaksi final oleh refresh.

## Integrasi dengan main terbaru

Perubahan digabung dengan pembaruan UI, filter bulanan bersama, fast RPC, Gudang, dan coordinator dari main sampai `2d9524d` (PR #81). Public refresh hooks tetap tersedia dengan pembacaan aman. Satu coordinator dimuat sebelum modul di web dan kedua entrypoint Staff; mekanisme yang memaksa mount/klik tombol saat polling diganti dengan callback pembacaan modul yang menjaga identitas sesi dan layar.

Tidak ada perubahan CSS atau markup tampilan pada entrypoint dibanding main terbaru. Perbedaan HTML hanya pemuatan script dan versi cache. Tidak ada perubahan schema atau data produksi oleh HSN-011.

## Bukti verifikasi

- `node --test tests/*.test.js`: **23 berkas tes lulus**, 0 gagal.
- Syntax: **117 berkas JavaScript dan multipart Sales yang dirangkai lulus**.
- `node scripts/vercel-build.js`: **lulus**, termasuk build-check, CSP, closure artifact, dan gate Owner Mobile.
- Tes perilaku mencakup perubahan dari perangkat lain, data sama, offline/gagal baca, baca bertumpuk, perubahan sesi/root/bulan, draft yang dibuka saat fetch, PIN/email/password yang sedang diisi, dialog, pilihan rekonsiliasi, katalog yang menghapus bulan pilihan, dan pergantian hari Gudang.
- RPC dashboard, katalog periode cepat, serta RPC Owner Staff diverifikasi tersedia pada proyek Supabase `bnnhmtkpdjlgehsvgoda` melalui pemeriksaan read-only.

## Rekonsiliasi sebelum DONE

Pada preview yang telah lulus CI, gunakan akun uji Owner dan Staff yang sah untuk menyimpan satu perubahan pegawai/approval serta satu transaksi Gudang atau rekonsiliasi, lalu cocokkan dengan laporan web setelah refresh. Pastikan form yang belum disimpan, bulan pilihan, navigasi, dan layar tetap utuh. Posting final tetap mengikuti approval serta tindakan eksplisit yang berlaku.

Tes lokal memakai fixture; keberhasilan alur akun asli dan angka produksi tidak diklaim dari fixture. Status DONE menunggu bukti rekonsiliasi tersebut sesuai AGENTS.md.
