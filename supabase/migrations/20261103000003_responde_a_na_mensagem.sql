-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261103000003 — a saída que responde a uma entrada (`responde_a`), e o índice da conversa por remetente.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261103000003_responde_a_na_mensagem.
-- ║ SEM ELA o código não quebra: a conversa grava a saída sem `responde_a` (o PostgREST recusa a coluna, e
-- ║ o código regrava sem ela) e o reenvio do WUZAPI de uma mensagem já gravada responde 200 sem conduzir e
-- ║ sem reenviar — o comportamento de antes de 25/10/2026. A linha [IA] diz `gravacao=sem_migracao`.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 03/11/2026: "a conversa VOLTA a ser gravada", dentro do tenant, para
-- dois fins. HISTÓRICO: o modelo recebe as últimas mensagens da conversa. IDEMPOTÊNCIA: a mesma mensagem
-- nunca é conduzida duas vezes, e o reenvio do WUZAPI (o mesmo Info.ID) devolve 200 sem conduzir de novo;
-- só reenvia quando o primeiro envio falhou de fato. Para saber se a resposta de uma entrada saiu, a saída
-- precisa dizer A QUAL entrada responde: é a coluna `responde_a`. E a conversa do remetente é achada por
-- (tenant_id, remetente_id), a mais recente: é o índice.
--
-- O QUE FAZ:
--   1. `orcamentista_mensagem.responde_a uuid NULL`, FK para `orcamentista_mensagem(id)` ON DELETE SET NULL —
--      apagar a entrada não apaga a saída, só desliga o laço. Índice parcial em `responde_a` (só as preenchidas).
--   2. `orcamentista_conversa_remetente_idx (tenant_id, remetente_id, criado_em DESC)`. MEDIDO em 03/11/2026 às
--      19h UTC: este índice JÁ EXISTE em produção com esta definição exata; aqui ele é IF NOT EXISTS, e a
--      verificação confere a definição — um índice de mesmo nome e outra forma aborta.
-- Nenhuma linha é alterada, nada expira e nada é apagado (retenção de 12 meses fica para PR própria).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, a FK só se não existe, CREATE INDEX IF NOT EXISTS.
-- GUARDA (aborta): as duas tabelas existem; `responde_a` já existente com outro tipo.
-- VERIFICAÇÃO (aborta): a coluna uuid, nula, sem default; a FK com a definição; os dois índices com a definição;
-- as constraints de antes das duas tabelas como estavam (medidas em produção em 03/11/2026).
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  tipo text;
BEGIN
  IF to_regclass('public.orcamentista_mensagem') IS NULL OR to_regclass('public.orcamentista_conversa') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_mensagem ou public.orcamentista_conversa. Nada foi alterado.';
  END IF;
  SELECT udt_name INTO tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_mensagem' AND column_name = 'responde_a';
  IF tipo IS NOT NULL AND tipo <> 'uuid' THEN
    RAISE EXCEPTION 'orcamentista_mensagem.responde_a ja existe com o tipo %, e devia ser uuid. Nada foi alterado.', tipo;
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_mensagem ADD COLUMN IF NOT EXISTS responde_a uuid NULL;

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_mensagem') AND conname = 'orcamentista_mensagem_responde_a_fkey') THEN
    ALTER TABLE public.orcamentista_mensagem ADD CONSTRAINT orcamentista_mensagem_responde_a_fkey
      FOREIGN KEY (responde_a) REFERENCES public.orcamentista_mensagem(id) ON DELETE SET NULL;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS orcamentista_mensagem_responde_a_idx
  ON public.orcamentista_mensagem USING btree (responde_a) WHERE (responde_a IS NOT NULL);

CREATE INDEX IF NOT EXISTS orcamentista_conversa_remetente_idx
  ON public.orcamentista_conversa USING btree (tenant_id, remetente_id, criado_em DESC);

