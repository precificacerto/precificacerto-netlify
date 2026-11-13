-- PENDENTE: NAO APLICAR SEM A AUTORIZACAO DO DONO DO PRODUTO PELO MD5 DESTE ARQUIVO. Aplicar e verificar ANTES do merge do PR que le a tabela.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- O VIDRO PADRÃO POR GRUPO DE TIPOLOGIA, COM EXCEÇÃO POR TIPOLOGIA — dono do produto, 13/11/2026
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- A decisão, registrada como foi dita:
--   "O padrão mora em TABELA NOVA, com migração. [...] só CREATE TABLE + INSERT das duas sementes + GRANT/RLS. Nenhum DROP, nenhum REVOKE,
--    nenhum ALTER em tabela existente; nenhuma migração tira acesso de que o código publicado depende."
--   "O padrão do maxim-ar vale para o GRUPO INTEIRO [...] padrão por grupo, exceção por tipologia quando for diferente. NÃO use a forma C,
--    nada de quantidade de módulos na chave do grupo. Forma A, 9 grupos."
--   "Semente, só estes dois: janela de correr -> VIN05; maxim-ar -> VBO3,4. Os outros 7 grupos ficam SEM padrão. [...] o agente pergunta."
--
-- O QUE O PADRÃO GUARDA: o CÓDIGO do item da tabela de preço da categoria VIDRO (o fornecedor principal da ramificação decide de que tabela ele
-- vem, na leitura), nunca o nome de uma família de vidro. Padrão que não aterrissa em UM código não é padrão.
--
-- A CHAVE, em dois níveis (a exceção vence o grupo):
--   - GRUPO (forma A): abertura + tipo, lidos da descrição e do tipo do motor pelo mesmo leitor do padrão da tipologia
--     (`atributosDaDescricao` em src/lib/atendimentos-ia/tipologia-padrao.ts). `abertura` é 'porta', 'janela' ou NULA (maxim-ar e fixo não
--     declaram abertura na descrição); `tipo` é a forma curta ('correr', 'abrir', 'oscilo-batente', 'pivotante', 'maxim-ar', 'fixo').
--     Medido no motor 022fc55e em 13/11/2026: 134 tipologias com vidro, em 9 grupos (porta correr 56, janela correr 32, maxim-ar 15, fixo 8,
--     porta abrir 7, janela abrir 6, janela oscilo-batente 5, porta oscilo-batente 3, porta pivotante 2).
--   - EXCEÇÃO: o código CRU da tipologia (DP-017 e DP-17 são duas tipologias: `codigo-do-motor-nao-se-normaliza`). Na linha de exceção,
--     abertura e tipo ficam nulos.
--
-- O QUE FAZ (e só isto):
--   1. CREATE TABLE public.orcamentista_vidro_padrao, com as CHECKs, a unicidade dos dois níveis e as FKs (a matéria-prima da conta e a conta,
--      ON DELETE CASCADE, como orcamentista_mp_categoria; `atualizado_por` -> users ON DELETE SET NULL).
--   2. RLS ligada e as quatro políticas de super admin, espelhadas de orcamentista_mp_categoria (lidas em produção em 13/11/2026).
--   3. GRANT de SELECT, INSERT, UPDATE e DELETE ao service_role (as rotas do super admin gravam por ele).
--   4. INSERT das DUAS sementes, na matéria-prima "Esquadrias de PVC WOLF" da De Paula:
--        janela + correr  -> VIN05   (VIDRO COMUM INCOLOR 05MM, 94,58/m² na tabela VIDRO medida em 13/11/2026)
--        (sem abertura) + maxim-ar -> VBO3,4 (VIDRO MINI BOREAL 3,4MM, 107,51/m²)
--
-- GRAVA DADO DE CONTA: 2 linhas, da empresa De Paula (tenant 20e08592-f957-4e72-b7eb-251387e34eb9, matéria-prima
-- 79d764fe-4acd-43e2-bed9-38e20667ca3d). Nenhuma outra linha, de nenhuma outra tabela, é escrita. As sementes NÃO vão ao
-- superadmin_alteracao_log: escrever lá seria INSERT em tabela existente, e a autorização foi só para as duas sementes.
--
-- O QUE NÃO FAZ: nenhum DROP, nenhum REVOKE, nenhum ALTER em tabela existente, nenhuma função. Nenhum acesso existente é tirado.
--
-- OS PRIVILÉGIOS, MEDIDOS (13/11/2026) — leia antes de autorizar: o privilégio padrão do schema public em produção (pg_default_acl do papel
-- postgres) dá a toda tabela nova arwdDxtm a `authenticated` e a `service_role`. Sem REVOKE (proibido nesta migração), `authenticated` TERÁ
-- privilégio de tabela aqui — diferente de orcamentista_mp_categoria, que só tem postgres e service_role. O que segura a linha é a RLS: as
-- políticas só deixam passar quem `is_super_admin()`, como nas tabelas da base de conhecimento. Tirar o privilégio de `authenticated` seria
-- uma migração própria, depois, se o dono do produto quiser.
--
-- A REMOÇÃO EM CASCATA: apagar a matéria-prima (superadmin_remover_materia_prima, que loga a árvore) leva estas linhas pela FK, sem linha de
-- log própria — como as de orcamentista_mp_categoria. O arrasto do catálogo NÃO apaga matéria-prima (na família ela "perde o vínculo",
-- medido em orcamentista_arrasto_passos em 13/11/2026), então o fecho do arrasto não alcança esta tabela.
--
-- O QUE QUEBRA SE ALGUÉM MERGEAR O CÓDIGO QUE LÊ A TABELA ANTES DE APLICAR: a leitura do padrão do vidro falha (a tabela não existe). O código
-- será escrito para recusar com frase nomeada nesse caso, mas a ordem é: aplicar, verificar por consulta, só então mergear.
--
-- GUARDA (aborta, nada alterado): a tabela já existe; a matéria-prima da semente não é a medida (id, conta, família PVC); algum dos dois códigos
-- não está em tabela de preço da categoria VIDRO; `is_super_admin()` ou as tabelas referenciadas não existem.
-- VERIFICAÇÃO (aborta, desfaz tudo): as colunas, a RLS, as 4 políticas, o GRANT ao service_role e exatamente as 2 sementes.
--
-- Pelo SQL Editor, o arquivo inteiro. Pelo conector, sem o BEGIN e o COMMIT (são as duas únicas linhas a tirar; o md5 muda e os dois números
-- vão no relato — `migracao.md`, Parte III). Depois: NOTIFY pgrst, 'reload schema'.

