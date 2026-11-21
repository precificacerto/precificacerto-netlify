-- 20261121000001_natureza_da_variavel.sql
--
-- A ESTRUTURA DA NATUREZA DA VARIAVEL (dono do produto, 20/11/2026, item (2) da ordem; comando de 21/11/2026).
--
--   chave (empresa, familia, [linha], [formato], variavel) -> natureza + opcao padrao
--
--   POLITICA  a empresa define; o agente NUNCA pergunta. Tem opcao padrao, guardada como TEXTO (o comeco do rotulo da opcao no motor),
--             nunca como numero: a opcao 2 da MAE e "VAO+50" em 165 tipologias e "VAO+90" em 3 (medido em 20/11/2026, motor 259035a9).
--   ITEM      o vendedor diz no item; o agente so pergunta se o padrao do motor acrescenta peca. Sem opcao padrao.
--   CALCULO   o motor resolve com o padrao dele; o agente nem ve. Sem opcao padrao.
--
-- ESCOPO: WOLFF / PVC. Esta migracao cria a tabela e MIGRA o que ja esta gravado, para o PO nao recadastrar nada:
--   - a politica da De Paula (tenant 20e08592-f957-4e72-b7eb-251387e34eb9), lida de orcamentista_esquadrias_base (a unica linha da tabela,
--     medida em 21/11/2026): arremate interno BZ1770 (70 mm), externo BZ0010 (20 mm), PERIMETRAL, VAO+50MM (CORTE 90/90), solda SPVCAL 6MM,
--     contramarco NAO, regiao litoranea SIM, folgas 0/0, barra 6000 — 12 linhas, familia PVC, linha e formato nulos (valem para toda a familia);
--   - o vidro padrao (orcamentista_vidro_padrao, 2 linhas, medidas em 21/11/2026): janela de correr -> VIN05; maxim-ar -> VBO3,4 — 2 linhas,
--     variavel VIDRO, natureza POLITICA, formato = o grupo ("janela correr", "maxim-ar").
--   TOTAL: 14 linhas de dado de conta GRAVADAS, todas da De Paula. Nada e apagado: orcamentista_esquadrias_base e orcamentista_vidro_padrao
--   ficam como estao (o codigo passa a ler a natureza quando ela existe; sem ela, le as de antes).
--
-- O QUE NAO ENTRA, de proposito:
--   - o FECHAMENTO (MFI/MFE "CREMONA + MACANETA"): nao casa uma opcao so do motor (saiu do mapa da politica no #312); fica para a tela;
--   - nenhuma variavel do motor que a politica de hoje nao decide (ARR, UT, INT...): so ARI, ARE, MAE, MTE e RL, as mesmas do mapa da
--     politica de 20/11/2026 — os outros campos (mm das guarnicoes, solda, contramarco, folgas, barra) sao atributos da empresa, que o motor
--     nao le por estas linhas. Nenhum calculo muda;
--   - o INTERLOCK como CALCULO (dito pelo PO em 20/11): nenhuma linha ITEM/CALCULO e semeada; sem linha, vale o comportamento de hoje
--     (o vendedor; o padrao do motor que nao acrescenta peca; a principal; senao volta ao agente);
--   - FK para orcamentista_familia_catalogo: a remocao soberana do catalogo (20261031000003) apaga por passos declarados; uma FK nova aqui
--     travaria ou cascatearia sem log. A familia e conferida pela forma da chave.
--
-- PRIMEIRA FASE: linha e formato so no VIDRO (CHECK orcamentista_natureza_linha_formato_so_no_vidro). A folha e o orcamento descrevem a
-- politica sem saber a linha e o formato do item; liberar a especificidade nas variaveis do motor vem com a tela (item 3), que a mostra.
--
-- GUARDA (aborta, nada e alterado): a tabela da politica nao e a medida (mais de uma linha, ou valores diferentes dos de 21/11/2026); o
-- vidro padrao nao e o medido (outra quantidade, uma excecao por tipologia, outro codigo); a materia-prima do vidro nao e da familia PVC;
-- a tabela nova ja existe com outra forma.
--
-- VERIFICACAO (aborta): colunas, CHECKs, a unicidade, RLS com 4 politicas de super admin, grants (so service_role), e exatamente as 14 linhas.
--
-- APLICAR: pelo SQL Editor ou conector, inteiro. Idempotente: reaplicar nao duplica (ON CONFLICT DO NOTHING) e nao loga de novo.

BEGIN;

DO $guarda$
DECLARE
  v_base record;
  n int;
BEGIN
  IF to_regclass('public.orcamentista_esquadrias_base') IS NULL OR to_regclass('public.orcamentista_vidro_padrao') IS NULL
     OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN
    RAISE EXCEPTION 'guarda: dependencia ausente em % (usuario %): orcamentista_esquadrias_base, orcamentista_vidro_padrao ou superadmin_alteracao_log.', current_database(), current_user;
  END IF;
  IF to_regclass('public.orcamentista_natureza_da_variavel') IS NOT NULL THEN
    RETURN; -- reaplicacao: a verificacao confere a forma
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_esquadrias_base;
  IF n <> 1 THEN
    RAISE EXCEPTION 'guarda: orcamentista_esquadrias_base tem % linhas; medida em 21/11/2026 com 1 (a De Paula). Nada foi alterado.', n;
  END IF;
  SELECT * INTO v_base FROM public.orcamentista_esquadrias_base WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guarda: a linha da De Paula nao esta em orcamentista_esquadrias_base. Nada foi alterado.';
  END IF;
  IF v_base.usa_arremate_interno IS DISTINCT FROM true OR v_base.guarnicao_interna IS DISTINCT FROM 'BZ1770' OR v_base.guarnicao_interna_mm IS DISTINCT FROM 70
     OR v_base.usa_arremate_externo IS DISTINCT FROM true OR v_base.guarnicao_externa IS DISTINCT FROM 'BZ0010' OR v_base.guarnicao_externa_mm IS DISTINCT FROM 20
     OR v_base.montagem_arremate_externo IS DISTINCT FROM 'PERIMETRAL' OR v_base.medida_arremate_externo IS DISTINCT FROM 'VAO+50MM (CORTE 90/90)'
     OR v_base.solda IS DISTINCT FROM 'SPVCAL 6MM' OR v_base.usa_contramarco IS DISTINCT FROM false OR v_base.regiao_litoranea IS DISTINCT FROM true
     OR v_base.folga_instalacao_x IS DISTINCT FROM 0 OR v_base.folga_instalacao_y IS DISTINCT FROM 0 OR v_base.barra_mm IS DISTINCT FROM 6000 THEN
    RAISE EXCEPTION 'guarda: a politica da De Paula mudou desde a medicao de 21/11/2026; confira antes de migrar. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_vidro_padrao;
  IF n <> 2 OR EXISTS (SELECT 1 FROM public.orcamentista_vidro_padrao WHERE tipologia IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.orcamentista_vidro_padrao WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND abertura = 'janela' AND tipo = 'correr' AND item_codigo = 'VIN05')
     OR NOT EXISTS (SELECT 1 FROM public.orcamentista_vidro_padrao WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND abertura IS NULL AND tipo = 'maxim-ar' AND item_codigo = 'VBO3,4') THEN
    RAISE EXCEPTION 'guarda: orcamentista_vidro_padrao nao e o medido em 21/11/2026 (2 linhas da De Paula: janela correr VIN05; maxim-ar VBO3,4; nenhuma excecao). Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orcamentista_vidro_padrao v JOIN public.orcamentista_materia_prima m ON m.id = v.materia_prima_id
              WHERE m.familia IS DISTINCT FROM 'PVC') THEN
    RAISE EXCEPTION 'guarda: um vidro padrao pertence a materia-prima fora da familia PVC. Nada foi alterado.';
  END IF;
