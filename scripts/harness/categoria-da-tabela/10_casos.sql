-- Os casos da 20261027000005. Cada um desfaz o que fez (subtransação que termina em P0099), exceto o 1.
-- `ok:` é NOTICE; `FALHOU` é ERROR — o run.sh lê a linha inteira.

-- CASO 1 — a migração não tocou em dado: as 2 linhas iguais (menos a coluna nova), categoria nula nas duas
do $$
declare n_nula int; n_igual int;
begin
  select count(*) into n_nula from public.orcamentista_tabela where categoria_chave is null;
  select count(*) into n_igual from public.orcamentista_tabela t join public.harness_antes a on a.id = t.id
   where a.h = md5(row(t.id, t.fornecedor_id, t.arquivo_path, t.arquivo_nome, t.motor_path, t.motor_nome, t.vigencia, t.criado_em, t.criado_por, t.familia, t.vigente)::text);
  if n_nula <> 2 or n_igual <> 2 then raise exception 'FALHOU caso 1: nulas %, iguais % (esperado 2 e 2)', n_nula, n_igual; end if;
  raise notice 'ok: caso 1 — as 2 tabelas de hoje seguem iguais e com categoria nula';
end $$;

-- CASO 2 — a migração aplicada duas vezes deixa UM gatilho e UMA FK
do $$
declare n_tg int; n_fk int;
begin
  select count(*) into n_tg from pg_trigger where tgrelid = 'public.orcamentista_tabela'::regclass and tgname = 'orcamentista_tabela_categoria_guarda' and not tgisinternal;
  select count(*) into n_fk from pg_constraint where conrelid = 'public.orcamentista_tabela'::regclass and conname = 'orcamentista_tabela_categoria_fkey';
  if n_tg <> 1 or n_fk <> 1 then raise exception 'FALHOU caso 2: gatilhos %, FKs % (esperado 1 e 1)', n_tg, n_fk; end if;
  raise notice 'ok: caso 2 — dupla aplicação: 1 gatilho, 1 FK';
end $$;

-- CASO 3 — tabela NOVA sem categoria: o banco recusa, com o nome da trava, em 23514
do $$
declare cod text; msg text;
begin
  begin
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome)
      values ('a0000000-0000-0000-0000-000000000001', 'x', 'x', 'x', 'x');
    raise exception 'FALHOU caso 3: a tabela sem categoria foi gravada';
  exception when others then
    get stacked diagnostics msg = message_text, cod = returned_sqlstate;
    if msg like 'FALHOU%' then raise; end if;
    if cod <> '23514' or msg not like 'orcamentista_tabela_categoria_obrigatoria%' then raise exception 'FALHOU caso 3: % / %', cod, msg; end if;
  end;
  raise notice 'ok: caso 3 — tabela nova sem categoria é recusada (23514)';
end $$;

-- CASO 4 — tabela NOVA com categoria da lista: grava
do $$
declare n int;
begin
  begin
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, categoria_chave)
      values ('a0000000-0000-0000-0000-000000000001', 'x', 'x', 'x', 'x', 'REFORCO');
    select count(*) into n from public.orcamentista_tabela where categoria_chave = 'REFORCO';
    if n <> 1 then raise exception 'FALHOU caso 4: gravou % linhas', n; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 4 — tabela nova com categoria grava';
end $$;

-- CASO 5 — categoria que não está na lista: a FK recusa (23503)
do $$
declare cod text; msg text;
begin
  begin
    insert into public.orcamentista_tabela (fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, categoria_chave)
      values ('a0000000-0000-0000-0000-000000000001', 'x', 'x', 'x', 'x', 'INVENTADA');
    raise exception 'FALHOU caso 5: categoria inventada foi gravada';
  exception when others then
    get stacked diagnostics msg = message_text, cod = returned_sqlstate;
    if msg like 'FALHOU%' then raise; end if;
    if cod <> '23503' or msg not like '%orcamentista_tabela_categoria_fkey%' then raise exception 'FALHOU caso 5: % / %', cod, msg; end if;
  end;
  raise notice 'ok: caso 5 — categoria fora da lista é recusada pela FK (23503)';
