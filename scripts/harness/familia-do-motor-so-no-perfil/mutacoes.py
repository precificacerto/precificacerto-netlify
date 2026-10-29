#!/usr/bin/env python3
"""Mutações da 20261029000002: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para)."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261029000002_familia_do_motor_so_no_perfil.sql").read_text()

MUTACOES = [
    ("G1 a guarda não exige a 20261029000001", [("     OR to_regprocedure('public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)') IS NULL\n     OR (to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text)') IS NULL\n         AND to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text)') IS NULL)\n", "")]),
    ("G2 a guarda do motor fora do Perfil com família some", [("  IF v_n > 0 THEN\n    RAISE EXCEPTION 'guarda: % motor(es) fora do Perfil", "  IF false THEN\n    RAISE EXCEPTION 'guarda: % motor(es) fora do Perfil")]),
    ("G3 aceita um subconjunto das 3 etapas", [("    IF NOT (v_pendentes <@ v_esperadas AND v_esperadas <@ v_pendentes) THEN", "    IF NOT (v_pendentes <@ v_esperadas) THEN")]),
    ("G4 aceita etapa a mais", [("    IF NOT (v_pendentes <@ v_esperadas AND v_esperadas <@ v_pendentes) THEN", "    IF NOT (v_esperadas <@ v_pendentes) THEN")]),
    ("G5 a guarda da família do motor das etapas some", [("                WHERE e.id = ANY (v_pendentes) AND (m.familia IS NULL OR m.familia <> e.familia OR m.categoria_chave <> 'PERFIL')) THEN", "                WHERE false) THEN")]),
    ("G6 a guarda aceita motor sem família", [("(m.familia IS NULL OR m.familia <> e.familia OR m.categoria_chave <> 'PERFIL')", "(m.familia <> e.familia OR m.categoria_chave <> 'PERFIL')")]),
    ("G7 a guarda do item some", [("  IF v_n > 0 THEN\n    RAISE EXCEPTION 'guarda: % item(ns)", "  IF false THEN\n    RAISE EXCEPTION 'guarda: % item(ns)")]),
    ("G8 a guarda da forma da chave some", [("  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_catalogo_chave_forma'", "  IF false AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_catalogo_chave_forma'")]),
    ("S1 a família do motor continua NOT NULL", [("ALTER TABLE public.orcamentista_motor ALTER COLUMN familia DROP NOT NULL;\n", "")]),
    ("S2 a exigida do motor sem família não é '*'", [("GENERATED ALWAYS AS (coalesce(familia, '*')) STORED", "GENERATED ALWAYS AS (coalesce(familia, 'QUALQUER')) STORED")]),
    ("S3 a CHECK do motor só de um lado (a da tabela)", [("      CHECK ((categoria_chave = 'PERFIL') = (familia IS NOT NULL));", "      CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR familia IS NOT NULL);")]),
    ("S4 o UNIQUE (id, familia_exigida) não nasce", [("    ALTER TABLE public.orcamentista_motor ADD CONSTRAINT orcamentista_motor_id_familia_exigida_key UNIQUE (id, familia_exigida);", "    NULL;")]),
    ("S5 a CHECK da etapa sem o 'se e só se'", [("    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_motor_familia_exigida\n      CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL) AND ", "    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_motor_familia_exigida\n      CHECK (")]),
    ("S6 a CHECK da etapa aceita qualquer exigida", [("    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_motor_familia_exigida\n      CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL) AND (motor_familia_exigida IS NULL OR motor_familia_exigida = familia OR motor_familia_exigida = '*'));", "    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_motor_familia_exigida\n      CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL));")]),
    ("S7 a FK nova da etapa não nasce", [("    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_motor_exigida_fkey\n      FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES public.orcamentista_motor (id, familia_exigida) ON DELETE RESTRICT;", "    NULL;")]),
    ("S8 a FK antiga da etapa fica", [("ALTER TABLE public.orcamentista_familia_etapa DROP CONSTRAINT IF EXISTS orcamentista_familia_etapa_motor_fkey;\n", "")]),
    ("S9 a CHECK do item não nasce", [("    ALTER TABLE public.orcamentista_levantamento_item ADD CONSTRAINT orcamentista_levantamento_item_motor_familia_exigida\n      CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL) AND (motor_familia_exigida IS NULL OR motor_familia_exigida = familia OR motor_familia_exigida = '*'));", "    NULL;")]),
    ("S10 a FK nova do item não nasce", [("    ALTER TABLE public.orcamentista_levantamento_item ADD CONSTRAINT orcamentista_levantamento_item_motor_exigida_fkey\n      FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES public.orcamentista_motor (id, familia_exigida) ON DELETE RESTRICT;", "    NULL;")]),
    ("S11 a FK antiga do item fica", [("ALTER TABLE public.orcamentista_levantamento_item DROP CONSTRAINT IF EXISTS orcamentista_levantamento_item_motor_familia_fkey;\n", "")]),
    ("S12 o UNIQUE (id, familia) fica", [("ALTER TABLE public.orcamentista_motor DROP CONSTRAINT IF EXISTS orcamentista_motor_id_familia_key;\n", "")]),
    ("S13 a FK nova sem o RESTRICT", [("FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES public.orcamentista_motor (id, familia_exigida) ON DELETE RESTRICT;\n  END IF;\n\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_familia_exigida')", "FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES public.orcamentista_motor (id, familia_exigida) ON DELETE SET NULL;\n  END IF;\n\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_familia_exigida')")]),
    ("P1 o preenchimento não grava", [("    UPDATE public.orcamentista_familia_etapa SET motor_familia_exigida = v_etapa.familia_exigida WHERE id = v_etapa.id;", "    NULL;")]),
    ("P2 o preenchimento grava '*'", [("    UPDATE public.orcamentista_familia_etapa SET motor_familia_exigida = v_etapa.familia_exigida WHERE id = v_etapa.id;", "    UPDATE public.orcamentista_familia_etapa SET motor_familia_exigida = '*' WHERE id = v_etapa.id;")]),
    ("P3 o preenchimento mexe no atualizado_em", [("    UPDATE public.orcamentista_familia_etapa SET motor_familia_exigida = v_etapa.familia_exigida WHERE id = v_etapa.id;", "    UPDATE public.orcamentista_familia_etapa SET motor_familia_exigida = v_etapa.familia_exigida, atualizado_em = now() WHERE id = v_etapa.id;")]),
    ("P4 o preenchimento não loga", [("    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,\n            jsonb_build_object('orcamentista_familia_etapa', v_antes, 'migracao'", "    SELECT v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,\n            jsonb_build_object('orcamentista_familia_etapa', v_antes, 'migracao'")]),
    ("P5 o log sem a empresa", [("    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,\n            jsonb_build_object('orcamentista_familia_etapa', v_antes, 'migracao'", "    VALUES (NULL, 'orcamentista_familia_etapa', v_etapa.id::text,\n            jsonb_build_object('orcamentista_familia_etapa', v_antes, 'migracao'")]),
    ("P6 reaplicada, loga de novo", [("     WHERE e.motor_familia_exigida IS NULL ORDER BY e.id FOR UPDATE OF e", "     ORDER BY e.id FOR UPDATE OF e")]),
    ("C1 criar aceita Perfil sem família", [("  IF p_categoria = 'PERFIL' THEN\n    IF p_familia IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN\n      RAISE EXCEPTION 'o motor de Perfil tem familia (linha), e ela tem de ser do catalogo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n    END IF;\n  ELSIF p_familia IS NOT NULL THEN\n    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n\n  -- o arquivo mora", "  IF p_categoria = 'PERFIL' THEN\n    NULL;\n  ELSIF p_familia IS NOT NULL THEN\n    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n\n  -- o arquivo mora")]),
    ("C2 criar aceita família fora do Perfil", [("  ELSIF p_familia IS NOT NULL THEN\n    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n\n  -- o arquivo mora", "  END IF;\n\n  -- o arquivo mora")]),
    ("C3 criar aceita família fora do catálogo", [("    IF p_familia IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN\n      RAISE EXCEPTION 'o motor de Perfil tem familia (linha), e ela tem de ser do catalogo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n    END IF;\n  ELSIF p_familia IS NOT NULL THEN\n    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n\n  -- o arquivo mora", "    IF p_familia IS NULL THEN\n      RAISE EXCEPTION 'o motor de Perfil tem familia (linha), e ela tem de ser do catalogo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n    END IF;\n  ELSIF p_familia IS NOT NULL THEN\n    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n\n  -- o arquivo mora")]),
    ("D1 gravar não atualiza a exigida", [("               motor_familia_exigida = CASE WHEN e ? 'motor_id'\n                 THEN (SELECT m.familia_exigida FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid)\n                 ELSE motor_familia_exigida END\n", "               motor_familia_exigida = motor_familia_exigida\n")]),
    ("D2 gravar sem motor_id apaga a exigida", [("                 ELSE motor_familia_exigida END\n", "                 ELSE NULL END\n")]),
    ("D3 gravar insere sem a exigida", [("                (SELECT m.familia_exigida FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid));", "                NULL);")]),
    ("D4 gravar recusa o motor sem família", [("      IF v_mfam <> v_familia THEN  -- o motor sem familia (NULL) passa: serve qualquer linha", "      IF v_mfam IS DISTINCT FROM v_familia THEN")]),
    ("D5 gravar aceita motor de outra linha", [("      IF v_mfam <> v_familia THEN  -- o motor sem familia (NULL) passa: serve qualquer linha", "      IF false THEN")]),
    ("E1 editar aceita Perfil sem família", [("  IF p_categoria = 'PERFIL' THEN\n    IF p_familia IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN\n      RAISE EXCEPTION 'o motor de Perfil tem familia (linha), e ela tem de ser do catalogo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n    END IF;\n  ELSIF p_familia IS NOT NULL THEN\n    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  IF p_fornecedor IS NULL", "  IF p_categoria = 'PERFIL' THEN\n    NULL;\n  ELSIF p_familia IS NOT NULL THEN\n    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  IF p_fornecedor IS NULL")]),
    ("E2 editar aceita família fora do Perfil", [("  ELSIF p_familia IS NOT NULL THEN\n    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  IF p_fornecedor IS NULL", "  END IF;\n  IF p_fornecedor IS NULL")]),
    ("E3 editar não grava a família", [("SET fornecedor_id = p_fornecedor, categoria_chave = p_categoria, familia = p_familia, arquivo_path = v_path WHERE id = p_motor;", "SET fornecedor_id = p_fornecedor, categoria_chave = p_categoria, arquivo_path = v_path WHERE id = p_motor;")]),
    ("E4 nada mudou ignora a família", [("  IF p_fornecedor = v_atual.fornecedor_id AND p_categoria = v_atual.categoria_chave AND p_familia IS NOT DISTINCT FROM v_atual.familia THEN", "  IF p_fornecedor = v_atual.fornecedor_id AND p_categoria = v_atual.categoria_chave THEN")]),
    ("E5 a assinatura antiga do editar fica", [("DROP FUNCTION IF EXISTS public.superadmin_editar_motor(uuid, uuid, uuid, text, text);\n", "")]),
    ("E6 editar com uso", [("  IF v_etapas > 0 OR v_itens > 0 THEN", "  IF false THEN")]),
    ("E7 editar aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text) TO service_role, authenticated;")]),
    # o REVOKE ... FROM PUBLIC de uma função que JÁ existe é equivalente: CREATE OR REPLACE guarda o ACL de antes; a mutação que vale é o GRANT a mais
    ("E8 criar aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb) TO service_role, authenticated;")]),
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
