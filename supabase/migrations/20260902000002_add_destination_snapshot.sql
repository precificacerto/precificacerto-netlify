-- D-A: destino de cada categoria congelado no momento em que o preco do item foi formado.
--
-- Regra canonica (Secao 4): o destino e propriedade da CONSTRUCAO DO PRECO, nao do estado
-- atual do tenant. Sem estas colunas, a cascata resolvia a matriz pelo
-- tenant_settings.calc_type de HOJE: mudar a segmentacao do tenant reescrevia a decomposicao
-- de todo preco ja formado.
--
-- CINCO COLUNAS, NAO DUAS. Regra do congelamento: orcamento salvo CONGELA o item;
-- reprecificar o produto NAO altera orcamento ja salvo; orcamento NOVO pega o valor
-- atualizado; item REMOVIDO E REINSERIDO no orcamento antigo tambem pega o atualizado,
-- porque e uma insercao nova. Snapshot so no catalogo NAO implementa isso: se o documento
-- lesse products.destination_snapshot, reprecificar o produto reescreveria a leitura do
-- orcamento antigo -- que e exatamente a forma proibida. Por isso o snapshot e COPIADO do
-- catalogo para o item do documento no momento da insercao, e dali em diante O DOCUMENTO LE
-- O SEU PROPRIO.
--
--   products / services ....... onde o preco e FORMADO (a tela de cadastro grava)
--   budget_items / sale_items / order_items ... copia recebida na INSERCAO
--
-- NULAVEIS DE PROPOSITO, SEM DEFAULT. NULL significa ITEM LEGADO, anterior ao snapshot, e o
-- leitor cai na matriz pelo calc_type atual, como sempre foi. NULL NUNCA significa destino
-- FORA: confundir os dois transformaria todo item legado em item sem custo, porque FORA tira
-- a mao de obra do CMV. Um DEFAULT aqui apagaria a distincao entre "classificado" e "nunca
-- classificado" -- a mesma armadilha do NOT NULL DEFAULT 0 do D8.
--
-- Item manual (sem product_id e sem service_id) permanece NULL por construcao: nao ha
-- cadastro de origem, e ele nao passa pela matriz de destinos -- e custo puro, fora da
-- cascata de produtos.

alter table public.products     add column if not exists destination_snapshot jsonb;
alter table public.services     add column if not exists destination_snapshot jsonb;
alter table public.budget_items add column if not exists destination_snapshot jsonb;
alter table public.sale_items   add column if not exists destination_snapshot jsonb;
alter table public.order_items  add column if not exists destination_snapshot jsonb;

comment on column public.products.destination_snapshot is
  'D-A: destino congelado por categoria no momento da formacao do preco. {v, destino{mo_produtiva, mo_indireta, despesa_fixa, despesa_variavel, despesa_financeira}, construcao, segmentacao, gravado_em}. NULL = item legado, cai na matriz pelo calc_type atual. NULL nunca significa FORA.';

comment on column public.services.destination_snapshot is
  'D-A: destino congelado por categoria no momento da formacao do preco. Mesmo formato de products.destination_snapshot. NULL = item legado, cai na matriz pelo calc_type atual. NULL nunca significa FORA.';

comment on column public.budget_items.destination_snapshot is
  'D-A: copia do snapshot de destino do cadastro, feita na INSERCAO do item no orcamento. O orcamento le o seu proprio: reprecificar o produto depois nao altera orcamento ja salvo. Item removido e reinserido recebe o snapshot atualizado, porque e insercao nova. NULL = item legado ou item manual; cai na matriz pelo calc_type atual, e nunca significa FORA.';

comment on column public.sale_items.destination_snapshot is
  'D-A: copia do snapshot de destino, herdada do item do orcamento na conversao, ou do cadastro quando a venda nasce no balcao. Mesma semantica de budget_items.destination_snapshot.';

comment on column public.order_items.destination_snapshot is
  'D-A: copia do snapshot de destino, herdada do item do orcamento na conversao, ou do cadastro quando o pedido nasce direto. Mesma semantica de budget_items.destination_snapshot.';
