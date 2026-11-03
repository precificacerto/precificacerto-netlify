-- O estado de PRODUÇÃO de 02/11/2026, 23:34 UTC, na forma medida (só leitura): a categoria VEDACAO criada pela aba Categorias (23:23:09) e
-- marcada na ramificação da PVC (23:34:30), PELAS FUNÇÕES DE HOJE (as de antes desta migração). Resultado medido em produção e reproduzido
-- aqui: a "Esquadrias de PVC WOLF" da De Paula fica sem a linha da VEDACAO em orcamentista_mp_categoria — a única falta.
-- a tabela da conta e o log na FORMA DE PRODUÇÃO (medida em 02/11/2026, só leitura): o esboço da cadeia do harness não tinha as colunas de
-- autoria, a UNIQUE (materia_prima_id, categoria_chave) — a chave do ON CONFLICT de toda gravação desta tabela —, a FK da categoria, a CHECK
-- do config e o NOT NULL da chave do log. Os nomes são os de produção.
ALTER TABLE public.orcamentista_mp_categoria
  ADD COLUMN IF NOT EXISTS atualizado_por uuid,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.orcamentista_mp_categoria
  ADD CONSTRAINT orcamentista_mp_categoria_mp_categoria_key UNIQUE (materia_prima_id, categoria_chave),
  ADD CONSTRAINT orcamentista_mp_categoria_categoria_fk FOREIGN KEY (categoria_chave) REFERENCES public.orcamentista_categoria_catalogo (chave),
  ADD CONSTRAINT orcamentista_mp_categoria_atualizado_por_fk FOREIGN KEY (atualizado_por) REFERENCES public.users (id) ON DELETE SET NULL,
  ADD CONSTRAINT orcamentista_mp_categoria_config_objeto CHECK (config IS NULL OR jsonb_typeof(config) = 'object');
ALTER TABLE public.superadmin_alteracao_log ALTER COLUMN chave SET NOT NULL;

SELECT public.superadmin_criar_categoria('e0000000-0000-0000-0000-000000000001', 'VEDACAO', 'Vedação');
SELECT public.superadmin_editar_familia('e0000000-0000-0000-0000-000000000001', 'PVC', 'PVC Wolf',
  ARRAY['PERFIL', 'PERSIANAS', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO', 'VEDACAO']);
DO $v$ DECLARE v text; BEGIN
  SELECT string_agg(m.id || ':' || r.categoria_chave, ',') INTO v FROM public.orcamentista_materia_prima m
    JOIN public.orcamentista_familia_ramificacao r ON r.familia = m.familia
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_mp_categoria c WHERE c.materia_prima_id = m.id AND c.categoria_chave = r.categoria_chave);
  IF v IS DISTINCT FROM '79d764fe-4acd-43e2-bed9-38e20667ca3d:VEDACAO' THEN RAISE EXCEPTION 'estado: a falta nao e a de producao: %', v; END IF;
END $v$;
