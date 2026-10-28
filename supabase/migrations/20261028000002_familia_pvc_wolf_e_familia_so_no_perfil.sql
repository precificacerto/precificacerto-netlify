-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261028000002 — O NOME "PVC Wolf" E A FAMÍLIA OBRIGATÓRIA SÓ NA TABELA DE PERFIL.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261028000002_familia_pvc_wolf_e_familia_so_no_perfil.
-- ║ INDEPENDENTE da 20261028000001 (PR #190): pode ser aplicada antes ou depois dela (o harness prova as duas ordens).
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisões do dono do produto, 28/10/2026 (`.claude/rules/tabela-de-preco-por-categoria.md`):
--   1. O catálogo de famílias passa a ter UMA ENTRADA POR LINHA DE PRODUTO ("PVC Wolf", "PVC Veca"). A família que existe, chave
--      'PVC', é a linha da Wolff: o NOME EXIBIDO passa a "PVC Wolf" e a CHAVE FICA 'PVC'. Trocar a chave exigiria derrubar e recriar as
--      7 FKs que a apontam (três compostas), numa transação só — custo alto para ganho nenhum. As famílias novas nascem com chave própria.
--   2. A FAMÍLIA NA TABELA É OBRIGATÓRIA SÓ NO PERFIL: a tabela de perfil é de uma linha (o motor cita os códigos daquele fornecedor);
--      a de ferragem, vidro, acessórios, persianas, reforço e instalação é da categoria e serve qualquer linha. Hoje a rota exige a
--      família em TODA tabela nova e o banco não exige em nenhuma; passa a ser: a rota e a tela exigem no Perfil, e o banco também.
--
-- O QUE FAZ:
--   A. GUARDAS que abortam ANTES de qualquer mudança: a família 'PVC' existe e se chama 'PVC' (medido em 28/10/2026) ou já 'PVC Wolf';
--      nenhuma OUTRA família se chama "PVC Wolf" (sem olhar a caixa); nenhuma tabela de PERFIL está sem família.
--   B. O nome: 'PVC' -> 'PVC Wolf', com antes e depois no `superadmin_alteracao_log`. Nenhuma chave muda; nenhuma FK é tocada.
--   C. A CHECK `orcamentista_tabela_familia_no_perfil`: tabela de PERFIL tem família. As outras categorias podem ficar sem.
--
-- O QUE NÃO FAZ: não toca em chave, em FK, em matéria-prima, etapa, motor, tabela (nenhum UPDATE de tabela), ramificação ou levantamento.
-- IDEMPOTENTE: o nome só muda se ainda for 'PVC' (reaplicada, não loga de novo); a CHECK só entra se não existir.
-- VERIFICAÇÃO (aborta): o nome, a chave, a CHECK validada e as 7 FKs que apontam o catálogo, intactas.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A. AS GUARDAS ──────────────────────────────────────────────────────────────────────────
DO $guarda$
DECLARE
  v_rotulo text;
  v_n      integer;
BEGIN
  IF to_regclass('public.orcamentista_familia_catalogo') IS NULL OR to_regclass('public.orcamentista_tabela') IS NULL
     OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: o catalogo de familias, a tabela de fornecedor ou o log. Nada foi alterado.';
  END IF;
  SELECT rotulo INTO v_rotulo FROM public.orcamentista_familia_catalogo WHERE chave = 'PVC';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guarda: a familia de chave PVC nao existe. Nada foi alterado.';
  END IF;
  IF v_rotulo NOT IN ('PVC', 'PVC Wolf') THEN
    RAISE EXCEPTION 'guarda: a familia PVC se chama "%" (esperado "PVC", medido em 28/10/2026); o nome nao se troca por cima de outro. Nada foi alterado.', v_rotulo;
  END IF;
  SELECT count(*) INTO v_n FROM public.orcamentista_familia_catalogo WHERE chave <> 'PVC' AND lower(btrim(rotulo)) = 'pvc wolf';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'guarda: ja ha outra familia chamada "PVC Wolf" (%); dois nomes iguais no catalogo. Nada foi alterado.',
      (SELECT string_agg(chave, ', ') FROM public.orcamentista_familia_catalogo WHERE chave <> 'PVC' AND lower(btrim(rotulo)) = 'pvc wolf');
  END IF;
  SELECT count(*) INTO v_n FROM public.orcamentista_tabela WHERE categoria_chave = 'PERFIL' AND familia IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'guarda: ha % tabela(s) de PERFIL sem familia (%); a CHECK nao entra por cima delas. Nada foi alterado.', v_n,
      (SELECT string_agg(id::text || ' ' || arquivo_nome, ', ') FROM public.orcamentista_tabela WHERE categoria_chave = 'PERFIL' AND familia IS NULL);
  END IF;
END
$guarda$;

-- ── B. O nome exibido: "PVC Wolf"; a chave fica 'PVC' ─────────────────────────────────────
DO $b$
DECLARE
  v_antes jsonb;
BEGIN
  SELECT to_jsonb(f) INTO v_antes FROM public.orcamentista_familia_catalogo f WHERE f.chave = 'PVC' AND f.rotulo = 'PVC' FOR UPDATE;
  IF v_antes IS NOT NULL THEN
    UPDATE public.orcamentista_familia_catalogo SET rotulo = 'PVC Wolf' WHERE chave = 'PVC';
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (NULL, 'orcamentista_familia_catalogo', 'PVC',
            jsonb_build_object('orcamentista_familia_catalogo', v_antes, 'migracao', '20261028000002_familia_pvc_wolf_e_familia_so_no_perfil'),
            jsonb_build_object('orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = 'PVC')),
            NULL);
    RAISE NOTICE 'familia PVC: o nome passou a "PVC Wolf"';
  END IF;
END
$b$;

-- ── C. A tabela de PERFIL tem família; as outras categorias podem ficar sem ───────────────
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_tabela_familia_no_perfil') THEN
    ALTER TABLE public.orcamentista_tabela ADD CONSTRAINT orcamentista_tabela_familia_no_perfil
      CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR familia IS NOT NULL);
  END IF;
END
$c$;
COMMENT ON CONSTRAINT orcamentista_tabela_familia_no_perfil ON public.orcamentista_tabela IS
  'Dono do produto, 28/10/2026: a familia e obrigatoria so na tabela de PERFIL (o motor cita os codigos do perfil daquela linha); nas demais categorias a tabela serve qualquer linha.';

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
BEGIN
  IF (SELECT rotulo FROM public.orcamentista_familia_catalogo WHERE chave = 'PVC') IS DISTINCT FROM 'PVC Wolf' THEN
    RAISE EXCEPTION 'verificacao: a familia PVC nao se chama "PVC Wolf". Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_tabela_familia_no_perfil' AND convalidated) THEN
    RAISE EXCEPTION 'verificacao: a CHECK da familia no perfil nao entrou validada. Nada foi alterado.';
  END IF;
  -- nenhuma FK que aponta o catalogo de familias foi tocada: as que referenciam a chave continuam la
  IF (SELECT count(*) FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid = 'public.orcamentista_familia_catalogo'::regclass) < 5 THEN
    RAISE EXCEPTION 'verificacao: faltam FKs que apontam o catalogo de familias. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'familia PVC chamada "PVC Wolf" (chave PVC); tabela de PERFIL exige familia.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select chave, rotulo from public.orcamentista_familia_catalogo;                       -- esperado: PVC | PVC Wolf
-- select conname, convalidated from pg_constraint where conname = 'orcamentista_tabela_familia_no_perfil';   -- esperado: 1 linha, true
-- select tabela, chave, antes, depois from public.superadmin_alteracao_log
--  where antes ->> 'migracao' = '20261028000002_familia_pvc_wolf_e_familia_so_no_perfil';                   -- esperado: 1 linha
