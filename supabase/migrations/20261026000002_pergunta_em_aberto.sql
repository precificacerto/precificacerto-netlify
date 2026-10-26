-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261026000002 — a PERGUNTA EM ABERTO do vendedor, guardada entre uma mensagem e a próxima.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261026000002_pergunta_em_aberto.
-- ║ SEM ELA o código não quebra: a leitura da tabela ausente (PGRST205/42P01) vale como "nenhuma
-- ║ pergunta em aberto", nada é gravado nela, e a conversa se comporta como antes — com o laço
-- ║ do nome de 26/10/2026 (b0465e57) de volta. A linha [IA] diz `aberta=ausente`.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — medido em produção em 26/10/2026, 14:07:49 a 14:09:21: PARECIDO, SEM_NOME, SEM_NOME,
-- SEM_NOME, e a mesma pergunta do nome três vezes. A LLM recebe SÓ a mensagem desta vez, e o
-- código não guardava o que tinha perguntado: "é o mesmo" e "João medeiros" não tinham a que se
-- referir, e a esquadria da primeira mensagem se perdia.
--
-- A DECISÃO DO DONO DO PRODUTO (26/10/2026), registrada como está:
--   "ela NÃO reverte a decisão 4. A decisão foi 'parar de gravar o TEXTO das mensagens'. Guardar a
--    pergunta em aberto de forma estruturada é estado, como o `escolhas` já é — não é log de
--    conversa. [...] nunca o texto da mensagem, só a pergunta feita, os levantamentos citados e a
--    proposta que espera resposta, apagada quando resolve."
--
-- A TABELA — uma linha por (tenant, remetente), no máximo:
--   pergunta      a pergunta feita, como CÓDIGO: NOME_PARECIDO | SEM_NOME | CONFIRMAR_ACRESCIMO.
--                 O texto é refeito pelo código a partir das colunas, nunca guardado;
--   nome          o nome que a pergunta cita (o lido, na NOME_PARECIDO); nulo nas outras;
--   levantamentos os levantamentos citados na pergunta (ids). Sem FK: um array não tem; o código
--                 relê os que ainda existem e descarta a pergunta que não cita mais nenhum;
--   itens         a proposta que espera resposta: as esquadrias propostas, só os campos da
--                 esquadria (tipologia, medidas, quantidade, cor, vidro). Array JSON.
-- Apagada pelo código quando a pergunta se resolve. Não há histórico: é estado, não registro.
--
-- O PADRÃO DO PROJETO: FK composta (remetente, tenant) -> remetente (id, tenant) com o UNIQUE
-- (id, tenant_id) por trás, sem ON DELETE (o remetente é desativado, nunca apagado), e
-- tenant_id com ON DELETE CASCADE. RLS ativa, REVOKE ALL de PUBLIC, anon e authenticated, e
-- NENHUM GRANT nem política: o acesso é só por rota, com service_role.
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS; as constraints nascem dentro do CREATE TABLE.
-- VERIFICAÇÃO (aborta): cada constraint com a definição esperada, RLS ligada, zero política, e
-- nenhum privilégio de PUBLIC, anon ou authenticated.
-- DEPOIS DE APLICAR: NOTIFY pgrst (está no fim) e as consultas do rodapé.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.tenants. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_remetente_autorizado')
                    AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (id, tenant_id)') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_remetente_autorizado sem UNIQUE (id, tenant_id). Nada foi alterado.';
  END IF;
END
$guarda$;

CREATE TABLE IF NOT EXISTS public.orcamentista_pergunta_em_aberto (
  tenant_id     uuid        NOT NULL,
  remetente_id  uuid        NOT NULL,
  pergunta      text        NOT NULL,
  nome          text,
  levantamentos uuid[]      NOT NULL DEFAULT '{}',
  itens         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_pergunta_em_aberto_pkey PRIMARY KEY (tenant_id, remetente_id),
  CONSTRAINT orcamentista_pergunta_em_aberto_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_pergunta_em_aberto_remetente_fkey FOREIGN KEY (remetente_id, tenant_id)
    REFERENCES public.orcamentista_remetente_autorizado (id, tenant_id),
  CONSTRAINT orcamentista_pergunta_em_aberto_pergunta_valida
    CHECK (pergunta IN ('NOME_PARECIDO', 'SEM_NOME', 'CONFIRMAR_ACRESCIMO')),
  CONSTRAINT orcamentista_pergunta_em_aberto_itens_array CHECK (jsonb_typeof(itens) = 'array')
);

COMMENT ON TABLE public.orcamentista_pergunta_em_aberto IS
  'A pergunta em aberto do vendedor, uma por remetente: o codigo da pergunta, o nome e os levantamentos citados, e as esquadrias propostas que esperam resposta. Nunca o texto da mensagem. Apagada quando a pergunta se resolve.';

ALTER TABLE public.orcamentista_pergunta_em_aberto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orcamentista_pergunta_em_aberto FROM PUBLIC, anon, authenticated;

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_pergunta_em_aberto_pkey|PRIMARY KEY (tenant_id, remetente_id)',
    'orcamentista_pergunta_em_aberto_tenant_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_pergunta_em_aberto_remetente_fkey|FOREIGN KEY (remetente_id, tenant_id) REFERENCES orcamentista_remetente_autorizado(id, tenant_id)',
    'orcamentista_pergunta_em_aberto_pergunta_valida|CHECK ((pergunta = ANY (ARRAY[''NOME_PARECIDO''::text, ''SEM_NOME''::text, ''CONFIRMAR_ACRESCIMO''::text])))',
    'orcamentista_pergunta_em_aberto_itens_array|CHECK ((jsonb_typeof(itens) = ''array''::text))'
  ];
  t      text := 'orcamentista_pergunta_em_aberto';
  e      text;
  p      text[];
  faltam text;
  n      int;
BEGIN
  -- (1) cada constraint, pelo nome e pela definição
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.' || t) AND conname = p[1]
                      AND pg_get_constraintdef(oid) = p[2]) THEN
      faltam := concat_ws('; ', faltam, p[1]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  -- (2) as colunas, com o tipo: nenhuma coluna de texto da mensagem
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t;
  IF n <> 7 THEN
    RAISE EXCEPTION 'verificacao 2: % tem % coluna(s), e devia ter 7. Nada foi alterado.', t, n;
  END IF;
  -- (3) RLS ligada
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.' || t) AND relrowsecurity) THEN
    RAISE EXCEPTION 'verificacao 3: % sem RLS. Nada foi alterado.', t;
  END IF;
  -- (4) nenhuma política: o acesso é só por rota, com service_role
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
  IF n <> 0 THEN
    RAISE EXCEPTION 'verificacao 4: % tem % politica(s); o padrao e nenhuma. Nada foi alterado.', t, n;
  END IF;
  -- (5) nenhum privilégio de PUBLIC, anon ou authenticated, perguntado ao catálogo por papel
  IF has_table_privilege('public', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'verificacao 5: % com privilegio para PUBLIC, anon ou authenticated. Nada foi alterado.', t;
  END IF;
  RAISE NOTICE 'orcamentista_pergunta_em_aberto: constraints, 7 colunas, RLS sem politica e sem privilegio publico.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_pergunta_em_aberto'::regclass order by 1;
-- -- esperado: 5 constraints
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_pergunta_em_aberto' order by ordinal_position;
-- select relrowsecurity from pg_class where oid = 'public.orcamentista_pergunta_em_aberto'::regclass;
-- select count(*) from public.orcamentista_pergunta_em_aberto;   -- esperado: 0
