-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000002 — o MOTOR sobe da tabela do fornecedor para a FAMÍLIA: a planilha, as etapas e as
-- ramificações. PR A: SÓ ESTRUTURA. Nenhum leitor muda, nenhuma linha existente é tocada.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261027000002_motor_por_familia_e_etapas.
-- ║ SEM ELA O CÓDIGO NÃO QUEBRA: este PR não tem leitor nem escritor novo. Quem lê estas estruturas
-- ║ são os PRs seguintes (B em diante), e eles pressupõem esta migração.
-- ║ O corpo da migração é ASCII nas partes que executam; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisões do dono do produto, 27/10/2026.
--   1. O MOTOR É DO PAR (FAMÍLIA, FORNECEDOR DE PERFIL). O Motor_Wolf_PVC é engenharia da Wolff, não "o motor
--      do PVC": duas empresas com fornecedores de perfil diferentes têm motores de PVC diferentes. A família da
--      conta acha o seu motor pelo fornecedor da ramificação Perfis que ela vinculou, e a VIGÊNCIA decide qual
--      vale quando há mais de um — o mesmo padrão do #177.
--   2. ETAPA E PLANILHA SÃO COISAS SEPARADAS (caminho A2). A PLANILHA é a fonte de dados, importada UMA vez. A
--      ETAPA é o que o consultor cadastra por família: número, rótulo LIVRE, AÇÃO de uma lista FECHADA, texto
--      de instrução e quais abas ela carrega. Várias etapas leem a mesma planilha. O Motor_Wolf_PVC não pertence
--      a uma etapa: o apanhado carrega a Detalhe e as Variáveis; a relação de barras carrega tudo.
--      O rótulo é livre; a ação não é — etapa sem ação da lista é erro, não etapa nova.
--   3. EXCLUIR É ARQUIVAR. Motor com conteúdo se arquiva: sai da lista e da conversa, o dado fica. DELETE só com
--      autorização explícita do dono do produto, e recusado enquanto houver levantamento ou tempo pendurado.
--      (CORREÇÃO de 27/10/2026, à noite: este comentário dizia que os 164 tempos ESTIMADO foram digitados à mão e não estão no
--      arquivo. Medido: eles têm só TRÊS valores — 600 min em 91 tipologias, 300 em 55, 900 em 18 —, `atualizado_por` nulo e o mesmo
--      `atualizado_em`: foram preenchidos por regra, de uma vez. Não há trabalho manual a preservar. O RESTRICT fica pelo mesmo motivo
--      de sempre: são 62.299 linhas do motor, com ou sem o argumento dos tempos.) Por isso `motor_id` é ON DELETE RESTRICT
--      em TODAS as tabelas, e não CASCADE como o `tabela_id`.
--   4. A OPÇÃO 1 PARA A CHAVE: afrouxar. `tabela_id` deixa de ser obrigatório nas 14 tabelas; a Detalhe e os tempos
--      ganham a coluna `id` como chave primária nova, e a unicidade `(tabela_id, tipologia)` continua como UNIQUE.
--      Uma CHECK garante que cada linha tem UM dono: `tabela_id` ou `motor_id`, nunca os dois, nunca nenhum.
--
-- REGISTRO — a Detalhe sem `id` foi a causa do bug do #165: o leitor ordenava por uma coluna que a tabela não
-- tinha, e isso parou o cálculo em produção. Esta migração dá `id` à Detalhe e aos tempos, e fecha essa porta.
--
-- REGISTRO — descontos. O dono do produto falou em "motor de fórmulas e descontos". Medido em 27/10/2026 na tabela
-- da Wolff: `valor_barra_12` e `valor_barra_interno` NÃO são desconto, são o preço com alíquota de ICMS diferente
-- (12% interestadual e a alíquota interna, `aliquota_interna_pct` = 17% ou 18%). A razão entre as duas colunas tem
-- 9 valores distintos e acompanha o IPI (1,1401 sem IPI, 1,1807 com 6,5%). É regra de imposto do fornecedor e fica
-- com a TABELA DE PREÇO. Desconto não está no motor, e nada aqui o cria.
--
-- REGISTRO — dívida. Acessórios e Borrachas continuam juntas, na ramificação ACESSORIOS_VEDACAO. Motivo medido: o
-- motor tem só três segmentos (Perfil PVC, Reforço, Acessórios) e a vedação está dentro de Acessórios. Separar na
-- tela enquanto o motor não separa criaria uma ramificação que o cálculo não sabe alimentar. Separa quando o motor
-- separar.
--
-- O QUE FAZ, nesta ordem, numa transação:
--   A. `orcamentista_motor`: a PLANILHA. Família + fornecedor de perfil (as duas FK RESTRICT), o arquivo, `vigente`
--      (no máximo UMA vigente por par, índice único parcial) e `arquivado_em` (arquivar = sair da lista e da conversa).
--   B. `orcamentista_familia_etapa`: a ETAPA. Número único por família, rótulo livre, ação da lista fechada (CHECK),
--      instrução até 4.000 caracteres e as abas que carrega (CHECK contra a lista de abas da planilha).
--   C. `orcamentista_familia_ramificacao`: as ramificações que cada família declara. PVC entra com TODAS as
--      categorias do catálogo (as 7 que a De Paula já tem configuradas). Nada que está gravado numa conta é tocado.
--   D. `motor_id` nas 14 tabelas que pendem de `tabela_id`: FK RESTRICT, `tabela_id` opcional, CHECK de um dono só,
--      e os índices únicos PARCIAIS que repetem, para o motor, a unicidade que a tabela já tem.
--   E. A chave primária nova da Detalhe e dos tempos.
--   F. `orcamentista_materia_prima.familia`: a matéria-prima passa a ser a família. FK para o catálogo, opcional,
--      e uma família por conta. O NOME livre FICA no banco, sem uso e sem DROP.
--   G. `orcamentista_levantamento_item.motor_id`: o histórico aponta o motor que calculou. RESTRICT.
--   H. RLS e REVOKE nas três tabelas novas, no formato das outras (quatro políticas de is_super_admin()).
--   I. VERIFICAÇÃO (aborta): a forma de tudo isso, e que NENHUMA linha existente mudou — a contagem E o hash do
--      conteudo (md5 de cada linha, sem as colunas que esta migracao acrescenta) das 14 tabelas e das quatro
--      vizinhas, de antes e de depois, e a unicidade da Detalhe e dos tempos. So a contagem nao via uma linha
--      reescrita com o mesmo numero de linhas (medido ao mutar a migracao: um UPDATE de tipologia passava).
--
-- NÃO FAZ: não copia o motor da Wolff (PR C), não lê nada novo (PR D), não muda a importação (PR E), não apaga o
-- antigo (PR F). `orcamentista_tabela.motor_path` e `motor_nome` ficam como estão: param de ser escritos no PR E.
-- A importação `importar_conteudo_da_tabela` apaga e regrava POR `tabela_id` com lista explícita de colunas: as
-- colunas novas (`motor_id`, `id`) ficam com o default, e as linhas de planilha não são alcançadas por ela
-- (`tabela-que-a-importacao-apaga.md`).
--
-- IDEMPOTENTE: IF NOT EXISTS em cada coisa; a troca da chave primária só roda se a chave ainda for a antiga.
-- Nenhum UPDATE, nenhum DELETE, nenhum DROP de tabela, coluna, política ou dado. A única remoção é a da chave
-- primária antiga da Detalhe e dos tempos, que o dono do produto aprovou, trocada na mesma transação por outra.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  faltando text;
BEGIN
  SELECT string_agg(t, ', ') INTO faltando
    FROM unnest(ARRAY['tenants', 'users', 'orcamentista_tabela', 'orcamentista_fornecedor', 'orcamentista_familia_catalogo',
                      'orcamentista_categoria_catalogo', 'orcamentista_materia_prima', 'orcamentista_levantamento_item',
                      'orcamentista_tabela_item']) AS t
   WHERE to_regclass('public.' || t) IS NULL;
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'dependencia ausente: %. Nada foi alterado.', faltando;
  END IF;
  IF to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.is_super_admin(). Nada foi alterado.';
  END IF;
