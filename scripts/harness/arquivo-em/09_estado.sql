-- O estado de PRODUÇÃO das tabelas de fornecedor em 01/11/2026, depois das 21:08 UTC (medido só com leitura), sobre a base da tabela-soberana
-- (a cadeia real com a 20261101000001 aplicada):
--   - a 72366020 (Perfis_de_PVC_-_Wolff.xlsx) saiu às 21:07:44 pelo arrasto do catálogo — aqui sai do mesmo jeito, logada;
--   - as três que ficaram, com o criado_em e o arquivo de produção. A 21acfa75 teve o arquivo trocado às 21:08:19 (o objeto do Storage),
--     e a linha só guarda o criado_em de 29/10 — é o defeito. A Estrela tem arquivo_path vazio ('') e nenhum objeto.
\set ON_ERROR_STOP 1
--   - as duas tabelas dos stubs da base (...c1, ...c2) não existem em produção: saem do mesmo jeito.
select t, public.superadmin_remover_do_catalogo('e0000000-0000-0000-0000-000000000001'::uuid, 'tabela', t,
  public.superadmin_arrasto_do_catalogo('tabela', t) ->> 'assinatura') is not null as removida
  from unnest(array['72366020-57c9-489f-9385-397b7fa3dedb', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2']) t;
update public.orcamentista_tabela set criado_em = '2026-10-25 18:56:49.619728+00', arquivo_path = '' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
update public.orcamentista_tabela set criado_em = '2026-10-28 16:24:41.563921+00',
  arquivo_path = 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8/arquivo/9343002e-5105-474c-805b-f2b09b8e43f8-FERRAGENS-IMAB-INDUSTRIA-METALURGICA-LTDA.xlsx'
 where id = 'fe2c6667-652f-43bd-89d2-fd63673dc966';
update public.orcamentista_tabela set criado_em = '2026-10-29 19:26:10.322233+00', arquivo_nome = 'Tabela_Wolff_Perfis_PVC.xlsx',
  arquivo_path = '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/arquivo/7c21ef14-b1be-40f8-84d4-3d743b1cb7b3-Tabela_Wolff_Perfis_PVC.xlsx'
 where id = '21acfa75-e4e7-4de6-9b96-cdd95525467d';
-- os objetos do Storage dos dois arquivos que existem (medido em 02/11/2026: bucket atendimentos-ia, um objeto por nome); a Estrela não tem objeto
insert into storage.objects (bucket_id, name, created_at) values
  ('atendimentos-ia', 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8/arquivo/9343002e-5105-474c-805b-f2b09b8e43f8-FERRAGENS-IMAB-INDUSTRIA-METALURGICA-LTDA.xlsx', '2026-10-28 16:24:39.442187+00'),
  ('atendimentos-ia', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/arquivo/7c21ef14-b1be-40f8-84d4-3d743b1cb7b3-Tabela_Wolff_Perfis_PVC.xlsx', '2026-11-01 21:08:19.337432+00');
-- o CONTRASTE do bucket: um objeto de MESMO nome em outro bucket não é o arquivo da tabela (a Estrela continua sem objeto; a IMAB não muda)
insert into storage.objects (bucket_id, name, created_at) values
  ('comprovantes', 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8/arquivo/9343002e-5105-474c-805b-f2b09b8e43f8-FERRAGENS-IMAB-INDUSTRIA-METALURGICA-LTDA.xlsx', '2026-10-01 00:00:00+00');
do $c$ begin
  if (select count(*) from public.orcamentista_tabela) <> 3 then raise exception 'estado: esperava 3 tabelas, ha %', (select count(*) from public.orcamentista_tabela); end if;
end $c$;
