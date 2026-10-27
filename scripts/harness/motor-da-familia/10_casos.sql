-- Os casos da 20261027000006. Cada um desfaz o que fez (subtransação que termina em P0099), exceto o 1 e o 2.
-- `ok:` é NOTICE; `FALHOU` é ERROR — o run.sh lê a linha inteira.

-- CASO 1 — as contagens de antes: 2 tabelas, 1 planilha, 4 itens (todos com família nula) e 0 etapas
do $$
declare n int; f int;
begin
  select count(*) into n from public.orcamentista_tabela;
  select count(*) into f from public.orcamentista_levantamento_item where familia is not null;
  if n <> 2 or f <> 0 or (select count(*) from public.orcamentista_motor) <> 1 or (select count(*) from public.orcamentista_levantamento_item) <> 4 or (select count(*) from public.orcamentista_familia_etapa) <> 0 then
    raise exception 'FALHOU caso 1: % tabelas / % itens com familia', n, f;
  end if;
  raise notice 'ok: caso 1 — 2 tabelas, 1 planilha, 4 itens (familia nula) e 0 etapas, como antes';
end $$;

-- CASO 2 — o conteúdo das linhas não mudou: o hash do jsonb das linhas de antes, sem as colunas novas, é o mesmo
do $$
declare n_t int; n_m int; n_i int;
begin
  select count(*) into n_t from public.orcamentista_tabela x join public.harness_antes a on a.t = 'tabela' and a.id = x.id
   where a.h = md5(row(x.id, x.fornecedor_id, x.arquivo_path, x.arquivo_nome, x.motor_path, x.motor_nome, x.vigencia, x.criado_em, x.criado_por, x.familia, x.vigente, x.categoria_chave)::text);
  select count(*) into n_m from public.orcamentista_motor x join public.harness_antes a on a.t = 'motor' and a.id = x.id
   where a.h = md5(row(x.id, x.familia, x.fornecedor_id, x.arquivo_nome, x.arquivo_path, x.vigente, x.arquivado_em, x.arquivado_por, x.criado_em, x.criado_por)::text);
  select count(*) into n_i from public.orcamentista_levantamento_item x join public.harness_antes a on a.t = 'item' and a.id = x.id
   where a.h = md5(row(x.id, x.tenant_id, x.levantamento_id, x.ordem, x.tipologia, x.largura_mm, x.altura_mm, x.quantidade, x.cor_perfil, x.vidro, x.escolhas, x.criado_em, x.atualizado_em, x.tabela_id, x.motor_id)::text);
  if n_t <> 2 or n_m <> 1 or n_i <> 4 then raise exception 'FALHOU caso 2: linhas iguais % / % / % (esperado 2 / 1 / 4)', n_t, n_m, n_i; end if;
  raise notice 'ok: caso 2 — as 7 linhas de antes têm o mesmo conteúdo (hash por linha)';
end $$;

-- CASO 3 — dupla aplicação: uma chave, três FKs, um índice
do $$
declare a int; b int; c int; d int;
begin
  select count(*) into a from pg_constraint where conname = 'orcamentista_motor_id_familia_key';
  select count(*) into b from pg_constraint where conname = 'orcamentista_familia_etapa_motor_fkey';
  select count(*) into c from pg_constraint where conname in ('orcamentista_levantamento_item_familia_fkey', 'orcamentista_levantamento_item_motor_familia_fkey');
  select count(*) into d from pg_indexes where indexname = 'orcamentista_tabela_uma_vigente';
  if a <> 1 or b <> 1 or c <> 2 or d <> 1 then raise exception 'FALHOU caso 3: % / % / % / %', a, b, c, d; end if;
  raise notice 'ok: caso 3 — dupla aplicação: 1 chave, 1 FK da etapa, 2 FKs do item, 1 índice';
end $$;

