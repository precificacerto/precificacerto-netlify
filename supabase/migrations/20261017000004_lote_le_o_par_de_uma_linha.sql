-- ════════════════════════════════════════════════════════════════════════════════════════
-- Etapa 5c — O LOTE LÊ O PAR (id, forma) DE UMA LINHA SÓ
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ NÃO APLICADA. Escrita em 17/10/2026, por decisão do dono do produto (Etapa C, item b), ║
-- ║ para ser aplicada numa rodada própria. Até lá, produção roda a …000003, que está      ║
-- ║ correta — os casos 13 e 13b do harness provam o alinhamento nela. Esta muda o COMO,   ║
-- ║ não o QUE: nenhum comportamento observável muda, e o portão é o mesmo harness.        ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- O QUE MUDA, e é só isto, em `dar_baixa_em_lote`:
--
--   ANTES (…000003)
--     SELECT array_agg(t.id ORDER BY t.id), array_agg(t.forma ORDER BY t.id)
--     INTO v_ids, v_formas FROM unnest(p_parcela_ids, p_formas) AS t(id, forma);
--     FOR v_i IN 1 .. v_n LOOP … v_ids[v_i] … v_formas[v_i] … END LOOP;
--
--   DEPOIS
--     FOR v_par IN SELECT t.id, t.forma FROM unnest(p_parcela_ids, p_formas) AS t(id, forma)
--                  ORDER BY t.id
--     LOOP … v_par.id … v_par.forma … END LOOP;
--
-- POR QUÊ. Nos dois agregados paralelos, a forma fica alinhada à parcela porque os DOIS
-- `ORDER BY` ordenam igual — uma propriedade de duas expressões que alguém pode editar uma de
-- cada vez. A mutação "ordena os ids e não a forma" SOBREVIVEU ao caso 13 e só caiu no 13b,
-- com `enable_presorted_aggregate` desligado: o Postgres 16 ordenava a entrada uma vez para os
-- dois agregados e alinhava por acaso do plano. No laço, o par sai de UMA linha do `unnest`;
-- não há segunda ordenação para divergir, e a classe de mutação deixa de existir.
--
-- O QUE NÃO MUDA: a trava (`ORDER BY id FOR UPDATE`, agora sobre `p_parcela_ids` — o mesmo
-- conjunto, porque PC013 já recusou repetida), a ordem de escrita (por `id`), os códigos, o
-- retorno (`ids` em ordem de `id`, montado no laço), a assinatura, o COMMENT e os GRANTs.
-- `_baixa_simples_na_operacao` e `dar_baixa_simples` não são tocadas.
--
-- O CORPO É O ARTEFATO (`transformacao-quebra-a-cadeia-de-hash.md`, seção do texto guardado):
-- `prosrc` de `dar_baixa_em_lote` passa a ser o corpo DESTE arquivo. Quem aplicar publica o md5
-- do arquivo e confere `md5(prosrc)` contra o corpo em CRLF, como na …000003.
--
-- PORTÃO: `run3.sh` e `somas.sh` rodados sobre a …000003 seguida desta (ver o relatório da
-- rodada), e a mutação "ordem só nos ids" deixa de ser escrevível — não há dois `ORDER BY`.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.dar_baixa_em_lote(
  p_parcela_ids uuid[],
  p_tenant_id   uuid,
  p_usuario_id  uuid,
  p_pago_em     date,
  p_formas      public.payment_method[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n         integer;
  v_ids       uuid[] := '{}';
  v_par       record;
  v_repetido  uuid;
  v_operacao  uuid := gen_random_uuid();
  v_r         jsonb;
  v_soma_c    bigint := 0;
  v_no_log    integer;
  v_estado    text;
  v_mensagem  text;
BEGIN
  IF p_tenant_id IS NULL OR p_usuario_id IS NULL OR p_pago_em IS NULL THEN
    RAISE EXCEPTION 'Tenant, usuario e data sao obrigatorios: o log nao aceita linha sem autor. Nada foi gravado.'
      USING ERRCODE = 'PC001';
  END IF;

  v_n := coalesce(array_length(p_parcela_ids, 1), 0);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'O lote esta vazio. Nada foi gravado.' USING ERRCODE = 'PC012';
  END IF;
  IF v_n > 50 THEN
    RAISE EXCEPTION 'O lote tem % parcelas; o maximo e 50. Nada foi gravado.', v_n USING ERRCODE = 'PC014';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_parcela_ids) AS x WHERE x IS NULL) THEN
    RAISE EXCEPTION 'O lote tem um id nulo. Nada foi gravado.' USING ERRCODE = 'PC001';
  END IF;

  SELECT x INTO v_repetido FROM unnest(p_parcela_ids) AS x GROUP BY x HAVING count(*) > 1 ORDER BY x LIMIT 1;
  IF v_repetido IS NOT NULL THEN
    RAISE EXCEPTION 'A parcela % aparece mais de uma vez no lote. Nada foi gravado.', v_repetido
      USING ERRCODE = 'PC013', DETAIL = v_repetido::text;
  END IF;

  IF p_formas IS NULL OR coalesce(array_length(p_formas, 1), 0) <> v_n THEN
    RAISE EXCEPTION 'O lote tem % parcelas e % formas: as duas listas tem de ter o mesmo tamanho. Nada foi gravado.',
      v_n, coalesce(array_length(p_formas, 1), 0)
      USING ERRCODE = 'PC015';
  END IF;

  -- TRAVA TODAS, EM ORDEM DE `id`, ANTES DE GRAVAR QUALQUER UMA. É a convenção da aplicada
  -- (`ORDER BY id FOR UPDATE` sobre a série), medida no `prosrc` de produção: duas chamadas
  -- com interseção — dois lotes, ou um lote e uma baixa com valor diferente na mesma série —
  -- pedem as travas na mesma ordem, e não se esperam em ciclo.
  PERFORM 1
  FROM public.cash_entries
  WHERE tenant_id = p_tenant_id
    AND id = ANY (p_parcela_ids)
  ORDER BY id
  FOR UPDATE;

  -- A ESCRITA É A DA BAIXA SIMPLES, parcela por parcela. O lote NÃO reimplementa nada.
  -- O PAR (id, forma) SAI DE UMA LINHA SÓ do `unnest`: a forma viaja com a parcela por
  -- construção, e não por dois agregados que precisam ordenar igual.
  FOR v_par IN
    SELECT t.id, t.forma
    FROM unnest(p_parcela_ids, p_formas) AS t(id, forma)
    ORDER BY t.id
  LOOP
    BEGIN
      v_r := public._baixa_simples_na_operacao(v_par.id, p_tenant_id, p_usuario_id, p_pago_em, v_par.forma, v_operacao);
    EXCEPTION WHEN OTHERS THEN
      -- NOMEIA a parcela e RELANÇA com o MESMO código. Não engole: engolir aqui seria a
      -- "transação por parcela" que a XI.7.1 proíbe. A exceção sobe e desfaz o lote inteiro.
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_mensagem = MESSAGE_TEXT;
      RAISE EXCEPTION 'Lote recusado na parcela %: % O lote inteiro foi desfeito.', v_par.id, v_mensagem
        USING ERRCODE = v_estado, DETAIL = v_par.id::text;
    END;
    v_soma_c := v_soma_c + round((v_r->>'valor')::numeric * 100)::bigint;
    v_ids := v_ids || v_par.id;
  END LOOP;

  -- A INVARIANTE, CONTRA O BANCO: uma linha 'PAGA' desta operação por parcela do lote.
  SELECT count(*) INTO v_no_log
  FROM public.parcela_reajuste_log
  WHERE operacao_id = v_operacao AND papel = 'PAGA';

  IF v_no_log <> v_n THEN
    RAISE EXCEPTION 'O lote nao fechou: % parcelas e % linhas no log. O lote inteiro foi desfeito.', v_n, v_no_log
      USING ERRCODE = 'PC016';
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'operacao_id', v_operacao,
    'gravadas',    v_n,
    'ids',         to_jsonb(v_ids),
    'soma',        (v_soma_c / 100.0)::numeric(14,2),
    'criado_por',  p_usuario_id
  );
