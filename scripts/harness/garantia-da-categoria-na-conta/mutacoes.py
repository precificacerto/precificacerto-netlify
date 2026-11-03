#!/usr/bin/env python3
"""Mutações da 20261103000001 (a categoria da família chega na conta): cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base
(exit 2). O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS, as corridas e as
guardas, sozinhos, derrubem cada mutação. Cada mutação é (nome, [(de, para)], reaplica): com reaplica, a mutação não mexe em corpo de função e
roda com a migração aplicada DUAS vezes (pega o que quebra na reaplicação); sem, uma vez (o corpo mutado tem outro md5, e a guarda da
reaplicação o recusaria — morte falsa). REUSA_BASE=1 fica ligado.

Mutações EQUIVALENTES, fora da lista e anotadas aqui:
  - tirar a chamada de superadmin_criar_familia: a FK orcamentista_materia_prima_familia_fkey impede matéria-prima de apontar família que ainda
    não existe, então a garantia ali é sempre vazia (caso 6). Ela fica pela coerência, não por efeito;
  - tirar o "IF p_familia IS NULL THEN RETURN 0" da auxiliar: com a família nula o SELECT não acha matéria-prima nenhuma e devolve 0 igual."""
import os, pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
ORIG = (AQUI.parents[2] / "supabase/migrations/20261103000001_garantia_da_categoria_na_conta.sql").read_text()

MUTACOES = [
    # a guarda
    ("G1 a guarda não confere os corpos", [("  IF NOT v_ok THEN\n    SELECT count(*) INTO v_tabelas", "  IF false THEN\n    SELECT count(*) INTO v_tabelas")], False),
    ("G2 a guarda não confere a falta a mais", [("  IF v_falta IS NOT NULL THEN", "  IF false THEN")], True),
    ("G3 a guarda aceita a auxiliar com outro corpo", [("    IF v_md5 IS DISTINCT FROM '", "    IF false AND v_md5 IS DISTINCT FROM '")], True),
    # a auxiliar
    ("A1 a linha nasce com config {}", [("    SELECT m.tenant_id, m.id, r.categoria_chave, NULL, p_por", "    SELECT m.tenant_id, m.id, r.categoria_chave, '{}'::jsonb, p_por")], False),
    ("A2 a auxiliar ignora a matéria-prima dada", [("     WHERE m.familia = p_familia AND (p_materia_prima IS NULL OR m.id = p_materia_prima)", "     WHERE m.familia = p_familia")], False),
    ("A3 a auxiliar sem ON CONFLICT", [("    ON CONFLICT (materia_prima_id, categoria_chave) DO NOTHING\n    RETURNING *)", "    RETURNING *)")], False),
    ("A4 o log sem o tenant", [("  SELECT c.tenant_id, 'orcamentista_mp_categoria', c.id::text, NULL,\n         jsonb_build_object('orcamentista_mp_categoria', to_jsonb(c), 'garantia_da_familia', jsonb_build_object('familia', p_familia",
                                "  SELECT NULL::uuid, 'orcamentista_mp_categoria', c.id::text, NULL,\n         jsonb_build_object('orcamentista_mp_categoria', to_jsonb(c), 'garantia_da_familia', jsonb_build_object('familia', p_familia")], False),
    ("A5 o log sem a origem", [("jsonb_build_object('familia', p_familia, 'origem', p_origem)", "jsonb_build_object('familia', p_familia, 'origem', 'x')")], False),
    ("A6 a auxiliar só a primeira categoria", [("      JOIN public.orcamentista_familia_ramificacao r ON r.familia = m.familia\n     WHERE m.familia = p_familia",
                                                 "      JOIN public.orcamentista_familia_ramificacao r ON r.familia = m.familia AND r.ordem = 1\n     WHERE m.familia = p_familia")], False),
    ("A7 a auxiliar SECURITY DEFINER", [("RETURNS integer\nLANGUAGE plpgsql\nSET search_path", "RETURNS integer\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path")], True),
    ("A8 a auxiliar aberta ao service_role", [("FROM PUBLIC, anon, authenticated, service_role;", "FROM PUBLIC, anon, authenticated;")], True),
    ("A9 a auxiliar devolve sempre 0", [("  GET DIAGNOSTICS v_n = ROW_COUNT;\n  RETURN v_n;", "  RETURN 0;")], False),
    # as quatro
    ("E1 editar_familia sem a garantia", [("  DELETE FROM public.orcamentista_familia_ramificacao WHERE familia = p_chave;\n  INSERT INTO public.orcamentista_familia_ramificacao (familia, categoria_chave, ordem)\n  SELECT p_chave, x, n::integer FROM unnest(p_ramificacoes) WITH ORDINALITY AS r(x, n);\n  -- 02/11/2026: marcar uma categoria na ramificacao garante a linha dela em toda materia-prima desta familia, com config NULL; desmarcar\n  -- nao apaga nada da conta (a linha com dado continua aparecendo, marcada \"fora da familia\")\n  PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, p_chave, NULL, 'ramificacao');\n",
                                           "  DELETE FROM public.orcamentista_familia_ramificacao WHERE familia = p_chave;\n  INSERT INTO public.orcamentista_familia_ramificacao (familia, categoria_chave, ordem)\n  SELECT p_chave, x, n::integer FROM unnest(p_ramificacoes) WITH ORDINALITY AS r(x, n);\n")], False),
    ("D1 definir_familia sem a garantia", [("    PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, p_familia, p_materia_prima, 'troca_de_familia');\n", "")], False),
    ("D2 definir_familia garante a família de antes", [("    PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, p_familia, p_materia_prima, 'troca_de_familia');\n",
                                                         "    PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, v_antes ->> 'familia', p_materia_prima, 'troca_de_familia');\n")], False),
    ("M1 gravar_materia_prima sem a garantia", [("      PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, v_familia, v_id,\n", "      PERFORM 0, (\n")], False),
    ("M2 gravar_materia_prima só para a nova", [("    IF v_linha IS NULL OR (v_linha ->> 'familia') IS DISTINCT FROM v_familia THEN", "    IF v_linha IS NULL THEN")], False),
    ("M3 gravar_materia_prima garante antes do upsert", [("    SELECT x.familia INTO v_familia FROM public.orcamentista_materia_prima x WHERE x.id = v_id;\n",
                                                           "    v_familia := v_linha ->> 'familia';\n")], False),
    # o preenchimento
    ("P1 sem o preenchimento", [("     AND EXISTS (SELECT 1 FROM public.orcamentista_familia_ramificacao r WHERE r.familia = m.familia AND r.categoria_chave = 'VEDACAO')\n",
                                 "     AND false\n")], True),
    ("P2 o preenchimento sem ON CONFLICT", [("  ON CONFLICT (materia_prima_id, categoria_chave) DO NOTHING\n  RETURNING *)\nINSERT", "  RETURNING *)\nINSERT")], True),
    ("P3 o preenchimento com config {}", [("  SELECT m.tenant_id, m.id, 'VEDACAO', NULL, NULL", "  SELECT m.tenant_id, m.id, 'VEDACAO', '{}'::jsonb, NULL")], True),
    ("P4 o preenchimento sem log", [("'origem', 'preenchimento 20261103000001')), NULL\n  FROM criada c;", "'origem', 'preenchimento 20261103000001')), NULL\n  FROM criada c WHERE false;")], True),
]

