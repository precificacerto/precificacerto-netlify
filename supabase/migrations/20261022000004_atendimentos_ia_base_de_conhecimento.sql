-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261022000004 — Atendimentos I.A.: a BASE DE CONHECIMENTO da empresa, o PADRÃO do nicho
-- Esquadrias, os adicionais de frete e instalação, o padrão por ambiente, o perfil do vendedor
-- e o log das alterações do super admin
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTADO: NÃO APLICADA por quem a escreveu. Quem aplica é o dono do produto.
--
-- ORDEM: aplicar DEPOIS de `20261022000003_employees_unique_id_tenant`. Esta aborta, logo no
-- começo, se `employees` não tiver a UNIQUE (id, tenant_id) que a FK composta do vendedor exige.
-- Nenhuma rota grava nestas tabelas ainda: esta migração é só o SCHEMA.
--
-- ══ A REGRA QUE DECIDE O SCHEMA: NULL É HERANÇA, FALSE É DECISÃO ══
-- `orcamentista_esquadrias_base` é a configuração da EMPRESA; `orcamentista_esquadrias_padrao` é
-- a do NICHO, e serve de herança para todas as empresas daquele nicho. Na tabela da empresa:
--   - NULL  significa "esta empresa não disse nada: HERDA o padrão do nicho";
--   - false significa "esta empresa EXPRESSAMENTE não usa", e vale mesmo que o padrão diga true.
-- O valor efetivo de cada campo é COALESCE(empresa.campo, padrao.campo), com o padrão do nicho
-- da conta (`orcamentista_config.nicho_id`).
-- Os dois estados NÃO PODEM COLAPSAR. Se colapsassem — um booleano NOT NULL DEFAULT false, por
-- exemplo —, "não disse nada" e "decidiu que não" virariam o mesmo byte, e mudar um padrão do
-- nicho reescreveria em silêncio as empresas que decidiram o contrário. Por isso TODA coluna de
-- configuração das duas tabelas é NULL e SEM DEFAULT, booleanos inclusive (`ausente-vs-falso.md`).
-- O mesmo vale para os textos, números e listas: NULL é herança, e um valor gravado é decisão.
-- A verificação no fim aborta se alguma dessas colunas tiver ficado NOT NULL ou com default.
--
-- ══ POR QUE AS TABELAS SE SEPARAM POR NATUREZA (dono do produto, 22/10/2026) ══
--   - guarnição, contramarco, perfil, vidro, interlock: são de ESQUADRIAS — marcenaria não tem
--     nada disso. Daí `orcamentista_esquadrias_padrao` (por nicho) e `orcamentista_esquadrias_base`
--     (por empresa), com EXATAMENTE as mesmas colunas de configuração. A verificação aborta se as
--     duas divergirem em nome ou tipo de coluna (`copia-divergente.md`);
--   - frete e instalação existem em QUALQUER nicho — uma marcenaria também cobra frete. Daí
--     `orcamentista_base_conhecimento`, só com os adicionais. Esta NÃO tem herança: NULL ali é
--     "ainda não configurado", e não lê padrão de lugar nenhum.
-- A palavra é NICHO, não outra: é o vocabulário da área (EPIC §11), e o nicho já existe em
-- `orcamentista_nicho` — Esquadrias inclusive.
--
-- ══ O LOG DO SUPER ADMIN ══
-- O super admin não tem tenant: a empresa que ele edita chega pelo PEDIDO. É a única exceção da
-- arquitetura, e é por essa porta que uma escrita cairia na empresa errada. `superadmin_alteracao_log`
-- guarda tabela, chave, antes e depois de cada alteração — é como se descobre isso depois.
-- `tenant_id` NULL no log = alteração do padrão do nicho, que não é de empresa nenhuma.
--
-- ══ O QUE O SCHEMA NÃO IMPEDE — fica com a rota ══
--   - uma linha em `orcamentista_esquadrias_padrao` para um nicho que não é Esquadrias, e uma
--     `orcamentista_esquadrias_base` para empresa de outro nicho: um CHECK não lê outra tabela.
--   - a herança em si: o COALESCE é de quem lê. O banco só garante que NULL e false continuem
--     distinguíveis.
-- Os dois foram ACEITOS pelo dono do produto como limite conhecido (22/10/2026).
--
-- ══ A VERIFICAÇÃO (2) depende do search_path de quem aplica ══
-- Ela compara a expressão RENDERIZADA da política (`is_super_admin()`, sem prefixo — conferido em
-- produção). Com outro search_path a renderização muda e ela aborta com "0 de 24 politicas". O modo
-- de falha é seguro: aborta em vez de passar errado.
--
-- ══ ACESSO ══
-- RLS ligada com as quatro políticas de `public.is_super_admin()` por tabela, no formato das que
-- estão no banco para a conversa (`<tabela>_{select,insert,update,delete}_super_admin`); REVOKE ALL
-- de anon e authenticated, e NENHUM GRANT: o acesso é só por rota, com service_role.
--
-- IDEMPOTENTE: CREATE TABLE/INDEX IF NOT EXISTS; as políticas são recriadas (DROP IF EXISTS +
-- CREATE); COMMENT e REVOKE repetem sem efeito. Rodar duas vezes deixa o mesmo estado.
--
-- COMO APLICAR (`migration-delivery.md`)
--   - pelo conector: tire o BEGIN e o COMMIT e registre o `name` como o nome COMPLETO deste arquivo,
--     sem a extensão: `20261022000004_atendimentos_ia_base_de_conhecimento`. Publique o md5 do
--     arquivo E o do payload, com a transformação nomeada entre eles
--     (`transformacao-quebra-a-cadeia-de-hash.md`);
--   - pelo SQL Editor: como está.
--   - DEPOIS: `NOTIFY pgrst, 'reload schema';`.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. PRÉ-CONDIÇÕES — aborta antes de criar qualquer coisa ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.employees'::regclass
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indnkeyatts = 2
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM pg_attribute a
            WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey::int2[]))
          = ARRAY['id', 'tenant_id']
  ) THEN
    RAISE EXCEPTION 'employees sem UNIQUE (id, tenant_id): aplique 20261022000003_employees_unique_id_tenant antes desta.';
  END IF;
  IF to_regclass('public.orcamentista_nicho') IS NULL THEN
    RAISE EXCEPTION 'public.orcamentista_nicho não existe: o padrão de esquadrias é por nicho.';
  END IF;
  IF to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'public.is_super_admin() não existe: as políticas dependem dela.';
  END IF;
