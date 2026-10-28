-- Os casos da 20261028000002, sobre o estado de PRODUÇÃO depois da migração aplicada duas vezes. `ok:` é NOTICE; `FALHOU` é ERROR.
create or replace function public.h_erro(p_sql text) returns text language plpgsql as $f$
declare cod text; msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics msg = message_text, cod = returned_sqlstate;
  return cod || '|' || msg;
end $f$;

-- CASO N1 — o nome é "PVC Wolf", a chave continua 'PVC', e o log tem o antes e o depois UMA vez (a migração foi aplicada duas)
do $$
begin
  if (select rotulo from public.orcamentista_familia_catalogo where chave = 'PVC') is distinct from 'PVC Wolf' then raise exception 'FALHOU caso N1: o nome'; end if;
  if (select count(*) from public.orcamentista_familia_catalogo) <> (select count(*) from public.orcamentista_familia_catalogo where chave in ('PVC', 'ALUMINIO')) then raise exception 'FALHOU caso N1: o catalogo mudou de tamanho'; end if;
  if (select count(*) from public.superadmin_alteracao_log where antes ->> 'migracao' = '20261028000002_familia_pvc_wolf_e_familia_so_no_perfil') <> 1 then raise exception 'FALHOU caso N1: o log nao tem exatamente uma linha'; end if;
  if not exists (select 1 from public.superadmin_alteracao_log where tabela = 'orcamentista_familia_catalogo' and chave = 'PVC' and tenant_id is null
                   and antes -> 'orcamentista_familia_catalogo' ->> 'rotulo' = 'PVC' and depois -> 'orcamentista_familia_catalogo' ->> 'rotulo' = 'PVC Wolf'
                   and depois -> 'orcamentista_familia_catalogo' ->> 'chave' = 'PVC') then raise exception 'FALHOU caso N1: o antes e o depois do log'; end if;
  raise notice 'ok: caso N1 — "PVC Wolf" com a chave PVC, e o log com antes e depois uma vez so';
end $$;
-- CASO N2 — nada mais mudou: tabelas, matérias-primas, etapas, motores, ramificações e as FKs que apontam a família
do $$
declare n int;
begin
  select count(*) into n from (select t, h from public.h_foto2
    except select 'tabela', md5(x::text) from public.orcamentista_tabela x
    except select 'materia_prima', md5(x::text) from public.orcamentista_materia_prima x
    except select 'etapa', md5(x::text) from public.orcamentista_familia_etapa x
    except select 'motor', md5(x::text) from public.orcamentista_motor x
    except select 'ramificacao', md5(x::text) from public.orcamentista_familia_ramificacao x) z;
  if n <> 0 then raise exception 'FALHOU caso N2: % linha(s) mudaram', n; end if;
  if exists (select conname, def from public.h_fks except select conname, pg_get_constraintdef(oid) from pg_constraint where contype = 'f')
     or exists (select conname, pg_get_constraintdef(oid) from pg_constraint where contype = 'f' and confrelid = 'public.orcamentista_familia_catalogo'::regclass
                except select conname, def from public.h_fks) then raise exception 'FALHOU caso N2: uma FK da familia mudou'; end if;
  raise notice 'ok: caso N2 — tabelas, materias-primas, etapas, motores, ramificacoes e as FKs da familia intactos';
end $$;
-- CASO N3 — a tabela de PERFIL tem família; as outras categorias podem ficar sem; a de antes (sem categoria) também
do $$
declare x text; antiga uuid; F text := 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8'; W text := '6d105e66-47fb-493c-8d04-b61afefe7d90';
  ins text := 'insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, familia, categoria_chave) values (%L, %L, %L, %s, %L)';
begin
  begin
    x := public.h_erro(format(ins, W, W || '/arquivo/p.xlsx', 'p.xlsx', 'null', 'PERFIL'));
    if x not like '23514|%orcamentista_tabela_familia_no_perfil%' then raise exception 'FALHOU caso N3: PERFIL sem familia devia ser recusado: %', x; end if;
    x := public.h_erro(format(ins, W, W || '/arquivo/p2.xlsx', 'p2.xlsx', quote_literal('PVC'), 'PERFIL'));
    if x <> 'ok' then raise exception 'FALHOU caso N3: PERFIL com familia: %', x; end if;
    foreach x in array array['FERRAGENS', 'VIDRO', 'ACESSORIOS_VEDACAO', 'PERSIANAS', 'REFORCO', 'INSTALACAO'] loop
      if public.h_erro(format(ins, F, F || '/arquivo/' || x || '.xlsx', x || '.xlsx', 'null', x)) <> 'ok' then raise exception 'FALHOU caso N3: % sem familia devia passar', x; end if;
    end loop;
    -- tirar a família da tabela de PERFIL que existe: recusado; tirar a da IMAB (FERRAGENS): passa
    x := public.h_erro($q$update public.orcamentista_tabela set familia = null where id = '5f52bb9e-c83b-4f0b-b715-4fe18db2a620'$q$);
    if x not like '23514|%' then raise exception 'FALHOU caso N3: tirar a familia do PERFIL: %', x; end if;
    x := public.h_erro($q$update public.orcamentista_tabela set familia = null where id = 'fe2c6667-652f-43bd-89d2-fd63673dc966'$q$);
    if x <> 'ok' then raise exception 'FALHOU caso N3: tirar a familia da ferragem: %', x; end if;
    -- a tabela de antes (sem categoria, sem família — a da Wolff em produção) ganha a categoria PERFIL: só com família
    select id into antiga from public.orcamentista_tabela where categoria_chave is null and familia is null limit 1;
    if antiga is null then raise exception 'FALHOU caso N3: o estado nao tem tabela de antes, sem categoria e sem familia'; end if;
    x := public.h_erro(format('update public.orcamentista_tabela set categoria_chave = %L where id = %L', 'PERFIL', antiga));
    if x not like '23514|%orcamentista_tabela_familia_no_perfil%' then raise exception 'FALHOU caso N3: dar PERFIL a tabela sem familia: %', x; end if;
    x := public.h_erro(format('update public.orcamentista_tabela set categoria_chave = %L, familia = %L where id = %L', 'PERFIL', 'PVC', antiga));
    if x <> 'ok' then raise exception 'FALHOU caso N3: dar PERFIL com a familia junto: %', x; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso N3 — PERFIL exige familia (no insert e no update); ferragem, vidro, acessorios, persianas, reforco e instalacao podem ficar sem';
end $$;
-- CASO N4 — a CHECK entrou validada, com o comentário que diz a razão
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orcamentista_tabela_familia_no_perfil' and convalidated
                   and obj_description(oid, 'pg_constraint') like '%obrigatoria so na tabela de PERFIL%') then raise exception 'FALHOU caso N4'; end if;
  raise notice 'ok: caso N4 — a CHECK validada e comentada';
end $$;
