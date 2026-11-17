-- Os CASOS, depois da migração aplicada duas vezes. Cada um emite "ok: ..." ou "FALHOU ...".
\set ON_ERROR_STOP 0
\set A '''00000000-0000-4000-8000-0000000000a1'''
\set B '''00000000-0000-4000-8000-0000000000b2'''
\set IA '''00000000-0000-4000-8000-000000000011'''
\set C '''00000000-0000-4000-8000-0000000000c1'''

-- CASO 1: a peça completa grava, e a do item sem barra (nula) também
DO $$ BEGIN
  INSERT INTO public.orcamentista_orcamento_item_peca (tenant_id, orcamento_item_id, calculo_id, ordem, perfil, codigo, descricao, comprimento_mm,
    quantidade_por_esquadria, quantidade, corte, posicao, comprimento_barra_mm, serra_mm)
  VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000c1', 1, 'SF66/WOLFF', '9681',
          'SF66 - FOLHA DE JANELA', 1215.5, 4, 8, '45S/45S', 'Largura', 6000, 5),
         ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000c1', 2, 'IL36/WOLFF', '9711',
          NULL, 1100, 2, 4, NULL, NULL, NULL, 0);
  RAISE NOTICE 'ok: caso 1 — a peca completa e a sem barra, corte e posicao gravam';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FALHOU caso 1: %', SQLERRM; END $$;

-- CASO 2: a FK composta recusa a peça com o item de OUTRO tenant (o isolamento)
DO $$ BEGIN
  INSERT INTO public.orcamentista_orcamento_item_peca (tenant_id, orcamento_item_id, calculo_id, ordem, perfil, codigo, comprimento_mm, quantidade_por_esquadria, quantidade, serra_mm)
  VALUES ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000c1', 3, 'P', 'C', 1, 1, 1, 0);
  RAISE NOTICE 'FALHOU caso 2: a peca de outro tenant gravou';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok: caso 2 — o item de outro tenant e recusado pela FK composta'; END $$;

-- CASO 3: a mesma ordem no mesmo cálculo é recusada; em outro cálculo, não
DO $$ BEGIN
  BEGIN
    INSERT INTO public.orcamentista_orcamento_item_peca (tenant_id, orcamento_item_id, calculo_id, ordem, perfil, codigo, comprimento_mm, quantidade_por_esquadria, quantidade, serra_mm)
    VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000c1', 1, 'P', 'C', 1, 1, 1, 0);
    RAISE NOTICE 'FALHOU caso 3: a ordem repetida no mesmo calculo gravou'; RETURN;
  EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO public.orcamentista_orcamento_item_peca (tenant_id, orcamento_item_id, calculo_id, ordem, perfil, codigo, comprimento_mm, quantidade_por_esquadria, quantidade, serra_mm)
  VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000c2', 1, 'P', 'C', 1, 1, 1, 0);
  RAISE NOTICE 'ok: caso 3 — a ordem repetida e recusada no mesmo calculo e aceita noutro';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'FALHOU caso 3: %', SQLERRM; END $$;

-- CASO 4: as CHECKs recusam, uma a uma, o que não é forma (comprimento zero, quantidade zero, barra zero, serra negativa, texto com espaço na ponta, vazio)
DO $$
DECLARE
  ruins text[] := ARRAY[
    'comprimento_mm = 0', 'quantidade = 0', 'quantidade_por_esquadria = 0', 'comprimento_barra_mm = 0', 'serra_mm = -1',
    'corte = '' 45/45''', 'corte = ''''', 'posicao = ''Largura ''', 'perfil = ''''', 'codigo = '' 9681''', 'descricao = ''''', 'ordem = 0'];
  r text; recusadas int := 0;
BEGIN
  FOREACH r IN ARRAY ruins LOOP
    BEGIN
      EXECUTE 'UPDATE public.orcamentista_orcamento_item_peca SET ' || r || ' WHERE ordem = 1 AND calculo_id = ''00000000-0000-4000-8000-0000000000c1''';
      RAISE NOTICE 'FALHOU caso 4: aceitou %', r;
    EXCEPTION WHEN check_violation THEN recusadas := recusadas + 1; END;
  END LOOP;
  IF recusadas = array_length(ruins, 1) THEN RAISE NOTICE 'ok: caso 4 — as % formas ruins sao recusadas pelas CHECKs', recusadas; END IF;
END $$;

-- CASO 5: o acesso — authenticated e anon não leem nem gravam (apesar do privilégio padrão); service_role lê e grava, e não apaga nem altera
DO $$
DECLARE quem text;
BEGIN
  SELECT string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type) INTO quem FROM information_schema.role_table_grants
   WHERE table_name = 'orcamentista_orcamento_item_peca' AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role');
  IF quem = 'service_role:INSERT,service_role:SELECT' AND NOT has_table_privilege('authenticated', 'public.orcamentista_orcamento_item_peca', 'SELECT')
     AND NOT has_table_privilege('service_role', 'public.orcamentista_orcamento_item_peca', 'DELETE') THEN
    RAISE NOTICE 'ok: caso 5 — so service_role, com SELECT e INSERT; o privilegio padrao de authenticated foi revogado';
  ELSE RAISE NOTICE 'FALHOU caso 5: grants = %', quem; END IF;
END $$;

-- CASO 6: o item com peça não se apaga (ON DELETE RESTRICT)
DO $$ BEGIN
  DELETE FROM public.orcamentista_orcamento_item WHERE id = '00000000-0000-4000-8000-000000000011';
  RAISE NOTICE 'FALHOU caso 6: o item com peca foi apagado';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok: caso 6 — o item com peca nao se apaga (RESTRICT)'; END $$;
