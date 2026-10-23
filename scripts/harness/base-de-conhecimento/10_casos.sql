-- CASOS do harness das funções da base de conhecimento. Cada caso: `ok: ...` (NOTICE) ou
-- `FALHOU: ...` (EXCEPTION). As linhas `-- CASO ` são contadas pelo run.sh.
\set ON_ERROR_STOP 0

-- ── o mundo ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tenants VALUES ('aaaaaaaa-0000-4000-8000-000000000001'), ('aaaaaaaa-0000-4000-8000-000000000002');
INSERT INTO public.users VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', NULL, 'super_admin', true),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'admin', false);
INSERT INTO public.orcamentista_nicho VALUES ('cccccccc-0000-4000-8000-000000000001', 'FABRICACAO', 'Esquadrias');
INSERT INTO public.employees VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Ana', NULL),
  ('dddddddd-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'Bruno', NULL);

CREATE FUNCTION pg_temp.logs() RETURNS bigint LANGUAGE sql AS 'select count(*) from public.superadmin_alteracao_log';
CREATE FUNCTION pg_temp.base(c text) RETURNS jsonb LANGUAGE sql AS
  $$ select to_jsonb(b) -> c from public.orcamentista_esquadrias_base b where tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$;
CREATE FUNCTION pg_temp.efetivo(c text) RETURNS jsonb LANGUAGE sql AS $$
  select coalesce(nullif(to_jsonb(b) -> c, 'null'::jsonb), to_jsonb(p) -> c)
    from public.orcamentista_esquadrias_base b, public.orcamentista_esquadrias_padrao p
   where b.tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001' and p.nicho_id = 'cccccccc-0000-4000-8000-000000000001' $$;

-- CASO 1 — o padrão do nicho: grava, e o log vai com tenant_id NULL e chave = o nicho
DO $$ DECLARE n0 bigint := pg_temp.logs(); l record; BEGIN
  PERFORM public.superadmin_gravar_esquadrias_padrao('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
    '{"usa_contramarco": true, "vidro_predominante": "Incolor 4mm", "linha_perfil": "Gold"}');
  SELECT * INTO l FROM public.superadmin_alteracao_log ORDER BY em DESC, id LIMIT 1;
  IF pg_temp.logs() <> n0 + 1 OR l.tenant_id IS NOT NULL OR l.chave <> 'cccccccc-0000-4000-8000-000000000001'
     OR l.tabela <> 'orcamentista_esquadrias_padrao'
     OR l.antes <> '{"orcamentista_esquadrias_padrao": null}'::jsonb
     OR l.depois -> 'orcamentista_esquadrias_padrao' ->> 'vidro_predominante' <> 'Incolor 4mm' THEN
    RAISE EXCEPTION 'FALHOU 1: log do padrão = %', to_jsonb(l);
  END IF;
  RAISE NOTICE 'ok: 1 padrão do nicho gravado, log com tenant_id NULL e chave = nicho';
END $$;

-- CASO 2 — a base da empresa: tipos de lista (text[]) e de mapa (jsonb) chegam inteiros
DO $$ BEGIN
  PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
    '{"linha_perfil": "Suprema", "vidro_predominante": "Fumê", "cores_perfil": ["Branco", "Preto"], "cor_acessorio_por_perfil": {"branco": "branco"}}', NULL);
  IF pg_temp.base('linha_perfil') <> '"Suprema"' OR pg_temp.base('cores_perfil') <> '["Branco", "Preto"]'
     OR (SELECT pg_typeof(cores_perfil)::text FROM public.orcamentista_esquadrias_base) <> 'text[]'
     OR pg_temp.base('cor_acessorio_por_perfil') <> '{"branco": "branco"}' THEN
    RAISE EXCEPTION 'FALHOU 2: base = %', (SELECT to_jsonb(b) FROM public.orcamentista_esquadrias_base b);
  END IF;
  RAISE NOTICE 'ok: 2 base gravada, text[] e jsonb inteiros';