END
$$;

-- ── 1. O PADRÃO DO NICHO — esquadrias ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_esquadrias_padrao (
  nicho_id uuid PRIMARY KEY REFERENCES public.orcamentista_nicho(id) ON DELETE CASCADE,
  -- perfil
  fornecedor_perfil          text    NULL,
  linha_perfil               text    NULL,
  cor_perfil_predominante    text    NULL,
  cores_perfil               text[]  NULL,
  -- vidro
  vidro_predominante         text    NULL,
  vidros                     text[]  NULL,
  -- guarnição e contramarco
  usa_arremate_interno       boolean NULL,
  guarnicao_interna          text    NULL,
  guarnicao_interna_mm       integer NULL,
  usa_arremate_externo       boolean NULL,
  guarnicao_externa          text    NULL,
  guarnicao_externa_mm       integer NULL,
  montagem_arremate_externo  text    NULL,
  medida_arremate_externo    text    NULL,
  usa_contramarco            boolean NULL,
  -- acessórios e vedação
  cor_acessorio_por_perfil   jsonb   NULL,
  regiao_litoranea           boolean NULL,
  modelo_interlock           text    NULL,
  fechamento_folha_interna   text    NULL,
  fechamento_folha_externa   text    NULL,
  macaneta_sem_chave         text    NULL,
  solda                      text    NULL,
  vedacao                    text    NULL,
  -- produção
  folga_instalacao_x         integer NULL,
  folga_instalacao_y         integer NULL,
  barra_mm                   integer NULL,
  serra_mm                   integer NULL,
  atualizado_por uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_esquadrias_padrao_guarnicao_interna_mm_positiva CHECK (guarnicao_interna_mm IS NULL OR guarnicao_interna_mm > 0),
  CONSTRAINT orcamentista_esquadrias_padrao_guarnicao_externa_mm_positiva CHECK (guarnicao_externa_mm IS NULL OR guarnicao_externa_mm > 0),
  CONSTRAINT orcamentista_esquadrias_padrao_barra_mm_positiva             CHECK (barra_mm IS NULL OR barra_mm > 0),
  CONSTRAINT orcamentista_esquadrias_padrao_serra_mm_positiva             CHECK (serra_mm IS NULL OR serra_mm > 0)
);

