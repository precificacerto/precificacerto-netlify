-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000006 — o MOTOR É DA FAMÍLIA: cada etapa aponta o seu motor.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. PROPOSTA ao dono do produto: quem aplica é ele, ANTES do merge.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261027000006_motor_da_familia.
-- ║ NENHUM código deste repositório lê estas colunas ainda: sem a migração nada quebra, e com ela
-- ║ nada muda no que a conversa faz hoje. É a estrutura, para o código que vem depois.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — alinhamento com o dono do produto, 27/10/2026, que CORRIGE a decisão de ontem (motor do
-- par família + fornecedor de perfil): uma empresa pode ter DOIS fornecedores de PVC (linha de entrada e
-- linha AAA), além de alumínio, ACM e portas internas em paralelo. "Dentro das famílias, o motor é mais
-- importante dentro da família do que os fornecedores. A família definida aciona o motor, e o motor faz a
-- busca através das tipologias dos perfis ou dos materiais lá dentro dos fornecedores." Cada ETAPA da
-- família tem o seu motor (apanhado, levantamento, relação de barras com aproveitamento, e as que ele
-- inserir); o apanhado é MULTI-FAMÍLIA, e é a família do item que decide o motor dele.
--
-- O QUE FAZ — aditivo, e só isto:
--   A. `orcamentista_motor.fornecedor_id` deixa de ser obrigatório: a família rege. O índice
--      `orcamentista_motor_uma_vigente (familia, fornecedor_id) WHERE vigente` NÃO é tocado: com o
--      fornecedor nulo, ele não limita nada (nulos são distintos). Ver a proposta (E) abaixo.
--   B. `orcamentista_familia_etapa.motor_id`: o motor da etapa (nulo = a etapa ainda não aponta nenhum).
--      A FK é COMPOSTA, (motor_id, familia) -> orcamentista_motor (id, familia), ON DELETE RESTRICT: além de
--      apontar o motor, ela impede que a etapa de uma família aponte o motor de OUTRA. Para isso o motor
--      ganha a chave única (id, familia), que o `id` sozinho já garante — não restringe nada.
--   C. `orcamentista_levantamento_item.familia` (FK para o catálogo das famílias, RESTRICT): de que família
--      é cada item do apanhado multi-família. Nula nos itens de antes: não se deduz, não se grava. Duas travas
--      fazem o item concordar com o motor: a FK composta (motor_id, familia) -> orcamentista_motor (id, familia)
--      e um CHECK "motor_id preenchido exige familia preenchida". O CHECK é necessário: a FK composta é MATCH
--      SIMPLE (o padrão), que dá a restrição por satisfeita se QUALQUER coluna for nula, e sem o CHECK um item com
--      motor e família nula passaria sem checagem (achado do dono do produto, 27/10/2026). MATCH FULL não serve:
--      recusaria o item com família e SEM motor, que é o caso normal (a família vem antes do motor).
--   D. `orcamentista_tabela_uma_vigente` passa de (fornecedor_id, familia) para (fornecedor_id, familia,
--      categoria_chave), NULLS NOT DISTINCT: Perfil, Reforço e Acessórios da Wolff podem ser vigentes ao
--      mesmo tempo (uma por categoria). É AFROUXAR: todo conjunto de linhas que passava no índice antigo
--      passa no novo, então não há como esta migração falhar por dado. O nome do índice é o mesmo (o código
--      reconhece o 23505 por ele).
--
-- O QUE NÃO FAZ:
--   - NENHUM UPDATE de dado. Os 4 itens de levantamento de hoje ficam com `familia` nula (nenhum tem tabela
--     nem motor: nada a deduzir), as etapas (0 hoje) e a planilha da Wolff ficam como estão.
--   - NÃO altera `superadmin_gravar_etapas_da_familia` nem `superadmin_arquivar_motor`. A primeira recusa o
--     campo `motor_id` no corpo (lista fechada) e a segunda não sabe das etapas: mudam JUNTO com o código
--     que as usa. Como a primeira só atualiza as colunas que conhece, ela NÃO apaga o `motor_id` de uma
--     etapa existente (conferido no corpo da função em produção).
--   - NÃO decide o destino de `orcamentista_motor.vigente` (proposta E, no PR).
--
-- IDEMPOTENTE: DROP NOT NULL, ADD COLUMN IF NOT EXISTS, constraints só se ausentes, o índice só se a definição
-- difere da nova.
-- VERIFICAÇÃO (aborta): a nulabilidade, a chave única, as FKs e o CHECK com a definição, a coluna do item e a
-- definição do índice.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_motor') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_motor (20261027000002). Nada foi alterado.';
  END IF;
  IF to_regclass('public.orcamentista_familia_etapa') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_familia_etapa (20261027000002). Nada foi alterado.';
  END IF;
  IF to_regclass('public.orcamentista_levantamento_item') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_levantamento_item. Nada foi alterado.';
  END IF;
  IF to_regclass('public.orcamentista_familia_catalogo') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_familia_catalogo (20261026000004). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela' AND column_name = 'categoria_chave') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_tabela.categoria_chave (20261027000005). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_levantamento_item' AND column_name = 'motor_id') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_levantamento_item.motor_id (20261027000002). Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. a família rege: o fornecedor do motor deixa de ser obrigatório ──────────────────────