END
$guarda$;

CREATE TABLE IF NOT EXISTS public.orcamentista_natureza_da_variavel (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  familia        text        NOT NULL,
  linha          text,
  formato        text,
  variavel       text        NOT NULL,
  natureza       text        NOT NULL,
  opcao_padrao   text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_natureza_familia_forma CHECK (familia ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  CONSTRAINT orcamentista_natureza_linha_forma CHECK (linha IS NULL OR (linha = btrim(linha) AND length(linha) BETWEEN 1 AND 60)),
  CONSTRAINT orcamentista_natureza_formato_forma CHECK (formato IS NULL OR formato ~ '^[a-z][a-z -]{0,59}$'),
  CONSTRAINT orcamentista_natureza_variavel_forma CHECK (variavel ~ '^[A-Z][A-Z0-9_]{0,39}$'),
  CONSTRAINT orcamentista_natureza_natureza CHECK (natureza IN ('POLITICA', 'ITEM', 'CALCULO')),
  CONSTRAINT orcamentista_natureza_opcao_so_na_politica CHECK ((natureza = 'POLITICA') = (opcao_padrao IS NOT NULL)),
  CONSTRAINT orcamentista_natureza_opcao_forma CHECK (opcao_padrao IS NULL OR (opcao_padrao = btrim(opcao_padrao) AND length(opcao_padrao) BETWEEN 1 AND 120)),
  CONSTRAINT orcamentista_natureza_linha_formato_so_no_vidro CHECK (variavel = 'VIDRO' OR (linha IS NULL AND formato IS NULL)),
  CONSTRAINT orcamentista_natureza_uma_por_chave UNIQUE NULLS NOT DISTINCT (tenant_id, familia, linha, formato, variavel)
);
COMMENT ON TABLE public.orcamentista_natureza_da_variavel IS
  'A natureza de cada variavel por (empresa, familia, [linha], [formato]): POLITICA (a empresa define; opcao_padrao = o comeco do rotulo), ITEM (o vendedor diz) ou CALCULO (o motor resolve). 20261121000001.';
COMMENT ON COLUMN public.orcamentista_natureza_da_variavel.variavel IS 'O codigo da variavel do motor (ARI, MAE, RL...) ou o atributo da empresa (VIDRO, SOLDA, BARRA_MM...).';
COMMENT ON COLUMN public.orcamentista_natureza_da_variavel.formato IS 'O grupo da tipologia, como o leitor da descricao o diz: "janela correr", "porta correr", "maxim-ar". Nulo = todos.';
COMMENT ON COLUMN public.orcamentista_natureza_da_variavel.opcao_padrao IS 'TEXTO, nunca o numero da opcao: o mesmo numero e outra opcao em outra tipologia. SIM/NAO nas booleanas.';

ALTER TABLE public.orcamentista_natureza_da_variavel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orcamentista_natureza_select_super_admin ON public.orcamentista_natureza_da_variavel;
DROP POLICY IF EXISTS orcamentista_natureza_insert_super_admin ON public.orcamentista_natureza_da_variavel;
DROP POLICY IF EXISTS orcamentista_natureza_update_super_admin ON public.orcamentista_natureza_da_variavel;
DROP POLICY IF EXISTS orcamentista_natureza_delete_super_admin ON public.orcamentista_natureza_da_variavel;
CREATE POLICY orcamentista_natureza_select_super_admin ON public.orcamentista_natureza_da_variavel FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_natureza_insert_super_admin ON public.orcamentista_natureza_da_variavel FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_natureza_update_super_admin ON public.orcamentista_natureza_da_variavel FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_natureza_delete_super_admin ON public.orcamentista_natureza_da_variavel FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_natureza_da_variavel FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentista_natureza_da_variavel TO service_role;

-- A MIGRACAO DO QUE JA ESTA GRAVADO (14 linhas, De Paula), com log por linha criada
DO $semeio$
DECLARE
  v_tenant constant uuid := '20e08592-f957-4e72-b7eb-251387e34eb9';
  r record;
  v_id uuid;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ARI', NULL::text, 'BZ1770', 'orcamentista_esquadrias_base: usa_arremate_interno = true, guarnicao_interna = BZ1770'),
      ('ARE', NULL, 'BZ0010', 'orcamentista_esquadrias_base: usa_arremate_externo = true, guarnicao_externa = BZ0010'),
      ('MAE', NULL, 'VAO+50MM (CORTE 90/90)', 'orcamentista_esquadrias_base: medida_arremate_externo'),
      ('MTE', NULL, 'PERIMETRAL', 'orcamentista_esquadrias_base: montagem_arremate_externo'),
      ('RL', NULL, 'SIM', 'orcamentista_esquadrias_base: regiao_litoranea = true'),
      ('GUARNICAO_INTERNA_MM', NULL, '70', 'orcamentista_esquadrias_base: guarnicao_interna_mm'),
      ('GUARNICAO_EXTERNA_MM', NULL, '20', 'orcamentista_esquadrias_base: guarnicao_externa_mm'),
      ('SOLDA', NULL, 'SPVCAL 6MM', 'orcamentista_esquadrias_base: solda'),
      ('USA_CONTRAMARCO', NULL, 'NAO', 'orcamentista_esquadrias_base: usa_contramarco = false'),
      ('FOLGA_INSTALACAO_X', NULL, '0', 'orcamentista_esquadrias_base: folga_instalacao_x'),
      ('FOLGA_INSTALACAO_Y', NULL, '0', 'orcamentista_esquadrias_base: folga_instalacao_y'),
      ('BARRA_MM', NULL, '6000', 'orcamentista_esquadrias_base: barra_mm'),
      ('VIDRO', 'janela correr', 'VIN05', 'orcamentista_vidro_padrao: abertura janela, tipo correr'),
      ('VIDRO', 'maxim-ar', 'VBO3,4', 'orcamentista_vidro_padrao: tipo maxim-ar')
    ) AS t(variavel, formato, opcao, origem)
  LOOP
    INSERT INTO public.orcamentista_natureza_da_variavel (tenant_id, familia, linha, formato, variavel, natureza, opcao_padrao)
    VALUES (v_tenant, 'PVC', NULL, r.formato, r.variavel, 'POLITICA', r.opcao)
    ON CONFLICT ON CONSTRAINT orcamentista_natureza_uma_por_chave DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
      VALUES (v_tenant, 'orcamentista_natureza_da_variavel', v_id::text, NULL,
              jsonb_build_object('familia', 'PVC', 'formato', r.formato, 'variavel', r.variavel, 'natureza', 'POLITICA', 'opcao_padrao', r.opcao,
                                 'origem', r.origem, 'migracao', '20261121000001'), NULL);
    END IF;
    v_id := NULL;
  END LOOP;
