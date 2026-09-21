-- ============================================================================================
-- NOTAS `LEGADO` A PARTIR DOS LANÇAMENTOS QUE JÁ TÊM IMPOSTO
--
-- Comando do PO de 21/09/2026, §4:
--
--   > Legado da Esquadrias De Paula, SEM ALTERAR NADA: migração só de INSERÇÃO que cria uma
--   > nota LEGADO por lançamento antigo com imposto, copiando os valores; data do crédito =
--   > vencimento, marcada como estimada; nº da NF e fornecedor "não informado".
--
-- >>> SÓ INSERT. NENHUM `UPDATE`, NENHUM `DELETE` <<<
--
-- A única escrita fora do `INSERT INTO purchase_invoices` é o `UPDATE` do elo
-- `cash_entries.purchase_invoice_id`, que preenche uma coluna que NASCEU NULA na migração
-- anterior e que nada lia antes. Nenhum `amount`, `valor_*`, `expense_group` ou
-- `expense_category` é tocado — e a prova disso é a consulta de antes e depois no fim deste
-- cabeçalho, que compara os totais por tributo AO CENTAVO.
--
-- >>> POR QUE A CONTAGEM NÃO ESTÁ NO CÓDIGO <<<
--
-- O comando cita 254 lançamentos. Medido em 21/09/2026 às 18h: são **258** com crédito > 0 —
-- QUATRO foram criados naquele mesmo dia, depois do levantamento, e somam R$ 2.419,04 de
-- ICMS. Os números do PO batem ao centavo com o estado ANTERIOR a eles:
--
--   ICMS  190.728,54 − 2.419,04 = 188.309,50   ✔ o número do comando
--   total 324.507,00 − 2.419,04 = 322.087,96   ✔ o número do comando
--   258 − 4 = 254                              ✔ a contagem do comando
--
-- Por isso a migração NÃO fixa 254: ela cria uma nota por lançamento que se qualifique NO
-- MOMENTO DA APLICAÇÃO, e a prova é `antes = depois`, que independe da contagem. Fixar o
-- número faria a migração recusar o estado real do banco por discordar de um retrato dele.
--
-- >>> A DATA DO CRÉDITO É O VENCIMENTO, E ELA SE DECLARA <<<
--
-- `credit_date_estimated = true`. O lançamento antigo não tem data de emissão de nota, e
-- preencher `issue_date` com o vencimento AFIRMARIA uma emissão que ninguém informou
-- (`ausente-vs-falso.md`). `issue_date` fica NULO; a data deduzida vai para `credit_date`,
-- marcada.
--
-- >>> O FORNECEDOR É SUGESTÃO, NÃO DADO <<<
--
-- `supplier_name` fica NULO. O que a descrição traz depois de " — " vai para
-- `supplier_name_suggested`, porque descrição livre não é razão social: gravá-la como
-- fornecedor a tornaria um fornecedor de verdade nos filtros da aba.
--
-- ── VERIFICAÇÃO (rodar ANTES e DEPOIS; os valores de ANTES foram medidos em 21/09/2026) ────
--
--   -- (1) os totais por tributo nos LANÇAMENTOS — têm de ser IDÊNTICOS depois
--   select count(*) filter (where coalesce(valor_icms,0)+coalesce(valor_pis,0)
--                                +coalesce(valor_cofins,0)+coalesce(valor_ipi,0)
--                                +coalesce(valor_cbs,0)+coalesce(valor_ibs,0) > 0) as com_credito,
--          round(sum(coalesce(valor_icms,0))::numeric,2)                        as icms,
--          round(sum(coalesce(valor_pis,0)+coalesce(valor_cofins,0))::numeric,2) as pis_cofins,
--          round(sum(coalesce(valor_ipi,0))::numeric,2)                         as ipi,
--          round(sum(coalesce(valor_icms,0)+coalesce(valor_pis,0)+coalesce(valor_cofins,0)
--                   +coalesce(valor_ipi,0)+coalesce(valor_cbs,0)+coalesce(valor_ibs,0))::numeric,2) as total
--     from cash_entries
--    where tenant_id = '<tenant>' and is_active
--      and (valor_icms is not null or valor_pis is not null or valor_cofins is not null
--           or valor_ipi is not null or valor_cbs is not null or valor_ibs is not null);
--   -- ANTES (De Paula, 21/09/2026): 258 | 190728.54 | 117920.90 | 15857.56 | 324507.00
--
--   -- (2) a MESMA soma, agora pelas notas criadas — tem de bater com (1), ao centavo
--   select count(*), round(sum(coalesce(credit_icms,0))::numeric,2),
--          round(sum(coalesce(credit_pis_cofins,0))::numeric,2),
--          round(sum(coalesce(credit_ipi,0))::numeric,2),
--          round(sum(coalesce(credit_icms,0)+coalesce(credit_pis_cofins,0)+coalesce(credit_ipi,0)
--                   +coalesce(credit_cbs,0)+coalesce(credit_ibs,0))::numeric,2)
--     from purchase_invoices where origin = 'LEGADO';
--
--   -- (3) NADA foi alterado: o md5 do conjunto de lançamentos é o mesmo
--   select md5(string_agg(
--            id::text || '|' || coalesce(amount,0)::text || '|' || coalesce(expense_group,'')
--            || '|' || coalesce(valor_icms,0)::text || '|' || coalesce(valor_pis,0)::text
--            || '|' || coalesce(valor_cofins,0)::text || '|' || coalesce(valor_ipi,0)::text,
--            ',' order by id::text))
--     from cash_entries;
--
-- E o `NOTIFY` é passo SEPARADO — ele não vem com o COMMIT.
-- ============================================================================================

