-- ════════════════════════════════════════════════════════════════════════════════════════
-- Etapa 5c — A BAIXA SIMPLES COM AUTOR, A BAIXA EM LOTE, E O QUARTO DROP
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ APLICADA E VERIFICADA em 17/10/2026, 18:52:37 UTC, pelo SQL Editor (PO).               ║
-- ║ `schema_migrations`: version `20261017185237`, name com o nome deste arquivo.          ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- O QUE RODOU É ESTE ARQUIVO, BYTE A BYTE, a menos do transporte — registrado como foi:
--   arquivo                 md5 8b648291847277f673959087f5e456be (392 linhas, 23.190 bytes)
--   texto que o Postgres    `postgres_logs`, source dashboard: mensagem de 23.701 bytes,
--   recebeu                 md5 c07de3913c5fdf0efa0923a68accf1f7
--   transporte              391 LF viraram CRLF, e a quebra de linha final saiu. Revertidas
--                           as duas, o md5 do corpo É 8b648291… — calculado no próprio
--                           servidor de logs, sem transcrição.
--
-- AQUI, AO CONTRÁRIO DA …000001, O `prosrc` QUE ESTÁ NO CATÁLOGO **É** O DESTE ARQUIVO.
-- A ÚNICA DIFERENÇA SÃO OS `\r` DO CRLF. Um diff entre o texto das funções no banco e este
-- arquivo mostra `\r` no fim das linhas, e NADA MAIS — não é diferença de lógica nem de
-- comentário. Medido: md5 do corpo deste arquivo em CRLF = md5(prosrc), nas três:
--   _baixa_simples_na_operacao   48f686a815b09ae8fd6aef5cd769c8f5   2.966 caracteres
--   dar_baixa_em_lote            9d50a3f849680206e3b3bcf5fe197e26   3.842 caracteres
--   dar_baixa_simples            3ecdcdb96ef45b740b576431298ab65f     245 caracteres
--
-- PROVA PELO ESTADO, 17/10/2026: as três com a assinatura do arquivo e `prosecdef` true;
-- EXECUTE false/false/false/true nas duas públicas e false nos quatro na interna; `orders`
-- com quatro políticas (delete, insert, select, update) e RLS ligada; `cash_entries.amount`
-- NOT NULL; `prosrc` da aplicada intacto (a0f5ddc1…); `NOTIFY pgrst` rodado.
--
-- ADITIVA, de propósito. `dar_baixa_com_valor_diferente` NÃO é substituída: um CREATE OR
-- REPLACE obrigaria a transportar o corpo dela outra vez, e o corpo É o artefato — foi ele que
-- perdeu os comentários na aplicação da …000001 (`transformacao-quebra-a-cadeia-de-hash.md`,
-- seção do texto guardado). Esta migração não toca nela nem no log.
--
-- POR QUE EXISTE — MEDIDO em 17/10/2026, no harness, contra o `prosrc` de produção:
-- `dar_baixa_com_valor_diferente` recusa a ÚLTIMA em aberto da série (PC005) e a parcela SEM
-- série (PC002) mesmo com delta ZERO — o `IF v_n = 0` vem antes do cálculo do delta. A baixa
-- pelo valor combinado dessas parcelas ficou numa SEGUNDA VIA (UPDATE na rota), SEM AUTOR. A
-- XIII.2 decide que o log registra TODA baixa da ficha. Esta função fecha isso.
--
-- A POPULAÇÃO, medida em 17/10/2026 — 40 parcelas de receita vivas em aberto:
--   10 são a única em aberto da série · 2 sem série (origin_id nulo) · 28 com irmãs em aberto.
-- As 12 primeiras só esta função alcança; as 28, as duas alcançam.
--
--
-- OS CÓDIGOS — os já usados, medidos no catálogo em 17/10/2026, são PC001..PC009, todos de
-- `dar_baixa_com_valor_diferente`; nenhuma outra função do schema usa `PC`.
--   PC001  REUSADO, MESMO SIGNIFICADO: entrada obrigatória ausente. A rota já o leva a
--          ENTRADA_INVALIDA; um segundo código para o mesmo fato seria `copia-divergente.md`.
--   PC008  REUSADO, MESMO SIGNIFICADO: parcela com valor nulo no banco.
--   PC010  baixa simples: a parcela JÁ ESTÁ PAGA
--   PC011  baixa simples: parcela não encontrada, estornada, ou de outro tenant
--   PC012  lote vazio
--   PC013  lote com id repetido
--   PC014  lote com mais de 50 parcelas
--   PC015  lote com array de formas de cardinalidade diferente da de ids
--   PC016  lote que não fechou: o log não tem uma linha 'PAGA' por parcela (invariante)
--
-- QUEM CHAMA: rota de API com `service_role`. O EXECUTE é revogado de PUBLIC, anon e
-- authenticated — o mesmo bloco da função aplicada, medido no catálogo:
-- `{postgres=X/postgres,service_role=X/postgres}`.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 1. A ESCRITA — uma função interna, que é a ÚNICA que grava a baixa simples
-- ────────────────────────────────────────────────────────────────────────────────────────
-- Recebe a OPERAÇÃO de fora. É o que permite ao lote amarrar todas as suas linhas de log num
-- `operacao_id` só — a mesma coisa que o log faz numa baixa com valor diferente — sem que o lote
-- reescreva a gravação. `dar_baixa_simples` é esta mesma função com uma operação nova.
--
-- O `_` e a ausência de GRANT dizem que ela NÃO é porta de entrada: só o dono a executa, e as
-- duas públicas abaixo rodam como o dono (SECURITY DEFINER). Medido no harness: a função
-- aninhada roda com o privilégio do dono da que a chama; `authenticated` é recusado na externa.
CREATE OR REPLACE FUNCTION public._baixa_simples_na_operacao(
  p_parcela_id  uuid,
  p_tenant_id   uuid,
  p_usuario_id  uuid,
  p_pago_em     date,
  -- `NULL` = NÃO MEXER NA FORMA: o `coalesce` preserva a combinada. Mesma semântica da aplicada.
  p_forma       public.payment_method,
  p_operacao_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_valor        numeric;
  v_pago         date;
  v_origin_type  text;
  v_origin_id    uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_usuario_id IS NULL OR p_pago_em IS NULL OR p_operacao_id IS NULL THEN
    RAISE EXCEPTION 'Tenant, usuario, data e operacao sao obrigatorios: o log nao aceita linha sem autor. Nada foi gravado.'
      USING ERRCODE = 'PC001';
  END IF;

  -- TRAVA A PRÓPRIA LINHA e lê sob a trava. É uma linha só: não há ordem a respeitar aqui, e
  -- quem trava várias (o lote) já as travou em ordem de `id` antes de chegar.
  SELECT amount, paid_date, origin_type, origin_id
  INTO v_valor, v_pago, v_origin_type, v_origin_id
  FROM public.cash_entries
  WHERE id = p_parcela_id
    AND tenant_id = p_tenant_id
    AND type = 'INCOME'
    AND is_active IS TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela % nao encontrada, estornada, ou de outro tenant. Nada foi gravado.', p_parcela_id
      USING ERRCODE = 'PC011';
  END IF;

  -- `paid_date IS NULL` sob a trava é o que torna a baixa idempotente.
  IF v_pago IS NOT NULL THEN
    RAISE EXCEPTION 'A parcela % ja esta paga (em %). Nada foi gravado.', p_parcela_id, v_pago
      USING ERRCODE = 'PC010';
  END IF;

  -- Inalcançável hoje (`amount` é NOT NULL, reconferido na VERIFICAÇÃO): protege um CONTRATO
  -- de outra tabela, como na aplicada. Sem ela, o nulo morreria no NOT NULL do log, por acidente.
  IF v_valor IS NULL THEN
    RAISE EXCEPTION 'A parcela % esta com valor nulo no banco. Nada foi gravado.', p_parcela_id
      USING ERRCODE = 'PC008';
  END IF;

  -- A BAIXA. `amount` NÃO É TOCADO — valor diferente só existe na outra função (XII.8).
  UPDATE public.cash_entries
  SET paid_date      = p_pago_em,
      payment_method = coalesce(p_forma, payment_method)
  WHERE id = p_parcela_id
    AND tenant_id = p_tenant_id
    AND paid_date IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A parcela % foi paga por outro caminho durante esta operacao. Nada foi gravado.', p_parcela_id
      USING ERRCODE = 'PC010';
  END IF;

  -- A LINHA 'PAGA', na forma EXATA da aplicada (medida no `prosrc` de produção): as mesmas
  -- doze colunas, na mesma ordem; valor antes = valor depois = o valor da parcela; delta zero;
  -- `forma` = o PARÂMETRO, como lá — NULL ali significa "não mexeu na forma".
  INSERT INTO public.parcela_reajuste_log
    (tenant_id, operacao_id, parcela_id, serie_origin_type, serie_origin_id,
     papel, valor_antes, valor_depois, delta_da_serie, pago_em, forma, criado_por)
  VALUES
    (p_tenant_id, p_operacao_id, p_parcela_id, v_origin_type, v_origin_id,
     'PAGA', v_valor::numeric(14,2), v_valor::numeric(14,2),
     0::numeric(14,2), p_pago_em, p_forma, p_usuario_id);

  RETURN jsonb_build_object(
    'parcela_id',  p_parcela_id,
    'valor',       v_valor::numeric(14,2),
    'pago_em',     p_pago_em,
    'operacao_id', p_operacao_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._baixa_simples_na_operacao(uuid, uuid, uuid, date, public.payment_method, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._baixa_simples_na_operacao(uuid, uuid, uuid, date, public.payment_method, uuid) FROM anon;
REVOKE ALL ON FUNCTION public._baixa_simples_na_operacao(uuid, uuid, uuid, date, public.payment_method, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public._baixa_simples_na_operacao(uuid, uuid, uuid, date, public.payment_method, uuid) FROM service_role;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 2. dar_baixa_simples — a baixa pelo valor combinado, COM AUTOR
-- ────────────────────────────────────────────────────────────────────────────────────────
-- NÃO RECEBE VALOR. Nenhum. A forma da assinatura impede o uso errado (XII.8): valor diferente
-- só existe em `dar_baixa_com_valor_diferente`. Aceita a única em aberto da série e a parcela
-- sem série — exatamente o que PC005 e PC002 recusam lá, e o motivo desta existir.
CREATE OR REPLACE FUNCTION public.dar_baixa_simples(
  p_parcela_id uuid,
  p_tenant_id  uuid,
  p_usuario_id uuid,
  p_pago_em    date,
  p_forma      public.payment_method DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r jsonb;
BEGIN
  v_r := public._baixa_simples_na_operacao(p_parcela_id, p_tenant_id, p_usuario_id, p_pago_em, p_forma, gen_random_uuid());
  RETURN jsonb_build_object('success', true, 'criado_por', p_usuario_id) || v_r;
END;
$function$;

COMMENT ON FUNCTION public.dar_baixa_simples(uuid, uuid, uuid, date, public.payment_method) IS
  'Da baixa numa parcela pelo valor COMBINADO e grava a linha PAGA no parcela_reajuste_log com o autor. Nao recebe valor: valor diferente so existe em dar_baixa_com_valor_diferente. Aceita a unica em aberto da serie e a parcela sem serie. Nunca altera amount. Chamada por rota de API com service_role - nunca pelo browser.';

REVOKE ALL ON FUNCTION public.dar_baixa_simples(uuid, uuid, uuid, date, public.payment_method) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dar_baixa_simples(uuid, uuid, uuid, date, public.payment_method) FROM anon;
REVOKE ALL ON FUNCTION public.dar_baixa_simples(uuid, uuid, uuid, date, public.payment_method) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.dar_baixa_simples(uuid, uuid, uuid, date, public.payment_method) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 3. dar_baixa_em_lote — TUDO OU NADA
-- ────────────────────────────────────────────────────────────────────────────────────────
-- A XI.7.1 existe para impedir "pagou cinco, registrou três", e relatório parcial é a mesma
-- coisa com outra cara. Uma chamada, uma transação: se UMA parcela recusa, a exceção sobe e
-- NADA do lote fica — medido no harness, a exceção da função aninhada propaga e desfaz o que
-- a chamadora já tinha gravado.
--
-- A FORMA POR PARCELA É UM ARRAY PARALELO, e a escolha é medida. Em 17/10/2026, dos 6
-- clientes que têm duas ou mais parcelas em aberto (os únicos com lote possível), 1 tem DUAS
-- formas combinadas diferentes entre elas (BOLETO e PIX). E entre as parcelas já pagas a
-- forma que ficou é outra distribuição — PIX em 40 pagas contra 1 em aberto —, o que não
-- prova mas é compatível com a forma mudar no ato do pagamento. O array é o único dos dois
-- contratos que representa os três casos sem perda: a MESMA forma para todas (repetida), a
-- combinada de cada uma (`NULL` no elemento) e formas diferentes. `NULL` para o lote inteiro
-- gravaria a combinada de cada parcela mesmo quando o pagamento foi feito de outro jeito.
-- Cardinalidade diferente da de ids é recusa (PC015), nunca alinhamento por suposição.
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
  v_ids       uuid[];
  v_formas    public.payment_method[];
  v_repetido  uuid;
  v_operacao  uuid := gen_random_uuid();
  v_i         integer;
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

  -- ORDENA por `id`, levando a forma junto: a forma é da parcela, não da posição.
  SELECT array_agg(t.id ORDER BY t.id), array_agg(t.forma ORDER BY t.id)
  INTO v_ids, v_formas
  FROM unnest(p_parcela_ids, p_formas) AS t(id, forma);

  -- TRAVA TODAS, EM ORDEM DE `id`, ANTES DE GRAVAR QUALQUER UMA. É a convenção da aplicada
  -- (`ORDER BY id FOR UPDATE` sobre a série), medida no `prosrc` de produção: duas chamadas
  -- com interseção — dois lotes, ou um lote e uma baixa com valor diferente na mesma série —
  -- pedem as travas na mesma ordem, e não se esperam em ciclo.
  PERFORM 1
  FROM public.cash_entries
  WHERE tenant_id = p_tenant_id
    AND id = ANY (v_ids)
  ORDER BY id
  FOR UPDATE;

  -- A ESCRITA É A DA BAIXA SIMPLES, parcela por parcela. O lote NÃO reimplementa nada.
  FOR v_i IN 1 .. v_n LOOP
    BEGIN
      v_r := public._baixa_simples_na_operacao(v_ids[v_i], p_tenant_id, p_usuario_id, p_pago_em, v_formas[v_i], v_operacao);
    EXCEPTION WHEN OTHERS THEN
      -- NOMEIA a parcela e RELANÇA com o MESMO código. Não engole: engolir aqui seria a
      -- "transação por parcela" que a XI.7.1 proíbe. A exceção sobe e desfaz o lote inteiro.
      GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_mensagem = MESSAGE_TEXT;
      RAISE EXCEPTION 'Lote recusado na parcela %: % O lote inteiro foi desfeito.', v_ids[v_i], v_mensagem
        USING ERRCODE = v_estado, DETAIL = v_ids[v_i]::text;
    END;
    v_soma_c := v_soma_c + round((v_r->>'valor')::numeric * 100)::bigint;
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

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 4. O QUARTO DROP — `orders_tenant_insert`
-- ────────────────────────────────────────────────────────────────────────────────────────
-- A condição da XVI.5 está satisfeita, conferida no repositório em 17/10/2026: o ÚNICO insert
-- em `orders` (`src/pages/orcamentos/index.tsx:2158`, em `origin/main`) grava
-- `created_by: createdBy`, com o fallback e a guarda em `:2134-2135`:
--   const createdBy = currentUser?.uid ?? (await getCurrentUserId())
--   if (!createdBy) { messageApi.error('Sessão inválida. Faça login novamente.'); return }
-- Nenhuma função do banco insere em `orders`, e nenhuma edge function nem script também.
-- Sobra `orders_insert`: `tenant_id = get_auth_tenant_id() AND created_by = auth.uid()`.
DROP POLICY IF EXISTS "orders_tenant_insert" ON public.orders;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar. Cada consulta tem o esperado ao lado, e o esperado
-- vem de medição feita ANTES.
--
-- (1) AS DUAS FUNÇÕES NOVAS, e a interna, com assinatura e SECURITY DEFINER:
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('dar_baixa_simples','dar_baixa_em_lote','_baixa_simples_na_operacao')
--    order by 1;
--   -- esperado, TRÊS linhas, todas prosecdef = t:
--   --   _baixa_simples_na_operacao  p_parcela_id uuid, p_tenant_id uuid, p_usuario_id uuid,
--   --                               p_pago_em date, p_forma payment_method, p_operacao_id uuid
--   --   dar_baixa_em_lote           p_parcela_ids uuid[], p_tenant_id uuid, p_usuario_id uuid,
--   --                               p_pago_em date, p_formas payment_method[]
--   --   dar_baixa_simples           p_parcela_id uuid, p_tenant_id uuid, p_usuario_id uuid,
--   --                               p_pago_em date, p_forma payment_method
--   -- `dar_baixa_simples` com um parâmetro de VALOR seria a forma que a XII.8 proíbe.
--
-- (2) O EXECUTE NÃO VAZOU — para cada uma, PUBLIC, anon, authenticated, service_role:
--
--   select f, has_function_privilege('public', f, 'EXECUTE')        as publico,
--             has_function_privilege('anon', f, 'EXECUTE')          as anon,
--             has_function_privilege('authenticated', f, 'EXECUTE') as autenticado,
--             has_function_privilege('service_role', f, 'EXECUTE')  as servico
--     from unnest(array[
--       'public.dar_baixa_simples(uuid,uuid,uuid,date,public.payment_method)',
--       'public.dar_baixa_em_lote(uuid[],uuid,uuid,date,public.payment_method[])',
--       'public._baixa_simples_na_operacao(uuid,uuid,uuid,date,public.payment_method,uuid)'
--     ]) as f;
--   -- esperado: false, false, false, true nas duas públicas;
--   --           false, false, false, false na interna — ninguém a chama de fora.
--
-- (3) AS POLÍTICAS DE `orders` — QUATRO, e nenhuma `*_tenant_*`:
--
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='orders' order by cmd, policyname;
--   -- esperado: orders_delete DELETE · orders_insert INSERT · orders_select SELECT ·
--   --           orders_update UPDATE. Medido ANTES desta migração: as mesmas quatro MAIS
--   --           orders_tenant_insert INSERT — cinco.
--
-- (4) A RLS DE `orders` CONTINUA LIGADA:
--
--   select relrowsecurity from pg_class where oid = 'public.orders'::regclass;
--   -- esperado: true
--
-- (5) O CONTRATO DE QUE A GUARDA PC008 DEPENDE, que é de OUTRA tabela:
--
--   select is_nullable from information_schema.columns
--    where table_schema='public' and table_name='cash_entries' and column_name='amount';
--   -- esperado: NO
--
-- (6) A FUNÇÃO APLICADA NÃO FOI TOCADA — o `prosrc` dela é o mesmo de antes:
--
--   select md5(prosrc) from pg_proc where proname = 'dar_baixa_com_valor_diferente';
--   -- esperado: a0f5ddc18383e033817332a10ac558b6, medido em 17/10/2026.
--
-- (7) E O `NOTIFY`, que não vem junto com o COMMIT:
--
--   NOTIFY pgrst, 'reload schema';
--
-- APLICAÇÃO: o `BEGIN`/`COMMIT` é do ARQUIVO. Pelo SQL Editor o arquivo vai como está; pelo
-- conector, quem aplicar REMOVE os dois e publica os dois hashes com a transformação nomeada
-- (`transformacao-quebra-a-cadeia-de-hash.md`). O corpo das três funções É o artefato: nada
-- dentro de `$function$` se enxuga. O `name` em `schema_migrations` é o nome completo deste
-- arquivo, sem a extensão.
-- ════════════════════════════════════════════════════════════════════════════════════════
