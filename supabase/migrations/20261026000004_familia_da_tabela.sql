-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261026000004 — a FAMÍLIA da tabela do fornecedor, e o fornecedor de cada esquadria.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261026000004_familia_da_tabela.
-- ║ SEM ELA O CÓDIGO QUEBRA: a conversa lê `orcamentista_levantamento_item.tabela_id` e a tela
-- ║ lê `orcamentista_tabela.familia` e `orcamentista_familia_catalogo`. A ordem é aplicar,
-- ║ verificar por consulta, e só então mergear (`.claude/rules/migracao.md`, Parte I).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 26/10/2026. A cascata é
--   FAMÍLIA -> LINHA -> TIPOLOGIA -> PERFIS, VIDROS, INSUMOS -> PREÇO (tabela do fornecedor),
-- e o primeiro degrau não existia em campo nenhum: o motor sabe a LINHA (EUROPA 42, EUROPA 60,
-- DESIGN), não que ela é PVC. As decisões, registradas como estão:
--   - LISTA FECHADA, catálogo no padrão de `orcamentista_categoria_catalogo` (chave, rótulo,
--     ordem). O super admin acrescenta entradas ("Portas de ACM e Portas de garagem ainda vão
--     aparecer");
--   - a FAMÍLIA é atributo da TABELA DO FORNECEDOR, escolhido da lista no cadastro da tabela.
--     Não é deduzida do prefixo de `linha` nem do `segmento`;
--   - a conta PODE ter duas tabelas da MESMA família. Sem unicidade por família;
--   - o nome `orcamentista_motor_formula_familia` FICA, com comentário dizendo que está vencido:
--     a "família" dela é a LINHA do motor.
--
-- O QUE FAZ:
--   A. `orcamentista_familia_catalogo` (chave, rotulo, ordem), da plataforma, sem tenant. Uma
--      entrada inicial: PVC — a família das duas tabelas que existem hoje (Wolff). As outras
--      entram pela tela do super admin. A chave é MAIÚSCULA ASCII; o rótulo é o texto da tela.
--   B. `orcamentista_tabela.familia` (text, NULL, FK para a chave, ON DELETE RESTRICT). NULL é
--      "não informada": as 2 tabelas que existem continuam sem família até o super admin
--      escolher na tela. Nenhum UPDATE aqui — a família não é deduzida.
--   C. `orcamentista_levantamento_item.tabela_id` (uuid, NULL, FK para `orcamentista_tabela`,
--      ON DELETE SET NULL): de qual TABELA (fornecedor) é a tipologia da esquadria. Com duas
--      tabelas ligadas à conta e o mesmo código nas duas, a conversa PERGUNTA de qual fornecedor,
--      e a resposta mora aqui. NULL é "ainda não sabido": a conversa a resolve pelo código quando
--      ele está em UMA tabela só, e pergunta quando está em mais de uma.
--      POR QUE SET NULL, e não RESTRICT: a exclusão da tabela já trata o 23503 como "a tabela está
--      em uso POR CONTAS" (`tabelas/[id].ts`). Um RESTRICT aqui faria uma esquadria antiga bloquear
--      a exclusão com uma frase que diz outra coisa. Com SET NULL, a esquadria volta a "não
--      sabido", e a conversa resolve de novo — ou pergunta.
--      A importação NÃO toca nesta tabela nem em `orcamentista_tabela`
--      (`tabela-que-a-importacao-apaga.md`): conferido em `importar_conteudo_da_tabela`.
--   D. COMMENT em `orcamentista_motor_formula_familia`: o nome está vencido.
--
-- O PADRÃO DO PROJETO: RLS ativa, REVOKE ALL de PUBLIC, anon e authenticated, NENHUMA política:
-- o acesso é só por rota, com service_role.
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, constraints por nome
-- (DROP IF EXISTS + ADD), INSERT ... ON CONFLICT DO NOTHING.
-- VERIFICAÇÃO (aborta): cada constraint com a definição esperada, as colunas com o tipo, RLS sem
-- política e sem privilégio público, e a entrada PVC. As colunas novas nascem NULL e o arquivo
-- não tem UPDATE nem DELETE: a família de uma tabela só é escolhida pela tela. (Uma verificação de
-- "nenhuma família preenchida" abortaria a reaplicação depois de o super admin escolher uma.)
-- DEPOIS DE APLICAR: NOTIFY pgrst (está no fim) e as consultas do rodapé.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_tabela') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_tabela. Nada foi alterado.';
  END IF;
  IF to_regclass('public.orcamentista_levantamento_item') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_levantamento_item (20261025000003). Nada foi alterado.';
  END IF;
  IF to_regclass('public.orcamentista_motor_formula_familia') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_motor_formula_familia. Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. o catálogo das famílias ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_familia_catalogo (
  chave   text NOT NULL,
  ordem   int  NOT NULL,
  rotulo  text NOT NULL,
  CONSTRAINT orcamentista_familia_catalogo_pkey        PRIMARY KEY (chave),
  CONSTRAINT orcamentista_familia_catalogo_ordem_key   UNIQUE (ordem),
  CONSTRAINT orcamentista_familia_catalogo_chave_forma CHECK (chave ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  CONSTRAINT orcamentista_familia_catalogo_rotulo_forma CHECK (rotulo = btrim(rotulo) AND length(rotulo) BETWEEN 1 AND 60),
  CONSTRAINT orcamentista_familia_catalogo_ordem_positiva CHECK (ordem >= 1)
);

COMMENT ON TABLE public.orcamentista_familia_catalogo IS
  'As familias das tabelas de fornecedor (PVC, ...): o primeiro degrau da cascata FAMILIA -> LINHA -> TIPOLOGIA. Lista fechada, da plataforma, sem tenant; o super admin acrescenta entradas pela tela. Decisao do dono do produto, 26/10/2026.';

ALTER TABLE public.orcamentista_familia_catalogo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orcamentista_familia_catalogo FROM PUBLIC, anon, authenticated;

INSERT INTO public.orcamentista_familia_catalogo (chave, ordem, rotulo) VALUES ('PVC', 1, 'PVC')
ON CONFLICT (chave) DO NOTHING;

-- ── B. a família da tabela do fornecedor ──────────────────────────────────────────────────
ALTER TABLE public.orcamentista_tabela ADD COLUMN IF NOT EXISTS familia text NULL;
ALTER TABLE public.orcamentista_tabela DROP CONSTRAINT IF EXISTS orcamentista_tabela_familia_fkey;
ALTER TABLE public.orcamentista_tabela ADD CONSTRAINT orcamentista_tabela_familia_fkey
  FOREIGN KEY (familia) REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE RESTRICT;
COMMENT ON COLUMN public.orcamentista_tabela.familia IS
  'A familia da tabela (orcamentista_familia_catalogo.chave), escolhida pelo super admin no cadastro. NULL = nao informada; nunca deduzida da linha nem do segmento.';

-- ── C. a tabela (o fornecedor) da tipologia de cada esquadria ─────────────────────────────
ALTER TABLE public.orcamentista_levantamento_item ADD COLUMN IF NOT EXISTS tabela_id uuid NULL;
ALTER TABLE public.orcamentista_levantamento_item DROP CONSTRAINT IF EXISTS orcamentista_levantamento_item_tabela_fkey;
ALTER TABLE public.orcamentista_levantamento_item ADD CONSTRAINT orcamentista_levantamento_item_tabela_fkey
  FOREIGN KEY (tabela_id) REFERENCES public.orcamentista_tabela (id) ON DELETE SET NULL;
COMMENT ON COLUMN public.orcamentista_levantamento_item.tabela_id IS
  'De qual tabela de fornecedor e a tipologia da esquadria. NULL = ainda nao sabido: a conversa resolve pelo codigo quando ele esta em uma tabela so da conta, e pergunta de qual fornecedor quando esta em mais de uma. SET NULL na exclusao da tabela: a esquadria volta a nao sabido.';

-- ── D. o nome vencido ─────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.orcamentista_motor_formula_familia IS
  'NOME VENCIDO (26/10/2026): a "familia" desta tabela e a LINHA do motor (EUROPA 42, EUROPA 60), nao a familia da tabela do fornecedor (orcamentista_tabela.familia). O nome fica; o codigo e a tela dizem "linha". As formulas da linha importadas do arquivo do motor. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_familia_catalogo|orcamentista_familia_catalogo_pkey|PRIMARY KEY (chave)',
    'orcamentista_familia_catalogo|orcamentista_familia_catalogo_ordem_key|UNIQUE (ordem)',
    'orcamentista_familia_catalogo|orcamentista_familia_catalogo_chave_forma|CHECK ((chave ~ ''^[A-Z][A-Z0-9_]{0,39}$''::text))',
    'orcamentista_familia_catalogo|orcamentista_familia_catalogo_rotulo_forma|CHECK (((rotulo = btrim(rotulo)) AND ((length(rotulo) >= 1) AND (length(rotulo) <= 60))))',
    'orcamentista_familia_catalogo|orcamentista_familia_catalogo_ordem_positiva|CHECK ((ordem >= 1))',
    'orcamentista_tabela|orcamentista_tabela_familia_fkey|FOREIGN KEY (familia) REFERENCES orcamentista_familia_catalogo(chave) ON DELETE RESTRICT',
    'orcamentista_levantamento_item|orcamentista_levantamento_item_tabela_fkey|FOREIGN KEY (tabela_id) REFERENCES orcamentista_tabela(id) ON DELETE SET NULL'
  ];
  t      text := 'orcamentista_familia_catalogo';
  e      text;
  p      text[];
  faltam text;
  n      int;
BEGIN
  -- (1) cada constraint, pela tabela, pelo nome e pela definição
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.' || p[1]) AND conname = p[2]
                      AND pg_get_constraintdef(oid) = p[3]) THEN
      faltam := concat_ws('; ', faltam, p[2]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  -- (2) as colunas novas, com o tipo e anulaveis
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela'
                   AND column_name = 'familia' AND data_type = 'text' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_tabela.familia ausente ou com outro tipo. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_levantamento_item'
                   AND column_name = 'tabela_id' AND data_type = 'uuid' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'verificacao 2: orcamentista_levantamento_item.tabela_id ausente ou com outro tipo. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t;
  IF n <> 3 THEN
    RAISE EXCEPTION 'verificacao 2: % tem % coluna(s), e devia ter 3. Nada foi alterado.', t, n;
  END IF;
  -- (3) RLS ligada, (4) nenhuma politica, (5) nenhum privilegio publico
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.' || t) AND relrowsecurity) THEN
    RAISE EXCEPTION 'verificacao 3: % sem RLS. Nada foi alterado.', t;
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 4: % tem % politica(s); o padrao e nenhuma. Nada foi alterado.', t, n;
  END IF;
  IF has_table_privilege('public', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'verificacao 5: % com privilegio para PUBLIC, anon ou authenticated. Nada foi alterado.', t;
  END IF;
  -- (6) a entrada inicial
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo WHERE chave = 'PVC' AND rotulo = 'PVC') THEN
    RAISE EXCEPTION 'verificacao 6: a familia PVC nao esta no catalogo. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'familia: catalogo com PVC, orcamentista_tabela.familia e orcamentista_levantamento_item.tabela_id, RLS sem politica e sem privilegio publico.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select * from public.orcamentista_familia_catalogo order by ordem;          -- esperado: PVC
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conname in ('orcamentista_tabela_familia_fkey', 'orcamentista_levantamento_item_tabela_fkey');
-- select count(*) filter (where familia is null), count(*) from public.orcamentista_tabela;     -- esperado: 2, 2
-- select count(*) filter (where tabela_id is null), count(*) from public.orcamentista_levantamento_item;
-- select obj_description('public.orcamentista_motor_formula_familia'::regclass);              -- começa com NOME VENCIDO
