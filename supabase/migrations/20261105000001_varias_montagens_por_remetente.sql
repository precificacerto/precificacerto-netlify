-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261105000001 — várias montagens por remetente: cai o índice único parcial `orcamentista_levantamento_um_em_montagem`.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261105000001_varias_montagens_por_remetente.
-- ║ SEM ELA o código do PR quebra no caso que ele corrige: com um levantamento EM_MONTAGEM aberto, a mensagem
-- ║ que traz OUTRO cliente (ou "novo", ou chega depois de 24 h) cria um segundo EM_MONTAGEM para o mesmo
-- ║ remetente, e o INSERT é recusado pelo índice (23505). O vendedor recebe "Não consegui concluir: houve um
-- ║ erro ao gravar o levantamento" e a linha [IA] diz `desfecho=erro motivo="orcamentista_levantamento:
-- ║ duplicate key value violates unique constraint"`.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 05/11/2026 (o caso da Maria Cristina: "Cliente: Maria Cristina" virou
-- levantamento "Jorge Koss" porque a montagem aberta duas horas antes absorveu a mensagem): em MONTAGEM, a mensagem
-- que traz cliente DIFERENTE, ou pede "novo", abre levantamento NOVO em vez de absorver; e a montagem EXPIRA em 24 h
-- sem toque, como a pergunta em aberto. O levantamento antigo fica como está — EM_MONTAGEM, alcançável pelo nome —
-- e o novo nasce EM_MONTAGEM enquanto faltar campo. Dois EM_MONTAGEM do mesmo remetente, portanto; o índice que
-- garantia "no máximo UM" (20261025000003) impede a decisão, e cai. Alternativas descartadas pelo dono do produto
-- em 05/11/2026: um estado ABANDONADO (mais código e o índice continuaria), fechar o antigo como COMPLETO (mentiria)
-- e recuar na decisão A.
--
-- O QUE FAZ:
--   1. DROP INDEX IF EXISTS public.orcamentista_levantamento_um_em_montagem.
-- Só isso. Nenhuma linha é alterada, nada é apagado além do índice, nenhuma coluna muda. O código escolhe a montagem
-- que captura a mensagem: a mais recentemente tocada (`atualizado_em`) há menos de 24 h.
-- MEDIDO em produção em 05/11/2026 às 17h UTC: o índice existe com a definição exata abaixo; 4 levantamentos, 0 EM_MONTAGEM.
--
-- IDEMPOTENTE: DROP INDEX IF EXISTS.
-- GUARDA (aborta): a tabela existe; se o índice existe, tem a definição medida (um índice de mesmo nome e outra
-- forma não é o nosso, e não é derrubado às cegas).
-- VERIFICAÇÃO (aborta): o índice não existe mais; os outros três índices da tabela e as constraints de antes
-- continuam como medidos em produção em 05/11/2026 — inclusive `orcamentista_levantamento_nome_key` (um por
-- remetente e nome) e o CHECK do estado (EM_MONTAGEM | COMPLETO), que NÃO mudam.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  def text;
BEGIN
  IF to_regclass('public.orcamentista_levantamento') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_levantamento. Nada foi alterado.';
  END IF;
  SELECT indexdef INTO def FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'orcamentista_levantamento' AND indexname = 'orcamentista_levantamento_um_em_montagem';
  IF def IS NOT NULL AND def <> 'CREATE UNIQUE INDEX orcamentista_levantamento_um_em_montagem ON public.orcamentista_levantamento USING btree (tenant_id, remetente_id) WHERE (estado = ''EM_MONTAGEM''::text)' THEN
    RAISE EXCEPTION 'orcamentista_levantamento_um_em_montagem existe com outra definicao: %. Nada foi alterado.', def;
  END IF;
END
$guarda$;

DROP INDEX IF EXISTS public.orcamentista_levantamento_um_em_montagem;

COMMENT ON TABLE public.orcamentista_levantamento IS
  'Levantamento do orcamentista, achado pelo nome. Unico por (tenant, remetente, nome_normalizado). Varios EM_MONTAGEM por remetente desde 20261105000001: a mensagem sem nome cai no mais recentemente tocado ha menos de 24 h. nome_normalizado e escrito pelo codigo (minuscula, sem acento, espacos colapsados).';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_levantamento_pkey|PRIMARY KEY (id)',
    'orcamentista_levantamento_id_tenant_key|UNIQUE (id, tenant_id)',
    'orcamentista_levantamento_nome_key|UNIQUE (tenant_id, remetente_id, nome_normalizado)',
    'orcamentista_levantamento_estado_valido|CHECK ((estado = ANY (ARRAY[''EM_MONTAGEM''::text, ''COMPLETO''::text])))',
    'orcamentista_levantamento_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_levantamento_remetente_fkey|FOREIGN KEY (remetente_id, tenant_id) REFERENCES orcamentista_remetente_autorizado(id, tenant_id)'
  ];
  indices text[] := ARRAY[
    'orcamentista_levantamento_pkey|CREATE UNIQUE INDEX orcamentista_levantamento_pkey ON public.orcamentista_levantamento USING btree (id)',
    'orcamentista_levantamento_id_tenant_key|CREATE UNIQUE INDEX orcamentista_levantamento_id_tenant_key ON public.orcamentista_levantamento USING btree (id, tenant_id)',
    'orcamentista_levantamento_nome_key|CREATE UNIQUE INDEX orcamentista_levantamento_nome_key ON public.orcamentista_levantamento USING btree (tenant_id, remetente_id, nome_normalizado)'
  ];
  e      text;
  p      text[];
  faltam text;
  n      int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_levantamento_um_em_montagem') THEN
    RAISE EXCEPTION 'verificacao 1: o indice orcamentista_levantamento_um_em_montagem ainda existe. Nada foi alterado.';
  END IF;
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.orcamentista_levantamento') AND conname = p[1] AND pg_get_constraintdef(oid) = p[2]) THEN
      faltam := concat_ws('; ', faltam, p[1]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 2: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_levantamento');
  IF n <> 6 THEN
    RAISE EXCEPTION 'verificacao 3: orcamentista_levantamento tem % constraint(s), e devia ter 6. Nada foi alterado.', n;
  END IF;
  FOREACH e IN ARRAY indices LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = p[1] AND indexdef = p[2]) THEN
      faltam := concat_ws('; ', faltam, p[1]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 4: indice ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'orcamentista_levantamento';
  IF n <> 3 THEN
    RAISE EXCEPTION 'verificacao 5: orcamentista_levantamento tem % indice(s), e devia ter 3. Nada foi alterado.', n;
  END IF;
  RAISE NOTICE 'orcamentista_levantamento sem o indice um_em_montagem; os 3 indices e as 6 constraints de antes como estavam.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select indexname from pg_indexes where schemaname = 'public' and tablename = 'orcamentista_levantamento' order by 1;
-- -- esperado: 3 linhas — orcamentista_levantamento_id_tenant_key, orcamentista_levantamento_nome_key,
-- --           orcamentista_levantamento_pkey (sem orcamentista_levantamento_um_em_montagem)
-- select count(*) from pg_constraint where conrelid = 'public.orcamentista_levantamento'::regclass;
-- -- esperado: 6
