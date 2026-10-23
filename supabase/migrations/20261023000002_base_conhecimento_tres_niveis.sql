-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261023000002 — Atendimentos I.A.: a base de conhecimento em TRÊS NÍVEIS
-- matéria-prima → categoria → N fornecedores
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTADO: NÃO APLICADA por quem a escreveu. Quem aplica é o dono do produto.
--
-- ORDEM: aplicar DEPOIS de `20261023000001_funcoes_da_base_de_conhecimento`. Só DDL: nenhuma
-- função aqui — as funções que gravam neste modelo vêm na próxima migração.
--
-- ══ ATENÇÃO À ORDEM COM O CÓDIGO — o item I muda um domínio que o código ainda usa ══
-- `frete_base` e `instalacao_base` deixam de aceitar 'VALOR_DE_VENDA' e passam a aceitar
-- 'VALOR_POS_DESCONTO'. Em 23/10/2026 o código ainda oferece e valida 'VALOR_DE_VENDA'
-- (`src/lib/atendimentos-ia/base-de-conhecimento.ts` e a tela, em
-- `src/page-parts/atendimentos-ia/base-de-conhecimento/formulario.ts`). Aplicada antes da troca no
-- código, esta migração faz o salvar de um adicional PERCENTUAL com base "Valor de venda" voltar
-- 400 ("Um valor não passou numa regra do banco."). A troca do código entra junto ou antes.
--
-- ══ DECISÕES DO DONO DO PRODUTO (23/10/2026) — premissa, não sugestão ══
--   1. Três níveis: matéria-prima → categoria → N fornecedores. O alumínio é espelho do PVC: as
--      mesmas 6 categorias, outros fornecedores, outras respostas.
--   2. Categorias fixas e numeradas, nesta ordem: 1 PERFIL, 2 REFORCO, 3 FERRAGENS,
--      4 ACESSORIOS_VEDACAO, 5 VIDRO, 6 INSTALACAO.
--   3. Uma categoria pode ter 3, 5 ou 10 fornecedores. O fornecedor selecionado é o que determina
--      o valor. Um é `principal` (o padrão), e só um.
--   4. Vidro, ferragem e instalação são UMA LINHA POR COISA QUE SE COMPRA, não campos. Cada
--      ferragem tem o seu código: interna e externa são duas linhas.
--   5. NULL e false não colapsam. Nenhuma coluna de configuração tem DEFAULT.
--
-- Decididas na conversa que escreveu este arquivo, depois de perguntadas:
--   - NÃO HÁ HERANÇA neste modelo. `orcamentista_mp_categoria.config` NULL e
--     `orcamentista_mp_instalacao.usa` NULL significam "ainda não configurado" — como em
--     `orcamentista_base_conhecimento` —, e não leem padrão de lugar nenhum. `false` continua
--     sendo decisão ("esta casa não usa"), e os dois estados continuam distinguíveis
--     (`ausente-vs-falso.md`).
--   - A CATEGORIA É TRAVADA NO SCHEMA. Um vidro não pode pendurar na categoria PERFIL: vidro,
--     ferragem e instalação carregam `categoria_chave` com CHECK fixo ('VIDRO', 'FERRAGENS',
--     'INSTALACAO'), e a FK composta para `orcamentista_mp_categoria` inclui a categoria. Um CHECK
--     não lê outra tabela; a FK composta, sim.
--   - ACESSO só de super admin: as quatro políticas de `public.is_super_admin()` por tabela, no
--     formato exato de `20261022000004` (que não tem política de leitura por tenant). REVOKE ALL
--     de PUBLIC, anon e authenticated, e NENHUM GRANT: o acesso é só por rota, com service_role.
--     As duas tabelas de catálogo não têm tenant, e recebem as mesmas quatro políticas.
--
-- ══ O QUE O SCHEMA NÃO IMPEDE — fica com as funções da próxima migração ══
--   - "um principal SÓ" é garantido pelo índice único parcial; "pelo menos um principal" não é —
--     uma categoria com fornecedores e nenhum principal é aceita pelo banco.
--   - `orcamentista_fornecedor` é catálogo DA PLATAFORMA por nicho, sem tenant: o banco não impede
--     que uma empresa escolha um fornecedor de outro nicho.
--   - `orcamentista_mp_categoria.config` é jsonb de objeto; as chaves válidas por categoria estão em
--     `orcamentista_categoria_campo`, e é a FUNÇÃO que recusa chave desconhecida — chave desconhecida
--     é erro, não campo novo.
--
-- ══ O LEGADO FICA ══
-- `orcamentista_esquadrias_base` (1 linha) e `orcamentista_esquadrias_padrao` (0 linhas) ficam
-- INTACTAS — nenhum DROP, DELETE ou UPDATE de dado. Só ganham o COMMENT de legado. A verificação (8)
-- aborta se qualquer uma das duas perder ou ganhar coluna.
--
-- ══ A VERIFICAÇÃO (9) depende do search_path de quem aplica ══
-- Ela compara a expressão RENDERIZADA da política (`is_super_admin()`, sem prefixo — conferido em
-- produção nas tabelas da 20261022000004). Com outro search_path a renderização muda e ela aborta.
-- O modo de falha é seguro: aborta em vez de passar errado.
--
-- NOMES: toda constraint e todo índice têm nome escrito aqui, com no máximo 63 caracteres — nome
-- gerado pelo Postgres é truncado em silêncio e já quebrou verificação por nome.
--
-- IDEMPOTENTE: CREATE TABLE/INDEX IF NOT EXISTS; sementes com ON CONFLICT DO NOTHING; os dois
-- CHECKs do item I e as políticas são recriados (DROP IF EXISTS + ADD/CREATE); COMMENT e REVOKE
-- repetem sem efeito. Rodar duas vezes deixa o mesmo estado.
--
-- COMO APLICAR (`migration-delivery.md`)
--   - pelo conector: tire o BEGIN e o COMMIT e registre o `name` como o nome COMPLETO deste arquivo,
--     sem a extensão: `20261023000002_base_conhecimento_tres_niveis`. Publique o md5 do arquivo E o
--     do payload, com a transformação nomeada entre eles (`transformacao-quebra-a-cadeia-de-hash.md`);
--   - pelo SQL Editor: como está.
--   - DEPOIS: `NOTIFY pgrst, 'reload schema';`.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. PRÉ-CONDIÇÕES — aborta antes de criar qualquer coisa ────────────────────────────────
DO $$
DECLARE
  v_n int;
