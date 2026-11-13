-- PENDENTE: NAO APLICAR SEM A AUTORIZACAO DO DONO DO PRODUTO PELO MD5 DESTE ARQUIVO. Aplicar e verificar ANTES do merge do PR que le a coluna.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- O ITEM REMOVIDO DO ORÇAMENTO, POR MARCA, A FAMÍLIA USADA POR ITEM — e a ordem única só entre os itens que valem — dono do produto, 13/11/2026
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- A decisão, registrada como foi dita:
--   "alteração ou correção no levantamento -> o vendedor confirma -> o ORÇAMENTO N é ATUALIZADO, com o MESMO NÚMERO."
--   "NADA É APAGADO. Zero DELETE, no banco e no Storage."
--   "ITEM REMOVIDO: marca de removido, não DELETE. O item sai do PDF e de todas as contas, e as linhas ficam no banco."
--   "A ORDEM. Vá pelo ÍNDICE PARCIAL [...] Eu libero o DROP desse índice, explicitamente. Minha proibição de DROP é para o que apaga DADO ou
--    tira ACESSO. Trocar um índice único por um índice único parcial não apaga linha nenhuma e não tira acesso de ninguém."
--   "o 'Item N' do PDF tem de bater com o 'Item N' do levantamento".
--   "A FAMÍLIA ENTRA NESTA MIGRAÇÃO. [...] a coluna que guarda a família usada pelo item do orçamento, NULL, sem padrão, na mesma tabela. A
--    família é POR ITEM, não por orçamento [...] As linhas existentes ficam nulas, e nulo conta como DIFERENTE na comparação — a primeira
--    confirmação recalcula uma vez [...] erra para o lado de recalcular, nunca para o de deixar preço errado."
--
-- POR QUE A FAMÍLIA: o cálculo lê a família do item do LEVANTAMENTO na hora (orcamento-calculado.ts, `lerDoLevantamento`), e o orçamento não
-- guarda qual usou. Sem ela, trocar só a família de um item ("é a de PVC") seria "sem mudança", e o "sim" não recalcularia. A coluna guarda a
-- família com que o item do orçamento foi calculado; a do levantamento diferente dela (ou ela nula) é mudança.
--
-- POR QUE O ÍNDICE MUDA: o item removido FICA (com a marca), com a ordem que tinha. O levantamento renumera os itens de 1 a n
-- (levantamento-em-montagem.ts, o agrupamento); quando ele volta a ter um item naquela ordem, o item novo do orçamento não pode ser gravado com
-- a UNIQUE (orcamento_id, ordem) de hoje, que conta também o removido. A unicidade passa a valer só entre os que NÃO estão removidos.
--
-- O QUE FAZ (e só isto, nesta ordem, numa transação):
--   1. ALTER TABLE public.orcamentista_orcamento_item ADD COLUMN removido_em timestamptz NULL — nula em toda linha de hoje (nenhum item está
--      removido). Sem default, sem CHECK.
--   1b. ALTER TABLE public.orcamentista_orcamento_item ADD COLUMN familia text NULL — o mesmo tipo de orcamentista_levantamento_item.familia
--      (text, nula, sem default — medido em 13/11/2026). Nula em toda linha de hoje. Sem default, sem CHECK.
--   2. O DROP da unicidade de hoje. MEDIDO em produção (13/11/2026): `orcamentista_orcamento_item_ordem_key` NÃO é um índice solto — é uma
--      RESTRIÇÃO UNIQUE (contype 'u', `UNIQUE (orcamento_id, ordem)`), e o índice dela tem o mesmo nome. Por isso o DROP é
--      `ALTER TABLE ... DROP CONSTRAINT`, que leva o índice junto (um `DROP INDEX` nele é recusado pelo Postgres). Nenhuma FK depende dela
--      (medido: 0), nenhum código a cita pelo nome (medido no src/ e no scripts/).
--   3. CREATE UNIQUE INDEX orcamentista_orcamento_item_ordem_ativa_key ON (orcamento_id, ordem) WHERE removido_em IS NULL. Nome NOVO, para que a
--      verificação diga sem ambiguidade que o antigo não existe mais. Um índice parcial não pode ser restrição (o Postgres não aceita WHERE em
--      UNIQUE de tabela): é índice único.
--
-- O QUE NÃO FAZ: nenhum DELETE, nenhum UPDATE, nenhum INSERT, nenhum REVOKE, nenhuma função, nenhum COMMENT, nenhuma tabela (nem temporária:
-- a contagem de antes, que a verificação confere, é um valor local da transação, `set_config(..., true)`). Nenhuma linha muda. Nenhum acesso
-- muda: a coluna nova herda os privilégios da tabela.
--
-- A GUARDA DA ORDEM DUPLICADA, sabida: com a restrição de hoje no lugar (que a guarda anterior exige), não há como existir duplicata — esta guarda
-- não se alcança na base medida. Fica porque foi pedida, e protege o banco em que a restrição e a duplicata mudaram juntas na mesma hora.
--
-- A JANELA: entre o DROP e o CREATE, na mesma transação, a tabela fica sem a unicidade — mas a transação segura o lock da tabela do DROP até o
-- COMMIT, e ninguém grava nela nesse intervalo. Se o CREATE falhar, a transação inteira volta, e a restrição de hoje fica como estava.
--
-- O QUE QUEBRA SE ALGUÉM MERGEAR O CÓDIGO QUE LÊ A COLUNA ANTES DE APLICAR: toda leitura dos itens do orçamento que filtra `removido_em` falha
-- (a coluna não existe). A ordem é: aplicar, verificar por consulta, só então mergear.
--
-- GUARDA (aborta, nada alterado): a tabela não existe; a coluna `removido_em` ou a `familia` já existe; a unicidade de hoje não é a medida (nome, tipo 'u' e
-- definição `UNIQUE (orcamento_id, ordem)`); alguma FK depende do índice dela; o índice novo já existe; há ordem duplicada no mesmo orçamento.
-- VERIFICAÇÃO (aborta, desfaz tudo): `removido_em` existe, timestamptz, nula, sem default, nula em toda linha; `familia` existe, text, nula, sem
-- default, nula em toda linha; o índice novo existe, é único, é
-- PARCIAL com `WHERE (removido_em IS NULL)` sobre (orcamento_id, ordem); a restrição antiga e o índice antigo não existem mais; o número de
-- linhas da tabela é o mesmo de antes.
--
-- Pelo SQL Editor, o arquivo inteiro. Pelo conector, sem o BEGIN e o COMMIT (são as duas únicas linhas a tirar; o md5 muda e os dois números
-- vão no relato — `migracao.md`, Parte III). Depois: NOTIFY pgrst, 'reload schema'.