BEGIN;

DO $guarda$
DECLARE
  v_falta text;
BEGIN
  IF to_regclass('public.orcamentista_vidro_padrao') IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: public.orcamentista_vidro_padrao ja existe no banco % (a migracao ja foi aplicada?). Nada foi alterado.', current_database();
  END IF;
  SELECT string_agg(x, ', ') INTO v_falta FROM unnest(ARRAY['public.orcamentista_materia_prima', 'public.tenants', 'public.users', 'public.orcamentista_tabela', 'public.orcamentista_tabela_item']) x
   WHERE to_regclass(x) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: tabelas ausentes no banco % (usuario %): % - e o projeto certo? Nada foi alterado.', current_database(), current_user, v_falta;
  END IF;
  IF to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'guarda: a funcao public.is_super_admin() nao existe no banco %. Nada foi alterado.', current_database();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_materia_prima m
                  WHERE m.id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' AND m.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND m.familia = 'PVC') THEN
    RAISE EXCEPTION 'guarda: a materia-prima da semente (79d764fe..., conta 20e08592..., familia PVC) nao e a medida em 13/11/2026. Nada foi alterado.';
  END IF;
  SELECT string_agg(c, ', ') INTO v_falta FROM unnest(ARRAY['VIN05', 'VBO3,4']) c
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_tabela_item i JOIN public.orcamentista_tabela t ON t.id = i.tabela_id
                      WHERE i.codigo = c AND t.categoria_chave = 'VIDRO');
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: codigo da semente fora de toda tabela de preco da categoria VIDRO: %. Nada foi alterado.', v_falta;
  END IF;
END
$guarda$;

-- ── 1. A TABELA ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.orcamentista_vidro_padrao (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  materia_prima_id uuid        NOT NULL,
  -- o GRUPO (forma A): abertura + tipo; nulos na linha de exceção
  abertura         text,
  tipo             text,
  -- a EXCEÇÃO: o código cru da tipologia; nulo na linha de grupo
  tipologia        text,
  -- o CÓDIGO do item da tabela VIDRO (nunca o nome de uma família de vidro)
  item_codigo      text        NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_por   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_vidro_padrao_materia_prima_fk FOREIGN KEY (materia_prima_id, tenant_id)
    REFERENCES public.orcamentista_materia_prima(id, tenant_id) ON DELETE CASCADE,
  -- uma linha é de GRUPO (tipo dito, tipologia nula) ou de EXCEÇÃO (tipologia dita, abertura e tipo nulos) — nunca as duas coisas
  CONSTRAINT orcamentista_vidro_padrao_grupo_ou_excecao CHECK (
    (tipologia IS NULL AND tipo IS NOT NULL) OR (tipologia IS NOT NULL AND tipo IS NULL AND abertura IS NULL)),
  CONSTRAINT orcamentista_vidro_padrao_abertura_forma CHECK (abertura IS NULL OR abertura IN ('porta', 'janela')),
  CONSTRAINT orcamentista_vidro_padrao_tipo_forma CHECK (tipo IS NULL OR tipo ~ '^[a-z][a-z-]{0,39}$'),
  CONSTRAINT orcamentista_vidro_padrao_tipologia_forma CHECK (tipologia IS NULL OR (tipologia = btrim(tipologia) AND length(tipologia) BETWEEN 1 AND 40)),
  CONSTRAINT orcamentista_vidro_padrao_item_codigo_forma CHECK (item_codigo = btrim(item_codigo) AND length(item_codigo) BETWEEN 1 AND 60),
  -- um padrão por grupo e um por tipologia, por matéria-prima: com NULLS NOT DISTINCT, o grupo sem abertura (maxim-ar) também é único
  CONSTRAINT orcamentista_vidro_padrao_uma_por_chave UNIQUE NULLS NOT DISTINCT (materia_prima_id, abertura, tipo, tipologia)
);

