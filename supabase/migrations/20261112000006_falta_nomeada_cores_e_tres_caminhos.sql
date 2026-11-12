-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261112000006 — a FALTA NOMEADA no orçamento, a TABELA DE CORES do fornecedor, os TRÊS CAMINHOS do custo
-- (perfil, insumo, vidro), a FOTOGRAFIA da resolução de referência e o CÓDIGO do vidro.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261112000006_falta_nomeada_cores_e_tres_caminhos.
-- ║ SUBSTITUI a 20261112000001 (a fotografia), que NUNCA foi aplicada nem autorizada e foi tirada da
-- ║ pasta neste PR: as duas colunas dela estão aqui, com a CHECK reescrita nos degraus novos.
-- ║ GRAVA DADO? Só a tabela de cores da Wolf (19 linhas, catálogo da plataforma, sem tenant). Nenhum
-- ║ dado de conta é escrito, alterado ou apagado. As partes que executam são ASCII; os acentos estão
-- ║ só em comentário.
-- ║ SEM ELA o código não quebra o que existe: sem a tabela de faltas, um orçamento com falta de preço
-- ║ é RECUSADO como antes (a regra de 08/11), nomeando as faltas; sem as colunas da fotografia, do
-- ║ caminho e do código do vidro, o material é gravado sem elas e o resultado diz `sem_migracao`.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisões do dono do produto, 12/11/2026 (o comando único):
--   1.4 "FALTA NOMEADA no lugar do 'nada evolui', em tabela própria orcamentista_orcamento_falta. NÃO afrouxe o NOT NULL do
--       material. O 'parcial' se deriva da existência de falta aberta."
--   1.6 "TABELA DE CORES no banco, orcamentista_fornecedor_cor. Conhecimento do fornecedor não vai para o código."
--   2   "OS TRÊS CAMINHOS DE CUSTO, separados no código: PERFIL -> barra inteira rateada por milímetro; INSUMO -> quantidade x
--       custo da unidade x cascata; VIDRO -> m² x preço por m² x cascata."
--   3.5 "o agente [...] grava o CÓDIGO junto com o texto. O texto é para o vendedor ler; o código é o que precifica."
--   5.2 "a CHECK dela [a 20261112000001] precisa ser reescrita com os nomes novos dos degraus."
--
-- O QUE FAZ:
--   1. `orcamentista_fornecedor_cor` (fornecedor, grupo, codigo, nome): a tabela de cores do fornecedor, que traduz a cor da
--      conversa no dígito que o fornecedor cola no código (1317 + BRANCO 1 = 13171). FK para o fornecedor ON DELETE RESTRICT:
--      remover do catálogo um fornecedor com cores falha (23503) até os passos do arrasto (20261031000003) conhecerem esta
--      tabela — fechado, nunca em silêncio; uma CASCADE apagaria as cores sem log, e os passos do arrasto não as mediriam.
--      RLS e políticas iguais às de `orcamentista_fornecedor` (super admin), lidas em produção em 12/11/2026. SEMEADA com os
--      19 pares da aba CORES do xlsm da Wolff, como o dono do produto os leu: PERFIS DE PVC (15) e ACESSORIOS (4). O ".1" final
--      do código é FACE MENOR, não cor, e NÃO entra aqui; persianas usam cor fora desta aba (2 = CINZA) e NÃO entram — sufixo
--      fora da tabela é "não resolvido", nunca palpite.
--   2. `orcamentista_orcamento_falta`: a falta de preço de um item do orçamento, por CÁLCULO (`calculo_id`, como o material: só
--      INSERT, o cálculo de antes fica). A falta "aberta" é a do cálculo vigente do item; o orçamento é PARCIAL quando algum item
--      tem falta no seu cálculo vigente — derivado, sem coluna duplicada. Diz o caminho (perfil, insumo, vidro), o código do
--      motor, a descrição dele, a cor pedida, a tipologia, a esquadria, o motivo, a frase e as candidatas (quando houve mais de
--      uma). FK composta para o item ON DELETE RESTRICT e grants iguais aos do material (só service_role, INSERT e SELECT).
--   3. `orcamentista_orcamento_item_material`:
--        - `codigo_na_tabela` e `resolucao` (a fotografia): de qual código da tabela veio o preço e POR QUAL degrau da resolução
--          — ponte, exato, cor ou nome_tecnico (o sufixo do fornecedor está dentro do exato); no vidro, vidro_escolhido (o código que
--          o vendedor escolheu) ou vidro_traduzido (o texto traduzido num item único). Nulas no material de antes.
--        - `caminho`: perfil, insumo ou vidro. Nulo no material de antes (que é todo de perfil — o único caminho que existia —,
--          mas o dado não diz isso, e nada é preenchido por dedução).
--        - a UNIQUE (orcamento_item_id, calculo_id, codigo) passa a incluir o caminho: o mesmo código pode entrar como perfil e
--          como insumo (8428 e 8431 estão nos dois tipos do motor, medido em 28/10/2026).
--   4. `vidro_codigo` em `orcamentista_levantamento_item` e em `orcamentista_orcamento_item`: o código do item da tabela de vidro
--      que o vendedor escolheu. Nulo = não escolhido (o cálculo traduz o texto, e a falta nomeia quando não fecha).
--
-- O QUE NÃO FAZ: não muda `vendido_por` (o 'metro_quadrado' pedido no 3.3 é migração à parte, com o custo dito no PR); não
-- afrouxa nenhum NOT NULL; não toca em linha de conta.
--
-- IDEMPOTENTE: CREATE TABLE / ADD COLUMN IF NOT EXISTS; constraints e índices só se não existem; a semente por ON CONFLICT.
-- GUARDA (aborta): as tabelas de que depende; o fornecedor Wolf com o id e o nome medidos; uma coluna a criar já existente com
-- outro tipo; a UNIQUE antiga do material com outra definição; uma cor já semeada com outro nome.
-- VERIFICAÇÃO (aborta): as colunas, os tipos e a nulidade; as CHECKs; a UNIQUE nova e a ausência da antiga; as 19 cores; RLS,
-- políticas e grants das duas tabelas novas.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  c record;
  def text;
