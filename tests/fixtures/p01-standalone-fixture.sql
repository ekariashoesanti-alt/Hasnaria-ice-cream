-- ISOLATED POSTGRES TEST FIXTURE. Never run on Hasnaria production.
CREATE SCHEMA private;
CREATE TABLE public.offline_purchase_history (
 id uuid PRIMARY KEY, brand_id uuid NOT NULL, source_period date,
 source_file text, row_no integer, purchase_date date, item_name text,
 quantity_text text, unit_text text, unit_price numeric,
 total_amount numeric, notes text
);
CREATE TABLE public.inventory_purchase_log (
 id uuid PRIMARY KEY, brand_id uuid NOT NULL, source_history_id uuid
);
INSERT INTO public.offline_purchase_history
(id,brand_id,source_period,source_file,row_no,purchase_date,item_name,quantity_text,unit_text,unit_price,total_amount,notes)
VALUES
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','2026-09-01','source.xlsx',1,'2026-09-01','LINKED','2','pcs',5,10,'metadata'),
 ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','2026-09-01','source.xlsx',2,'2026-09-02','UNLINKED','1','pcs',2,2,'metadata'),
 ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001','2026-09-01','source.xlsx',3,'2026-09-03','OTHER','1','pcs',3,3,'metadata');
INSERT INTO public.inventory_purchase_log (id,brand_id,source_history_id)
VALUES ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101');