END
$guarda$;

-- As 14 tabelas que pendem de `tabela_id` hoje, numa lista só: a estrutura e a verificação leem esta.
CREATE TEMP TABLE v_tabelas_do_motor ON COMMIT DROP AS
  SELECT nome FROM unnest(ARRAY[
    'orcamentista_importacao',
    'orcamentista_motor_baguete',
    'orcamentista_motor_formula',
    'orcamentista_motor_formula_familia',
    'orcamentista_motor_insumo',
    'orcamentista_motor_otimizacao',
    'orcamentista_motor_perfil',
    'orcamentista_motor_regra',
    'orcamentista_motor_tipologia',
    'orcamentista_motor_tipologia_detalhe',
    'orcamentista_motor_tipologia_tempo',
    'orcamentista_motor_validacao',
    'orcamentista_motor_variavel',
    'orcamentista_motor_vidro'
  ]) AS nome;

-- A unicidade de cada tabela, repetida para o motor: (tabela, nome do índice, colunas depois de motor_id).
CREATE TEMP TABLE v_unicas_do_motor ON COMMIT DROP AS
  SELECT * FROM (VALUES
    ('orcamentista_motor_baguete',                  'orcamentista_motor_baguete_ordem_motor_key',                  'tipologia, ordem'),
    ('orcamentista_motor_formula',                  'orcamentista_motor_formula_ordem_motor_key',                  'tipologia, ordem'),
    ('orcamentista_motor_formula',                  'orcamentista_motor_formula_variavel_motor_key',               'tipologia, variavel'),
    ('orcamentista_motor_insumo',                   'orcamentista_motor_insumo_ordem_motor_key',                   'tipologia, ordem'),
    ('orcamentista_motor_otimizacao',               'orcamentista_motor_otimizacao_ordem_motor_key',               'ordem'),
    ('orcamentista_motor_otimizacao',               'orcamentista_motor_otimizacao_parametro_motor_key',           'parametro'),
    ('orcamentista_motor_perfil',                   'orcamentista_motor_perfil_ordem_motor_key',                   'tipologia, ordem'),
    ('orcamentista_motor_tipologia',                'orcamentista_motor_tipologia_motor_key',                      'tipologia'),
    ('orcamentista_motor_tipologia_detalhe',        'orcamentista_motor_tipologia_detalhe_tipologia_motor_key',    'tipologia'),
    ('orcamentista_motor_tipologia_detalhe',        'orcamentista_motor_tipologia_detalhe_ordem_motor_key',        'tipologia, ordem'),
    ('orcamentista_motor_tipologia_tempo',          'orcamentista_motor_tipologia_tempo_tipologia_motor_key',      'tipologia'),
    ('orcamentista_motor_validacao',                'orcamentista_motor_validacao_ordem_motor_key',                'tipologia, ordem'),
    ('orcamentista_motor_variavel',                 'orcamentista_motor_variavel_ordem_motor_key',                 'tipologia, ordem'),
    ('orcamentista_motor_variavel',                 'orcamentista_motor_variavel_variavel_motor_key',              'tipologia, variavel'),
    ('orcamentista_motor_vidro',                    'orcamentista_motor_vidro_ordem_motor_key',                    'tipologia, ordem')
  ) AS x(tabela, indice, colunas);