BEGIN;

DO $guarda$
DECLARE
  v_conindid oid;
  v_def      text;
  v_tipo     "char";
  n          int;
BEGIN
  IF to_regclass('public.orcamentista_orcamento_item') IS NULL THEN
    RAISE EXCEPTION 'guarda: a tabela orcamentista_orcamento_item não existe. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item' AND column_name = 'removido_em') THEN
    RAISE EXCEPTION 'guarda: a coluna removido_em já existe. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item' AND column_name = 'familia') THEN
    RAISE EXCEPTION 'guarda: a coluna familia já existe. Nada foi alterado.';
  END IF;
  SELECT c.conindid, pg_get_constraintdef(c.oid), c.contype INTO v_conindid, v_def, v_tipo
    FROM pg_constraint c
   WHERE c.conrelid = 'public.orcamentista_orcamento_item'::regclass AND c.conname = 'orcamentista_orcamento_item_ordem_key';
  IF v_conindid IS NULL OR v_tipo <> 'u' OR v_def <> 'UNIQUE (orcamento_id, ordem)' THEN
    RAISE EXCEPTION 'guarda: a unicidade de hoje não é a medida (esperada a restrição UNIQUE orcamentista_orcamento_item_ordem_key = UNIQUE (orcamento_id, ordem); veio %, tipo %). Nada foi alterado.', coalesce(v_def, 'nenhuma'), coalesce(v_tipo::text, '-');
  END IF;
  SELECT count(*) INTO n FROM pg_constraint f WHERE f.contype = 'f' AND f.conindid = v_conindid;
  IF n <> 0 THEN
    RAISE EXCEPTION 'guarda: % FK(s) dependem do índice da unicidade de hoje. Nada foi alterado.', n;
  END IF;
  IF to_regclass('public.orcamentista_orcamento_item_ordem_ativa_key') IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: o índice orcamentista_orcamento_item_ordem_ativa_key já existe. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM (
    SELECT orcamento_id, ordem FROM public.orcamentista_orcamento_item GROUP BY orcamento_id, ordem HAVING count(*) > 1
  ) d;
  IF n <> 0 THEN
    RAISE EXCEPTION 'guarda: % ordem(ns) duplicada(s) no mesmo orçamento. Nada foi alterado.', n;
  END IF;
  -- a contagem de antes, para a verificação: um valor que vale só nesta transação (set_config local), sem criar objeto nenhum
  PERFORM set_config('orcamento_item_removido.linhas_antes', (SELECT count(*) FROM public.orcamentista_orcamento_item)::text, true);