-- CASO 4 — o motor pode nascer SEM fornecedor (a família rege)
do $$
begin
  begin
    insert into public.orcamentista_motor (familia, fornecedor_id, arquivo_nome, arquivo_path) values ('ALUMINIO', null, 'motor-aluminio.xlsx', 'a/m');
    if (select count(*) from public.orcamentista_motor where fornecedor_id is null) <> 1 then raise exception 'FALHOU caso 4: o motor sem fornecedor não ficou'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 4 — motor sem fornecedor é aceito';
end $$;

-- CASO 5 — a etapa aponta o motor da MESMA família; sem motor também vale
do $$
declare m uuid;
begin
  begin
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao, motor_id) values ('PVC', 1, 'Apanhado', 'APANHAR', '9a233c55-f377-45d3-b2ae-b1a740a98e44');
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao) values ('PVC', 2, 'Levantamento', 'GERAR_LEVANTAMENTO');
    select motor_id into m from public.orcamentista_familia_etapa where familia = 'PVC' and numero = 1;
    if m is distinct from '9a233c55-f377-45d3-b2ae-b1a740a98e44'::uuid or (select motor_id from public.orcamentista_familia_etapa where numero = 2) is not null then raise exception 'FALHOU caso 5: motor_id %', m; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 5 — etapa com o motor da família, e etapa sem motor';
end $$;

-- CASO 6 — a etapa de uma família NÃO aponta o motor de OUTRA (23503, pela FK composta)
do $$
declare cod text; msg text;
begin
  begin
    insert into public.orcamentista_motor (id, familia, fornecedor_id, arquivo_nome, arquivo_path) values ('c0000000-0000-0000-0000-000000000001', 'ALUMINIO', null, 'al.xlsx', 'a/m');
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao, motor_id) values ('PVC', 1, 'Apanhado', 'APANHAR', 'c0000000-0000-0000-0000-000000000001');
    raise exception 'FALHOU caso 6: a etapa PVC apontou o motor de ALUMINIO';
  exception when others then
    get stacked diagnostics msg = message_text, cod = returned_sqlstate;
    if msg like 'FALHOU%' then raise; end if;
    if cod <> '23503' or msg not like '%orcamentista_familia_etapa_motor_fkey%' then raise exception 'FALHOU caso 6: % / %', cod, msg; end if;
  end;
  raise notice 'ok: caso 6 — etapa PVC com motor de ALUMINIO é recusada (23503)';
end $$;

-- CASO 7 — motor apontado por etapa NÃO se apaga (RESTRICT) e NÃO muda de família (a FK composta segura)
do $$
declare cod text; msg text;
begin
  begin
    insert into public.orcamentista_familia_etapa (familia, numero, rotulo, acao, motor_id) values ('PVC', 1, 'Apanhado', 'APANHAR', '9a233c55-f377-45d3-b2ae-b1a740a98e44');
    begin
      delete from public.orcamentista_motor where id = '9a233c55-f377-45d3-b2ae-b1a740a98e44';
      raise exception 'FALHOU caso 7a: o motor apontado foi apagado';
    exception when others then
      get stacked diagnostics msg = message_text, cod = returned_sqlstate;
      if msg like 'FALHOU%' then raise; end if;
      if cod <> '23503' then raise exception 'FALHOU caso 7a: % / %', cod, msg; end if;
    end;
    begin
      update public.orcamentista_motor set familia = 'ALUMINIO' where id = '9a233c55-f377-45d3-b2ae-b1a740a98e44';
      raise exception 'FALHOU caso 7b: o motor apontado mudou de família';
    exception when others then
      get stacked diagnostics msg = message_text, cod = returned_sqlstate;
      if msg like 'FALHOU%' then raise; end if;
      if cod <> '23503' then raise exception 'FALHOU caso 7b: % / %', cod, msg; end if;
    end;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 7 — motor apontado por etapa não se apaga nem muda de família';
end $$;