COMMENT ON TABLE public.orcamentista_esquadrias_padrao IS
  'O PADRAO do nicho para esquadrias: perfil, vidro, guarnicao, contramarco, acessorios, vedacao e producao. Uma linha por nicho, preenchida pelo super admin. E a heranca de orcamentista_esquadrias_base: o valor efetivo e COALESCE(empresa, padrao). NULL aqui = o nicho nao tem padrao para o campo. So pela rota, com service_role.';

-- ── 2. A BASE DA EMPRESA — esquadrias; NULL = herda o padrão do nicho ──────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_esquadrias_base (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- perfil
  fornecedor_perfil          text    NULL,
  linha_perfil               text    NULL,
  cor_perfil_predominante    text    NULL,
  cores_perfil               text[]  NULL,
  -- vidro
  vidro_predominante         text    NULL,
  vidros                     text[]  NULL,
  -- guarnição e contramarco
  usa_arremate_interno       boolean NULL,
  guarnicao_interna          text    NULL,
  guarnicao_interna_mm       integer NULL,
  usa_arremate_externo       boolean NULL,
  guarnicao_externa          text    NULL,
  guarnicao_externa_mm       integer NULL,
  montagem_arremate_externo  text    NULL,
  medida_arremate_externo    text    NULL,
  usa_contramarco            boolean NULL,
  -- acessórios e vedação
  cor_acessorio_por_perfil   jsonb   NULL,
  regiao_litoranea           boolean NULL,
  modelo_interlock           text    NULL,
  fechamento_folha_interna   text    NULL,
  fechamento_folha_externa   text    NULL,
  macaneta_sem_chave         text    NULL,
  solda                      text    NULL,
  vedacao                    text    NULL,
  -- produção
  folga_instalacao_x         integer NULL,
  folga_instalacao_y         integer NULL,
  barra_mm                   integer NULL,
  serra_mm                   integer NULL,
  atualizado_por uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_esquadrias_base_guarnicao_interna_mm_positiva CHECK (guarnicao_interna_mm IS NULL OR guarnicao_interna_mm > 0),
  CONSTRAINT orcamentista_esquadrias_base_guarnicao_externa_mm_positiva CHECK (guarnicao_externa_mm IS NULL OR guarnicao_externa_mm > 0),
  CONSTRAINT orcamentista_esquadrias_base_barra_mm_positiva             CHECK (barra_mm IS NULL OR barra_mm > 0),
  CONSTRAINT orcamentista_esquadrias_base_serra_mm_positiva             CHECK (serra_mm IS NULL OR serra_mm > 0)
);

COMMENT ON TABLE public.orcamentista_esquadrias_base IS
  'A BASE DE CONHECIMENTO da empresa para esquadrias, uma linha por tenant, preenchida pelo super admin. NULL = HERDA o padrao do nicho (orcamentista_esquadrias_padrao); false = a empresa EXPRESSAMENTE nao usa. Os dois nao colapsam: o valor efetivo e COALESCE(empresa, padrao). Todas as colunas de configuracao sao NULL e sem default, de proposito. So pela rota, com service_role.';

