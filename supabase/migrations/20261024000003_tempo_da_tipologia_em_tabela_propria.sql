-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261024000003 — o TEMPO DE FABRICAÇÃO sai de orcamentista_motor_tipologia e vai para
-- uma TABELA PRÓPRIA, que a importação não apaga
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Ao aplicar fora do CLI, o `name` da migração é o nome completo
-- ║ deste arquivo, sem a extensão: 20261024000003_tempo_da_tipologia_em_tabela_propria.
-- ║ Depois de aplicar: NOTIFY pgrst (abaixo, dentro do arquivo) e a consulta da VERIFICAÇÃO.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — `.claude/rules/tabela-que-a-importacao-apaga.md`, aparição 1:
--   `importar_conteudo_da_tabela` (20261020000002) APAGA e regrava orcamentista_motor_tipologia
--   inteira, e a regravação não preenche as duas colunas de tempo que a 20261024000001
--   acrescentou. Importar a tabela da Wolff apagaria os 164 tempos ESTIMADO mesmo com o arquivo
--   idêntico. O #147 TRAVOU a importação até isto existir; esta migração é o remédio estrutural:
--   o tempo é de OUTRO DONO (o dono do produto estima; a planilha, um dia, informa), e o dado de
--   outro dono vai para uma tabela que o processo que apaga não alcança.
--
-- O QUE FAZ, nesta ordem, numa transação:
--   1. cria orcamentista_motor_tipologia_tempo, chave (tabela_id, tipologia) — a MESMA chave
--      UNIQUE de orcamentista_motor_tipologia, medida em produção em 24/10/2026. O comentário da
--      20261024000001 fala em "(tabela_id, tipologia, linha)": está errado contra o schema, e a
--      linha NÃO entra na chave;
--   2. RLS ligada, as quatro políticas de super admin e REVOKE ALL de anon e authenticated —
--      espelho exato de orcamentista_motor_tipologia (20261020000001);
--   3. COPIA cada tipologia que tem tempo, com o tempo e a origem como estão. ON CONFLICT DO
--      NOTHING: rodar duas vezes não duplica, e não sobrescreve o que a tabela nova já tiver;
--   4. NÃO APAGA as colunas antigas. Elas ficam, marcadas OBSOLETAS no COMMENT, porque o único
--      leitor delas hoje é a trava do #147 (repositorio.ts, `contarTemposGravados`). A ordem é:
--      esta migração aplicada → o leitor passa a ler a tabela nova (PR próprio) → uma migração
--      posterior apaga as duas colunas. Até lá o tempo existe em DOIS lugares, e ninguém escreve
--      em nenhum dos dois: a importação ainda está travada, e o código não grava tempo;
--   5. VERIFICA e ABORTA (tudo volta) se: alguma tipologia com tempo ficou sem cópia; alguma
--      cópia difere da origem; orcamentista_motor_tipologia perdeu ou mudou algum tempo; a RLS,
--      as políticas ou o REVOKE não estão como a tabela-espelho.
--
-- SEM CHAVE ESTRANGEIRA PARA orcamentista_motor_tipologia, DE PROPÓSITO. A importação apaga
-- aquelas linhas e insere outras, com outro `id`: uma FK com CASCADE apagaria o tempo junto (o
-- defeito que esta migração existe para remover), e sem CASCADE travaria a importação. A FK é
-- para orcamentista_tabela, com CASCADE: apagar a TABELA do fornecedor apaga os tempos dela.
--
-- SEM LINHA = NÃO INFORMADO. As duas colunas de tempo são NOT NULL aqui: uma linha existe só
-- quando há tempo. "Não informado" é a ausência da linha, nunca um NULL ou um zero numa linha
-- que existe (`ausente-vs-falso.md`). O CHECK de origem é o da 20261024000001.
--
-- RODAR DE NOVO DEPOIS QUE A TABELA NOVA DIVERGIR ABORTA, e é de propósito. Se um dia a tabela
-- nova receber um tempo IMPORTADO e alguém reaplicar este arquivo, a verificação da cópia vê a
-- diferença e desfaz tudo — nada é sobrescrito. Reaplicar depois disso é engano, não reparo.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- O "antes", para a verificação 3: quantos tempos a tabela antiga tem, e a soma deles.
CREATE TEMP TABLE _tempo_antes ON COMMIT DROP AS
  SELECT count(*) AS n, coalesce(sum(tempo_fabricacao_min), 0) AS soma
    FROM public.orcamentista_motor_tipologia
   WHERE tempo_origem IS NOT NULL;

