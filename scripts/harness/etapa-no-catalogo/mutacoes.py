#!/usr/bin/env python3
"""Mutações da 20261031000002: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para)."""
import os
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261031000002_etapa_no_catalogo.sql").read_text()

MUTACOES = [
    # a guarda
    ("G1 a guarda não exige a 20261031000001", [("  IF v_gravar IS DISTINCT FROM 'bc74a15d49552f308e12fb3b3b7093c5' THEN", "  IF false THEN")]),
    ("G2 a guarda não confere o corpo do arquivar", [("  IF v_arquivar IS DISTINCT FROM 'a6219d0a230a63a54669def1d41be941' THEN", "  IF false THEN")]),
    ("G3 a guarda não olha o nome repetido com conteúdo diferente", [("    HAVING count(DISTINCT (e.rotulo, e.acao, e.abas)) > 1) z;", "    HAVING false) z;")]),
    ("G4 a guarda aceita o catálogo que já existe com item", [("    IF v_n > 0 THEN\n      RAISE EXCEPTION 'guarda: o catalogo de etapas ja existe", "    IF false THEN\n      RAISE EXCEPTION 'guarda: o catalogo de etapas ja existe")]),
    # a tabela
    ("T1 o nome único OLHANDO a caixa", [("ON public.orcamentista_etapa_catalogo (lower(nome));", "ON public.orcamentista_etapa_catalogo (nome);"),
                                          ("USING btree (lower(nome))') THEN", "USING btree (nome)') THEN")]),
    ("T2 o nome aceita espaço nas pontas", [("CHECK (nome = btrim(nome) AND char_length(nome) >= 1", "CHECK (char_length(nome) >= 1")]),
    ("T3 a ação aceita qualquer texto", [("  CONSTRAINT orcamentista_etapa_catalogo_acao_da_lista CHECK (acao = ANY (ARRAY['APANHAR', 'CONFIRMAR', 'GERAR_LEVANTAMENTO', 'CALCULAR_BARRAS', 'ENVIAR'])),\n", "")]),
    ("T4 as abas aceitam qualquer texto", [("  CONSTRAINT orcamentista_etapa_catalogo_abas_da_planilha CHECK (abas <@", "  CONSTRAINT orcamentista_etapa_catalogo_abas_da_planilha CHECK (abas IS NOT NULL OR abas <@")]),
    ("T5 a ordem pode repetir", [("  CONSTRAINT orcamentista_etapa_catalogo_ordem_key UNIQUE (ordem),\n", "")]),
    ("T6 a FK da etapa em CASCADE", [("      FOREIGN KEY (etapa_catalogo_id) REFERENCES public.orcamentista_etapa_catalogo (id) ON DELETE RESTRICT;", "      FOREIGN KEY (etapa_catalogo_id) REFERENCES public.orcamentista_etapa_catalogo (id) ON DELETE CASCADE;")]),
    ("T7 a etapa pode ficar sem item", [("ALTER TABLE public.orcamentista_familia_etapa ALTER COLUMN etapa_catalogo_id SET NOT NULL;\n", "")]),
    ("T8 sem RLS", [("ALTER TABLE public.orcamentista_etapa_catalogo ENABLE ROW LEVEL SECURITY;\n", "")]),
    ("T9 aberta ao authenticated", [("GRANT ALL ON public.orcamentista_etapa_catalogo TO service_role;", "GRANT ALL ON public.orcamentista_etapa_catalogo TO service_role, authenticated;")]),
    ("T10 a política de leitura aberta", [("FOR SELECT USING (is_super_admin());", "FOR SELECT USING (true);")]),
    ("T11 o rótulo fica na etapa", [("ALTER TABLE public.orcamentista_familia_etapa DROP COLUMN IF EXISTS rotulo;\n", "")]),
    # o semeio
    ("S1 a ordem do catálogo pelo nome, não pelo número", [("row_number() OVER (ORDER BY min(e.numero), e.rotulo, e.acao)", "row_number() OVER (ORDER BY e.rotulo, e.acao)")]),
    ("S2 o semeio corrige o nome (inventa)", [("  SELECT e.rotulo, e.acao, e.abas, row_number()", "  SELECT replace(e.rotulo, 'fabricaçãoprodução', 'fabricação'), e.acao, e.abas, row_number()")]),
    ("S3 o semeio sem o log dos itens", [("    FROM public.orcamentista_etapa_catalogo c;\n\n  -- cada etapa aponta", "    FROM public.orcamentista_etapa_catalogo c WHERE false;\n\n  -- cada etapa aponta")]),
    ("S4 o log da etapa sem o tenant", [("    VALUES (v_e.tenant_id, 'orcamentista_familia_etapa', v_e.id::text,", "    VALUES (NULL, 'orcamentista_familia_etapa', v_e.id::text,")]),
    ("S5 o log da etapa sem o antes", [("            jsonb_build_object('orcamentista_familia_etapa', to_jsonb(v_e), 'etapa_vira_item_de_catalogo', true),", "            jsonb_build_object('etapa_vira_item_de_catalogo', true),")]),
    ("S6 o semeio com autor (inventa quem criou)", [("  SELECT e.rotulo, e.acao, e.abas, row_number() OVER (ORDER BY min(e.numero), e.rotulo, e.acao)::integer, NULL", "  SELECT e.rotulo, e.acao, e.abas, row_number() OVER (ORDER BY min(e.numero), e.rotulo, e.acao)::integer, max(e.atualizado_por::text)::uuid")]),
    # criar
    ("C1 criar sem conferir o nome (a frase some; o índice dá 23505)", [("  SELECT c.nome INTO v_igual FROM public.orcamentista_etapa_catalogo c WHERE lower(c.nome) = lower(v_nome) LIMIT 1;\n  IF FOUND THEN", "  IF false THEN")]),
    ("C2 criar no lugar errado (ordem = a última)", [("  SELECT coalesce(max(c.ordem), 0) + 1 INTO v_ordem FROM public.orcamentista_etapa_catalogo c;", "  SELECT coalesce(max(c.ordem), 0) + 1 + 1 INTO v_ordem FROM public.orcamentista_etapa_catalogo c;")]),
    ("C3 criar sem o autor", [("    VALUES (v_nome, p_acao, coalesce(p_abas, '{}'::text[]), v_ordem, p_por)", "    VALUES (v_nome, p_acao, coalesce(p_abas, '{}'::text[]), v_ordem, NULL)")]),
    ("C4 criar sem log", [("  VALUES (NULL, 'orcamentista_etapa_catalogo', v_id::text, NULL, jsonb_build_object('orcamentista_etapa_catalogo', v_depois), p_por);", "  SELECT NULL, NULL, NULL, NULL, NULL, NULL WHERE false;")]),
    ("C5 criar sem aparar o nome", [("  v_nome       text := btrim(coalesce(p_nome, ''));\n  v_igual      text;\n  v_ordem      integer;", "  v_nome       text := coalesce(p_nome, '');\n  v_igual      text;\n  v_ordem      integer;")]),
    ("C6 criar aceita aba repetida", [("  IF p_abas IS NOT NULL AND (SELECT count(*) <> count(DISTINCT a) OR bool_or(a IS NULL) FROM unnest(p_abas) a) THEN", "  IF false THEN")]),
    ("C7 criar por qualquer um", [("  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n  IF p_abas IS NOT NULL", "  IF p_abas IS NOT NULL")]),
    # editar
    ("E1 editar sem o 'nada mudou'", [("  IF v_antes.nome = v_nome AND v_antes.acao IS NOT DISTINCT FROM p_acao AND v_antes.abas = v_abas THEN", "  IF false THEN")]),
    ("E2 editar recusa a própria caixa (o nome contra ele mesmo)", [("WHERE c.id <> p_id AND lower(c.nome) = lower(v_nome) LIMIT 1;", "WHERE lower(c.nome) = lower(v_nome) LIMIT 1;")]),
    ("E3 editar sem log", [("  VALUES (NULL, 'orcamentista_etapa_catalogo', p_id::text, jsonb_build_object('orcamentista_etapa_catalogo', to_jsonb(v_antes)),\n          jsonb_build_object('orcamentista_etapa_catalogo', v_depois), p_por);", "  SELECT NULL, NULL, NULL, NULL, NULL, NULL WHERE false;")]),
    ("E4 editar não troca as abas", [("SET nome = v_nome, acao = p_acao, abas = v_abas WHERE id = p_id;", "SET nome = v_nome, acao = p_acao WHERE id = p_id;")]),
    ("E5 editar o inexistente sem a recusa", [("  SELECT c.* INTO v_antes FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_id FOR UPDATE;\n  IF NOT FOUND THEN", "  SELECT c.* INTO v_antes FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_id FOR UPDATE;\n  IF false THEN")]),
    # remover
    ("R1 remover sem contar o uso (a FK dá 23503, sem nomes)", [("  IF v_usos > 0 THEN\n    SELECT string_agg", "  IF false THEN\n    SELECT string_agg")]),
    ("R2 remover nomeia na ordem do texto (etapa 10 antes da 2)", [("       ORDER BY 2 LIMIT 10) z;", "       ORDER BY 1 LIMIT 10) z;"), ("    SELECT string_agg(z.x, ', ' ORDER BY z.o) INTO v_nomes", "    SELECT string_agg(z.x, ', ' ORDER BY z.x) INTO v_nomes")]),
    ("R3 remover sem o 'e mais N'", [("      v_nomes := v_nomes || format(' e mais %s', v_usos - 10);", "      NULL;")]),
    ("R4 remover sem log", [("  VALUES (NULL, 'orcamentista_etapa_catalogo', p_id::text, jsonb_build_object('orcamentista_etapa_catalogo', v_antes), NULL, p_por);", "  SELECT NULL, NULL, NULL, NULL, NULL, NULL WHERE false;")]),
    ("R5 remover sem travar o item", [("  SELECT c.nome, to_jsonb(c) INTO v_nome, v_antes FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_id FOR UPDATE;", "  SELECT c.nome, to_jsonb(c) INTO v_nome, v_antes FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_id;"),
                                       ("  -- FOR UPDATE na linha do item: quem for aponta-lo (a gravacao das etapas, FOR SHARE; a FK, FOR KEY SHARE) espera esta transacao; e esta so conta\n  -- o uso depois de quem ja apontou\n  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_etapa_catalogo', 0));\n", "")]),
    # gravar as etapas
    ("W1 gravar aceita o rótulo no item", [("  v_permitidas text[] := ARRAY['id', 'etapa_catalogo_id', 'instrucao', 'motor_id'];", "  v_permitidas text[] := ARRAY['id', 'etapa_catalogo_id', 'instrucao', 'motor_id', 'rotulo', 'acao', 'abas'];")]),
    ("W2 gravar sem exigir o item", [("    IF jsonb_typeof(e -> 'etapa_catalogo_id') IS DISTINCT FROM 'string'\n       OR (e ->> 'etapa_catalogo_id')", "    IF false\n       AND (e ->> 'etapa_catalogo_id')")]),
    ("W3 gravar sem conferir que o item existe", [("    PERFORM 1 FROM public.orcamentista_etapa_catalogo c WHERE c.id = (e ->> 'etapa_catalogo_id')::uuid FOR SHARE;\n    IF NOT FOUND THEN", "    IF false THEN")]),
    ("W4 gravar sem travar o item (FOR SHARE)", [("    PERFORM 1 FROM public.orcamentista_etapa_catalogo c WHERE c.id = (e ->> 'etapa_catalogo_id')::uuid FOR SHARE;", "    PERFORM 1 FROM public.orcamentista_etapa_catalogo c WHERE c.id = (e ->> 'etapa_catalogo_id')::uuid;")]),
    ("W5 gravar não troca o item da etapa", [("           SET numero = i, etapa_catalogo_id = (e ->> 'etapa_catalogo_id')::uuid, instrucao", "           SET numero = i, instrucao")]),
    ("W6 a removida sem o nome", [("'numero', v_rem.numero, 'rotulo', v_rem.nome_do_catalogo));", "'numero', v_rem.numero, 'rotulo', NULL));")]),
    ("W7 o log da removida sem o nome do catálogo", [("to_jsonb(v_rem) - 'nome_do_catalogo', 'etapa_do_catalogo', v_rem.nome_do_catalogo, 'remocao_da_etapa', true),", "to_jsonb(v_rem) - 'nome_do_catalogo', 'remocao_da_etapa', true),")]),
    ("W8 a remoção sai (a etapa fica)", [("    DELETE FROM public.orcamentista_familia_etapa WHERE id = v_rem.id;\n", "")]),
    # arquivar
    ("A1 arquivar: o rótulo é o nome da família", [("'numero', v_etapa.numero, 'rotulo', v_etapa.nome_da_etapa));", "'numero', v_etapa.numero, 'rotulo', v_etapa.familia));")]),
    # privilégios
    ("P1 criar aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_criar_etapa_do_catalogo(uuid, text, text, text[]) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_criar_etapa_do_catalogo(uuid, text, text, text[]) TO service_role, authenticated;")]),
    ("P2 remover sem SECURITY DEFINER", [("  p_por uuid, p_id uuid\n) RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\n", "  p_por uuid, p_id uuid\n) RETURNS jsonb\nLANGUAGE plpgsql\n")]),
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
