create unique index if not exists products_brand_canonical_name_uidx
on public.products (brand_id, lower(btrim(name)))
where name !~ '^HASNARIA_';