BEGIN
  IF to_regclass('public.orcamentista_fornecedor') IS NULL OR to_regclass('public.orcamentista_orcamento_item') IS NULL
     OR to_regclass('public.orcamentista_orcamento_item_material') IS NULL OR to_regclass('public.orcamentista_levantamento_item') IS NULL
     OR to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_fornecedor, orcamentista_orcamento_item, orcamentista_orcamento_item_material, orcamentista_levantamento_item ou tenants. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.is_super_admin(). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor WHERE id = '44c5c0fe-a0d3-4aab-802d-20a6eff3f654' AND nome = 'Wolf') THEN
    RAISE EXCEPTION 'o fornecedor Wolf (44c5c0fe-a0d3-4aab-802d-20a6eff3f654) nao existe com esse nome: a semente das cores nao tem dono. Nada foi alterado.';
  END IF;
  FOR c IN SELECT table_name, column_name, udt_name FROM information_schema.columns
            WHERE table_schema = 'public' AND (
                  (table_name = 'orcamentista_orcamento_item_material' AND column_name IN ('codigo_na_tabela', 'resolucao', 'caminho'))
               OR (table_name IN ('orcamentista_levantamento_item', 'orcamentista_orcamento_item') AND column_name = 'vidro_codigo')) LOOP
    IF c.udt_name <> 'text' THEN
      RAISE EXCEPTION '%.% ja existe com o tipo %, e devia ser text. Nada foi alterado.', c.table_name, c.column_name, c.udt_name;
    END IF;
  END LOOP;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass AND conname = 'orcamentista_orcamento_item_material_codigo_key';
  IF def IS NOT NULL AND def <> 'UNIQUE (orcamento_item_id, calculo_id, codigo)' THEN
    RAISE EXCEPTION 'orcamentista_orcamento_item_material_codigo_key existe com outra definicao: %. Nada foi alterado.', def;
  END IF;
  -- o IF de fora antes do de dentro: o PL/pgSQL so planeja a consulta da tabela quando ela existe
  IF to_regclass('public.orcamentista_fornecedor_cor') IS NOT NULL THEN
  IF EXISTS (
       SELECT 1 FROM public.orcamentista_fornecedor_cor fc
         JOIN (VALUES ('PERFIS DE PVC', '1', 'BRANCO'), ('PERFIS DE PVC', '18', 'EXTERNO PRETO TEXTURADO'), ('PERFIS DE PVC', '19', 'EXTERNO GOLDEN OAK'),
                      ('PERFIS DE PVC', '20', 'PRETO TEXTURADO'), ('PERFIS DE PVC', '21', 'AMADEIRADO GOLDEN OAK'), ('PERFIS DE PVC', '30', 'BRONZE'),
                      ('PERFIS DE PVC', '31', 'GRAFITE'), ('PERFIS DE PVC', '32', 'EXTERNO BRONZE'), ('PERFIS DE PVC', '33', 'EXTERNO GRAFITE'),
                      ('PERFIS DE PVC', '36', 'PRETO LISO'), ('PERFIS DE PVC', '37', 'AMADEIRADO NOGUEIRA'), ('PERFIS DE PVC', '38', 'EXTERNO PRETO LISO'),
                      ('PERFIS DE PVC', '39', 'EXTERNO NOGUEIRA'), ('PERFIS DE PVC', '40', 'PIRITA'), ('PERFIS DE PVC', '41', 'EXTERNO PIRITA'),
                      ('ACESSORIOS', '1', 'BRANCO'), ('ACESSORIOS', '9', 'PRETO'), ('ACESSORIOS', '14', 'AMADEIRADO'), ('ACESSORIOS', '16', 'BRONZE'))
              AS s(grupo, codigo, nome) ON fc.grupo = s.grupo AND fc.codigo = s.codigo
        WHERE fc.fornecedor_id = '44c5c0fe-a0d3-4aab-802d-20a6eff3f654' AND fc.nome <> s.nome) THEN
    RAISE EXCEPTION 'orcamentista_fornecedor_cor ja tem uma cor da Wolf com outro nome: a semente nao sobrescreve. Nada foi alterado.';
  END IF;
  END IF;
