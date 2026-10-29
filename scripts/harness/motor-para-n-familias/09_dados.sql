-- Depois da 20261029000002 (o estado de PRODUÇÃO de 29/10/2026, os mesmos ids), o que os casos da 20261029000003 usam:
--  - o levantamento de produção tem `nome` (o stub da cadeia não tem): a recusa de tirar família em uso nomeia o levantamento do item;
--  - a FOTO do que a migração não pode tocar: o motor (sem as colunas que saem), as etapas, os itens e o log.
alter table public.orcamentista_levantamento add column if not exists nome text;
update public.orcamentista_levantamento set nome = 'Obra da Rua A' where id = '1e000000-0000-0000-0000-000000000001';
create table public.h_motor_antes_da_000003 as select id, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path, arquivado_em, criado_por, familia from public.orcamentista_motor;
create table public.h_etapas_antes_da_000003 as select * from public.orcamentista_familia_etapa;
create table public.h_itens_antes_da_000003 as select * from public.orcamentista_levantamento_item;
create table public.h_log_antes_da_000003 as select count(*) as n from public.superadmin_alteracao_log;
