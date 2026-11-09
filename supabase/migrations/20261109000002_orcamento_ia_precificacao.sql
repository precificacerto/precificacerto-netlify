-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261109000002 — a PROVISÃO DA PRECIFICAÇÃO do orçamento I.A.: as colunas onde o motor grava o custo
-- e o preço, no item e no orçamento. ESTRUTURA AGORA, DADO DEPOIS.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto. Pressupõe a 20261109000001 aplicada.
-- ║ Ao aplicar fora do CLI, o `name` da migração é 20261109000002_orcamento_ia_precificacao.
-- ║ SÓ ACRESCENTA COLUNAS E CHECKs, todas NULAS e SEM DEFAULT: nenhuma linha é inserida,
-- ║ alterada ou apagada; nenhuma coluna, constraint ou tabela sai. Medido em produção em
-- ║ 09/11/2026: as duas tabelas têm 0 linhas.
-- ║ NÃO CRIA FUNÇÃO e NÃO MEXE EM GRANT: as colunas novas herdam os da tabela (service_role
-- ║ com SELECT, INSERT e UPDATE; nada a anon, authenticated ou PUBLIC — a verificação confere).
-- ║ NENHUM CÓDIGO LÊ OU GRAVA ESTAS COLUNAS AINDA: as rotas do #253 nomeiam as colunas que leem.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 09/11/2026: "a gente tem que ter aquela coluna já prevista, onde o motor vai
-- fazer a aplicação, o cálculo sobre aquele item, sobre o valor final. Então, o importante é ter a
-- configuração. Depois a gente vê quais são os itens que tem crédito, não tem, tem IPI, não tem."
--
-- AS REGRAS QUE AS COLUNAS CARREGAM:
--   - VAZIO NÃO É ZERO (`ausente-vs-falso.md`): nulo é "não há o que apurar"; zero é "apurou e deu nada". Nenhuma
--     coluna tem DEFAULT, e a verificação confere que nenhuma ganhou um.
--   - DERIVADO, NUNCA IMPORTADO: o líquido só existe com o bruto de onde saiu; o custo de fabricação, com o tempo e
--     o valor do minuto; o custo líquido total, com o líquido dos materiais e a fabricação; o líquido do orçamento,
--     com o bruto; o valor de venda, com o líquido. São CHECKs de presença: o banco não refaz a conta (não há coluna
--     gerada), só impede o resultado sem a sua origem.
--   - A CASCATA (`custo-liquido-por-fracao.md`) é do MOTOR, não do banco: ICMS sobre o bruto, PIS/COFINS sobre o
--     SALDO, IPI creditável com base própria, IPI sem crédito compondo o custo. Os seis percentuais do item ficam
--     gravados para que a conta possa ser conferida depois sem ser refeita. Os NOMES são os de
--     `orcamentista_tabela_item` (cred_icms_pct, cred_pis_cofins_pct, cred_ipi_pct, nc_ipi_pct, cred_ibs_pct,
--     cred_cbs_pct), para que a mesma palavra queira dizer a mesma coisa nas duas pontas.
--   - CONGELADO, NÃO LIDO AO VIVO (`fato-vs-referencia.md`): o que o orçamento usou fica nele. Os percentuais da
--     comissão, da reserva técnica e do lucro têm os NOMES e as FAIXAS de `orcamentista_levantamento` (copiados de
--     lá na criação do orçamento do agente; digitados no manual).
--
-- O QUE FAZ:
--   1. NO ITEM (`orcamentista_orcamento_item`), 12 colunas:
--        custo_bruto_materiais, cred_icms_pct, cred_pis_cofins_pct, cred_ipi_pct, nc_ipi_pct, cred_ibs_pct,
--        cred_cbs_pct, custo_liquido_materiais, tempo_fabricacao_min, valor_minuto, custo_fabricacao,
--        custo_liquido_total — e 5 CHECKs (valores >= 0, percentuais de 0 a 100, e as três derivações).
--      Os percentuais do item são os EFETIVOS do item (o item junta materiais de mais de uma tabela); o detalhe
--      por material consumido é proposta separada, não está aqui.
--   2. NO ORÇAMENTO (`orcamentista_orcamento`), 11 colunas:
--        comissao_percentual, comissao_modo, reserva_tecnica_percentual, lucro_projetado_percentual,
--        aproveitamento_modo, aproveitamento_origem, aproveitamento_motivo, aproveitamento_por,
--        valor_total_bruto, valor_total_liquido, valor_venda — e 12 CHECKs.
--      O MODO DE APROVEITAMENTO MORA NO ORÇAMENTO, NÃO NO ITEM: "o modo é do pedido, não do item. Todos os itens de
--      uma proposta usam o mesmo modo, porque o rateio de cima para baixo só existe em relação ao total daquele
--      pedido" (`custo-liquido-por-fracao.md`, consequência de desenho). Origem, motivo e autor como a regra
--      lista: base_de_conhecimento | alterado_no_orcamento | fallback_barra_inteira; o fallback é sempre SEM.
--
-- ONDE O MOTOR APLICA (o código que grava, a escrever na próxima rodada — esta migração não o traz):
--   por item: custo_bruto_materiais -> a cascata com os percentuais do item -> custo_liquido_materiais;
--             tempo_fabricacao_min x valor_minuto -> custo_fabricacao; os dois somados -> custo_liquido_total.
--   no orçamento: a soma dos itens -> valor_total_bruto e valor_total_liquido; sobre o líquido, a precificação final
--             (comissão, reserva técnica, lucro e os tributos de saída) -> valor_venda.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS e cada CHECK só se o nome não existe; a verificação confere a forma, e uma
--   coluna ou CHECK de mesmo nome com outra forma aborta.
-- GUARDA (aborta): as duas tabelas da 20261109000001 existem, com a CHECK orcamentista_orcamento_origem_amarrada.
-- VERIFICAÇÃO (aborta): as 23 colunas novas com tipo, nulas e sem default; as 26 + 23 = 49 colunas das duas tabelas;
--   as 17 CHECKs novas com a definição; 23 + 17 = 40 constraints; nenhum grant a anon, authenticated ou PUBLIC; e o
--   service_role ainda só com INSERT, SELECT e UPDATE.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_orcamento') IS NULL OR to_regclass('public.orcamentista_orcamento_item') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento ou orcamentista_orcamento_item (a migracao 20261109000001). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_origem_amarrada') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_orcamento_origem_amarrada (a migracao 20261109000001). Nada foi alterado.';
  END IF;
