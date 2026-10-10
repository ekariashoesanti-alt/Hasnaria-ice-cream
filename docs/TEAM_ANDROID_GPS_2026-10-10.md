# HSN-618 — GPS absensi Android

Alur: Team menekan Clock In/Out → browser mengambil lokasi → RPC memeriksa radius toko → timestamp tersimpan tampil pada kartu riwayat. Pengambilan lokasi saat halaman kembali aktif hanya memperbarui preview.

Audit lokal sebelum perubahan mereproduksi dua masalah: posisi pertama 70–100 meter dari toko dengan accuracy 20 meter menutup watcher sebelum posisi berikutnya tepat di toko; posisi di toko berumur 5–10 menit masih diterima karena timestamp tidak diperiksa. Izin lokasi yang baru disetujui setelah 12 detik juga terlambat bagi deadline aplikasi.

Pengambilan GPS sekarang terus berjalan bila posisi presisi masih di luar toko, sampai posisi baru di dalam toko diterima atau budget berakhir. Posisi di dalam toko tetap dapat diterima meski akurasinya lebih rendah dari sampel luar sebelumnya. Setiap kandidat wajib memiliki timestamp valid, maksimal 5 detik lama atau 1 detik ke depan. Koordinat tidak diubah atau digeser ke titik toko.

Permissions API hanya membantu menentukan saat izin diberikan dan tidak menghalangi native watch. Waktu menunggu prompt tidak menghabiskan budget 12 detik. Timeout browser dan callback pertama menjadi fallback bila Permissions API tidak tersedia. Watcher, timer, dan listener izin dibersihkan pada selesai/batal; hasil query izin yang terlambat tidak menghidupkan kembali capture.

Visible/pageshow memperbarui preview pada layar Clock aktif, dengan guard konteks/sesi dan coalescing. Absen tetap memerlukan klik pengguna; write yang dibatalkan tidak dilanjutkan otomatis. Pesan kegagalan memberi petunjuk izin lokasi, lokasi presisi, dan Akurasi Lokasi Google pada Android melalui area pesan yang sudah ada.

Validasi sebelum rilis:

- 30 kasus GPS, termasuk 9 tambahan Android: PASS.
- 25 berkas tes existing: PASS; full Vercel build termasuk build gate: PASS.
- Review independen: tidak ada blocker; diff/syntax dan kedua entrypoint identik: PASS.
- Chromium profil Pixel 7, mobile/touch/Android UA: mode browser dan simulasi standalone PASS. GPS 70 meter dengan accuracy 20 lalu posisi toko accuracy 30 diterima; posisi lama diabaikan; 51 meter tetap ditolak; approximate-only dan permission denial tidak membuat catatan; prompt 16 detik simulasi tetap dapat disetujui; background/resume hanya memperbarui preview.
- Kartu Clock In 07:51 hijau dan Clock Out 16:30 merah berurutan; 360/390 px tanpa overflow atau page errors. Seluruh watcher, deadline, dan listener izin selesai dibersihkan.

Artifact lokal: `/workspace/scratch/hsn618-browser/report.json`, `hsn618-tests.log`, dan `hsn618-build.log`. Verifikasi byte versi produksi canonical dilanjutkan melalui pipeline PR; hasilnya disimpan pada `hsn618-production-report.json`.

Batas penerimaan: profil browser Android dan mode standalone merupakan simulasi dengan backend tiruan, bukan HP Android fisik/PWA terpasang. Tidak dibuat absensi produksi untuk pengujian. GPS fisik di lokasi toko dan kesesuaian koordinat toko masih memerlukan bukti perangkat asli; HSN-618 tetap REVIEW. Radius 50 meter, titik toko, SQL, credential, sesi, markup, dan CSS tetap.
