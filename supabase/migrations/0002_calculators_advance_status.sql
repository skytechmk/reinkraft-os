-- 0002: weight and surface per metre (calculators), advance payment and status note on projects.
alter table public.inventory
  add column if not exists weight_kg_per_m  numeric(8,3) check (weight_kg_per_m  is null or weight_kg_per_m  >= 0),
  add column if not exists surface_m2_per_m numeric(8,4) check (surface_m2_per_m is null or surface_m2_per_m >= 0);

alter table public.projects
  add column if not exists advance_paid numeric(12,2) not null default 0 check (advance_paid >= 0),
  add column if not exists status_note  text;