END
$guarda$;

-- o item: o par bruto/liquido, os tributos efetivos do item e a fabricacao
ALTER TABLE public.orcamentista_orcamento_item
  ADD COLUMN IF NOT EXISTS custo_bruto_materiais   numeric NULL,
  ADD COLUMN IF NOT EXISTS cred_icms_pct           numeric NULL,
  ADD COLUMN IF NOT EXISTS cred_pis_cofins_pct     numeric NULL,
  ADD COLUMN IF NOT EXISTS cred_ipi_pct            numeric NULL,
  ADD COLUMN IF NOT EXISTS nc_ipi_pct              numeric NULL,
  ADD COLUMN IF NOT EXISTS cred_ibs_pct            numeric NULL,
  ADD COLUMN IF NOT EXISTS cred_cbs_pct            numeric NULL,
  ADD COLUMN IF NOT EXISTS custo_liquido_materiais numeric NULL,
  ADD COLUMN IF NOT EXISTS tempo_fabricacao_min    numeric NULL,
  ADD COLUMN IF NOT EXISTS valor_minuto            numeric NULL,
  ADD COLUMN IF NOT EXISTS custo_fabricacao        numeric NULL,
  ADD COLUMN IF NOT EXISTS custo_liquido_total     numeric NULL;

-- o orcamento: os percentuais congelados, o modo de aproveitamento do pedido e os totais
ALTER TABLE public.orcamentista_orcamento
  ADD COLUMN IF NOT EXISTS comissao_percentual         numeric NULL,
  ADD COLUMN IF NOT EXISTS comissao_modo               text    NULL,
  ADD COLUMN IF NOT EXISTS reserva_tecnica_percentual  numeric NULL,
  ADD COLUMN IF NOT EXISTS lucro_projetado_percentual  numeric NULL,
  ADD COLUMN IF NOT EXISTS aproveitamento_modo         text    NULL,
  ADD COLUMN IF NOT EXISTS aproveitamento_origem       text    NULL,
  ADD COLUMN IF NOT EXISTS aproveitamento_motivo       text    NULL,
  ADD COLUMN IF NOT EXISTS aproveitamento_por          uuid    NULL,
  ADD COLUMN IF NOT EXISTS valor_total_bruto           numeric NULL,
  ADD COLUMN IF NOT EXISTS valor_total_liquido         numeric NULL,
  ADD COLUMN IF NOT EXISTS valor_venda                 numeric NULL;

