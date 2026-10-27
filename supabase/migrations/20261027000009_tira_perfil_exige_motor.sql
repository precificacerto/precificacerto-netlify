-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000009 — SAI A EXIGÊNCIA DO MOTOR NA TABELA DE PERFIL: remove a CHECK `orcamentista_tabela_perfil_exige_motor`.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261027000009_tira_perfil_exige_motor.
-- ║ SEM ELA O CÓDIGO NOVO QUEBRA: a rota deixa de exigir o arquivo do motor na tabela de Perfil, e o banco
-- ║ responde 500 (23514, `orcamentista_tabela_perfil_exige_motor`) a quem sobe a tabela de Perfil sem ele.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ Pressupõe a 20261027000007 (aplicada e conferida em 27/10/2026).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 27/10/2026, à noite: "O MOTOR MORA NA FAMÍLIA, NA BASE DE CONHECIMENTO." O motor entra
-- pela ETAPA da família (`orcamentista_familia_etapa.motor_id` -> `orcamentista_motor`), não pela tabela de preço. Por essa correção a
-- tabela de Perfil NÃO leva arquivo de motor, e a regra "Perfil exige motor" passou a pedir um arquivo que não é dela. Pior: o motor
-- subido e IMPORTADO na tabela grava por `tabela_id`, e a conversa recusa duas tabelas com motor do mesmo fornecedor e família
-- (`TABELA_REPETIDA`) — a conversa da De Paula pararia.
--
-- A CHECK NASCEU DE MANHÃ E SAIU À NOITE. A `20261027000007` (aplicada no mesmo dia) a criou porque, de manhã, "tirar o motor do
-- preço puro" era a decisão: Reforço e Acessórios sobem sem motor, e só o Perfil o exigia. Ela não estava ERRADA — fazia o que se
-- pediu, e a versão final dela (caminho com algum caractere, não só `IS NOT NULL`) foi até corrigida por um achado do dono do produto.
-- O que mudou foi o DESENHO: à noite o motor passou a morar na família, e a exigência perdeu a razão de existir.
--
-- O QUE FAZ — e só isto:
--   A. `DROP CONSTRAINT IF EXISTS orcamentista_tabela_perfil_exige_motor`. É uma restrição, não dado: nenhuma linha é lida, escrita
--      ou apagada.
--   B. atualiza o COMMENT de `motor_path` (o texto de antes dizia que o Perfil o exigia).
--
-- O QUE NÃO FAZ:
--   - NÃO toca na `orcamentista_tabela_motor_par`: um arquivo sem nome, ou um nome sem arquivo, continua recusado (a verificação
--     abaixo confere a definição exata).
--   - NÃO apaga as colunas `motor_path` e `motor_nome` (PR F, do dono do produto) nem muda a nulidade delas.
--   - NENHUM UPDATE, nenhum DELETE, nenhum DROP de dado.
--
-- IDEMPOTENTE: `DROP CONSTRAINT IF EXISTS`; o COMMENT se repete igual.
-- VERIFICAÇÃO (aborta): a CHECK do Perfil ausente, a do par presente com a definição exata, as duas colunas ainda nulas.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_tabela') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_tabela. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela'::regclass AND conname = 'orcamentista_tabela_motor_par') THEN
    RAISE EXCEPTION 'dependencia ausente: a CHECK orcamentista_tabela_motor_par (20261027000007). Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. a exigência sai ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_tabela DROP CONSTRAINT IF EXISTS orcamentista_tabela_perfil_exige_motor;

-- ── B. o comentário acompanha ──────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.orcamentista_tabela.motor_path IS
  'O arquivo do motor desta tabela. Opcional em toda categoria: o motor mora na familia, em orcamentista_motor, e entra pela etapa da familia (orcamentista_familia_etapa.motor_id). Nulo e o normal da tabela de preco; o par motor_path/motor_nome anda junto (CHECK orcamentista_tabela_motor_par).';

DO $verifica$
DECLARE
  def text;
BEGIN
  -- (1) a CHECK do Perfil saiu
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela'::regclass AND conname = 'orcamentista_tabela_perfil_exige_motor') THEN
    RAISE EXCEPTION 'verificacao 1: a CHECK orcamentista_tabela_perfil_exige_motor ainda existe. Nada foi alterado.';
  END IF;
  -- (2) a CHECK do par ficou, com a definição exata
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela'::regclass AND conname = 'orcamentista_tabela_motor_par';
  IF def IS DISTINCT FROM 'CHECK (((motor_path IS NULL) = (motor_nome IS NULL)))' THEN
    RAISE EXCEPTION 'verificacao 2: CHECK orcamentista_tabela_motor_par ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (3) as colunas seguem aceitando nulo
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela'
        AND column_name IN ('motor_path', 'motor_nome') AND is_nullable = 'YES') <> 2 THEN
    RAISE EXCEPTION 'verificacao 3: motor_path e motor_nome deixaram de aceitar nulo. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'motor opcional em toda categoria: a CHECK do Perfil saiu, a do par ficou.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.orcamentista_tabela'::regclass and conname like 'orcamentista_tabela_%motor%';
--   -- esperado: SÓ orcamentista_tabela_motor_par  CHECK (((motor_path IS NULL) = (motor_nome IS NULL)))
-- select id, categoria_chave, length(motor_path), length(motor_nome) from public.orcamentista_tabela;   -- esperado: as 2 como estavam (Wolff 99/19, Estrela 0/0)
