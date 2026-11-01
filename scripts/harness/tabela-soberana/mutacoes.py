#!/usr/bin/env python3
"""Mutações da 20261101000001 (a tabela na soberania): cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para)."""
import os
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261101000001_tabela_na_soberania.sql").read_text()

MUTACOES = [
    # a guarda
    ("G1 a guarda não confere os corpos", [("  IF v_achado IS DISTINCT FROM v_esperado AND v_achado IS DISTINCT FROM v_esperado || v_desta THEN", "  IF false THEN")]),
    ("G2 a guarda não confere o corpo do arrasto", [("'superadmin_arrasto_do_catalogo', '353e8ee77a0e4f903c79b9846a54ce44',\n", "\n")]),
    ("G3 a guarda compara o corpo com o \\r (produção tem CRLF)", [("md5(replace(p.prosrc, chr(13), ''))", "md5(p.prosrc)")]),
    # os passos
    ("P1 a tabela tira também o motor do item", [("  ELSIF p_tipo <> 'tabela' THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item'", "  ELSE\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item'")]),
    ("P2 a tabela não solta a tabela do item", [("  IF p_tipo IN ('fornecedor', 'familia', 'tabela') THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item'", "  IF p_tipo IN ('fornecedor', 'familia') THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item'")]),
    ("P3 a tabela tira o motor das etapas", [("  ELSIF p_tipo <> 'tabela' THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_familia_etapa'", "  ELSE\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_familia_etapa'")]),
    ("P4 a tabela leva o conteúdo pelo motor", [("  IF p_tipo <> 'tabela' THEN\n    FOREACH t IN ARRAY v_conteudo LOOP", "  IF true THEN\n    FOREACH t IN ARRAY v_conteudo LOOP")]),
    ("P5 a tabela não leva o conteúdo dela", [("  IF p_tipo IN ('fornecedor', 'familia', 'tabela') THEN\n    FOREACH t IN ARRAY v_conteudo LOOP", "  IF p_tipo IN ('fornecedor', 'familia') THEN\n    FOREACH t IN ARRAY v_conteudo LOOP")]),
    ("P6 a tabela leva ligação e motor", [("  IF p_tipo <> 'tabela' THEN\n    -- as LIGACOES motor-familia", "  IF true THEN\n    -- as LIGACOES motor-familia")]),
    ("P7 a tabela não sai", [("  IF p_tipo IN ('fornecedor', 'familia', 'tabela') THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_tabela', 'acao', 'sai'", "  IF p_tipo IN ('fornecedor', 'familia') THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_tabela', 'acao', 'sai'")]),
    ("P8 o tipo tabela segue desconhecido", [("  IF p_tipo NOT IN ('motor', 'fornecedor', 'familia', 'tabela') THEN", "  IF p_tipo NOT IN ('motor', 'fornecedor', 'familia') THEN")]),
    # os conjuntos
    ("K1 a tabela não entra no conjunto", [("    IF nome IS NOT NULL THEN tabelas := ARRAY[p_chave::uuid]; END IF;\n  ELSE", "    NULL;\n  ELSE")]),
    ("K2 o nome da tabela sem o id", [("    SELECT f.nome || ' / ' || t.arquivo_nome || ' (' || left(t.id::text, 8) || ')' INTO nome", "    SELECT f.nome || ' / ' || t.arquivo_nome INTO nome")]),
    ("K3 a tabela que não existe ganha nome", [("      FROM public.orcamentista_tabela t JOIN public.orcamentista_fornecedor f ON f.id = t.fornecedor_id WHERE t.id = p_chave::uuid;", "      FROM public.orcamentista_tabela t JOIN public.orcamentista_fornecedor f ON f.id = t.fornecedor_id ORDER BY t.id LIMIT 1;")]),
    ("K4 a tabela leva os motores do fornecedor", [("    IF nome IS NOT NULL THEN tabelas := ARRAY[p_chave::uuid]; END IF;\n  ELSE", "    IF nome IS NOT NULL THEN tabelas := ARRAY[p_chave::uuid]; SELECT coalesce(array_agg(m.id), '{}') INTO motores FROM public.orcamentista_motor m JOIN public.orcamentista_tabela t ON t.fornecedor_id = m.fornecedor_id WHERE t.id = p_chave::uuid; END IF;\n  ELSE")]),
]

def sem_verifica(t):
    i = t.index("DO $verifica$"); j = t.index("$verifica$;", i) + len("$verifica$;")
    return t[:i] + t[j:]

def rodar(t):
    f = tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False); f.write(t); f.close()
    env = dict(os.environ, VEZES="1") if t != ORIG and t != sem_verifica(ORIG) else dict(os.environ)
    return subprocess.run(["bash", str(AQUI / "run.sh"), f.name], capture_output=True, text=True, env=env).returncode

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