DO $checks$
DECLARE
  novas text[] := ARRAY[
    -- o item
    'orcamentista_orcamento_item|orcamentista_orcamento_item_valores_nao_negativos|CHECK (((custo_bruto_materiais IS NULL) OR (custo_bruto_materiais >= 0)) AND ((custo_liquido_materiais IS NULL) OR (custo_liquido_materiais >= 0)) AND ((tempo_fabricacao_min IS NULL) OR (tempo_fabricacao_min >= 0)) AND ((valor_minuto IS NULL) OR (valor_minuto >= 0)) AND ((custo_fabricacao IS NULL) OR (custo_fabricacao >= 0)) AND ((custo_liquido_total IS NULL) OR (custo_liquido_total >= 0)))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_percentuais_na_faixa|CHECK (((cred_icms_pct IS NULL) OR ((cred_icms_pct >= 0) AND (cred_icms_pct <= 100))) AND ((cred_pis_cofins_pct IS NULL) OR ((cred_pis_cofins_pct >= 0) AND (cred_pis_cofins_pct <= 100))) AND ((cred_ipi_pct IS NULL) OR ((cred_ipi_pct >= 0) AND (cred_ipi_pct <= 100))) AND ((nc_ipi_pct IS NULL) OR ((nc_ipi_pct >= 0) AND (nc_ipi_pct <= 100))) AND ((cred_ibs_pct IS NULL) OR ((cred_ibs_pct >= 0) AND (cred_ibs_pct <= 100))) AND ((cred_cbs_pct IS NULL) OR ((cred_cbs_pct >= 0) AND (cred_cbs_pct <= 100))))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_liquido_derivado|CHECK ((custo_liquido_materiais IS NULL) OR (custo_bruto_materiais IS NOT NULL))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_fabricacao_derivada|CHECK ((custo_fabricacao IS NULL) OR ((tempo_fabricacao_min IS NOT NULL) AND (valor_minuto IS NOT NULL)))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_total_derivado|CHECK ((custo_liquido_total IS NULL) OR ((custo_liquido_materiais IS NOT NULL) AND (custo_fabricacao IS NOT NULL)))',
    -- o orcamento
    'orcamentista_orcamento|orcamentista_orcamento_percentuais_na_faixa|CHECK (((comissao_percentual IS NULL) OR ((comissao_percentual >= 0) AND (comissao_percentual <= 100))) AND ((reserva_tecnica_percentual IS NULL) OR ((reserva_tecnica_percentual >= 0) AND (reserva_tecnica_percentual <= 100))) AND ((lucro_projetado_percentual IS NULL) OR ((lucro_projetado_percentual >= 0) AND (lucro_projetado_percentual <= 100))))',
    'orcamentista_orcamento|orcamentista_orcamento_comissao_modo_valido|CHECK ((comissao_modo IS NULL) OR (comissao_modo = ANY (ARRAY[''PROPORCIONAL''::text, ''CONGELADA''::text])))',
    'orcamentista_orcamento|orcamentista_orcamento_valores_nao_negativos|CHECK (((valor_total_bruto IS NULL) OR (valor_total_bruto >= 0)) AND ((valor_total_liquido IS NULL) OR (valor_total_liquido >= 0)) AND ((valor_venda IS NULL) OR (valor_venda >= 0)))',
    'orcamentista_orcamento|orcamentista_orcamento_liquido_derivado|CHECK ((valor_total_liquido IS NULL) OR (valor_total_bruto IS NOT NULL))',
    'orcamentista_orcamento|orcamentista_orcamento_venda_derivada|CHECK ((valor_venda IS NULL) OR (valor_total_liquido IS NOT NULL))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_modo_valido|CHECK ((aproveitamento_modo IS NULL) OR (aproveitamento_modo = ANY (ARRAY[''COM''::text, ''SEM''::text])))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_origem_valida|CHECK ((aproveitamento_origem IS NULL) OR (aproveitamento_origem = ANY (ARRAY[''base_de_conhecimento''::text, ''alterado_no_orcamento''::text, ''fallback_barra_inteira''::text])))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_inteiro|CHECK ((aproveitamento_modo IS NULL) = (aproveitamento_origem IS NULL))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_motivo|CHECK (((aproveitamento_origem IS NULL) OR (aproveitamento_origem = ''base_de_conhecimento''::text)) = (aproveitamento_motivo IS NULL))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_motivo_forma|CHECK ((aproveitamento_motivo IS NULL) OR ((aproveitamento_motivo ~ ''^\S(.*\S)?$''::text) AND (char_length(aproveitamento_motivo) <= 500)))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_por|CHECK ((NOT (aproveitamento_origem IS DISTINCT FROM ''alterado_no_orcamento''::text)) = (aproveitamento_por IS NOT NULL))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_fallback|CHECK ((aproveitamento_origem IS DISTINCT FROM ''fallback_barra_inteira''::text) OR (aproveitamento_modo = ''SEM''::text))'
  ];
  e text;
  p text[];
