# HSN-616 — GPS Clock In/Out

GPS pertama sebelumnya dapat memakai cache30detik atau fix jaringan kasar. Begitu dianggap luar radius, tombol absen dan precheck menghalangi percobaan dengan GPS baru.

GPS awal dan setiap percobaan Clock kini mengambil lokasi baru, memakai watchPosition atau retry getCurrentPosition, menunggu accuracy<=50m maksimal12detik. Sampel kasar tidak membuat catatan. Watcher/deadline/retry timer dibersihkan ketika selesai, navigasi/sesi berubah, atau halaman disembunyikan.

Tombol dapat memeriksa ulang posisi setelah pembacaan lama di luar radius/error. Sebelum write, jarak pusat GPS ke titik toko harus<=50m; SQL produksi tetap menegakkan batas tersebut. Nilai accuracy tidak dipakai menambah radius. Kartu hijau/merah tetap berasal dari timestamp tersimpan. Tidak ada perubahan layout/CSS, credential atau schema.

Validasi sebelum commit:

-21 kasus lokasi: sampel kasar→presisi, outside lama→freshinside, penolakan51m, kualitas tidak membaik/deadline, fallback retry, duplicateclick, savedreadfailure, stalecontext dan cleanup.
-25 berkas tes existing: PASS.
-Full Vercel build: PASS.
-Review independen: tanpa blocker.
-SQL produksi: radius50m pada check-in/out; center0m dan offset51m dihitung51m.
-Kedua entrypoint byte-identical dan runtime cachev8.

Batas penerimaan: lokasi fisik toko belum dibandingkan dengan GPS HP pengguna. Stored shop point atau sensor yang tetap bergeser meski mengaku presisi dapat tetap menghasilkan jarak>50m. Perubahan ini memperbaiki coarse/stale sampling serta retry; HSN-616 belum DONE sampai perangkat asli terverifikasi. Titik toko tidak diubah berdasarkan tebakan. Tidak dibuat catatan attendance uji pada akun produksi.
