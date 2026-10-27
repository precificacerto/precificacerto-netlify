-- O estado ANTES da 20261027000009: a réplica de produção, a 20261027000006 e a 20261027000007 REAIS (a de hoje, já aplicada em produção),
-- e a Estrela COMO ESTÁ em produção (medido em 27/10/2026): motor_path e motor_nome VAZIOS (comprimento 0), não nulos.
update public.orcamentista_tabela set motor_path = '', motor_nome = '' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
-- a FOTO: o que existe antes da migração, para os casos provarem que ela só tirou uma restrição.
create table public.h_foto_conteudo as
  select id, md5(t::text) as h from public.orcamentista_tabela t;
create table public.h_foto_restricoes as
  select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.orcamentista_tabela'::regclass;
create table public.h_foto_gatilhos as
  select tgname from pg_trigger where tgrelid = 'public.orcamentista_tabela'::regclass and not tgisinternal;