-- ── 2. RLS e as políticas, espelhadas de orcamentista_mp_categoria ──────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_vidro_padrao ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamentista_vidro_padrao_select_super_admin ON public.orcamentista_vidro_padrao FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_vidro_padrao_insert_super_admin ON public.orcamentista_vidro_padrao FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_vidro_padrao_update_super_admin ON public.orcamentista_vidro_padrao FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_vidro_padrao_delete_super_admin ON public.orcamentista_vidro_padrao FOR DELETE USING (public.is_super_admin());

-- ── 3. O GRANT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentista_vidro_padrao TO service_role;

-- ── 4. AS DUAS SEMENTES (De Paula, "Esquadrias de PVC WOLF") ────────────────────────────────────────────────────────────────────
INSERT INTO public.orcamentista_vidro_padrao (tenant_id, materia_prima_id, abertura, tipo, tipologia, item_codigo) VALUES
  ('20e08592-f957-4e72-b7eb-251387e34eb9', '79d764fe-4acd-43e2-bed9-38e20667ca3d', 'janela', 'correr',   NULL, 'VIN05'),
  ('20e08592-f957-4e72-b7eb-251387e34eb9', '79d764fe-4acd-43e2-bed9-38e20667ca3d', NULL,     'maxim-ar', NULL, 'VBO3,4');

DO $verifica$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_vidro_padrao'
     AND column_name IN ('id', 'tenant_id', 'materia_prima_id', 'abertura', 'tipo', 'tipologia', 'item_codigo', 'criado_em', 'atualizado_por', 'atualizado_em');
  IF v_n <> 10 THEN RAISE EXCEPTION 'verificacao: % de 10 colunas. Desfeito.', v_n; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_vidro_padrao'::regclass) THEN
    RAISE EXCEPTION 'verificacao: a RLS nao esta ligada. Desfeito.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid = 'public.orcamentista_vidro_padrao'::regclass;
  IF v_n <> 4 THEN RAISE EXCEPTION 'verificacao: % de 4 politicas. Desfeito.', v_n; END IF;
  IF NOT (has_table_privilege('service_role', 'public.orcamentista_vidro_padrao', 'SELECT')
      AND has_table_privilege('service_role', 'public.orcamentista_vidro_padrao', 'INSERT')
      AND has_table_privilege('service_role', 'public.orcamentista_vidro_padrao', 'UPDATE')
      AND has_table_privilege('service_role', 'public.orcamentista_vidro_padrao', 'DELETE')) THEN
    RAISE EXCEPTION 'verificacao: o service_role nao tem SELECT, INSERT, UPDATE e DELETE. Desfeito.';
  END IF;
  SELECT count(*) INTO v_n FROM public.orcamentista_vidro_padrao;
  IF v_n <> 2 THEN RAISE EXCEPTION 'verificacao: % linhas, esperadas 2. Desfeito.', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_vidro_padrao WHERE abertura = 'janela' AND tipo = 'correr' AND tipologia IS NULL AND item_codigo = 'VIN05')
     OR NOT EXISTS (SELECT 1 FROM public.orcamentista_vidro_padrao WHERE abertura IS NULL AND tipo = 'maxim-ar' AND tipologia IS NULL AND item_codigo = 'VBO3,4') THEN
    RAISE EXCEPTION 'verificacao: as sementes nao sao as autorizadas (janela correr VIN05; maxim-ar VBO3,4). Desfeito.';
  END IF;
  RAISE NOTICE 'vidro padrao por grupo: tabela criada, RLS e 4 politicas, GRANT ao service_role, 2 sementes (janela correr VIN05; maxim-ar VBO3,4)';
END
$verifica$;

COMMIT;

-- Conferência depois de aplicar (só leitura):
-- select abertura, tipo, tipologia, item_codigo from public.orcamentista_vidro_padrao order by tipo;
-- select polname from pg_policy where polrelid = 'public.orcamentista_vidro_padrao'::regclass order by 1;
-- select grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'orcamentista_vidro_padrao' group by grantee;
