#!/usr/bin/env python3
"""
HARNESS da árvore — as MUTAÇÕES da migração 20261023000004. NÃO TOCA PRODUÇÃO.

Cada mutação estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório nunca é escrito)
e roda `run.sh` sobre a cópia. A mutação tem de DERRUBAR o que o README diz: o bloco de
verificação (V), o de dependências (D) ou um caso nomeado (A). Uma mutação que passa verde é um
caso que não exercita o que promete (`teste-que-nao-exercita.md`).

Uso:   python3 mutacoes.py            (todas)
       python3 mutacoes.py A1 V4      (só estas)
Saída: uma linha por mutação, VERMELHO ou NAO DERRUBOU. Sai com 1 se alguma não derrubar.
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261023000004_gravar_arvore.sql')

LOCK = "  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_arvore:' || p_tenant::text, 0));\n"
ANTES = "  EXECUTE c_arvore INTO v_antes USING p_tenant;\n"
DEPOIS = "  EXECUTE c_arvore INTO v_depois USING p_tenant;\n"
CABECA = "  p_tenant uuid, p_por uuid, p_arvore jsonb\n) RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public, pg_temp\n"

# (id, o que estraga, [(trecho, troca), ...], fragmento que TEM de aparecer na saída, variáveis de ambiente)
MUTACOES = [
    ('V1', 'sem o REVOKE da oitava',
     [("REVOKE ALL ON FUNCTION public.superadmin_gravar_arvore(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;\n", "")],
     'aberta a PUBLIC/anon/authenticated', {'SO_APLICAR': '1'}),
    ('V2', 'sem SECURITY DEFINER',
     [(CABECA, CABECA.replace("SECURITY DEFINER\n", ""))],
     'sem SECURITY DEFINER ou sem search_path', {'SO_APLICAR': '1'}),
    ('V3', 'sem o search_path',
     [(CABECA, CABECA.replace("SET search_path = public, pg_temp\n", ""))],
     'sem SECURITY DEFINER ou sem search_path', {'SO_APLICAR': '1'}),
    ('V4', 'GRANT a PUBLIC com a checagem (2) cega para a oitava — só a (3) pode pegar',
     [("GRANT EXECUTE ON FUNCTION public.superadmin_gravar_arvore(uuid, uuid, jsonb) TO service_role;",
       "GRANT EXECUTE ON FUNCTION public.superadmin_gravar_arvore(uuid, uuid, jsonb) TO service_role, PUBLIC;"),
      ("    IF has_function_privilege('public', f, 'EXECUTE')\n       OR has_function_privilege('anon', f, 'EXECUTE')\n       OR has_function_privilege('authenticated', f, 'EXECUTE')\n",
       "    IF has_function_privilege('anon', f, 'EXECUTE') AND a <> 'public.superadmin_gravar_arvore(uuid, uuid, jsonb)'\n")],
     'EXECUTE herdavel por PUBLIC', {'SO_APLICAR': '1'}),
    ('D1', 'sem o bloco de dependências, num banco sem as sete',
     [("  IF faltam IS NOT NULL THEN\n    RAISE EXCEPTION 'dependencia(s) ausente(s)", "  IF false THEN\n    RAISE EXCEPTION 'dependencia(s) ausente(s)")],
     'FALHOU: sem as sete, a migração abortou FORA da guarda', {'SEM_AS_SETE': '1'}),
    ('A1', 'sem o lock do tenant',
     [(LOCK, "")],
     'FALHOU: concorrencia C1', {}),
    ('A2', 'o lock do tenant DEPOIS de ler o antes',
     [(LOCK + ANTES, ANTES + LOCK)],
     'FALHOU: concorrencia C1', {}),
    ('A3', 'relança sem o ERRCODE da função interna',
     [("RAISE EXCEPTION '%: %', v_caminho, v_msg USING ERRCODE = v_estado;", "RAISE EXCEPTION '%: %', v_caminho, v_msg;")],
     'recusado com P0001 e nao 23503', {}),
    ('A4', 'relança sem o caminho',
     [("RAISE EXCEPTION '%: %', v_caminho, v_msg USING ERRCODE = v_estado;", "RAISE EXCEPTION '%', v_msg USING ERRCODE = v_estado;")],
     'a mensagem nao traz "materia-prima Aço, categoria PERFIL, fornecedores', {}),
    ('A5', 'ENGOLE o erro da função interna (avisa e segue)',
     [("RAISE EXCEPTION '%: %', v_caminho, v_msg USING ERRCODE = v_estado;", "RAISE NOTICE '%: %', v_caminho, v_msg;")],
     'FALHOU: atomicidade', {}),
    ('A6', 'sem a linha de resumo',
     [("  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n  VALUES (p_tenant, 'arvore', p_tenant::text, v_antes, v_depois, p_por);\n", "")],
     'FALHOU: arvore completa', {}),
    ('A7', 'o antes do resumo lido DEPOIS das chamadas',
     [(ANTES, ""), (DEPOIS, DEPOIS + ANTES)],
     "o antes do resumo nao e a arvore de ANTES", {}),
    ('A8', 'o resumo sem a tabela de vidros',
     [("      'orcamentista_mp_vidro', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.mp_categoria_id, v.ordem)\n                                           FROM public.orcamentista_mp_vidro v WHERE v.tenant_id = $1), '[]'::jsonb),\n", "")],
     'o resumo nao tem as seis tabelas', {}),
    ('A9', 'fornecedores AUSENTE no PERFIL vira lista vazia',
     [("          IF v_cat ? 'fornecedores' THEN\n            v_caminho := v_base || ', fornecedores';\n            PERFORM public.superadmin_gravar_mp_fornecedores(p_tenant, p_por, v_cat_id, v_cat -> 'fornecedores');",
       "          IF v_cat ? 'fornecedores' OR v_chave = 'PERFIL' THEN\n            v_caminho := v_base || ', fornecedores';\n            PERFORM public.superadmin_gravar_mp_fornecedores(p_tenant, p_por, v_cat_id, coalesce(v_cat -> 'fornecedores', '[]'::jsonb));")],
     'uma lista AUSENTE foi tocada', {}),
    ('A10', 'lista VAZIA de vidros não chama a função (não esvazia)',
     [("          IF v_cat ? 'vidros' THEN", "          IF v_cat ? 'vidros' AND jsonb_array_length(v_cat -> 'vidros') > 0 THEN")],
     'sobraram vidros', {}),
    ('A11', 'sem recusar remover e gravar a mesma matéria-prima',
     [("  IF v_fora IS NOT NULL THEN\n    RAISE EXCEPTION 'materia-prima em remover e em materias_primas", "  IF false THEN\n    RAISE EXCEPTION 'materia-prima em remover e em materias_primas")],
     'remover e gravar a MESMA materia-prima no mesmo salvar — ACEITO', {}),
    ('A12', 'remover por DELETE direto, sem a função 7',
     [("PERFORM public.superadmin_remover_materia_prima(p_tenant, p_por, v_rem::uuid);",
       "DELETE FROM public.orcamentista_materia_prima WHERE id = v_rem::uuid AND tenant_id = p_tenant;")],
     'FALHOU: remover', {}),
    ('A13', 'campo desconhecido no topo aceito',
     [("FROM jsonb_object_keys(p_arvore) k WHERE k NOT IN ('materias_primas', 'remover');", "FROM jsonb_object_keys(p_arvore) k WHERE false;")],
     'campo desconhecido no topo', {}),
    ('A14', 'campo desconhecido na categoria aceito',
     [("   WHERE k NOT IN ('categoria_chave', 'config', 'fornecedores', 'vidros', 'ferragens', 'instalacao');", "   WHERE false;")],
     'campo desconhecido na categoria — ACEITO', {}),
    ('A15', 'categoria fora do catálogo não recusada na frente',
     [("   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo k WHERE k.chave = c ->> 'categoria_chave');", "   WHERE false;")],
     'categoria fora do catalogo — recusado com P0002 e nao 22023', {}),
    ('A16', 'sem conferir o super admin na oitava',
     [("  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN\n    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';\n  END IF;\n", "")],
     'a mensagem nao e exatamente "o autor da alteracao nao e super admin"', {}),
    ('A17', 'sem conferir a empresa na oitava',
     [("  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN\n    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';\n  END IF;\n", "")],
     'empresa inexistente — a mensagem das sete, SEM caminho', {}),
    ('A18', 'categoria repetida aceita',
     [("     AND (SELECT count(*) <> count(DISTINCT c ->> 'categoria_chave') FROM jsonb_array_elements(e -> 'categorias') c);", "     AND false;")],
     'categoria repetida na mesma materia-prima — ACEITO', {}),
    ('A19', 'id repetido em remover aceito',
     [("  IF (SELECT count(*) <> count(DISTINCT lower(e #>> '{}'))", "  IF false AND (SELECT count(*) <> count(DISTINCT lower(e #>> '{}'))")],
     'remover com id repetido', {}),
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
        for ident, descricao, trocas, espera, variaveis in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            open(copia, 'w', encoding='utf-8').write(mutar(original, trocas))
            env = dict(os.environ, **variaveis)
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
