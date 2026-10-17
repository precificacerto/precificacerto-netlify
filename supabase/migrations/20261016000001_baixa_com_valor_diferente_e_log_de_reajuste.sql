-- ════════════════════════════════════════════════════════════════════════════════════════
-- Etapa 5c.1 — A BAIXA COM VALOR DIFERENTE, E O LOG DO REAJUSTE
--
-- Cria:
--   1. `parcela_reajuste_log`  — a tabela que NÃO EXISTIA, COM AUTOR OBRIGATÓRIO: este log
--      É o `paid_by` que `cash_entries` não tem. Medido em 16/10/2026:
--      `customer_service_history` é observação de atendimento, `mrm_legacy_audit_log` é do
--      motor e nada insere nele, e os campos de estorno de `cash_entries` são linha-espelho,
--      não log de alteração de valor. Sem esta tabela, mudar o valor de uma parcela apaga o
--      valor anterior sem rastro.
--   2. `dar_baixa_com_valor_diferente(...)` — a RPC que dá a baixa E redistribui a
--      diferença, ATOMICAMENTE.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ APLICADA E VERIFICADA em 17/10/2026, 16:13:39 UTC (13:13 BRT), pelo SQL Editor (PO).   ║
-- ║ `schema_migrations`: version `20261017161339`, name com o nome deste arquivo.          ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ATENÇÃO — O `prosrc` QUE ESTÁ NO CATÁLOGO NÃO É O DESTE ARQUIVO.
-- Os comentários internos da função (dentro de `$function$`) foram ENXUGADOS na
-- transcrição, e o COMMENT ON FUNCTION perdeu o acento de "Resíduo" ("Residuo").
-- A LÓGICA É IDÊNTICA, provada pela árvore PL/pgSQL do corpo: 2.252 nós idênticos, com
-- cada query interna comparada pela sua árvore SQL, e 188 linhas de código iguais.
-- QUEM COMPARAR O TEXTO DA FUNÇÃO NO BANCO COM ESTE ARQUIVO VAI VER DIFERENÇA, E ELA É DE
-- COMENTÁRIO, NÃO DE COMPORTAMENTO. Não é defeito a caçar — foi medida e aceita em
-- 17/10/2026 (`transformacao-quebra-a-cadeia-de-hash.md`, seção do texto guardado).
--
--   arquivo revisado              md5 aa5edcc9124497e128212aadd4bf72b5 (584 linhas)
--   versão colada pelo PO         md5 3bef0c62bffd24281bff08dc340c8f2f (300 linhas) — o hash
--                                 é o relatado; o arquivo não passou por este repositório
--   texto que o Postgres recebeu  `postgres_logs`, source dashboard, 300 linhas com CRLF:
--                                 mensagem 13.380 bytes, md5 5b7059e3a533820acfeac711475c78a6
--                                 (conferido contra o MD5 do próprio servidor de logs);
--                                 corpo sem o rodapé, md5 7d6d5814aff6fe110a7d6a8212fb4f8b
--   `prosrc` no catálogo          md5 a0f5ddc18383e033817332a10ac558b6, 8.474 caracteres
--                                 (230 deles são `\r` do transporte) — igual ao corpo do log
--   `prosrc` deste arquivo        md5 960261c63c77a76bf742a138ca44fc69, 12.353 caracteres
--   COMMENT ON FUNCTION           catálogo ee212c12… ("Residuo") · arquivo c5fc756a… ("Resíduo")
--
-- PROVA PELO ESTADO, 17/10/2026: as outras 15 árvores do texto logado idênticas às deste
-- arquivo (fora posições); 14 colunas e `relrowsecurity` true; uma política `SELECT` com
-- `(tenant_id = get_my_tenant_id())`; seis parâmetros, `prosecdef` true, `search_path=public`;
-- EXECUTE false/false/true para anon/authenticated/service_role; nulo em último na
-- ordenação; `criado_por` NOT NULL; `cash_entries.amount` NOT NULL; `NOTIFY pgrst` rodado.
-- A RPC NÃO FOI CHAMADA contra dado real.
--
-- É FUNÇÃO, e para função a ordem é APLICAR ANTES DO MERGE: mergear sem aplicar deixa a
-- rota de API chamando algo que o banco não tem. E `plpgsql` NÃO VALIDA referências na
-- criação — a função é criada com sucesso mesmo chamando o que não existe, e falha só no
-- primeiro uso. Por isso a VERIFICAÇÃO tem sete consultas, não uma.
--
--
-- A REGRA DO DELTA — as cinco, do dono do produto, 16/10/2026
-- ===========================================================
-- A RPC **NUNCA LÊ `final_value`**. Ela opera só sobre a série: pega a diferença entre o
-- valor combinado e o valor pago e a move entre as parcelas EM ABERTO DA MESMA SÉRIE. A
-- invariante é `soma depois = soma antes`, de DELTA — então a divergência pré-existente
-- entre a soma das parcelas e o total da venda **não é espalhada nem corrigida: fica
-- exatamente onde está**.
--
--   1. DISTRIBUIÇÃO: PROPORCIONAL ao valor de cada parcela em aberto. É a regra da própria
--      cascata do motor — redistribuição pelos pesos originais. Com parcelas iguais,
--      proporcional É igual, então o caso simples sai de graça.
--   2. ESCOPO: a RPC faz AS DUAS COISAS numa transação. Em duas chamadas, uma queda no meio
--      deixa a série errada — é a única razão de ela existir.
--   3. SINAL: SIMÉTRICO, MESMA FÓRMULA, sem caso especial. E a trava: NENHUMA restante pode
--      ficar <= 0. Se a conta zerar ou negativar qualquer uma, RECUSA A OPERAÇÃO INTEIRA.
--      Parcela de R$ 0,00 não é parcela — teria de ser apagada ou virar crédito, e nenhuma
--      das duas é esta rodada.
--   4. RESÍDUO: na ÚLTIMA EM ABERTO por `due_date`, empate pelo `id`. Delta de R$ 0,01 em
--      três parcelas não divide; cai numa, e qual é tem de ser SEMPRE A MESMA.
--   5. ÚLTIMA EM ABERTO: RECUSA DA OPERAÇÃO INTEIRA, nada gravado. A pessoa pediu para pagar
--      um valor diferente; dar baixa pelo valor combinado seria fazer OUTRA COISA do que foi
--      pedido, em silêncio.
--
-- O ALCANCE, MEDIDO em 16/10/2026 sobre as 74 séries com origem em venda:
--   58 sem nenhuma parcela em aberto · 10 com exatamente uma (regra 5 recusa) ·
--   **6 com duas ou mais — a população inteira sobre a qual esta RPC pode agir**.
--   Três dessas seis JÁ DIVERGEM do total da venda (1 a 4 centavos), e é sobre uma delas
--   que o portão monta a fixture: sem isso, "a soma não mudou" passa verde num caso que não
--   discrimina (`teste-que-nao-exercita.md`, variante 2).
--   As três vendas que divergem em MILHARES estão fora por DOIS motivos, não um: têm
--   parcela única E zero parcelas em aberto. Esta RPC não as alcança.
--
--
-- A TRAVA É EM DUAS CAMADAS, e a de baixo é esta
-- ===============================================
-- A tela só oferece o campo de valor diferente quando existe OUTRA parcela em aberto na
-- série. A RPC recusa de todo modo. Uma tela que não oferece NÃO substitui um banco que não
-- aceita — `portao-que-nao-alcanca.md`: o portão que não é acionado não protege.
--
--
-- CENTAVOS INTEIROS, do começo ao fim
-- ====================================
-- Toda a aritmética é em `bigint` de centavos, e a divisão por 100 acontece UMA vez, na
-- gravação. `0,1 + 0,2` não é `0,3`, e esta é a conta que decide quanto o cliente deve.
-- A escala é 2, declarada: `round(amount * 100)` na entrada, `/ 100.0` na saída.
--
--
-- QUEM CHAMA: ROTA DE API COM `supabaseAdmin`, NUNCA O BROWSER
-- =============================================================
-- O `EXECUTE` é REVOGADO de `public`, `anon` e `authenticated`, e concedido só a
-- `service_role`. Sem a revogação explícita o Postgres concede `EXECUTE` a `PUBLIC` por
-- padrão, e a função ficaria chamável por `.rpc()` do navegador — que é exatamente o que
-- não pode acontecer com uma função que move dinheiro entre parcelas.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 1. O LOG
-- ────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parcela_reajuste_log (
  -- `gen_random_uuid()`, nativa do core — não `uuid_generate_v4()`, que exige a extensão
  -- `uuid-ossp`. Medido: a extensão ESTÁ instalada hoje, então as duas funcionariam; o que
  -- não se sustenta é o arquivo usar uma na tabela e outra na função. Uma dependência de
  -- extensão que não precisa existir é uma forma de o CREATE falhar noutro ambiente.
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,

  -- Amarra as linhas de UMA operação: a parcela paga e cada reajustada saem com o mesmo
  -- `operacao_id`. Sem ele não dá para reconstruir qual reajuste veio de qual baixa.
  operacao_id      uuid NOT NULL,

  parcela_id       uuid NOT NULL REFERENCES public.cash_entries(id) ON DELETE CASCADE,
  serie_origin_type text,
  serie_origin_id  uuid,

  -- 'PAGA' é a parcela que recebeu a baixa; 'REAJUSTADA' é cada uma que absorveu parte do
  -- delta. São papéis diferentes na mesma operação, e confundi-los apagaria qual foi paga.
  papel            text NOT NULL CHECK (papel IN ('PAGA', 'REAJUSTADA')),

  valor_antes      numeric(14,2) NOT NULL,
  valor_depois     numeric(14,2) NOT NULL,
  -- O delta DA OPERAÇÃO, repetido em cada linha: é o que permite conferir que a soma das
  -- absorções fecha com ele sem reabrir a série.
  delta_da_serie   numeric(14,2) NOT NULL,

  -- Só na linha 'PAGA'. NULL nas reajustadas significa "não se aplica", não "sem forma".
  pago_em          date,
  forma            public.payment_method,

  -- QUEM DEU A BAIXA. `NOT NULL`, e o log É o `paid_by` que `cash_entries` não tem: esta
  -- tabela foi criada para responder "quem mexeu no valor", e log sem autor não responde.
  --
  -- POR QUE AGORA, E NÃO ADITIVO DEPOIS: coluna acrescentada depois deixa SEM AUTOR PARA
  -- SEMPRE toda baixa registrada antes dela. Aditivo não recupera o passado — é a mesma
  -- razão de `ausente-vs-falso.md` ao contrário: aqui o risco não é a coluna que nada
  -- preenche, é a linha que nasce sem o dado e nunca mais o terá.
  --
  -- SEM FK, E A RAZÃO É DE CLASSE. O autor aqui é FATO HISTÓRICO, não referência viva
  -- (`fato-vs-referencia.md`): `ON DELETE CASCADE` apagaria a auditoria junto com o
  -- usuário, `SET NULL` violaria o `NOT NULL`, e `RESTRICT` faria a exclusão de usuário
  -- passar a falhar — mudança de comportamento numa tela que esta rodada não toca. O id
  -- fica gravado mesmo que a linha de `public.users` deixe de existir.
  --
  -- O id é o de `public.users(id)`, que é o mesmo de `auth.users(id)` — medido em
  -- 16/10/2026: 20 linhas em cada e os 20 ids coincidem.
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

-- O MECANISMO É O DA TABELA IRMÃ, e a escolha é medida, não copiada
-- ------------------------------------------------------------------
-- `get_my_tenant_id()` é o que `cash_entries` usa — a tabela que este log espelha linha a
-- linha. Medido no catálogo vivo em 16/10/2026:
--   `cash_entries`     -> `tenant_id = get_my_tenant_id()`
--   `product_sections` -> `tenant_id = get_auth_tenant_id()`
--   `sales`            -> `get_auth_tenant_id()` + papel, em políticas separadas por comando
--
-- A PRIMEIRA VERSÃO DESTE ARQUIVO usava um QUARTO mecanismo —
-- `(SELECT auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid` — e ele NÃO FUNCIONARIA:
-- medido, a chave `tenant_id` não existe no `raw_app_meta_data` de NENHUM dos 20 usuários.
-- O predicado seria NULL para todo mundo, e como a escrita entra por `service_role`, que
-- IGNORA RLS, o log encheria e ninguém conseguiria ler. Auditoria que existe e não se lê.
--
-- E a justificativa daquela versão era falsa de um jeito instrutivo: ela dizia "mesma forma
-- de `product_sections`", copiada do ARQUIVO DE MIGRAÇÃO daquela tabela. A política VIVA de
-- `product_sections` é `get_auth_tenant_id()` — o arquivo não é o banco
-- (`estado-relatado-vs-real.md`, e é a razão de esta decisão ter sido remedida no catálogo).
--
-- `FOR SELECT`, E SÓ. O AUDITADO NÃO EDITA A PRÓPRIA AUDITORIA
-- -------------------------------------------------------------
-- Política sem `FOR` vale para SELECT, INSERT, UPDATE e DELETE: um usuário do tenant
-- alteraria ou apagaria as linhas de log do próprio tenant pelo PostgREST, e log cujas
-- linhas o auditado edita não é log.
-- A escrita legítima vem de `service_role`, que não passa por política nenhuma — então
-- restringir a SELECT não tira caminho de escrita de ninguém: tira o caminho que não
-- deveria existir.
DROP POLICY IF EXISTS "tenant_isolation" ON public.parcela_reajuste_log;
CREATE POLICY "parcela_reajuste_log_select_tenant" ON public.parcela_reajuste_log
  FOR SELECT
  USING (tenant_id = get_my_tenant_id());

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 2. A RPC
-- ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dar_baixa_com_valor_diferente(
  p_parcela_id uuid,
  p_tenant_id  uuid,
  -- QUEM está dando a baixa. Obrigatório, e vai para `criado_por` em cada linha de log.
  -- Mesmo modelo de confiança de `p_tenant_id` e das quatro cascatas: a rota de API
  -- autentica o chamador para exigir `cash_flow.can_edit` e passa o id adiante.
  p_usuario_id uuid,
  p_valor_pago numeric,
  p_pago_em    date,
  -- `NULL` aqui significa "NÃO MEXER NA FORMA", nunca "apagar a forma". Ver o `coalesce`
  -- na gravação: `DEFAULT NULL` com atribuição direta apagaria silenciosamente a forma
  -- combinada de quem não mandasse o campo.
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
  v_combinado_c   bigint;          -- o valor COMBINADO da parcela, em centavos
  v_pago_c        bigint;
  v_delta_c       bigint;          -- combinado - pago. Positivo = pagou MENOS, restantes SOBEM
  v_soma_antes_c  bigint;
  v_soma_depois_c bigint;
  v_base_c        bigint := 0;     -- soma das restantes, o denominador do proporcional
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
  -- O autor é obrigatório ANTES de qualquer leitura: uma baixa que grave sem ele deixa a
  -- linha de log sem a resposta que a tabela existe para dar, e sem como recuperá-la.
  IF p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario que da a baixa e obrigatorio: o log nao aceita linha sem autor. Nada foi gravado.'
      USING ERRCODE = 'PC001';
  END IF;

  -- (a) A SÉRIE, lida sem trava só para descobrir qual é.
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
    -- Parcela sem série não tem entre quem redistribuir. Medido: 12 das 74 séries não
    -- resolvem venda, mais as linhas `[A RECEBER]` que apontam para `calendar_events`.
    RAISE EXCEPTION 'Esta parcela nao pertence a uma serie, entao nao ha entre quem redistribuir. Nada foi gravado.'
      USING ERRCODE = 'PC002';
  END IF;

  -- (b) TRAVA A SÉRIE INTEIRA, em ordem de `id`. A ordem é o que impede deadlock entre duas
  --     chamadas concorrentes sobre a mesma série escolhendo parcelas diferentes.
  PERFORM 1
  FROM public.cash_entries
  WHERE tenant_id = p_tenant_id
    AND type = 'INCOME'
    AND is_active IS TRUE
    AND origin_type = v_origin_type
    AND origin_id = v_origin_id
  ORDER BY id
  FOR UPDATE;

  -- (c) RE-LÊ a parcela JÁ SOB A TRAVA. É aqui que `paid_date IS NULL` vira autoritativo:
  --     a leitura de (a) poderia estar velha. Mesma idempotência da baixa simples.
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

  -- GUARDA CONTRA VALOR NULO — e ela é INALCANÇÁVEL HOJE, de propósito
  -- --------------------------------------------------------------------
  -- Medido em 16/10/2026: `cash_entries.amount` é `NOT NULL` e tem ZERO linhas nulas, então
  -- esta linha não executa. Ela existe porque esta função depende de um `NOT NULL` DE OUTRA
  -- TABELA, que ela não controla e cuja remoção não a quebraria de forma visível: com
  -- `amount` nulo, `round(amount*100)` dá NULL, `FOUND` segue verdadeiro, `v_delta_c` vira
  -- NULL, e a trava do `<= 0` NÃO dispara, porque NULL não é true. A operação morreria só
  -- no `NOT NULL` de `valor_antes` no INSERT do log — falha segura, mas por acidente e com
  -- mensagem que não explica.
  -- Está escrito assim para que ninguém leia a guarda como evidência de que nulos
  -- acontecem (`portao-que-nao-alcanca.md`: um check que não pode ficar vermelho não
  -- protege — este protege um CONTRATO, não um caso).
  IF v_combinado_c IS NULL THEN
    RAISE EXCEPTION 'A parcela esta com valor nulo no banco. Nada foi gravado.'
      USING ERRCODE = 'PC008';
  END IF;

  -- (d) A SOMA ANTES, sobre a série inteira — pagas e em aberto. É contra ela que a
  --     invariante é conferida no fim.
  SELECT coalesce(sum(round(amount * 100)::bigint), 0)
  INTO v_soma_antes_c
  FROM public.cash_entries
  WHERE tenant_id = p_tenant_id
    AND type = 'INCOME'
    AND is_active IS TRUE
    AND origin_type = v_origin_type
    AND origin_id = v_origin_id;

  -- (e) AS RESTANTES EM ABERTO, em ordem. A ÚLTIMA do array é a que recebe o resíduo.
  --     `NULLS LAST`: a parcela SEM VENCIMENTO fica no fim porque O RESÍDUO É DE CENTAVOS
  --     E PRECISA DE DESTINO DETERMINÍSTICO, **não porque ela o mereça**. Não há nada em
  --     "sem data" que a qualifique para receber a sobra; o que há é que a sobra tem de
  --     cair sempre no mesmo lugar, e `ORDER BY` sem `NULLS LAST` explícito deixaria isso
  --     ao default do Postgres em vez de à decisão de alguém.
  --     Medido em 16/10/2026: `due_date` é nulo em 0 de 1.659 linhas, então hoje este ramo
  --     não é percorrido — fica DECIDIDO para que a primeira linha sem data não caia num
  --     comportamento emergente. A consulta (5) da VERIFICAÇÃO fixa a ordenação com um nulo.
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

  -- A mesma guarda do PC008, do lado das restantes: um nulo aqui envenenaria `v_base_c` e,
  -- por ele, todas as cotas. `unnest` em vez de `array_position(v_cent, NULL)` porque a
  -- semântica daquela com NULL depende de detalhe que eu não posso conferir sem executar,
  -- e esta não depende de nenhum.
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
    -- Proporcional sobre base zero é 0/0. Não existe peso, então não existe distribuição.
    RAISE EXCEPTION 'As parcelas em aberto desta serie somam zero: nao ha peso pelo qual distribuir. Nada foi gravado.'
      USING ERRCODE = 'PC006';
  END IF;

  -- (f) O PROPORCIONAL. `trunc` em direção ao zero mantém |cota| <= exato, então o resíduo
  --     sai com o MESMO SINAL do delta — e `trunc(-x) = -trunc(x)` dá a simetria da regra 3
  --     de graça: distribuir -d é exatamente -distribuir(d), sem ramo por sinal.
  v_cota := array_fill(0::bigint, ARRAY[v_n]);
  FOR v_i IN 1 .. v_n LOOP
    v_cota[v_i] := trunc(v_delta_c::numeric * v_cent[v_i] / v_base_c)::bigint;
    v_soma_cotas := v_soma_cotas + v_cota[v_i];
  END LOOP;

  -- REGRA 4: o resíduo na ÚLTIMA por `due_date` (o último do array ordenado).
  v_cota[v_n] := v_cota[v_n] + (v_delta_c - v_soma_cotas);

  -- (g) REGRA 3, A TRAVA: confere TODAS antes de gravar QUALQUER UMA.
  FOR v_i IN 1 .. v_n LOOP
    IF v_cent[v_i] + v_cota[v_i] <= 0 THEN
      RAISE EXCEPTION 'A redistribuicao deixaria uma parcela em % , e parcela menor ou igual a zero nao e parcela. A operacao inteira foi recusada e nada foi gravado.',
        to_char((v_cent[v_i] + v_cota[v_i]) / 100.0, 'FM999999990.00')
        USING ERRCODE = 'PC003';
    END IF;
  END LOOP;

  -- (h) A BAIXA. `amount` É gravado aqui — este é o caminho autorizado a mudar o valor, e
  --     o único. A baixa simples (`baixa-de-parcela.ts`) nunca manda `amount`.
  --     `coalesce` NA FORMA: `p_forma` nulo PRESERVA a forma combinada em vez de apagá-la.
  --     Com atribuição direta, quem chamasse sem o campo gravaria NULL por cima do BOLETO
  --     que estava lá, e a perda seria silenciosa — ninguém pediu para esquecer a forma.
  --     Consequência aceita e declarada: por este caminho NÃO SE LIMPA a forma. Limpar não
  --     foi pedido, e um caminho que apaga por omissão é pior que um que não apaga.
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

  -- (i) AS REAJUSTADAS. Uma linha de log por parcela AFETADA — cota zero não é afetação.
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

  -- (j) A INVARIANTE, CONFERIDA CONTRA O BANCO, não contra as variáveis. Conferir a conta
  --     que acabei de fazer contra ela mesma passaria verde sempre — é o `teste-que-nao-
  --     exercita` dentro da própria função. A releitura é o que torna a asserção capaz de
  --     falhar. Falhou, a transação inteira volta: nem a baixa fica.
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
    -- `outras_em_aberto`: quantas parcelas em aberto a série tinha ALÉM da que foi paga.
    -- O nome anterior, `em_aberto_na_serie`, sugeria "em aberto DEPOIS da operação" — e o
    -- próximo consumidor lê o nome, não o código.
    'outras_em_aberto', v_n,
    'criado_por',    p_usuario_id
  );
END;
$function$;

COMMENT ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) IS
  'Da baixa numa parcela com valor DIFERENTE (p_usuario_id = quem deu a baixa, gravado em cada linha de log) do combinado e redistribui a diferenca PROPORCIONALMENTE entre as demais parcelas em aberto da MESMA serie, numa transacao. Invariante: soma da serie depois = soma antes (de DELTA - nunca le final_value, entao divergencia pre-existente fica onde esta). Recusa a operacao inteira se: for a ultima parcela em aberto, se alguma restante ficaria <= 0, ou se a invariante falhar. Resíduo de centavo na ultima por due_date. Chamada por rota de API com service_role - nunca pelo browser.';