END $$;

-- CASO 3 — campo AUSENTE não apaga
DO $$ BEGIN
  PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '{"solda": "MIG"}', NULL);
  IF pg_temp.base('linha_perfil') <> '"Suprema"' OR pg_temp.base('vidro_predominante') <> '"Fumê"' OR pg_temp.base('solda') <> '"MIG"' THEN
    RAISE EXCEPTION 'FALHOU 3: o ausente mexeu no gravado: %', (SELECT to_jsonb(b) FROM public.orcamentista_esquadrias_base b);
  END IF;
  RAISE NOTICE 'ok: 3 campo ausente não apaga o que estava gravado';
END $$;

-- CASO 4 — campo com NULL apaga, e o efetivo volta a ser o do nicho
DO $$ BEGIN
  IF pg_temp.efetivo('vidro_predominante') <> '"Fumê"' THEN RAISE EXCEPTION 'FALHOU 4: pré-condição'; END IF;
  PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '{"vidro_predominante": null}', NULL);
  IF pg_temp.base('vidro_predominante') <> 'null'::jsonb OR pg_temp.efetivo('vidro_predominante') <> '"Incolor 4mm"' THEN
    RAISE EXCEPTION 'FALHOU 4: base=% efetivo=%', pg_temp.base('vidro_predominante'), pg_temp.efetivo('vidro_predominante');
  END IF;
  RAISE NOTICE 'ok: 4 null apaga e o efetivo volta a herdar do nicho';
END $$;

-- CASO 5 — FALSE fica false, e vence o true do nicho
DO $$ BEGIN
  PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '{"usa_contramarco": false}', NULL);
  IF pg_temp.base('usa_contramarco') <> 'false' OR pg_temp.efetivo('usa_contramarco') <> 'false' THEN
    RAISE EXCEPTION 'FALHOU 5: base=% efetivo=%', pg_temp.base('usa_contramarco'), pg_temp.efetivo('usa_contramarco');
  END IF;
  RAISE NOTICE 'ok: 5 false gravado; efetivo false com true no nicho';
END $$;

-- CASO 6 — toda escrita deixa UMA linha de log, com antes, depois, por, tenant e chave
DO $$ DECLARE n0 bigint := pg_temp.logs(); l record; BEGIN
  PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '{"vedacao": "Escova"}', NULL);
  SELECT * INTO l FROM public.superadmin_alteracao_log ORDER BY em DESC, id LIMIT 1;
  IF pg_temp.logs() <> n0 + 1
     OR l.tabela <> 'orcamentista_esquadrias_base' OR l.chave <> 'aaaaaaaa-0000-4000-8000-000000000001'
     OR l.tenant_id <> 'aaaaaaaa-0000-4000-8000-000000000001' OR l.por <> 'bbbbbbbb-0000-4000-8000-000000000001'
     OR l.antes -> 'orcamentista_esquadrias_base' -> 'vedacao' <> 'null'::jsonb
     OR l.depois -> 'orcamentista_esquadrias_base' ->> 'vedacao' <> 'Escova'
     OR l.antes -> 'orcamentista_esquadrias_base' ->> 'linha_perfil' <> 'Suprema' THEN
    RAISE EXCEPTION 'FALHOU 6: logs %→%, linha %', n0, pg_temp.logs(), to_jsonb(l);
  END IF;
  RAISE NOTICE 'ok: 6 UMA linha de log por escrita, com antes, depois, por, tenant e chave';
END $$;

