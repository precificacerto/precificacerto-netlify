-- HARNESS da reimportação com os tempos na tabela própria — OS CASOS. NÃO TOCA PRODUÇÃO.
-- O teste que vale (dono do produto, 25/10/2026): com os 164 tempos na tabela nova, uma reimportação
-- COMPLETA roda até o fim e os 164 tempos continuam lá depois. Cada caso imprime `ok:` ou levanta
-- `FALHOU:`.
\i 08_payload.sql

CREATE TEMP TABLE _tempos_antes AS
  SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem FROM public.orcamentista_motor_tipologia_tempo;

-- CASO 1 — o PREPARO: a 20261024000003 copiou os 164 da c1 (soma 87.300) e o da c2
DO $$
DECLARE n int; soma int; n2 int;
BEGIN
  SELECT count(*), sum(tempo_fabricacao_min) INTO n, soma FROM public.orcamentista_motor_tipologia_tempo
   WHERE tabela_id = '00000000-0000-4000-8000-0000000000c1' AND tempo_origem = 'ESTIMADO';
  SELECT count(*) INTO n2 FROM public.orcamentista_motor_tipologia_tempo;
  IF n <> 164 OR soma <> 87300 OR n2 <> 165 THEN
    RAISE EXCEPTION 'FALHOU: caso 1 — PREPARO: a tabela nova tem % da c1 (soma %) e % no total; o caso não exercitaria nada', n, soma, n2;
  END IF;
  RAISE NOTICE 'ok: caso 1 — antes da reimportação: 164 tempos ESTIMADO da c1, soma 87.300, e 1 da c2 na tabela nova';
END $$;

-- CASO 2 — a reimportação COMPLETA roda até o fim, e devolve a contagem de cada lista enviada
DO $$
DECLARE p jsonb := pg_temp.payload_completo(); r jsonb; k text; erros text := '';
BEGIN
  r := public.importar_conteudo_da_tabela('00000000-0000-4000-8000-0000000000c1'::uuid, p);
  FOREACH k IN ARRAY ARRAY['itens','regras','tipologias','formulas','detalhes','formulas_da_tipologia','perfis','vidros','baguetes','insumos','variaveis_da_tipologia','validacoes','otimizacao'] LOOP
    IF (r->>k)::int IS DISTINCT FROM jsonb_array_length(p->k) THEN erros := erros || format(' %s=%s/%s', k, r->>k, jsonb_array_length(p->k)); END IF;
  END LOOP;
  IF erros <> '' THEN RAISE EXCEPTION 'FALHOU: caso 2 — contagens gravadas diferentes das enviadas:%', erros; END IF;
  RAISE NOTICE 'ok: caso 2 — a reimportação completa rodou até o fim: % tipologias, % perfis, % insumos, e as 13 contagens batem', r->>'tipologias', r->>'perfis', r->>'insumos';
END $$;

-- CASO 3 — O TESTE QUE VALE: os 164 tempos continuam lá depois, iguais, um a um
DO $$
DECLARE n int; soma int; dif int;
BEGIN
  SELECT count(*), sum(tempo_fabricacao_min) INTO n, soma FROM public.orcamentista_motor_tipologia_tempo
   WHERE tabela_id = '00000000-0000-4000-8000-0000000000c1';
  SELECT count(*) INTO dif FROM (
    (SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem FROM _tempos_antes
     EXCEPT SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem FROM public.orcamentista_motor_tipologia_tempo)
    UNION ALL
    (SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem FROM public.orcamentista_motor_tipologia_tempo
     EXCEPT SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem FROM _tempos_antes)) d;
  IF n <> 164 OR soma <> 87300 OR dif <> 0 THEN
    RAISE EXCEPTION 'FALHOU: caso 3 — depois da reimportação a c1 tem % tempos (soma %), e % linhas diferem do antes', n, soma, dif;
  END IF;
  RAISE NOTICE 'ok: caso 3 — depois da reimportação os 164 tempos continuam lá, soma 87.300, idênticos linha a linha';
END $$;

-- CASO 4 — a reimportação de OUTRA tabela não está aqui; a da c1 não tocou o tempo da c2
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(tipologia || '=' || tempo_fabricacao_min || ' ' || tempo_origem, ',') INTO v
    FROM public.orcamentista_motor_tipologia_tempo WHERE tabela_id = '00000000-0000-4000-8000-0000000000c2';
  IF v IS DISTINCT FROM 'DP-001=999 IMPORTADO' THEN RAISE EXCEPTION 'FALHOU: caso 4 — o tempo da c2 virou %', v; END IF;
  RAISE NOTICE 'ok: caso 4 — o tempo da outra tabela (c2) ficou como estava: DP-001=999 IMPORTADO';
END $$;

-- CASO 5 — O QUE A REIMPORTAÇÃO FAZ COM AS COLUNAS ANTIGAS, dito em vez de calado: ela as ESVAZIA
-- na c1 (apaga e regrava a orcamentista_motor_tipologia sem elas). Elas são obsoletas desde a
-- 20261024000003 e ninguém mais as lê; saem numa migração posterior.
DO $$
DECLARE n int; n2 int;
BEGIN
  SELECT count(*) INTO n FROM public.orcamentista_motor_tipologia
   WHERE tabela_id = '00000000-0000-4000-8000-0000000000c1' AND tempo_origem IS NOT NULL;
  SELECT count(*) INTO n2 FROM public.orcamentista_motor_tipologia
   WHERE tabela_id = '00000000-0000-4000-8000-0000000000c2' AND tempo_origem IS NOT NULL;
  IF n <> 0 OR n2 <> 1 THEN RAISE EXCEPTION 'FALHOU: caso 5 — colunas antigas: c1 com % tempos, c2 com %', n, n2; END IF;
  RAISE NOTICE 'ok: caso 5 — as colunas ANTIGAS da c1 ficaram vazias depois da reimportação (0 de 164); as da c2, intactas';
END $$;

-- CASO 6 — reimportar DE NOVO: os 164 continuam
DO $$
DECLARE n int; soma int;
BEGIN
  PERFORM public.importar_conteudo_da_tabela('00000000-0000-4000-8000-0000000000c1'::uuid, pg_temp.payload_completo());
  SELECT count(*), sum(tempo_fabricacao_min) INTO n, soma FROM public.orcamentista_motor_tipologia_tempo
   WHERE tabela_id = '00000000-0000-4000-8000-0000000000c1';
  IF n <> 164 OR soma <> 87300 THEN RAISE EXCEPTION 'FALHOU: caso 6 — depois da segunda reimportação: % tempos, soma %', n, soma; END IF;
  RAISE NOTICE 'ok: caso 6 — uma segunda reimportação também deixa os 164 tempos, soma 87.300';
END $$;