-- ── 1. A TABELA ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_motor_tipologia_tempo (
  tabela_id             uuid        NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  tipologia             text        NOT NULL,
  tempo_fabricacao_min  integer     NOT NULL,
  tempo_origem          text        NOT NULL,
  atualizado_por        uuid        NULL,
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_motor_tipologia_tempo_pkey PRIMARY KEY (tabela_id, tipologia),
  CONSTRAINT orcamentista_motor_tipologia_tempo_positivo CHECK (tempo_fabricacao_min > 0),
  CONSTRAINT orcamentista_motor_tipologia_tempo_origem CHECK (tempo_origem IN ('ESTIMADO', 'IMPORTADO'))
);

COMMENT ON TABLE public.orcamentista_motor_tipologia_tempo IS
  'Tempo de fabricacao por tipologia, por tabela do fornecedor. A IMPORTACAO NAO APAGA ESTA TABELA: o tempo e de outro dono (ver .claude/rules/tabela-que-a-importacao-apaga.md). Sem linha = nao informado. Sem FK para orcamentista_motor_tipologia, de proposito: a importacao apaga e recria aquelas linhas.';
COMMENT ON COLUMN public.orcamentista_motor_tipologia_tempo.tempo_fabricacao_min IS
  'minutos de fabricacao da tipologia. Sempre > 0: a linha so existe quando ha tempo';
COMMENT ON COLUMN public.orcamentista_motor_tipologia_tempo.tempo_origem IS
  'ESTIMADO = arbitrado, nao medido no chao de fabrica; IMPORTADO = veio da coluna da planilha do motor';
COMMENT ON COLUMN public.orcamentista_motor_tipologia_tempo.atualizado_por IS
  'quem gravou o tempo. NULL nas linhas copiadas por 20261024000003: a 20261024000001 nao guardou o autor';

-- ── 2. RLS, POLÍTICAS E PRIVILÉGIOS — espelho de orcamentista_motor_tipologia ───────────────
ALTER TABLE public.orcamentista_motor_tipologia_tempo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orcamentista_motor_tipologia_tempo_select_super_admin ON public.orcamentista_motor_tipologia_tempo;
DROP POLICY IF EXISTS orcamentista_motor_tipologia_tempo_insert_super_admin ON public.orcamentista_motor_tipologia_tempo;
DROP POLICY IF EXISTS orcamentista_motor_tipologia_tempo_update_super_admin ON public.orcamentista_motor_tipologia_tempo;
DROP POLICY IF EXISTS orcamentista_motor_tipologia_tempo_delete_super_admin ON public.orcamentista_motor_tipologia_tempo;
CREATE POLICY orcamentista_motor_tipologia_tempo_select_super_admin ON public.orcamentista_motor_tipologia_tempo
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_tipologia_tempo_insert_super_admin ON public.orcamentista_motor_tipologia_tempo
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_tipologia_tempo_update_super_admin ON public.orcamentista_motor_tipologia_tempo
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_tipologia_tempo_delete_super_admin ON public.orcamentista_motor_tipologia_tempo
  FOR DELETE USING (public.is_super_admin());

REVOKE ALL ON public.orcamentista_motor_tipologia_tempo FROM anon, authenticated;

-- ── 3. A CÓPIA ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.orcamentista_motor_tipologia_tempo (tabela_id, tipologia, tempo_fabricacao_min, tempo_origem)
SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem
  FROM public.orcamentista_motor_tipologia
 WHERE tempo_origem IS NOT NULL
ON CONFLICT (tabela_id, tipologia) DO NOTHING;

-- ── 4. AS COLUNAS ANTIGAS FICAM, MARCADAS OBSOLETAS ───────────────────────────────────────
COMMENT ON COLUMN public.orcamentista_motor_tipologia.tempo_fabricacao_min IS
  'OBSOLETA desde 20261024000003: a fonte e orcamentista_motor_tipologia_tempo. A importacao apaga esta coluna. Sai em migracao posterior, depois que o leitor ler a tabela nova';