-- O `EXECUTE` a `PUBLIC` é CONCEDIDO POR PADRÃO pelo Postgres. Sem estas quatro linhas a
-- função ficaria chamável por `.rpc()` do navegador.
REVOKE ALL ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) FROM anon;
REVOKE ALL ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.dar_baixa_com_valor_diferente(uuid, uuid, uuid, numeric, date, public.payment_method) TO service_role;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar. SETE consultas, não uma.
--
-- `plpgsql` não valida referências na criação: achar a função em `pg_proc` prova que o
-- CREATE rodou, NÃO que ela funciona. É o caso que `teste-que-nao-exercita.md` descreve,
-- em forma de consulta ao catálogo.
--
-- (1) A TABELA existe, com as 14 colunas e a RLS ligada:
--
--   select count(*) as colunas from information_schema.columns
--    where table_schema='public' and table_name='parcela_reajuste_log';
--   -- esperado: 14
--
--   select relrowsecurity from pg_class
--    where oid = 'public.parcela_reajuste_log'::regclass;
--   -- esperado: true
--
-- (1b) A POLÍTICA É `SELECT`, E O MECANISMO É O DA TABELA IRMÃ. É a consulta que impede o
--      auditado de editar a própria auditoria, e a que pega o mecanismo errado de tenant:
--
--   select policyname, cmd, qual
--     from pg_policies
--    where schemaname='public' and tablename='parcela_reajuste_log';
--
--   -- esperado: UMA linha
--   --   policyname = parcela_reajuste_log_select_tenant
--   --   cmd        = SELECT              <- `ALL` significa que o cliente pode UPDATE/DELETE
--   --   qual       = (tenant_id = get_my_tenant_id())
--   --
--   -- `cmd = ALL` e o log deixa de ser log. `qual` com `auth.jwt()` e o log não é LIDO por
--   -- ninguém: a claim `app_metadata.tenant_id` não existe em nenhum dos 20 usuários.
--
-- (2) A FUNÇÃO existe, com a assinatura esperada:
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname='dar_baixa_com_valor_diferente';
--   -- esperado: UMA linha, args `uuid, uuid, uuid, numeric, date, payment_method`,
--   -- prosecdef = t. CINCO `uuid, uuid, numeric, …` seria a versão SEM o autor.
--
-- (3) O EXECUTE NÃO vazou para o browser — e esta é a que ninguém lembra de rodar:
--
--   select has_function_privilege('anon',
--            'public.dar_baixa_com_valor_diferente(uuid,uuid,uuid,numeric,date,public.payment_method)',
--            'EXECUTE') as anon_pode,
--          has_function_privilege('authenticated',
--            'public.dar_baixa_com_valor_diferente(uuid,uuid,uuid,numeric,date,public.payment_method)',
--            'EXECUTE') as auth_pode,
--          has_function_privilege('service_role',
--            'public.dar_baixa_com_valor_diferente(uuid,uuid,uuid,numeric,date,public.payment_method)',
--            'EXECUTE') as service_pode;
--   -- esperado: false, false, true. Qualquer `true` nos dois primeiros é a função exposta.
--
-- (4) A ORDENAÇÃO DO RESÍDUO, FIXADA COM UM NULO. É o caso que torna o comportamento
--     decidido em vez de emergente, e roda sem tocar em dado nenhum:
--
--   with amostra(id, due_date) as (values
--     ('11111111-1111-1111-1111-111111111111'::uuid, '2026-11-10'::date),
--     ('22222222-2222-2222-2222-222222222222'::uuid, '2026-09-10'::date),
--     ('33333333-3333-3333-3333-333333333333'::uuid, NULL::date),
--     ('00000000-0000-0000-0000-000000000000'::uuid, '2026-09-10'::date)
--   )
--   select id, due_date, row_number() over (order by due_date asc nulls last, id asc) as pos
--     from amostra order by pos;
--
--   -- esperado, nesta ordem exata:
--   --   1  00000000-…  2026-09-10   <- empate de data desfeito pelo id MENOR
--   --   2  22222222-…  2026-09-10
--   --   3  11111111-…  2026-11-10
--   --   4  33333333-…  NULL         <- A SEM VENCIMENTO É A ÚLTIMA, logo recebe o resíduo
--   --
--   -- Se a posição 4 não for a do nulo, o `NULLS LAST` não está em vigor e o destino do
--   -- resíduo passou a depender do default — que é precisamente o que esta consulta existe
--   -- para impedir.
--
-- (5) O LOG NÃO ACEITA LINHA SEM AUTOR — a trava que faz dele um substituto do `paid_by`:
--
--   select is_nullable from information_schema.columns
--    where table_schema='public' and table_name='parcela_reajuste_log'
--      and column_name='criado_por';
--   -- esperado: NO. `YES` significa que o log pode nascer anônimo, e aí ele não responde
--   -- a pergunta para a qual foi criado.
--
-- (6) E O `NOTIFY`, que NÃO vem junto com o COMMIT. Sem ele o PostgREST continua servindo o
--     cache antigo, e o erro que o usuário vê é indistinguível de "a função não existe" —
--     foi assim que a produção caiu em 01/09/2026:
--
--   NOTIFY pgrst, 'reload schema';
--
-- APLICAÇÃO: o `BEGIN`/`COMMIT` acima é do ARQUIVO. Quem aplicar pelo conector do Supabase
-- precisa REMOVÊ-LOS — o conector abre transação própria, e o `COMMIT` daqui fecharia a
-- dele. Pelo SQL Editor o arquivo vai como está. E o `name` da migração aplicada é o NOME
-- COMPLETO DESTE ARQUIVO, sem a extensão (`migration-delivery.md`): é a única coisa que
-- liga a linha de `schema_migrations` ao arquivo do repositório.
-- ════════════════════════════════════════════════════════════════════════════════════════
