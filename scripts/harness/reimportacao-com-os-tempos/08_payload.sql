-- O PAYLOAD de uma reimportação COMPLETA da c1: as 164 tipologias, e linhas em TODAS as listas que a
-- função exige (as quatro de sempre e as nove abas). Volume menor que o do arquivo real (o tamanho
-- real só a importação de produção mede); a forma é a da rota (`montarPayloadDaImportacao`).
CREATE OR REPLACE FUNCTION pg_temp.payload_completo() RETURNS jsonb LANGUAGE sql AS $f$
  WITH t AS (SELECT i, 'DP-' || lpad(i::text, 3, '0') AS cod FROM generate_series(1, 164) AS i)
  SELECT jsonb_build_object(
    'importado_por', NULL,
    'avisos', '[]'::jsonb,
    'contagens', jsonb_build_object('cruzam', 20, 'nao_cruzam', 0, 'normalizados', 0),
    'itens', (SELECT jsonb_agg(jsonb_build_object('codigo', 'C' || k, 'descricao', 'PERFIL ' || k, 'medida_barra_m', 6, 'valor_barra_interno', 100 + k, 'valor_metro_interno', 20 + k)) FROM generate_series(1, 10) AS k),
    'regras', (SELECT jsonb_agg(jsonb_build_object('codigo', 'C' || (k % 10 + 1), 'codigo_wvetro', 'P' || k || '/WOLFF', 'cor', 'BRANCO', 'linha', 'EUROPA 42', 'tipo', 'Perfil', 'tipologias', jsonb_build_array('DP-' || lpad((k % 164 + 1)::text, 3, '0')))) FROM generate_series(1, 20) AS k),
    'tipologias', (SELECT jsonb_agg(jsonb_build_object('tipologia', cod, 'linha', 'EUROPA 42', 'n_regras', 10, 'n_condicionais', 1, 'variaveis', '[]'::jsonb)) FROM t),
    'formulas', (SELECT jsonb_agg(jsonb_build_object('linha', 'EUROPA 42', 'linha_original', 'PVC EUROPA 42', 'variavel', 'V' || k, 'formula', '(L-' || k || ')')) FROM generate_series(1, 3) AS k),
    'detalhes', (SELECT jsonb_agg(jsonb_build_object('ordem', i + 1, 'linha', 'PVC WOLFF EUROPA 42', 'tipologia', cod, 'descricao', 'TIPOLOGIA ' || cod, 'tipo', 'Correr', 'alt_min_mm', 388, 'alt_max_mm', 2439)) FROM t),
    'formulas_da_tipologia', (SELECT jsonb_agg(jsonb_build_object('ordem', k + 1, 'linha', 'PVC WOLFF EUROPA 42', 'tipologia', cod, 'variavel', 'V' || k, 'formula', '(H-' || k || ')')) FROM t, generate_series(1, 2) AS k),
    'perfis', (SELECT jsonb_agg(jsonb_build_object('ordem', k + 1, 'linha', 'PVC WOLFF EUROPA 42', 'tipologia', cod, 'perfil', 'P' || k || '/WOLFF', 'qtd', '1', 'medida', 'V1', 'condicao', 'sempre')) FROM t, generate_series(1, 2) AS k),
    'vidros', (SELECT jsonb_agg(jsonb_build_object('ordem', 2, 'linha', 'PVC WOLFF EUROPA 42', 'tipologia', cod, 'vidro', 'V1', 'qtd', '1')) FROM t),
    'baguetes', (SELECT jsonb_agg(jsonb_build_object('ordem', 2, 'linha', 'PVC WOLFF EUROPA 42', 'tipologia', cod, 'baguete', 'GB25/WOLFF', 'espessuras_vidro', '5,6,8')) FROM t),
    'insumos', (SELECT jsonb_agg(jsonb_build_object('ordem', k + 1, 'linha', 'PVC WOLFF EUROPA 42', 'tipologia', cod, 'insumo', 'I' || k, 'qtd', '2')) FROM t, generate_series(1, 2) AS k),
    'variaveis_da_tipologia', (SELECT jsonb_agg(jsonb_build_object('ordem', k + 1, 'linha', 'PVC WOLFF EUROPA 42', 'tipologia', cod, 'variavel', 'X' || k, 'padrao', '1')) FROM t, generate_series(1, 2) AS k),
    'validacoes', (SELECT jsonb_agg(jsonb_build_object('ordem', 2, 'linha', 'PVC WOLFF EUROPA 42', 'tipologia', cod, 'condicao_valida', '(L>0)', 'mensagem', 'largura')) FROM t),
    'otimizacao', (SELECT jsonb_agg(jsonb_build_object('ordem', k + 1, 'parametro', 'p' || k, 'valor', k::text)) FROM generate_series(1, 7) AS k)
  )
$f$;
