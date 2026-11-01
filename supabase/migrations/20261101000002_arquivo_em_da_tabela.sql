-- ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ 20261101000002 — "SUBIDO EM" É O MOMENTO DO ARQUIVO, NÃO O DA LINHA (dono do produto, 01/11/2026)                   ║
-- ║                                                                                                                      ║
-- ║ PENDENTE ATÉ O DONO DO PRODUTO APLICAR. Não pressupõe migração nova: só a orcamentista_tabela com criado_em.         ║
-- ║ SEM ELA O CÓDIGO QUEBRA: a lista de tabelas do fornecedor passa a ler `arquivo_em`, e a leitura falha sem a coluna.  ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- Formulação do dono do produto, registrada como está:
--   "onde está escrito subido em, foi alterado agora, então ele deveria pegar o exato momento, não o dia que foi criado."
--
-- O DEFEITO É DE DADO, NÃO DE TELA. Medido em produção em 01/11/2026 (só leitura): `orcamentista_tabela` só tem `criado_em`, e a troca de
-- arquivo (PATCH de tabelas/[id]) é um UPDATE que não grava data nenhuma. A 21acfa75 (Wolf Perfis, Tabela_Wolff_Perfis_PVC.xlsx) foi criada em
-- 29/10/2026 às 19:26 UTC e teve o arquivo trocado hoje; a tela mostra 29/10 porque é o único campo que existe.
--
-- O QUE ESTA MIGRAÇÃO FAZ:
--   1. `arquivo_em timestamptz NOT NULL DEFAULT now()` — o momento em que o arquivo de preço ATUAL da tabela entrou;
--   2. SEMEIA as linhas de hoje com `criado_em` (decisão do dono do produto: "é a melhor aproximação que existe") e LOGA cada uma no
--      `superadmin_alteracao_log` (a linha antes, a linha depois, a migração e a origem do valor). Linha já semeada não é tocada de novo:
--      reaplicar é inofensivo e não loga;
--   3. o GATILHO `orcamentista_tabela_arquivo_em` mantém o fato no banco, por qualquer caminho:
--        - na criação, `arquivo_em` = `criado_em` (o arquivo entra com a linha);
--        - na troca de `arquivo_path`, `arquivo_em` = now() (o instante da troca, na transação);
--        - em qualquer outro UPDATE (vigência, família, motor, o arrasto que tira a família), `arquivo_em` fica como estava — nem a tela nem
--          outro código o reescreve à mão (fato histórico congela: `fato-vs-referencia.md`).
--      Só o `arquivo_path` conta como troca de arquivo: o `motor_path` da tabela é legado (o motor mora no catálogo) e não é "Subido em".
--
-- AS PARTES QUE EXECUTAM SÃO ASCII; os acentos estão só em comentário.

BEGIN;

ALTER TABLE public.orcamentista_tabela ADD COLUMN IF NOT EXISTS arquivo_em timestamptz;

-- as linhas semeadas NESTA execucao (a verificacao confere estas, e so estas)
CREATE TEMP TABLE _arquivo_em_semeadas (id uuid PRIMARY KEY) ON COMMIT DROP;

-- 2. o semeio, logado linha a linha (só as que ainda não têm o valor)
DO $semeia$
DECLARE
  v_t record;
  v_n integer := 0;
BEGIN
  FOR v_t IN SELECT t.id, to_jsonb(t) - 'arquivo_em' AS antes FROM public.orcamentista_tabela t WHERE t.arquivo_em IS NULL ORDER BY t.criado_em, t.id FOR UPDATE LOOP
    UPDATE public.orcamentista_tabela SET arquivo_em = criado_em WHERE id = v_t.id;
    INSERT INTO _arquivo_em_semeadas (id) VALUES (v_t.id);
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (NULL, 'orcamentista_tabela', v_t.id::text,
            jsonb_build_object('orcamentista_tabela', v_t.antes, 'migracao', '20261101000002_arquivo_em_da_tabela'),
            jsonb_build_object('orcamentista_tabela', (SELECT to_jsonb(x) FROM public.orcamentista_tabela x WHERE x.id = v_t.id),
                               'origem_de_arquivo_em', 'criado_em: a troca de arquivo nao gravava data; e a melhor aproximacao (dono do produto, 01/11/2026)'),
            NULL);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'arquivo_em semeado com criado_em: % linha(s)', v_n;
END
$semeia$;