COMMENT ON COLUMN public.orcamentista_mensagem.responde_a IS
  'Na saida: a entrada a que ela responde (20261103000003). Nula na entrada, e na saida gravada antes desta migracao.';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_mensagem|orcamentista_mensagem_pkey|PRIMARY KEY (id)',
    'orcamentista_mensagem|orcamentista_mensagem_tenant_id_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_mensagem|orcamentista_mensagem_conversa_fkey|FOREIGN KEY (conversa_id, tenant_id) REFERENCES orcamentista_conversa(id, tenant_id) ON DELETE CASCADE',
    'orcamentista_mensagem|orcamentista_mensagem_direcao_check|CHECK ((direcao = ANY (ARRAY[''entrada''::text, ''saida''::text])))',
    'orcamentista_mensagem|orcamentista_mensagem_responde_a_fkey|FOREIGN KEY (responde_a) REFERENCES orcamentista_mensagem(id) ON DELETE SET NULL',
    'orcamentista_conversa|orcamentista_conversa_pkey|PRIMARY KEY (id)',
    'orcamentista_conversa|orcamentista_conversa_id_tenant_key|UNIQUE (id, tenant_id)',
    'orcamentista_conversa|orcamentista_conversa_tenant_id_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_conversa|orcamentista_conversa_remetente_fkey|FOREIGN KEY (remetente_id, tenant_id) REFERENCES orcamentista_remetente_autorizado(id, tenant_id) ON DELETE RESTRICT'
  ];
  indices text[] := ARRAY[
    'orcamentista_mensagem_responde_a_idx|CREATE INDEX orcamentista_mensagem_responde_a_idx ON public.orcamentista_mensagem USING btree (responde_a) WHERE (responde_a IS NOT NULL)',
    'orcamentista_conversa_remetente_idx|CREATE INDEX orcamentista_conversa_remetente_idx ON public.orcamentista_conversa USING btree (tenant_id, remetente_id, criado_em DESC)',
    'orcamentista_mensagem_entrada_unica|CREATE UNIQUE INDEX orcamentista_mensagem_entrada_unica ON public.orcamentista_mensagem USING btree (tenant_id, wuzapi_mensagem_id) WHERE ((direcao = ''entrada''::text) AND (wuzapi_mensagem_id IS NOT NULL))',
    'orcamentista_mensagem_conversa_idx|CREATE INDEX orcamentista_mensagem_conversa_idx ON public.orcamentista_mensagem USING btree (conversa_id, criado_em)'
  ];
  e      text;
  p      text[];
  faltam text;
  n      int;
  col    record;
BEGIN
  SELECT data_type, is_nullable, column_default INTO col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_mensagem' AND column_name = 'responde_a';
  IF col IS NULL OR col.data_type <> 'uuid' OR col.is_nullable <> 'YES' OR col.column_default IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_mensagem.responde_a devia ser uuid, nula e sem default. Nada foi alterado.';
  END IF;
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.' || p[1]) AND conname = p[2] AND pg_get_constraintdef(oid) = p[3]) THEN
      faltam := concat_ws('; ', faltam, p[2]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 2: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_mensagem');
  IF n <> 5 THEN
    RAISE EXCEPTION 'verificacao 3: orcamentista_mensagem tem % constraint(s), e devia ter 5. Nada foi alterado.', n;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_conversa');
  IF n <> 4 THEN
    RAISE EXCEPTION 'verificacao 4: orcamentista_conversa tem % constraint(s), e devia ter 4. Nada foi alterado.', n;
  END IF;
  FOREACH e IN ARRAY indices LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = p[1] AND indexdef = p[2]) THEN
      faltam := concat_ws('; ', faltam, p[1]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 5: indice ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  RAISE NOTICE 'orcamentista_mensagem.responde_a (uuid, nula, FK ON DELETE SET NULL) e os indices responde_a_idx e conversa_remetente_idx.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_mensagem' and column_name = 'responde_a';
-- -- esperado: 1 linha, uuid, YES, nulo
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_mensagem'::regclass order by 1;
-- -- esperado: 5 constraints, a _responde_a_fkey com ON DELETE SET NULL
-- select indexname, indexdef from pg_indexes where schemaname = 'public'
--    and tablename in ('orcamentista_mensagem', 'orcamentista_conversa') order by 1;
-- -- esperado: 7 índices, entre eles orcamentista_mensagem_responde_a_idx e orcamentista_conversa_remetente_idx