-- CASO 8 — o item do apanhado diz a família: da lista passa, fora dela é recusada (23503)
do $$
declare cod text; msg text;
begin
  begin
    update public.orcamentista_levantamento_item set familia = 'PVC' where levantamento_id = '02db9513-7eda-43f0-852d-df940e781bef' and ordem = 1;
    update public.orcamentista_levantamento_item set familia = 'ALUMINIO' where levantamento_id = '02db9513-7eda-43f0-852d-df940e781bef' and ordem = 2;
    if (select count(distinct familia) from public.orcamentista_levantamento_item where familia is not null) <> 2 then raise exception 'FALHOU caso 8: as duas famílias do apanhado não ficaram'; end if;
    begin
      update public.orcamentista_levantamento_item set familia = 'ACM' where levantamento_id = 'b0465e57-a829-4f81-9f3e-9ba7d00a999f' and ordem = 1;
      raise exception 'FALHOU caso 8: família fora da lista foi gravada';
    exception when others then
      get stacked diagnostics msg = message_text, cod = returned_sqlstate;
      if msg like 'FALHOU%' then raise; end if;
      if cod <> '23503' or msg not like '%orcamentista_levantamento_item_familia_fkey%' then raise exception 'FALHOU caso 8: % / %', cod, msg; end if;
    end;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 8 — apanhado com PVC e ALUMINIO no mesmo levantamento; família fora da lista é recusada';
end $$;

-- CASO 9 — o item concorda com o motor: mesma família passa; outra é recusada; motor sem família (item de antes) passa
do $$
declare cod text; msg text;
begin
  begin
    update public.orcamentista_levantamento_item set motor_id = '9a233c55-f377-45d3-b2ae-b1a740a98e44' where levantamento_id = '02db9513-7eda-43f0-852d-df940e781bef' and ordem = 1;
    update public.orcamentista_levantamento_item set familia = 'PVC' where levantamento_id = '02db9513-7eda-43f0-852d-df940e781bef' and ordem = 1;
    begin
      update public.orcamentista_levantamento_item set familia = 'ALUMINIO' where levantamento_id = '02db9513-7eda-43f0-852d-df940e781bef' and ordem = 1;
      raise exception 'FALHOU caso 9: item de ALUMINIO com motor de PVC foi gravado';
    exception when others then
      get stacked diagnostics msg = message_text, cod = returned_sqlstate;
      if msg like 'FALHOU%' then raise; end if;
      if cod <> '23503' or msg not like '%orcamentista_levantamento_item_motor_familia_fkey%' then raise exception 'FALHOU caso 9: % / %', cod, msg; end if;
    end;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  begin
    -- item de antes: motor e família nula
    update public.orcamentista_levantamento_item set motor_id = '9a233c55-f377-45d3-b2ae-b1a740a98e44' where levantamento_id = 'b0465e57-a829-4f81-9f3e-9ba7d00a999f' and ordem = 1;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 9 — item concorda com o motor; ALUMINIO com motor de PVC é recusado; item de antes (família nula) passa';
end $$;

-- CASO 10 — o contraste: o índice de ANTES era por (fornecedor, família); o de agora tem a categoria
do $$
declare antes text; agora text;
begin
  select indexdef into antes from public.harness_indice_antes;
  select indexdef into agora from pg_indexes where indexname = 'orcamentista_tabela_uma_vigente';
  if antes is distinct from 'CREATE UNIQUE INDEX orcamentista_tabela_uma_vigente ON public.orcamentista_tabela USING btree (fornecedor_id, familia) NULLS NOT DISTINCT WHERE vigente'
     or agora is distinct from 'CREATE UNIQUE INDEX orcamentista_tabela_uma_vigente ON public.orcamentista_tabela USING btree (fornecedor_id, familia, categoria_chave) NULLS NOT DISTINCT WHERE vigente' then
    raise exception 'FALHOU caso 10: antes % / agora %', antes, agora;
  end if;
  raise notice 'ok: caso 10 — o índice tinha (fornecedor, família) e agora tem (fornecedor, família, categoria)';
end $$;

