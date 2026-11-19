-- 20261118000001_autorizacao_da_medida_fora_do_limite.sql
--
-- A DECISAO DO DONO DO PRODUTO, 18/11/2026 (o caso Daiane Pilger): "Voce deve questionar como pedindo autorizacao
-- para fabricar da mesma forma. Ai sim pode ser feito o levantamento e dando sequencia nos orcamentos. Isso nao e algo
-- que pode prejudicar, mas tem que ter a liberacao." E: "a esquadria fora do limite vira pergunta de autorizacao,
-- nomeando a medida e o limite; autorizada, segue e calcula. A autorizacao fica GRAVADA no item, com quem autorizou e
-- quando - e preciso saber depois quem liberou uma peca fora de especificacao. Sem resposta, nao calcula."
--
-- O QUE ESTA MIGRACAO FAZ: seis colunas NULAS em `orcamentista_levantamento_item`, em dois grupos:
--   O PEDIDO (o que a conversa perguntou): `limite_tipologia`, `limite_largura_mm`, `limite_altura_mm` -- a tipologia e
--     a medida COMO FORAM PERGUNTADAS -- e `limite_pedido_em`, quando.
--   A AUTORIZACAO (a resposta): `limite_autorizado_por` (o remetente que disse sim, FK para
--     `orcamentista_remetente_autorizado` pela mesma empresa) e `limite_autorizado_em`.
-- A autorizacao vale para AQUELA tipologia e AQUELA medida: a conversa a confere contra o item a cada turno, e a medida
-- que muda nao herda a liberacao de outra.
--
-- NENHUM DADO ALTERADO: as colunas nascem nulas em todas as linhas (medido em 18/11/2026: nenhuma existe hoje).
-- Nao muda a CHECK de `orcamentista_pergunta_em_aberto`: o pedido mora no item, e nao na pergunta em aberto (que e uma
-- por remetente e e ignorada com o levantamento em montagem).
--
-- QUEM APAGA E REGRAVA `orcamentista_levantamento_item` (`tabela-que-a-importacao-apaga.md`), PROCURADO em 18/11/2026:
-- nenhuma funcao do banco (consulta ao `prosrc` de producao); no codigo, a conversa so apaga a linha que o agrupamento
-- fundiu em outra (por id) -- a autorizacao da linha fundida sai com ela, e a que fica guarda a sua. A conversa grava
-- as seis colunas por um UPDATE proprio, e o UPDATE do item (`camposDoItem`) nao as toca.
--
-- PENDENTE. NAO APLICADA. Quem aplica e o dono do produto, ANTES do merge do PR que a traz. Ao aplicar fora do CLI, o `name` da
-- migracao e o nome completo deste arquivo, sem a extensao: 20261118000001_autorizacao_da_medida_fora_do_limite.
--
-- ORDEM: aplicar e conferir ANTES do merge (`migracao.md`, Parte I). Sem ela, o codigo nao quebra: a leitura e a
-- gravacao das colunas devolvem 42703, e a conversa segue como antes -- a medida fora do limite pede a medida
-- certa, sem oferecer a autorizacao, e a linha [IA] diz `limite=sem_migracao`.

BEGIN;

DO $guarda$
DECLARE v_tipo text;
BEGIN
  IF to_regclass('public.orcamentista_levantamento_item') IS NULL OR to_regclass('public.orcamentista_remetente_autorizado') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_levantamento_item ou public.orcamentista_remetente_autorizado (banco %, usuario %). Nada foi alterado.',
      current_database(), current_user;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_remetente_autorizado'::regclass
                  AND pg_get_constraintdef(oid) = 'UNIQUE (id, tenant_id)') THEN
    RAISE EXCEPTION 'orcamentista_remetente_autorizado sem UNIQUE (id, tenant_id): a FK da autorizacao nao tem onde apontar. Nada foi alterado.';
  END IF;
  -- a coluna do limite que ja existe com OUTRO tipo (ou que nao e desta migracao) aborta; reaplicar, com os tipos certos, segue
  FOR v_tipo IN
    SELECT c.column_name || ':' || c.data_type FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'orcamentista_levantamento_item' AND c.column_name LIKE 'limite\_%'
       AND c.column_name || ':' || c.data_type NOT IN ('limite_tipologia:text', 'limite_largura_mm:integer', 'limite_altura_mm:integer',
           'limite_pedido_em:timestamp with time zone', 'limite_autorizado_por:uuid', 'limite_autorizado_em:timestamp with time zone')
  LOOP
    RAISE EXCEPTION 'orcamentista_levantamento_item: a coluna % ja existe com outro tipo ou nao e desta migracao. Nada foi alterado.', v_tipo;
  END LOOP;
END $guarda$;

ALTER TABLE public.orcamentista_levantamento_item
  ADD COLUMN IF NOT EXISTS limite_tipologia text,
  ADD COLUMN IF NOT EXISTS limite_largura_mm integer,
  ADD COLUMN IF NOT EXISTS limite_altura_mm integer,
  ADD COLUMN IF NOT EXISTS limite_pedido_em timestamptz,
  ADD COLUMN IF NOT EXISTS limite_autorizado_por uuid,
  ADD COLUMN IF NOT EXISTS limite_autorizado_em timestamptz;

