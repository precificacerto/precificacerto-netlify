-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261106000002 — O LEVANTAMENTO GANHA NÚMERO, OS DADOS DO CLIENTE, OS PERCENTUAIS CONGELADOS E O VENDEDOR; O ITEM GANHA AMBIENTES E OBS.
-- São os campos que a folha A4 do levantamento (o ARQUIVO que o agente envia) precisa e que não existiam (medido em 06/11/2026).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge dos PRs que a usam (o gerador da folha e a conversa).
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão:
-- ║ 20261106000002_numero_cliente_e_percentuais_do_levantamento.
-- ║ Não altera função nenhuma que já exista: cria duas (o número e a forma dos ambientes) e uma tabela (o contador).
-- ║ O código de hoje continua funcionando com ela aplicada: o número é dado pelo banco no INSERT, e as colunas novas nascem nulas.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ ⚠️  ESTA MIGRAÇÃO APAGA DADO DE CONTA — autorizado pelo dono do produto em 06/11/2026 ("Pode apagá-los, foram testes").
-- ║ Tudo da empresa Esquadrias De Paula Ltda (tenant 20e08592-f957-4e72-b7eb-251387e34eb9), como medido em 06/11/2026:
-- ║   orcamentista_levantamento      — os 5 levantamentos (todos COMPLETO):
-- ║       b0465e57-a829-4f81-9f3e-9ba7d00a999f  "Casa do João"                                                  (2 itens)
-- ║       02db9513-7eda-43f0-852d-df940e781bef  "Levantamento João da Silva Ternes — rua tal, 100, Montenegro"  (2 itens)
-- ║       cbf085d1-dfe0-4074-ad94-1d462130eee7  "Geronimo Silva"                                                (3 itens)
-- ║       3181ae50-6ef7-4032-98b9-914e2dc1eb43  "Jorge Koss"                                                    (2 itens)
-- ║       c8b56b73-05b3-4d4e-82d0-41ecba58b893  "Maria Cristina"                                                (2 itens)
-- ║   orcamentista_levantamento_item — os 11 itens deles;
-- ║   orcamentista_pergunta_em_aberto — a pergunta em aberto que citar um deles (0 em 06/11/2026; se houver uma na hora, sai e é logada).
-- ║ CADA linha apagada vai ao superadmin_alteracao_log (a linha inteira em `antes`, `depois` nulo, a marca 'remocao': '20261106000002', o
-- ║ tenant de quem era) e ao log da aplicação (RAISE NOTICE). A GUARDA ABORTA, sem alterar nada, se houver na hora de aplicar qualquer
-- ║ levantamento que não seja um dos 5, um deles de outra empresa, ou um número de itens diferente de 11: esta migração nunca apaga mais do que
-- ║ este quadro diz. A conversa gravada (orcamentista_conversa e _mensagem) NÃO é tocada.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- Decisões do dono do produto (06/11/2026), registradas como foram ditas:
--   - "numero (sequencial POR EMPRESA, único por tenant — o "Levantamento N" da folha, que atravessa para Proposta N e Pedido N)". Atribuição:
--     "Gatilho + contador" — no banco, um gatilho no INSERT pega o próximo número de um contador por empresa, sob trava; nunca reaproveita
--     número, nem de levantamento apagado. Com os 5 de teste apagados, `numero` é NOT NULL e o contador da De Paula começa em 1.
--   - "telefone, email, edificacao, endereco, obs_obra, data_entrega". A data de entrega: "Livre, não obrigatório existir, formato de data
--     Ex: 27/11/26 ou 04/02/27" e, perguntado, "Data, mostrada dd/mm/aa": coluna `date`, nula quando não dita (a data inválida não entra).
--   - "comissao_percentual, comissao_modo, reserva_tecnica_percentual, reserva_tecnica_responsavel, lucro_projetado_percentual" — o resultado
--     fica GRAVADO NO LEVANTAMENTO, congelado ("Nada de reler o cadastro ao regerar a folha"); o cadastro (orcamentista_vendedor_perfil) é o
--     padrão e o dito na conversa o substitui (é do código, não desta migração). "comissao_modo com a mesma CHECK do perfil (PROPORCIONAL ou
--     CONGELADA)". Os percentuais com a mesma faixa do perfil (0 a 100).
--   - "vendedor_nome (congela quem fez; telefone troca de dono)".
--   - no item: "ambientes (ambiente + quantidade, vários por item)" — "jsonb no item": uma lista [{"ambiente": "...", "quantidade": N}] — e "obs".
--   - "colunas novas nascem nulas; nenhum DEFAULT que invente percentual" (nenhuma coluna nova tem DEFAULT; `numero` vem do gatilho).
--
-- A FORMA dos textos (leitura do assistente, dita no PR): nulo = não informado (`ausente-vs-falso.md`), e o informado não tem espaço nas pontas
-- e não é vazio. Limites: telefone 40, e-mail 254 (com um "@" e sem espaço), edificação 120, endereço 300, obs da obra 1.000, responsável pela
-- RT 120, vendedor 120, obs do item 1.000, nome do ambiente 80. A quantidade do ambiente é inteira e maior que zero. Os ambientes não somam com
-- a quantidade do item no banco: quem confere é o gerador da folha, com a recusa nomeada.
--
-- Os corpos `$fn$` e os blocos DO estão em ASCII (a colagem pelo SQL Editor no Windows reescreve o que não é ASCII: `migracao.md`, Parte III).
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. A GUARDA: as dependências, o estado das colunas, e o que vai ser apagado é exatamente o medido ──────────────────────────────────
DO $guarda$
DECLARE
  v_ids constant uuid[] := ARRAY[
    'b0465e57-a829-4f81-9f3e-9ba7d00a999f', '02db9513-7eda-43f0-852d-df940e781bef', 'cbf085d1-dfe0-4074-ad94-1d462130eee7',
    '3181ae50-6ef7-4032-98b9-914e2dc1eb43', 'c8b56b73-05b3-4d4e-82d0-41ecba58b893']::uuid[];
  v_tenant constant uuid := '20e08592-f957-4e72-b7eb-251387e34eb9';
  v_aplicada boolean;
  v_tipo text;
  v_achado text;
  v_n integer;
  r record;
