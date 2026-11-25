-- ================================================================================================
-- 20261125000001 - a midia da entrada (`orcamentista_mensagem.midia`): a rajada de fotos vira UM processamento.
--
-- +-----------------------------------------------------------------------------------------------
-- | PENDENTE. NAO APLICADA. Quem aplica e o dono do produto, ANTES do merge do PR que a traz.
-- | Ao aplicar fora do CLI, o `name` da migracao e o nome completo deste arquivo, sem a extensao:
-- | 20261125000001_midia_da_entrada.
-- | SEM ELA o codigo nao quebra: a entrada e gravada sem a midia (o PostgREST recusa a coluna, e o codigo
-- | regrava sem ela), e cada foto segue sozinha, como antes - a rajada nao se junta.
-- | O arquivo inteiro e ASCII (a colagem pelo SQL Editor no Windows reescreve o que nao e ASCII).
-- +-----------------------------------------------------------------------------------------------
--
-- POR QUE - pedido 0029 do dono do produto, 25/11/2026 (o levantamento 28, 20:44 UTC): o vendedor mandou a foto
-- da lista de 11 itens e a foto da tabela de vidros, com a legenda do cliente, 0,6 s uma da outra. Era UM envio,
-- e o WhatsApp entregou duas mensagens, cada uma num request: os dois processaram em paralelo, os dois gravaram e
-- os dois mandaram um arquivo. "Rajada = um envio": a entrada com midia espera a rajada fechar, a que tem outra
-- mais nova nao grava nem responde, e a ultima junta o texto e a midia de todas e conduz uma vez. Para a ultima
-- baixar as fotos das outras, cada entrada guarda os DADOS DE DOWNLOAD da sua midia (o que o evento do WUZAPI
-- traz: tipo, mimetype, nome, legenda, tamanho e os campos do download). A foto em si nunca e gravada.
--
-- O QUE FAZ:
--   1. `orcamentista_mensagem.midia jsonb NULL`, sem default. Nula na saida e na entrada sem midia.
--   2. CHECK `orcamentista_mensagem_midia_forma`: nula, ou um objeto JSON numa ENTRADA.
-- Nenhuma linha e alterada; nada e apagado.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS; a CHECK so se nao existe.
-- GUARDA (aborta): a tabela existe; `midia` ja existente com outro tipo; a CHECK de mesmo nome com outra definicao.
-- VERIFICACAO (aborta): a coluna jsonb, nula, sem default; a CHECK com a definicao; as 6 constraints de antes como
-- estao em producao (medidas em 25/11/2026), e 7 no total.
-- ================================================================================================
BEGIN;

DO $guarda$
DECLARE
  tipo text;
  def  text;
BEGIN
  IF to_regclass('public.orcamentista_mensagem') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.orcamentista_mensagem (banco %, usuario %). Nada foi alterado.', current_database(), current_user;
  END IF;
  SELECT udt_name INTO tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_mensagem' AND column_name = 'midia';
  IF tipo IS NOT NULL AND tipo <> 'jsonb' THEN
    RAISE EXCEPTION 'orcamentista_mensagem.midia ja existe com o tipo %, e devia ser jsonb. Nada foi alterado.', tipo;
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = to_regclass('public.orcamentista_mensagem') AND conname = 'orcamentista_mensagem_midia_forma';
  IF def IS NOT NULL AND def <> 'CHECK (((midia IS NULL) OR ((jsonb_typeof(midia) = ''object''::text) AND (direcao = ''entrada''::text))))' THEN
    RAISE EXCEPTION 'a CHECK orcamentista_mensagem_midia_forma ja existe com outra definicao: %. Nada foi alterado.', def;
  END IF;
END
$guarda$;

ALTER TABLE public.orcamentista_mensagem ADD COLUMN IF NOT EXISTS midia jsonb NULL;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.orcamentista_mensagem') AND conname = 'orcamentista_mensagem_midia_forma') THEN
    ALTER TABLE public.orcamentista_mensagem ADD CONSTRAINT orcamentista_mensagem_midia_forma
      CHECK (midia IS NULL OR (jsonb_typeof(midia) = 'object' AND direcao = 'entrada'));
  END IF;
END
$check$;

COMMENT ON COLUMN public.orcamentista_mensagem.midia IS
  'Na entrada com foto, PDF, audio ou video: os dados de download da midia como o WUZAPI os entregou (20261125000001; pedido 0029). A midia em si nunca e gravada. Nula na saida e na entrada sem midia.';

DO $verifica$
DECLARE
  esperadas text[] := ARRAY[
    'orcamentista_mensagem_pkey|PRIMARY KEY (id)',
    'orcamentista_mensagem_tenant_id_fkey|FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    'orcamentista_mensagem_conversa_fkey|FOREIGN KEY (conversa_id, tenant_id) REFERENCES orcamentista_conversa(id, tenant_id) ON DELETE CASCADE',
    'orcamentista_mensagem_direcao_check|CHECK ((direcao = ANY (ARRAY[''entrada''::text, ''saida''::text])))',
    'orcamentista_mensagem_responde_a_fkey|FOREIGN KEY (responde_a) REFERENCES orcamentista_mensagem(id) ON DELETE SET NULL',
    'orcamentista_mensagem_levantamento_fkey|FOREIGN KEY (levantamento_id, tenant_id) REFERENCES orcamentista_levantamento(id, tenant_id) ON DELETE SET NULL (levantamento_id)',
    'orcamentista_mensagem_midia_forma|CHECK (((midia IS NULL) OR ((jsonb_typeof(midia) = ''object''::text) AND (direcao = ''entrada''::text))))'
  ];
  e      text;
  p      text[];
  faltam text;
  n      int;
  col    record;
BEGIN
  SELECT data_type, is_nullable, column_default INTO col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_mensagem' AND column_name = 'midia';
  IF col IS NULL OR col.data_type <> 'jsonb' OR col.is_nullable <> 'YES' OR col.column_default IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 1: orcamentista_mensagem.midia devia ser jsonb, nula e sem default. Nada foi alterado.';
  END IF;
  FOREACH e IN ARRAY esperadas LOOP
    p := string_to_array(e, '|');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.orcamentista_mensagem') AND conname = p[1] AND pg_get_constraintdef(oid) = p[2]) THEN
      faltam := concat_ws('; ', faltam, p[1]);
    END IF;
  END LOOP;
  IF faltam IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 2: constraint ausente ou com outra definicao: %. Nada foi alterado.', faltam;
  END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_mensagem');
  IF n <> 7 THEN
    RAISE EXCEPTION 'verificacao 3: orcamentista_mensagem tem % constraint(s), e devia ter 7. Nada foi alterado.', n;
  END IF;
  RAISE NOTICE 'orcamentista_mensagem.midia (jsonb, nula, sem default) e a CHECK orcamentista_mensagem_midia_forma.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- -- VERIFICACAO DEPOIS DE APLICAR, por consulta ao banco (nao pelo retorno do comando) --
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_mensagem' and column_name = 'midia';
-- -- esperado: 1 linha, jsonb, YES, nulo
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orcamentista_mensagem'::regclass order by 1;
-- -- esperado: 7 constraints, entre elas orcamentista_mensagem_midia_forma