def sem_verifica(t):
    i = t.index("DO $verifica$"); j = t.index("$verifica$;", i) + len("$verifica$;")
    return t[:i] + t[j:]

def rodar(t, reaplica):
    f = tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False); f.write(t); f.close()
    env = dict(os.environ, REUSA_BASE="1")
    if t != ORIG and t != sem_verifica(ORIG) and not reaplica: env["VEZES"] = "1"
    return subprocess.run(["bash", str(AQUI / "run.sh"), f.name], capture_output=True, text=True, env=env).returncode

def aplicar(trocas, tira):
    t = ORIG
    for de, para in trocas: t = t.replace(de, para)
    return sem_verifica(t) if tira else t

if os.environ.get("SO"):
    MUTACOES = [m for m in MUTACOES if m[0].split(" ")[0] in os.environ["SO"].split(",")]
erro = [(n, de[:60]) for n, trocas, _ in MUTACOES for de, _ in trocas if ORIG.count(de) != 1]
if erro:
    print("TRECHO NAO ACHADO ou repetido:", erro); sys.exit(1)
vivas = {}
for tira in (False, True):
    c = rodar(aplicar([], tira), True)
    print(f"CONTROLE {'sem' if tira else 'com'} verificação: {'passa' if c == 0 else 'FALHOU exit ' + str(c)}", flush=True)
    if c != 0: sys.exit(1)
    for nome, trocas, reaplica in MUTACOES:
        r = rodar(aplicar(trocas, tira), reaplica)
        print(f"{nome} {'MORTA' if r != 0 else 'SOBREVIVEU'} (exit {r}){' sem verificação' if tira else ''}", flush=True)
        if r == 0: vivas.setdefault(nome, []).append('sem verifica' if tira else 'com verifica')
print("SOBREVIVERAM:", vivas)
sys.exit(1 if vivas else 0)
