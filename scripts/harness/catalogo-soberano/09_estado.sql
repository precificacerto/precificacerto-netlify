-- O estado de PRODUÇÃO de 31/10/2026 que o arrasto alcança, na FORMA medida (os mesmos ids das raízes, as mesmas ligações), com o conteúdo do motor
-- em poucas linhas por tabela (o volume real, ~125 mil linhas, é a prova à parte `30_volume.sh`). Medido em produção, só leitura, em 31/10/2026:
--   fornecedor Wolf Perfis (44c5c0fe): tabela 72366020 (família e categoria nulas, 735 itens, 62.295 linhas de motor por tabela_id, 4 importações,
--   1 conta_tabela, motor_path) e 21acfa75 (PVC, PERFIL, vazia); motor 9a233c55 (62.295 linhas por motor_id, 4 importações, 1 ligação PVC);
--   1 vínculo de conta (a De Paula: Wolf como Perfil principal); 9 arquivos no Storage na pasta do fornecedor; esquadrias_base com "Wolf Perfis".
--   IMAB (f3ee59c4): tabela fe2c6667 (PVC, FERRAGENS, vazia). Estrela (520b1fb2): tabela 5f7acebf (sem família, 24 itens), vínculo VIDRO da De Paula.
--   matéria-prima PVC da De Paula (79d764fe): 7 categorias, 2 vínculos de fornecedor, 4 ferragens, 3 instalações, 4 vidros; 7 ramificações; 3 etapas.
--   levantamento: 2, com 4 itens, NENHUM com família, motor ou tabela.
CREATE TABLE IF NOT EXISTS public.orcamentista_esquadrias_base (tenant_id uuid, fornecedor_perfil text);
CREATE TABLE IF NOT EXISTS public.orcamentista_esquadrias_padrao (nicho_id uuid, fornecedor_perfil text);

-- o item de levantamento como em produção: sem família, sem motor, sem tabela
update public.orcamentista_levantamento_item set familia = null, motor_id = null, motor_familia_exigida = null, tabela_id = null;

insert into public.orcamentista_fornecedor (id, nicho_id, nome) values
  ('f3ee59c4-43ec-4656-ac66-9f56d5e585e8', '00000000-0000-4000-8000-0000000000a1', 'IMAB INDUSTRIA METALURGICA LTDA'),
  ('520b1fb2-8834-421d-88ee-91790fa04bcb', '00000000-0000-4000-8000-0000000000a1', 'INDUSTRIA DE VIDROS TEMPERADOS ESTRELA LTDA')
