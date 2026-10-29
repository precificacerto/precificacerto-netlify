#!/usr/bin/env python3
"""Mutações da 20261029000001: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para)."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261029000001_trocar_arquivo_e_editar_motor.sql").read_text()

MUTACOES = [
    ("T1 a guarda some", [("     OR to_regclass('public.orcamentista_levantamento_item') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN\n    RAISE EXCEPTION 'dependencia ausente: a 20261028000001", "     OR false THEN\n    RAISE EXCEPTION 'dependencia ausente: a 20261028000001")]),
    ("T2 trocar sem conferir o autor", [("  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n  IF p_motor IS NULL THEN\n    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n\n  -- trava o motor ANTES", "  IF p_motor IS NULL THEN\n    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n\n  -- trava o motor ANTES")]),
    ("T3 trocar o arquivado", [("  IF v_antigo.arquivado_em IS NOT NULL THEN\n    RAISE EXCEPTION 'o motor esta arquivado: o arquivo", "  IF false THEN\n    RAISE EXCEPTION 'o motor esta arquivado: o arquivo")]),
    ("T4 trocar pelo mesmo caminho", [("  IF btrim(coalesce(p_arquivo_path, '')) = v_antigo.arquivo_path THEN", "  IF false THEN")]),
    ("T5 o mesmo caminho sem tirar o espaço", [("  IF btrim(coalesce(p_arquivo_path, '')) = v_antigo.arquivo_path THEN", "  IF coalesce(p_arquivo_path, '') = v_antigo.arquivo_path THEN")]),
    ("T6 o novo em outra categoria", [("v_criado := public.superadmin_criar_motor(p_por, v_antigo.fornecedor_id, v_antigo.categoria_chave, v_antigo.familia,", "v_criado := public.superadmin_criar_motor(p_por, v_antigo.fornecedor_id, 'PERSIANAS', v_antigo.familia,")]),
    ("T7 as etapas não passam ao novo", [("    UPDATE public.orcamentista_familia_etapa SET motor_id = v_novo, atualizado_por = p_por, atualizado_em = now() WHERE id = v_etapa.id;", "    NULL;")]),
    ("T8 o item de levantamento vai junto", [("  -- 3. o antigo ARQUIVADO", "  UPDATE public.orcamentista_levantamento_item SET motor_id = v_novo WHERE motor_id = p_motor;\n  -- 3. o antigo ARQUIVADO")]),
    ("T9 a etapa não loga", [("    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,", "    VALUES (v_etapa.tenant_id, 'outra_tabela', v_etapa.id::text,")]),
    ("T10 o log da etapa sem a empresa", [("    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,", "    VALUES (NULL, 'orcamentista_familia_etapa', v_etapa.id::text,")]),
    ("T11 o antigo não é arquivado", [("  PERFORM public.superadmin_arquivar_motor(p_motor, p_por);", "  NULL;")]),
    ("T12 o antigo é APAGADO (a opção b)", [("  PERFORM public.superadmin_arquivar_motor(p_motor, p_por);", "  DELETE FROM public.orcamentista_motor_tipologia_tempo WHERE motor_id = p_motor;\n  DELETE FROM public.orcamentista_motor_tipologia_detalhe WHERE motor_id = p_motor;\n  PERFORM public.superadmin_arquivar_motor(p_motor, p_por);")]),
    ("T13 o retorno sem a contagem", [("RETURN v_criado || jsonb_build_object('motor_antigo', p_motor, 'etapas_reapontadas', v_n);", "RETURN v_criado || jsonb_build_object('motor_antigo', p_motor);")]),
    ("T14 sem a trava do motor", [("  SELECT * INTO v_antigo FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;", "  SELECT * INTO v_antigo FROM public.orcamentista_motor m WHERE m.id = p_motor;"), ("  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_trocar_arquivo_do_motor:' || p_motor::text, 0));\n", "")]),
    ("T15 sem o statement_timeout", [("SET statement_timeout = '40s'\nAS $fn$", "AS $fn$")]),
    ("E1 editar com uso", [("  IF v_etapas > 0 OR v_itens > 0 THEN", "  IF false THEN")]),
    ("E2 editar ignora o item de levantamento", [("  IF v_etapas > 0 OR v_itens > 0 THEN", "  IF v_etapas > 0 THEN")]),
    ("E3 editar o arquivado", [("  IF v_atual.arquivado_em IS NOT NULL THEN\n    RAISE EXCEPTION 'o motor esta arquivado: motor arquivado", "  IF false THEN\n    RAISE EXCEPTION 'o motor esta arquivado: motor arquivado")]),
    ("E4 o caminho muda com o fornecedor igual", [("    IF v_path <> v_atual.arquivo_path THEN", "    IF false THEN")]),
    ("E5 o fornecedor muda e o caminho fica", [("    IF left(v_path, length(v_prefixo)) <> v_prefixo OR position('..' in v_path) > 0 THEN\n      RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor novo", "    IF position('..' in v_path) > 0 THEN\n      RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor novo")]),
    ("E6 o '..' passa", [("    IF left(v_path, length(v_prefixo)) <> v_prefixo OR position('..' in v_path) > 0 THEN\n      RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor novo", "    IF left(v_path, length(v_prefixo)) <> v_prefixo THEN\n      RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor novo")]),
    ("E7 nada mudou passa", [("  IF p_fornecedor = v_atual.fornecedor_id AND p_categoria = v_atual.categoria_chave THEN", "  IF false THEN")]),
    ("E8 a categoria fora da lista", [("  IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_categoria) THEN\n    RAISE EXCEPTION 'categoria fora da lista' USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  IF p_fornecedor IS NULL", "  IF p_fornecedor IS NULL")]),
    ("E9 o caminho não muda junto", [("UPDATE public.orcamentista_motor SET fornecedor_id = p_fornecedor, categoria_chave = p_categoria, arquivo_path = v_path WHERE id = p_motor;", "UPDATE public.orcamentista_motor SET fornecedor_id = p_fornecedor, categoria_chave = p_categoria WHERE id = p_motor;")]),
    ("E10 a edição não loga", [("  VALUES (NULL, 'orcamentista_motor', p_motor::text,\n          jsonb_build_object('orcamentista_motor', v_antes), jsonb_build_object('orcamentista_motor', v_depois), p_por);", "  VALUES (NULL, 'outra_tabela', p_motor::text,\n          jsonb_build_object('orcamentista_motor', v_antes), jsonb_build_object('orcamentista_motor', v_depois), p_por);")]),
    ("E11 editar sem conferir o autor", [("  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n  IF p_motor IS NULL THEN\n    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n\n  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_editar_motor:'", "  IF p_motor IS NULL THEN\n    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n\n  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_editar_motor:'")]),
    ("F1 trocar aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) TO service_role, authenticated;")]),
    ("F2 editar aberta ao public", [("REVOKE ALL ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;", "REVOKE ALL ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text) FROM anon, authenticated;")]),
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
