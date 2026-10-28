#!/usr/bin/env python3
"""Mutações da 20261028000001: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS,
sozinhos, derrubem cada mutação (ou que a base aborte). Cada mutação é uma lista de trocas (de, para)."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIGS = AQUI.parents[2] / "supabase/migrations"
ORIG = (MIGS / "20261028000001_familia_instancia_e_catalogo_de_motores.sql").read_text()

AUTOR = "IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN"
AUTOR_GRAVAR = AUTOR + "\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN\n    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n  IF p_etapas"
AUTOR_CRIAR = AUTOR + "\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n  IF p_payload IS NULL"
EMPRESA_GRAVAR = "IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN\n    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n  IF p_etapas"
LOOKUP_DEFINIR = "WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;\n  IF v_antes IS NULL THEN"
FOR_UPD_ETAPAS_REM = "  PERFORM 1 FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant FOR UPDATE;\n"

# EQUIVALENTES, com a razão: sozinha, a mutação não muda o comportamento observável.
#  - G-emp: a empresa inexistente cai, logo depois, na busca da matéria-prima por (id, tenant_id), com o MESMO código (P0002). A conferência fica pela frase.
#  - R-lock: remover já trava a matéria-prima FOR UPDATE, e gravar as etapas a lê FOR SHARE: a linha-mãe serializa os dois. O FOR UPDATE das etapas fica pelo
#    padrão da função (trava a árvore inteira antes de lê-la), o mesmo das categorias.
EQUIVALENTES = {"G-emp gravar não confere a empresa (a busca por (id, tenant) dá o mesmo P0002)", "R-lock remover sem o FOR UPDATE das etapas (a linha-mãe serializa)"}

MUTACOES = [
    # A. guardas
    ("A1 a guarda de uma PVC só some", [("    IF v_n <> 1 THEN\n      RAISE EXCEPTION 'guarda: ha %", "    IF false THEN\n      RAISE EXCEPTION 'guarda: ha %")]),
    ("A2 a guarda das 3 medidas some", [("IF v_pendentes <> (SELECT array_agg(x ORDER BY x) FROM unnest(v_esperadas) x)\n       OR EXISTS", "IF false\n       OR EXISTS")]),
    ("A3 a guarda não confere a família das 3", [("WHERE e.id = ANY (v_pendentes) AND e.familia <> 'PVC') THEN", "WHERE false) THEN")]),
    ("A4 motor sem fornecedor passa", [("IF EXISTS (SELECT 1 FROM public.orcamentista_motor WHERE fornecedor_id IS NULL) THEN", "IF false THEN")]),
    ("A5 motor sem categoria além da Wolff passa", [("  IF v_n > 0 THEN\n    RAISE EXCEPTION 'guarda: ha % motor(es)", "  IF false THEN\n    RAISE EXCEPTION 'guarda: ha % motor(es)")]),
    ("A6 a guarda roda mesmo sem pendentes (a reaplicação aborta)", [("IF cardinality(v_pendentes) > 0 THEN", "IF true THEN")]),
    # B. matéria-prima
    ("B1 o índice de uma por conta fica", [("DROP INDEX IF EXISTS public.orcamentista_materia_prima_tenant_familia_idx;\n", "")]),
    # C. etapa
    ("C1 o preenchimento não leva a empresa", [("SET materia_prima_id = v_mp.id, tenant_id = v_mp.tenant_id WHERE id = v_e.id;", "SET materia_prima_id = v_mp.id WHERE id = v_e.id;")]),
    ("C2 o preenchimento não loga", [("VALUES (v_mp.tenant_id, 'orcamentista_familia_etapa', v_e.id::text,", "VALUES (v_mp.tenant_id, 'outra_tabela', v_e.id::text,")]),
    ("C3 o antes do log é o depois", [("jsonb_build_object('orcamentista_familia_etapa', v_e.antes, 'migracao'", "jsonb_build_object('orcamentista_familia_etapa', (SELECT to_jsonb(x) FROM public.orcamentista_familia_etapa x WHERE x.id = v_e.id), 'migracao'")]),
    ("C4 o preenchimento repete na reaplicação", [("WHERE e.materia_prima_id IS NULL AND e.id = ANY", "WHERE e.id = ANY")]),
    ("C5 a FK sem CASCADE", [("REFERENCES public.orcamentista_materia_prima (id, tenant_id, familia) ON DELETE CASCADE;", "REFERENCES public.orcamentista_materia_prima (id, tenant_id, familia);")]),
    ("C6 a FK sem a família", [("FOREIGN KEY (materia_prima_id, tenant_id, familia) REFERENCES public.orcamentista_materia_prima (id, tenant_id, familia)", "FOREIGN KEY (materia_prima_id) REFERENCES public.orcamentista_materia_prima (id)")]),
    ("C7 a unicidade antiga (familia, numero) fica", [("    ALTER TABLE public.orcamentista_familia_etapa DROP CONSTRAINT orcamentista_familia_etapa_numero_key;", "    NULL;")]),
    ("C8 a unicidade nova não entra", [("ADD CONSTRAINT orcamentista_familia_etapa_materia_prima_numero_key UNIQUE (materia_prima_id, numero);", "ADD CONSTRAINT orcamentista_familia_etapa_materia_prima_numero_key CHECK (numero > 0);")]),
    # D. motor
    ("D1 a Wolff ganha outra categoria", [("SET categoria_chave = 'PERFIL' WHERE id", "SET categoria_chave = 'PERSIANAS' WHERE id")]),
    ("D2 o antes do motor perde a vigente", [("jsonb_build_object('orcamentista_motor', v_antes, 'migracao'", "jsonb_build_object('orcamentista_motor', v_antes - 'vigente', 'migracao'")]),
    ("D3 a vigente fica", [("ALTER TABLE public.orcamentista_motor DROP COLUMN IF EXISTS vigente;\n", "")]),
    ("D4 fornecedor continua opcional", [("ALTER TABLE public.orcamentista_motor ALTER COLUMN fornecedor_id SET NOT NULL;\n", "")]),
    ("D5 a categoria sem FK", [("IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_motor_categoria_fkey') THEN", "IF false THEN")]),
    ("D6 o preenchimento do motor repete na reaplicação", [("AND m.categoria_chave IS NULL FOR UPDATE;", " FOR UPDATE;")]),
    ("D7 a categoria continua opcional", [("ALTER TABLE public.orcamentista_motor ALTER COLUMN categoria_chave SET NOT NULL;\n", "")]),
    # E1. gravar as etapas
    ("G1 gravar não confere o autor", [(AUTOR_GRAVAR, AUTOR_GRAVAR.replace(AUTOR, "IF false THEN", 1))]),
    ("G-emp gravar não confere a empresa (a busca por (id, tenant) dá o mesmo P0002)", [(EMPRESA_GRAVAR, EMPRESA_GRAVAR.replace("IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN", "IF false THEN", 1))]),
    ("G2 gravar acha a matéria-prima de outra empresa", [("WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR SHARE;", "WHERE m.id = p_materia_prima FOR SHARE;")]),
    ("G3 família sem tipo passa", [("  IF v_familia IS NULL THEN\n    RAISE", "  IF false THEN\n    RAISE")]),
    ("G4 motor de outro tipo passa", [("IF v_mfam <> v_familia THEN", "IF false THEN")]),
    ("G5 motor arquivado passa", [("IF v_marq IS NOT NULL THEN", "IF false THEN")]),
    ("G6 gravar lê o motor sem travar", [("WHERE m.id = (e ->> 'motor_id')::uuid FOR SHARE;", "WHERE m.id = (e ->> 'motor_id')::uuid;")]),
    ("G7 gravar lê a família sem travar", [("AND m.tenant_id = p_tenant FOR SHARE;", "AND m.tenant_id = p_tenant;")]),
    ("G8 gravar sem o advisory lock", [("  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_etapas_da_materia_prima:' || coalesce(p_materia_prima::text, ''), 0));\n", "")]),
    ("G9 remover por omissão passa", [("  IF FOUND THEN\n    RAISE EXCEPTION 'a etapa % (\"%\") nao veio na lista", "  IF false THEN\n    RAISE EXCEPTION 'a etapa % (\"%\") nao veio na lista")]),
    ("G10 id de etapa de outra família passa", [("WHERE x.id = v_id AND x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant) THEN", "WHERE x.id = v_id) THEN")]),
    ("G11 a etapa nova nasce sem a empresa", [("VALUES (p_tenant, p_materia_prima, v_familia, i,", "VALUES (NULL, p_materia_prima, v_familia, i,")]),
    ("G12 o log das etapas sem a empresa", [("VALUES (p_tenant, 'orcamentista_familia_etapa', p_materia_prima::text,", "VALUES (NULL, 'orcamentista_familia_etapa', p_materia_prima::text,")]),
    ("G13 motor ausente limpa", [("motor_id = CASE WHEN e ? 'motor_id' THEN (e ->> 'motor_id')::uuid ELSE motor_id END", "motor_id = (e ->> 'motor_id')::uuid")]),
    ("G14 sem as duas fases", [("  UPDATE public.orcamentista_familia_etapa SET numero = numero + 1000000 WHERE materia_prima_id = p_materia_prima;\n", "")]),
    ("G15 as duas fases mexem em todas as famílias", [("SET numero = numero + 1000000 WHERE materia_prima_id = p_materia_prima;", "SET numero = numero + 1000000 WHERE true;")]),
    ("G16 gravar nasce aberta", [("REVOKE ALL ON FUNCTION public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;", "SELECT 1;")]),
    ("G17 a função antiga fica", [("DROP FUNCTION IF EXISTS public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb);\n", "")]),
    # E2. criar motor
    ("K1 criar não confere o autor", [(AUTOR_CRIAR, AUTOR_CRIAR.replace(AUTOR, "IF false THEN", 1))]),
    ("K2 fornecedor inexistente passa", [("IF p_fornecedor IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = p_fornecedor) THEN", "IF false THEN")]),
    ("K3 categoria fora da lista passa", [("IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_categoria) THEN", "IF false THEN")]),
    ("K4 tipo fora da lista passa", [("IF p_familia IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN", "IF false THEN")]),
    ("K5 a pasta do fornecedor não é conferida", [("IF left(v_path, length(v_prefixo)) <> v_prefixo OR position('..' in v_path) > 0 THEN", "IF false THEN")]),
    ("K6 o '..' passa", [(" OR position('..' in v_path) > 0 THEN\n    RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor'", " THEN\n    RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor'")]),
    ("K7 sem tipologia passa", [("IF jsonb_array_length(p_payload->'detalhes') = 0 THEN", "IF false THEN")]),
    ("K8 itens de preço passam", [("IF p_payload ? 'itens' AND", "IF false AND")]),
    ("K9 sem normalizados passa", [("IF (p_payload->'contagens'->>'normalizados') IS NULL THEN", "IF false THEN")]),
    ("K10 a categoria gravada é outra", [("VALUES (p_familia, p_fornecedor, p_categoria, v_nome, v_path, p_por)", "VALUES (p_familia, p_fornecedor, 'PERFIL', v_nome, v_path, p_por)")]),
    ("K11 o motor nasce sem autor", [("VALUES (p_familia, p_fornecedor, p_categoria, v_nome, v_path, p_por)", "VALUES (p_familia, p_fornecedor, p_categoria, v_nome, v_path, NULL)")]),
    ("K12 o nome não é aparado", [("v_nome          text := btrim(p_arquivo_nome);", "v_nome          text := p_arquivo_nome;")]),
    ("K13 os perfis não são gravados", [("FROM jsonb_to_recordset(p_payload->'perfis')", "FROM jsonb_to_recordset('[]'::jsonb)")]),
    ("K14 a otimização não é gravada", [("FROM jsonb_to_recordset(p_payload->'otimizacao')", "FROM jsonb_to_recordset('[]'::jsonb)")]),
    ("K15 a importação não é registrada", [("INSERT INTO public.orcamentista_importacao (motor_id, importado_por, itens, regras, tipologias, cruzam, nao_cruzam, normalizados, avisos)\n  VALUES (v_motor, p_por, 0, v_regras, v_tipologias, 0, 0, (p_payload->'contagens'->>'normalizados')::integer, p_payload->'avisos')\n  RETURNING id INTO v_importacao_id;", "v_importacao_id := NULL;")]),
    ("K16 criar não loga", [("VALUES (NULL, 'orcamentista_motor', v_motor::text, NULL,", "VALUES (NULL, 'outra_tabela', v_motor::text, NULL,")]),
    ("K17 criar aponta as etapas da família", [("  -- 2. o conteudo, por motor_id", "  UPDATE public.orcamentista_familia_etapa SET motor_id = v_motor WHERE familia = p_familia;\n  -- 2. o conteudo, por motor_id")]),
    ("K18 criar sem statement_timeout", [("SET statement_timeout = '35s'\n", "")]),
    ("K19 criar nasce aberta", [("REVOKE ALL ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;", "SELECT 1;")]),
    ("K20 a função antiga de criar fica", [("DROP FUNCTION IF EXISTS public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb);\n", "")]),
    # E3. arquivar
    ("Q1 arquivar não olha as etapas", [("  IF v_n > 0 THEN\n    SELECT x.numero", "  IF false THEN\n    SELECT x.numero")]),
    ("Q2 a recusa sem a empresa", [("coalesce(v_etapa.empresa, '(sem nome)')", "'(sem nome)'")]),
    ("Q3 a recusa sem as outras", [("CASE WHEN v_n > 1 THEN format(' (e de mais %s)', v_n - 1) ELSE '' END", "''")]),
    ("Q4 arquivar lê o motor sem travar", [("SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;", "SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_motor m WHERE m.id = p_motor;")]),
    # E4. definir o tipo
    ("F1 trocar o tipo com etapas passa", [("    IF v_n > 0 THEN\n      RAISE EXCEPTION 'a familia \"%\" tem", "    IF false THEN\n      RAISE EXCEPTION 'a familia \"%\" tem")]),
    ("F2 o mesmo tipo também é recusado", [("IF (v_antes ->> 'familia') IS DISTINCT FROM p_familia THEN", "IF true THEN")]),
    ("F3 definir acha a matéria-prima de outra empresa", [(LOOKUP_DEFINIR, "WHERE m.id = p_materia_prima FOR UPDATE;\n  IF v_antes IS NULL THEN")]),
    ("F4 definir lê sem travar", [(LOOKUP_DEFINIR, "WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant;\n  IF v_antes IS NULL THEN")]),
    ("F5 definir não loga", [("VALUES (p_tenant, 'orcamentista_materia_prima', p_materia_prima::text,\n          jsonb_build_object('orcamentista_materia_prima', v_antes),", "VALUES (p_tenant, 'outra_tabela', p_materia_prima::text,\n          jsonb_build_object('orcamentista_materia_prima', v_antes),")]),
    # E5. remover
    ("R1 o log do remover sem as etapas", [("'orcamentista_familia_etapa', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.numero)", "'orcamentista_familia_etapa', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.numero) FILTER (WHERE false)")]),
    ("R-lock remover sem o FOR UPDATE das etapas (a linha-mãe serializa)", [(FOR_UPD_ETAPAS_REM, "")]),
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

if len(sys.argv) > 1:  # só as mutações cujo nome começa com um dos argumentos
    MUTACOES = [m for m in MUTACOES if any(m[0].startswith(a + " ") for a in sys.argv[1:])]
erro = [(n, de[:60]) for n, trocas in MUTACOES for de, _ in trocas if ORIG.count(de) != 1]
if erro:
    print("TRECHO NAO ACHADO ou repetido:", erro); sys.exit(1)
c = rodar(ORIG)
print(f"CONTROLE (sem mutação): {'passa' if c == 0 else 'FALHOU exit ' + str(c)}", flush=True)
vivas = []
for nome, trocas in MUTACOES:
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