on conflict (id) do update set nome = excluded.nome;
-- as duas tabelas de antes (Wolff e Estrela) nasceram antes da trava de categoria da 20261027000005; aqui ela se desliga só para montá-las
alter table public.orcamentista_tabela disable trigger orcamentista_tabela_categoria_guarda;
insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, categoria_chave) values
  ('72366020-57c9-489f-9385-397b7fa3dedb', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/arquivo/wolff.xlsm', 'Perfis_de_PVC_-_Wolff.xlsx',
   '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/wolff-motor.xlsx', 'Motor_Wolf_PVC.xlsx', null, null),
  ('21acfa75-e4e7-4de6-9b96-cdd95525467d', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/arquivo/perfil.xlsx', 'Perfis_de_PVC_-_Wolff.xlsx', null, null, 'PVC', 'PERFIL'),
  ('fe2c6667-652f-43bd-89d2-fd63673dc966', 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8', 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8/arquivo/imab.xlsx', 'FERRAGENS - IMAB INDUSTRIA METALURGICA LTDA.xlsx', null, null, 'PVC', 'FERRAGENS'),
  ('5f7acebf-3c91-46de-af00-57a47f8be288', '520b1fb2-8834-421d-88ee-91790fa04bcb', '520b1fb2-8834-421d-88ee-91790fa04bcb/arquivo/estrela.xlsx', 'INDUSTRIA_DE_VIDROS_TEMPERADOS_ESTRELA_LTDA.xlsx', null, null, null, null)
on conflict (id) do update set fornecedor_id = excluded.fornecedor_id, arquivo_path = excluded.arquivo_path, arquivo_nome = excluded.arquivo_nome, motor_path = excluded.motor_path,
  motor_nome = excluded.motor_nome, familia = excluded.familia, categoria_chave = excluded.categoria_chave;
alter table public.orcamentista_tabela enable trigger orcamentista_tabela_categoria_guarda;
insert into public.orcamentista_tabela_item (tabela_id, codigo) select '72366020-57c9-489f-9385-397b7fa3dedb', 'W' || g from generate_series(1, 7) g;
insert into public.orcamentista_tabela_item (tabela_id, codigo) select '5f7acebf-3c91-46de-af00-57a47f8be288', 'E' || g from generate_series(1, 3) g;
insert into public.orcamentista_conta_tabela (tenant_id, tabela_id) values ('20e08592-f957-4e72-b7eb-251387e34eb9', '72366020-57c9-489f-9385-397b7fa3dedb');

-- o CONTEÚDO do motor, nos dois donos (a tabela de antes e a cópia do motor), poucas linhas por tabela
do $c$
declare dono text; col text; n int;
begin
  foreach dono in array array['tabela', 'motor'] loop
    col := case dono when 'tabela' then 'tabela_id' else 'motor_id' end;
    n := case dono when 'tabela' then 2 else 3 end;
    execute format('insert into public.orcamentista_motor_regra (%I, codigo, tipologias) select %L::uuid, ''R'' || g, array[''T1''] from generate_series(1, %s) g', col,
      case dono when 'tabela' then '72366020-57c9-489f-9385-397b7fa3dedb' else '9a233c55-f377-45d3-b2ae-b1a740a98e44' end, n);
    execute format('insert into public.orcamentista_motor_tipologia (%I, tipologia, n_regras, n_condicionais, variaveis) select %L::uuid, ''TIP'' || g, 1, 0, ''{}'' from generate_series(1, %s) g', col,
      case dono when 'tabela' then '72366020-57c9-489f-9385-397b7fa3dedb' else '9a233c55-f377-45d3-b2ae-b1a740a98e44' end, n);
    execute format('insert into public.orcamentista_motor_insumo (%I, ordem, tipologia) select %L::uuid, g + 1, ''TIP1'' from generate_series(1, %s) g', col,
      case dono when 'tabela' then '72366020-57c9-489f-9385-397b7fa3dedb' else '9a233c55-f377-45d3-b2ae-b1a740a98e44' end, n);
    execute format('insert into public.orcamentista_motor_perfil (%I, ordem, tipologia) select %L::uuid, g + 1, ''TIP1'' from generate_series(1, %s) g', col,
      case dono when 'tabela' then '72366020-57c9-489f-9385-397b7fa3dedb' else '9a233c55-f377-45d3-b2ae-b1a740a98e44' end, n);
    execute format('insert into public.orcamentista_motor_tipologia_detalhe (%I, tipologia, descricao) select %L::uuid, ''TIP'' || g, ''d'' from generate_series(1, %s) g', col,
      case dono when 'tabela' then '72366020-57c9-489f-9385-397b7fa3dedb' else '9a233c55-f377-45d3-b2ae-b1a740a98e44' end, n);
    execute format('insert into public.orcamentista_motor_tipologia_tempo (%I, tipologia, tempo_fabricacao_min, tempo_origem) select %L::uuid, ''TIP'' || g, 600, ''ESTIMADO'' from generate_series(1, %s) g', col,
      case dono when 'tabela' then '72366020-57c9-489f-9385-397b7fa3dedb' else '9a233c55-f377-45d3-b2ae-b1a740a98e44' end, n);
    execute format('insert into public.orcamentista_motor_variavel (%I, ordem, tipologia, variavel) select %L::uuid, g + 1, ''TIP1'', ''V'' || g from generate_series(1, %s) g', col,
      case dono when 'tabela' then '72366020-57c9-489f-9385-397b7fa3dedb' else '9a233c55-f377-45d3-b2ae-b1a740a98e44' end, n);
    execute format('insert into public.orcamentista_motor_otimizacao (%I, ordem, parametro) select %L::uuid, g + 1, ''P'' || g from generate_series(1, %s) g', col,
      case dono when 'tabela' then '72366020-57c9-489f-9385-397b7fa3dedb' else '9a233c55-f377-45d3-b2ae-b1a740a98e44' end, n);
    execute format('insert into public.orcamentista_importacao (%I, itens, regras, tipologias, cruzam, nao_cruzam, normalizados, avisos) select %L::uuid, 0, 0, 0, 0, 0, 0, ''[]'' from generate_series(1, 2) g', col,
      case dono when 'tabela' then '72366020-57c9-489f-9385-397b7fa3dedb' else '9a233c55-f377-45d3-b2ae-b1a740a98e44' end);
  end loop;
end $c$;

-- a base de conhecimento da De Paula na matéria-prima PVC: uma categoria por ramificação, e os dados de algumas
insert into public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave)
select '20e08592-f957-4e72-b7eb-251387e34eb9', '79d764fe-4acd-43e2-bed9-38e20667ca3d', r.categoria_chave from public.orcamentista_familia_ramificacao r where r.familia = 'PVC';
insert into public.orcamentista_mp_categoria_fornecedor (tenant_id, mp_categoria_id, fornecedor_id, principal, ordem)
select c.tenant_id, c.id, case c.categoria_chave when 'PERFIL' then '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'::uuid else '520b1fb2-8834-421d-88ee-91790fa04bcb'::uuid end, true, 1
  from public.orcamentista_mp_categoria c where c.materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' and c.categoria_chave in ('PERFIL', 'VIDRO');
