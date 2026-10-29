#!/usr/bin/env python3
"""Mutações da 20261029000005: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para).
Fora da lista, por ser EQUIVALENTE: tirar a conferência das contagens do semeio (`v_depois <> 0 OR v_n <> v_antes`) — o laço nomeia todo motor sem
nome, e nenhum estado faz as contagens divergirem."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261029000005_nome_do_motor_e_arquivar_em_uso.sql").read_text()

ARQ_ANTES = """  UPDATE public.orcamentista_motor SET arquivado_em = now(), arquivado_por = p_por WHERE id = p_motor;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', p_motor::text,
          jsonb_build_object('orcamentista_motor', to_jsonb(v_antigo), 'troca_de_arquivo_do_motor', p_motor),
          jsonb_build_object('orcamentista_motor', (SELECT to_jsonb(m) FROM public.orcamentista_motor m WHERE m.id = p_motor)), p_por);
"""
MUTACOES = [
    ("G1 a guarda não exige a 20261029000003", [("  IF to_regclass('public.orcamentista_motor_familia') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL\n     OR to_regprocedure('public.superadmin_arquivar_motor(uuid, uuid)') IS NULL", "  IF false")]),
    ("G2 a guarda da forma do nome semeado some", [("    IF v_ruins IS NOT NULL THEN", "    IF false THEN")]),
    ("G3 a guarda do nome repetido some", [("    IF v_repet IS NOT NULL THEN", "    IF false THEN")]),
    ("S1 o semeio não nomeia", [("    UPDATE public.orcamentista_motor SET nome = btrim(regexp_replace(arquivo_nome, '\\.[A-Za-z0-9]+$', '')) WHERE id = r.id;", "    NULL;")]),
    ("S2 o semeio não loga", [("    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n    VALUES (NULL, 'orcamentista_motor', r.id::text,", "    PERFORM 1;\n    SELECT NULL, 'orcamentista_motor', r.id::text,")]),
    ("S3 o semeio mantém a extensão", [("    UPDATE public.orcamentista_motor SET nome = btrim(regexp_replace(arquivo_nome, '\\.[A-Za-z0-9]+$', '')) WHERE id = r.id;", "    UPDATE public.orcamentista_motor SET nome = arquivo_nome WHERE id = r.id;")]),
    ("T1 o nome sem NOT NULL", [("ALTER TABLE public.orcamentista_motor ALTER COLUMN nome SET NOT NULL;\n", "")]),
    ("T2 a CHECK da forma não nasce", [("      CHECK (nome = btrim(nome) AND char_length(nome) >= 1 AND char_length(nome) <= 80);", "      CHECK (true);")]),
    ("T3 a CHECK aceita espaço na ponta", [("      CHECK (nome = btrim(nome) AND char_length(nome) >= 1 AND char_length(nome) <= 80);", "      CHECK (char_length(nome) >= 1 AND char_length(nome) <= 80);")]),
    ("T4 a CHECK com 60 caracteres", [("      CHECK (nome = btrim(nome) AND char_length(nome) >= 1 AND char_length(nome) <= 80);", "      CHECK (nome = btrim(nome) AND char_length(nome) >= 1 AND char_length(nome) <= 60);")]),
    ("T5 o índice não é parcial", [("CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_motor_nome_ativo ON public.orcamentista_motor (fornecedor_id, nome) WHERE arquivado_em IS NULL;", "CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_motor_nome_ativo ON public.orcamentista_motor (fornecedor_id, nome);")]),
    ("T6 o índice não nasce", [("CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_motor_nome_ativo ON public.orcamentista_motor (fornecedor_id, nome) WHERE arquivado_em IS NULL;\n", "")]),
    ("T7 o índice sem o fornecedor", [("CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_motor_nome_ativo ON public.orcamentista_motor (fornecedor_id, nome) WHERE arquivado_em IS NULL;", "CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_motor_nome_ativo ON public.orcamentista_motor (nome) WHERE arquivado_em IS NULL;")]),
    ("K1 as FKs ficam RESTRICT", [("                  AND confdeltype <> 'n') THEN", "                  AND false) THEN")]),
    ("K2 as FKs com CASCADE", [("REFERENCES public.orcamentista_motor_familia (motor_id, familia) ON DELETE SET NULL',", "REFERENCES public.orcamentista_motor_familia (motor_id, familia) ON DELETE CASCADE',")]),
    ("K3 só a etapa muda (o item fica RESTRICT)", [("  FOREACH nome IN ARRAY ARRAY['orcamentista_familia_etapa', 'orcamentista_levantamento_item'] LOOP\n    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey'\n                  AND confdeltype <> 'n') THEN", "  FOREACH nome IN ARRAY ARRAY['orcamentista_familia_etapa'] LOOP\n    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey'\n                  AND confdeltype <> 'n') THEN")]),
    ("A1 arquivar não limpa as etapas", [("       SET motor_id = NULL, motor_familia_exigida = NULL, atualizado_por = p_por, atualizado_em = now()\n     WHERE id = v_etapa.id;", "       SET atualizado_por = p_por\n     WHERE id = v_etapa.id AND false;")]),
    ("A2 arquivar não loga as etapas", [("    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,\n            jsonb_build_object('orcamentista_familia_etapa', v_eantes, 'arquivamento_do_motor', p_motor),", "    PERFORM 1;\n    SELECT v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,\n            jsonb_build_object('orcamentista_familia_etapa', v_eantes, 'arquivamento_do_motor', p_motor),")]),
    ("A3 o log da etapa sem o tenant", [("    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,\n            jsonb_build_object('orcamentista_familia_etapa', v_eantes,", "    VALUES (NULL, 'orcamentista_familia_etapa', v_etapa.id::text,\n            jsonb_build_object('orcamentista_familia_etapa', v_eantes,")]),
    ("A4 arquivar devolve a lista vazia", [("  RETURN jsonb_build_object('orcamentista_motor', v_depois, 'etapas_sem_motor', v_sem);", "  RETURN jsonb_build_object('orcamentista_motor', v_depois, 'etapas_sem_motor', '[]'::jsonb);")]),
    ("A5 a lista fora de ordem", [("     ORDER BY coalesce(t.name, '(sem nome)'), mp.nome, x.numero\n       FOR UPDATE OF x", "     ORDER BY x.numero DESC\n       FOR UPDATE OF x")]),
    ("A6 arquivar sem a trava do motor", [("  SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;\n  IF v_antes IS NULL THEN\n    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n  IF v_antes ->> 'arquivado_em' IS NOT NULL THEN\n    RAISE EXCEPTION 'o motor ja esta arquivado'", "  SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_motor m WHERE m.id = p_motor;\n  IF v_antes IS NULL THEN\n    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n  IF v_antes ->> 'arquivado_em' IS NOT NULL THEN\n    RAISE EXCEPTION 'o motor ja esta arquivado'")]),
    ("A7 arquivar limpa também os itens", [("  UPDATE public.orcamentista_motor SET arquivado_em = now(), arquivado_por = p_por WHERE id = p_motor;\n  SELECT to_jsonb(m) INTO v_depois", "  UPDATE public.orcamentista_levantamento_item SET motor_id = NULL, motor_familia_exigida = NULL WHERE motor_id = p_motor;\n  UPDATE public.orcamentista_motor SET arquivado_em = now(), arquivado_por = p_por WHERE id = p_motor;\n  SELECT to_jsonb(m) INTO v_depois")]),
    ("A8 arquivar recusa em uso (como antes)", [("  FOR v_etapa IN\n    SELECT x.id, x.tenant_id", "  IF EXISTS (SELECT 1 FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor) THEN\n    RAISE EXCEPTION 'o motor tem etapa' USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  FOR v_etapa IN\n    SELECT x.id, x.tenant_id")]),
    ("C1 criar sem a frase da forma", [("  IF p_nome IS NULL OR p_nome <> btrim(p_nome) OR char_length(p_nome) NOT BETWEEN 1 AND 80 THEN\n    RAISE EXCEPTION 'o nome do motor tem de 1 a 80 caracteres, sem espaco nas pontas. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  IF EXISTS (SELECT 1 FROM public.orcamentista_motor m WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome AND m.arquivado_em IS NULL) THEN", "  IF false THEN\n    RAISE EXCEPTION 'o nome do motor tem de 1 a 80 caracteres, sem espaco nas pontas. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  IF EXISTS (SELECT 1 FROM public.orcamentista_motor m WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome AND m.arquivado_em IS NULL) THEN")]),
    ("C2 criar sem a frase do repetido", [("  IF EXISTS (SELECT 1 FROM public.orcamentista_motor m WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome AND m.arquivado_em IS NULL) THEN", "  IF false THEN")]),
    ("C3 criar conta o arquivado como repetido", [("  IF EXISTS (SELECT 1 FROM public.orcamentista_motor m WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome AND m.arquivado_em IS NULL) THEN", "  IF EXISTS (SELECT 1 FROM public.orcamentista_motor m WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome) THEN")]),
    ("C4 a assinatura antiga do criar fica", [("DROP FUNCTION IF EXISTS public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb);\n", "")]),
    ("E1 editar não grava o nome", [("  IF v_nome_muda THEN\n    UPDATE public.orcamentista_motor SET nome = p_nome WHERE id = p_motor;\n  END IF;", "")]),
    ("E2 nada mudou ignora o nome", [("  IF NOT v_origem AND NOT v_nome_muda AND cardinality(v_saem) = 0 AND cardinality(v_entram) = 0 THEN", "  IF NOT v_origem AND cardinality(v_saem) = 0 AND cardinality(v_entram) = 0 THEN")]),
    ("E3 editar sem a frase do repetido", [("              WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome AND m.arquivado_em IS NULL AND m.id <> p_motor) THEN", "              WHERE false) THEN")]),
    ("E4 editar acha a si mesmo repetido", [("              WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome AND m.arquivado_em IS NULL AND m.id <> p_motor) THEN", "              WHERE m.fornecedor_id = p_fornecedor AND m.nome = p_nome AND m.arquivado_em IS NULL) THEN")]),
    ("E5 a assinatura antiga do editar fica", [("DROP FUNCTION IF EXISTS public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text);\n", "")]),
    ("E6 o nome com uso recusado", [("    IF v_etapas > 0 OR v_itens > 0 THEN\n      RAISE EXCEPTION 'o motor tem uso (% etapa(s), % item(ns) de levantamento): categoria e fornecedor so se editam em motor sem uso (as familias e o nome", "    IF (v_etapas > 0 OR v_itens > 0) THEN\n      RAISE EXCEPTION 'o motor tem uso (% etapa(s), % item(ns) de levantamento): categoria e fornecedor so se editam em motor sem uso (as familias e o nome"), ("  v_origem := p_fornecedor <> v_atual.fornecedor_id OR p_categoria <> v_atual.categoria_chave;", "  v_origem := p_fornecedor <> v_atual.fornecedor_id OR p_categoria <> v_atual.categoria_chave OR p_nome <> v_atual.nome;")]),
    ("R1 trocar arquiva DEPOIS de criar (a ordem de antes)", [(ARQ_ANTES, ""), ("  RETURN v_criado || jsonb_build_object('motor_antigo', p_motor, 'etapas_reapontadas', v_n);", ARQ_ANTES + "  RETURN v_criado || jsonb_build_object('motor_antigo', p_motor, 'etapas_reapontadas', v_n);")]),
    ("R2 trocar dá ao novo o nome do arquivo", [("                                            v_antigo.nome, p_arquivo_path, p_arquivo_nome, p_payload);", "                                            btrim(regexp_replace(p_arquivo_nome, '\\.[A-Za-z0-9]+$', '')), p_arquivo_path, p_arquivo_nome, p_payload);")]),
    ("R3 trocar não loga o arquivamento", [("  VALUES (NULL, 'orcamentista_motor', p_motor::text,\n          jsonb_build_object('orcamentista_motor', to_jsonb(v_antigo), 'troca_de_arquivo_do_motor', p_motor),", "  SELECT NULL, 'orcamentista_motor', p_motor::text,\n          jsonb_build_object('orcamentista_motor', to_jsonb(v_antigo), 'troca_de_arquivo_do_motor', p_motor),")]),
    ("P1 arquivar aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_arquivar_motor(uuid, uuid) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_arquivar_motor(uuid, uuid) TO service_role, authenticated;")]),
    ("P2 criar aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) TO service_role, authenticated;")]),
    ("P3 editar aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text, text) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text, text) TO service_role, authenticated;")]),
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