-- CASO 7 — o LOG FALHA → a escrita é DESFEITA (as duas são uma transação)
ALTER TABLE public.superadmin_alteracao_log ADD CONSTRAINT harness_log_quebrado CHECK (tabela = 'nenhuma') NOT VALID;
DO $$ DECLARE n0 bigint := pg_temp.logs(); BEGIN
  BEGIN
    PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '{"linha_perfil": "Nova"}', NULL);
    RAISE EXCEPTION 'FALHOU 7: a função não falhou com o log quebrado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF pg_temp.base('linha_perfil') <> '"Suprema"' OR pg_temp.logs() <> n0 THEN
    RAISE EXCEPTION 'FALHOU 7: a escrita ficou sem log: linha_perfil=% logs %→%', pg_temp.base('linha_perfil'), n0, pg_temp.logs();
  END IF;
  RAISE NOTICE 'ok: 7 log que falha desfaz a escrita';
END $$;
ALTER TABLE public.superadmin_alteracao_log DROP CONSTRAINT harness_log_quebrado;

-- CASO 8 — validação da função: chave desconhecida → 22023, nada gravado, nenhum log
DO $$ DECLARE n0 bigint := pg_temp.logs(); BEGIN
  BEGIN
    PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '{"linha_perfil": "X", "espessura_baguete": 3}', NULL);
    RAISE EXCEPTION 'FALHOU 8: aceitou chave desconhecida';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  IF pg_temp.logs() <> n0 OR pg_temp.base('linha_perfil') <> '"Suprema"' THEN RAISE EXCEPTION 'FALHOU 8: gravou ou logou'; END IF;
  RAISE NOTICE 'ok: 8 chave desconhecida recusada (22023), sem escrita e sem log';
END $$;

-- CASO 9 — CHECK do banco: guarnição 0 mm → 23514, nada gravado, nenhum log
DO $$ DECLARE n0 bigint := pg_temp.logs(); BEGIN
  BEGIN
    PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '{"guarnicao_interna_mm": 0}', NULL);
    RAISE EXCEPTION 'FALHOU 9: aceitou 0 mm';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF pg_temp.logs() <> n0 OR pg_temp.base('guarnicao_interna_mm') <> 'null'::jsonb THEN RAISE EXCEPTION 'FALHOU 9: gravou ou logou'; END IF;
  RAISE NOTICE 'ok: 9 CHECK recusa (23514), sem escrita e sem log';
END $$;

-- CASO 10 — o `por` tem de ser super admin: o admin de tenant → 42501, nada gravado, nenhum log
DO $$ DECLARE n0 bigint := pg_temp.logs(); BEGIN
  BEGIN
    PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', '{"linha_perfil": "X"}', NULL);
    RAISE EXCEPTION 'FALHOU 10: aceitou por que não é super admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF pg_temp.logs() <> n0 OR pg_temp.base('linha_perfil') <> '"Suprema"' THEN RAISE EXCEPTION 'FALHOU 10: gravou ou logou'; END IF;
  RAISE NOTICE 'ok: 10 por que não é super admin recusado (42501)';
END $$;

-- CASO 11 — tenant inexistente → P0002, nenhum log
DO $$ DECLARE n0 bigint := pg_temp.logs(); BEGIN
  BEGIN
    PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-0000000000ff', 'bbbbbbbb-0000-4000-8000-000000000001', '{"linha_perfil": "X"}', NULL);
    RAISE EXCEPTION 'FALHOU 11: aceitou tenant inexistente';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF pg_temp.logs() <> n0 THEN RAISE EXCEPTION 'FALHOU 11: logou'; END IF;
  RAISE NOTICE 'ok: 11 tenant inexistente recusado (P0002), sem log';
END $$;