BEGIN
  IF to_regclass('public.orcamentista_levantamento') IS NULL OR to_regclass('public.orcamentista_levantamento_item') IS NULL
     OR to_regclass('public.orcamentista_pergunta_em_aberto') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL
     OR to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente no banco % (usuario %, % tabela(s) orcamentista_*): orcamentista_levantamento, _item, _pergunta_em_aberto, superadmin_alteracao_log ou tenants. Nada foi alterado.',
      current_database(), current_user,
      (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname LIKE 'orcamentista\_%');
  END IF;

  -- nada escreve nas duas tabelas (nem na pergunta em aberto) entre a guarda e o fim da transacao
  LOCK TABLE public.orcamentista_levantamento, public.orcamentista_levantamento_item, public.orcamentista_pergunta_em_aberto IN SHARE ROW EXCLUSIVE MODE;

  -- as colunas novas: a que ja existe tem de ter o tipo desta migracao
  FOR r IN SELECT * FROM (VALUES
      ('orcamentista_levantamento', 'numero', 'integer'), ('orcamentista_levantamento', 'telefone', 'text'),
      ('orcamentista_levantamento', 'email', 'text'), ('orcamentista_levantamento', 'edificacao', 'text'),
      ('orcamentista_levantamento', 'endereco', 'text'), ('orcamentista_levantamento', 'obs_obra', 'text'),
      ('orcamentista_levantamento', 'data_entrega', 'date'), ('orcamentista_levantamento', 'comissao_percentual', 'numeric'),
      ('orcamentista_levantamento', 'comissao_modo', 'text'), ('orcamentista_levantamento', 'reserva_tecnica_percentual', 'numeric'),
      ('orcamentista_levantamento', 'reserva_tecnica_responsavel', 'text'), ('orcamentista_levantamento', 'lucro_projetado_percentual', 'numeric'),
      ('orcamentista_levantamento', 'vendedor_nome', 'text'),
      ('orcamentista_levantamento_item', 'ambientes', 'jsonb'), ('orcamentista_levantamento_item', 'obs', 'text')) AS e(tabela, coluna, tipo)
  LOOP
    SELECT c.data_type INTO v_tipo FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = r.tabela AND c.column_name = r.coluna;
    IF FOUND AND v_tipo <> r.tipo THEN
      RAISE EXCEPTION '%.% ja existe com o tipo %, e devia ser %. Nada foi alterado.', r.tabela, r.coluna, v_tipo, r.tipo;
    END IF;
  END LOOP;

  -- as funcoes novas: a que ja existe tem de ter o corpo desta migracao (a reaplicacao)
  FOR r IN SELECT * FROM (VALUES
      ('public.orcamentista_levantamento_numerar()', '9057e1b39063c81c6ad0da524057ea72'),
      ('public.orcamentista_levantamento_ambientes_validos(jsonb)', 'b19b766b011427227f9c27d90d5def99')) AS e(assinatura, md5)
  LOOP
    SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_achado FROM pg_proc p WHERE p.oid = to_regprocedure(r.assinatura);
    IF FOUND AND v_achado <> r.md5 THEN
      RAISE EXCEPTION 'a funcao % ja existe com outro corpo (md5 %, esperado %). Nada foi alterado.', r.assinatura, v_achado, r.md5;
    END IF;
  END LOOP;

  -- aplicada = a coluna numero existe; entao nao ha o que apagar, e a guarda do apagamento nao se aplica
  v_aplicada := EXISTS (SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'orcamentista_levantamento' AND c.column_name = 'numero');
  IF v_aplicada THEN
    RAISE NOTICE '20261106000002 ja aplicada (a coluna numero existe): nada a apagar';
    RETURN;
  END IF;

  SELECT string_agg(format('%s (empresa %s, "%s")', l.id, l.tenant_id, l.nome), '; ' ORDER BY l.criado_em) INTO v_achado
    FROM public.orcamentista_levantamento l WHERE NOT (l.id = ANY (v_ids));
  IF v_achado IS NOT NULL THEN
    RAISE EXCEPTION 'ha levantamento fora dos 5 medidos em 06/11/2026: %. Esta migracao so apaga os 5. Nada foi alterado.', v_achado;
  END IF;
  SELECT string_agg(format('%s (empresa %s)', l.id, l.tenant_id), '; ') INTO v_achado
    FROM public.orcamentista_levantamento l WHERE l.id = ANY (v_ids) AND l.tenant_id <> v_tenant;
  IF v_achado IS NOT NULL THEN
    RAISE EXCEPTION 'levantamento medido com outra empresa: %. Nada foi alterado.', v_achado;
  END IF;
  SELECT count(*) INTO v_n FROM public.orcamentista_levantamento_item i WHERE i.levantamento_id = ANY (v_ids);
  IF v_n <> 11 THEN
    RAISE EXCEPTION 'os 5 levantamentos tem % item(ns), e o medido em 06/11/2026 foi 11. Nada foi alterado.', v_n;
  END IF;