insert into public.orcamentista_mp_ferragem (mp_categoria_id, ordem) select c.id, g from public.orcamentista_mp_categoria c, generate_series(1, 4) g
 where c.materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' and c.categoria_chave = 'FERRAGENS';
insert into public.orcamentista_mp_instalacao (mp_categoria_id, produto) select c.id, 'P' || g from public.orcamentista_mp_categoria c, generate_series(1, 3) g
 where c.materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' and c.categoria_chave = 'INSTALACAO';
insert into public.orcamentista_mp_vidro (mp_categoria_id, ordem) select c.id, g from public.orcamentista_mp_categoria c, generate_series(1, 4) g
 where c.materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' and c.categoria_chave = 'VIDRO';

-- o que NÃO tem FK e fica (decisão 5): os arquivos do Storage e o texto fornecedor_perfil
insert into storage.objects (bucket_id, name) select 'atendimentos-ia', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/' || x from unnest(array[
  'arquivo/wolff.xlsm', 'arquivo/perfil.xlsx', 'motor/wolff.xlsx', 'motor/wolff-motor.xlsx', 'arquivo/a.xlsx', 'arquivo/b.xlsx', 'arquivo/c.xlsx', 'arquivo/d.xlsx', 'arquivo/e.xlsx']) x;
insert into storage.objects (bucket_id, name) values ('atendimentos-ia', 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8/arquivo/imab.xlsx');
insert into public.orcamentista_esquadrias_base (tenant_id, fornecedor_perfil) values ('20e08592-f957-4e72-b7eb-251387e34eb9', 'Wolf Perfis');

do $d$ begin
  if (select count(*) from public.orcamentista_mp_categoria where materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d') <> 7
     or (select count(*) from public.orcamentista_familia_etapa where materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' and motor_id is not null) <> 3
     or (select count(*) from public.orcamentista_motor_familia where motor_id = '9a233c55-f377-45d3-b2ae-b1a740a98e44') <> 1 then
    raise exception 'o estado de 31/10 nao montou';
  end if;
end $d$;
