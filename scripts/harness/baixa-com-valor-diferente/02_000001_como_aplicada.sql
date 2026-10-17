-- ════════════════════════════════════════════════════════════════════════════════════════
-- Etapa 5c.1 — A BAIXA COM VALOR DIFERENTE, E O LOG DO REAJUSTE
-- Projeto: jvthwpkwzpangnwhuyvj  ·  arquivo no repo: aa5edcc9124497e128212aadd4bf72b5
-- Invariante: soma da série depois = soma antes (de DELTA — nunca lê `final_value`).
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.parcela_reajuste_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  operacao_id      uuid NOT NULL,
  parcela_id       uuid NOT NULL REFERENCES public.cash_entries(id) ON DELETE CASCADE,
  serie_origin_type text,
  serie_origin_id  uuid,
  papel            text NOT NULL CHECK (papel IN ('PAGA', 'REAJUSTADA')),
  valor_antes      numeric(14,2) NOT NULL,
  valor_depois     numeric(14,2) NOT NULL,
  delta_da_serie   numeric(14,2) NOT NULL,
  pago_em          date,
  forma            public.payment_method,
  -- QUEM DEU A BAIXA. Este log É o `paid_by` que `cash_entries` não tem.
  -- Sem FK de propósito: o autor é fato histórico e sobrevive à exclusão do usuário.
  criado_por       uuid NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.parcela_reajuste_log IS
  'Historico do reajuste de valor de parcela. Uma linha por parcela AFETADA em cada operacao de baixa com valor diferente: a paga e cada reajustada, amarradas por operacao_id. criado_por e QUEM deu a baixa: este log SUBSTITUI o paid_by que cash_entries nao tem. Sem FK de proposito - o autor e fato historico e precisa sobreviver a exclusao do usuario.';

CREATE INDEX IF NOT EXISTS idx_parcela_reajuste_log_tenant   ON public.parcela_reajuste_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_parcela_reajuste_log_parcela  ON public.parcela_reajuste_log(parcela_id);
CREATE INDEX IF NOT EXISTS idx_parcela_reajuste_log_operacao ON public.parcela_reajuste_log(operacao_id);
CREATE INDEX IF NOT EXISTS idx_parcela_reajuste_log_autor    ON public.parcela_reajuste_log(criado_por);

ALTER TABLE public.parcela_reajuste_log ENABLE ROW LEVEL SECURITY;