-- CASO 12 — adicionais: a coerência é do estado RESULTANTE (o ausente fica)
DO $$ DECLARE n0 bigint; BEGIN
  PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', NULL, '{"frete_modo": "VALOR", "frete_valor": 150}');
  n0 := pg_temp.logs();
  BEGIN
    PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', NULL,
      '{"frete_modo": "PERCENTUAL", "frete_percentual": 5, "frete_base": "VALOR_DE_VENDA"}');
    RAISE EXCEPTION 'FALHOU 12: aceitou PERCENTUAL com o valor antigo ainda gravado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF pg_temp.logs() <> n0 THEN RAISE EXCEPTION 'FALHOU 12: logou a recusa'; END IF;
  PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', NULL,
    '{"frete_modo": "PERCENTUAL", "frete_percentual": 5, "frete_base": "VALOR_DE_VENDA", "frete_valor": null}');
  IF (SELECT frete_modo || '/' || frete_percentual || '/' || frete_base || '/' || coalesce(frete_valor::text, 'nulo')
        FROM public.orcamentista_base_conhecimento) <> 'PERCENTUAL/5/VALOR_DE_VENDA/nulo' THEN
    RAISE EXCEPTION 'FALHOU 12: %', (SELECT to_jsonb(b) FROM public.orcamentista_base_conhecimento b);
  END IF;
  RAISE NOTICE 'ok: 12 adicionais: o valor que ficou bloqueia o PERCENTUAL; limpo com null, passa';
END $$;

-- CASO 13 — esquadrias e adicionais na MESMA chamada → UMA linha de log, com as duas tabelas
DO $$ DECLARE n0 bigint := pg_temp.logs(); l record; BEGIN
  PERFORM public.superadmin_gravar_base_da_empresa('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
    '{"modelo_interlock": "Simples"}', '{"instalacao_modo": "NAO_COBRA"}');
  SELECT * INTO l FROM public.superadmin_alteracao_log ORDER BY em DESC, id LIMIT 1;
  IF pg_temp.logs() <> n0 + 1 OR l.tabela <> 'orcamentista_esquadrias_base,orcamentista_base_conhecimento'
     OR NOT (l.antes ? 'orcamentista_esquadrias_base' AND l.antes ? 'orcamentista_base_conhecimento')
     OR l.depois -> 'orcamentista_base_conhecimento' ->> 'instalacao_modo' <> 'NAO_COBRA' THEN
    RAISE EXCEPTION 'FALHOU 13: %', to_jsonb(l);
  END IF;
  RAISE NOTICE 'ok: 13 duas tabelas numa chamada, UMA linha de log com as duas';
END $$;

-- CASO 14 — ambiente: a lista É o estado; item ausente sai, campo ausente fica
DO $$ DECLARE n0 bigint; l record; BEGIN
  PERFORM public.superadmin_gravar_padrao_ambiente('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
    '[{"ambiente": "Sala", "vidro_padrao": "Temperado 8mm", "tipologia_usual": "Correr"}, {"ambiente": "Quarto"}]');
  n0 := pg_temp.logs();
  PERFORM public.superadmin_gravar_padrao_ambiente('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
    '[{"ambiente": "Sala", "vidro_padrao": "Laminado"}, {"ambiente": "Cozinha"}]');
  SELECT * INTO l FROM public.superadmin_alteracao_log ORDER BY em DESC, id LIMIT 1;
  IF (SELECT string_agg(ambiente || ':' || coalesce(vidro_padrao, '-') || ':' || coalesce(tipologia_usual, '-'), ' ' ORDER BY ambiente)
        FROM public.orcamentista_padrao_ambiente) <> 'Cozinha:-:- Sala:Laminado:Correr'
     OR pg_temp.logs() <> n0 + 1
     OR jsonb_array_length(l.antes -> 'orcamentista_padrao_ambiente') <> 2
     OR NOT (l.antes::text LIKE '%Quarto%') OR l.depois::text LIKE '%Quarto%' THEN
    RAISE EXCEPTION 'FALHOU 14: %  log %', (SELECT jsonb_agg(to_jsonb(a)) FROM public.orcamentista_padrao_ambiente a), to_jsonb(l);
  END IF;
  RAISE NOTICE 'ok: 14 ambiente: lista substitui, campo ausente fica, UMA linha de log';
END $$;

