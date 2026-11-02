#!/usr/bin/env python3
"""Mutações da 20261102000002 (as categorias ganham tela): cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS, as corridas e as guardas,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para). REUSA_BASE=1 fica ligado: a base é
a mesma para todas; VEZES=1 nas mutadas (o corpo mutado tem outro md5, e a guarda da reaplicação o recusaria — morte falsa)."""
import os
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261102000002_categorias_do_catalogo.sql").read_text()

MUTACOES = [
    # a guarda
    ("G1 a guarda não confere os corpos", [("  IF v_achado IS DISTINCT FROM v_esperado AND v_achado IS DISTINCT FROM v_esperado || v_desta THEN", "  IF false THEN")]),
    ("G2 a guarda não confere a forma do catálogo", [("  IF v_tx IS NOT NULL THEN\n    RAISE EXCEPTION 'guarda: categoria fora da forma", "  IF false THEN\n    RAISE EXCEPTION 'guarda: categoria fora da forma")]),
    ("G3 o fecho não confere as FKs", [("  IF v_tx IS NOT NULL THEN\n    RAISE EXCEPTION 'guarda: o fecho da remocao nao conhece", "  IF false THEN\n    RAISE EXCEPTION 'guarda: o fecho da remocao nao conhece")]),
    # as CHECKs e as estruturais
    ("X1 a chave aceita minúscula", [("CHECK (chave ~ '^[A-Z][A-Z0-9_]{0,39}$')", "CHECK (chave ~* '^[A-Z][A-Z0-9_]{0,39}$')")]),
    ("X2 o rótulo aceita 61", [("length(rotulo) BETWEEN 1 AND 60", "length(rotulo) BETWEEN 1 AND 61")]),
    ("S1 INSTALACAO não é estrutural", [("SELECT ARRAY['PERFIL', 'VIDRO', 'FERRAGENS', 'INSTALACAO']", "SELECT ARRAY['PERFIL', 'VIDRO', 'FERRAGENS']")]),
    # criar e editar
    ("C1 criar sem a trava", [("  -- uma criacao por vez: a ordem e a ultima + 1 e o nome nao repete - as duas conferencias valem so sob a trava\n  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_categoria_catalogo', 0));\n", "\n")]),
    ("C2 criar não confere o nome repetido", [("  SELECT c.rotulo INTO v_igual FROM public.orcamentista_categoria_catalogo c WHERE lower(btrim(c.rotulo)) = lower(v_rotulo) LIMIT 1;\n  IF FOUND THEN", "  SELECT c.rotulo INTO v_igual FROM public.orcamentista_categoria_catalogo c WHERE c.rotulo = v_rotulo LIMIT 1;\n  IF FOUND THEN")]),
    ("C3 criar não loga", [("  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n  VALUES (NULL, 'orcamentista_categoria_catalogo', p_chave, NULL, v_depois, p_por);", "")]),
    ("C4 criar não apara o rótulo", [("  v_rotulo     text := btrim(coalesce(p_rotulo, ''));\n  v_igual      text;\n  v_ordem      integer;", "  v_rotulo     text := coalesce(p_rotulo, '');\n  v_igual      text;\n  v_ordem      integer;")]),
    ("E1 editar aceita nada mudou", [("  IF v_rotulo_era = v_rotulo THEN", "  IF false THEN")]),
    ("E2 editar não confere o nome de outra", [("WHERE c.chave <> p_chave AND lower(btrim(c.rotulo)) = lower(v_rotulo) LIMIT 1;", "WHERE c.chave <> p_chave AND c.rotulo = v_rotulo LIMIT 1;")]),
    ("E3 editar sem FOR UPDATE", [("  SELECT c.rotulo INTO v_rotulo_era FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave FOR UPDATE;", "  SELECT c.rotulo INTO v_rotulo_era FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave;")]),
    ("E4 editar não loga o antes", [("  VALUES (NULL, 'orcamentista_categoria_catalogo', p_chave, v_antes, v_depois, p_por);", "  VALUES (NULL, 'orcamentista_categoria_catalogo', p_chave, NULL, v_depois, p_por);")]),
    # os passos
    ("P1 a categoria não solta a tabela do item", [("  IF p_tipo IN ('fornecedor', 'familia', 'tabela', 'categoria') THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item'", "  IF p_tipo IN ('fornecedor', 'familia', 'tabela') THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_levantamento_item'")]),
    ("P2 a categoria não leva o conteúdo das tabelas", [("  IF p_tipo IN ('fornecedor', 'familia', 'tabela', 'categoria') THEN\n    FOREACH t IN ARRAY v_conteudo LOOP", "  IF p_tipo IN ('fornecedor', 'familia', 'tabela') THEN\n    FOREACH t IN ARRAY v_conteudo LOOP")]),
    ("P3 a categoria não leva a tabela", [("  IF p_tipo IN ('fornecedor', 'familia', 'tabela', 'categoria') THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_tabela', 'acao', 'sai'", "  IF p_tipo IN ('fornecedor', 'familia', 'tabela') THEN\n    v_p := v_p || jsonb_build_object('t', 'orcamentista_tabela', 'acao', 'sai'")]),
    ("P4 a categoria não leva os campos", [("      || jsonb_build_object('t', 'orcamentista_categoria_campo', 'acao', 'sai', 'filtro', 'x.categoria_chave = $1', 'nome', 'x.chave', 'rotulo', 'campo da categoria')\n", "")]),
    ("P5 a categoria não leva a ramificação", [("      || jsonb_build_object('t', 'orcamentista_familia_ramificacao', 'acao', 'sai', 'filtro', 'x.categoria_chave = $1', 'nome', 'x.familia', 'rotulo', 'ramificacao da familia')\n", "")]),
    ("P6 os vidros saem por todas as categorias", [("      || jsonb_build_object('t', 'orcamentista_mp_vidro', 'acao', 'sai', 'filtro', 'x.mp_categoria_id IN (SELECT c.id FROM public.orcamentista_mp_categoria c WHERE c.categoria_chave = $1)'", "      || jsonb_build_object('t', 'orcamentista_mp_vidro', 'acao', 'sai', 'filtro', 'true'")]),
    ("P7 o tipo categoria no passo da família", [("  IF p_tipo = 'categoria' THEN\n    v_p := v_p\n      || jsonb_build_object('t', 'orcamentista_mp_categoria_fornecedor'", "  IF p_tipo IN ('categoria', 'familia') THEN\n    v_p := v_p\n      || jsonb_build_object('t', 'orcamentista_mp_categoria_fornecedor'")]),
    # os conjuntos
    ("K1 a categoria não leva os motores dela", [("    SELECT coalesce(array_agg(m.id ORDER BY m.id), '{}') INTO motores FROM public.orcamentista_motor m WHERE m.categoria_chave = p_chave;\n    SELECT coalesce(array_agg(t.id ORDER BY t.id), '{}') INTO tabelas FROM public.orcamentista_tabela t WHERE t.categoria_chave = p_chave;", "    SELECT coalesce(array_agg(t.id ORDER BY t.id), '{}') INTO tabelas FROM public.orcamentista_tabela t WHERE t.categoria_chave = p_chave;")]),
    ("K2 a categoria inexistente ganha nome", [("    SELECT c.rotulo INTO nome FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave;\n    SELECT coalesce(array_agg(m.id ORDER BY m.id), '{}') INTO motores", "    SELECT coalesce(c.rotulo, p_chave) INTO nome FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_chave;\n    nome := coalesce(nome, p_chave);\n    SELECT coalesce(array_agg(m.id ORDER BY m.id), '{}') INTO motores")]),
    # a medição
    ("M1 as empresas sem a contagem por empresa", [("             GROUP BY mc.tenant_id, tn.name) e;", "             GROUP BY mc.tenant_id, tn.name LIMIT 0) e;")]),
    ("M2 a estrutural não impede", [("    IF p_chave = ANY (public.orcamentista_categorias_estruturais()) THEN\n      v_imped := v_imped || jsonb_build_array(jsonb_build_object('tipo', 'categoria_estrutural', 'categoria', p_chave));", "    IF false THEN\n      v_imped := v_imped || jsonb_build_array(jsonb_build_object('tipo', 'categoria_estrutural', 'categoria', p_chave));")]),
    ("M3 os vidros contados de todas as categorias da conta", [("(SELECT count(*) FROM public.orcamentista_mp_vidro v WHERE v.mp_categoria_id IN (SELECT c2.id FROM public.orcamentista_mp_categoria c2 WHERE c2.tenant_id = mc.tenant_id AND c2.categoria_chave = p_chave)) AS v,", "(SELECT count(*) FROM public.orcamentista_mp_vidro v WHERE v.mp_categoria_id IN (SELECT c2.id FROM public.orcamentista_mp_categoria c2 WHERE c2.tenant_id = mc.tenant_id)) AS v,")]),
    # a remoção
    ("R1 a estrutural é removida mesmo impedida", [("  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_medida -> 'impedimentos') x WHERE x ->> 'tipo' = 'categoria_estrutural') THEN", "  IF false THEN")]),
    ("R2 a categoria não é travada (FOR UPDATE)", [("  ELSIF p_tipo = 'categoria' THEN PERFORM 1 FROM public.orcamentista_categoria_catalogo x WHERE x.chave = p_chave FOR UPDATE;\n", "\n")]),
    ("R3 a assinatura não é conferida", [("  IF p_assinatura IS DISTINCT FROM v_medida ->> 'assinatura' THEN", "  IF false THEN")]),
    # (tirar o GRANT da remoção ao service_role é mutação EQUIVALENTE: o CREATE OR REPLACE preserva a ACL que a 20261101000001 deu)
    ("R4 criar nasce aberta ao authenticated", [("REVOKE ALL ON FUNCTION public.superadmin_criar_categoria(uuid, text, text) FROM PUBLIC, anon, authenticated;\n", "\n")]),
]

def sem_verifica(t):
    i = t.index("DO $verifica$"); j = t.index("$verifica$;", i) + len("$verifica$;")
    return t[:i] + t[j:]

def rodar(t):
    f = tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False); f.write(t); f.close()
    env = dict(os.environ, REUSA_BASE="1")
    if t != ORIG and t != sem_verifica(ORIG): env["VEZES"] = "1"
    return subprocess.run(["bash", str(AQUI / "run.sh"), f.name], capture_output=True, text=True, env=env).returncode

def aplicar(trocas, tira):
    t = ORIG
    for de, para in trocas: t = t.replace(de, para)
    return sem_verifica(t) if tira else t

# SO=G1,E3 roda só as mutações com esses prefixos (o controle roda sempre)
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
