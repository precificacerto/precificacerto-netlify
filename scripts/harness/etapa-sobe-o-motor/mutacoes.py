#!/usr/bin/env python3
"""Mutações da 20261027000010: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para)."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261027000010_etapa_sobe_o_motor_e_titulo_da_familia.sql").read_text()

ADV = "  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_etapas_da_familia:' || v_familia, 0));\n"
FOR_UPD = "    FROM public.orcamentista_familia_etapa e WHERE e.id = p_etapa FOR UPDATE;"
AUTOR = "IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN"
TRECHO_AUTOR_CRIAR = AUTOR + "\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n  IF p_etapa IS NULL"
TRECHO_AUTOR_RENOMEAR = AUTOR + "\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n  IF p_tenant IS NULL"
LOG_CRIAR = "VALUES (NULL, 'orcamentista_familia_etapa', p_etapa::text,"
LOG_RENOMEAR = "VALUES (p_tenant, 'orcamentista_materia_prima', p_materia_prima::text,"
IMPORTACAO = """INSERT INTO public.orcamentista_importacao (motor_id, importado_por, itens, regras, tipologias, cruzam, nao_cruzam, normalizados, avisos)
  VALUES (v_motor, p_por, 0, v_regras, v_tipologias, 0, 0, (p_payload->'contagens'->>'normalizados')::integer, p_payload->'avisos')
  RETURNING id INTO v_importacao_id;"""
PASSO4 = "  -- 4. a etapa aponta o motor novo"

# EQUIVALENTES, com a razão: sozinha, a mutação não muda o comportamento observável; a COMBINADA (10-2c) as mata juntas.
#  - 10-2a e 10-2b: o advisory lock da família e o FOR UPDATE da linha da etapa serializam, cada um sozinho, duas subidas na mesma etapa e a subida contra a
#    gravação da lista. Um cobre o outro. O advisory fica porque é a MESMA ordem de travas de superadmin_gravar_etapas_da_familia (trava da família e depois as linhas).
EQUIVALENTES = {"10-2a sem o advisory lock (o FOR UPDATE da linha basta)", "10-2b sem o FOR UPDATE da etapa (o advisory lock basta)"}

MUTACOES = [
    ("10-1 a etapa não aponta o motor novo", [("UPDATE public.orcamentista_familia_etapa SET motor_id = v_motor,", "UPDATE public.orcamentista_familia_etapa SET motor_id = motor_id,")]),
    ("10-2a sem o advisory lock (o FOR UPDATE da linha basta)", [(ADV, "")]),
    ("10-2b sem o FOR UPDATE da etapa (o advisory lock basta)", [(FOR_UPD, "    FROM public.orcamentista_familia_etapa e WHERE e.id = p_etapa;")]),
    ("10-2c sem o advisory lock E sem o FOR UPDATE", [(ADV, ""), (FOR_UPD, "    FROM public.orcamentista_familia_etapa e WHERE e.id = p_etapa;")]),
    ("10-3 a pasta da família não é conferida", [("IF left(v_path, length(v_prefixo)) <> v_prefixo OR position('..' in v_path) > 0 THEN", "IF false THEN")]),
    ("10-4 o '..' no caminho passa", [(" OR position('..' in v_path) > 0", "")]),
    ("10-5 criar não confere o autor", [(TRECHO_AUTOR_CRIAR, TRECHO_AUTOR_CRIAR.replace(AUTOR, "IF false THEN", 1))]),
    ("10-6 motor sem tipologia passa", [("IF jsonb_array_length(p_payload->'detalhes') = 0 THEN", "IF false THEN")]),
    ("10-7 itens de preço passam", [("IF p_payload ? 'itens' AND", "IF false AND")]),
    ("10-8 contagens sem normalizados passa", [("IF (p_payload->'contagens'->>'normalizados') IS NULL THEN", "IF false THEN")]),
    ("10-9 o motor nasce vigente", [("VALUES (v_familia, NULL, v_nome, v_path, false, p_por)", "VALUES (v_familia, NULL, v_nome, v_path, true, p_por)")]),
    ("10-10 a importação não é registrada", [(IMPORTACAO, "v_importacao_id := NULL;")]),
    ("10-11 os perfis não são gravados", [("FROM jsonb_to_recordset(p_payload->'perfis')", "FROM jsonb_to_recordset('[]'::jsonb)")]),
    ("10-12 a otimização não é gravada", [("FROM jsonb_to_recordset(p_payload->'otimizacao')", "FROM jsonb_to_recordset('[]'::jsonb)")]),
    ("10-13 criar não loga a etapa", [(LOG_CRIAR, "VALUES (NULL, 'outra_tabela', p_etapa::text,")]),
    ("10-14 apaga os tempos dos outros motores", [(PASSO4, "  DELETE FROM public.orcamentista_motor_tipologia_tempo WHERE motor_id <> v_motor;\n" + PASSO4)]),
    ("10-15 mexe no motor que já existia", [(PASSO4, "  UPDATE public.orcamentista_motor SET arquivo_nome = arquivo_nome || 'x' WHERE familia = v_familia AND id <> v_motor;\n" + PASSO4)]),
    ("10-16 o motor não nasce da família da etapa", [("VALUES (v_familia, NULL, v_nome", "VALUES ('PVC', NULL, v_nome")]),
    ("10-17 o motor nasce sem autor", [("v_path, false, p_por)", "v_path, false, NULL)")]),
    ("10-18 o nome do arquivo não é aparado", [("v_nome          text := btrim(p_arquivo_nome);", "v_nome          text := p_arquivo_nome;")]),
    ("10-19 o motor anterior não é devolvido", [("SELECT to_jsonb(e), e.motor_id INTO v_antes, v_motor_antes", "SELECT to_jsonb(e), NULL::uuid INTO v_antes, v_motor_antes")]),
    ("10-20 a autoria da etapa não é gravada", [("SET motor_id = v_motor, atualizado_por = p_por,", "SET motor_id = v_motor, atualizado_por = atualizado_por,")]),
    ("10-21 criar nasce aberta (sem REVOKE)", [("REVOKE ALL ON FUNCTION public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;", "SELECT 1;")]),
    ("10-22 criar sem statement_timeout", [("SET statement_timeout = '35s'\n", "")]),
    ("10-23 renomear sem search_path fixo", [("SET search_path = public, pg_temp\nAS $fn$\nDECLARE\n  v_nome", "AS $fn$\nDECLARE\n  v_nome")]),
    ("10-24 renomear deixa de ser SECURITY DEFINER", [("RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public, pg_temp\nAS $fn$\nDECLARE\n  v_nome", "RETURNS jsonb\nLANGUAGE plpgsql\nSET search_path = public, pg_temp\nAS $fn$\nDECLARE\n  v_nome")]),
    ("10-25 renomear não confere o autor", [(TRECHO_AUTOR_RENOMEAR, TRECHO_AUTOR_RENOMEAR.replace(AUTOR, "IF false THEN", 1))]),
    ("10-26 renomear não apara", [("v_nome   text := btrim(p_nome);", "v_nome   text := p_nome;")]),
    ("10-27 renomear sem o limite de 80", [("char_length(v_nome) > 80", "char_length(v_nome) > 8000")]),
    ("10-28 renomear aceita matéria-prima de outra empresa", [("WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;", "WHERE m.id = p_materia_prima FOR UPDATE;")]),
    ("10-29 nome repetido estoura 23505 cru", [("EXCEPTION WHEN unique_violation THEN", "EXCEPTION WHEN no_data_found THEN")]),
    ("10-30 renomear não loga", [(LOG_RENOMEAR, "VALUES (p_tenant, 'outra_tabela', p_materia_prima::text,")]),
    ("10-31 renomear não grava a autoria", [("SET nome = v_nome, atualizado_por = p_por,", "SET nome = v_nome, atualizado_por = atualizado_por,")]),
    ("10-32 renomear não confere a empresa", [("IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN", "IF false THEN")]),
]

def sem_verifica(t):
    i = t.index("DO $verifica$"); j = t.index("$verifica$;", i) + len("$verifica$;")
    return t[:i] + t[j:]

def rodar(t):
    f = tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False); f.write(t); f.close()
    return subprocess.run(["bash", str(AQUI / "run.sh"), f.name], capture_output=True, text=True).returncode

def aplicar(trocas, tira_verifica):
    t = ORIG
    for de, para in trocas: t = t.replace(de, para)
    return sem_verifica(t) if tira_verifica else t

c = rodar(ORIG)
print(f"CONTROLE (sem mutação): {'passa' if c == 0 else 'FALHOU exit ' + str(c)}", flush=True)
vivas = []
for nome, trocas in MUTACOES:
    erro = [de[:60] for de, _ in trocas if ORIG.count(de) != 1]
    if erro:
        print(f"{nome}: TRECHO NAO ACHADO ou repetido {erro} — a mutação não se aplica"); vivas.append(nome); continue
    r = rodar(aplicar(trocas, False))
    print(f"{nome} {'MORTA' if r != 0 else ('EQUIVALENTE' if nome in EQUIVALENTES else 'SOBREVIVEU')} (exit {r})", flush=True)
    if r == 0 and nome not in EQUIVALENTES: vivas.append(nome)
print("SOBREVIVERAM:", vivas)
print("--- sem a verificação (só os casos):")
c2 = rodar(sem_verifica(ORIG))
print(f"CONTROLE sem verificação: {'passa' if c2 == 0 else 'FALHOU exit ' + str(c2)}", flush=True)
vivas2 = []
for nome, trocas in MUTACOES:
    r = rodar(aplicar(trocas, True))
    print(f"{nome} {'MORTA pelos casos' if r == 1 else ('abortou na base' if r == 2 else ('EQUIVALENTE' if nome in EQUIVALENTES else 'SOBREVIVEU'))} (exit {r})", flush=True)
    if r == 0 and nome not in EQUIVALENTES: vivas2.append(nome)
print("SOBREVIVERAM sem verificação:", vivas2)
sys.exit(1 if (c != 0 or c2 != 0 or vivas or vivas2) else 0)
