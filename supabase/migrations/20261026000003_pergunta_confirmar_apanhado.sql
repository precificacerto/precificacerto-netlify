-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261026000003 — a pergunta CONFIRMAR_APANHADO na tabela da pergunta em aberto.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261026000003_pergunta_confirmar_apanhado.
-- ║ SEM ELA o código não quebra: gravar a pergunta CONFIRMAR_APANHADO é recusado pela CHECK antiga
-- ║ (23514), e a resposta é o levantamento formal, com o preço, como antes do apanhado. A linha [IA]
-- ║ diz `apanhado=sem_migracao`.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 26/10/2026: a primeira resposta a uma solicitação é o
-- APANHADO, sem preço; o levantamento formal, com o bloco de preço, só vem depois do "sim" do
-- vendedor. O "sim" responde a uma pergunta em aberto, e a pergunta mora nesta tabela — escolha
-- do dono do produto: "o apanhado pode existir ANTES de haver levantamento (cliente novo), e um
-- estado do levantamento não cobriria esse caso — a tabela da pergunta cobre."
--
-- O QUE FAZ: troca a CHECK de `pergunta` pela mesma lista com 'CONFIRMAR_APANHADO'. Nada mais:
-- nenhuma coluna, nenhuma linha. As linhas que existem continuam válidas (a lista só cresce).
--
-- IDEMPOTENTE: DROP CONSTRAINT IF EXISTS e ADD CONSTRAINT na mesma transação.
-- VERIFICAÇÃO (aborta): a CHECK com a definição nova, e as outras 4 constraints como estavam.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_pergunta_em_aberto') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_pergunta_em_aberto (20261026000002). Nada foi alterado.';
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_pergunta_em_aberto DROP CONSTRAINT IF EXISTS orcamentista_pergunta_em_aberto_pergunta_valida;
ALTER TABLE public.orcamentista_pergunta_em_aberto ADD CONSTRAINT orcamentista_pergunta_em_aberto_pergunta_valida
  CHECK (pergunta IN ('NOME_PARECIDO', 'SEM_NOME', 'CONFIRMAR_ACRESCIMO', 'CONFIRMAR_APANHADO'));

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_pergunta_em_aberto_pkey|PRIMARY KEY (tenant_id, remetente_id)',
    'orcamentista_pergunta_em_aberto_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_pergunta_em_aberto_remetente_fkey|FOREIGN KEY (remetente_id, tenant_id) REFERENCES orcamentista_remetente_autorizado(id, tenant_id)',
    'orcamentista_pergunta_em_aberto_pergunta_valida|CHECK ((pergunta = ANY (ARRAY[''NOME_PARECIDO''::text, ''SEM_NOME''::text, ''CONFIRMAR_ACRESCIMO''::text, ''CONFIRMAR_APANHADO''::text])))',
    'orcamentista_pergunta_em_aberto_itens_array|CHECK ((jsonb_typeof(itens) = ''array''::text))'
  ];
  e      text;
  p      text[];
  faltam text;
  n      int;
BEGIN
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.orcamentista_pergunta_em_aberto') AND conname = p[1]
                      AND pg_get_constraintdef(oid) = p[2]) THEN
      faltam := concat_ws('; ', faltam, p[1]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_pergunta_em_aberto');
  IF n <> 5 THEN
    RAISE EXCEPTION 'verificacao 2: a tabela tem % constraint(s), e devia ter 5. Nada foi alterado.', n;
  END IF;
  RAISE NOTICE 'orcamentista_pergunta_em_aberto: CHECK de pergunta com CONFIRMAR_APANHADO, e as 5 constraints.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_pergunta_em_aberto'::regclass order by 1;
-- -- esperado: 5 constraints, a _pergunta_valida com os 4 valores