end $$;

-- CASO 6 — a primeira categoria de uma tabela de antes (Estrela: nula -> VIDRO) é aceita
do $$
declare c text;
begin
  begin
    update public.orcamentista_tabela set categoria_chave = 'VIDRO' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    select categoria_chave into c from public.orcamentista_tabela where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    if c is distinct from 'VIDRO' then raise exception 'FALHOU caso 6: ficou %', c; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 6 — nula -> VIDRO na tabela de antes';
end $$;

-- CASO 7 — depois de dada, a categoria NÃO se troca (23514)
do $$
declare cod text; msg text;
begin
  begin
    update public.orcamentista_tabela set categoria_chave = 'VIDRO' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    update public.orcamentista_tabela set categoria_chave = 'PERFIL' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    raise exception 'FALHOU caso 7: a categoria foi trocada';
  exception when others then
    get stacked diagnostics msg = message_text, cod = returned_sqlstate;
    if msg like 'FALHOU%' then raise; end if;
    if cod <> '23514' or msg not like 'orcamentista_tabela_categoria_nao_se_troca%' then raise exception 'FALHOU caso 7: % / %', cod, msg; end if;
  end;
  raise notice 'ok: caso 7 — VIDRO -> PERFIL é recusado (23514)';
end $$;

-- CASO 8 — nem se apaga (VIDRO -> nula)
do $$
declare cod text; msg text;
begin
  begin
    update public.orcamentista_tabela set categoria_chave = 'VIDRO' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    update public.orcamentista_tabela set categoria_chave = null where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    raise exception 'FALHOU caso 8: a categoria foi apagada';
  exception when others then
    get stacked diagnostics msg = message_text, cod = returned_sqlstate;
    if msg like 'FALHOU%' then raise; end if;
    if cod <> '23514' or msg not like 'orcamentista_tabela_categoria_nao_se_troca%' then raise exception 'FALHOU caso 8: % / %', cod, msg; end if;
  end;
  raise notice 'ok: caso 8 — VIDRO -> nula é recusado (23514)';
end $$;

-- CASO 9 — gravar a MESMA categoria de novo não é troca
do $$
begin
  begin
    update public.orcamentista_tabela set categoria_chave = 'VIDRO' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    update public.orcamentista_tabela set categoria_chave = 'VIDRO' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 9 — VIDRO -> VIDRO passa';
end $$;

-- CASO 10 — as outras colunas seguem editáveis, com e sem categoria (a Wolff, nula, não é travada)
do $$
declare v text;
begin
  begin
    update public.orcamentista_tabela set vigencia = 'desde 01/10/2026', vigente = true where id = '72366020-57c9-489f-9385-397b7fa3dedb';
    update public.orcamentista_tabela set categoria_chave = 'VIDRO' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    update public.orcamentista_tabela set vigencia = 'nota' where id = '5f7acebf-3c91-46de-af00-57a47f8be288';
    select vigencia into v from public.orcamentista_tabela where id = '72366020-57c9-489f-9385-397b7fa3dedb';
    if v is distinct from 'desde 01/10/2026' then raise exception 'FALHOU caso 10: vigencia %', v; end if;
    raise exception 'desfazer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  raise notice 'ok: caso 10 — a Wolff (nula) e a Estrela (VIDRO) seguem editáveis nas outras colunas';
end $$;

-- CASO 11 — o índice da vigente NÃO mudou (esta migração não o alarga)
do $$
declare def text;
begin
  select indexdef into def from pg_indexes where schemaname = 'public' and indexname = 'orcamentista_tabela_uma_vigente';
  if def is distinct from 'CREATE UNIQUE INDEX orcamentista_tabela_uma_vigente ON public.orcamentista_tabela USING btree (fornecedor_id, familia) NULLS NOT DISTINCT WHERE vigente' then
    raise exception 'FALHOU caso 11: o índice mudou: %', def;
  end if;
  raise notice 'ok: caso 11 — o índice da vigente segue como estava';
end $$;
