#!/usr/bin/env python3
"""Mutações da 20261031000003 (o catálogo é soberano): cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para)."""
import os
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261031000003_catalogo_soberano.sql").read_text()

MUTACOES = [
    # a guarda
    ("G1 a guarda não exige a 20261031000002", [("  IF to_regclass('public.orcamentista_etapa_catalogo') IS NULL\n     OR NOT EXISTS", "  IF false AND to_regclass('public.orcamentista_etapa_catalogo') IS NULL\n     OR false AND NOT EXISTS"),
                                                ("     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'acao') THEN", "     OR false THEN")]),
    # os passos
    ("P1 o item de levantamento SAI na família (a trava C cai)", [("    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'perde_o_vinculo', 'filtro', 'x.familia = $1',\n      'anula', 'familia = NULL, motor_id = NULL, motor_familia_exigida = NULL'",
                                                                    "    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'sai', 'filtro', 'x.familia = $1',\n      'anula', 'familia = NULL, motor_id = NULL, motor_familia_exigida = NULL'")]),
    ("P2 o item não perde a tabela", [("    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'perde_o_vinculo', 'filtro', 'x.tabela_id = ANY ($3)',", "    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item', 'acao', 'perde_o_vinculo', 'filtro', 'false AND x.tabela_id = ANY ($3)',")]),
    ("P3 o item perde a família também no motor", [("      'anula', 'motor_id = NULL, motor_familia_exigida = NULL', 'nome', v_item,", "      'anula', 'motor_id = NULL, motor_familia_exigida = NULL, familia = NULL', 'nome', v_item,")]),
    ("P4 a etapa SAI no motor (em vez de perder o motor)", [("    v_p := v_p || jsonb_build_object('t', 'orcamentista_familia_etapa', 'acao', 'perde_o_vinculo', 'filtro', 'x.motor_id = ANY ($2)',", "    v_p := v_p || jsonb_build_object('t', 'orcamentista_familia_etapa', 'acao', 'sai', 'filtro', 'x.motor_id = ANY ($2)',")]),
    ("P5 o conteúdo da tabela não sai no fornecedor", [("      v_p := v_p || jsonb_build_object('t', t, 'acao', 'sai', 'filtro', 'x.tabela_id = ANY ($3)'", "      v_p := v_p || jsonb_build_object('t', t, 'acao', 'sai', 'filtro', 'false AND x.tabela_id = ANY ($3)'")]),
    ("P6 o vínculo de conta (mp_categoria_fornecedor) não sai", [("'filtro', 'x.fornecedor_id = $1::uuid',", "'filtro', 'false AND x.fornecedor_id = $1::uuid',")]),
    ("P7 a tabela de outra categoria SAI na família", [("      || jsonb_build_object('t', 'orcamentista_tabela', 'acao', 'perde_o_vinculo', 'filtro', 'x.familia = $1 AND NOT (x.id = ANY ($3))', 'anula', 'familia = NULL',",
                                                       "      || jsonb_build_object('t', 'orcamentista_tabela', 'acao', 'sai', 'filtro', 'x.familia = $1 AND NOT (x.id = ANY ($3))', 'anula', 'familia = NULL',")]),
    ("P8 a matéria-prima não perde a família", [("      || jsonb_build_object('t', 'orcamentista_materia_prima', 'acao', 'perde_o_vinculo', 'filtro', 'x.familia = $1'", "      || jsonb_build_object('t', 'orcamentista_materia_prima', 'acao', 'perde_o_vinculo', 'filtro', 'false AND x.familia = $1'")]),
    ("P9 a ligação da família não sai (só a dos motores)", [("'filtro', 'x.familia = $1 OR x.motor_id = ANY ($2)',", "'filtro', 'x.motor_id = ANY ($2)',")]),
    ("P10 a etapa do catálogo não leva a etapa da conta", [("      jsonb_build_object('t', 'orcamentista_familia_etapa', 'acao', 'sai', 'filtro', 'x.etapa_catalogo_id = $1::uuid'", "      jsonb_build_object('t', 'orcamentista_familia_etapa', 'acao', 'sai', 'filtro', 'false AND x.etapa_catalogo_id = $1::uuid'")]),
    # os conjuntos
    ("K1 a família leva o motor de várias famílias", [("     WHERE mf.familia = p_chave AND NOT EXISTS (SELECT 1 FROM public.orcamentista_motor_familia o WHERE o.motor_id = mf.motor_id AND o.familia <> p_chave);", "     WHERE mf.familia = p_chave;")]),
    ("K2 a família leva toda tabela dela (não só a de Perfil)", [("FROM public.orcamentista_tabela t WHERE t.familia = p_chave AND t.categoria_chave = 'PERFIL';", "FROM public.orcamentista_tabela t WHERE t.familia = p_chave;")]),
    ("K3 o fornecedor não leva os motores", [("INTO motores FROM public.orcamentista_motor m WHERE m.fornecedor_id = p_chave::uuid;", "INTO motores FROM public.orcamentista_motor m WHERE false;")]),
    # a medição
    ("M1 a medição sem o limite de 10 nomes", [("ORDER BY 1 LIMIT 10) z', p ->> 'nome'", "ORDER BY 1) z', p ->> 'nome'")]),
    ("M2 a medição sem o 'mais N'", [("'mais', greatest(v_n - 10, 0));", "'mais', 0);")]),
    ("M3 sem o aviso da conversa", [("           WHERE t.id = ANY (c.tabelas) AND EXISTS (SELECT 1 FROM public.orcamentista_motor_tipologia mt WHERE mt.tabela_id = t.id)) z;", "           WHERE false) z;")]),
    ("M4 o aviso da conversa sem a empresa", [("                            WHERE tn.id IN (SELECT ct.tenant_id", "                            WHERE false AND tn.id IN (SELECT ct.tenant_id")]),
    ("M5 sem o impedimento da vigente", [("            HAVING count(*) > 1 AND bool_or(t.familia = p_chave)) z;", "            HAVING false) z;")]),
    ("M9 sem o aviso da renumeração", [("    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('tipo', 'renumeracao'));", "    NULL;")]),
    ("M6 o Storage do fornecedor só pelos caminhos das tabelas", [("WHERE o.name LIKE p_chave || '/%' OR o.name = ANY", "WHERE o.name = ANY")]),
    ("M7 a assinatura sem as quantidades", [("    'assinatura', md5((SELECT string_agg((x ->> 'passo') || ':' || (x ->> 'quantidade'), ',' ORDER BY (x ->> 'passo')::int) FROM jsonb_array_elements(v_passos) x)));", "    'assinatura', md5(p_tipo || p_chave));")]),
    # a remoção
    ("R1 remover por qualquer um", [("  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n\n  -- uma remocao", "  -- uma remocao")]),
    ("R2 remover sem conferir a assinatura", [("  IF p_assinatura IS DISTINCT FROM v_medida ->> 'assinatura' THEN", "  IF false THEN")]),
    ("R3 remover sem a trava do motor", [("  PERFORM 1 FROM public.orcamentista_motor x WHERE x.id = ANY (c.motores) ORDER BY x.id FOR UPDATE;", "  PERFORM 1 FROM public.orcamentista_motor x WHERE x.id = ANY (c.motores) ORDER BY x.id;")]),
    ("R4 remover sem a trava da raiz e sem a de aviso", [("  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_remover_do_catalogo', 0));", "  NULL;"),
                                                         ("  ELSIF p_tipo = 'familia' THEN PERFORM 1 FROM public.orcamentista_familia_catalogo x WHERE x.chave = p_chave FOR UPDATE;\n  END IF;", "  END IF;"),
                                                         ("  IF p_tipo = 'etapa' THEN PERFORM 1 FROM public.orcamentista_etapa_catalogo x WHERE x.id = p_chave::uuid FOR UPDATE;\n  ELSIF", "  IF false THEN NULL;\n  ELSIF")]),
    ("R5 remover sem recusar o impedimento", [("  IF jsonb_array_length(v_medida -> 'impedimentos') > 0 THEN", "  IF false THEN")]),
    ("R6 o log sem o tenant", [("         SELECT (to_jsonb(a) ->> ''tenant_id'')::uuid, %L,", "         SELECT NULL::uuid, %L,")]),
    ("R7 o log do que sai sem a linha", [("                jsonb_build_object(%L, to_jsonb(a)) || $4, NULL, $5", "                $4, NULL, $5")]),
    ("R8 o log do vínculo sem o depois", [("                jsonb_build_object(%L, m.aj) || $4, jsonb_build_object(%L, m.dj), $5", "                jsonb_build_object(%L, m.aj) || $4, NULL::jsonb || jsonb_build_object(%L, null), $5")]),
    ("R9 sem conferir o ROW_COUNT", [("    IF v_n IS DISTINCT FROM (v_passo ->> 'quantidade')::bigint THEN", "    IF false THEN")]),
    ("R10 a etapa sem renumerar", [("  FOREACH v_mp IN ARRAY v_mps LOOP", "  FOREACH v_mp IN ARRAY '{}'::uuid[] LOOP")]),
    ("R11 o log sem o autor", [("        USING p_chave, c.motores, c.tabelas, v_origem, p_por;\n    ELSE", "        USING p_chave, c.motores, c.tabelas, v_origem, NULL::uuid;\n    ELSE")]),
    ("R12 sem a conta das tabelas (a cascata passa sem log)", [("    IF v_n IS DISTINCT FROM (v_conta ->> t)::bigint - (SELECT", "    IF false AND v_n IS DISTINCT FROM (v_conta ->> t)::bigint - (SELECT")]),
    ("R13 P5 e sem a conta: o conteúdo da tabela sai por cascata, sem log", [("      v_p := v_p || jsonb_build_object('t', t, 'acao', 'sai', 'filtro', 'x.tabela_id = ANY ($3)'", "      v_p := v_p || jsonb_build_object('t', t, 'acao', 'sai', 'filtro', 'false AND x.tabela_id = ANY ($3)'"),
                                                                              ("    IF v_n IS DISTINCT FROM (v_conta ->> t)::bigint - (SELECT", "    IF false AND v_n IS DISTINCT FROM (v_conta ->> t)::bigint - (SELECT")]),
    # privilégios
    ("X1 remover aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_remover_do_catalogo(uuid, text, text, text) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_remover_do_catalogo(uuid, text, text, text) TO service_role, authenticated;")]),
    ("X2 as antigas ficam", [("DROP FUNCTION IF EXISTS public.superadmin_remover_familia(uuid, text);\n", "")]),
    ("X3 medir sem SECURITY DEFINER", [("CREATE OR REPLACE FUNCTION public.superadmin_arrasto_do_catalogo(p_tipo text, p_chave text) RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\n", "CREATE OR REPLACE FUNCTION public.superadmin_arrasto_do_catalogo(p_tipo text, p_chave text) RETURNS jsonb\nLANGUAGE plpgsql\n")]),
]

