-- Depois da 20261029000003 (o estado de PRODUÇÃO de 29/10/2026, os mesmos ids: 1 motor, o da Wolff, sem nome; 3 etapas com ele; nenhum item com
-- motor), a FOTO do que a 20261029000005 não pode tocar além do nome: o motor (sem a coluna nova), as etapas, os itens, as ligações e o log.
create table public.h_motor_antes_da_000005 as select * from public.orcamentista_motor;
create table public.h_etapas_antes_da_000005 as select * from public.orcamentista_familia_etapa;
create table public.h_itens_antes_da_000005 as select * from public.orcamentista_levantamento_item;
create table public.h_ligacoes_antes_da_000005 as select * from public.orcamentista_motor_familia;
create table public.h_log_antes_da_000005 as select count(*) as n from public.superadmin_alteracao_log;