ALTER TABLE public.orcamentista_tabela ALTER COLUMN arquivo_em SET DEFAULT now();
ALTER TABLE public.orcamentista_tabela ALTER COLUMN arquivo_em SET NOT NULL;

COMMENT ON COLUMN public.orcamentista_tabela.arquivo_em IS
  'O momento em que o arquivo de preco ATUAL entrou ("Subido em"): criado_em na criacao, now() a cada troca de arquivo_path; nao se escreve a mao (gatilho orcamentista_tabela_arquivo_em). As linhas de antes de 01/11/2026 foram semeadas com criado_em (migracao 20261101000002).';

-- 3. o gatilho
CREATE OR REPLACE FUNCTION public.orcamentista_tabela_arquivo_em() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.arquivo_em := NEW.criado_em;
  ELSIF NEW.arquivo_path IS DISTINCT FROM OLD.arquivo_path THEN
    NEW.arquivo_em := now();
  ELSE
    NEW.arquivo_em := OLD.arquivo_em;
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.orcamentista_tabela_arquivo_em() FROM PUBLIC;

DROP TRIGGER IF EXISTS orcamentista_tabela_arquivo_em ON public.orcamentista_tabela;
CREATE TRIGGER orcamentista_tabela_arquivo_em
  BEFORE INSERT OR UPDATE ON public.orcamentista_tabela
  FOR EACH ROW EXECUTE FUNCTION public.orcamentista_tabela_arquivo_em();

DO $verifica$
DECLARE
  v_n integer;
BEGIN
  -- (1) a coluna: timestamptz, NOT NULL, default now()
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela'
                   AND column_name = 'arquivo_em' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO' AND column_default = 'now()') THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_tabela.arquivo_em ausente ou com outra forma. Nada foi alterado.';
  END IF;
  -- (2) cada linha semeada nesta execucao: arquivo_em = criado_em, e UMA linha de log desta migracao com o antes sem arquivo_em e o depois com ele
  SELECT count(*) INTO v_n FROM _arquivo_em_semeadas s JOIN public.orcamentista_tabela t ON t.id = s.id
   WHERE t.arquivo_em IS DISTINCT FROM t.criado_em
      OR (SELECT count(*) FROM public.superadmin_alteracao_log l
           WHERE l.tabela = 'orcamentista_tabela' AND l.chave = t.id::text AND l.antes ->> 'migracao' = '20261101000002_arquivo_em_da_tabela'
             AND l.tenant_id IS NULL AND l.por IS NULL
             AND NOT (l.antes -> 'orcamentista_tabela' ? 'arquivo_em')
             AND (l.depois -> 'orcamentista_tabela' ->> 'arquivo_em')::timestamptz = t.criado_em) <> 1;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verificacao 2: % linha(s) semeada(s) sem arquivo_em = criado_em ou sem exatamente um log do semeio. Nada foi alterado.', v_n;
  END IF;
  -- (3) a funcao: search_path fixo, fechada ao publico
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'orcamentista_tabela_arquivo_em'
                    AND p.proconfig @> ARRAY['search_path=pg_catalog, public']) THEN
    RAISE EXCEPTION 'verificacao 3: a funcao orcamentista_tabela_arquivo_em esta ausente ou sem o search_path fixo. Nada foi alterado.';
  END IF;
  IF has_function_privilege('anon', 'public.orcamentista_tabela_arquivo_em()', 'execute')
     OR has_function_privilege('authenticated', 'public.orcamentista_tabela_arquivo_em()', 'execute') THEN
    RAISE EXCEPTION 'verificacao 3: a funcao orcamentista_tabela_arquivo_em esta aberta a anon ou authenticated. Nada foi alterado.';
  END IF;
  -- (4) o gatilho: BEFORE, INSERT e UPDATE (de qualquer coluna), por linha, habilitado
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orcamentista_tabela'::regclass AND tgname = 'orcamentista_tabela_arquivo_em'
                   AND tgenabled = 'O'
                   AND pg_get_triggerdef(oid) = 'CREATE TRIGGER orcamentista_tabela_arquivo_em BEFORE INSERT OR UPDATE ON public.orcamentista_tabela FOR EACH ROW EXECUTE FUNCTION orcamentista_tabela_arquivo_em()') THEN
    RAISE EXCEPTION 'verificacao 4: o gatilho orcamentista_tabela_arquivo_em esta ausente, desligado ou com outra definicao. Nada foi alterado.';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
