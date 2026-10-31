#!/usr/bin/env python3
"""Mutações da 20261031000001: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para)."""
import os
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261031000001_excluir_etapa_na_conta.sql").read_text()

MUTACOES = [
    ("G1 a guarda não exige a 20261029000003", [("  IF to_regclass('public.orcamentista_motor_familia') IS NULL\n     OR to_regprocedure('public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)') IS NULL THEN", "  IF false THEN")]),
    ("G2 a guarda não olha quem aponta a etapa", [("    FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid = 'public.orcamentista_familia_etapa'::regclass;", "    FROM pg_constraint c WHERE false;")]),
    ("D1 não remove (a etapa fica)", [("    DELETE FROM public.orcamentista_familia_etapa WHERE id = v_rem.id;\n", "")]),
    ("D2 remove de qualquer família da empresa", [("     WHERE x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant AND NOT (x.id = ANY (v_ids))", "     WHERE x.tenant_id = p_tenant AND NOT (x.id = ANY (v_ids))")]),
    ("D3 remove também as que vieram na lista", [("     WHERE x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant AND NOT (x.id = ANY (v_ids))", "     WHERE x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant")]),
    ("D4 a recusa antiga volta", [("  -- REMOVE (dono do produto, 30/10/2026)", "  IF EXISTS (SELECT 1 FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima AND NOT (x.id = ANY (v_ids))) THEN\n    RAISE EXCEPTION 'remover etapa nao e permitido por aqui' USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  -- REMOVE (dono do produto, 30/10/2026)")]),
    ("L1 a remoção não loga", [("    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n    VALUES (p_tenant, 'orcamentista_familia_etapa', v_rem.id::text,\n            jsonb_build_object('orcamentista_familia_etapa', to_jsonb(v_rem), 'remocao_da_etapa', true), NULL, p_por);\n", "")]),
    ("L2 o log da remoção sem o tenant", [("    VALUES (p_tenant, 'orcamentista_familia_etapa', v_rem.id::text,", "    VALUES (NULL, 'orcamentista_familia_etapa', v_rem.id::text,")]),
    ("L3 o log da remoção sem a linha", [("            jsonb_build_object('orcamentista_familia_etapa', to_jsonb(v_rem), 'remocao_da_etapa', true), NULL, p_por);", "            jsonb_build_object('remocao_da_etapa', true), NULL, p_por);")]),
    ("L4 o log da lista tirado antes da remoção some (antes já sem a removida)", [("  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.numero), '[]'::jsonb) INTO v_antes\n    FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima;\n\n  -- REMOVE", "  -- REMOVE"), ("  -- duas fases: a unicidade", "  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.numero), '[]'::jsonb) INTO v_antes\n    FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima;\n\n  -- duas fases: a unicidade")]),
    ("R1 a resposta sem as removidas", [("  RETURN jsonb_build_object('orcamentista_familia_etapa', v_depois, 'etapas_removidas', v_removidas);", "  RETURN jsonb_build_object('orcamentista_familia_etapa', v_depois);")]),
    ("R2 a removida com o número errado", [("jsonb_build_object('id', v_rem.id, 'numero', v_rem.numero, 'rotulo', v_rem.rotulo)", "jsonb_build_object('id', v_rem.id, 'numero', 0, 'rotulo', v_rem.rotulo)")]),
    ("N1 renumera com buraco (posição + 1)", [("           SET numero = i, rotulo = e ->> 'rotulo'", "           SET numero = i + 1, rotulo = e ->> 'rotulo'")]),
    ("T1 sem travar a etapa que sai", [("     ORDER BY x.numero\n       FOR UPDATE\n  LOOP\n    DELETE", "     ORDER BY x.numero\n  LOOP\n    DELETE"), ("  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_etapas_da_materia_prima:' || coalesce(p_materia_prima::text, ''), 0));\n", "")]),
    ("P1 aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb) TO service_role, authenticated;")]),
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