BEGIN
  FOREACH e IN ARRAY novas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.' || p[1]) AND conname = p[2]) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', p[1], p[2], p[3]);
    END IF;
  END LOOP;
END
$checks$;

COMMENT ON COLUMN public.orcamentista_orcamento_item.custo_liquido_materiais IS
  'Derivado do custo_bruto_materiais pela cascata do motor (ICMS sobre o bruto, PIS/COFINS sobre o saldo, IPI com base propria, IPI sem credito no custo). Nunca importado. Nulo = nao apurado.';
COMMENT ON COLUMN public.orcamentista_orcamento.aproveitamento_modo IS
  'O modo de aproveitamento do PEDIDO (COM | SEM), congelado: todos os itens do orcamento usam o mesmo. Nulo = nao apurado.';
COMMENT ON COLUMN public.orcamentista_orcamento.valor_venda IS
  'O valor de venda precificado, congelado no orcamento. Nulo = nao precificado.';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_orcamento_item|orcamentista_orcamento_item_valores_nao_negativos|CHECK ((((custo_bruto_materiais IS NULL) OR (custo_bruto_materiais >= (0)::numeric)) AND ((custo_liquido_materiais IS NULL) OR (custo_liquido_materiais >= (0)::numeric)) AND ((tempo_fabricacao_min IS NULL) OR (tempo_fabricacao_min >= (0)::numeric)) AND ((valor_minuto IS NULL) OR (valor_minuto >= (0)::numeric)) AND ((custo_fabricacao IS NULL) OR (custo_fabricacao >= (0)::numeric)) AND ((custo_liquido_total IS NULL) OR (custo_liquido_total >= (0)::numeric))))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_percentuais_na_faixa|CHECK ((((cred_icms_pct IS NULL) OR ((cred_icms_pct >= (0)::numeric) AND (cred_icms_pct <= (100)::numeric))) AND ((cred_pis_cofins_pct IS NULL) OR ((cred_pis_cofins_pct >= (0)::numeric) AND (cred_pis_cofins_pct <= (100)::numeric))) AND ((cred_ipi_pct IS NULL) OR ((cred_ipi_pct >= (0)::numeric) AND (cred_ipi_pct <= (100)::numeric))) AND ((nc_ipi_pct IS NULL) OR ((nc_ipi_pct >= (0)::numeric) AND (nc_ipi_pct <= (100)::numeric))) AND ((cred_ibs_pct IS NULL) OR ((cred_ibs_pct >= (0)::numeric) AND (cred_ibs_pct <= (100)::numeric))) AND ((cred_cbs_pct IS NULL) OR ((cred_cbs_pct >= (0)::numeric) AND (cred_cbs_pct <= (100)::numeric)))))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_liquido_derivado|CHECK (((custo_liquido_materiais IS NULL) OR (custo_bruto_materiais IS NOT NULL)))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_fabricacao_derivada|CHECK (((custo_fabricacao IS NULL) OR ((tempo_fabricacao_min IS NOT NULL) AND (valor_minuto IS NOT NULL))))',
    'orcamentista_orcamento_item|orcamentista_orcamento_item_total_derivado|CHECK (((custo_liquido_total IS NULL) OR ((custo_liquido_materiais IS NOT NULL) AND (custo_fabricacao IS NOT NULL))))',
    'orcamentista_orcamento|orcamentista_orcamento_percentuais_na_faixa|CHECK ((((comissao_percentual IS NULL) OR ((comissao_percentual >= (0)::numeric) AND (comissao_percentual <= (100)::numeric))) AND ((reserva_tecnica_percentual IS NULL) OR ((reserva_tecnica_percentual >= (0)::numeric) AND (reserva_tecnica_percentual <= (100)::numeric))) AND ((lucro_projetado_percentual IS NULL) OR ((lucro_projetado_percentual >= (0)::numeric) AND (lucro_projetado_percentual <= (100)::numeric)))))',
    'orcamentista_orcamento|orcamentista_orcamento_comissao_modo_valido|CHECK (((comissao_modo IS NULL) OR (comissao_modo = ANY (ARRAY[''PROPORCIONAL''::text, ''CONGELADA''::text]))))',
    'orcamentista_orcamento|orcamentista_orcamento_valores_nao_negativos|CHECK ((((valor_total_bruto IS NULL) OR (valor_total_bruto >= (0)::numeric)) AND ((valor_total_liquido IS NULL) OR (valor_total_liquido >= (0)::numeric)) AND ((valor_venda IS NULL) OR (valor_venda >= (0)::numeric))))',
    'orcamentista_orcamento|orcamentista_orcamento_liquido_derivado|CHECK (((valor_total_liquido IS NULL) OR (valor_total_bruto IS NOT NULL)))',
    'orcamentista_orcamento|orcamentista_orcamento_venda_derivada|CHECK (((valor_venda IS NULL) OR (valor_total_liquido IS NOT NULL)))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_modo_valido|CHECK (((aproveitamento_modo IS NULL) OR (aproveitamento_modo = ANY (ARRAY[''COM''::text, ''SEM''::text]))))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_origem_valida|CHECK (((aproveitamento_origem IS NULL) OR (aproveitamento_origem = ANY (ARRAY[''base_de_conhecimento''::text, ''alterado_no_orcamento''::text, ''fallback_barra_inteira''::text]))))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_inteiro|CHECK (((aproveitamento_modo IS NULL) = (aproveitamento_origem IS NULL)))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_motivo|CHECK ((((aproveitamento_origem IS NULL) OR (aproveitamento_origem = ''base_de_conhecimento''::text)) = (aproveitamento_motivo IS NULL)))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_motivo_forma|CHECK (((aproveitamento_motivo IS NULL) OR ((aproveitamento_motivo ~ ''^\S(.*\S)?$''::text) AND (char_length(aproveitamento_motivo) <= 500))))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_por|CHECK (((NOT (aproveitamento_origem IS DISTINCT FROM ''alterado_no_orcamento''::text)) = (aproveitamento_por IS NOT NULL)))',
    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_fallback|CHECK (((aproveitamento_origem IS DISTINCT FROM ''fallback_barra_inteira''::text) OR (aproveitamento_modo = ''SEM''::text)))'
  ];
  colunas text[] := ARRAY[
    'orcamentista_orcamento_item|custo_bruto_materiais|numeric', 'orcamentista_orcamento_item|cred_icms_pct|numeric',
    'orcamentista_orcamento_item|cred_pis_cofins_pct|numeric', 'orcamentista_orcamento_item|cred_ipi_pct|numeric',
    'orcamentista_orcamento_item|nc_ipi_pct|numeric', 'orcamentista_orcamento_item|cred_ibs_pct|numeric',
    'orcamentista_orcamento_item|cred_cbs_pct|numeric', 'orcamentista_orcamento_item|custo_liquido_materiais|numeric',
    'orcamentista_orcamento_item|tempo_fabricacao_min|numeric', 'orcamentista_orcamento_item|valor_minuto|numeric',
    'orcamentista_orcamento_item|custo_fabricacao|numeric', 'orcamentista_orcamento_item|custo_liquido_total|numeric',
    'orcamentista_orcamento|comissao_percentual|numeric', 'orcamentista_orcamento|comissao_modo|text',
    'orcamentista_orcamento|reserva_tecnica_percentual|numeric', 'orcamentista_orcamento|lucro_projetado_percentual|numeric',
    'orcamentista_orcamento|aproveitamento_modo|text', 'orcamentista_orcamento|aproveitamento_origem|text',
    'orcamentista_orcamento|aproveitamento_motivo|text', 'orcamentista_orcamento|aproveitamento_por|uuid',
    'orcamentista_orcamento|valor_total_bruto|numeric', 'orcamentista_orcamento|valor_total_liquido|numeric',
    'orcamentista_orcamento|valor_venda|numeric'
  ];
  e      text;
  p      text[];
  faltam text;
  n      int;
