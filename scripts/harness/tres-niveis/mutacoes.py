#!/usr/bin/env python3
"""
HARNESS dos três níveis — as 23 MUTAÇÕES da migração 20261023000003. NÃO TOCA PRODUÇÃO.

Cada mutação estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório nunca é escrito)
e roda `run.sh` sobre a cópia. A mutação tem de DERRUBAR o que o README diz: o bloco de
verificação (V1 a V4, a migração aborta) ou um caso nomeado (B1 a B19). Uma mutação que passa
verde é um caso que não exercita o que promete (`teste-que-nao-exercita.md`).

Uso:   python3 mutacoes.py            (todas)
       python3 mutacoes.py B9 V4      (só estas)
Saída: uma linha por mutação, VERMELHO ou NAO DERRUBOU. Sai com 1 se alguma não derrubar.
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261023000003_funcoes_dos_tres_niveis.sql')

DELETE_DO_REMOVER = "  DELETE FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant;\n"

# (id, o que estraga, [(trecho, troca), ...], fragmento que TEM de aparecer na saída, só aplicar?)
MUTACOES = [
    ('V1', 'sem o REVOKE de uma função',
     [("REVOKE ALL ON FUNCTION public.superadmin_gravar_mp_vidros(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;\n", "")],
     'aberta a PUBLIC/anon/authenticated', True),
    ('V2', 'sem SECURITY DEFINER numa função',
     [("  p_tenant uuid, p_por uuid, p_materia_prima uuid\n) RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\n",
       "  p_tenant uuid, p_por uuid, p_materia_prima uuid\n) RETURNS jsonb\nLANGUAGE plpgsql\n")],
     'sem SECURITY DEFINER ou sem search_path', True),
    ('V3', 'sem o search_path numa função',
     [("  p_tenant uuid, p_por uuid, p_materia_prima uuid, p_categoria text, p_corpo jsonb\n) RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public, pg_temp\n",
       "  p_tenant uuid, p_por uuid, p_materia_prima uuid, p_categoria text, p_corpo jsonb\n) RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\n")],
     'sem SECURITY DEFINER ou sem search_path', True),
    ('V4', 'GRANT a PUBLIC com a checagem (2) cega para PUBLIC/authenticated — só a (3) pode pegar',
     [("GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_ferragens(uuid, uuid, uuid, jsonb) TO service_role;",
       "GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_ferragens(uuid, uuid, uuid, jsonb) TO service_role, PUBLIC;"),
      ("    IF has_function_privilege('public', f, 'EXECUTE')\n       OR has_function_privilege('anon', f, 'EXECUTE')\n       OR has_function_privilege('authenticated', f, 'EXECUTE')\n",
       "    IF has_function_privilege('anon', f, 'EXECUTE') AND a <> 'public.superadmin_gravar_mp_ferragens(uuid, uuid, uuid, jsonb)'\n")],
     'EXECUTE herdavel por PUBLIC', True),
    ('B1', 'a função 1 APAGA a matéria-prima que não veio',
     [("  FOR v_item, v_pos IN SELECT e, o FROM jsonb_array_elements(p_lista) WITH ORDINALITY x(e, o) LOOP\n    SELECT to_jsonb(x) INTO v_linha FROM public.orcamentista_materia_prima x",
       "  DELETE FROM public.orcamentista_materia_prima x WHERE x.tenant_id = p_tenant AND lower(x.nome) <> ALL (ARRAY(SELECT lower(e ->> 'nome') FROM jsonb_array_elements(p_lista) e));\n"
       "  FOR v_item, v_pos IN SELECT e, o FROM jsonb_array_elements(p_lista) WITH ORDINALITY x(e, o) LOOP\n    SELECT to_jsonb(x) INTO v_linha FROM public.orcamentista_materia_prima x")],
     'APAGOU a materia-prima que nao veio', False),
    ('B2', 'a ordem não vem da posição',
     [("|| jsonb_build_object('id', v_id, 'tenant_id', p_tenant, 'ordem', v_pos,", "|| jsonb_build_object('id', v_id, 'tenant_id', p_tenant, 'ordem', 1,")],
     'ordem nao e a posicao', False),
    ('B3', 'matéria-prima nova sem as 6 categorias',
     [("      SELECT p_tenant, v_id, k.chave, p_por FROM public.orcamentista_categoria_catalogo k ORDER BY k.ordem",
       "      SELECT p_tenant, v_id, k.chave, p_por FROM public.orcamentista_categoria_catalogo k WHERE false")],
     'nao criou as 6 categorias', False),
    ('B4', 'a categoria SUBSTITUI o config em vez de merge',
     [("coalesce(v_config, '{}'::jsonb) || p_corpo, p_por, now())", "p_corpo, p_por, now())")],
     'merge perdeu a chave ausente', False),
    ('B5', 'inteiro sem conferir a parte fracionária',
     [("THEN (e.value #>> '{}')::numeric = trunc((e.value #>> '{}')::numeric)", "THEN true")],
     'inteiro fracionario (barra_mm 6000.5) — ACEITO', False),
    ('B6', 'chave fora do catálogo aceita',
     [("   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo c WHERE c.categoria_chave = p_categoria AND c.chave = k);", "   WHERE false;")],
     'chave fora do catalogo da categoria — ACEITO', False),
    ('B7', 'a categoria não confere o tenant da matéria-prima',
     [("PERFORM 1 FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;",
       "PERFORM 1 FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima FOR UPDATE;")],
     'materia-prima de OUTRA empresa — ACEITO', False),
    ('B8', 'só recusa principal > 1 (zero passa)',
     [("IF jsonb_array_length(v_novos) > 0 AND v_n <> 1 THEN", "IF v_n > 1 THEN")],
     'ZERO principal — ACEITO', False),
    ('B9', 'sem zerar os principais antes do upsert',
     [("  UPDATE public.orcamentista_mp_categoria_fornecedor x SET principal = false\n   WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant AND x.principal;\n", "")],
     'orcamentista_mp_categoria_fornecedor_um_principal', False),
    ('B10', 'principal ausente vira false',
     [("'principal', coalesce(v_item -> 'principal', v_linha -> 'principal', 'false'::jsonb))", "'principal', coalesce(v_item -> 'principal', 'false'::jsonb))")],
     'tem 0 principal(is)', False),
    ('B11', 'sem conferir o nicho do fornecedor',
     [("     WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = (e ->> 'fornecedor_id')::uuid AND f.nicho_id = v_nicho);",
       "     WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = (e ->> 'fornecedor_id')::uuid);")],
     'fornecedor de OUTRO nicho — ACEITO', False),
    ('B12', 'onde_predomina ausente vira lista vazia',
     [("'mp_categoria_id', p_mp_categoria, 'categoria_chave', 'VIDRO', 'ordem', v_pos);",
       "'mp_categoria_id', p_mp_categoria, 'categoria_chave', 'VIDRO', 'ordem', v_pos) || jsonb_build_object('onde_predomina', coalesce(v_item -> 'onde_predomina', '[]'::jsonb));")],
     'Bronze={}', False),
    ('B13', 'vidro sem conferir que a categoria é VIDRO (a FK composta segura, a mensagem nomeada some)',
     [("  IF v_categoria <> 'VIDRO' THEN", "  IF false THEN")],
     'recusado com 23503 e nao 22023', False),
    ('B14', 'usa ausente vira false',
     [("'mp_categoria_id', p_mp_categoria, 'categoria_chave', 'INSTALACAO');",
       "'mp_categoria_id', p_mp_categoria, 'categoria_chave', 'INSTALACAO') || jsonb_build_object('usa', coalesce(v_item -> 'usa', 'false'::jsonb));")],
     'usa colapsou no round-trip', False),
    ('B15', 'remover lê o antes DEPOIS do DELETE',
     [(DELETE_DO_REMOVER, ""),
      ("  -- o ANTES completo: depois do CASCADE", DELETE_DO_REMOVER + "  -- o ANTES completo: depois do CASCADE")],
     'o antes nao tem a arvore inteira', False),
    ('B16', 'remover loga só a matéria-prima, sem as categorias',
     [("    'orcamentista_mp_categoria', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.categoria_chave)\n                                             FROM public.orcamentista_mp_categoria c WHERE c.id = ANY (v_cats)), '[]'::jsonb),\n", "")],
     'o antes nao tem a arvore inteira', False),
    ('B17', 'a função de vidros não loga',
     [("  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n  VALUES (p_tenant, 'orcamentista_mp_vidro', p_mp_categoria::text,",
       "  PERFORM (p_tenant, 'orcamentista_mp_vidro', p_mp_categoria::text,")],
     'a gravacao passou com o log falhando', False),
    ('B18', 'sem conferir o super admin na função 1',
     [("AS $fn$\nDECLARE\n  v_antes   jsonb;\n  v_depois  jsonb;\n  v_item    jsonb;\n  v_pos     bigint;\n  v_linha   jsonb;\n  v_id      uuid;\n  v_fora    text;\n  v_set     text;\n  v_criou   boolean := false;\nBEGIN\n  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n",
       "AS $fn$\nDECLARE\n  v_antes   jsonb;\n  v_depois  jsonb;\n  v_item    jsonb;\n  v_pos     bigint;\n  v_linha   jsonb;\n  v_id      uuid;\n  v_fora    text;\n  v_set     text;\n  v_criou   boolean := false;\nBEGIN\n")],
     'materia-prima: autor que nao e super admin — ACEITO', False),
    ('B19', 'sem o advisory lock na função 1',
     [("  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_materia_prima:' || p_tenant::text, 0));\n", "")],
     'concorrencia: o antes da segunda gravacao nao viu a primeira', False),
]


def mutar(texto, trocas):
    for velho, novo in trocas:
        n = texto.count(velho)
        if n != 1:
            raise SystemExit(f'o trecho a mutar aparece {n} vez(es) — a migração mudou e a mutação precisa ser revista: {velho[:80]!r}')
        texto = texto.replace(velho, novo)
    return texto


def main():
    pedidas = set(sys.argv[1:])
    original = open(MIG, encoding='utf-8').read()
    falhas = 0
    with tempfile.TemporaryDirectory() as tmp:
        copia = os.path.join(tmp, 'mutada.sql')
        for ident, descricao, trocas, espera, so_aplicar in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            open(copia, 'w', encoding='utf-8').write(mutar(original, trocas))
            env = dict(os.environ)
            if so_aplicar:
                env['SO_APLICAR'] = '1'
            p = subprocess.run(['bash', os.path.join(AQUI, 'run.sh'), copia], capture_output=True, text=True, env=env)
            saida = p.stdout + p.stderr
            derrubou = p.returncode != 0 and espera in saida
            falhas += 0 if derrubou else 1
            print(f"{'VERMELHO     ' if derrubou else 'NAO DERRUBOU '} {ident:4} {descricao}")
            if not derrubou:
                print('    esperado na saída:', espera)
                print('    ' + '\n    '.join(l for l in saida.splitlines() if 'FALHOU' in l or 'ERRO' in l or 'casos ok' in l or 'ABORTOU' in l))
    if open(MIG, encoding='utf-8').read() != original:
        raise SystemExit('o arquivo da migração foi alterado durante as mutações — isto não deveria acontecer')
    print(f'{falhas} mutação(ões) que NÃO derrubaram o que deviam')
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
