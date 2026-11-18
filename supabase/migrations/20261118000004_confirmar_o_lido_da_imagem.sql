-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261118000004 — a pergunta CONFIRMAR_DA_IMAGEM e os dados lidos da imagem que esperam o "sim".
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261118000004_confirmar_o_lido_da_imagem.
-- ║ SEM ELA o código não quebra: gravar a CONFIRMAR_DA_IMAGEM é recusado pela CHECK (23514) e a
-- ║ coluna não existe (a leitura cai na de antes); a conversa pergunta "de quem é?", como antes
-- ║ desta correção, e a linha [IA] diz `da_imagem=sem_migracao`.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — o defeito em produção de 18/11/2026, 18:42 (a foto funcionando): a imagem trazia, em letra de
-- forma, "janela de correr 2 folhas - 1,50 x 1,20 / janela maxim ar - 0,80 x 0,60 / Alfredo Soares / Barao",
-- e o agente perguntou "de quem é?". O nome lido da foto caiu na guarda que impede a IA de INVENTAR nome
-- (as palavras têm de estar no texto, e o texto gravado era "[imagem]"). Decisão: "o texto lido da imagem
-- conta como texto do vendedor para essa conferência. Mas não solte a guarda: o que vier só da imagem
-- (nome, cidade, vidro) vale COM CONFIRMAÇÃO CURTA antes de gravar — 'é do Alfredo Soares, de Barão?' — e
-- segue no sim."
--
-- O QUE FAZ:
--   1. troca a CHECK de `pergunta` pela mesma lista com 'CONFIRMAR_DA_IMAGEM' (a lista só cresce);
--   2. a coluna `dados_da_imagem jsonb` (NULA): o que foi lido só da imagem e espera o "sim" — a cidade
--      (`endereco`) e os vidros (`vidros`, para a pergunta se refazer igual) —; o nome vai em `nome` e as
--      esquadrias em `itens`, como nas outras perguntas.
-- Nenhuma linha muda.
-- GUARDA (aborta): a CHECK de hoje tem de ser a da 20261118000002 (5 códigos) ou já a desta.
-- VERIFICAÇÃO (aborta): a CHECK nova, a coluna jsonb nula, a CHECK de objeto, e as outras constraints.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE v_def text; v_tipo text;
BEGIN
  IF to_regclass('public.orcamentista_pergunta_em_aberto') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_pergunta_em_aberto no banco %. Nada foi alterado.', current_database();
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conrelid = to_regclass('public.orcamentista_pergunta_em_aberto') AND conname = 'orcamentista_pergunta_em_aberto_pergunta_valida';
  IF v_def IS DISTINCT FROM 'CHECK ((pergunta = ANY (ARRAY[''NOME_PARECIDO''::text, ''SEM_NOME''::text, ''CONFIRMAR_ACRESCIMO''::text, ''CONFIRMAR_APANHADO''::text, ''QUAL_ORCAMENTO''::text])))'
     AND v_def IS DISTINCT FROM 'CHECK ((pergunta = ANY (ARRAY[''NOME_PARECIDO''::text, ''SEM_NOME''::text, ''CONFIRMAR_ACRESCIMO''::text, ''CONFIRMAR_APANHADO''::text, ''QUAL_ORCAMENTO''::text, ''CONFIRMAR_DA_IMAGEM''::text])))' THEN
    RAISE EXCEPTION 'a CHECK de pergunta nao e a da 20261118000002 nem a desta: %. Nada foi alterado.', coalesce(v_def, '(ausente)');
  END IF;
  SELECT data_type INTO v_tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_pergunta_em_aberto' AND column_name = 'dados_da_imagem';
  IF v_tipo IS NOT NULL AND v_tipo <> 'jsonb' THEN
    RAISE EXCEPTION 'orcamentista_pergunta_em_aberto.dados_da_imagem ja existe com o tipo %, e devia ser jsonb. Nada foi alterado.', v_tipo;
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_pergunta_em_aberto DROP CONSTRAINT IF EXISTS orcamentista_pergunta_em_aberto_pergunta_valida;
ALTER TABLE public.orcamentista_pergunta_em_aberto ADD CONSTRAINT orcamentista_pergunta_em_aberto_pergunta_valida
  CHECK (pergunta IN ('NOME_PARECIDO', 'SEM_NOME', 'CONFIRMAR_ACRESCIMO', 'CONFIRMAR_APANHADO', 'QUAL_ORCAMENTO', 'CONFIRMAR_DA_IMAGEM'));

ALTER TABLE public.orcamentista_pergunta_em_aberto ADD COLUMN IF NOT EXISTS dados_da_imagem jsonb;
DO $objeto$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_pergunta_em_aberto_dados_da_imagem_objeto') THEN
    ALTER TABLE public.orcamentista_pergunta_em_aberto ADD CONSTRAINT orcamentista_pergunta_em_aberto_dados_da_imagem_objeto
      CHECK (dados_da_imagem IS NULL OR jsonb_typeof(dados_da_imagem) = 'object');
  END IF;
END
$objeto$;
COMMENT ON COLUMN public.orcamentista_pergunta_em_aberto.dados_da_imagem IS
  'Na CONFIRMAR_DA_IMAGEM (18/11/2026): o que foi lido SO da imagem (endereco = a cidade; vidros) e espera o sim do vendedor. NULA nas outras perguntas.';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_pergunta_em_aberto_pkey|PRIMARY KEY (tenant_id, remetente_id)',
    'orcamentista_pergunta_em_aberto_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_pergunta_em_aberto_remetente_fkey|FOREIGN KEY (remetente_id, tenant_id) REFERENCES orcamentista_remetente_autorizado(id, tenant_id)',
    'orcamentista_pergunta_em_aberto_pergunta_valida|CHECK ((pergunta = ANY (ARRAY[''NOME_PARECIDO''::text, ''SEM_NOME''::text, ''CONFIRMAR_ACRESCIMO''::text, ''CONFIRMAR_APANHADO''::text, ''QUAL_ORCAMENTO''::text, ''CONFIRMAR_DA_IMAGEM''::text])))',
    'orcamentista_pergunta_em_aberto_itens_array|CHECK ((jsonb_typeof(itens) = ''array''::text))',
    'orcamentista_pergunta_em_aberto_dados_da_imagem_objeto|CHECK (((dados_da_imagem IS NULL) OR (jsonb_typeof(dados_da_imagem) = ''object''::text)))'
  ];
  e text; p text[]; faltam text; n int;
BEGIN
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_pergunta_em_aberto') AND conname = p[1] AND pg_get_constraintdef(oid) = p[2]) THEN
      faltam := concat_ws('; ', faltam, p[1]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN RAISE EXCEPTION 'verificacao 1: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam; END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_pergunta_em_aberto');
  IF n <> 6 THEN RAISE EXCEPTION 'verificacao 2: a tabela tem % constraint(s), e devia ter 6. Nada foi alterado.', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_pergunta_em_aberto'
                  AND column_name = 'dados_da_imagem' AND data_type = 'jsonb' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 3: dados_da_imagem nao e jsonb nula sem default. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'orcamentista_pergunta_em_aberto: CHECK com CONFIRMAR_DA_IMAGEM, dados_da_imagem jsonb, e as 6 constraints.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco ──────
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.orcamentista_pergunta_em_aberto'::regclass order by 1;
-- -- esperado: 6 constraints, a _pergunta_valida com os 6 códigos e a _dados_da_imagem_objeto
-- select column_name, data_type, is_nullable from information_schema.columns where table_name = 'orcamentista_pergunta_em_aberto' and column_name = 'dados_da_imagem';