BEGIN
  FOREACH e IN ARRAY colunas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = p[1] AND column_name = p[2] AND data_type = p[3]
                      AND is_nullable = 'YES' AND column_default IS NULL AND numeric_precision IS NULL) THEN
      faltam := concat_ws('; ', faltam, p[1] || '.' || p[2]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: coluna ausente ou com outra forma (tipo, nula, sem default): %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('orcamentista_orcamento', 'orcamentista_orcamento_item');
  IF n <> 49 THEN
    RAISE EXCEPTION 'verificacao 2: as duas tabelas tem % coluna(s), e deviam ter 49. Nada foi alterado.', n;
  END IF;
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.' || p[1]) AND conname = p[2] AND pg_get_constraintdef(oid) = p[3]) THEN
      faltam := concat_ws('; ', faltam, p[2]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 3: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid IN (to_regclass('public.orcamentista_orcamento'), to_regclass('public.orcamentista_orcamento_item'));
  IF n <> 40 THEN
    RAISE EXCEPTION 'verificacao 4: as duas tabelas tem % constraint(s), e deviam ter 40. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name IN ('orcamentista_orcamento', 'orcamentista_orcamento_item')
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 5: % grant(s) a anon, authenticated ou PUBLIC nas duas tabelas. Nada foi alterado.', n;
  END IF;
  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO faltam FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name IN ('orcamentista_orcamento', 'orcamentista_orcamento_item') AND grantee = 'service_role';
  IF faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'verificacao 6: service_role nas duas tabelas tem %, e devia ter INSERT,SELECT,UPDATE. Nada foi alterado.', faltam;
  END IF;
  RAISE NOTICE 'orcamentista_orcamento e orcamentista_orcamento_item: 23 colunas novas, nulas e sem default; 17 CHECKs novas; 49 colunas e 40 constraints no total.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select table_name, count(*) from information_schema.columns
--  where table_schema = 'public' and table_name in ('orcamentista_orcamento', 'orcamentista_orcamento_item') group by 1;
-- -- esperado: orcamento 23, item 26
-- select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name in ('orcamentista_orcamento', 'orcamentista_orcamento_item')
--    and column_default is not null order by 1, 2;
-- -- esperado: só id, criado_em e atualizado_em das duas tabelas (6 linhas); nenhuma coluna desta migração
-- select count(*) from pg_constraint
--  where conrelid in ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass);
-- -- esperado: 40
