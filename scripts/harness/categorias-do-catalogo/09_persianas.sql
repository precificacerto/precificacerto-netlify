-- a PERSIANAS tem, em produção, uma tabela de fornecedor (02/11/2026: a de persianas da Wolff) — aqui, uma da Wolf, para o arrasto ter tabela sem motor
INSERT INTO public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, familia, categoria_chave)
VALUES ('7a000000-0000-4000-8000-0000000000aa', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/arquivo/persianas.xlsx', 'Persianas_-_Wolff.xlsx', NULL, 'PERSIANAS')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo) SELECT '7a000000-0000-4000-8000-0000000000aa', 'PS-' || g FROM generate_series(1, 5) g;
DO $v$ BEGIN
  IF (SELECT count(*) FROM public.orcamentista_tabela_item WHERE tabela_id = '7a000000-0000-4000-8000-0000000000aa') <> 5 THEN RAISE EXCEPTION 'estado: a tabela de persianas nao tem os 5 itens'; END IF;
END $v$;