END
$guarda$;

-- ── 2. O APAGAMENTO dos 5 de teste, linha a linha, com log ─────────────────────────────────────────────────────────────────────────
DO $apaga$
DECLARE
  v_ids constant uuid[] := ARRAY[
    'b0465e57-a829-4f81-9f3e-9ba7d00a999f', '02db9513-7eda-43f0-852d-df940e781bef', 'cbf085d1-dfe0-4074-ad94-1d462130eee7',
    '3181ae50-6ef7-4032-98b9-914e2dc1eb43', 'c8b56b73-05b3-4d4e-82d0-41ecba58b893']::uuid[];
  v_marca constant jsonb := jsonb_build_object('remocao', '20261106000002');
  v_n integer;
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'orcamentista_levantamento' AND c.column_name = 'numero') THEN
    RETURN;
  END IF;

  FOR r IN SELECT i.* FROM public.orcamentista_levantamento_item i WHERE i.levantamento_id = ANY (v_ids) ORDER BY i.levantamento_id, i.ordem LOOP
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
      VALUES (r.tenant_id, 'orcamentista_levantamento_item', r.id::text, to_jsonb(r) || v_marca, NULL, NULL);
    RAISE NOTICE '20261106000002 apagou o item %: %', r.id, to_jsonb(r) - 'tenant_id';
  END LOOP;
  DELETE FROM public.orcamentista_levantamento_item i WHERE i.levantamento_id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 11 THEN RAISE EXCEPTION 'apagou % item(ns), e eram 11. Nada foi alterado.', v_n; END IF;

  FOR r IN SELECT p.* FROM public.orcamentista_pergunta_em_aberto p WHERE p.levantamentos && v_ids LOOP
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
      VALUES (r.tenant_id, 'orcamentista_pergunta_em_aberto', r.remetente_id::text, to_jsonb(r) || v_marca, NULL, NULL);
    RAISE NOTICE '20261106000002 apagou a pergunta em aberto do remetente %: %', r.remetente_id, to_jsonb(r) - 'tenant_id';
  END LOOP;
  DELETE FROM public.orcamentista_pergunta_em_aberto p WHERE p.levantamentos && v_ids;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '20261106000002: % pergunta(s) em aberto que citavam os 5', v_n;

  FOR r IN SELECT l.* FROM public.orcamentista_levantamento l WHERE l.id = ANY (v_ids) ORDER BY l.criado_em LOOP
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
      VALUES (r.tenant_id, 'orcamentista_levantamento', r.id::text, to_jsonb(r) || v_marca, NULL, NULL);
    RAISE NOTICE '20261106000002 apagou o levantamento %: %', r.id, to_jsonb(r) - 'tenant_id';
  END LOOP;
  DELETE FROM public.orcamentista_levantamento l WHERE l.id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 5 THEN RAISE EXCEPTION 'apagou % levantamento(s), e eram 5. Nada foi alterado.', v_n; END IF;
  RAISE NOTICE '20261106000002: 5 levantamentos e 11 itens de teste apagados, cada linha no superadmin_alteracao_log';
