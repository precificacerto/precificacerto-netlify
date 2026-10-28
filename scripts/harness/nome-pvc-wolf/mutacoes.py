#!/usr/bin/env python3
"""Mutações da 20261028000002: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para)."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261028000002_familia_pvc_wolf_e_familia_so_no_perfil.sql").read_text()

MUTACOES = [
    ("P1 a guarda do nome some", [("  IF v_rotulo NOT IN ('PVC', 'PVC Wolf') THEN", "  IF false THEN")]),
    ("P2 a guarda do nome repetido some", [("WHERE chave <> 'PVC' AND lower(btrim(rotulo)) = 'pvc wolf';\n  IF v_n > 0 THEN", "WHERE chave <> 'PVC' AND lower(btrim(rotulo)) = 'pvc wolf';\n  IF false THEN")]),
    ("P3 o nome repetido olha a caixa", [("WHERE chave <> 'PVC' AND lower(btrim(rotulo)) = 'pvc wolf';\n  IF v_n > 0 THEN", "WHERE chave <> 'PVC' AND rotulo = 'PVC Wolf';\n  IF v_n > 0 THEN")]),
    ("P4 a guarda do PERFIL sem família some", [("  IF v_n > 0 THEN\n    RAISE EXCEPTION 'guarda: ha % tabela(s) de PERFIL", "  IF false THEN\n    RAISE EXCEPTION 'guarda: ha % tabela(s) de PERFIL")]),
    ("P5 o nome errado", [("UPDATE public.orcamentista_familia_catalogo SET rotulo = 'PVC Wolf' WHERE chave = 'PVC';", "UPDATE public.orcamentista_familia_catalogo SET rotulo = 'PVC WOLF' WHERE chave = 'PVC';")]),
    ("P6 o nome repete o log na reaplicação", [("WHERE f.chave = 'PVC' AND f.rotulo = 'PVC' FOR UPDATE;", "WHERE f.chave = 'PVC' FOR UPDATE;")]),
    ("P7 o nome não loga", [("VALUES (NULL, 'orcamentista_familia_catalogo', 'PVC',", "VALUES (NULL, 'outra_tabela', 'PVC',")]),
    ("P8 o antes do log é o depois", [("jsonb_build_object('orcamentista_familia_catalogo', v_antes, 'migracao'", "jsonb_build_object('orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = 'PVC'), 'migracao'")]),
    ("P9 a CHECK pega toda categoria", [("CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR familia IS NOT NULL);", "CHECK (familia IS NOT NULL OR categoria_chave IS NULL);")]),
    ("P10 a CHECK não entra", [("  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_tabela_familia_no_perfil') THEN\n    ALTER TABLE", "  IF false THEN\n    ALTER TABLE")]),
    ("P11 a CHECK entra NOT VALID", [("CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR familia IS NOT NULL);", "CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR familia IS NOT NULL) NOT VALID;")]),
    ("P12 sem o comentário da CHECK", [("COMMENT ON CONSTRAINT orcamentista_tabela_familia_no_perfil ON public.orcamentista_tabela IS\n  'Dono do produto, 28/10/2026: a familia e obrigatoria so na tabela de PERFIL", "COMMENT ON CONSTRAINT orcamentista_tabela_familia_no_perfil ON public.orcamentista_tabela IS\n  'Dono do produto, 28/10/2026: a familia")]),
    ("P13 a chave muda junto", [("UPDATE public.orcamentista_familia_catalogo SET rotulo = 'PVC Wolf' WHERE chave = 'PVC';", "INSERT INTO public.orcamentista_familia_catalogo (chave, rotulo, ordem) VALUES ('PVC_WOLF', 'PVC Wolf', 99);")]),
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