END;
$function$;

COMMENT ON FUNCTION public.dar_baixa_em_lote(uuid[], uuid, uuid, date, public.payment_method[]) IS
  'Da baixa em ate 50 parcelas pelo valor COMBINADO, tudo ou nada: se uma recusa, nada do lote fica e a excecao nomeia a parcela (DETAIL = id). Trava em ordem de id. Cada parcela passa pela mesma escrita de dar_baixa_simples, com um operacao_id so para o lote. p_formas e paralelo a p_parcela_ids; NULL no elemento preserva a forma combinada. Chamada por rota de API com service_role - nunca pelo browser.';

REVOKE ALL ON FUNCTION public.dar_baixa_em_lote(uuid[], uuid, uuid, date, public.payment_method[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dar_baixa_em_lote(uuid[], uuid, uuid, date, public.payment_method[]) FROM anon;
REVOKE ALL ON FUNCTION public.dar_baixa_em_lote(uuid[], uuid, uuid, date, public.payment_method[]) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.dar_baixa_em_lote(uuid[], uuid, uuid, date, public.payment_method[]) TO service_role;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar.
--
-- (1) A assinatura não mudou, e continua SECURITY DEFINER:
--   select pg_get_function_identity_arguments(p.oid), p.prosecdef
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname='dar_baixa_em_lote';
--   -- esperado: p_parcela_ids uuid[], p_tenant_id uuid, p_usuario_id uuid, p_pago_em date,
--   --           p_formas payment_method[] · t
--
-- (2) O EXECUTE não vazou:
--   select has_function_privilege('public', f, 'EXECUTE'), has_function_privilege('anon', f, 'EXECUTE'),
--          has_function_privilege('authenticated', f, 'EXECUTE'), has_function_privilege('service_role', f, 'EXECUTE')
--     from (select 'public.dar_baixa_em_lote(uuid[],uuid,uuid,date,public.payment_method[])' as f) x;
--   -- esperado: false, false, false, true
--
-- (3) O corpo é o deste arquivo — e não tem mais os agregados paralelos:
--   select md5(prosrc), position('array_agg' in prosrc) = 0 as sem_agregado,
--          position('FOR v_par IN' in prosrc) > 0 as com_laco
--     from pg_proc where proname = 'dar_baixa_em_lote';
--   -- esperado: md5 do corpo deste arquivo (em CRLF, se aplicado pelo SQL Editor) · t · t
--
-- (4) `NOTIFY pgrst, 'reload schema';` — não vem junto com o COMMIT.
-- ════════════════════════════════════════════════════════════════════════════════════════