END
$guarda$;

ALTER TABLE public.orcamentista_orcamento_item ADD COLUMN removido_em timestamptz NULL;

ALTER TABLE public.orcamentista_orcamento_item ADD COLUMN familia text NULL;

ALTER TABLE public.orcamentista_orcamento_item DROP CONSTRAINT orcamentista_orcamento_item_ordem_key;

CREATE UNIQUE INDEX orcamentista_orcamento_item_ordem_ativa_key
  ON public.orcamentista_orcamento_item (orcamento_id, ordem)
  WHERE removido_em IS NULL;

DO $verifica$
DECLARE
  v_tipo    text;
  v_nulo    text;
  v_default text;
  v_def     text;
  v_unico   boolean;
  n         int;
  antes     bigint;
BEGIN
  SELECT data_type, is_nullable, column_default INTO v_tipo, v_nulo, v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item' AND column_name = 'removido_em';
  IF v_tipo IS DISTINCT FROM 'timestamp with time zone' OR v_nulo IS DISTINCT FROM 'YES' OR v_default IS NOT NULL THEN
    RAISE EXCEPTION 'verificação: a coluna removido_em não é timestamptz nula sem default (veio %, %, %). Tudo foi desfeito.', v_tipo, v_nulo, v_default;
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_orcamento_item WHERE removido_em IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificação: % item(ns) com removido_em preenchido. Tudo foi desfeito.', n;
  END IF;
  SELECT data_type, is_nullable, column_default INTO v_tipo, v_nulo, v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item' AND column_name = 'familia';
  IF v_tipo IS DISTINCT FROM 'text' OR v_nulo IS DISTINCT FROM 'YES' OR v_default IS NOT NULL THEN
    RAISE EXCEPTION 'verificação: a coluna familia não é text nula sem default (veio %, %, %). Tudo foi desfeito.', v_tipo, v_nulo, v_default;
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_orcamento_item WHERE familia IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificação: % item(ns) com familia preenchida. Tudo foi desfeito.', n;
  END IF;
  SELECT i.indisunique, pg_get_indexdef(i.indexrelid) INTO v_unico, v_def
    FROM pg_index i WHERE i.indexrelid = to_regclass('public.orcamentista_orcamento_item_ordem_ativa_key');
  IF v_unico IS DISTINCT FROM true
     OR v_def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_orcamento_item_ordem_ativa_key ON public.orcamentista_orcamento_item USING btree (orcamento_id, ordem) WHERE (removido_em IS NULL)' THEN
    RAISE EXCEPTION 'verificação: o índice novo não é o único parcial esperado (veio %). Tudo foi desfeito.', coalesce(v_def, 'nenhum');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item'::regclass AND conname = 'orcamentista_orcamento_item_ordem_key')
     OR to_regclass('public.orcamentista_orcamento_item_ordem_key') IS NOT NULL THEN
    RAISE EXCEPTION 'verificação: a restrição ou o índice antigo orcamentista_orcamento_item_ordem_key ainda existe. Tudo foi desfeito.';
  END IF;
  antes := current_setting('orcamento_item_removido.linhas_antes')::bigint;
  SELECT count(*) INTO n FROM public.orcamentista_orcamento_item;
  IF n <> antes THEN
    RAISE EXCEPTION 'verificação: a tabela tinha % linha(s) e tem %. Tudo foi desfeito.', antes, n;
  END IF;
END
$verifica$;

COMMIT;

NOTIFY pgrst, 'reload schema';
