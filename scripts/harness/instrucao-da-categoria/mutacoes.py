#!/usr/bin/env python3
"""Mutações da 20261103000002 (a instrução da categoria): cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2). O
CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS, as corridas e as guardas, sozinhos,
derrubem cada mutação. Cada mutação é (nome, [(de, para)], reaplica): com reaplica, a mutação não mexe em corpo de função e roda com a migração
aplicada DUAS vezes; sem, uma vez (o corpo mutado tem outro md5, e a guarda da reaplicação o recusaria — morte falsa). REUSA_BASE=1 fica ligado.

Mutações EQUIVALENTES, fora da lista e anotadas aqui:
  - tirar o `.not('instrucao', 'is', null)` é do TS, não daqui (anotada no teste da conversa);
  - trocar `ORDER BY c.categoria_chave` do laço das configs: a ordem só muda a ordem dos NOTICEs, e nenhum caso lê a ordem do NOTICE."""
import os, pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
ORIG = (AQUI.parents[2] / "supabase/migrations/20261103000002_instrucao_da_categoria.sql").read_text()

MUTACOES = [
    # a guarda
    ("G1 a guarda aceita a arvore com outro corpo", [("    IF v_md5 IS DISTINCT FROM v_md5_arvore AND v_md5 IS DISTINCT FROM v_desta THEN", "    IF false THEN")], True),
    ("G2 a guarda não confere o que apaga fora do medido", [("  IF v_fora IS NOT NULL THEN\n    RAISE EXCEPTION 'guarda: ha o que apagar", "  IF false THEN\n    RAISE EXCEPTION 'guarda: ha o que apagar")], True),
    ("G3 a guarda aceita a coluna com outro tipo", [("               AND column_name = 'instrucao' AND data_type <> 'text') THEN", "               AND false) THEN")], True),
    ("G4 a guarda aceita a funcao nova com outro corpo", [("    IF v_md5 IS DISTINCT FROM v_desta_nova THEN", "    IF false THEN")], True),
    # a coluna
    ("C1 a CHECK sem o btrim", [(" AND instrucao = btrim(instrucao, E' \\t\\r\\n')))", "))")], True),
    ("C2 a CHECK aceita 1501", [("char_length(instrucao) BETWEEN 1 AND 1500", "char_length(instrucao) BETWEEN 1 AND 1501")], True),
    # a função nova
    ("F1 a funcao nao apara", [("    v_texto := nullif(btrim(p_instrucao #>> '{}', E' \\t\\r\\n'), '');", "    v_texto := nullif(p_instrucao #>> '{}', '');")], False),
    ("F2 a funcao aceita 1501", [("  IF v_n > 1500 THEN", "  IF v_n > 1501 THEN")], False),
    ("F3 a funcao nao confere o tenant", [("   WHERE c.id = p_mp_categoria AND c.tenant_id = p_tenant\n   FOR UPDATE;", "   WHERE c.id = p_mp_categoria\n   FOR UPDATE;")], False),
    ("F4 a mesma instrucao grava e loga", [("  IF v_atual IS NOT DISTINCT FROM v_texto THEN", "  IF false THEN")], False),
    ("F5 o log sem o campo", [("jsonb_build_object('orcamentista_mp_categoria', v_depois, 'campo', 'instrucao'), p_por);", "jsonb_build_object('orcamentista_mp_categoria', v_depois), p_por);")], False),
    ("F6 a funcao nao exige super admin", [("  v_atual  text;\n  v_depois jsonb;\nBEGIN\n  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN",
                                            "  v_atual  text;\n  v_depois jsonb;\nBEGIN\n  IF false THEN")], False),
    ("F7 a funcao conta bytes", [("  v_n := char_length(v_texto);", "  v_n := octet_length(v_texto);")], False),
    ("F8 a funcao aceita o que nao e texto", [("  ELSIF jsonb_typeof(p_instrucao) <> 'string' THEN\n    RAISE EXCEPTION 'a instrucao e um texto' USING ERRCODE = 'invalid_parameter_value';\n  ELSE", "  ELSE")], False),
    ("F9 a funcao nao grava o autor", [("     SET instrucao = v_texto, atualizado_por = p_por, atualizado_em = now()", "     SET instrucao = v_texto, atualizado_em = now()")], False),
    # a árvore
    ("A1 a arvore ignora a instrucao", [("          IF v_cat ? 'instrucao' THEN\n            v_caminho := v_base || ', instrucao';\n            PERFORM public.superadmin_gravar_instrucao_da_categoria(p_tenant, p_por, v_cat_id, v_cat -> 'instrucao');\n          END IF;\n", "")], False),
    ("A2 a arvore nao conhece a chave instrucao", [("'instalacao', 'instrucao');", "'instalacao');")], False),
    # a remoção
    ("D1 o PERFIL perde as cores tambem", [("WHEN 'PERFIL' THEN ARRAY['linha', 'barra_mm', 'solda', 'criterio_custo_barra']", "WHEN 'PERFIL' THEN ARRAY['linha', 'barra_mm', 'solda', 'criterio_custo_barra', 'cores']")], True),
    ("D9 o PERFIL perde cor_predominante tambem (a versao de antes da correcao)", [("WHEN 'PERFIL' THEN ARRAY['linha', 'barra_mm', 'solda', 'criterio_custo_barra']", "WHEN 'PERFIL' THEN ARRAY['linha', 'cor_predominante', 'barra_mm', 'solda', 'criterio_custo_barra']")], True),
    ("D10 o catalogo perde a definicao de cor_predominante (a versao de antes da correcao)", [("            WHERE NOT ((d.categoria_chave, d.chave) IN (('PERFIL', 'cores'), ('PERFIL', 'cor_predominante'), ('PERFIL', 'serra_mm')))\n", "            WHERE NOT ((d.categoria_chave, d.chave) IN (('PERFIL', 'cores'), ('PERFIL', 'serra_mm')))\n")], True),
    ("D2 as ferragens nao sao apagadas", [("  FOR r IN DELETE FROM public.orcamentista_mp_ferragem f RETURNING f.* LOOP", "  FOR r IN SELECT f.* FROM public.orcamentista_mp_ferragem f LOOP")], True),
    ("D3 o log das definicoes sem a marca", [("jsonb_build_object('orcamentista_categoria_campo', to_jsonb(r), 'remocao', c_marca), NULL, NULL);", "jsonb_build_object('orcamentista_categoria_campo', to_jsonb(r)), NULL, NULL);")], True),
    ("D4 o catalogo perde cores, cor_predominante e serra tambem", [("            WHERE NOT ((d.categoria_chave, d.chave) IN (('PERFIL', 'cores'), ('PERFIL', 'cor_predominante'), ('PERFIL', 'serra_mm')))\n", "")], True),
    ("D5 a autoria da config nao e anulada", [("SET config = nullif(c.config - v_sai, '{}'::jsonb), atualizado_por = NULL, atualizado_em = now()", "SET config = nullif(c.config - v_sai, '{}'::jsonb), atualizado_em = now()")], True),
    ("D6 a config vazia fica {} em vez de NULL", [("SET config = nullif(c.config - v_sai, '{}'::jsonb), atualizado_por = NULL", "SET config = c.config - v_sai, atualizado_por = NULL")], True),
    ("D7 so a primeira config", [("            ORDER BY c.categoria_chave FOR UPDATE LOOP", "            ORDER BY c.categoria_chave LIMIT 1 FOR UPDATE LOOP")], True),
    ("D8 o log dos vidros sem o tenant", [("    VALUES (r.tenant_id, 'orcamentista_mp_vidro', r.id::text,", "    VALUES (NULL, 'orcamentista_mp_vidro', r.id::text,")], True),
    # os privilégios
    ("P1 o REVOKE da funcao nova so de PUBLIC", [("REVOKE ALL ON FUNCTION public.superadmin_gravar_instrucao_da_categoria(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;", "REVOKE ALL ON FUNCTION public.superadmin_gravar_instrucao_da_categoria(uuid, uuid, uuid, jsonb) FROM PUBLIC;")], True),
    ("P2 a funcao nova sem SECURITY DEFINER", [("RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public, pg_temp\nAS $fn$\n-- 03/11/2026 (20261103000002): a instrucao da categoria da conta",
                                                "RETURNS jsonb\nLANGUAGE plpgsql\nSET search_path = public, pg_temp\nAS $fn$\n-- 03/11/2026 (20261103000002): a instrucao da categoria da conta")], False),
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
erro = [(n, de[:60], ORIG.count(de)) for n, trocas, _ in MUTACOES for de, _ in trocas if ORIG.count(de) != 1]
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
