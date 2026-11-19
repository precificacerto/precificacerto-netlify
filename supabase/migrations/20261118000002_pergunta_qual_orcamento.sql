-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261118000002 — a pergunta QUAL_ORCAMENTO na tabela da pergunta em aberto.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261118000002_pergunta_qual_orcamento.
-- ║ SEM ELA o código não quebra: gravar a pergunta QUAL_ORCAMENTO é recusado pela CHECK antiga
-- ║ (23514), e a conversa responde a lista dos orçamentos SEM guardá-la — a resposta seguinte
-- ║ ("o segundo") não acha a lista, e a linha [IA] diz `qual_orcamento=sem_migracao`.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 18/11/2026: "são DOIS PEDIDOS DIFERENTES, e cada um busca a
-- sua coisa". O pedido de ORÇAMENTO ("quero o orçamento do fulano") busca os orçamentos pelo nome;
-- com mais de um, pergunta qual, do mais recente ao mais antigo. A pergunta mora nesta tabela, e
-- precisa de código próprio — "OPÇÃO A [...] Reaproveitar o NOME_PARECIDO para guardar outra
-- pergunta é exatamente o tipo de coisa que custa caro seis meses depois — o código passa a mentir
-- sobre o que guarda."
--
-- O QUE A PERGUNTA GUARDA: em `levantamentos`, os levantamentos dos orçamentos da lista, na ordem da
-- lista. É verdade sobre o que guarda: o orçamento do agente tem levantamento, e um só por
-- levantamento (o índice único `orcamentista_orcamento_um_por_levantamento`, medido em 18/11/2026).
-- O orçamento MANUAL (sem levantamento) não entra na lista da conversa — medido: nenhum em produção.
--
-- O QUE FAZ: troca a CHECK de `pergunta` pela mesma lista com 'QUAL_ORCAMENTO'. Nada mais: nenhuma
-- coluna, nenhuma linha. As linhas que existem continuam válidas (a lista só cresce).
--
-- GUARDA (aborta, nada alterado): a CHECK de hoje tem de ser a da 20261026000003 (os quatro códigos)
-- ou já a desta (reaplicar). Outra definição — alguém mudou a lista por outro caminho — aborta
-- nomeando a que achou, em vez de apagá-la por cima.
-- VERIFICAÇÃO (aborta): a CHECK com a definição nova, e as outras 4 constraints como estavam.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE v_def text;
BEGIN
  IF to_regclass('public.orcamentista_pergunta_em_aberto') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_pergunta_em_aberto (20261026000002) no banco %. Nada foi alterado.', current_database();
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conrelid = to_regclass('public.orcamentista_pergunta_em_aberto') AND conname = 'orcamentista_pergunta_em_aberto_pergunta_valida';
  IF v_def IS DISTINCT FROM 'CHECK ((pergunta = ANY (ARRAY[''NOME_PARECIDO''::text, ''SEM_NOME''::text, ''CONFIRMAR_ACRESCIMO''::text, ''CONFIRMAR_APANHADO''::text])))'
     AND v_def IS DISTINCT FROM 'CHECK ((pergunta = ANY (ARRAY[''NOME_PARECIDO''::text, ''SEM_NOME''::text, ''CONFIRMAR_ACRESCIMO''::text, ''CONFIRMAR_APANHADO''::text, ''QUAL_ORCAMENTO''::text])))' THEN
    RAISE EXCEPTION 'a CHECK de pergunta nao e a da 20261026000003 nem a desta: %. Nada foi alterado.', coalesce(v_def, '(ausente)');
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_pergunta_em_aberto DROP CONSTRAINT IF EXISTS orcamentista_pergunta_em_aberto_pergunta_valida;
ALTER TABLE public.orcamentista_pergunta_em_aberto ADD CONSTRAINT orcamentista_pergunta_em_aberto_pergunta_valida
  CHECK (pergunta IN ('NOME_PARECIDO', 'SEM_NOME', 'CONFIRMAR_ACRESCIMO', 'CONFIRMAR_APANHADO', 'QUAL_ORCAMENTO'));

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_pergunta_em_aberto_pkey|PRIMARY KEY (tenant_id, remetente_id)',
    'orcamentista_pergunta_em_aberto_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_pergunta_em_aberto_remetente_fkey|FOREIGN KEY (remetente_id, tenant_id) REFERENCES orcamentista_remetente_autorizado(id, tenant_id)',
    'orcamentista_pergunta_em_aberto_pergunta_valida|CHECK ((pergunta = ANY (ARRAY[''NOME_PARECIDO''::text, ''SEM_NOME''::text, ''CONFIRMAR_ACRESCIMO''::text, ''CONFIRMAR_APANHADO''::text, ''QUAL_ORCAMENTO''::text])))',
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
  RAISE NOTICE 'orcamentista_pergunta_em_aberto: CHECK de pergunta com QUAL_ORCAMENTO, e as 5 constraints.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_pergunta_em_aberto'::regclass order by 1;
-- -- esperado: 5 constraints, a _pergunta_valida com os 5 valores