def sem_verifica(t):
    i = t.index("DO $verifica$"); j = t.index("$verifica$;", i) + len("$verifica$;")
    return t[:i] + t[j:]

def rodar(t):
    f = tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False); f.write(t); f.close()
    return subprocess.run(["bash", str(AQUI / "run.sh"), f.name], capture_output=True, text=True).returncode

def aplicar(trocas, tira):
    t = ORIG
    for de, para in trocas: t = t.replace(de, para)
    return sem_verifica(t) if tira else t

# SO=G1,E7 roda só as mutações com esses prefixos (o controle roda sempre)
if os.environ.get("SO"):
    MUTACOES = [m for m in MUTACOES if m[0].split(" ")[0] in os.environ["SO"].split(",")]
erro = [(n, de[:60]) for n, trocas in MUTACOES for de, _ in trocas if ORIG.count(de) != 1]
if erro:
    print("TRECHO NAO ACHADO ou repetido:", erro); sys.exit(1)
vivas = {}
for tira in (False, True):
    c = rodar(aplicar([], tira))
    print(f"CONTROLE {'sem' if tira else 'com'} verificação: {'passa' if c == 0 else 'FALHOU exit ' + str(c)}", flush=True)
    if c != 0: sys.exit(1)
    for nome, trocas in MUTACOES:
        r = rodar(aplicar(trocas, tira))
        print(f"{nome} {'MORTA' if r != 0 else 'SOBREVIVEU'} (exit {r}){' sem verificação' if tira else ''}", flush=True)
        if r == 0: vivas.setdefault(nome, []).append('sem verifica' if tira else 'com verifica')
print("SOBREVIVERAM:", vivas)
sys.exit(1 if vivas else 0)