ALTER TABLE public.orcamentista_motor ALTER COLUMN fornecedor_id DROP NOT NULL;
COMMENT ON COLUMN public.orcamentista_motor.fornecedor_id IS
  'Opcional desde 27/10/2026: o motor e da FAMILIA (cada etapa da familia aponta o seu), e nao de um fornecedor. Preenchido nas planilhas de antes.';

-- ── B. o motor de cada etapa ───────────────────────────────────────────────────────────────
DO $chave$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor'::regclass AND conname = 'orcamentista_motor_id_familia_key') THEN
    ALTER TABLE public.orcamentista_motor ADD CONSTRAINT orcamentista_motor_id_familia_key UNIQUE (id, familia);
  END IF;
END
$chave$;

ALTER TABLE public.orcamentista_familia_etapa ADD COLUMN IF NOT EXISTS motor_id uuid;

DO $fk_etapa$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_familia_etapa'::regclass AND conname = 'orcamentista_familia_etapa_motor_fkey') THEN
    ALTER TABLE public.orcamentista_familia_etapa
      ADD CONSTRAINT orcamentista_familia_etapa_motor_fkey
      FOREIGN KEY (motor_id, familia) REFERENCES public.orcamentista_motor (id, familia) ON DELETE RESTRICT;
  END IF;
END
$fk_etapa$;
COMMENT ON COLUMN public.orcamentista_familia_etapa.motor_id IS
  'O motor (planilha de orcamentista_motor) desta etapa. Nulo = a etapa ainda nao aponta nenhum. A FK composta com a familia impede apontar o motor de outra familia.';

-- ── C. a família de cada item do apanhado ──────────────────────────────────────────────────
ALTER TABLE public.orcamentista_levantamento_item ADD COLUMN IF NOT EXISTS familia text;

DO $fk_item$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_familia_fkey') THEN
    ALTER TABLE public.orcamentista_levantamento_item
      ADD CONSTRAINT orcamentista_levantamento_item_familia_fkey
      FOREIGN KEY (familia) REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_familia_fkey') THEN
    ALTER TABLE public.orcamentista_levantamento_item
      ADD CONSTRAINT orcamentista_levantamento_item_motor_familia_fkey
      FOREIGN KEY (motor_id, familia) REFERENCES public.orcamentista_motor (id, familia) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_exige_familia') THEN
    ALTER TABLE public.orcamentista_levantamento_item
      ADD CONSTRAINT orcamentista_levantamento_item_motor_exige_familia
      CHECK (motor_id IS NULL OR familia IS NOT NULL);
  END IF;
END
$fk_item$;
COMMENT ON COLUMN public.orcamentista_levantamento_item.familia IS
  'A familia do item do apanhado (multi-familia): e ela que decide o motor do item. Nula nos itens de antes de 27/10/2026. Com motor_id preenchido ela e obrigatoria (CHECK) e tem de ser a familia desse motor (FK composta); sem motor pode ser preenchida.';

-- ── D. uma vigente por (fornecedor, família, CATEGORIA) ────────────────────────────────────
DO $indice$
DECLARE
  def text;