-- O ANTES: quantas linhas cada tabela tem agora, e um hash do CONTEÚDO de cada linha — contagem não vê uma
-- linha que mudou de valor. O hash ignora só as colunas que esta migração acrescenta (`ignorar`); todas as outras
-- entram, inclusive o `id` das tabelas que já o têm. A verificação do fim refaz a conta e compara.
CREATE TEMP TABLE v_antes (tabela text PRIMARY KEY, linhas bigint NOT NULL, distintas bigint, ignorar text[] NOT NULL, hash text NOT NULL) ON COMMIT DROP;
DO $antes$
DECLARE
  t text;
  n bigint;
  d bigint;
  ign text[];
  h text;
BEGIN
  FOR t IN SELECT nome FROM v_tabelas_do_motor
           UNION SELECT unnest(ARRAY['orcamentista_tabela', 'orcamentista_tabela_item', 'orcamentista_levantamento_item', 'orcamentista_materia_prima']) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    -- a unicidade que vai trocar de chave: quantos pares (tabela, tipologia) distintos a Detalhe e os tempos têm
    d := NULL;
    IF t IN ('orcamentista_motor_tipologia_detalhe', 'orcamentista_motor_tipologia_tempo') THEN
      EXECUTE format('SELECT count(*) FROM (SELECT DISTINCT tabela_id, tipologia FROM public.%I) x', t) INTO d;
    END IF;
    -- as colunas NOVAS de cada uma: motor_id nas 14 (e o id da Detalhe e dos tempos), familia na matéria-prima
    ign := CASE
      WHEN t IN ('orcamentista_motor_tipologia_detalhe', 'orcamentista_motor_tipologia_tempo') THEN ARRAY['motor_id', 'id']
      WHEN t = 'orcamentista_materia_prima' THEN ARRAY['familia']
      WHEN t IN ('orcamentista_tabela', 'orcamentista_tabela_item') THEN ARRAY[]::text[]
      ELSE ARRAY['motor_id'] END;
    EXECUTE format('SELECT md5(coalesce(string_agg(x, ''|'' ORDER BY x), '''')) FROM (SELECT (to_jsonb(r) - %L::text[])::text AS x FROM public.%I r) s', ign, t) INTO h;
    INSERT INTO v_antes (tabela, linhas, distintas, ignorar, hash) VALUES (t, n, d, ign, h);
  END LOOP;
END
$antes$;

-- ── A. a PLANILHA do motor: família + fornecedor de perfil ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_motor (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  familia        text        NOT NULL,
  fornecedor_id  uuid        NOT NULL,
  arquivo_nome   text        NOT NULL,
  arquivo_path   text        NOT NULL,
  vigente        boolean     NOT NULL DEFAULT false,
  arquivado_em   timestamptz,
  arquivado_por  uuid,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por     uuid,
  CONSTRAINT orcamentista_motor_pkey                      PRIMARY KEY (id),
  CONSTRAINT orcamentista_motor_familia_fkey              FOREIGN KEY (familia) REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_motor_fornecedor_fkey           FOREIGN KEY (fornecedor_id) REFERENCES public.orcamentista_fornecedor (id) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_motor_arquivado_por_fkey        FOREIGN KEY (arquivado_por) REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT orcamentista_motor_criado_por_fkey           FOREIGN KEY (criado_por) REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT orcamentista_motor_arquivado_nao_e_vigente   CHECK (NOT (vigente AND arquivado_em IS NOT NULL)),
  CONSTRAINT orcamentista_motor_arquivo_preenchido        CHECK (btrim(arquivo_nome) <> '' AND btrim(arquivo_path) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_motor_uma_vigente ON public.orcamentista_motor (familia, fornecedor_id) WHERE vigente;
COMMENT ON TABLE public.orcamentista_motor IS
  'A PLANILHA do motor: a fonte de dados, importada uma vez por (familia, fornecedor de perfil). Nao pertence a uma etapa: varias etapas leem as abas dela. Excluir e arquivar (arquivado_em); DELETE so com autorizacao, e e recusado enquanto houver linha pendurada em motor_id.';
COMMENT ON COLUMN public.orcamentista_motor.vigente IS
  'A planilha que vale para a familia com este fornecedor de perfil. No maximo uma por (familia, fornecedor_id). Decide o que levantamento NOVO usa; o antigo aponta o seu motor em orcamentista_levantamento_item.motor_id.';

-- ── B. a ETAPA: número + rótulo livre + ação da lista fechada + instrução + abas ───────────
CREATE TABLE IF NOT EXISTS public.orcamentista_familia_etapa (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  familia        text        NOT NULL,
  numero         integer     NOT NULL,
  rotulo         text        NOT NULL,
  acao           text        NOT NULL,
  instrucao      text        NOT NULL DEFAULT '',
  abas           text[]      NOT NULL DEFAULT '{}',
  atualizado_por uuid,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_familia_etapa_pkey               PRIMARY KEY (id),
  CONSTRAINT orcamentista_familia_etapa_familia_fkey       FOREIGN KEY (familia) REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_familia_etapa_por_fkey           FOREIGN KEY (atualizado_por) REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT orcamentista_familia_etapa_numero_key         UNIQUE (familia, numero),
  CONSTRAINT orcamentista_familia_etapa_numero_positivo    CHECK (numero >= 1),
  CONSTRAINT orcamentista_familia_etapa_rotulo_forma       CHECK (rotulo = btrim(rotulo) AND char_length(rotulo) >= 1 AND char_length(rotulo) <= 60),
  CONSTRAINT orcamentista_familia_etapa_acao_da_lista      CHECK (acao = ANY (ARRAY['APANHAR', 'CONFIRMAR', 'GERAR_LEVANTAMENTO', 'CALCULAR_BARRAS', 'ENVIAR'])),
  CONSTRAINT orcamentista_familia_etapa_instrucao_ate_4000 CHECK (char_length(instrucao) <= 4000),
  CONSTRAINT orcamentista_familia_etapa_abas_da_planilha   CHECK (abas <@ ARRAY['tipologias', 'perfis', 'formulas', 'variaveis', 'vidros', 'baguetes', 'insumos', 'validacoes', 'otimizacao', 'formulas_da_linha', 'regras', 'tempos']::text[])
);
COMMENT ON TABLE public.orcamentista_familia_etapa IS
  'As ETAPAS de uma familia: numero, rotulo LIVRE, acao de uma lista FECHADA (CHECK), instrucao e as abas da planilha que ela carrega. Rotulo livre, acao nao: etapa sem acao da lista e erro, nao etapa nova.';

-- ── C. as RAMIFICAÇÕES que cada família declara ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_familia_ramificacao (
  familia         text    NOT NULL,
  categoria_chave text    NOT NULL,
  ordem           integer NOT NULL,
  CONSTRAINT orcamentista_familia_ramificacao_pkey       PRIMARY KEY (familia, categoria_chave),
  CONSTRAINT orcamentista_familia_ramificacao_familia_fkey    FOREIGN KEY (familia) REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_familia_ramificacao_categoria_fkey  FOREIGN KEY (categoria_chave) REFERENCES public.orcamentista_categoria_catalogo (chave) ON DELETE RESTRICT,
  CONSTRAINT orcamentista_familia_ramificacao_ordem_key       UNIQUE (familia, ordem),
  CONSTRAINT orcamentista_familia_ramificacao_ordem_positiva  CHECK (ordem >= 1)
);
COMMENT ON TABLE public.orcamentista_familia_ramificacao IS
  'As ramificacoes (linhas de material) que a familia declara, na ordem. O catalogo de categorias e a lista de TODAS as possiveis; cada familia declara as que usa (o aluminio nao tem reforco metalico).';
-- PVC declara todas as categorias do catálogo: as 7 que a empresa já tem configuradas. Só INSERT, e só o que falta.
INSERT INTO public.orcamentista_familia_ramificacao (familia, categoria_chave, ordem)
SELECT 'PVC', c.chave, c.ordem
  FROM public.orcamentista_categoria_catalogo c
 WHERE EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = 'PVC')
ON CONFLICT DO NOTHING;

-- ── D. `motor_id` nas 14 tabelas: um dono só, tabela do fornecedor OU planilha ──────────────
DO $estrutura$
DECLARE
  t text;
  u record;
BEGIN
  FOR t IN SELECT nome FROM v_tabelas_do_motor ORDER BY nome LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS motor_id uuid', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', t)::regclass AND conname = t || '_motor_fkey') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (motor_id) REFERENCES public.orcamentista_motor (id) ON DELETE RESTRICT', t, t || '_motor_fkey');
    END IF;
  END LOOP;

  -- ── E. a chave primária nova: a Detalhe e os tempos tinham (tabela_id, tipologia); ganham `id` ────────
  -- Uma coluna de chave primária nunca fica vazia, e o motor_id precisa de linhas sem tabela_id. A unicidade
  -- (tabela_id, tipologia) continua, como UNIQUE.
  FOREACH t IN ARRAY ARRAY['orcamentista_motor_tipologia_detalhe', 'orcamentista_motor_tipologia_tempo'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid()', t);
    IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = format('public.%I', t)::regclass AND contype = 'p')
         = 'PRIMARY KEY (tabela_id, tipologia)' THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, t || '_pkey');
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id)', t, t || '_pkey');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', t)::regclass AND conname = t || '_tabela_tipologia_key') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (tabela_id, tipologia)', t, t || '_tabela_tipologia_key');
    END IF;
  END LOOP;

  FOR t IN SELECT nome FROM v_tabelas_do_motor ORDER BY nome LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tabela_id DROP NOT NULL', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', t)::regclass AND conname = t || '_um_dono') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (num_nonnulls(tabela_id, motor_id) = 1)', t, t || '_um_dono');
    END IF;
    EXECUTE format('COMMENT ON COLUMN public.%I.motor_id IS %L', t,
      'A planilha (orcamentista_motor) dona desta linha. Cada linha tem UM dono: tabela_id (a tabela do fornecedor) OU motor_id, nunca os dois. ON DELETE RESTRICT: excluir motor e arquivar.');
  END LOOP;

  -- a unicidade de cada tabela, repetida para a planilha (parcial: só as linhas que têm motor_id)
  FOR u IN SELECT * FROM v_unicas_do_motor LOOP
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (motor_id, %s) WHERE motor_id IS NOT NULL', u.indice, u.tabela, u.colunas);
  END LOOP;
END
$estrutura$;
-- os índices de leitura das três tabelas que não têm unicidade
CREATE INDEX IF NOT EXISTS orcamentista_motor_regra_codigo_motor_idx ON public.orcamentista_motor_regra (motor_id, codigo) WHERE motor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orcamentista_motor_formula_familia_motor_idx ON public.orcamentista_motor_formula_familia (motor_id, linha) WHERE motor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orcamentista_importacao_motor_idx ON public.orcamentista_importacao (motor_id, importado_em DESC) WHERE motor_id IS NOT NULL;

-- ── F. a matéria-prima passa a ser a FAMÍLIA ────────────────────────────────────────────────
ALTER TABLE public.orcamentista_materia_prima ADD COLUMN IF NOT EXISTS familia text;
DO $familia_da_materia_prima$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_materia_prima'::regclass AND conname = 'orcamentista_materia_prima_familia_fkey') THEN
    ALTER TABLE public.orcamentista_materia_prima
      ADD CONSTRAINT orcamentista_materia_prima_familia_fkey FOREIGN KEY (familia) REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE RESTRICT;
  END IF;
END
$familia_da_materia_prima$;
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_materia_prima_tenant_familia_idx ON public.orcamentista_materia_prima (tenant_id, familia) WHERE familia IS NOT NULL;
COMMENT ON COLUMN public.orcamentista_materia_prima.familia IS
  'A familia de produtos desta materia-prima (materia-prima e o nome velho de familia). Nula ate o consultor ligar. Uma por conta. O titulo na tela e o rotulo da familia; a coluna nome fica no banco, sem uso.';

-- ── G. o histórico aponta o motor que calculou ──────────────────────────────────────────────
ALTER TABLE public.orcamentista_levantamento_item ADD COLUMN IF NOT EXISTS motor_id uuid;
DO $motor_do_item$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_fkey') THEN
    ALTER TABLE public.orcamentista_levantamento_item
      ADD CONSTRAINT orcamentista_levantamento_item_motor_fkey FOREIGN KEY (motor_id) REFERENCES public.orcamentista_motor (id) ON DELETE RESTRICT;
  END IF;
END
$motor_do_item$;
COMMENT ON COLUMN public.orcamentista_levantamento_item.motor_id IS
  'O motor (planilha) que calculou este item. O tabela_id continua sendo o historico do PRECO. RESTRICT: motor com levantamento pendurado nao se exclui.';

-- ── H. RLS: as três tabelas novas nascem fechadas ───────────────────────────────────────────
DO $rls$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orcamentista_motor', 'orcamentista_familia_etapa', 'orcamentista_familia_ramificacao'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select_super_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_super_admin())', t || '_select_super_admin', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_insert_super_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.is_super_admin())', t || '_insert_super_admin', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_update_super_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())', t || '_update_super_admin', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_delete_super_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_super_admin())', t || '_delete_super_admin', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END
$rls$;

-- ── I. VERIFICAÇÃO — aborta tudo se a forma não é a esperada, ou se alguma linha existente mudou ───────
DO $verifica$
DECLARE
  t     text;
  u     record;
  a     record;
  def   text;
  lista text[];
  n     bigint;
BEGIN
  -- (1) as 14 tabelas: motor_id uuid opcional, tabela_id opcional, um dono só, FK RESTRICT
  FOR t IN SELECT nome FROM v_tabelas_do_motor ORDER BY nome LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t
                     AND column_name = 'motor_id' AND data_type = 'uuid' AND is_nullable = 'YES') THEN
      RAISE EXCEPTION 'verificacao 1: %.motor_id ausente ou com outra forma. Nada foi alterado.', t;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t
                 AND column_name = 'tabela_id' AND is_nullable = 'NO') THEN
      RAISE EXCEPTION 'verificacao 1: %.tabela_id ainda e obrigatorio. Nada foi alterado.', t;
    END IF;
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = format('public.%I', t)::regclass AND conname = t || '_um_dono';
    IF def IS DISTINCT FROM 'CHECK ((num_nonnulls(tabela_id, motor_id) = 1))' THEN
      RAISE EXCEPTION 'verificacao 1: a CHECK de um dono so em % esta ausente ou com outra definicao: %. Nada foi alterado.', t, coalesce(def, '(ausente)');
    END IF;
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = format('public.%I', t)::regclass AND conname = t || '_motor_fkey';
    IF def IS DISTINCT FROM 'FOREIGN KEY (motor_id) REFERENCES orcamentista_motor(id) ON DELETE RESTRICT' THEN
      RAISE EXCEPTION 'verificacao 1: a FK de motor_id em % esta ausente ou com outra definicao: %. Nada foi alterado.', t, coalesce(def, '(ausente)');
    END IF;
    -- o tabela_id continua apontando a tabela do fornecedor, e apagando junto com ela, como antes
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', t)::regclass AND contype = 'f'
                     AND pg_get_constraintdef(oid) = 'FOREIGN KEY (tabela_id) REFERENCES orcamentista_tabela(id) ON DELETE CASCADE') THEN
      RAISE EXCEPTION 'verificacao 1: a FK de tabela_id em % mudou. Nada foi alterado.', t;
    END IF;
  END LOOP;
  -- (2) as unicidades da planilha, pela definição
  FOR u IN SELECT * FROM v_unicas_do_motor LOOP
    SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = u.indice;
    IF def IS DISTINCT FROM format('CREATE UNIQUE INDEX %s ON public.%s USING btree (motor_id, %s) WHERE (motor_id IS NOT NULL)', u.indice, u.tabela, u.colunas) THEN
      RAISE EXCEPTION 'verificacao 2: o indice % esta ausente ou com outra definicao: %. Nada foi alterado.', u.indice, coalesce(def, '(ausente)');
    END IF;
  END LOOP;
  -- (3) a Detalhe e os tempos: a chave primária é `id`, e (tabela_id, tipologia) continua único
  FOREACH t IN ARRAY ARRAY['orcamentista_motor_tipologia_detalhe', 'orcamentista_motor_tipologia_tempo'] LOOP
    IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = format('public.%I', t)::regclass AND contype = 'p') IS DISTINCT FROM 'PRIMARY KEY (id)' THEN
      RAISE EXCEPTION 'verificacao 3: a chave primaria de % nao e (id). Nada foi alterado.', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'id'
                     AND data_type = 'uuid' AND is_nullable = 'NO' AND column_default = 'gen_random_uuid()') THEN
      RAISE EXCEPTION 'verificacao 3: %.id ausente ou com outra forma. Nada foi alterado.', t;
    END IF;
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = format('public.%I', t)::regclass AND conname = t || '_tabela_tipologia_key';
    IF def IS DISTINCT FROM 'UNIQUE (tabela_id, tipologia)' THEN
      RAISE EXCEPTION 'verificacao 3: a unicidade (tabela_id, tipologia) de % esta ausente ou com outra definicao: %. Nada foi alterado.', t, coalesce(def, '(ausente)');
    END IF;
  END LOOP;
  -- (4) NENHUMA linha existente mudou: a contagem E o hash do conteúdo, de antes e de depois, e a unicidade preservada
  FOR a IN SELECT * FROM v_antes ORDER BY tabela LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', a.tabela) INTO n;
    IF n <> a.linhas THEN
      RAISE EXCEPTION 'verificacao 4: % tinha % linhas e agora tem %. Nada foi alterado.', a.tabela, a.linhas, n;
    END IF;
    EXECUTE format('SELECT md5(coalesce(string_agg(x, ''|'' ORDER BY x), '''')) FROM (SELECT (to_jsonb(r) - %L::text[])::text AS x FROM public.%I r) s', a.ignorar, a.tabela) INTO def;
    IF def IS DISTINCT FROM a.hash THEN
      RAISE EXCEPTION 'verificacao 4: o conteudo de % mudou (hash de antes % e de depois %). Nada foi alterado.', a.tabela, a.hash, def;
    END IF;
    IF a.distintas IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM (SELECT DISTINCT tabela_id, tipologia FROM public.%I) x', a.tabela) INTO n;
      IF n <> a.distintas THEN
        RAISE EXCEPTION 'verificacao 4: os pares (tabela_id, tipologia) de % eram % e agora sao %. Nada foi alterado.', a.tabela, a.distintas, n;
      END IF;
    END IF;
  END LOOP;
  FOR t IN SELECT nome FROM v_tabelas_do_motor ORDER BY nome LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tabela_id IS NULL OR motor_id IS NOT NULL', t) INTO n;
    IF n <> 0 THEN
      RAISE EXCEPTION 'verificacao 4: % tem linha sem tabela_id ou com motor_id logo apos a migracao. Nada foi alterado.', t;
    END IF;
  END LOOP;
  -- (5) a planilha: o índice de uma vigente por par, e a CHECK de arquivado
  SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_motor_uma_vigente';
  IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_motor_uma_vigente ON public.orcamentista_motor USING btree (familia, fornecedor_id) WHERE vigente' THEN
    RAISE EXCEPTION 'verificacao 5: o indice orcamentista_motor_uma_vigente esta ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor'::regclass AND conname = 'orcamentista_motor_arquivado_nao_e_vigente';
  IF def IS DISTINCT FROM 'CHECK ((NOT (vigente AND (arquivado_em IS NOT NULL))))' THEN
    RAISE EXCEPTION 'verificacao 5: a CHECK de arquivado esta ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (6) a etapa: a lista fechada de ações e a lista de abas, comparadas LITERAL A LITERAL, na ordem
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_familia_etapa'::regclass AND conname = 'orcamentista_familia_etapa_acao_da_lista';
  SELECT array_agg(m[1] ORDER BY ord) INTO lista FROM regexp_matches(coalesce(def, ''), '''([A-Z_]+)''', 'g') WITH ORDINALITY AS r(m, ord);
  IF lista IS DISTINCT FROM ARRAY['APANHAR', 'CONFIRMAR', 'GERAR_LEVANTAMENTO', 'CALCULAR_BARRAS', 'ENVIAR'] THEN
    RAISE EXCEPTION 'verificacao 6: a lista de acoes da etapa esta ausente ou diferente: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_familia_etapa'::regclass AND conname = 'orcamentista_familia_etapa_abas_da_planilha';
  SELECT array_agg(m[1] ORDER BY ord) INTO lista FROM regexp_matches(coalesce(def, ''), '''([a-z_]+)''', 'g') WITH ORDINALITY AS r(m, ord);
  IF lista IS DISTINCT FROM ARRAY['tipologias', 'perfis', 'formulas', 'variaveis', 'vidros', 'baguetes', 'insumos', 'validacoes', 'otimizacao', 'formulas_da_linha', 'regras', 'tempos'] THEN
    RAISE EXCEPTION 'verificacao 6: a lista de abas da etapa esta ausente ou diferente: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.orcamentista_familia_etapa'::regclass AND conname = 'orcamentista_familia_etapa_numero_key')
       IS DISTINCT FROM 'UNIQUE (familia, numero)' THEN
    RAISE EXCEPTION 'verificacao 6: a unicidade (familia, numero) da etapa esta ausente ou diferente. Nada foi alterado.';
  END IF;
  -- (7) as ramificações: se a família PVC existe, declara TODAS as categorias do catálogo, na ordem do catálogo
  IF EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo WHERE chave = 'PVC') THEN
    IF (SELECT array_agg(r.categoria_chave ORDER BY r.ordem) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = 'PVC')
         IS DISTINCT FROM (SELECT array_agg(c.chave ORDER BY c.ordem) FROM public.orcamentista_categoria_catalogo c) THEN
      RAISE EXCEPTION 'verificacao 7: as ramificacoes da familia PVC nao sao as categorias do catalogo. Nada foi alterado.';
    END IF;
  END IF;
  -- (8) a matéria-prima: a coluna, a FK, o índice
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_materia_prima'
                   AND column_name = 'familia' AND data_type = 'text' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'verificacao 8: orcamentista_materia_prima.familia ausente ou com outra forma. Nada foi alterado.';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_materia_prima'::regclass AND conname = 'orcamentista_materia_prima_familia_fkey';
  IF def IS DISTINCT FROM 'FOREIGN KEY (familia) REFERENCES orcamentista_familia_catalogo(chave) ON DELETE RESTRICT' THEN
    RAISE EXCEPTION 'verificacao 8: a FK da familia da materia-prima esta ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_materia_prima_tenant_familia_idx';
  IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_materia_prima_tenant_familia_idx ON public.orcamentista_materia_prima USING btree (tenant_id, familia) WHERE (familia IS NOT NULL)' THEN
    RAISE EXCEPTION 'verificacao 8: o indice de uma familia por conta esta ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (9) o item do levantamento
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_fkey';
  IF def IS DISTINCT FROM 'FOREIGN KEY (motor_id) REFERENCES orcamentista_motor(id) ON DELETE RESTRICT' THEN
    RAISE EXCEPTION 'verificacao 9: a FK do motor no item do levantamento esta ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (10) as três tabelas novas: RLS, exatamente as quatro políticas de is_super_admin(), nenhum privilégio de anon e authenticated
  FOREACH t IN ARRAY ARRAY['orcamentista_motor', 'orcamentista_familia_etapa', 'orcamentista_familia_ramificacao'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass)
       OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t) <> 4
       OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t
             AND ((cmd = 'SELECT' AND qual = 'is_super_admin()' AND with_check IS NULL)
               OR (cmd = 'INSERT' AND qual IS NULL AND with_check = 'is_super_admin()')
               OR (cmd = 'UPDATE' AND qual = 'is_super_admin()' AND with_check = 'is_super_admin()')
               OR (cmd = 'DELETE' AND qual = 'is_super_admin()' AND with_check IS NULL))) <> 4 THEN
      RAISE EXCEPTION 'verificacao 10: a RLS ou as quatro politicas de is_super_admin() de % nao estao como esperado. Nada foi alterado.', t;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = t AND grantee IN ('anon', 'authenticated')) THEN
      RAISE EXCEPTION 'verificacao 10: anon ou authenticated tem privilegio em %. Nada foi alterado.', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'motor por familia: planilha, etapas e ramificacoes criadas; motor_id nas 14 tabelas; nenhuma linha existente mudou.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public' and column_name in ('motor_id') order by 1;
-- select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint where conname like '%_um_dono' order by 1;
-- select conrelid::regclass, pg_get_constraintdef(oid) from pg_constraint where contype = 'p' and conrelid in ('public.orcamentista_motor_tipologia_detalhe'::regclass, 'public.orcamentista_motor_tipologia_tempo'::regclass);
-- select count(*) from public.orcamentista_motor_tipologia_tempo;      -- esperado: 164, como antes
-- select count(*) from public.orcamentista_motor_regra;                -- esperado: 12116, como antes
-- select count(*) from public.orcamentista_motor;                      -- esperado: 0 (a copia e o PR C)
-- select familia, categoria_chave, ordem from public.orcamentista_familia_ramificacao order by ordem;   -- esperado: PVC, as 7
