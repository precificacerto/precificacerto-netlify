-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261118000005 — o levantamento que cada SAÍDA da conversa tratou: o CONTEXTO do turno seguinte.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261118000005_levantamento_da_saida.
-- ║ SEM ELA o código não quebra e o defeito NÃO volta: a saída é gravada sem a coluna (PGRST204)
-- ║ e, sem saber o contexto, a montagem nunca captura uma mensagem que não diga o nome dela —
-- ║ a mensagem segue pelo nome. A linha [IA] diz `contexto_do_turno=sem_migracao`.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — o defeito em produção de 18/11/2026, 19:21: o "Sim" que respondia ao arquivo do levantamento
-- 24 (Alfredo Soares, recém-criado e completo) caiu no levantamento 23 (Daiane Pilger, em montagem desde a
-- manhã, do mesmo vendedor): a montagem era escolhida pelo ESTADO, e o turno mudou o 23 para COMPLETO e
-- mandou o arquivo dele. A regra do dono do produto: "Se eu confirmei o Alfredo, tem que vir Alfredo [...]
-- o turno age sobre o levantamento que foi citado, criado ou confirmado naquele fio — e sobre nenhum outro."
-- O contexto precisa estar GRAVADO: é o levantamento que a última saída tratou.
--
-- O QUE FAZ: a coluna `orcamentista_mensagem.levantamento_id uuid` (NULA: a entrada, e a saída que não
-- tratou levantamento nenhum), com a FK (levantamento_id, tenant_id) -> orcamentista_levantamento(id,
-- tenant_id) — o levantamento é da MESMA empresa — e ON DELETE SET NULL (levantamento_id): apagar o
-- levantamento esvazia só a coluna, e a mensagem continua da empresa. Nenhuma linha muda (as saídas de
-- antes ficam nulas: contexto desconhecido).
-- GUARDA (aborta): as duas tabelas existem, o UNIQUE (id, tenant_id) do levantamento existe, e a coluna,
-- se já existir, é uuid.
-- VERIFICAÇÃO (aborta): a coluna nula sem default, a FK com a definição esperada, e as 5 constraints de antes.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE v_tipo text;
BEGIN
  IF to_regclass('public.orcamentista_mensagem') IS NULL OR to_regclass('public.orcamentista_levantamento') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_mensagem ou orcamentista_levantamento no banco %. Nada foi alterado.', current_database();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento'::regclass
                  AND pg_get_constraintdef(oid) = 'UNIQUE (id, tenant_id)') THEN
    RAISE EXCEPTION 'orcamentista_levantamento sem UNIQUE (id, tenant_id): a FK do contexto nao tem onde apontar. Nada foi alterado.';
  END IF;
  SELECT data_type INTO v_tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_mensagem' AND column_name = 'levantamento_id';
  IF v_tipo IS NOT NULL AND v_tipo <> 'uuid' THEN
    RAISE EXCEPTION 'orcamentista_mensagem.levantamento_id ja existe com o tipo %. Nada foi alterado.', v_tipo;
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_mensagem ADD COLUMN IF NOT EXISTS levantamento_id uuid;

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_mensagem_levantamento_fkey') THEN
    ALTER TABLE public.orcamentista_mensagem ADD CONSTRAINT orcamentista_mensagem_levantamento_fkey
      FOREIGN KEY (levantamento_id, tenant_id) REFERENCES public.orcamentista_levantamento(id, tenant_id) ON DELETE SET NULL (levantamento_id);
  END IF;
END
$fk$;

COMMENT ON COLUMN public.orcamentista_mensagem.levantamento_id IS
  'Na SAIDA: o levantamento que o turno tratou (citado, criado ou confirmado) - o contexto do turno seguinte (18/11/2026). NULA na entrada e na saida sem levantamento.';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_mensagem_pkey|PRIMARY KEY (id)',
    'orcamentista_mensagem_conversa_fkey|FOREIGN KEY (conversa_id, tenant_id) REFERENCES orcamentista_conversa(id, tenant_id) ON DELETE CASCADE',
    'orcamentista_mensagem_direcao_check|CHECK ((direcao = ANY (ARRAY[''entrada''::text, ''saida''::text])))',
    'orcamentista_mensagem_responde_a_fkey|FOREIGN KEY (responde_a) REFERENCES orcamentista_mensagem(id) ON DELETE SET NULL',
    'orcamentista_mensagem_tenant_id_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_mensagem_levantamento_fkey|FOREIGN KEY (levantamento_id, tenant_id) REFERENCES orcamentista_levantamento(id, tenant_id) ON DELETE SET NULL (levantamento_id)'
  ];
  e text; p text[]; faltam text; n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_mensagem'
                  AND column_name = 'levantamento_id' AND data_type = 'uuid' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_mensagem.levantamento_id ausente ou com outra forma.';
  END IF;
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_mensagem'::regclass AND conname = p[1]
                    AND pg_get_constraintdef(oid) = p[2]) THEN
      faltam := concat_ws('; ', faltam, p[1]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 2: constraint ausente ou com outra definicao: %.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = 'public.orcamentista_mensagem'::regclass;
  IF n <> 6 THEN RAISE EXCEPTION 'verificacao 3: a tabela tem % constraint(s), e devia ter 6.', n; END IF;
  RAISE NOTICE 'orcamentista_mensagem: levantamento_id e a FK do contexto, e as 6 constraints.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_mensagem' and column_name = 'levantamento_id';
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_mensagem'::regclass order by 1;
-- -- esperado: 6 constraints, a _levantamento_fkey com ON DELETE SET NULL (levantamento_id)