END
$guarda$;

-- ── 1. a tabela de cores do fornecedor ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_fornecedor_cor (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid        NOT NULL REFERENCES public.orcamentista_fornecedor(id) ON DELETE RESTRICT,
  grupo         text        NOT NULL CONSTRAINT orcamentista_fornecedor_cor_grupo_forma CHECK (grupo ~ '^\S(.*\S)?$' AND char_length(grupo) <= 60),
  codigo        text        NOT NULL CONSTRAINT orcamentista_fornecedor_cor_codigo_forma CHECK (codigo ~ '^[0-9A-Z]{1,6}$'),
  nome          text        NOT NULL CONSTRAINT orcamentista_fornecedor_cor_nome_forma CHECK (nome ~ '^\S(.*\S)?$' AND char_length(nome) <= 60),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_fornecedor_cor_codigo_key UNIQUE (fornecedor_id, grupo, codigo)
);
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_fornecedor_cor_nome_key ON public.orcamentista_fornecedor_cor (fornecedor_id, grupo, upper(nome));
ALTER TABLE public.orcamentista_fornecedor_cor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orcamentista_fornecedor_cor_select_super_admin ON public.orcamentista_fornecedor_cor;
DROP POLICY IF EXISTS orcamentista_fornecedor_cor_insert_super_admin ON public.orcamentista_fornecedor_cor;
DROP POLICY IF EXISTS orcamentista_fornecedor_cor_update_super_admin ON public.orcamentista_fornecedor_cor;
DROP POLICY IF EXISTS orcamentista_fornecedor_cor_delete_super_admin ON public.orcamentista_fornecedor_cor;
CREATE POLICY orcamentista_fornecedor_cor_select_super_admin ON public.orcamentista_fornecedor_cor FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_fornecedor_cor_insert_super_admin ON public.orcamentista_fornecedor_cor FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_fornecedor_cor_update_super_admin ON public.orcamentista_fornecedor_cor FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_fornecedor_cor_delete_super_admin ON public.orcamentista_fornecedor_cor FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_fornecedor_cor FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentista_fornecedor_cor TO service_role;
COMMENT ON TABLE public.orcamentista_fornecedor_cor IS
  'A tabela de cores do fornecedor (20261112000006): o digito que ele cola no codigo para cada cor, por grupo (PERFIS DE PVC, ACESSORIOS). O .1 final e FACE MENOR, nao cor, e nao entra aqui.';

