-- ============================================================================================
-- CRÉDITO POR TRIBUTO NO ITEM — destinação, bandeiras de crédito, CBS/IBS e os CST da compra
--
-- Comando do PO de 20/09/2026, seção 7. Migração ADITIVA: nenhuma coluna existente é
-- removida, renomeada ou alterada.
--
-- >>> O QUE ESTA MIGRAÇÃO **NÃO** FAZ <<<
-- Ela NÃO cria `cost_gross`. A coluna JÁ EXISTE em `items` (numeric, default 0) e está
-- preenchida em 69 dos 72 itens — medido em 20/09/2026, antes de escrever este arquivo. O
-- comando pedia para acrescentá-la; acrescentar de novo falharia, e assumir que não existia
-- teria custado a aplicação inteira.
--
-- >>> POR QUE NENHUM CUSTO MUDA <<<
-- As cinco bandeiras são preenchidas no backfill com EXATAMENTE o comportamento de hoje:
-- ICMS e PIS/COFINS sempre recuperáveis, IPI nunca, CBS/IBS inexistentes. Como `cost_net`
-- não é recalculado por esta migração e as alíquotas de CBS/IBS nascem em 0, nenhum item
-- muda de custo — e nenhum preço muda por consequência.
--
-- VERIFICAÇÃO, para rodar ANTES e DEPOIS (o valor de antes, medido em 20/09/2026):
--
--   select count(*) itens, round(sum(coalesce(cost_net,0))::numeric,2) soma,
--          md5(string_agg(coalesce(cost_net,0)::text, ',' order by id::text)) assinatura
--   from items;
--   -- antes: 72 | 63417.26 | 09f96de4ad8a1d8bf917c719ed3ed21e
--
-- `migration-delivery.md`: esta migração está PENDENTE até que a consulta acima seja feita
-- no schema e a coluna apareça lá. Merge não aplica nada.
-- ============================================================================================

BEGIN;

-- ── DESTINAÇÃO ──────────────────────────────────────────────────────────────────────────
-- Ela decide o PADRÃO das bandeiras (revenda, insumo, uso e consumo, ativo).
--
-- O default 'REVENDA' é o que o comando fixa, e vale registrar o que ele significa nas
-- linhas antigas: é uma destinação PRESUMIDA, não declarada. Quem preserva o comportamento
-- de hoje são as bandeiras abaixo, preenchidas explicitamente — a destinação só passa a
-- decidir alguma coisa quando o usuário editar o item. A coluna fica NULLABLE de propósito,
-- para que "não classificado" continue sendo dizível (`ausente-vs-falso.md`).
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS destination text DEFAULT 'REVENDA';

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_destination_check;
ALTER TABLE public.items ADD CONSTRAINT items_destination_check
  CHECK (destination IS NULL OR destination IN ('REVENDA', 'INSUMO', 'USO_CONSUMO', 'ATIVO_IMOBILIZADO'));

-- ── AS CINCO BANDEIRAS DE CRÉDITO ───────────────────────────────────────────────────────
-- NULLABLE E SEM DEFAULT, e isso é decisão, não descuido.
--
-- `NULL` significa "o usuário nunca decidiu" e cai no padrão da destinação; `false` significa
-- "o usuário desligou". Um `DEFAULT false` apagaria a distinção PARA SEMPRE — é o corolário
-- literal de `ausente-vs-falso.md`, e aqui ele apagaria no sentido que TIRA crédito de quem
-- tem direito.
--
-- As linhas ANTIGAS recebem valor explícito no backfill porque o comportamento delas é
-- conhecido: não é ausência, é fato.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS icms_credit_enabled boolean;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS pis_cofins_credit_enabled boolean;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS ipi_credit_enabled boolean;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cbs_credit_enabled boolean;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS ibs_credit_enabled boolean;

-- ── CBS e IBS DA COMPRA ─────────────────────────────────────────────────────────────────
-- Default 0 conforme o comando. Zero aqui é o estado real de 2026: o IVA ainda não é
-- destacado nas notas, e 0% é o que a nota traz.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cbs_rate numeric DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS ibs_rate numeric DEFAULT 0;

-- ── OS CST DA NOTA DE COMPRA ────────────────────────────────────────────────────────────
-- ACRÉSCIMO ALÉM DA LISTA DA SEÇÃO 7, e está escrito aqui em vez de passar em silêncio: o
-- critério de aceite da seção 11 exige "botão desabilitado com motivo visível ... nos
-- CST/cClassTrib que vedam crédito", e sem o CST no item não há de onde ler a vedação.
--
-- NULLABLE E SEM DEFAULT: CST ausente NÃO é CST que veda. Bloquear por ausência afirmaria o
-- que ninguém apurou, que é o erro que estas colunas existem para impedir.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cst_icms text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cst_ipi text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cst_pis_cofins text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cst_ibs_cbs_code text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS cclass_trib_code text;

-- ── BACKFILL — o comportamento de hoje, escrito como fato ────────────────────────────────
-- `recalcNetCost` no main deduzia ICMS e PIS/COFINS SEMPRE, e somava o IPI SEMPRE. É isso, e
-- só isso, que as quatro linhas abaixo gravam. `IS NULL` no WHERE torna o backfill
-- reexecutável sem sobrescrever escolha de usuário.
UPDATE public.items SET icms_credit_enabled      = true  WHERE icms_credit_enabled      IS NULL;
UPDATE public.items SET pis_cofins_credit_enabled = true  WHERE pis_cofins_credit_enabled IS NULL;
UPDATE public.items SET ipi_credit_enabled       = false WHERE ipi_credit_enabled       IS NULL;
UPDATE public.items SET cbs_credit_enabled       = false WHERE cbs_credit_enabled       IS NULL;
UPDATE public.items SET ibs_credit_enabled       = false WHERE ibs_credit_enabled       IS NULL;

COMMENT ON COLUMN public.items.destination IS
  'Destinação da compra: REVENDA | INSUMO | USO_CONSUMO | ATIVO_IMOBILIZADO. Decide o padrão das bandeiras de crédito.';
COMMENT ON COLUMN public.items.icms_credit_enabled IS
  'O ICMS desta compra gera crédito? NULL = nunca decidido, cai no padrão da destinação. Ver src/utils/custo-liquido-do-item.ts';
COMMENT ON COLUMN public.items.ipi_credit_enabled IS
  'O IPI gera crédito? Só em estabelecimento industrial ou equiparado (RIPI/2010 arts. 226 e 227).';
COMMENT ON COLUMN public.items.cst_ibs_cbs_code IS
  'CST de IBS/CBS da nota de COMPRA. Casa com cst_ibs_cbs.cst; ind_gibscbs = false veda o crédito (LC 214/2025 art. 48).';

COMMIT;

-- Recarregar o cache do PostgREST — passo SEPARADO, não vem com o COMMIT. É ele que evita o
-- erro que derrubou produção em 01/09/2026.
-- NOTIFY pgrst, 'reload schema';