-- CASO 11 — Perfil, Reforço e Acessórios da Wolff, todas vigentes ao mesmo tempo (o caminho escolhido)
do $$
begin
  begin
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, vigente, categoria_chave) values
      ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'perfil.xlsx', 'x', 'm', 'PVC', true, 'PERFIL'),
      ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'reforco.xlsx', 'x', 'm', 'PVC', true, 'REFORCO'),
      ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'acessorios.xlsx', 'x', 'm', 'PVC', true, 'ACESSORIOS_VEDACAO');
    if (select count(*) from public.orcamentista_tabela where vigente and fornecedor_id = '44c5c0fe-a0d3-4aab-802d-20a6eff3f654') <> 3 then raise exception 'FALHOU caso 11: as três não ficaram vigentes'; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 11 — as três tabelas da Wolff (Perfil, Reforço, Acessórios) vigentes ao mesmo tempo';
end $$;

-- CASO 12 — duas vigentes da MESMA categoria no mesmo (fornecedor, família) seguem proibidas (23505, pelo índice)
do $$
declare cod text; msg text;
begin
  begin
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, vigente, categoria_chave) values
      ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'perfil-2026.xlsx', 'x', 'm', 'PVC', true, 'PERFIL');
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, vigente, categoria_chave) values
      ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'perfil-2027.xlsx', 'x', 'm', 'PVC', true, 'PERFIL');
    raise exception 'FALHOU caso 12: duas vigentes de PERFIL foram gravadas';
  exception when others then
    get stacked diagnostics msg = message_text, cod = returned_sqlstate;
    if msg like 'FALHOU%' then raise; end if;
    if cod <> '23505' or msg not like '%orcamentista_tabela_uma_vigente%' then raise exception 'FALHOU caso 12: % / %', cod, msg; end if;
  end;
  raise notice 'ok: caso 12 — duas vigentes de PERFIL no mesmo fornecedor e família: recusado (23505)';
end $$;

-- CASO 13 — sem categoria (as de antes) o índice segue como era: duas vigentes sem categoria, no mesmo (fornecedor, família), são recusadas
do $$
declare cod text; msg text;
begin
  begin
    update public.orcamentista_tabela set familia = 'PVC', vigente = true where id = '72366020-57c9-489f-9385-397b7fa3dedb';
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, vigente) values
      ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'outra.xlsx', 'x', 'm', 'PVC', true);
    raise exception 'FALHOU caso 13: duas vigentes sem categoria foram gravadas';
  exception when others then
    get stacked diagnostics msg = message_text, cod = returned_sqlstate;
    if msg like 'FALHOU%' then raise; end if;
    if cod <> '23505' or msg not like '%orcamentista_tabela_uma_vigente%' then raise exception 'FALHOU caso 13: % / %', cod, msg; end if;
  end;
  raise notice 'ok: caso 13 — duas vigentes sem categoria seguem recusadas (NULLS NOT DISTINCT)';
end $$;

-- CASO 14 — fornecedores diferentes não se atrapalham: PERFIL vigente de cada um
do $$
begin
  begin
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, familia, vigente, categoria_chave) values
      ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'x', 'perfil-wolff.xlsx', 'x', 'm', 'PVC', true, 'PERFIL'),
      ('a0000000-0000-0000-0000-000000000003', 'x', 'perfil-aaa.xlsx', 'x', 'm', 'PVC', true, 'PERFIL');
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 14 — dois fornecedores de PVC, cada um com a sua tabela de PERFIL vigente';
end $$;

-- CASO 15 — o índice da vigente do MOTOR não mudou
do $$
declare def text;
begin
  select indexdef into def from pg_indexes where indexname = 'orcamentista_motor_uma_vigente';
  if def is distinct from 'CREATE UNIQUE INDEX orcamentista_motor_uma_vigente ON public.orcamentista_motor USING btree (familia, fornecedor_id) WHERE vigente' then raise exception 'FALHOU caso 15: %', def; end if;
  raise notice 'ok: caso 15 — o índice da vigente do motor segue como estava';
end $$;