END
$apaga$;

-- ── 3. AS COLUNAS: nulas e sem DEFAULT (o numero vem do gatilho) ──────────────────────────────────────────────────────────────────
-- a tabela esta vazia neste ponto da primeira aplicacao (a guarda e o apagamento): o NOT NULL do numero nao reescreve nada
ALTER TABLE public.orcamentista_levantamento
  ADD COLUMN IF NOT EXISTS numero integer NOT NULL,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS edificacao text,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS obs_obra text,
  ADD COLUMN IF NOT EXISTS data_entrega date,
  ADD COLUMN IF NOT EXISTS comissao_percentual numeric,
  ADD COLUMN IF NOT EXISTS comissao_modo text,
  ADD COLUMN IF NOT EXISTS reserva_tecnica_percentual numeric,
  ADD COLUMN IF NOT EXISTS reserva_tecnica_responsavel text,
  ADD COLUMN IF NOT EXISTS lucro_projetado_percentual numeric,
  ADD COLUMN IF NOT EXISTS vendedor_nome text;
ALTER TABLE public.orcamentista_levantamento_item
  ADD COLUMN IF NOT EXISTS ambientes jsonb,
  ADD COLUMN IF NOT EXISTS obs text;

-- ── 4. A FORMA: o numero unico por empresa; os textos sem espaco nas pontas; os percentuais e o modo como no perfil do vendedor ─────────
CREATE OR REPLACE FUNCTION public.orcamentista_levantamento_ambientes_validos(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  e jsonb;
  v_chaves text[];
  v_nome text;
  v_qtd numeric;
BEGIN
  -- nulo = nao informado; o informado e uma lista nao vazia de {"ambiente": texto, "quantidade": inteiro > 0}, e nada mais
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) = 0 THEN RETURN false; END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p) AS t(x) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RETURN false; END IF;
    SELECT array_agg(k ORDER BY k) INTO v_chaves FROM jsonb_object_keys(e) AS t(k);
    IF v_chaves IS DISTINCT FROM ARRAY['ambiente', 'quantidade'] THEN RETURN false; END IF;
    IF jsonb_typeof(e -> 'ambiente') <> 'string' OR jsonb_typeof(e -> 'quantidade') <> 'number' THEN RETURN false; END IF;
    v_nome := e ->> 'ambiente';
    IF v_nome !~ '^\S(.*\S)?$' OR char_length(v_nome) > 80 THEN RETURN false; END IF;
    v_qtd := (e ->> 'quantidade')::numeric;
    IF v_qtd <> trunc(v_qtd) OR v_qtd < 1 OR v_qtd > 2147483647 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) TO service_role;