INSERT INTO public.orcamentista_fornecedor_cor (fornecedor_id, grupo, codigo, nome)
SELECT '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'::uuid, s.grupo, s.codigo, s.nome
  FROM (VALUES ('PERFIS DE PVC', '1', 'BRANCO'), ('PERFIS DE PVC', '18', 'EXTERNO PRETO TEXTURADO'), ('PERFIS DE PVC', '19', 'EXTERNO GOLDEN OAK'),
               ('PERFIS DE PVC', '20', 'PRETO TEXTURADO'), ('PERFIS DE PVC', '21', 'AMADEIRADO GOLDEN OAK'), ('PERFIS DE PVC', '30', 'BRONZE'),
               ('PERFIS DE PVC', '31', 'GRAFITE'), ('PERFIS DE PVC', '32', 'EXTERNO BRONZE'), ('PERFIS DE PVC', '33', 'EXTERNO GRAFITE'),
               ('PERFIS DE PVC', '36', 'PRETO LISO'), ('PERFIS DE PVC', '37', 'AMADEIRADO NOGUEIRA'), ('PERFIS DE PVC', '38', 'EXTERNO PRETO LISO'),
               ('PERFIS DE PVC', '39', 'EXTERNO NOGUEIRA'), ('PERFIS DE PVC', '40', 'PIRITA'), ('PERFIS DE PVC', '41', 'EXTERNO PIRITA'),
               ('ACESSORIOS', '1', 'BRANCO'), ('ACESSORIOS', '9', 'PRETO'), ('ACESSORIOS', '14', 'AMADEIRADO'), ('ACESSORIOS', '16', 'BRONZE'))
       AS s(grupo, codigo, nome)
ON CONFLICT (fornecedor_id, grupo, codigo) DO NOTHING;

