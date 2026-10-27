#!/usr/bin/env python3
"""Mutações da 20261027000007 e da 20261027000008: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar
na base (exit 2). O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e
exige que os CASOS, sozinhos, derrubem cada mutação (ou que a base aborte)."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
O7 = (MIGS / "20261027000007_motor_so_para_perfil.sql").read_text()
O8 = (MIGS / "20261027000008_etapa_aponta_o_motor.sql").read_text()

# EQUIVALENTES, com a razão: a mutação não muda o comportamento observável neste encadeamento.
#  - 8-10: CREATE OR REPLACE FUNCTION preserva o ACL da função que já existe (criada fechada pela 000003); o REVOKE da 000008 só o REAFIRMA.
EQUIVALENTES = {"8-10 arquivar nasce aberta (sem REVOKE)"}

MUTACOES = [
    ("7-1 motor_path segue NOT NULL", 7, "ALTER TABLE public.orcamentista_tabela ALTER COLUMN motor_path DROP NOT NULL;", "SELECT 1;"),
    ("7-2 motor_nome segue NOT NULL", 7, "ALTER TABLE public.orcamentista_tabela ALTER COLUMN motor_nome DROP NOT NULL;", "SELECT 1;"),
    ("7-3 sem a CHECK do par", 7, "ADD CONSTRAINT orcamentista_tabela_motor_par CHECK ((motor_path IS NULL) = (motor_nome IS NULL));", "ADD CONSTRAINT orcamentista_tabela_motor_par CHECK (true);"),
    ("7-4 sem a CHECK do PERFIL", 7, "CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR motor_path IS NOT NULL);", "CHECK (true);"),
    ("7-5 todas as categorias exigem motor", 7, "CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR motor_path IS NOT NULL);", "CHECK (motor_path IS NOT NULL);"),
    ("7-6 a CHECK olha VIDRO, não PERFIL", 7, "CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR motor_path IS NOT NULL);", "CHECK (categoria_chave IS DISTINCT FROM 'VIDRO' OR motor_path IS NOT NULL);"),
    ("7-7 apaga dado (zera o motor da Estrela)", 7, "NOTIFY pgrst, 'reload schema';\n\nCOMMIT;", "UPDATE public.orcamentista_tabela SET motor_path = NULL, motor_nome = NULL WHERE id = '5f7acebf-3c91-46de-af00-57a47f8be288';\nNOTIFY pgrst, 'reload schema';\n\nCOMMIT;"),
    ("8-1 sem FOR SHARE na leitura do motor", 8, "FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid FOR SHARE;", "FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid;"),
    ("8-2 o UPDATE sempre grava motor_id (apaga quando a chave não vem)", 8, "motor_id = CASE WHEN e ? 'motor_id' THEN (e ->> 'motor_id')::uuid ELSE motor_id END", "motor_id = (e ->> 'motor_id')::uuid"),
    ("8-3 motor de outra família passa", 8, "IF v_mfam <> p_familia THEN", "IF false THEN"),
    ("8-4 motor arquivado passa", 8, "IF v_marq IS NOT NULL THEN", "IF false THEN"),
    ("8-5 motor_id fora da lista de campos", 8, "ARRAY['id', 'rotulo', 'acao', 'instrucao', 'abas', 'motor_id']", "ARRAY['id', 'rotulo', 'acao', 'instrucao', 'abas']"),
    ("8-6 o INSERT não grava o motor", 8, "v_abas, p_por, (e ->> 'motor_id')::uuid);", "v_abas, p_por, NULL);"),
    ("8-7 arquivar sem olhar as etapas", 8, "IF v_n > 0 THEN", "IF false THEN"),
    ("8-8 arquivar não conta as outras etapas", 8, "CASE WHEN v_n > 1 THEN format(' (e de mais %s)', v_n - 1) ELSE '' END", "''"),
    ("8-9 motor inexistente passa pela checagem", 8, "      IF NOT FOUND THEN\n        RAISE EXCEPTION 'etapa %: o motor nao existe', i USING ERRCODE = 'invalid_parameter_value';\n      END IF;", "      IF false THEN NULL; END IF;"),
    ("8-10 arquivar nasce aberta (sem REVOKE)", 8, "REVOKE ALL ON FUNCTION public.superadmin_arquivar_motor(uuid, uuid) FROM PUBLIC, anon, authenticated;", "SELECT 1;"),
    ("8-11 gravar_etapas deixa de ser SECURITY DEFINER", 8, "CREATE OR REPLACE FUNCTION public.superadmin_gravar_etapas_da_familia(\n  p_familia text, p_por uuid, p_etapas jsonb\n) RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER", "CREATE OR REPLACE FUNCTION public.superadmin_gravar_etapas_da_familia(\n  p_familia text, p_por uuid, p_etapas jsonb\n) RETURNS jsonb\nLANGUAGE plpgsql"),
]

def sem_verifica(t):
    i = t.index("DO $verifica$"); j = t.index("$verifica$;", i) + len("$verifica$;")
    return t[:i] + t[j:]

def rodar(t7, t8):
    arqs = []
    for t in (t7, t8):
        f = tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False); f.write(t); f.close(); arqs.append(f.name)
    return subprocess.run(["bash", str(AQUI / "run.sh"), *arqs], capture_output=True, text=True).returncode

def aplicar(n, de, para, tira_verifica):
    t7, t8 = O7, O8
    if n == 7: t7 = t7.replace(de, para)
    else: t8 = t8.replace(de, para)
    if tira_verifica: t7, t8 = sem_verifica(t7), sem_verifica(t8)
    return t7, t8

c = rodar(O7, O8)
print(f"CONTROLE (sem mutação): {'passa' if c == 0 else 'FALHOU exit ' + str(c)}")
vivas = []
for nome, n, de, para in MUTACOES:
    orig = O7 if n == 7 else O8
    if orig.count(de) != 1:
        print(f"{nome}: TRECHO NAO ACHADO ({orig.count(de)}x) — a mutação não se aplica"); vivas.append(nome); continue
    r = rodar(*aplicar(n, de, para, False))
    print(f"{nome} {'MORTA' if r != 0 else ('EQUIVALENTE' if nome in EQUIVALENTES else 'SOBREVIVEU')} (exit {r})", flush=True)
    if r == 0 and nome not in EQUIVALENTES: vivas.append(nome)
print("SOBREVIVERAM:", vivas)
print("--- sem a verificação (só os casos):")
c2 = rodar(sem_verifica(O7), sem_verifica(O8))
print(f"CONTROLE sem verificação: {'passa' if c2 == 0 else 'FALHOU exit ' + str(c2)}")
vivas2 = []
for nome, n, de, para in MUTACOES:
    r = rodar(*aplicar(n, de, para, True))
    print(f"{nome} {'MORTA pelos casos' if r == 1 else ('abortou na base' if r == 2 else ('EQUIVALENTE' if nome in EQUIVALENTES else 'SOBREVIVEU'))} (exit {r})", flush=True)
    if r == 0 and nome not in EQUIVALENTES: vivas2.append(nome)
print("SOBREVIVERAM sem verificação:", vivas2)
sys.exit(1 if (c != 0 or c2 != 0 or vivas or vivas2) else 0)