COMMENT ON COLUMN public.orcamentista_levantamento_item.limite_tipologia IS
  'A tipologia em que a medida passa do limite do motor, COMO FOI PERGUNTADA ao vendedor (dono do produto, 18/11/2026). NULA = nenhum pedido.';
COMMENT ON COLUMN public.orcamentista_levantamento_item.limite_autorizado_por IS
  'Quem autorizou fabricar a medida fora do limite (o remetente que respondeu sim). Vale so para limite_tipologia e a medida pedida. NULA = nao autorizada.';

DO $check$
BEGIN
  -- o pedido anda junto: a tipologia e o instante; a medida pedida e a do item na hora (a nao dita fica nula, como no item)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_levantamento_item_limite_pedido') THEN
    ALTER TABLE public.orcamentista_levantamento_item ADD CONSTRAINT orcamentista_levantamento_item_limite_pedido
      CHECK ((limite_tipologia IS NULL) = (limite_pedido_em IS NULL)
             AND (limite_tipologia IS NOT NULL OR (limite_largura_mm IS NULL AND limite_altura_mm IS NULL))
             AND (limite_tipologia IS NULL OR limite_largura_mm IS NOT NULL OR limite_altura_mm IS NOT NULL));
  END IF;
  -- a autorizacao: quem e quando andam juntos, e so existe sobre um pedido
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_levantamento_item_limite_autorizado') THEN
    ALTER TABLE public.orcamentista_levantamento_item ADD CONSTRAINT orcamentista_levantamento_item_limite_autorizado
      CHECK ((limite_autorizado_por IS NULL) = (limite_autorizado_em IS NULL)
             AND (limite_autorizado_por IS NULL OR limite_tipologia IS NOT NULL));
  END IF;
  -- quem autorizou e da MESMA empresa do item; o remetente nao se apaga (as outras FKs para ele sao RESTRICT/NO ACTION)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_levantamento_item_limite_autorizado_fkey') THEN
    ALTER TABLE public.orcamentista_levantamento_item ADD CONSTRAINT orcamentista_levantamento_item_limite_autorizado_fkey
      FOREIGN KEY (limite_autorizado_por, tenant_id) REFERENCES public.orcamentista_remetente_autorizado(id, tenant_id);
  END IF;
END $check$;

DO $verifica$
DECLARE v_esperado text[] := ARRAY[
    'limite_tipologia:text', 'limite_largura_mm:integer', 'limite_altura_mm:integer',
    'limite_pedido_em:timestamp with time zone', 'limite_autorizado_por:uuid', 'limite_autorizado_em:timestamp with time zone'];
  v_achado text[]; v_n int;
BEGIN
  SELECT array_agg(c.column_name || ':' || c.data_type ORDER BY c.ordinal_position) INTO v_achado
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'orcamentista_levantamento_item' AND c.column_name LIKE 'limite\_%' AND c.is_nullable = 'YES' AND c.column_default IS NULL;
  IF v_achado IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'verificacao 1: as colunas do limite nao sao as esperadas: %', coalesce(array_to_string(v_achado, ', '), '(nenhuma)');
  END IF;
  SELECT count(*) INTO v_n FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname IN (
    'orcamentista_levantamento_item_limite_pedido', 'orcamentista_levantamento_item_limite_autorizado', 'orcamentista_levantamento_item_limite_autorizado_fkey');
  IF v_n <> 3 THEN RAISE EXCEPTION 'verificacao 2: % de 3 constraints do limite.', v_n; END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'orcamentista_levantamento_item_limite_autorizado_fkey')
     IS DISTINCT FROM 'FOREIGN KEY (limite_autorizado_por, tenant_id) REFERENCES orcamentista_remetente_autorizado(id, tenant_id)' THEN
    RAISE EXCEPTION 'verificacao 3: a FK da autorizacao com outra definicao.';
  END IF;
  SELECT count(*) INTO v_n FROM public.orcamentista_levantamento_item
   WHERE limite_tipologia IS NOT NULL OR limite_largura_mm IS NOT NULL OR limite_altura_mm IS NOT NULL OR limite_pedido_em IS NOT NULL
      OR limite_autorizado_por IS NOT NULL OR limite_autorizado_em IS NOT NULL;
  RAISE NOTICE 'orcamentista_levantamento_item: as 6 colunas do limite e as 3 constraints; % linha(s) com pedido ou autorizacao.', v_n;
END $verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICACAO DEPOIS DE APLICAR, por consulta ao banco (nao pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_levantamento_item' and column_name like 'limite\_%' order by ordinal_position;
-- -- esperado: as 6 colunas, nulas, sem default
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_levantamento_item'::regclass and conname like '%limite%' order by 1;
-- -- esperado: _limite_autorizado, _limite_autorizado_fkey, _limite_pedido