ALTER TABLE public.orcamentista_levantamento
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_numero_key,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_numero_positivo,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_telefone_forma,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_email_forma,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_edificacao_forma,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_endereco_forma,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_obs_obra_forma,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_comissao_percentual_faixa,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_comissao_modo_valido,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_reserva_tecnica_percentual_faixa,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_reserva_tecnica_responsavel_forma,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_lucro_projetado_percentual_faixa,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_vendedor_nome_forma;
ALTER TABLE public.orcamentista_levantamento
  ADD CONSTRAINT orcamentista_levantamento_numero_key UNIQUE (tenant_id, numero),
  ADD CONSTRAINT orcamentista_levantamento_numero_positivo CHECK (numero >= 1),
  ADD CONSTRAINT orcamentista_levantamento_telefone_forma CHECK (telefone IS NULL OR (telefone ~ '^\S(.*\S)?$' AND char_length(telefone) <= 40)),
  ADD CONSTRAINT orcamentista_levantamento_email_forma CHECK (email IS NULL OR (email ~ '^[^@\s]+@[^@\s]+$' AND char_length(email) <= 254)),
  ADD CONSTRAINT orcamentista_levantamento_edificacao_forma CHECK (edificacao IS NULL OR (edificacao ~ '^\S(.*\S)?$' AND char_length(edificacao) <= 120)),
  ADD CONSTRAINT orcamentista_levantamento_endereco_forma CHECK (endereco IS NULL OR (endereco ~ '^\S(.*\S)?$' AND char_length(endereco) <= 300)),
  ADD CONSTRAINT orcamentista_levantamento_obs_obra_forma CHECK (obs_obra IS NULL OR (obs_obra ~ '^\S(.*\S)?$' AND char_length(obs_obra) <= 1000)),
  ADD CONSTRAINT orcamentista_levantamento_comissao_percentual_faixa CHECK (comissao_percentual IS NULL OR (comissao_percentual >= 0 AND comissao_percentual <= 100)),
  ADD CONSTRAINT orcamentista_levantamento_comissao_modo_valido CHECK (comissao_modo IS NULL OR comissao_modo IN ('PROPORCIONAL', 'CONGELADA')),
  ADD CONSTRAINT orcamentista_levantamento_reserva_tecnica_percentual_faixa CHECK (reserva_tecnica_percentual IS NULL OR (reserva_tecnica_percentual >= 0 AND reserva_tecnica_percentual <= 100)),
  ADD CONSTRAINT orcamentista_levantamento_reserva_tecnica_responsavel_forma CHECK (reserva_tecnica_responsavel IS NULL OR (reserva_tecnica_responsavel ~ '^\S(.*\S)?$' AND char_length(reserva_tecnica_responsavel) <= 120)),
  ADD CONSTRAINT orcamentista_levantamento_lucro_projetado_percentual_faixa CHECK (lucro_projetado_percentual IS NULL OR (lucro_projetado_percentual >= 0 AND lucro_projetado_percentual <= 100)),
  ADD CONSTRAINT orcamentista_levantamento_vendedor_nome_forma CHECK (vendedor_nome IS NULL OR (vendedor_nome ~ '^\S(.*\S)?$' AND char_length(vendedor_nome) <= 120));
ALTER TABLE public.orcamentista_levantamento_item
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_item_ambientes_forma,
  DROP CONSTRAINT IF EXISTS orcamentista_levantamento_item_obs_forma;
ALTER TABLE public.orcamentista_levantamento_item
  ADD CONSTRAINT orcamentista_levantamento_item_ambientes_forma CHECK (public.orcamentista_levantamento_ambientes_validos(ambientes)),
  ADD CONSTRAINT orcamentista_levantamento_item_obs_forma CHECK (obs IS NULL OR (obs ~ '^\S(.*\S)?$' AND char_length(obs) <= 1000));