-- ── 2. a falta nomeada do orçamento ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_orcamento_falta (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  orcamento_item_id uuid        NOT NULL,
  calculo_id        uuid        NOT NULL,
  ordem             integer     NOT NULL CONSTRAINT orcamentista_orcamento_falta_ordem_positiva CHECK (ordem >= 1),
  caminho           text        NOT NULL CONSTRAINT orcamentista_orcamento_falta_caminho_valido CHECK (caminho IN ('perfil', 'insumo', 'vidro')),
  codigo_do_motor   text        NOT NULL CONSTRAINT orcamentista_orcamento_falta_codigo_forma CHECK (codigo_do_motor ~ '^\S(.*\S)?$' AND char_length(codigo_do_motor) <= 60),
  descricao_do_motor text       NULL     CONSTRAINT orcamentista_orcamento_falta_descricao_forma CHECK (descricao_do_motor IS NULL OR (descricao_do_motor ~ '^\S(.*\S)?$' AND char_length(descricao_do_motor) <= 300)),
  cor               text        NULL     CONSTRAINT orcamentista_orcamento_falta_cor_forma CHECK (cor IS NULL OR (cor ~ '^\S(.*\S)?$' AND char_length(cor) <= 80)),
  tipologia         text        NOT NULL CONSTRAINT orcamentista_orcamento_falta_tipologia_forma CHECK (tipologia ~ '^\S(.*\S)?$' AND char_length(tipologia) <= 60),
  esquadria         integer     NOT NULL CONSTRAINT orcamentista_orcamento_falta_esquadria_positiva CHECK (esquadria >= 1),
  motivo            text        NOT NULL CONSTRAINT orcamentista_orcamento_falta_motivo_forma CHECK (motivo ~ '^[A-Z][A-Z0-9_]{0,59}$'),
  frase             text        NOT NULL CONSTRAINT orcamentista_orcamento_falta_frase_forma CHECK (frase ~ '^\S(.*\S)?$' AND char_length(frase) <= 1000),
  candidatas        jsonb       NULL     CONSTRAINT orcamentista_orcamento_falta_candidatas_lista CHECK (candidatas IS NULL OR jsonb_typeof(candidatas) = 'array'),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_orcamento_falta_item_fkey FOREIGN KEY (orcamento_item_id, tenant_id)
    REFERENCES public.orcamentista_orcamento_item(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_orcamento_falta_ordem_key UNIQUE (orcamento_item_id, calculo_id, ordem)
);
CREATE INDEX IF NOT EXISTS orcamentista_orcamento_falta_calculo_idx ON public.orcamentista_orcamento_falta (orcamento_item_id, calculo_id);
ALTER TABLE public.orcamentista_orcamento_falta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orcamentista_orcamento_falta FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.orcamentista_orcamento_falta TO service_role;
COMMENT ON TABLE public.orcamentista_orcamento_falta IS
  'A falta de preco de um item do orcamento, por calculo (20261112000006). So INSERT, como o material. A falta aberta e a do calculo vigente do item; o orcamento e PARCIAL quando algum item tem falta no seu calculo vigente.';

-- ── 3. o material: a fotografia, o caminho e a UNIQUE com o caminho ────────────────────────
ALTER TABLE public.orcamentista_orcamento_item_material ADD COLUMN IF NOT EXISTS codigo_na_tabela text NULL;
ALTER TABLE public.orcamentista_orcamento_item_material ADD COLUMN IF NOT EXISTS resolucao text NULL;
ALTER TABLE public.orcamentista_orcamento_item_material ADD COLUMN IF NOT EXISTS caminho text NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass
                    AND conname = 'orcamentista_orcamento_item_material_resolucao_check') THEN
    ALTER TABLE public.orcamentista_orcamento_item_material ADD CONSTRAINT orcamentista_orcamento_item_material_resolucao_check
      CHECK (resolucao IN ('ponte', 'exato', 'cor', 'nome_tecnico', 'vidro_escolhido', 'vidro_traduzido'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass
                    AND conname = 'orcamentista_orcamento_item_material_caminho_check') THEN
    ALTER TABLE public.orcamentista_orcamento_item_material ADD CONSTRAINT orcamentista_orcamento_item_material_caminho_check
      CHECK (caminho IN ('perfil', 'insumo', 'vidro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass
                    AND conname = 'orcamentista_orcamento_item_material_codigo_na_tabela_forma') THEN
    ALTER TABLE public.orcamentista_orcamento_item_material ADD CONSTRAINT orcamentista_orcamento_item_material_codigo_na_tabela_forma
      CHECK (codigo_na_tabela IS NULL OR (codigo_na_tabela ~ '^\S(.*\S)?$' AND char_length(codigo_na_tabela) <= 60));
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_orcamento_item_material_caminho_codigo_key
  ON public.orcamentista_orcamento_item_material (orcamento_item_id, calculo_id, (coalesce(caminho, 'perfil')), codigo);
ALTER TABLE public.orcamentista_orcamento_item_material DROP CONSTRAINT IF EXISTS orcamentista_orcamento_item_material_codigo_key;

COMMENT ON COLUMN public.orcamentista_orcamento_item_material.codigo_na_tabela IS
  'O codigo do item na tabela de preco de onde veio o preco (20261112000006). Nulo no material calculado antes desta migracao.';
COMMENT ON COLUMN public.orcamentista_orcamento_item_material.resolucao IS
  'Por qual degrau da resolucao de referencia o preco foi achado: ponte, exato (o sufixo do fornecedor incluido), cor ou nome_tecnico; no vidro, vidro_escolhido ou vidro_traduzido (20261112000006). Nulo antes.';
COMMENT ON COLUMN public.orcamentista_orcamento_item_material.caminho IS
  'O caminho do custo: perfil (barra inteira rateada por mm), insumo (quantidade x unidade) ou vidro (m2 x preco por m2) (20261112000006). Nulo antes.';

-- ── 4. o código do vidro ───────────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_levantamento_item ADD COLUMN IF NOT EXISTS vidro_codigo text NULL;
ALTER TABLE public.orcamentista_orcamento_item ADD COLUMN IF NOT EXISTS vidro_codigo text NULL;
DO $vidro$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_vidro_codigo_forma') THEN
    ALTER TABLE public.orcamentista_levantamento_item ADD CONSTRAINT orcamentista_levantamento_item_vidro_codigo_forma
      CHECK (vidro_codigo IS NULL OR (vidro_codigo ~ '^\S(.*\S)?$' AND char_length(vidro_codigo) <= 60));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item'::regclass AND conname = 'orcamentista_orcamento_item_vidro_codigo_forma') THEN
    ALTER TABLE public.orcamentista_orcamento_item ADD CONSTRAINT orcamentista_orcamento_item_vidro_codigo_forma
      CHECK (vidro_codigo IS NULL OR (vidro_codigo ~ '^\S(.*\S)?$' AND char_length(vidro_codigo) <= 60));
  END IF;
END
$vidro$;
COMMENT ON COLUMN public.orcamentista_levantamento_item.vidro_codigo IS
  'O codigo do item da tabela de vidro escolhido pelo vendedor (20261112000006). O texto em vidro e para ler; o codigo e o que precifica. Nulo = nao escolhido.';
COMMENT ON COLUMN public.orcamentista_orcamento_item.vidro_codigo IS
  'O codigo do item da tabela de vidro (20261112000006), copiado do levantamento na travessia. Nulo = o calculo traduz o texto.';

DO $verifica$
DECLARE
  c record;
  n int;
  quem text;
BEGIN
  FOR c IN SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
            WHERE table_schema = 'public' AND (
                  (table_name = 'orcamentista_orcamento_item_material' AND column_name IN ('codigo_na_tabela', 'resolucao', 'caminho'))
               OR (table_name IN ('orcamentista_levantamento_item', 'orcamentista_orcamento_item') AND column_name = 'vidro_codigo')) LOOP
    IF c.data_type <> 'text' OR c.is_nullable <> 'YES' OR c.column_default IS NOT NULL THEN
      RAISE EXCEPTION 'verificacao 1: %.% devia ser text, nula e sem default. Nada foi alterado.', c.table_name, c.column_name;
    END IF;
  END LOOP;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND (
        (table_name = 'orcamentista_orcamento_item_material' AND column_name IN ('codigo_na_tabela', 'resolucao', 'caminho'))
     OR (table_name IN ('orcamentista_levantamento_item', 'orcamentista_orcamento_item') AND column_name = 'vidro_codigo'));
  IF n <> 5 THEN
    RAISE EXCEPTION 'verificacao 1: achei % das 5 colunas novas. Nada foi alterado.', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass
                    AND conname = 'orcamentista_orcamento_item_material_resolucao_check'
                    AND pg_get_constraintdef(oid) = 'CHECK ((resolucao = ANY (ARRAY[''ponte''::text, ''exato''::text, ''cor''::text, ''nome_tecnico''::text, ''vidro_escolhido''::text, ''vidro_traduzido''::text])))') THEN
    RAISE EXCEPTION 'verificacao 2: a CHECK da resolucao ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass
                    AND conname = 'orcamentista_orcamento_item_material_caminho_check'
                    AND pg_get_constraintdef(oid) = 'CHECK ((caminho = ANY (ARRAY[''perfil''::text, ''insumo''::text, ''vidro''::text])))') THEN
    RAISE EXCEPTION 'verificacao 2: a CHECK do caminho ausente ou com outra definicao. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass AND conname = 'orcamentista_orcamento_item_material_codigo_key')
     OR to_regclass('public.orcamentista_orcamento_item_material_caminho_codigo_key') IS NULL THEN
    RAISE EXCEPTION 'verificacao 3: a UNIQUE antiga do material ainda existe, ou a nova (com o caminho) nao. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_fornecedor_cor WHERE fornecedor_id = '44c5c0fe-a0d3-4aab-802d-20a6eff3f654';
  IF n <> 19 THEN
    RAISE EXCEPTION 'verificacao 4: a Wolf tem % cores, e deviam ser 19 (15 de PERFIS DE PVC e 4 de ACESSORIOS). Nada foi alterado.', n;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_fornecedor_cor'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_orcamento_falta'::regclass) THEN
    RAISE EXCEPTION 'verificacao 5: RLS desligada numa das duas tabelas novas. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE tablename = 'orcamentista_fornecedor_cor' AND schemaname = 'public';
  IF n <> 4 THEN
    RAISE EXCEPTION 'verificacao 5: orcamentista_fornecedor_cor tem % politicas, e deviam ser as 4 de super admin. Nada foi alterado.', n;
  END IF;
  SELECT string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type) INTO quem FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_falta' AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role');
  IF quem IS DISTINCT FROM 'service_role:INSERT,service_role:SELECT' THEN
    RAISE EXCEPTION 'verificacao 6: os grants de orcamentista_orcamento_falta deviam ser so INSERT e SELECT do service_role, e sao: %. Nada foi alterado.', quem;
  END IF;
  SELECT string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type) INTO quem FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_fornecedor_cor' AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF quem IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 6: orcamentista_fornecedor_cor tem grant para %. Nada foi alterado.', quem;
  END IF;
  RAISE NOTICE 'falta nomeada, cores da Wolf (19), fotografia (ponte, exato, cor, nome_tecnico, vidro_escolhido, vidro_traduzido), caminho do material e codigo do vidro.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select table_name, column_name, data_type, is_nullable from information_schema.columns
--  where table_schema = 'public' and column_name in ('codigo_na_tabela', 'resolucao', 'caminho', 'vidro_codigo');
-- -- esperado: 5 linhas, text, YES
-- select grupo, count(*) from orcamentista_fornecedor_cor group by 1;
-- -- esperado: ACESSORIOS 4, PERFIS DE PVC 15
-- select count(*) from orcamentista_orcamento_falta;
-- -- esperado: 0
-- insert into supabase_migrations.schema_migrations (version, name, created_by)
-- values ('20261112000006', '20261112000006_falta_nomeada_cores_e_tres_caminhos', 'sql-editor') on conflict (version) do nothing;
