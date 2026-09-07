# Hasnaria Role Matrix

`public.user_profiles` adalah source of truth authority. UI boleh menyembunyikan tombol, tetapi Supabase RLS/trigger adalah batas keamanan final.

## Status akses

- `pending`: hanya dapat membaca/memperbarui profil sendiri dalam batas trigger; tidak mendapat akses data bisnis.
- `active` + role non-pending: dapat membaca data operasional brand sendiri sesuai policy read.
- Owner aktif terakhir tidak dapat didemote, disuspend, dipindah brand, atau dihapus sampai ada Owner aktif pengganti.

## Matriks domain

| Domain | Read | Write |
| --- | --- | --- |
| Penjualan / daily metrics / normalized sales | semua member aktif brand | Owner, Head of Store, PIC Shift, Pelaksana |
| Pengeluaran | semua member aktif brand | insert: Owner, Head of Store, PIC Shift; approval mengikuti threshold Owner/Head |
| Inventory / stok | semua member aktif brand | Owner, Head of Store, PIC Shift |
| Konten Instagram/TikTok | semua member aktif brand | Owner, Head of Store, Marketing |
| Shift (`HASNARIA_SHIFT`) | semua member aktif brand | Owner, Head of Store, PIC Shift |
| HR/Izin (`HASNARIA_HR`) | semua member aktif brand | Owner, Head of Store, PIC Shift |
| Produk/PAR | semua member aktif brand | Owner, Head of Store, PIC Shift |
| Team/User authority | diri sendiri; Owner dapat roster | perubahan authority hanya Owner dan tetap dibatasi trigger |

## Invariant

1. Pending tidak boleh menjadi member aktif hanya karena memiliki `brand_id`.
2. Read access dan write access dipisah; role yang read-only tidak otomatis mendapatkan write.
3. `social_contents` adalah shared table, sehingga permission ditentukan juga oleh `platform`.
4. Browser tidak pernah menggunakan `service_role`/secret key.
5. Semua perubahan role/status/brand tetap melewati `user_profiles` RLS dan authority trigger.