-- ── 5. O NUMERO: o contador por empresa e o gatilho que o usa ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_levantamento_contador (
  tenant_id uuid NOT NULL,
  ultimo integer NOT NULL,
  CONSTRAINT orcamentista_levantamento_contador_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT orcamentista_levantamento_contador_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_levantamento_contador_ultimo_positivo CHECK (ultimo >= 1)
);
ALTER TABLE public.orcamentista_levantamento_contador ENABLE ROW LEVEL SECURITY;
-- os mesmos privilegios de orcamentista_levantamento (medidos em 06/11/2026): so o service_role, e nada ao anon nem ao authenticated
REVOKE ALL ON TABLE public.orcamentista_levantamento_contador FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.orcamentista_levantamento_contador TO service_role;

CREATE OR REPLACE FUNCTION public.orcamentista_levantamento_numerar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  -- o numero do levantamento e do banco: o proximo do contador da empresa, sob a trava da linha do contador; nunca reaproveitado
  IF TG_OP = 'INSERT' THEN
    IF NEW.numero IS NOT NULL THEN
      RAISE EXCEPTION 'o numero do levantamento e dado pelo banco, por empresa: nao se informa no insert (veio %)', NEW.numero
        USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.orcamentista_levantamento_contador AS c (tenant_id, ultimo) VALUES (NEW.tenant_id, 1)
      ON CONFLICT (tenant_id) DO UPDATE SET ultimo = c.ultimo + 1
      RETURNING c.ultimo INTO NEW.numero;
    RETURN NEW;
  END IF;
  IF NEW.numero IS DISTINCT FROM OLD.numero OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'o numero do levantamento % nao muda, nem a empresa dele', OLD.numero USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.orcamentista_levantamento_numerar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orcamentista_levantamento_numero ON public.orcamentista_levantamento;
CREATE TRIGGER orcamentista_levantamento_numero
  BEFORE INSERT OR UPDATE OF numero, tenant_id ON public.orcamentista_levantamento
  FOR EACH ROW EXECUTE FUNCTION public.orcamentista_levantamento_numerar();

COMMENT ON COLUMN public.orcamentista_levantamento.numero IS
  'O "Levantamento N" da folha (e da Proposta N e do Pedido N): sequencial por empresa, dado pelo gatilho orcamentista_levantamento_numero a partir de orcamentista_levantamento_contador. Nunca reaproveitado; nao muda.';
COMMENT ON COLUMN public.orcamentista_levantamento.data_entrega IS 'A data de entrega dita na conversa (a folha mostra dd/mm/aa). NULL = nao informada.';
COMMENT ON COLUMN public.orcamentista_levantamento.comissao_percentual IS
  'Congelado no levantamento: o dito na conversa ou, nao dito, o do cadastro (orcamentista_vendedor_perfil) na hora da coleta. Nao se rele o cadastro ao regerar a folha. NULL = nao informado.';
COMMENT ON COLUMN public.orcamentista_levantamento.reserva_tecnica_responsavel IS 'Quem recebe a reserva tecnica, como dito na conversa. NULL = nao informado (a folha deixa o campo em branco).';
COMMENT ON COLUMN public.orcamentista_levantamento.vendedor_nome IS 'Quem fez o levantamento, congelado (o telefone do remetente troca de dono).';
COMMENT ON COLUMN public.orcamentista_levantamento_item.ambientes IS
  'Os ambientes do item: [{"ambiente": texto, "quantidade": inteiro > 0}], nao vazia. NULL = nao informados. A soma com a quantidade do item e conferida pelo gerador da folha.';
COMMENT ON TABLE public.orcamentista_levantamento_contador IS 'O ultimo numero de levantamento dado a cada empresa. So o gatilho orcamentista_levantamento_numero escreve.';

-- ── 6. A VERIFICACAO: o que ficou e o que devia ficar, lido do catalogo ───────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  v_ids constant uuid[] := ARRAY[
    'b0465e57-a829-4f81-9f3e-9ba7d00a999f', '02db9513-7eda-43f0-852d-df940e781bef', 'cbf085d1-dfe0-4074-ad94-1d462130eee7',
    '3181ae50-6ef7-4032-98b9-914e2dc1eb43', 'c8b56b73-05b3-4d4e-82d0-41ecba58b893']::uuid[];
  v_falta text;
  v_n integer;
