-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000007 — O ARQUIVO DO MOTOR SÓ É EXIGIDO NA TABELA DE PERFIL.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261027000007_motor_so_para_perfil.
-- ║ SEM ELA O CÓDIGO QUEBRA: a rota que grava tabela de Reforço ou de Acessórios sem arquivo de motor
-- ║ responde 500 (NOT NULL em motor_path e motor_nome), e o dono do produto não consegue subi-las.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 27/10/2026: "Hoje toda tabela nova exige arquivo de motor, e isso impede
-- subir a tabela de Reforço e a de Acessórios da Wolff, que são preço puro. Exija o arquivo do motor apenas quando
-- categoria_chave = 'PERFIL'. O motor tem casa própria agora (orcamentista_motor); não precisa mais viajar colado
-- na tabela de preço."
--
-- O QUE FAZ — e só isto:
--   A. `orcamentista_tabela.motor_path` e `motor_nome` deixam de ser NOT NULL.
--   B. CHECK `orcamentista_tabela_motor_par`: os dois andam juntos (os dois nulos ou os dois preenchidos). Um
--      arquivo sem nome, ou um nome sem arquivo, nunca fica gravado.
--   C. CHECK `orcamentista_tabela_perfil_exige_motor`: tabela de categoria PERFIL tem o arquivo do motor. É a
--      terceira trava da regra (a rota e a tela recusam antes). Categoria nula (as tabelas de antes) e as demais
--      categorias não exigem.
--
-- O QUE NÃO FAZ:
--   - NENHUM UPDATE de dado. As duas tabelas de hoje (Wolff e Estrela) têm o motor preenchido e categoria nula: as
--     duas CHECK passam por elas como estão (a verificação abaixo confere isso por contagem).
--   - NÃO apaga o motor de ninguém: tabela que já tem arquivo de motor continua com ele.
--
-- IDEMPOTENTE: DROP NOT NULL, e as CHECK só se ausentes.
-- VERIFICAÇÃO (aborta): as duas colunas nulas, as duas CHECK com a definição, e nenhuma linha existente fora delas.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_tabela') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_tabela. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela' AND column_name = 'categoria_chave') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_tabela.categoria_chave (20261027000005). Nada foi alterado.';
  END IF;
  -- as CHECK novas teriam de passar por TODA linha de hoje: se alguma tem só um dos dois, ou é PERFIL sem motor, a migração para
  IF EXISTS (SELECT 1 FROM public.orcamentista_tabela WHERE (motor_path IS NULL) <> (motor_nome IS NULL)) THEN
    RAISE EXCEPTION 'ha tabela com motor_path e motor_nome fora de par. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orcamentista_tabela WHERE categoria_chave = 'PERFIL' AND motor_path IS NULL) THEN
    RAISE EXCEPTION 'ha tabela PERFIL sem motor. Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. o motor deixa de ser obrigatório na coluna ──────────────────────────────────────────
ALTER TABLE public.orcamentista_tabela ALTER COLUMN motor_path DROP NOT NULL;
ALTER TABLE public.orcamentista_tabela ALTER COLUMN motor_nome DROP NOT NULL;

-- ── B e C. as duas regras, no banco ────────────────────────────────────────────────────────
DO $checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela'::regclass AND conname = 'orcamentista_tabela_motor_par') THEN
    ALTER TABLE public.orcamentista_tabela
      ADD CONSTRAINT orcamentista_tabela_motor_par CHECK ((motor_path IS NULL) = (motor_nome IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela'::regclass AND conname = 'orcamentista_tabela_perfil_exige_motor') THEN
    ALTER TABLE public.orcamentista_tabela
      ADD CONSTRAINT orcamentista_tabela_perfil_exige_motor CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR motor_path IS NOT NULL);
  END IF;
END
$checks$;
COMMENT ON COLUMN public.orcamentista_tabela.motor_path IS
  'O arquivo do motor desta tabela. Obrigatorio so na tabela de categoria PERFIL (CHECK orcamentista_tabela_perfil_exige_motor); nulo nas de preco puro (Reforco, Acessorios...). O motor tem casa propria em orcamentista_motor.';

DO $verifica$
DECLARE
  def text;
BEGIN
  -- (1) as duas colunas aceitam nulo
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela'
        AND column_name IN ('motor_path', 'motor_nome') AND is_nullable = 'YES') <> 2 THEN
    RAISE EXCEPTION 'verificacao 1: motor_path e motor_nome ainda sao obrigatorios. Nada foi alterado.';
  END IF;
  -- (2) a CHECK do par
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela'::regclass AND conname = 'orcamentista_tabela_motor_par';
  IF def IS DISTINCT FROM 'CHECK (((motor_path IS NULL) = (motor_nome IS NULL)))' THEN
    RAISE EXCEPTION 'verificacao 2: CHECK orcamentista_tabela_motor_par ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  -- (3) a CHECK do PERFIL
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela'::regclass AND conname = 'orcamentista_tabela_perfil_exige_motor';
  IF def IS DISTINCT FROM 'CHECK (((categoria_chave IS DISTINCT FROM ''PERFIL''::text) OR (motor_path IS NOT NULL)))' THEN
    RAISE EXCEPTION 'verificacao 3: CHECK orcamentista_tabela_perfil_exige_motor ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  RAISE NOTICE 'motor so para PERFIL: colunas opcionais e as duas CHECK.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, is_nullable from information_schema.columns where table_name='orcamentista_tabela' and column_name in ('motor_path','motor_nome');  -- YES e YES
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('orcamentista_tabela_motor_par','orcamentista_tabela_perfil_exige_motor');
-- select id, motor_nome, categoria_chave from public.orcamentista_tabela;   -- esperado: as 2, com motor, categoria nula
