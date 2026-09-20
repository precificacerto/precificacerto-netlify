-- ============================================================================================
-- FORNECEDOR DO SIMPLES SEM REGIME REGULAR — a vedação de crédito de IBS/CBS por FORNECEDOR
--
-- LC 214/2025 art. 47 §9º II: quando o fornecedor é optante do Simples e NÃO aderiu ao regime
-- regular de IBS/CBS, o crédito do adquirente fica limitado ao que aquele fornecedor recolheu
-- DENTRO do DAS — valor que a nota não destaca e que o adquirente não tem como apurar.
--
-- O sistema BLOQUEIA o crédito em vez de estimá-lo. Estimar produziria um número que ninguém
-- apurou, e ele entraria no custo do item como se fosse fato (`ausente-vs-falso.md`).
--
-- >>> ARQUIVO SEPARADO, e a razão é de método <<<
-- Esta coluna poderia ter ido na `20260920000001`, que ainda não foi aplicada. Não foi, por
-- dois motivos: aquele arquivo já está mergeado em `main`, e reescrever migração mergeada
-- deixa a versão do repositório diferente da que alguém pode ter lido; e um arquivo por
-- decisão é o que permite aplicar uma sem a outra.
--
-- >>> DEPENDE DA 20260920000001, QUE **NÃO ESTAVA APLICADA** EM 21/09/2026 <<<
-- Consulta ao `information_schema` nessa data: NENHUMA das 13 colunas daquela migração existe
-- no banco, embora o PR #67 esteja mergeado. Aplicar ESTA antes daquela deixa o item com a
-- coluna do fornecedor e sem as bandeiras — estado que o código não sabe ler.
-- ORDEM: 20260920000001 primeiro, esta depois.
--
-- NULLABLE E SEM DEFAULT, pelo mesmo motivo das bandeiras: `NULL` é "não informado", e
-- `false` é "o usuário disse que o fornecedor NÃO é desse caso". Um `DEFAULT false` afirmaria
-- a segunda coisa em toda linha antiga.
--
-- VERIFICAÇÃO (rodar antes e depois; o valor de ANTES foi medido em 21/09/2026):
--   select count(*), round(sum(coalesce(cost_net,0))::numeric,2),
--          md5(string_agg(coalesce(cost_net,0)::text, ',' order by id::text)) from items;
--   -- antes: 72 | 63417.26 | 09f96de4ad8a1d8bf917c719ed3ed21e
-- ============================================================================================

BEGIN;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS supplier_simples_sem_regime_regular boolean;

COMMENT ON COLUMN public.items.supplier_simples_sem_regime_regular IS
  'Fornecedor optante do Simples que NÃO aderiu ao regime regular de IBS/CBS (LC 214/2025 art. 47 §9º II). Marcado, bloqueia o crédito de CBS e IBS. NULL = não informado.';

COMMIT;

-- Passo SEPARADO — não vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