BEGIN
  IF to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'public.is_super_admin() não existe: as políticas dependem dela.';
  END IF;
  IF to_regclass('public.tenants') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'public.tenants ou public.users não existe: as FKs dependem das duas.';
  END IF;
  IF to_regclass('public.orcamentista_fornecedor') IS NULL THEN
    RAISE EXCEPTION 'public.orcamentista_fornecedor não existe: o fornecedor da categoria vem do catálogo da plataforma.';
  END IF;
  IF to_regclass('public.orcamentista_base_conhecimento') IS NULL THEN
    RAISE EXCEPTION 'public.orcamentista_base_conhecimento não existe: aplique 20261022000004 antes desta.';
  END IF;
  -- o item I troca o domínio da base; uma linha gravada com a base antiga NÃO é migrada em
  -- silêncio — 'VALOR_DE_VENDA' é justamente a ambiguidade que o dono do produto resolveu
  SELECT count(*) INTO v_n FROM public.orcamentista_base_conhecimento
   WHERE (frete_base IS NOT NULL AND frete_base NOT IN ('VALOR_POS_DESCONTO', 'CUSTO_DO_FRETE'))
      OR (instalacao_base IS NOT NULL AND instalacao_base NOT IN ('VALOR_POS_DESCONTO', 'CUSTO_DA_INSTALACAO'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'orcamentista_base_conhecimento tem % linha(s) com base fora do domínio novo: decida o que cada uma vira antes de aplicar.', v_n;
  END IF;
END
$$;

-- ── A. orcamentista_categoria_catalogo — as 6 categorias, da plataforma ────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_categoria_catalogo (
  chave   text NOT NULL,
  ordem   int  NOT NULL,
  rotulo  text NOT NULL,
  CONSTRAINT orcamentista_categoria_catalogo_pkey      PRIMARY KEY (chave),
  CONSTRAINT orcamentista_categoria_catalogo_ordem_key UNIQUE (ordem)
);

INSERT INTO public.orcamentista_categoria_catalogo (chave, ordem, rotulo) VALUES
  ('PERFIL',             1, 'Perfil'),
  ('REFORCO',            2, 'Reforço de aço'),
  ('FERRAGENS',          3, 'Ferragens'),
  ('ACESSORIOS_VEDACAO', 4, 'Acessórios e vedação'),
  ('VIDRO',              5, 'Vidro'),
  ('INSTALACAO',         6, 'Instalação')
ON CONFLICT (chave) DO NOTHING;

-- ── B. orcamentista_categoria_campo — o catálogo de chaves que as funções validam ──────────
CREATE TABLE IF NOT EXISTS public.orcamentista_categoria_campo (
  categoria_chave text NOT NULL,
  chave           text NOT NULL,
  tipo            text NOT NULL,
  rotulo          text NOT NULL,
  ordem           int  NOT NULL,
  CONSTRAINT orcamentista_categoria_campo_pkey         PRIMARY KEY (categoria_chave, chave),
  CONSTRAINT orcamentista_categoria_campo_categoria_fk FOREIGN KEY (categoria_chave)
    REFERENCES public.orcamentista_categoria_catalogo (chave),
  CONSTRAINT orcamentista_categoria_campo_tipo_valido  CHECK (tipo IN ('texto', 'inteiro', 'numero', 'booleano', 'lista_texto', 'mapa'))
);

-- FERRAGENS, VIDRO e INSTALACAO não têm campo escalar: vivem nas tabelas F, G e H.
INSERT INTO public.orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem) VALUES
  ('PERFIL',             'linha',               'texto',       'Linha',                       1),
  ('PERFIL',             'cor_predominante',    'texto',       'Cor predominante',            2),
  ('PERFIL',             'cores',               'lista_texto', 'Cores que trabalha',          3),
  ('PERFIL',             'barra_mm',            'inteiro',     'Barra (mm)',                  4),
  ('PERFIL',             'serra_mm',            'inteiro',     'Serra (mm)',                  5),
  ('PERFIL',             'solda',               'texto',       'Solda',                       6),
  ('REFORCO',            'usa',                 'booleano',    'Usa reforço',                 1),
  ('REFORCO',            'material',            'texto',       'Material',                    2),
  ('REFORCO',            'par_inox_referencia', 'texto',       'Referência do par em inox',   3),
  ('ACESSORIOS_VEDACAO', 'cor_por_perfil',      'mapa',        'Cor do acessório por cor de perfil', 1),
  ('ACESSORIOS_VEDACAO', 'modelo_interlock',    'texto',       'Modelo do interlock',         2),
  ('ACESSORIOS_VEDACAO', 'vedacao',             'texto',       'Vedação',                     3)
ON CONFLICT (categoria_chave, chave) DO NOTHING;

-- ── C. orcamentista_materia_prima — da empresa ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_materia_prima (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  nome           text        NOT NULL,
  ordem          int         NOT NULL,
  atualizado_por uuid,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_materia_prima_pkey              PRIMARY KEY (id),
  CONSTRAINT orcamentista_materia_prima_tenant_fk         FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_materia_prima_atualizado_por_fk FOREIGN KEY (atualizado_por)
    REFERENCES public.users (id) ON DELETE SET NULL,
  -- alvo da FK composta de D: a categoria e a matéria-prima são da MESMA empresa
  CONSTRAINT orcamentista_materia_prima_id_tenant_key     UNIQUE (id, tenant_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_materia_prima_tenant_nome_idx
  ON public.orcamentista_materia_prima (tenant_id, lower(nome));

-- ── D. orcamentista_mp_categoria — a categoria dentro de uma matéria-prima ─────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_mp_categoria (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  materia_prima_id uuid        NOT NULL,
  categoria_chave  text        NOT NULL,
  config           jsonb,      -- NULL = ainda não configurado. SEM DEFAULT.
  atualizado_por   uuid,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_mp_categoria_pkey              PRIMARY KEY (id),
  CONSTRAINT orcamentista_mp_categoria_tenant_fk         FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_categoria_categoria_fk      FOREIGN KEY (categoria_chave)
    REFERENCES public.orcamentista_categoria_catalogo (chave),
  CONSTRAINT orcamentista_mp_categoria_atualizado_por_fk FOREIGN KEY (atualizado_por)
    REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT orcamentista_mp_categoria_materia_prima_fk  FOREIGN KEY (materia_prima_id, tenant_id)
    REFERENCES public.orcamentista_materia_prima (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_categoria_mp_categoria_key  UNIQUE (materia_prima_id, categoria_chave),
  -- alvo da FK composta de E
  CONSTRAINT orcamentista_mp_categoria_id_tenant_key     UNIQUE (id, tenant_id),
  -- alvo da FK composta de F, G e H: a linha só pendura na categoria DELA
  CONSTRAINT orcamentista_mp_categoria_id_tenant_categoria_key UNIQUE (id, tenant_id, categoria_chave),
  CONSTRAINT orcamentista_mp_categoria_config_objeto     CHECK (config IS NULL OR jsonb_typeof(config) = 'object')
);

-- ── E. orcamentista_mp_categoria_fornecedor — os N fornecedores de uma categoria ───────────
CREATE TABLE IF NOT EXISTS public.orcamentista_mp_categoria_fornecedor (
  id              uuid    NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid    NOT NULL,
  mp_categoria_id uuid    NOT NULL,
  fornecedor_id   uuid    NOT NULL,
  -- estrutural, não configuração: o DEFAULT false aqui é o correto
  principal       boolean NOT NULL DEFAULT false,
  ordem           int     NOT NULL,
  CONSTRAINT orcamentista_mp_categoria_fornecedor_pkey            PRIMARY KEY (id),
  CONSTRAINT orcamentista_mp_categoria_fornecedor_tenant_fk       FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_categoria_fornecedor_fornecedor_fk   FOREIGN KEY (fornecedor_id)
    REFERENCES public.orcamentista_fornecedor (id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_mp_categoria_fornecedor_mp_categoria_fk FOREIGN KEY (mp_categoria_id, tenant_id)
    REFERENCES public.orcamentista_mp_categoria (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_categoria_fornecedor_unico_key       UNIQUE (mp_categoria_id, fornecedor_id)
);
-- um principal SÓ por categoria
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_mp_categoria_fornecedor_um_principal
  ON public.orcamentista_mp_categoria_fornecedor (mp_categoria_id) WHERE principal;

-- ── F. orcamentista_mp_vidro — uma linha por vidro que se compra ───────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_mp_vidro (
  id              uuid   NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid   NOT NULL,
  mp_categoria_id uuid   NOT NULL,
  categoria_chave text   NOT NULL,
  descricao       text   NOT NULL,   -- 'Incolor 4 mm comum'
  referencia      text,
  onde_predomina  text[],            -- {'JVC','MAX'}
  ordem           int    NOT NULL,
  CONSTRAINT orcamentista_mp_vidro_pkey            PRIMARY KEY (id),
  CONSTRAINT orcamentista_mp_vidro_tenant_fk       FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_vidro_categoria_vidro CHECK (categoria_chave = 'VIDRO'),
  CONSTRAINT orcamentista_mp_vidro_mp_categoria_fk FOREIGN KEY (mp_categoria_id, tenant_id, categoria_chave)
    REFERENCES public.orcamentista_mp_categoria (id, tenant_id, categoria_chave) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_mp_vidro_descricao_idx
  ON public.orcamentista_mp_vidro (mp_categoria_id, lower(descricao));

-- ── G. orcamentista_mp_ferragem — uma linha por ferragem: cada uma com o seu código ────────
CREATE TABLE IF NOT EXISTS public.orcamentista_mp_ferragem (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  mp_categoria_id     uuid NOT NULL,
  categoria_chave     text NOT NULL,
  tipologia           text NOT NULL,  -- 'JVC'
  posicao             text,
  referencia          text NOT NULL,  -- cada ferragem tem o seu código
  descricao           text,
  cor                 text,
  par_inox_referencia text,           -- o par em inox, quando existir
  ordem               int  NOT NULL,
  CONSTRAINT orcamentista_mp_ferragem_pkey                PRIMARY KEY (id),
  CONSTRAINT orcamentista_mp_ferragem_tenant_fk           FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_ferragem_categoria_ferragens CHECK (categoria_chave = 'FERRAGENS'),
  CONSTRAINT orcamentista_mp_ferragem_posicao_valida      CHECK (posicao IS NULL OR posicao IN ('INTERNA', 'EXTERNA')),
  CONSTRAINT orcamentista_mp_ferragem_mp_categoria_fk     FOREIGN KEY (mp_categoria_id, tenant_id, categoria_chave)
    REFERENCES public.orcamentista_mp_categoria (id, tenant_id, categoria_chave) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_ferragem_referencia_key      UNIQUE (mp_categoria_id, referencia)
);

-- ── H. orcamentista_mp_instalacao — arremate interno, arremate externo, contramarco ────────
CREATE TABLE IF NOT EXISTS public.orcamentista_mp_instalacao (
  id              uuid    NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid    NOT NULL,
  mp_categoria_id uuid    NOT NULL,
  categoria_chave text    NOT NULL,
  produto         text    NOT NULL,
  usa             boolean,           -- NULL = ainda não informado, false = decisão. SEM DEFAULT.
  referencia      text,
  descricao       text,
  medida          text,
  folga_x         int,
  folga_y         int,
  CONSTRAINT orcamentista_mp_instalacao_pkey                 PRIMARY KEY (id),
  CONSTRAINT orcamentista_mp_instalacao_tenant_fk            FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_instalacao_categoria_instalacao CHECK (categoria_chave = 'INSTALACAO'),
  CONSTRAINT orcamentista_mp_instalacao_produto_valido       CHECK (produto IN ('ARREMATE_INTERNO', 'ARREMATE_EXTERNO', 'CONTRAMARCO')),
  -- disse que usa, então diz qual
  CONSTRAINT orcamentista_mp_instalacao_usa_com_referencia   CHECK (usa IS NOT TRUE OR referencia IS NOT NULL),
  CONSTRAINT orcamentista_mp_instalacao_mp_categoria_fk      FOREIGN KEY (mp_categoria_id, tenant_id, categoria_chave)
    REFERENCES public.orcamentista_mp_categoria (id, tenant_id, categoria_chave) ON DELETE CASCADE,
  CONSTRAINT orcamentista_mp_instalacao_produto_key          UNIQUE (mp_categoria_id, produto)
);

-- ── I. orcamentista_base_conhecimento — a base do percentual do adicional ──────────────────
-- 'VALOR_DE_VENDA' era a ambiguidade: o percentual é abatido sobre o valor RECALCULADO pós-desconto.
-- Só os dois CHECKs de base mudam; *_coerente e *_modo_valido ficam como estão.
ALTER TABLE public.orcamentista_base_conhecimento
  DROP CONSTRAINT IF EXISTS orcamentista_base_conhecimento_frete_base_valida;
ALTER TABLE public.orcamentista_base_conhecimento
  ADD CONSTRAINT orcamentista_base_conhecimento_frete_base_valida
  CHECK (frete_base IS NULL OR frete_base IN ('VALOR_POS_DESCONTO', 'CUSTO_DO_FRETE'));
ALTER TABLE public.orcamentista_base_conhecimento
  DROP CONSTRAINT IF EXISTS orcamentista_base_conhecimento_instalacao_base_valida;
ALTER TABLE public.orcamentista_base_conhecimento
  ADD CONSTRAINT orcamentista_base_conhecimento_instalacao_base_valida
  CHECK (instalacao_base IS NULL OR instalacao_base IN ('VALOR_POS_DESCONTO', 'CUSTO_DA_INSTALACAO'));

-- ── COMENTÁRIOS ────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.orcamentista_base_conhecimento IS
  'adicional é sempre calculado POR FORA do orçamento das esquadrias; em PERCENTUAL permanece percentual na decomposição, abatido sobre o valor recalculado pós-desconto';
COMMENT ON TABLE public.orcamentista_esquadrias_base IS
  'legado: substituída pelo modelo de três níveis em 20261023000002';
COMMENT ON TABLE public.orcamentista_esquadrias_padrao IS
  'legado: substituída pelo modelo de três níveis em 20261023000002';
COMMENT ON TABLE public.orcamentista_categoria_catalogo IS
  'As 6 categorias de uma matéria-prima, fixas e numeradas: 1 PERFIL, 2 REFORCO, 3 FERRAGENS, 4 ACESSORIOS_VEDACAO, 5 VIDRO, 6 INSTALACAO. Da plataforma, sem tenant.';
COMMENT ON TABLE public.orcamentista_categoria_campo IS
  'As chaves válidas de orcamentista_mp_categoria.config, por categoria. Chave fora daqui é erro, não campo novo. FERRAGENS, VIDRO e INSTALACAO não têm campo escalar: vivem em orcamentista_mp_ferragem, _vidro e _instalacao.';
COMMENT ON TABLE public.orcamentista_materia_prima IS
  'O primeiro nível: a matéria-prima da empresa (PVC, alumínio...). Cada uma tem as mesmas 6 categorias, com outros fornecedores e outras respostas.';
COMMENT ON TABLE public.orcamentista_mp_categoria IS
  'O segundo nível: uma categoria dentro de uma matéria-prima. config NULL = ainda não configurado; não há herança neste modelo.';
COMMENT ON TABLE public.orcamentista_mp_categoria_fornecedor IS
  'O terceiro nível: os N fornecedores de uma categoria. O selecionado determina o valor; um é principal (o padrão), e só um.';
COMMENT ON TABLE public.orcamentista_mp_vidro IS
  'Uma linha por vidro que se compra. Só pendura em categoria VIDRO (FK composta com categoria_chave).';
COMMENT ON TABLE public.orcamentista_mp_ferragem IS
  'Uma linha por ferragem: cada uma tem o seu código, e interna e externa são duas linhas. Só pendura em categoria FERRAGENS.';
COMMENT ON TABLE public.orcamentista_mp_instalacao IS
  'Uma linha por produto de instalação. usa NULL = ainda não informado, false = decisão. Só pendura em categoria INSTALACAO.';

-- ── RLS — quatro políticas de is_super_admin() por tabela; REVOKE ALL, e NENHUM GRANT ──────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orcamentista_categoria_catalogo', 'orcamentista_categoria_campo', 'orcamentista_materia_prima',
    'orcamentista_mp_categoria', 'orcamentista_mp_categoria_fornecedor', 'orcamentista_mp_vidro',
    'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_super_admin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_super_admin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_super_admin', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_super_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_super_admin())', t || '_select_super_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.is_super_admin())', t || '_insert_super_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())', t || '_update_super_admin', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_super_admin())', t || '_delete_super_admin', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END
$$;

-- ── VERIFICAÇÃO — aborta a transação se algo não ficou como deve ───────────────────────────
DO $$
DECLARE
  v_tabelas text[] := ARRAY[
    'orcamentista_categoria_catalogo', 'orcamentista_categoria_campo', 'orcamentista_materia_prima',
    'orcamentista_mp_categoria', 'orcamentista_mp_categoria_fornecedor', 'orcamentista_mp_vidro',
    'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao'
  ];
  -- nome da FK | tabela de origem | colunas de origem | tabela de destino | colunas de destino
  v_fks text[] := ARRAY[
    'orcamentista_mp_categoria_materia_prima_fk|orcamentista_mp_categoria|materia_prima_id,tenant_id|orcamentista_materia_prima|id,tenant_id',
    'orcamentista_mp_categoria_fornecedor_mp_categoria_fk|orcamentista_mp_categoria_fornecedor|mp_categoria_id,tenant_id|orcamentista_mp_categoria|id,tenant_id',
    'orcamentista_mp_vidro_mp_categoria_fk|orcamentista_mp_vidro|mp_categoria_id,tenant_id,categoria_chave|orcamentista_mp_categoria|id,tenant_id,categoria_chave',
    'orcamentista_mp_ferragem_mp_categoria_fk|orcamentista_mp_ferragem|mp_categoria_id,tenant_id,categoria_chave|orcamentista_mp_categoria|id,tenant_id,categoria_chave',
    'orcamentista_mp_instalacao_mp_categoria_fk|orcamentista_mp_instalacao|mp_categoria_id,tenant_id,categoria_chave|orcamentista_mp_categoria|id,tenant_id,categoria_chave'
  ];
  v_travas text[] := ARRAY[
    'orcamentista_mp_vidro_categoria_vidro|VIDRO',
    'orcamentista_mp_ferragem_categoria_ferragens|FERRAGENS',
    'orcamentista_mp_instalacao_categoria_instalacao|INSTALACAO'
  ];
  v_n     int;
  v_x     text;
  v_p     text[];
  v_ordem int[];
  v_chave text[];
BEGIN
  -- (1) as 8 tabelas existem, todas com RLS ligada
  SELECT count(*) INTO v_n FROM pg_class
   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
     AND relname = ANY (v_tabelas) AND relrowsecurity;
  IF v_n <> 8 THEN RAISE EXCEPTION 'verificacao (1): esperadas 8 tabelas com RLS ligada, ha %.', v_n; END IF;

  -- (2) anon e authenticated sem privilégio nenhum — perguntado ao catálogo por papel
  SELECT count(*) INTO v_n
    FROM unnest(v_tabelas) t(nome), unnest(ARRAY['anon', 'authenticated']) r(papel)
   WHERE has_table_privilege(r.papel, format('public.%I', t.nome), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  IF v_n <> 0 THEN RAISE EXCEPTION 'verificacao (2): % par(es) tabela/papel com privilegio de anon ou authenticated.', v_n; END IF;

  -- (3) o catálogo tem exatamente as 6 categorias, ordem 1..6 sem buraco, na ordem decidida
  SELECT count(*), array_agg(ordem ORDER BY ordem), array_agg(chave ORDER BY ordem)
    INTO v_n, v_ordem, v_chave
    FROM public.orcamentista_categoria_catalogo;
  IF v_n <> 6 OR v_ordem <> ARRAY[1, 2, 3, 4, 5, 6]
     OR v_chave <> ARRAY['PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO'] THEN
    RAISE EXCEPTION 'verificacao (3): o catalogo de categorias nao e o decidido: % linha(s), ordem %, chaves %.', v_n, v_ordem, v_chave;
  END IF;

  -- (4) nenhuma chave de campo órfã de categoria — e as 12 sementes
  SELECT count(*) INTO v_n FROM public.orcamentista_categoria_campo c
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo k WHERE k.chave = c.categoria_chave);
  IF v_n <> 0 THEN RAISE EXCEPTION 'verificacao (4): % campo(s) com categoria inexistente.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.orcamentista_categoria_campo;
  IF v_n <> 12 THEN RAISE EXCEPTION 'verificacao (4): esperados 12 campos semeados, ha %.', v_n; END IF;

  -- (5) NULL ≠ false: config e usa são nuláveis e SEM default
  SELECT count(*) INTO v_n
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('orcamentista_mp_categoria', 'orcamentista_mp_vidro', 'orcamentista_mp_ferragem', 'orcamentista_mp_instalacao')
     AND a.attname IN ('config', 'usa') AND a.attnum > 0 AND NOT a.attisdropped
     AND (a.atthasdef OR a.attnotnull);
  IF v_n <> 0 THEN RAISE EXCEPTION 'verificacao (5): % coluna(s) config/usa com default ou NOT NULL.', v_n; END IF;

  -- (6) o índice único parcial de principal: único, com predicado, sobre mp_categoria_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
     WHERE x.relname = 'orcamentista_mp_categoria_fornecedor_um_principal'
       AND i.indrelid = 'public.orcamentista_mp_categoria_fornecedor'::regclass
       AND i.indisunique AND i.indpred IS NOT NULL
       AND pg_get_expr(i.indpred, i.indrelid) = 'principal'
       AND (SELECT array_agg(a.attname::text ORDER BY u.o) FROM unnest(i.indkey::int2[]) WITH ORDINALITY u(n, o)
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = u.n) = ARRAY['mp_categoria_id']
  ) THEN
    RAISE EXCEPTION 'verificacao (6): o indice unico parcial orcamentista_mp_categoria_fornecedor_um_principal nao existe como deve.';
  END IF;

  -- (7) as 5 FKs compostas: colunas de origem, destino, e o UNIQUE certo do destino
  FOREACH v_x IN ARRAY v_fks LOOP
    v_p := string_to_array(v_x, '|');
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint k
        JOIN pg_class o ON o.oid = k.conrelid
        JOIN pg_class d ON d.oid = k.confrelid
       WHERE k.contype = 'f' AND k.conname = v_p[1]
         AND o.relnamespace = 'public'::regnamespace AND o.relname = v_p[2]
         AND d.relnamespace = 'public'::regnamespace AND d.relname = v_p[4]
         AND (SELECT string_agg(a.attname::text, ',' ORDER BY u.o) FROM unnest(k.conkey) WITH ORDINALITY u(n, o)
                JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.n) = v_p[3]
         AND (SELECT string_agg(a.attname::text, ',' ORDER BY u.o) FROM unnest(k.confkey) WITH ORDINALITY u(n, o)
                JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = u.n) = v_p[5]
         -- o índice que a FK usa é um UNIQUE com EXATAMENTE as colunas de destino
         AND EXISTS (
           SELECT 1 FROM pg_index i
            WHERE i.indexrelid = k.conindid AND i.indisunique AND i.indpred IS NULL
              AND (SELECT string_agg(a.attname::text, ',' ORDER BY u.o) FROM unnest(i.indkey::int2[]) WITH ORDINALITY u(n, o)
                     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = u.n) = v_p[5])
    ) THEN
      RAISE EXCEPTION 'verificacao (7): FK % nao e (%) -> %(%) sobre o UNIQUE certo.', v_p[1], v_p[3], v_p[4], v_p[5];
    END IF;
  END LOOP;

  -- (8) o legado continua existindo, com as mesmas 30 colunas cada
  FOREACH v_x IN ARRAY ARRAY['orcamentista_esquadrias_base', 'orcamentista_esquadrias_padrao'] LOOP
    SELECT count(*) INTO v_n FROM pg_attribute
     WHERE attrelid = to_regclass('public.' || v_x) AND attnum > 0 AND NOT attisdropped;
    IF to_regclass('public.' || v_x) IS NULL OR v_n <> 30 THEN
      RAISE EXCEPTION 'verificacao (8): % deveria existir com 30 colunas; tem %.', v_x, v_n;
    END IF;
  END LOOP;

  -- (9) exatamente as 32 políticas, com o nome, o comando e is_super_admin() no lugar certo
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (v_tabelas);
  IF v_n <> 32 THEN RAISE EXCEPTION 'verificacao (9): esperadas 32 politicas, ha %.', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = ANY (v_tabelas)
     AND p.permissive = 'PERMISSIVE'
     AND (   (p.cmd = 'SELECT' AND p.policyname = p.tablename || '_select_super_admin' AND p.qual = 'is_super_admin()' AND p.with_check IS NULL)
          OR (p.cmd = 'INSERT' AND p.policyname = p.tablename || '_insert_super_admin' AND p.qual IS NULL AND p.with_check = 'is_super_admin()')
          OR (p.cmd = 'UPDATE' AND p.policyname = p.tablename || '_update_super_admin' AND p.qual = 'is_super_admin()' AND p.with_check = 'is_super_admin()')
          OR (p.cmd = 'DELETE' AND p.policyname = p.tablename || '_delete_super_admin' AND p.qual = 'is_super_admin()' AND p.with_check IS NULL));
  IF v_n <> 32 THEN RAISE EXCEPTION 'verificacao (9): % de 32 politicas com nome, comando e expressao esperados.', v_n; END IF;

  -- (10) a base do adicional: o domínio novo, e 'VALOR_DE_VENDA' fora
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_base_conhecimento_frete_base_valida'
                  AND pg_get_constraintdef(oid) LIKE '%VALOR_POS_DESCONTO%' AND pg_get_constraintdef(oid) NOT LIKE '%VALOR_DE_VENDA%')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_base_conhecimento_instalacao_base_valida'
                  AND pg_get_constraintdef(oid) LIKE '%VALOR_POS_DESCONTO%' AND pg_get_constraintdef(oid) NOT LIKE '%VALOR_DE_VENDA%') THEN
    RAISE EXCEPTION 'verificacao (10): os CHECKs de frete_base e instalacao_base nao estao com o dominio novo.';
  END IF;

  -- (11) a categoria travada: vidro, ferragem e instalação só aceitam a categoria deles
  FOREACH v_x IN ARRAY v_travas LOOP
    v_p := string_to_array(v_x, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'c' AND conname = v_p[1]
                    AND pg_get_constraintdef(oid) LIKE '%''' || v_p[2] || '''%') THEN
      RAISE EXCEPTION 'verificacao (11): o CHECK % nao trava a categoria em %.', v_p[1], v_p[2];
    END IF;
  END LOOP;
END
$$;

COMMIT;