-- CASO 15 — ambiente repetido na lista → 22023, nada muda, nenhum log
DO $$ DECLARE n0 bigint := pg_temp.logs(); BEGIN
  BEGIN
    PERFORM public.superadmin_gravar_padrao_ambiente('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
      '[{"ambiente": "Sala"}, {"ambiente": "Sala"}]');
    RAISE EXCEPTION 'FALHOU 15: aceitou ambiente repetido';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  IF pg_temp.logs() <> n0 OR (SELECT count(*) FROM public.orcamentista_padrao_ambiente) <> 2 THEN RAISE EXCEPTION 'FALHOU 15'; END IF;
  RAISE NOTICE 'ok: 15 ambiente repetido recusado, sem escrita e sem log';
END $$;

-- CASO 16 — vendedor de OUTRA empresa → recusado (23503), nada gravado, nenhum log
DO $$ DECLARE n0 bigint := pg_temp.logs(); BEGIN
  BEGIN
    PERFORM public.superadmin_gravar_vendedor_perfil('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
      '[{"employee_id": "dddddddd-0000-4000-8000-000000000002", "comissao_percentual": 5}]');
    RAISE EXCEPTION 'FALHOU 16: aceitou funcionário de outra empresa';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF pg_temp.logs() <> n0 OR (SELECT count(*) FROM public.orcamentista_vendedor_perfil) <> 0 THEN RAISE EXCEPTION 'FALHOU 16'; END IF;
  RAISE NOTICE 'ok: 16 vendedor de outra empresa recusado (23503), sem escrita e sem log';
END $$;

-- CASO 17 — vendedor: a lista substitui, e o campo ausente fica
DO $$ BEGIN
  PERFORM public.superadmin_gravar_vendedor_perfil('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
    '[{"employee_id": "dddddddd-0000-4000-8000-000000000001", "comissao_percentual": 5, "comissao_modo": "PROPORCIONAL"}]');
  PERFORM public.superadmin_gravar_vendedor_perfil('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
    '[{"employee_id": "dddddddd-0000-4000-8000-000000000001", "comissao_percentual": 7}]');
  IF (SELECT comissao_percentual || '/' || comissao_modo FROM public.orcamentista_vendedor_perfil) <> '7/PROPORCIONAL' THEN
    RAISE EXCEPTION 'FALHOU 17: %', (SELECT jsonb_agg(to_jsonb(v)) FROM public.orcamentista_vendedor_perfil v);
  END IF;
  PERFORM public.superadmin_gravar_vendedor_perfil('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', '[]');
  IF (SELECT count(*) FROM public.orcamentista_vendedor_perfil) <> 0 THEN RAISE EXCEPTION 'FALHOU 17: lista vazia não esvaziou'; END IF;
  RAISE NOTICE 'ok: 17 vendedor: campo ausente fica; lista vazia esvazia';
END $$;

-- CASO 18 — as quatro NASCEM FECHADAS: só service_role executa; DEFINER; search_path fixo
DO $$ DECLARE f regprocedure; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.superadmin_gravar_base_da_empresa(uuid, uuid, jsonb, jsonb)'::regprocedure,
    'public.superadmin_gravar_esquadrias_padrao(uuid, uuid, jsonb)'::regprocedure,
    'public.superadmin_gravar_padrao_ambiente(uuid, uuid, jsonb)'::regprocedure,
    'public.superadmin_gravar_vendedor_perfil(uuid, uuid, jsonb)'::regprocedure
  ] LOOP
    IF has_function_privilege('public', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE') OR NOT has_function_privilege('service_role', f, 'EXECUTE')
       OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = f)
       OR NOT (SELECT 'search_path=public, pg_temp' = ANY (proconfig) FROM pg_proc WHERE oid = f) THEN
      RAISE EXCEPTION 'FALHOU 18: % aberta ou sem search_path', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok: 18 as quatro: só service_role executa, SECURITY DEFINER, search_path fixo';
END $$;
