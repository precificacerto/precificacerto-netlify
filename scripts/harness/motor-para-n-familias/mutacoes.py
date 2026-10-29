#!/usr/bin/env python3
"""Mutações da 20261029000003: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para).
Fora da lista, por serem EQUIVALENTES (nada no comportamento muda): tirar o DROP da CHECK `familia_so_no_perfil` e do UNIQUE `(id, familia_exigida)`
— o DROP COLUMN leva as constraints que citam a coluna —, e tirar o índice por `familia` (só desempenho)."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261029000003_motor_para_n_familias.sql").read_text()

MUTACOES = [
    ("G1 a guarda não exige a 20261029000002 (nem o editar dela, nem as colunas)", [("     OR (to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text)') IS NULL\n         AND to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text)') IS NULL)\n", ""), ("     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'motor_familia_exigida')\n     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_levantamento_item' AND column_name = 'motor_familia_exigida')\n     OR (to_regclass('public.orcamentista_motor_familia') IS NULL\n         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'familia_exigida')) THEN", "     THEN")]),
    ("G2 a guarda do motor sem família some", [("    IF v_n > 0 THEN\n      RAISE EXCEPTION 'guarda: % motor(es) sem familia", "    IF false THEN\n      RAISE EXCEPTION 'guarda: % motor(es) sem familia")]),
    ("G3 a guarda do '*' some", [("  IF v_n_etapa > 0 OR v_n_item > 0 THEN", "  IF false THEN")]),
    ("G4 a guarda do '*' esquece o item", [("  IF v_n_etapa > 0 OR v_n_item > 0 THEN", "  IF v_n_etapa > 0 THEN")]),
    ("T1 a ligação sem o CASCADE do motor", [("REFERENCES public.orcamentista_motor (id) ON DELETE CASCADE,", "REFERENCES public.orcamentista_motor (id) ON DELETE RESTRICT,")]),
    ("T2 a ligação com CASCADE do catálogo", [("REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE RESTRICT\n);", "REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE CASCADE\n);")]),
    ("T3 a ligação sem RLS", [("ALTER TABLE public.orcamentista_motor_familia ENABLE ROW LEVEL SECURITY;\n", "")]),
    ("T4 a política de DELETE some", [("    CREATE POLICY orcamentista_motor_familia_delete_super_admin ON public.orcamentista_motor_familia FOR DELETE USING (public.is_super_admin());", "    NULL;")]),
    ("T5 a política de INSERT aberta", [("FOR INSERT WITH CHECK (public.is_super_admin());", "FOR INSERT WITH CHECK (true);")]),
    ("T6 a ligação aberta ao authenticated", [("GRANT ALL ON TABLE public.orcamentista_motor_familia TO service_role;", "GRANT ALL ON TABLE public.orcamentista_motor_familia TO service_role, authenticated;")]),
    ("T7 sem o REVOKE da ligação", [("REVOKE ALL ON TABLE public.orcamentista_motor_familia FROM PUBLIC, anon, authenticated;\n", "")]),
    ("S1 o semeio não grava", [("    INSERT INTO public.orcamentista_motor_familia (motor_id, familia) VALUES (r.id, r.familia);", "    NULL;")]),
    ("S2 o semeio não loga", [("    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n    VALUES (NULL, 'orcamentista_motor_familia', r.id::text,", "    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n    SELECT NULL, 'orcamentista_motor_familia', r.id::text,")]),
    ("S3 o semeio não mede", [("  IF v_depois <> v_antes THEN", "  IF false THEN")]),
    ("D1 o gatilho sem a trava do motor", [("  PERFORM 1 FROM public.orcamentista_motor m WHERE m.id = v_motor FOR UPDATE;\n  IF NOT FOUND THEN", "  PERFORM 1 FROM public.orcamentista_motor m WHERE m.id = v_motor;\n  IF NOT FOUND THEN")]),
    ("D2 o gatilho do motor imediato", [("      AFTER INSERT ON public.orcamentista_motor\n      DEFERRABLE INITIALLY DEFERRED", "      AFTER INSERT ON public.orcamentista_motor\n      DEFERRABLE INITIALLY IMMEDIATE")]),
    ("D3 o gatilho da ligação some", [("    CREATE CONSTRAINT TRIGGER orcamentista_motor_sem_familia\n      AFTER DELETE OR UPDATE OF motor_id ON public.orcamentista_motor_familia\n      DEFERRABLE INITIALLY DEFERRED\n      FOR EACH ROW EXECUTE FUNCTION public.orcamentista_motor_confere_familias();", "    NULL;")]),
    ("D4 o gatilho do motor some", [("    CREATE CONSTRAINT TRIGGER orcamentista_motor_sem_familia\n      AFTER INSERT ON public.orcamentista_motor\n      DEFERRABLE INITIALLY DEFERRED\n      FOR EACH ROW EXECUTE FUNCTION public.orcamentista_motor_confere_familias();", "    NULL;")]),
    ("D5 o gatilho confere o motor que saiu", [("  IF NOT FOUND THEN\n    RETURN NULL;  -- o motor saiu", "  IF false THEN\n    RETURN NULL;  -- o motor saiu")]),
    ("D6 o gatilho esquece a troca de motor_id", [("      AFTER DELETE OR UPDATE OF motor_id ON public.orcamentista_motor_familia", "      AFTER DELETE ON public.orcamentista_motor_familia")]),
    ("D7 a função do gatilho aberta", [("REVOKE ALL ON FUNCTION public.orcamentista_motor_confere_familias() FROM PUBLIC, anon, authenticated;", "GRANT EXECUTE ON FUNCTION public.orcamentista_motor_confere_familias() TO authenticated;")]),
    ("E1 a CHECK com '*' fica", [("    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_familia_exigida'\n                  AND pg_get_constraintdef(oid) LIKE '%''*''%') THEN", "    IF false THEN")]),
    ("E2 a CHECK nova sem o 'se e só se'", [("CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL) AND (motor_familia_exigida IS NULL OR motor_familia_exigida = familia))',", "CHECK (motor_familia_exigida IS NULL OR motor_familia_exigida = familia)',")]),
    ("E3 a CHECK nova aceita qualquer exigida", [("CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL) AND (motor_familia_exigida IS NULL OR motor_familia_exigida = familia))',", "CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL))',")]),
    ("E4 a FK nova com CASCADE", [("REFERENCES public.orcamentista_motor_familia (motor_id, familia) ON DELETE RESTRICT',", "REFERENCES public.orcamentista_motor_familia (motor_id, familia) ON DELETE CASCADE',")]),
    ("E5 a FK antiga fica (e a nova não nasce)", [("                  AND confrelid = 'public.orcamentista_motor'::regclass) THEN\n      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', nome, nome || '_motor_exigida_fkey');", "                  AND false) THEN\n      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', nome, nome || '_motor_exigida_fkey');")]),
    ("E6 o item fica sem a FK nova", [("    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey') THEN", "    IF nome <> 'orcamentista_levantamento_item' AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey') THEN")]),
    ("F1 a coluna familia fica no motor", [("ALTER TABLE public.orcamentista_motor DROP COLUMN IF EXISTS familia;\n", "")]),
    ("C1 criar aceita a lista vazia", [("  IF p_familias IS NULL OR cardinality(p_familias) = 0 THEN\n    RAISE EXCEPTION 'o motor atua em pelo menos uma familia: a lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  IF array_position(p_familias, NULL) IS NOT NULL THEN\n    RAISE EXCEPTION 'uma familia da lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  SELECT string_agg(d.f, ', ' ORDER BY d.f) INTO v_msg FROM (SELECT f FROM unnest(p_familias) f GROUP BY f HAVING count(*) > 1) d;\n  IF v_msg IS NOT NULL THEN\n    RAISE EXCEPTION 'a familia % aparece mais de uma vez na lista. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  SELECT string_agg(f, ', ' ORDER BY f) INTO v_msg FROM unnest(p_familias) f\n   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo c WHERE c.chave = f);\n  IF v_msg IS NOT NULL THEN\n    RAISE EXCEPTION 'familia fora do catalogo: %. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  v_familias", "  IF p_familias IS NULL THEN\n    RAISE EXCEPTION 'o motor atua em pelo menos uma familia: a lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  IF array_position(p_familias, NULL) IS NOT NULL THEN\n    RAISE EXCEPTION 'uma familia da lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  SELECT string_agg(d.f, ', ' ORDER BY d.f) INTO v_msg FROM (SELECT f FROM unnest(p_familias) f GROUP BY f HAVING count(*) > 1) d;\n  IF v_msg IS NOT NULL THEN\n    RAISE EXCEPTION 'a familia % aparece mais de uma vez na lista. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  SELECT string_agg(f, ', ' ORDER BY f) INTO v_msg FROM unnest(p_familias) f\n   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo c WHERE c.chave = f);\n  IF v_msg IS NOT NULL THEN\n    RAISE EXCEPTION 'familia fora do catalogo: %. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';\n  END IF;\n  v_familias")]),
    ("C2 criar não grava as ligações", [("  INSERT INTO public.orcamentista_motor_familia (motor_id, familia) SELECT v_motor, f FROM unnest(v_familias) f;", "  NULL;")]),
    ("C3 criar loga sem as famílias", [("                             'familias', to_jsonb(v_familias),\n", "")]),
    ("C4 a assinatura antiga do criar fica", [("DROP FUNCTION IF EXISTS public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb);\n", "")]),
    ("C5 criar aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb) TO service_role, authenticated;")]),
    ("X1 editar fornecedor/categoria com uso", [("    IF v_etapas > 0 OR v_itens > 0 THEN\n      RAISE EXCEPTION 'o motor tem uso", "    IF false THEN\n      RAISE EXCEPTION 'o motor tem uso")]),
    ("X2 editar: a origem ignora a categoria", [("  v_origem := p_fornecedor <> v_atual.fornecedor_id OR p_categoria <> v_atual.categoria_chave;", "  v_origem := p_fornecedor <> v_atual.fornecedor_id;")]),
    ("X3 editar sem a recusa da família em uso", [("    IF v_etapas > 0 OR v_itens > 0 THEN\n      v_msg := '';", "    IF false THEN\n      v_msg := '';")]),
    ("X4 editar: a recusa esquece o item", [("    IF v_etapas > 0 OR v_itens > 0 THEN\n      v_msg := '';", "    IF v_etapas > 0 THEN\n      v_itens := 0;\n      v_msg := '';")]),
    ("X5 editar: a recusa sem o 'e mais N'", [("CASE WHEN v_etapas > 3 THEN format('; e mais %s', v_etapas - 3) ELSE '' END", "''")]),
    ("X6 nada mudou ignora as famílias", [("  IF NOT v_origem AND cardinality(v_saem) = 0 AND cardinality(v_entram) = 0 THEN", "  IF NOT v_origem THEN")]),
    ("X7 editar não grava as que entram", [("  INSERT INTO public.orcamentista_motor_familia (motor_id, familia) SELECT p_motor, f FROM unnest(v_entram) f;", "  NULL;")]),
    ("X8 editar não tira as que saem", [("  DELETE FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = p_motor AND mf.familia = ANY (v_saem);", "  NULL;")]),
    ("X9 editar loga sem as famílias de antes", [("  v_antes := jsonb_build_object('orcamentista_motor', to_jsonb(v_atual), 'familias', to_jsonb(v_atuais));", "  v_antes := jsonb_build_object('orcamentista_motor', to_jsonb(v_atual));")]),
    ("X10 editar sem a trava do motor", [("  SELECT * INTO v_atual FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n  IF v_atual.arquivado_em IS NOT NULL THEN\n    RAISE EXCEPTION 'o motor esta arquivado: motor arquivado nao se edita.", "  SELECT * INTO v_atual FROM public.orcamentista_motor m WHERE m.id = p_motor;\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n  IF v_atual.arquivado_em IS NOT NULL THEN\n    RAISE EXCEPTION 'o motor esta arquivado: motor arquivado nao se edita.")]),
    ("X11 a assinatura antiga do editar fica", [("DROP FUNCTION IF EXISTS public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text);\n", "")]),
    ("X12 editar aberta ao authenticated", [("GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text) TO service_role, authenticated;")]),
    ("W1 gravar não confere a família do motor", [("      IF NOT EXISTS (SELECT 1 FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = (e ->> 'motor_id')::uuid AND mf.familia = v_familia) THEN", "      IF false THEN")]),
    ("W2 gravar: null não limpa a exigida", [("                 THEN CASE WHEN (e ->> 'motor_id') IS NULL THEN NULL ELSE familia END", "                 THEN familia")]),
    ("W3 gravar: insere sem a exigida", [("                CASE WHEN (e ->> 'motor_id') IS NULL THEN NULL ELSE v_familia END);", "                NULL);")]),
    ("W4 gravar sem a trava do motor", [("        FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid FOR SHARE;", "        FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid;")]),
    ("R1 trocar cria o novo sem famílias", [("                                            (SELECT array_agg(mf.familia ORDER BY mf.familia) FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = p_motor),", "                                            ARRAY['PVC'],")]),
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
