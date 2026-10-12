# HSN-617 — Arum menjadi Tari

Nama Tari mengikuti instruksi terbaru pengguna; permintaan Lestari sebelumnya digantikan. Perubahan sudah dilakukan pada data produksi Hasnaria.

Target dibaca dari satu employee bernama Arum pada brand Hasnaria dan dikonfirmasi melalui directory login publik. employee_no tetap, termasuk ketika kode historisnya tidak sesuai nama saat ini. Tidak ada akun lain yang diubah.

Operasi memakai UPDATE employees.full_name dan updated_at dengan guard ID/brand/nama lama, pemeriksaan nama Tari belum dipakai akun lain, serta lock/snapshot akses dan sesi. Assertion membatalkan transaksi bila ada perubahan selain nama/waktu edit atau perubahan akses/sesi.

Hasil verifikasi:

- full_name: Tari
- employee_id_unchanged: true
- pin_unchanged: true
- access_unchanged: true
- sessions_unchanged: true
- public.staff_login_directory sesudah perubahan: Tari pada employee ID yang sama

PIN/hash/token tidak ditampilkan atau ditulis ke dokumentasi. Modules, status aktif, outlet, data absensi, employee ID dan sesi tetap. staff_owner_save tidak dipanggil karena fungsi itu mencabut sesi meskipun PIN tidak diubah. Tidak ada perubahan schema atau Auth.