COMMENT ON COLUMN public.orcamentista_motor_tipologia.tempo_origem IS
  'OBSOLETA desde 20261024000003: a fonte e orcamentista_motor_tipologia_tempo. A importacao apaga esta coluna. Sai em migracao posterior, depois que o leitor ler a tabela nova';

-- ── 5. VERIFICAÇÃO — qualquer falha ABORTA e desfaz tudo ─────────────────────────────────
DO $$
DECLARE
  v_sem_copia  int;
  v_diferentes int;
  v_n_antes    bigint;
  v_soma_antes bigint;
  v_n_depois   bigint;
  v_soma_depois bigint;
  v_politicas  int;
  v_grants     int;
  v_rls        boolean;
  v_n_nova     bigint;
BEGIN
  -- 1. toda tipologia com tempo tem a sua cópia
  SELECT count(*) INTO v_sem_copia
    FROM public.orcamentista_motor_tipologia t
   WHERE t.tempo_origem IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.orcamentista_motor_tipologia_tempo n
                      WHERE n.tabela_id = t.tabela_id AND n.tipologia = t.tipologia);
  IF v_sem_copia <> 0 THEN
    RAISE EXCEPTION 'verificacao 1: % tipologia(s) com tempo ficaram sem copia. Nada foi alterado.', v_sem_copia;
  END IF;

  -- 2. cada cópia é IGUAL à origem — tempo e origem
  SELECT count(*) INTO v_diferentes
    FROM public.orcamentista_motor_tipologia t
    JOIN public.orcamentista_motor_tipologia_tempo n USING (tabela_id, tipologia)
   WHERE t.tempo_origem IS NOT NULL
     AND (n.tempo_fabricacao_min IS DISTINCT FROM t.tempo_fabricacao_min OR n.tempo_origem IS DISTINCT FROM t.tempo_origem);
  IF v_diferentes <> 0 THEN
    RAISE EXCEPTION 'verificacao 2: % copia(s) diferem da origem (reaplicar depois de a tabela nova divergir e engano). Nada foi alterado.', v_diferentes;
  END IF;

  -- 3. a tabela antiga não perdeu nem mudou tempo nenhum
  SELECT n, soma INTO v_n_antes, v_soma_antes FROM _tempo_antes;
  SELECT count(*), coalesce(sum(tempo_fabricacao_min), 0) INTO v_n_depois, v_soma_depois
    FROM public.orcamentista_motor_tipologia WHERE tempo_origem IS NOT NULL;
  IF v_n_depois <> v_n_antes OR v_soma_depois <> v_soma_antes THEN
    RAISE EXCEPTION 'verificacao 3: a tabela antiga mudou — antes % tempos (soma %), depois % (soma %). Nada foi alterado.',
      v_n_antes, v_soma_antes, v_n_depois, v_soma_depois;
  END IF;

  -- 4. RLS, as quatro políticas com is_super_admin(), e nenhum privilégio para anon/authenticated
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.orcamentista_motor_tipologia_tempo'::regclass;
  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'orcamentista_motor_tipologia_tempo'
     AND (coalesce(qual, '') LIKE '%is_super_admin()%' OR coalesce(with_check, '') LIKE '%is_super_admin()%');
  SELECT count(*) INTO v_grants FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orcamentista_motor_tipologia_tempo' AND grantee IN ('anon', 'authenticated');
  IF NOT v_rls OR v_politicas <> 4 OR v_grants <> 0 THEN
    RAISE EXCEPTION 'verificacao 4: RLS %, % politica(s) de super admin (esperado 4), % privilegio(s) de anon/authenticated (esperado 0). Nada foi alterado.',
      v_rls, v_politicas, v_grants;
  END IF;

  SELECT count(*) INTO v_n_nova FROM public.orcamentista_motor_tipologia_tempo;
  RAISE NOTICE 'tempo em tabela propria: % tempo(s) na tabela nova, % na antiga (soma %).', v_n_nova, v_n_depois, v_soma_depois;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao schema (não pelo retorno do comando) ─────
-- select tempo_origem, count(*), sum(tempo_fabricacao_min)
--   from public.orcamentista_motor_tipologia_tempo group by 1;
-- -- esperado em 24/10/2026: ESTIMADO | 164 | <a mesma soma de orcamentista_motor_tipologia>
-- select (select count(*) from public.orcamentista_motor_tipologia where tempo_origem is not null) as antiga,
--        (select count(*) from public.orcamentista_motor_tipologia_tempo) as nova;