END
$semeio$;

DO $verifica$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_natureza_da_variavel';
  IF n <> 11 THEN RAISE EXCEPTION 'verificacao: a tabela tem % colunas, esperadas 11.', n; END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = 'public.orcamentista_natureza_da_variavel'::regclass AND contype = 'c';
  IF n < 8 THEN RAISE EXCEPTION 'verificacao: % CHECKs, esperadas 8.', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_natureza_uma_por_chave' AND contype = 'u') THEN
    RAISE EXCEPTION 'verificacao: a unicidade da chave nao existe.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_natureza_da_variavel'::regclass) THEN
    RAISE EXCEPTION 'verificacao: a RLS nao esta ligada.';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orcamentista_natureza_da_variavel';
  IF n <> 4 THEN RAISE EXCEPTION 'verificacao: % politicas, esperadas 4.', n; END IF;
  IF has_table_privilege('anon', 'public.orcamentista_natureza_da_variavel', 'SELECT')
     OR has_table_privilege('authenticated', 'public.orcamentista_natureza_da_variavel', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.orcamentista_natureza_da_variavel', 'SELECT') THEN
    RAISE EXCEPTION 'verificacao: o acesso a tabela nao e so do service_role.';
  END IF;
  SELECT count(*) INTO n FROM public.orcamentista_natureza_da_variavel WHERE tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND familia = 'PVC' AND natureza = 'POLITICA';
  IF n <> 14 THEN RAISE EXCEPTION 'verificacao: % linhas migradas da De Paula, esperadas 14.', n; END IF;
  SELECT count(*) INTO n FROM public.orcamentista_natureza_da_variavel;
  IF n <> 14 THEN RAISE EXCEPTION 'verificacao: a tabela tem % linhas, esperadas 14 (so as migradas).', n; END IF;
  RAISE NOTICE 'natureza da variavel: tabela criada, RLS e 4 politicas, so service_role; 14 linhas da De Paula (12 da politica, 2 do vidro padrao)';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
