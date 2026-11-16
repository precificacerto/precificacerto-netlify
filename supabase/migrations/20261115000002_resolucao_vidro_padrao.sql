-- 20261115000002_resolucao_vidro_padrao.sql
--
-- O DEFEITO, medido em producao em 15/11/2026: o vendedor escreve "mini boreal" (a familia do vidro, sem a
-- espessura) e `traduzirVidro` acha SEIS itens na tabela de vidro da conta. Mais de um candidato e nenhum
-- escolhido e VIDRO_AMBIGUO: o orcamento sai PARCIAL, com o vidro sem preco, e a criacao nao evolui.
--
-- A DECISAO (dono do produto, 13/11/2026, que esta migracao apenas registra no banco): a empresa JA cadastra
-- o vidro padrao dela em `orcamentista_vidro_padrao` (por grupo e por tipologia, guardando o CODIGO do item).
-- Quando o texto do vendedor bate com varios itens e EXATAMENTE UM deles e um codigo que a empresa cadastrou
-- como padrao, esse desempata. Nada se escolhe por ser o mais barato, nada se completa: o padrao so decide
-- entre candidatos que o texto JA elegeu, e a regra de 04/11/2026 ("o vidro e copiado, nunca completado")
-- continua — o texto gravado segue sendo o do vendedor. Nenhum padrao entre os candidatos, ou mais de um:
-- continua falta nomeada.
--
-- O QUE MUDA NO BANCO: so a lista de valores de `orcamentista_orcamento_item_material.resolucao`, que ganha
-- 'vidro_padrao' — para o orcamento gravar COMO o vidro foi achado, em vez de dizer 'vidro_traduzido' a um
-- desempate que o texto nao fez sozinho.
--
-- Nao altera dado nenhum. Nao apaga nada. Nao mexe em coluna, indice, politica, grant nem funcao.

ALTER TABLE public.orcamentista_orcamento_item_material
  DROP CONSTRAINT IF EXISTS orcamentista_orcamento_item_material_resolucao_check;

ALTER TABLE public.orcamentista_orcamento_item_material
  ADD CONSTRAINT orcamentista_orcamento_item_material_resolucao_check
  CHECK (resolucao = ANY (ARRAY['ponte'::text, 'exato'::text, 'cor'::text, 'nome_tecnico'::text,
                               'vidro_escolhido'::text, 'vidro_traduzido'::text, 'vidro_padrao'::text]));

DO $verifica$
DECLARE v_def text; v_linhas bigint; BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass
     AND conname = 'orcamentista_orcamento_item_material_resolucao_check';
  IF v_def IS NULL THEN RAISE EXCEPTION 'a CHECK da resolucao nao existe depois do ALTER.'; END IF;
  IF position('vidro_padrao' in v_def) = 0 THEN RAISE EXCEPTION 'a CHECK gravada nao aceita vidro_padrao: %', v_def; END IF;
  IF position('vidro_escolhido' in v_def) = 0 OR position('nome_tecnico' in v_def) = 0 OR position('ponte' in v_def) = 0
     OR position('exato' in v_def) = 0 OR position('cor' in v_def) = 0 OR position('vidro_traduzido' in v_def) = 0 THEN
    RAISE EXCEPTION 'a CHECK gravada perdeu um valor de antes: %', v_def;
  END IF;
  SELECT count(*) INTO v_linhas FROM public.orcamentista_orcamento_item_material;
  RAISE NOTICE 'resolucao aceita vidro_padrao; % linhas de material intactas.', v_linhas;
END $verifica$;