-- Os comentários das colunas de configuração, nas DUAS tabelas, pela lista do catálogo: nenhuma
-- coluna nova fica sem dizer o que o NULL significa.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('orcamentista_esquadrias_base', 'orcamentista_esquadrias_padrao')
       AND column_name NOT IN ('tenant_id', 'nicho_id', 'atualizado_por', 'atualizado_em')
  LOOP
    EXECUTE format('COMMENT ON COLUMN public.%I.%I IS %L', c.table_name, c.column_name,
      CASE c.table_name
        WHEN 'orcamentista_esquadrias_base'
          THEN 'NULL = HERDA o padrao do nicho. Um valor gravado (inclusive false) e decisao da empresa e prevalece.'
        ELSE 'NULL = o nicho nao tem padrao para este campo; a empresa que tambem deixar NULL fica sem valor efetivo.'
      END);
  END LOOP;
END
$$;

COMMENT ON COLUMN public.orcamentista_esquadrias_base.cor_acessorio_por_perfil IS
  'Cor do acessorio por cor de perfil, ex.: {"branco":"branco","amadeirado":"preto"}. NULL = HERDA o padrao do nicho.';
COMMENT ON COLUMN public.orcamentista_esquadrias_padrao.cor_acessorio_por_perfil IS
  'Cor do acessorio por cor de perfil, ex.: {"branco":"branco","amadeirado":"preto"}. NULL = o nicho nao tem padrao para este campo.';

-- ── 3. OS ADICIONAIS DA EMPRESA — frete e instalação, em qualquer nicho; SEM herança ───────
CREATE TABLE IF NOT EXISTS public.orcamentista_base_conhecimento (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  frete_modo             text    NULL,
  frete_valor            numeric NULL,
  frete_percentual       numeric NULL,
  frete_base             text    NULL,
  instalacao_modo        text    NULL,
  instalacao_valor       numeric NULL,
  instalacao_percentual  numeric NULL,
  instalacao_base        text    NULL,
  atualizado_por uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_base_conhecimento_frete_modo_valido           CHECK (frete_modo IS NULL OR frete_modo IN ('NAO_COBRA', 'VALOR', 'PERCENTUAL')),
  CONSTRAINT orcamentista_base_conhecimento_frete_valor_nao_negativo     CHECK (frete_valor IS NULL OR frete_valor >= 0),
  CONSTRAINT orcamentista_base_conhecimento_frete_pct_nao_negativo CHECK (frete_percentual IS NULL OR frete_percentual >= 0),
  CONSTRAINT orcamentista_base_conhecimento_frete_base_valida           CHECK (frete_base IS NULL OR frete_base IN ('VALOR_DE_VENDA', 'CUSTO_DO_FRETE')),
  CONSTRAINT orcamentista_base_conhecimento_instalacao_modo_valido      CHECK (instalacao_modo IS NULL OR instalacao_modo IN ('NAO_COBRA', 'VALOR', 'PERCENTUAL')),
  CONSTRAINT orcamentista_base_conhecimento_instalacao_valor_nao_negativo CHECK (instalacao_valor IS NULL OR instalacao_valor >= 0),
  CONSTRAINT orcamentista_base_conhecimento_instalacao_pct_nao_negativo CHECK (instalacao_percentual IS NULL OR instalacao_percentual >= 0),
  CONSTRAINT orcamentista_base_conhecimento_instalacao_base_valida      CHECK (instalacao_base IS NULL OR instalacao_base IN ('VALOR_DE_VENDA', 'CUSTO_DA_INSTALACAO')),
  -- A COERÊNCIA de cada adicional: o modo decide quais campos existem. PERCENTUAL exige a base,
  -- porque percentual sem base não se refaz depois. VALOR exige a base NULA: base gravada ao lado
  -- de um valor fixo é armadilha — alguém a lê depois e calcula percentual sobre ela (dono do
  -- produto, 22/10/2026). Sem modo (NULL = não configurado), os três ficam nulos: um percentual
  -- solto, sem modo e sem base, seria o mesmo dado irrecuperável.
  CONSTRAINT orcamentista_base_conhecimento_frete_coerente CHECK (
    CASE frete_modo
      WHEN 'VALOR'      THEN frete_valor IS NOT NULL AND frete_percentual IS NULL AND frete_base IS NULL
      WHEN 'PERCENTUAL' THEN frete_percentual IS NOT NULL AND frete_base IS NOT NULL AND frete_valor IS NULL
      ELSE                   frete_valor IS NULL AND frete_percentual IS NULL AND frete_base IS NULL
    END
  ),
  CONSTRAINT orcamentista_base_conhecimento_instalacao_coerente CHECK (
    CASE instalacao_modo
      WHEN 'VALOR'      THEN instalacao_valor IS NOT NULL AND instalacao_percentual IS NULL AND instalacao_base IS NULL
      WHEN 'PERCENTUAL' THEN instalacao_percentual IS NOT NULL AND instalacao_base IS NOT NULL AND instalacao_valor IS NULL
      ELSE                   instalacao_valor IS NULL AND instalacao_percentual IS NULL AND instalacao_base IS NULL
    END
  )
);

