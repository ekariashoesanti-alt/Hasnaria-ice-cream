# HSN-614 — Catatan Clock In/Out staf di lokasi toko

Permintaan pengguna: setelah Clock In tersimpan di toko, tampilkan catatan hijau seperti referensi; setelah Clock Out tersimpan, tampilkan catatan di bawah Clock In dengan palet merah. Perubahan visual hanya pada kartu Riwayat Hari Ini; header, navigasi, dan modul lain dipertahankan.

## Perilaku

- Riwayat kosong sebelum absensi tersimpan. Kartu menampilkan jam server, ikon toko, Clock In/Clock Out, dan badge Disetujui. Badge normal menjelaskan melalui title/aria bahwa absensi tersimpan otomatis tanpa approval Owner; tidak dibuat status approval baru.
- Clock In hijau lebih dahulu; Clock Out merah di bawahnya. Perubahan/koreksi waktu menyegarkan kartu tanpa duplikasi.
- Setiap klik memperoleh GPS baru dengan `maximumAge:0`, memeriksa radius toko 50 m, lalu memanggil RPC yang sudah ada. Koordinat di luar radius atau izin GPS ditolak tidak mengirim mutasi. Klik bertumpuk ditahan; konteks sesi atau layar yang berubah membatalkan kelanjutan respons.
- Timestamp respons RPC diterapkan segera setelah server berhasil menyimpan. Jika pembacaan laporan berikutnya gagal, catatan yang sudah tersimpan tetap tampil; kegagalan mutasi tidak membuat catatan semu.
- Header Permissions-Policy mengizinkan `geolocation=(self)` agar halaman Hasnaria dapat meminta GPS perangkat. Camera, microphone, dan payment tetap menggunakan kebijakan sebelumnya.
- Kedua entrypoint Staff memiliki versi cache baru untuk runtime dan CSS/JS mobile shell. Service worker tetap memakai network-first untuk navigasi.

## Enforcement yang sudah ada

Migration `20260926113500_staff_attendance_radius50_manual_correction_only.sql` menolak lokasi toko/GPS kosong atau jarak di atas 50 m, dengan validasi sesi dan akses modul di database. Tidak ada perubahan schema, role/grant, login, atau data produksi pada HSN-614. GPS browser bukan mekanisme pencegah spoofing lokasi.

Edge yang sudah ada: reader hari ini memilih outlet roster, sedangkan RPC Clock Out memeriksa outlet attendance tersimpan. Perubahan roster setelah Clock In dapat menyebabkan titik yang ditampilkan berbeda; enforcement database tetap berlaku. Definisi SQL live dan alur GPS/akun Staff asli belum diverifikasi dalam sesi ini.

## Validasi

- `node --test tests/*.test.js`:25 berkas lulus,0 gagal.
-10 kasus lokasi/mutasi dan6 kasus kartu pada dua berkas baru; existing Staff synchronization tetap lulus.
- `node scripts/vercel-build.js`:lulus, termasuk build-check, CSP, dan Owner Mobile gates.
- CI menjalankan tes kartu dan lokasi, disamping regression sync yang sudah ada.

Status REVIEW sampai acceptance Staff pada target produksi. Tes fixture tidak diklaim sebagai uji browser/GPS atau transaksi produksi asli.