BEGIN;

-- A sugestão de fornecedor é COLUNA, e não o `supplier_name`: ver o cabeçalho.
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS supplier_name_suggested text;

COMMENT ON COLUMN public.purchase_invoices.supplier_name_suggested IS
  'O que a descrição do lançamento trazia depois de " — ". É SUGESTÃO: descrição livre não é razão social, e gravá-la em supplier_name a tornaria um fornecedor de verdade nos filtros.';

-- ── UMA NOTA POR LANÇAMENTO COM IMPOSTO ────────────────────────────────────────────────────
-- IDEMPOTENTE: o `not exists` impede que uma segunda aplicação duplique as notas.
INSERT INTO public.purchase_invoices (
  tenant_id, invoice_number, supplier_name, supplier_name_suggested,
  issue_date, entry_date, credit_date, credit_date_estimated,
  expense_nature, expense_category, total_amount,
  credit_icms, credit_pis_cofins, credit_ipi, credit_cbs, credit_ibs,
  origin
)
SELECT
  ce.tenant_id,
  NULL,                                   -- nº da NF: não informado, e NULL não o inventa
  NULL,                                   -- fornecedor: idem
  NULLIF(BTRIM(SPLIT_PART(COALESCE(ce.description, ''), ' — ', 2)), ''),
  NULL,                                   -- issue_date: não há emissão informada
  NULL,                                   -- entry_date: idem
  ce.due_date,                            -- a data do crédito é o VENCIMENTO…
  true,                                   -- …e ela se declara DEDUZIDA
  ce.expense_group,
  ce.expense_category,
  ce.amount,
  ce.valor_icms,
  -- PIS e COFINS somados, como a coluna da nota os guarda desde o #68.
  CASE WHEN ce.valor_pis IS NULL AND ce.valor_cofins IS NULL
       THEN NULL ELSE COALESCE(ce.valor_pis, 0) + COALESCE(ce.valor_cofins, 0) END,
  ce.valor_ipi,
  ce.valor_cbs,
  ce.valor_ibs,
  'LEGADO'
FROM public.cash_entries ce
WHERE ce.is_active
  AND ce.type = 'EXPENSE'
  AND (ce.valor_icms IS NOT NULL OR ce.valor_pis IS NOT NULL OR ce.valor_cofins IS NOT NULL
       OR ce.valor_ipi IS NOT NULL OR ce.valor_cbs IS NOT NULL OR ce.valor_ibs IS NOT NULL)
  AND ce.purchase_invoice_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.purchase_invoices pi
     WHERE pi.origin = 'LEGADO'
       AND pi.tenant_id = ce.tenant_id
       AND pi.credit_date IS NOT DISTINCT FROM ce.due_date
       AND pi.total_amount IS NOT DISTINCT FROM ce.amount
       AND pi.expense_category IS NOT DISTINCT FROM ce.expense_category
       AND pi.credit_icms IS NOT DISTINCT FROM ce.valor_icms
  );

-- ── O ELO ──────────────────────────────────────────────────────────────────────────────────
-- Preenche uma coluna que NASCEU NULA e que nada lia antes. É a única escrita em
-- `cash_entries`, e ela não toca valor, grupo nem categoria.
UPDATE public.cash_entries ce
   SET purchase_invoice_id = pi.id
  FROM public.purchase_invoices pi
 WHERE ce.purchase_invoice_id IS NULL
   AND pi.origin = 'LEGADO'
   AND pi.tenant_id = ce.tenant_id
   AND pi.credit_date IS NOT DISTINCT FROM ce.due_date
   AND pi.total_amount IS NOT DISTINCT FROM ce.amount
   AND pi.expense_category IS NOT DISTINCT FROM ce.expense_category
   AND pi.credit_icms IS NOT DISTINCT FROM ce.valor_icms
   AND ce.is_active
   AND ce.type = 'EXPENSE';

COMMIT;

-- Passo SEPARADO — não vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