COMMENT ON TABLE public.orcamentista_base_conhecimento IS
  'Os ADICIONAIS da empresa — frete e instalacao —, uma linha por tenant, em qualquer nicho. SEM heranca: NULL = ainda nao configurado, e nao le padrao de lugar nenhum. O modo decide quais campos existem (CHECK de coerencia). Preenchida pelo super admin. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_base_conhecimento.frete_modo IS
  'NAO_COBRA | VALOR | PERCENTUAL. NULL = nao configurado (NAO e heranca, e NAO e o mesmo que NAO_COBRA): valor, percentual e base ficam nulos.';
COMMENT ON COLUMN public.orcamentista_base_conhecimento.instalacao_modo IS
  'NAO_COBRA | VALOR | PERCENTUAL. NULL = nao configurado (NAO e heranca, e NAO e o mesmo que NAO_COBRA): valor, percentual e base ficam nulos.';

-- ── 4. O PADRÃO POR AMBIENTE ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_padrao_ambiente (
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ambiente        text NOT NULL,
  vidro_padrao    text NULL,
  tipologia_usual text NULL,
  atualizado_por uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ambiente)
);

COMMENT ON TABLE public.orcamentista_padrao_ambiente IS
  'O que a empresa costuma usar em cada ambiente (vidro e tipologia). NULL = a empresa nao informou para aquele ambiente. Preenchida pelo super admin. So pela rota, com service_role.';

-- ── 5. O PERFIL DO VENDEDOR ───────────────────────────────────────────────────────────────
-- FK COMPOSTA para employees (id, tenant_id): um funcionário de uma empresa nunca fica atrelado
-- ao perfil de outra. ON DELETE CASCADE: excluir o funcionário leva o perfil dele. RESTRICT
-- travaria o RH do cliente por causa de uma configuração do Atendimentos I.A. — o mesmo motivo da
-- decisão de 21/10/2026 sobre a conversa.
CREATE TABLE IF NOT EXISTS public.orcamentista_vendedor_perfil (
  tenant_id                  uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id                uuid    NOT NULL,
  comissao_percentual        numeric NULL,
  comissao_modo              text    NULL,
  reserva_tecnica_percentual numeric NULL,
  lucro_projetado_percentual numeric NULL,
  atualizado_por uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, employee_id),
  CONSTRAINT orcamentista_vendedor_perfil_employee_fkey
    FOREIGN KEY (employee_id, tenant_id) REFERENCES public.employees (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_vendedor_perfil_comissao_percentual_faixa         CHECK (comissao_percentual IS NULL OR (comissao_percentual >= 0 AND comissao_percentual <= 100)),
  CONSTRAINT orcamentista_vendedor_perfil_comissao_modo_valido              CHECK (comissao_modo IS NULL OR comissao_modo IN ('PROPORCIONAL', 'CONGELADA')),
  CONSTRAINT orcamentista_vendedor_perfil_reserva_tecnica_percentual_faixa  CHECK (reserva_tecnica_percentual IS NULL OR (reserva_tecnica_percentual >= 0 AND reserva_tecnica_percentual <= 100)),
  CONSTRAINT orcamentista_vendedor_perfil_lucro_projetado_percentual_faixa  CHECK (lucro_projetado_percentual IS NULL OR (lucro_projetado_percentual >= 0 AND lucro_projetado_percentual <= 100))
);