-- `get_my_tenant_id()` é o mecanismo da tabela irmã (`cash_entries`), medido no catálogo vivo.
-- `FOR SELECT` e só: o auditado não edita a própria auditoria. A escrita vem de service_role,
-- que não passa por política.
DROP POLICY IF EXISTS "tenant_isolation" ON public.parcela_reajuste_log;
CREATE POLICY "parcela_reajuste_log_select_tenant" ON public.parcela_reajuste_log
  FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE OR REPLACE FUNCTION public.dar_baixa_com_valor_diferente(
  p_parcela_id uuid,
  p_tenant_id  uuid,
  p_usuario_id uuid,
  p_valor_pago numeric,
  p_pago_em    date,
  p_forma      public.payment_method DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_origin_type   text;
  v_origin_id     uuid;
  v_combinado_c   bigint;
  v_pago_c        bigint;
  v_delta_c       bigint;
  v_soma_antes_c  bigint;
  v_soma_depois_c bigint;
  v_base_c        bigint := 0;
  v_ids           uuid[];
  v_cent          bigint[];
  v_cota          bigint[];
  v_n             integer;
  v_i             integer;
  v_soma_cotas    bigint := 0;
  v_operacao      uuid := gen_random_uuid();
  v_ajustadas     integer := 0;
BEGIN
  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'Valor pago invalido (%). A baixa nao foi gravada.', p_valor_pago
      USING ERRCODE = 'PC001';
  END IF;
  IF p_pago_em IS NULL THEN
    RAISE EXCEPTION 'Data do pagamento e obrigatoria. A baixa nao foi gravada.'
      USING ERRCODE = 'PC001';
  END IF;
  IF p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario que da a baixa e obrigatorio: o log nao aceita linha sem autor. Nada foi gravado.'
      USING ERRCODE = 'PC001';
  END IF;

  SELECT origin_type, origin_id
  INTO v_origin_type, v_origin_id
  FROM public.cash_entries
  WHERE id = p_parcela_id
    AND tenant_id = p_tenant_id
    AND type = 'INCOME'
    AND is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada, estornada, ou de outro tenant. Nada foi gravado.'
      USING ERRCODE = 'PC002';
  END IF;

  IF v_origin_id IS NULL OR v_origin_type IS NULL THEN
    RAISE EXCEPTION 'Esta parcela nao pertence a uma serie, entao nao ha entre quem redistribuir. Nada foi gravado.'
      USING ERRCODE = 'PC002';
  END IF;

  -- Trava a série inteira em ordem de `id`: é a ordem que impede deadlock.
  PERFORM 1
  FROM public.cash_entries
  WHERE tenant_id = p_tenant_id
    AND type = 'INCOME'
    AND is_active IS TRUE
    AND origin_type = v_origin_type
    AND origin_id = v_origin_id
  ORDER BY id
  FOR UPDATE;

  -- Re-lê a parcela JÁ SOB A TRAVA: é aqui que `paid_date IS NULL` vira autoritativo.
  SELECT round(amount * 100)::bigint
  INTO v_combinado_c
  FROM public.cash_entries
  WHERE id = p_parcela_id
    AND tenant_id = p_tenant_id
    AND type = 'INCOME'
    AND is_active IS TRUE
    AND paid_date IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta parcela ja esta paga. Nada foi gravado.'
      USING ERRCODE = 'PC004';
  END IF;

  -- Guarda INALCANÇÁVEL hoje (`amount` é NOT NULL): protege um CONTRATO de outra tabela.
  IF v_combinado_c IS NULL THEN
    RAISE EXCEPTION 'A parcela esta com valor nulo no banco. Nada foi gravado.'
      USING ERRCODE = 'PC008';
  END IF;

  SELECT coalesce(sum(round(amount * 100)::bigint), 0)
  INTO v_soma_antes_c
  FROM public.cash_entries
  WHERE tenant_id = p_tenant_id
    AND type = 'INCOME'
    AND is_active IS TRUE
    AND origin_type = v_origin_type
    AND origin_id = v_origin_id;

  -- `NULLS LAST`: a sem vencimento fica no fim porque o RESÍDUO PRECISA DE DESTINO
  -- DETERMINÍSTICO, não porque o mereça.
  SELECT array_agg(id            ORDER BY due_date ASC NULLS LAST, id ASC),
         array_agg(round(amount * 100)::bigint ORDER BY due_date ASC NULLS LAST, id ASC)
  INTO v_ids, v_cent
  FROM public.cash_entries
  WHERE tenant_id = p_tenant_id
    AND type = 'INCOME'
    AND is_active IS TRUE
    AND origin_type = v_origin_type
    AND origin_id = v_origin_id
    AND paid_date IS NULL
    AND id <> p_parcela_id;

  v_n := coalesce(array_length(v_ids, 1), 0);

  -- REGRA 5: a última em aberto. Recusa da operação inteira.
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Esta e a ultima parcela em aberto da serie: nao ha para onde mover a diferenca. Pague o valor combinado pela baixa simples, ou ajuste a serie antes. Nada foi gravado.'
      USING ERRCODE = 'PC005';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_cent) AS x WHERE x IS NULL) THEN
    RAISE EXCEPTION 'Uma parcela em aberto da serie esta com valor nulo no banco. Nada foi gravado.'
      USING ERRCODE = 'PC008';
  END IF;

  v_pago_c  := round(p_valor_pago * 100)::bigint;
  v_delta_c := v_combinado_c - v_pago_c;

  FOR v_i IN 1 .. v_n LOOP
    v_base_c := v_base_c + v_cent[v_i];
  END LOOP;

  IF v_base_c = 0 THEN
    RAISE EXCEPTION 'As parcelas em aberto desta serie somam zero: nao ha peso pelo qual distribuir. Nada foi gravado.'
      USING ERRCODE = 'PC006';
  END IF;

  -- PROPORCIONAL. `trunc` em direção ao zero dá a simetria da regra 3 de graça.
  v_cota := array_fill(0::bigint, ARRAY[v_n]);
  FOR v_i IN 1 .. v_n LOOP
    v_cota[v_i] := trunc(v_delta_c::numeric * v_cent[v_i] / v_base_c)::bigint;
    v_soma_cotas := v_soma_cotas + v_cota[v_i];
  END LOOP;

  -- REGRA 4: o resíduo na ÚLTIMA por `due_date`.
  v_cota[v_n] := v_cota[v_n] + (v_delta_c - v_soma_cotas);

  -- REGRA 3, A TRAVA: confere TODAS antes de gravar QUALQUER UMA.
  FOR v_i IN 1 .. v_n LOOP
    IF v_cent[v_i] + v_cota[v_i] <= 0 THEN
      RAISE EXCEPTION 'A redistribuicao deixaria uma parcela em % , e parcela menor ou igual a zero nao e parcela. A operacao inteira foi recusada e nada foi gravado.',
        to_char((v_cent[v_i] + v_cota[v_i]) / 100.0, 'FM999999990.00')
        USING ERRCODE = 'PC003';
    END IF;
  END LOOP;

  -- `coalesce` na forma: nulo PRESERVA a forma combinada em vez de apagá-la.
  UPDATE public.cash_entries
  SET paid_date      = p_pago_em,
      payment_method = coalesce(p_forma, payment_method),
      amount         = (v_pago_c / 100.0)::numeric(14,2)
  WHERE id = p_parcela_id
    AND tenant_id = p_tenant_id
    AND paid_date IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A parcela foi paga por outro caminho durante esta operacao. Nada foi gravado.'
      USING ERRCODE = 'PC004';
  END IF;

  INSERT INTO public.parcela_reajuste_log
    (tenant_id, operacao_id, parcela_id, serie_origin_type, serie_origin_id,
     papel, valor_antes, valor_depois, delta_da_serie, pago_em, forma, criado_por)
  VALUES
    (p_tenant_id, v_operacao, p_parcela_id, v_origin_type, v_origin_id,
     'PAGA', (v_combinado_c / 100.0)::numeric(14,2), (v_pago_c / 100.0)::numeric(14,2),
     (v_delta_c / 100.0)::numeric(14,2), p_pago_em, p_forma, p_usuario_id);

  -- Uma linha de log por parcela AFETADA — cota zero não é afetação.
  FOR v_i IN 1 .. v_n LOOP
    CONTINUE WHEN v_cota[v_i] = 0;

    UPDATE public.cash_entries
    SET amount = ((v_cent[v_i] + v_cota[v_i]) / 100.0)::numeric(14,2)
    WHERE id = v_ids[v_i]
      AND tenant_id = p_tenant_id
      AND paid_date IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uma parcela da serie mudou durante esta operacao. Nada foi gravado.'
        USING ERRCODE = 'PC007';
    END IF;

    INSERT INTO public.parcela_reajuste_log
      (tenant_id, operacao_id, parcela_id, serie_origin_type, serie_origin_id,
       papel, valor_antes, valor_depois, delta_da_serie, pago_em, forma, criado_por)
    VALUES
      (p_tenant_id, v_operacao, v_ids[v_i], v_origin_type, v_origin_id,
       'REAJUSTADA', (v_cent[v_i] / 100.0)::numeric(14,2),
       ((v_cent[v_i] + v_cota[v_i]) / 100.0)::numeric(14,2),
       (v_delta_c / 100.0)::numeric(14,2), NULL, NULL, p_usuario_id);

    v_ajustadas := v_ajustadas + 1;
  END LOOP;

  -- A INVARIANTE, CONFERIDA CONTRA O BANCO, não contra as variáveis.
  SELECT coalesce(sum(round(amount * 100)::bigint), 0)
  INTO v_soma_depois_c
  FROM public.cash_entries
  WHERE tenant_id = p_tenant_id
    AND type = 'INCOME'
    AND is_active IS TRUE
    AND origin_type = v_origin_type
    AND origin_id = v_origin_id;

  IF v_soma_depois_c <> v_soma_antes_c THEN
    RAISE EXCEPTION 'INVARIANTE VIOLADA: a serie somava % e passaria a somar %. A operacao inteira foi revertida e nada foi gravado.',
      to_char(v_soma_antes_c / 100.0, 'FM999999990.00'),
      to_char(v_soma_depois_c / 100.0, 'FM999999990.00')
      USING ERRCODE = 'PC009';
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'operacao_id',   v_operacao,
    'delta',         (v_delta_c / 100.0)::numeric(14,2),
    'soma_da_serie', (v_soma_depois_c / 100.0)::numeric(14,2),
    'parcela_paga',  jsonb_build_object(
      'id',           p_parcela_id,
      'valor_antes',  (v_combinado_c / 100.0)::numeric(14,2),
      'valor_depois', (v_pago_c / 100.0)::numeric(14,2)
    ),
    'reajustadas',   v_ajustadas,
    'outras_em_aberto', v_n,
    'criado_por',    p_usuario_id
  );
END;
$function$;

COMMENT ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) IS
  'Da baixa numa parcela com valor DIFERENTE (p_usuario_id = quem deu a baixa, gravado em cada linha de log) do combinado e redistribui a diferenca PROPORCIONALMENTE entre as demais parcelas em aberto da MESMA serie, numa transacao. Invariante: soma da serie depois = soma antes (de DELTA - nunca le final_value, entao divergencia pre-existente fica onde esta). Recusa a operacao inteira se: for a ultima parcela em aberto, se alguma restante ficaria <= 0, ou se a invariante falhar. Residuo de centavo na ultima por due_date. Chamada por rota de API com service_role - nunca pelo browser.';

-- O `EXECUTE` a PUBLIC é concedido por padrão: sem estas quatro linhas a função ficaria
-- chamável por `.rpc()` do navegador.
REVOKE ALL ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) FROM anon;
REVOKE ALL ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) TO service_role;

COMMIT;