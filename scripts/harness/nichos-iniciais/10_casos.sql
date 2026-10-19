-- Os casos da semente. Estado: a semente rodou DUAS vezes, sobre um 'esquadrias' que a tela criou.
\set QUIET on
set client_min_messages = notice;

-- CASO 1 — doze nichos, quatro por modelo, mesmo com a semente aplicada duas vezes
do $$ begin
  if (select count(*) from public.orcamentista_nicho) is distinct from 12::bigint then raise exception 'FALHOU 1: % nichos, esperado 12', (select count(*) from public.orcamentista_nicho); end if;
  if (select string_agg(modelo || ':' || n, ',' order by modelo) from (select modelo, count(*) n from public.orcamentista_nicho group by modelo) x)
     is distinct from 'FABRICACAO:4,REVENDA:4,SERVICO:4' then raise exception 'FALHOU 1: a divisão por modelo não é 4/4/4'; end if;
  raise notice 'ok: 1 — 12 nichos, 4 por modelo, depois de duas aplicações';
end $$;

-- CASO 2 — o nicho que a TELA criou com outra caixa fica como estava: nome e autor
do $$ begin
  if (select count(*) from public.orcamentista_nicho where modelo = 'FABRICACAO' and lower(nome) = 'esquadrias') is distinct from 1::bigint then raise exception 'FALHOU 2: Esquadrias duplicou'; end if;
  if (select nome || '|' || coalesce(criado_por::text, 'NULL') from public.orcamentista_nicho where modelo = 'FABRICACAO' and lower(nome) = 'esquadrias')
     is distinct from 'esquadrias|00000000-0000-0000-0000-0000000000f1' then raise exception 'FALHOU 2: a semente sobrescreveu o nicho da tela'; end if;
  raise notice 'ok: 2 — o "esquadrias" da tela não duplicou nem perdeu o autor';
end $$;

-- CASO 3 — os semeados não têm autor, e os acentos chegaram
do $$ begin
  if (select count(*) from public.orcamentista_nicho where criado_por is null) is distinct from 11::bigint then raise exception 'FALHOU 3: semeados com autor'; end if;
  if (select count(*) from public.orcamentista_nicho where nome in ('Móveis personalizados', 'Mecânicas', 'Salões de beleza', 'Assistência técnica', 'Manutenção predial', 'Autopeças')) is distinct from 6::bigint then raise exception 'FALHOU 3: acento perdido'; end if;
  if exists (select 1 from public.orcamentista_nicho where ativo is distinct from true) then raise exception 'FALHOU 3: nicho inativo'; end if;
  raise notice 'ok: 3 — 11 semeados sem autor, 6 nomes acentuados intactos, todos ativos';
end $$;