COMMENT ON TABLE public.orcamentista_vendedor_perfil IS
  'Comissao, reserva tecnica e lucro projetado do vendedor no Atendimentos I.A. FK composta (employee_id, tenant_id) -> employees: o funcionario e da mesma empresa do perfil. ON DELETE CASCADE: excluir o funcionario leva o perfil. NULL = nao informado. Preenchida pelo super admin. So pela rota, com service_role.';

-- ── 6. O LOG DAS ALTERAÇÕES DO SUPER ADMIN ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.superadmin_alteracao_log (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  tabela    text NOT NULL,
  chave     text NOT NULL,
  antes     jsonb NULL,
  depois    jsonb NULL,
  por       uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS superadmin_alteracao_log_tenant_em_idx
  ON public.superadmin_alteracao_log (tenant_id, em DESC);

COMMENT ON TABLE public.superadmin_alteracao_log IS
  'O que o super admin alterou: tabela, chave, antes e depois. O super admin nao tem tenant — a empresa que ele edita chega pelo pedido, e e por essa porta que uma escrita cairia na empresa errada. Este log e como se descobre isso depois. So pela rota, com service_role.';
COMMENT ON COLUMN public.superadmin_alteracao_log.tenant_id IS
  'A empresa alterada. NULL = alteracao do padrao do nicho, que nao e de empresa nenhuma. ON DELETE SET NULL: o log sobrevive a exclusao da empresa.';

-- ── 7. RLS — quatro políticas de is_super_admin() por tabela ──────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orcamentista_esquadrias_padrao', 'orcamentista_esquadrias_base', 'orcamentista_base_conhecimento',
    'orcamentista_padrao_ambiente', 'orcamentista_vendedor_perfil', 'superadmin_alteracao_log'
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
    -- ── 8. PRIVILÉGIOS — REVOKE ALL, e NENHUM GRANT ──
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END
$$;

-- ── VERIFICAÇÃO — aborta a transação se algo não ficou como deve ───────────────────────────
DO $$
DECLARE
  v_tabelas  text[] := ARRAY[
    'orcamentista_esquadrias_padrao', 'orcamentista_esquadrias_base', 'orcamentista_base_conhecimento',
    'orcamentista_padrao_ambiente', 'orcamentista_vendedor_perfil', 'superadmin_alteracao_log'
  ];
  v_checks   text[] := ARRAY[
    'orcamentista_esquadrias_padrao_guarnicao_interna_mm_positiva',
    'orcamentista_esquadrias_padrao_guarnicao_externa_mm_positiva',
    'orcamentista_esquadrias_padrao_barra_mm_positiva',
    'orcamentista_esquadrias_padrao_serra_mm_positiva',
    'orcamentista_esquadrias_base_guarnicao_interna_mm_positiva',
    'orcamentista_esquadrias_base_guarnicao_externa_mm_positiva',
    'orcamentista_esquadrias_base_barra_mm_positiva',
    'orcamentista_esquadrias_base_serra_mm_positiva',
    'orcamentista_base_conhecimento_frete_modo_valido',
    'orcamentista_base_conhecimento_frete_valor_nao_negativo',
    'orcamentista_base_conhecimento_frete_pct_nao_negativo',
    'orcamentista_base_conhecimento_frete_base_valida',
    'orcamentista_base_conhecimento_instalacao_modo_valido',
    'orcamentista_base_conhecimento_instalacao_valor_nao_negativo',
    'orcamentista_base_conhecimento_instalacao_pct_nao_negativo',
    'orcamentista_base_conhecimento_instalacao_base_valida',
    'orcamentista_base_conhecimento_frete_coerente',
    'orcamentista_base_conhecimento_instalacao_coerente',
    'orcamentista_vendedor_perfil_comissao_percentual_faixa',
    'orcamentista_vendedor_perfil_comissao_modo_valido',
    'orcamentista_vendedor_perfil_reserva_tecnica_percentual_faixa',
    'orcamentista_vendedor_perfil_lucro_projetado_percentual_faixa'
  ];
  -- tabela de origem → tabela referenciada : modo de exclusão (c = CASCADE, n = SET NULL)
  v_fks      text[] := ARRAY[
    'orcamentista_esquadrias_padrao>orcamentista_nicho:c',
    'orcamentista_esquadrias_padrao>users:n',
    'orcamentista_esquadrias_base>tenants:c',
    'orcamentista_esquadrias_base>users:n',
    'orcamentista_base_conhecimento>tenants:c',
    'orcamentista_base_conhecimento>users:n',
    'orcamentista_padrao_ambiente>tenants:c',
    'orcamentista_padrao_ambiente>users:n',
    'orcamentista_vendedor_perfil>tenants:c',
    'orcamentista_vendedor_perfil>employees:c',
    'orcamentista_vendedor_perfil>users:n',
    'superadmin_alteracao_log>tenants:n',
    'superadmin_alteracao_log>users:n'
  ];
  v_n   int;
  v_x   text;
BEGIN
  -- (1) as seis tabelas, com RLS ligada
  SELECT count(*) INTO v_n FROM pg_class
   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
     AND relname = ANY (v_tabelas) AND relrowsecurity;
  IF v_n <> 6 THEN RAISE EXCEPTION 'verificacao (1): esperadas 6 tabelas com RLS ligada, ha %.', v_n; END IF;

  -- (2) exatamente as 24 políticas, com o nome, o comando e is_super_admin() no lugar certo
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (v_tabelas);
  IF v_n <> 24 THEN RAISE EXCEPTION 'verificacao (2): esperadas 24 politicas, ha %.', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = ANY (v_tabelas)
     AND p.permissive = 'PERMISSIVE'
     AND (   (p.cmd = 'SELECT' AND p.policyname = p.tablename || '_select_super_admin' AND p.qual = 'is_super_admin()' AND p.with_check IS NULL)
          OR (p.cmd = 'INSERT' AND p.policyname = p.tablename || '_insert_super_admin' AND p.qual IS NULL AND p.with_check = 'is_super_admin()')
          OR (p.cmd = 'UPDATE' AND p.policyname = p.tablename || '_update_super_admin' AND p.qual = 'is_super_admin()' AND p.with_check = 'is_super_admin()')
          OR (p.cmd = 'DELETE' AND p.policyname = p.tablename || '_delete_super_admin' AND p.qual = 'is_super_admin()' AND p.with_check IS NULL));
  IF v_n <> 24 THEN RAISE EXCEPTION 'verificacao (2): % de 24 politicas com nome, comando e expressao esperados.', v_n; END IF;

  -- (3) anon e authenticated sem privilégio nenhum — perguntado ao catálogo por papel, e não ao
  --     information_schema, que só mostra o que o papel de quem roda enxerga
  SELECT count(*) INTO v_n
    FROM unnest(v_tabelas) t(nome), unnest(ARRAY['anon', 'authenticated']) r(papel)
   WHERE has_table_privilege(r.papel, format('public.%I', t.nome), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  IF v_n <> 0 THEN RAISE EXCEPTION 'verificacao (3): % par(es) tabela/papel com privilegio de anon ou authenticated.', v_n; END IF;

  -- (4) cada CHECK nomeado existe
  FOREACH v_x IN ARRAY v_checks LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'c' AND conname = v_x) THEN
      RAISE EXCEPTION 'verificacao (4): CHECK % nao existe.', v_x;
    END IF;
  END LOOP;

  -- (5) as FK — origem, destino e modo de exclusão —, e nenhuma além delas
  SELECT count(*) INTO v_n FROM pg_constraint k JOIN pg_class o ON o.oid = k.conrelid
   WHERE k.contype = 'f' AND o.relnamespace = 'public'::regnamespace AND o.relname = ANY (v_tabelas);
  IF v_n <> array_length(v_fks, 1) THEN RAISE EXCEPTION 'verificacao (5): esperadas % FK, ha %.', array_length(v_fks, 1), v_n; END IF;
  FOREACH v_x IN ARRAY v_fks LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint k
        JOIN pg_class o ON o.oid = k.conrelid
        JOIN pg_class d ON d.oid = k.confrelid
       WHERE k.contype = 'f'
         AND o.relnamespace = 'public'::regnamespace AND d.relnamespace = 'public'::regnamespace
         AND o.relname::text || '>' || d.relname::text || ':' || k.confdeltype::text = v_x
    ) THEN
      RAISE EXCEPTION 'verificacao (5): FK % nao existe.', v_x;
    END IF;
  END LOOP;

  -- (6) a FK do vendedor é COMPOSTA: (employee_id, tenant_id) → employees (id, tenant_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint k
     WHERE k.conname = 'orcamentista_vendedor_perfil_employee_fkey' AND k.contype = 'f'
       AND k.confrelid = 'public.employees'::regclass
       AND (SELECT array_agg(a.attname::text ORDER BY u.o) FROM unnest(k.conkey) WITH ORDINALITY u(n, o)
              JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.n) = ARRAY['employee_id', 'tenant_id']
       AND (SELECT array_agg(a.attname::text ORDER BY u.o) FROM unnest(k.confkey) WITH ORDINALITY u(n, o)
              JOIN pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = u.n) = ARRAY['id', 'tenant_id']
  ) THEN
    RAISE EXCEPTION 'verificacao (6): a FK do vendedor nao e a composta (employee_id, tenant_id) -> employees (id, tenant_id).';
  END IF;

  -- (7) NULL é herança: toda coluna de configuração das duas tabelas de esquadrias e dos
  --     adicionais é nulável e SEM default — booleanos inclusive
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('orcamentista_esquadrias_padrao', 'orcamentista_esquadrias_base', 'orcamentista_base_conhecimento')
     AND column_name NOT IN ('tenant_id', 'nicho_id', 'atualizado_em')
     AND (is_nullable <> 'YES' OR column_default IS NOT NULL);
  IF v_n <> 0 THEN RAISE EXCEPTION 'verificacao (7): % coluna(s) de configuracao NOT NULL ou com default.', v_n; END IF;

  -- (8) padrão e base de esquadrias têm EXATAMENTE as mesmas colunas de configuração
  SELECT count(*) INTO v_n FROM (
    (SELECT column_name, data_type, udt_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orcamentista_esquadrias_padrao' AND column_name <> 'nicho_id'
     EXCEPT
     SELECT column_name, data_type, udt_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orcamentista_esquadrias_base' AND column_name <> 'tenant_id')
    UNION ALL
    (SELECT column_name, data_type, udt_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orcamentista_esquadrias_base' AND column_name <> 'tenant_id'
     EXCEPT
     SELECT column_name, data_type, udt_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orcamentista_esquadrias_padrao' AND column_name <> 'nicho_id')
  ) d;
  IF v_n <> 0 THEN RAISE EXCEPTION 'verificacao (8): padrao e base de esquadrias divergem em % coluna(s).', v_n; END IF;

  -- (9) o índice do log
  IF to_regclass('public.superadmin_alteracao_log_tenant_em_idx') IS NULL THEN
    RAISE EXCEPTION 'verificacao (9): o indice superadmin_alteracao_log_tenant_em_idx nao existe.';
  END IF;
END
$$;

COMMIT;
