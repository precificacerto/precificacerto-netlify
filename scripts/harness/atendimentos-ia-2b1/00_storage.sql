-- HARNESS LOCAL da migração 20261019000001 (Atendimentos I.A., bloco 2B.1) — 19/10/2026.
-- NÃO TOCA PRODUÇÃO. Roda DEPOIS de `../orcamentista/00_schema.sql` e da migração do bloco 1.
--
-- RECONSTRUÍDO, a partir das colunas MEDIDAS em 19/10/2026: `storage.buckets` e `storage.objects`
-- reduzidas às colunas que a migração e os casos usam, com RLS ligada, e os privilégios MEDIDOS
-- (anon e authenticated com SELECT, INSERT, UPDATE e DELETE em `storage.objects`).
--
-- O QUE ELE NÃO PROVA: que o papel que aplica em produção pode criar o bucket e as políticas.
-- Aqui `postgres` é superusuário; lá ele não é dono de `storage.*` e depende de
-- `supautils.policy_grants` (medido) e do INSERT em `storage.buckets` (medido).
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant all on storage.buckets to service_role;
-- EXTRAÍDO (pg_policy, 19/10/2026): as três políticas do bucket `comprovantes`.
insert into storage.buckets (id, name, public, allowed_mime_types) values ('comprovantes', 'comprovantes', false, '{image/jpeg,image/png,application/pdf}');
create policy comprovantes_insert_policy on storage.objects for insert to authenticated with check (bucket_id = 'comprovantes'::text);
create policy comprovantes_select_policy on storage.objects for select to authenticated using (bucket_id = 'comprovantes'::text);
create policy comprovantes_update_policy on storage.objects for update to authenticated using (bucket_id = 'comprovantes'::text);
