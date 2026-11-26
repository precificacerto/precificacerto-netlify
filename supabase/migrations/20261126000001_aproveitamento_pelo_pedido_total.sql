-- ================================================================================================
-- 20261126000001 - o modo PEDIDO TOTAL do aproveitamento (`orcamentista_orcamento.aproveitamento_origem = 'pedido_total'`).
--
-- +-----------------------------------------------------------------------------------------------
-- | PENDENTE. NAO APLICADA. Quem aplica e o dono do produto, ANTES do merge do PR que a traz.
-- | Ao aplicar fora do CLI, o `name` da migracao e o nome completo deste arquivo, sem a extensao:
-- | 20261126000001_aproveitamento_pelo_pedido_total.
-- | SEM ELA o codigo nao quebra: o calculo pelo pedido total e recusado com a frase nomeada (a CHECK
-- | recusa a origem nova, 23514), e o calculo por consumo segue como sempre.
-- | O arquivo inteiro e ASCII.
-- +-----------------------------------------------------------------------------------------------
--
-- POR QUE - pedido 0034, item 2, do dono do produto (26/11/2026): "salvo o caso onde o pedido vai ter um montante total de barras e
-- materiais e o vendedor ou a pessoa responsavel vai determinar que nao seja feito por consumo, e sim pelo pedido total. E ai a conta vai
-- ser proporcional". O padrao continua o CONSUMO (`consumo_do_item`, modo SEM). O pedido total grava modo COM, origem `pedido_total` e QUEM
-- escolheu (`aproveitamento_por`): o vendedor, na conversa, ou o responsavel, na tela. Nunca o agente sozinho.
--
-- O QUE FAZ (so CHECKs; nenhuma linha e alterada, nada e apagado):
--   1. `orcamentista_orcamento_aproveitamento_origem_valida` passa a aceitar tambem 'pedido_total'.
--   2. `orcamentista_orcamento_aproveitamento_por`: quem escolheu existe se e so se a origem e 'alterado_no_orcamento' OU 'pedido_total'
--      (antes: so a primeira).
--   3. CHECK nova `orcamentista_orcamento_aproveitamento_pedido_total`: a origem 'pedido_total' so com o modo 'COM'.
--
-- IDEMPOTENTE: DROP CONSTRAINT IF EXISTS + ADD, na mesma transacao.
-- GUARDA (aborta): a tabela e as colunas existem; nenhuma linha viola as CHECKs novas (medido em 26/11/2026: 13 orcamentos, todos SEM).
-- VERIFICACAO (aborta): as tres CHECKs com a definicao esperada.
-- ================================================================================================
BEGIN;

DO $guarda$
DECLARE
  n int;
BEGIN
  IF to_regclass('public.orcamentista_orcamento') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_orcamento (banco %, usuario %). Nada foi alterado.', current_database(), current_user;
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento'
     AND column_name IN ('aproveitamento_modo', 'aproveitamento_origem', 'aproveitamento_motivo', 'aproveitamento_por');
  IF n <> 4 THEN
    RAISE EXCEPTION 'orcamentista_orcamento devia ter as 4 colunas do aproveitamento, e tem %. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_orcamento
   WHERE (aproveitamento_origem IN ('alterado_no_orcamento', 'pedido_total')) IS DISTINCT FROM (aproveitamento_por IS NOT NULL)
      AND aproveitamento_origem IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '% orcamento(s) violariam a CHECK nova de aproveitamento_por. Nada foi alterado.', n;
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_orcamento DROP CONSTRAINT IF EXISTS orcamentista_orcamento_aproveitamento_origem_valida;
ALTER TABLE public.orcamentista_orcamento ADD CONSTRAINT orcamentista_orcamento_aproveitamento_origem_valida
  CHECK (aproveitamento_origem IS NULL OR aproveitamento_origem = ANY (ARRAY[
    'base_de_conhecimento'::text, 'alterado_no_orcamento'::text, 'fallback_barra_inteira'::text, 'consumo_do_item'::text, 'pedido_total'::text]));

ALTER TABLE public.orcamentista_orcamento DROP CONSTRAINT IF EXISTS orcamentista_orcamento_aproveitamento_por;
ALTER TABLE public.orcamentista_orcamento ADD CONSTRAINT orcamentista_orcamento_aproveitamento_por
  CHECK (COALESCE(aproveitamento_origem = ANY (ARRAY['alterado_no_orcamento'::text, 'pedido_total'::text]), false) = (aproveitamento_por IS NOT NULL));

ALTER TABLE public.orcamentista_orcamento DROP CONSTRAINT IF EXISTS orcamentista_orcamento_aproveitamento_pedido_total;
ALTER TABLE public.orcamentista_orcamento ADD CONSTRAINT orcamentista_orcamento_aproveitamento_pedido_total
  CHECK (aproveitamento_origem IS DISTINCT FROM 'pedido_total' OR aproveitamento_modo = 'COM');

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_orcamento_aproveitamento_origem_valida|CHECK (((aproveitamento_origem IS NULL) OR (aproveitamento_origem = ANY (ARRAY[''base_de_conhecimento''::text, ''alterado_no_orcamento''::text, ''fallback_barra_inteira''::text, ''consumo_do_item''::text, ''pedido_total''::text]))))',
    'orcamentista_orcamento_aproveitamento_por|CHECK ((COALESCE((aproveitamento_origem = ANY (ARRAY[''alterado_no_orcamento''::text, ''pedido_total''::text])), false) = (aproveitamento_por IS NOT NULL)))',
    'orcamentista_orcamento_aproveitamento_pedido_total|CHECK (((aproveitamento_origem IS DISTINCT FROM ''pedido_total''::text) OR (aproveitamento_modo = ''COM''::text)))'
  ];
  e text; p text[]; achada text; faltam text;
BEGIN
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    SELECT pg_get_constraintdef(oid) INTO achada FROM pg_constraint
     WHERE conrelid = 'public.orcamentista_orcamento'::regclass AND conname = p[1];
    IF achada IS DISTINCT FROM p[2] THEN faltam := concat_ws('; ', faltam, p[1] || ' = ' || coalesce(achada, '(ausente)')); END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  RAISE NOTICE 'aproveitamento pelo pedido total: as tres CHECKs conferidas.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- -- VERIFICACAO DEPOIS DE APLICAR, por consulta ao banco --
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_orcamento'::regclass and conname like 'orcamentista_orcamento_aproveitamento%' order by 1;
-- -- esperado: 8 constraints, entre elas _aproveitamento_pedido_total; a _origem_valida com 'pedido_total'
