-- Jalankan di Supabase SQL Editor untuk mengunci wewenang di database.
-- Aplikasi sudah jalan tanpa ini; file ini adalah pagar server-side.

alter table public.user_profiles add column if not exists email text;
alter table public.user_profiles add column if not exists role text not null default 'pending';
alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles add constraint user_profiles_role_check
  check (role in ('pending','owner','head_store','marketing','pic','pelaksana'));

alter table public.expenses add column if not exists status text not null default 'recorded';
alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses add constraint expenses_status_check
  check (status in ('recorded','pending_approval','approved','rejected'));
alter table public.expenses add column if not exists created_by uuid;

create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.user_profiles where id = auth.uid()), 'pending');
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_role() in ('owner','head_store','marketing','pic','pelaksana');
$$;