BEGIN
  -- 1. as colunas novas: o tipo, a nulidade (so o numero e NOT NULL) e nenhum DEFAULT
  SELECT string_agg(e.tabela || '.' || e.coluna, ', ') INTO v_falta FROM (VALUES
      ('orcamentista_levantamento', 'numero', 'integer', 'NO'), ('orcamentista_levantamento', 'telefone', 'text', 'YES'),
      ('orcamentista_levantamento', 'email', 'text', 'YES'), ('orcamentista_levantamento', 'edificacao', 'text', 'YES'),
      ('orcamentista_levantamento', 'endereco', 'text', 'YES'), ('orcamentista_levantamento', 'obs_obra', 'text', 'YES'),
      ('orcamentista_levantamento', 'data_entrega', 'date', 'YES'), ('orcamentista_levantamento', 'comissao_percentual', 'numeric', 'YES'),
      ('orcamentista_levantamento', 'comissao_modo', 'text', 'YES'), ('orcamentista_levantamento', 'reserva_tecnica_percentual', 'numeric', 'YES'),
      ('orcamentista_levantamento', 'reserva_tecnica_responsavel', 'text', 'YES'), ('orcamentista_levantamento', 'lucro_projetado_percentual', 'numeric', 'YES'),
      ('orcamentista_levantamento', 'vendedor_nome', 'text', 'YES'),
      ('orcamentista_levantamento_item', 'ambientes', 'jsonb', 'YES'), ('orcamentista_levantamento_item', 'obs', 'text', 'YES')) AS e(tabela, coluna, tipo, nula)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = e.tabela
      AND c.column_name = e.coluna AND c.data_type = e.tipo AND c.is_nullable = e.nula AND c.column_default IS NULL);
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'verificacao 1: coluna ausente, de outro tipo, de outra nulidade ou com DEFAULT: %. Nada foi alterado.', v_falta; END IF;

  -- 2. as constraints, pela definicao
  SELECT string_agg(e.nome, ', ') INTO v_falta FROM (VALUES
      ('orcamentista_levantamento_numero_key', 'UNIQUE (tenant_id, numero)'),
      ('orcamentista_levantamento_numero_positivo', 'CHECK ((numero >= 1))'),
      ('orcamentista_levantamento_comissao_modo_valido', 'CHECK (((comissao_modo IS NULL) OR (comissao_modo = ANY (ARRAY[''PROPORCIONAL''::text, ''CONGELADA''::text]))))'),
      ('orcamentista_levantamento_comissao_percentual_faixa', 'CHECK (((comissao_percentual IS NULL) OR ((comissao_percentual >= (0)::numeric) AND (comissao_percentual <= (100)::numeric))))'),
      ('orcamentista_levantamento_reserva_tecnica_percentual_faixa', 'CHECK (((reserva_tecnica_percentual IS NULL) OR ((reserva_tecnica_percentual >= (0)::numeric) AND (reserva_tecnica_percentual <= (100)::numeric))))'),
      ('orcamentista_levantamento_lucro_projetado_percentual_faixa', 'CHECK (((lucro_projetado_percentual IS NULL) OR ((lucro_projetado_percentual >= (0)::numeric) AND (lucro_projetado_percentual <= (100)::numeric))))'),
      ('orcamentista_levantamento_item_ambientes_forma', 'CHECK (orcamentista_levantamento_ambientes_validos(ambientes))'),
      ('orcamentista_levantamento_contador_ultimo_positivo', 'CHECK ((ultimo >= 1))')) AS e(nome, def)
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conname = e.nome AND pg_get_constraintdef(k.oid) = e.def);
  IF v_falta IS NOT NULL THEN RAISE EXCEPTION 'verificacao 2: constraint ausente ou com outra definicao: %. Nada foi alterado.', v_falta; END IF;
  SELECT count(*) INTO v_n FROM pg_constraint k
    WHERE k.conrelid IN ('public.orcamentista_levantamento'::regclass, 'public.orcamentista_levantamento_item'::regclass)
      AND k.conname IN ('orcamentista_levantamento_telefone_forma', 'orcamentista_levantamento_email_forma', 'orcamentista_levantamento_edificacao_forma',
        'orcamentista_levantamento_endereco_forma', 'orcamentista_levantamento_obs_obra_forma', 'orcamentista_levantamento_reserva_tecnica_responsavel_forma',
        'orcamentista_levantamento_vendedor_nome_forma', 'orcamentista_levantamento_item_obs_forma');
  IF v_n <> 8 THEN RAISE EXCEPTION 'verificacao 2: % das 8 constraints de forma de texto. Nada foi alterado.', v_n; END IF;

  -- 3. o gatilho, as funcoes (pelo corpo) e os privilegios delas
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'orcamentista_levantamento_numero' AND t.tgrelid = 'public.orcamentista_levantamento'::regclass
      AND t.tgfoid = to_regprocedure('public.orcamentista_levantamento_numerar()') AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'verificacao 3: o gatilho orcamentista_levantamento_numero ausente ou com outra funcao. Nada foi alterado.';
  END IF;
  IF (SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_proc p WHERE p.oid = to_regprocedure('public.orcamentista_levantamento_numerar()')) IS DISTINCT FROM '9057e1b39063c81c6ad0da524057ea72'
     OR (SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_proc p WHERE p.oid = to_regprocedure('public.orcamentista_levantamento_ambientes_validos(jsonb)')) IS DISTINCT FROM 'b19b766b011427227f9c27d90d5def99' THEN
    RAISE EXCEPTION 'verificacao 3: o corpo de uma das funcoes novas nao e o desta migracao. Nada foi alterado.';
  END IF;
  IF has_function_privilege('anon', 'public.orcamentista_levantamento_numerar()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.orcamentista_levantamento_numerar()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.orcamentista_levantamento_ambientes_validos(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.orcamentista_levantamento_ambientes_validos(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.orcamentista_levantamento_ambientes_validos(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao 3: privilegio de EXECUTE fora do esperado (anon e authenticated sem nenhum; service_role com o dos ambientes). Nada foi alterado.';
  END IF;

  -- 4. o contador: RLS ligada e os mesmos privilegios de orcamentista_levantamento, nos dois sentidos
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.orcamentista_levantamento_contador'::regclass) THEN
    RAISE EXCEPTION 'verificacao 4: o contador sem RLS. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO v_n FROM (
    (SELECT g.grantee, g.privilege_type FROM information_schema.role_table_grants g WHERE g.table_schema = 'public' AND g.table_name = 'orcamentista_levantamento_contador'
     EXCEPT SELECT g.grantee, g.privilege_type FROM information_schema.role_table_grants g WHERE g.table_schema = 'public' AND g.table_name = 'orcamentista_levantamento')
    UNION ALL
    (SELECT g.grantee, g.privilege_type FROM information_schema.role_table_grants g WHERE g.table_schema = 'public' AND g.table_name = 'orcamentista_levantamento'
     EXCEPT SELECT g.grantee, g.privilege_type FROM information_schema.role_table_grants g WHERE g.table_schema = 'public' AND g.table_name = 'orcamentista_levantamento_contador')) d;
  IF v_n <> 0 THEN RAISE EXCEPTION 'verificacao 4: os privilegios do contador diferem dos de orcamentista_levantamento em % linha(s). Nada foi alterado.', v_n; END IF;

  -- 5. os 5 de teste nao existem mais, nem os itens deles
  IF EXISTS (SELECT 1 FROM public.orcamentista_levantamento l WHERE l.id = ANY (v_ids))
     OR EXISTS (SELECT 1 FROM public.orcamentista_levantamento_item i WHERE i.levantamento_id = ANY (v_ids)) THEN
    RAISE EXCEPTION 'verificacao 5: um dos 5 levantamentos de teste, ou item deles, ainda existe. Nada foi alterado.';
  END IF;
  RAISE NOTICE '20261106000002 verificada: numero por empresa, dados do cliente, percentuais e vendedor no levantamento; ambientes e obs no item';
END
$verifica$;

COMMIT;
