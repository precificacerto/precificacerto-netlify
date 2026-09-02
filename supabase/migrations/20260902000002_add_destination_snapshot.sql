-- D-A: destino de cada categoria congelado no momento em que o preco do item foi formado.
--
-- Regra canonica (Secao 4): o destino e propriedade da CONSTRUCAO DO PRECO, nao do estado
-- atual do tenant. Sem esta coluna, a cascata resolvia a matriz pelo tenant_settings.calc_type
-- de HOJE: mudar a segmentacao do tenant reescrevia a decomposicao de todo preco ja formado.
--
-- NULAVEL DE PROPOSITO, SEM DEFAULT. NULL significa ITEM LEGADO, anterior ao snapshot, e o
-- leitor cai na matriz pelo calc_type atual, como sempre foi. NULL NUNCA significa destino
-- FORA: confundir os dois transformaria todo item legado em item sem custo, porque FORA tira
-- a mao de obra do CMV. Um DEFAULT aqui apagaria a distincao entre "classificado" e "nunca
-- classificado" -- a mesma armadilha do NOT NULL DEFAULT 0 do D8.

alter table public.products  add column if not exists destination_snapshot jsonb;
alter table public.services  add column if not exists destination_snapshot jsonb;

comment on column public.products.destination_snapshot is
  'D-A: destino congelado por categoria no momento da formacao do preco. {v, destino{mo_produtiva, mo_indireta, despesa_fixa, despesa_variavel, despesa_financeira}, construcao, segmentacao, gravado_em}. NULL = item legado, cai na matriz pelo calc_type atual. NULL nunca significa FORA.';

comment on column public.services.destination_snapshot is
  'D-A: destino congelado por categoria no momento da formacao do preco. {v, destino{mo_produtiva, mo_indireta, despesa_fixa, despesa_variavel, despesa_financeira}, construcao, segmentacao, gravado_em}. NULL = item legado, cai na matriz pelo calc_type atual. NULL nunca significa FORA.';