BEGIN
  SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_tabela_uma_vigente';
  IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_tabela_uma_vigente ON public.orcamentista_tabela USING btree (fornecedor_id, familia, categoria_chave) NULLS NOT DISTINCT WHERE vigente' THEN
    DROP INDEX IF EXISTS public.orcamentista_tabela_uma_vigente;
    CREATE UNIQUE INDEX orcamentista_tabela_uma_vigente
      ON public.orcamentista_tabela (fornecedor_id, familia, categoria_chave) NULLS NOT DISTINCT WHERE vigente;
  END IF;
END
$indice$;

DO $verifica$
DECLARE
  def text;
BEGIN
  -- (1) o fornecedor do motor é opcional
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor'
                   AND column_name = 'fornecedor_id' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_motor.fornecedor_id ainda e obrigatorio. Nada foi alterado.';
  END IF;
  -- (2) a chave única (id, familia)
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_motor'::regclass AND conname = 'orcamentista_motor_id_familia_key';
  IF def IS DISTINCT FROM 'UNIQUE (id, familia)' THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_motor_id_familia_key ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (3) a coluna da etapa e a FK composta
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa'
                   AND column_name = 'motor_id' AND data_type = 'uuid' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 3a: orcamentista_familia_etapa.motor_id ausente ou com outra forma. Nada foi alterado.';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_familia_etapa'::regclass AND conname = 'orcamentista_familia_etapa_motor_fkey';
  IF def IS DISTINCT FROM 'FOREIGN KEY (motor_id, familia) REFERENCES orcamentista_motor(id, familia) ON DELETE RESTRICT' THEN
    RAISE EXCEPTION 'verificacao 3b: FK orcamentista_familia_etapa_motor_fkey ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (4) a família do item e as duas FKs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_levantamento_item'
                   AND column_name = 'familia' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 4a: orcamentista_levantamento_item.familia ausente ou com outra forma. Nada foi alterado.';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_familia_fkey';
  IF def IS DISTINCT FROM 'FOREIGN KEY (familia) REFERENCES orcamentista_familia_catalogo(chave) ON DELETE RESTRICT' THEN
    RAISE EXCEPTION 'verificacao 4b: FK orcamentista_levantamento_item_familia_fkey ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_familia_fkey';
  IF def IS DISTINCT FROM 'FOREIGN KEY (motor_id, familia) REFERENCES orcamentista_motor(id, familia) ON DELETE RESTRICT' THEN
    RAISE EXCEPTION 'verificacao 4c: FK orcamentista_levantamento_item_motor_familia_fkey ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_exige_familia';
  IF def IS DISTINCT FROM 'CHECK (((motor_id IS NULL) OR (familia IS NOT NULL)))' THEN
    RAISE EXCEPTION 'verificacao 4d: CHECK orcamentista_levantamento_item_motor_exige_familia ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (5) o índice da vigente, com a categoria
  SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_tabela_uma_vigente';
  IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_tabela_uma_vigente ON public.orcamentista_tabela USING btree (fornecedor_id, familia, categoria_chave) NULLS NOT DISTINCT WHERE vigente' THEN
    RAISE EXCEPTION 'verificacao 5: indice orcamentista_tabela_uma_vigente ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (6) o índice da vigente do MOTOR não foi tocado
  SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_motor_uma_vigente';
  IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_motor_uma_vigente ON public.orcamentista_motor USING btree (familia, fornecedor_id) WHERE vigente' THEN
    RAISE EXCEPTION 'verificacao 6: indice orcamentista_motor_uma_vigente mudou ou sumiu: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  RAISE NOTICE 'motor da familia: fornecedor opcional, motor_id da etapa, familia do item, indice da vigente por categoria.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, is_nullable from information_schema.columns where table_name='orcamentista_motor' and column_name='fornecedor_id';  -- YES
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('orcamentista_motor_id_familia_key','orcamentista_familia_etapa_motor_fkey','orcamentista_levantamento_item_familia_fkey','orcamentista_levantamento_item_motor_familia_fkey','orcamentista_levantamento_item_motor_exige_familia');
-- select indexdef from pg_indexes where indexname='orcamentista_tabela_uma_vigente';
-- select count(*) filter (where familia is not null) from public.orcamentista_levantamento_item;   -- esperado: 0 (os 4 de hoje, sem família)
