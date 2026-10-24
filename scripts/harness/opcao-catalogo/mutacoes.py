#!/usr/bin/env python3
"""
HARNESS da opção no catálogo — as MUTAÇÕES da migração 20261024000002. NÃO TOCA PRODUÇÃO.

Cada mutação estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório nunca é escrito, e
o script confere isso no fim) e roda `run.sh` sobre a cópia. A mutação tem de DERRUBAR o que o
README diz: o bloco de verificação (V, a migração aborta) ou um caso nomeado (B). Uma mutação que
passa verde é um caso que não exercita o que promete (`teste-que-nao-exercita.md`).

O controle M0 não muda nada e TEM de sair verde: prova que o detector não é vermelho por
construção (`instrumento-que-se-enxerga.md`, a fixture do alvo ausente).

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py V10 B2     (só estas)
Saída: uma linha por mutação, VERMELHO ou NAO DERRUBOU (e, no controle, VERDE ou VERMELHO(!)).
Sai com 1 se alguma não derrubar, ou se o controle não sair verde.
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261024000002_opcao_no_catalogo_e_criterio_da_barra.sql')

CABECA = "  p_tenant uuid, p_por uuid, p_materia_prima uuid, p_categoria text, p_corpo jsonb\n) RETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public, pg_temp\n"
COERENCIA = "  CHECK ((tipo = 'opcao') = (opcoes IS NOT NULL)\n"
RAMO = "           WHEN 'opcao'       THEN jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') = ANY (c.opcoes)\n"
FORMATO = ("  SELECT string_agg(format('%s (esperado %s)', e.key,\n"
           "                         CASE WHEN c.tipo = 'opcao' THEN 'um de: ' || array_to_string(c.opcoes, ', ') ELSE c.tipo END),\n"
           "                  ', ' ORDER BY e.key) INTO v_fora\n")


def pela_area_de_transferencia(texto):
    """O arquivo inteiro lido como Latin-1 e regravado como UTF-8 — o que corrompeu a 20261023000002."""
    return texto.encode('utf-8').decode('latin-1')


# (id, o que estraga, [(trecho, troca), ...] ou função, fragmento que TEM de aparecer na saída, só aplicar?)
MUTACOES = [
    ('V1', 'sem o REVOKE da função das opções (nova: nasce com os DEFAULT PRIVILEGES do Supabase)',
     [("REVOKE ALL ON FUNCTION public.orcamentista_opcoes_validas(text[]) FROM PUBLIC, anon, authenticated;\n", "")],
     'verificacao 4: public.orcamentista_opcoes_validas(text[]) aberta', True),
    ('V2', 'a função de gravar aberta a anon',
     [("GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) TO service_role;",
       "GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) TO service_role, anon;")],
     'verificacao 4: public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) aberta', True),
    ('V3', 'a função de gravar sem SECURITY DEFINER',
     [(CABECA, CABECA.replace("SECURITY DEFINER\n", ""))],
     'sem SECURITY DEFINER ou sem search_path fixo', True),
    ('V4', 'a função de gravar sem o search_path',
     [(CABECA, CABECA.replace("SET search_path = public, pg_temp\n", ""))],
     'sem SECURITY DEFINER ou sem search_path fixo', True),
    ('V5', 'sem o UPDATE de um rótulo (REFORCO)',
     [("UPDATE public.orcamentista_categoria_catalogo SET rotulo = 'Reforço de aço' WHERE chave = 'REFORCO';\n", "")],
     'verificacao 3: ainda ha "Ã" ou "Â" em: rotulo REFORCO', True),
    ('V6', 'sem o COMMENT de uma das 3 tabelas fora das 8 (esquadrias_padrao)',
     [("COMMENT ON TABLE public.orcamentista_esquadrias_padrao IS\n  'legado: substituída pelo modelo de três níveis em 20261023000002';\n", "")],
     'verificacao 3: ainda ha "Ã" ou "Â" em: COMMENT orcamentista_esquadrias_padrao', True),
    ('V7', 'rótulo "consertado" SEM acento — sem "Ã", só o md5 pega',
     [("SET rotulo = 'Reforço de aço' WHERE chave = 'REFORCO';", "SET rotulo = 'Reforco de aco' WHERE chave = 'REFORCO';")],
     'md5 nao bate) em: rotulo REFORCO', True),
    ('V8', 'COMMENT com texto diferente e sem "Ã" — só o md5 pega',
     [("  'Uma linha por vidro que se compra. Só pendura em categoria VIDRO (FK composta com categoria_chave).';",
       "  'Uma linha por vidro que se compra.';")],
     'md5 nao bate) em: COMMENT orcamentista_mp_vidro', True),
    ('V9', 'O ARQUIVO INTEIRO PELA ÁREA DE TRANSFERÊNCIA (UTF-8 lido como Latin-1)',
     pela_area_de_transferencia,
     'verificacao 3: ainda ha', True),
    ('V10', 'as opções na ordem trocada',
     [("ARRAY['BARRA_INTEIRA', 'CONSUMO_REAL'])\nON CONFLICT", "ARRAY['CONSUMO_REAL', 'BARRA_INTEIRA'])\nON CONFLICT")],
     'verificacao 2: criterio_custo_barra', True),
    ('V11', "o CHECK de tipo sem 'opcao'",
     [("'lista_texto', 'mapa', 'opcao'));", "'lista_texto', 'mapa'));")],
     'orcamentista_categoria_campo_tipo_valido', True),
    ('V12', 'sem o CHECK de coerência',
     [("ALTER TABLE public.orcamentista_categoria_campo ADD CONSTRAINT orcamentista_categoria_campo_opcoes_coerentes\n", "SELECT 1 WHERE false AND\n"),
      ("  CHECK ((tipo = 'opcao') = (opcoes IS NOT NULL)\n         AND (opcoes IS NULL OR public.orcamentista_opcoes_validas(opcoes)));",
       "  ((true));")],
     'verificacao 1: o CHECK de coerencia', True),
    ('B1', "o ramo 'opcao' só confere que é string — não que pertence à lista",
     [(RAMO, "           WHEN 'opcao'       THEN jsonb_typeof(e.value) = 'string'\n")],
     'FALHOU: QUALQUER_COISA — recusado, e a mensagem diz a chave e os valores aceitos — ACEITO', False),
    ('B2', "o ramo 'opcao' só confere a lista — não que é string",
     [(RAMO, "           WHEN 'opcao'       THEN (e.value #>> '{}') = ANY (c.opcoes)\n")],
     'FALHOU: numero 1 onde a opcao e a STRING "1"', False),
    ('B3', "sem o ramo 'opcao' (cai no ELSE false)",
     [(RAMO, "")],
     'ERRO NAO PREVISTO: valor(es) com tipo errado em PERFIL: criterio_custo_barra', False),
    ('B4', 'a mensagem sem os valores aceitos (a descrição de antes)',
     [(FORMATO, "  SELECT string_agg(format('%s (esperado %s)', e.key, c.tipo), ', ' ORDER BY e.key) INTO v_fora\n")],
     'a mensagem nao traz "criterio_custo_barra (esperado um de: BARRA_INTEIRA, CONSUMO_REAL)"', False),
    ('B5', 'a lista aceita REPETIDOS',
     [("     AND cardinality(p_opcoes) = (SELECT count(*) FROM (SELECT DISTINCT v FROM unnest(p_opcoes) v) d)\n", "")],
     'FALHOU: CHECK — opcao com valor REPETIDO — ACEITO', False),
    ('B6', 'a lista aceita valor SÓ DE ESPAÇOS (compara sem btrim)',
     [("WHERE v IS NULL OR btrim(v) = '')", "WHERE v IS NULL OR v = '')")],
     'FALHOU: CHECK — opcao com valor SO DE ESPACOS — ACEITO', False),
    ('B7', 'a lista aceita valor VAZIO',
     [("WHERE v IS NULL OR btrim(v) = '')", "WHERE v IS NULL)")],
     'FALHOU: CHECK — opcao com valor VAZIO — ACEITO', False),
    ('B8', 'a lista aceita UM valor só',
     [("     AND cardinality(p_opcoes) >= 2\n", "     AND cardinality(p_opcoes) >= 1\n")],
     'FALHOU: CHECK — opcao com UM valor so — ACEITO', False),
    ('B9', 'a lista aceita NULL no meio',
     [("WHERE v IS NULL OR btrim(v) = '')", "WHERE btrim(v) = '')")],
     'FALHOU: CHECK — opcao com valor NULL — ACEITO', False),
    ('B10', "a coerência sem a metade 'tipo <> opcao ⇒ opcoes NULL'",
     [(COERENCIA, "  CHECK ((tipo <> 'opcao' OR opcoes IS NOT NULL)\n")],
     'FALHOU: CHECK — texto COM opcoes — ACEITO', False),
    ('B11', "a coerência sem a metade 'opcao ⇒ opcoes NOT NULL'",
     [(COERENCIA, "  CHECK ((tipo = 'opcao' OR opcoes IS NULL)\n")],
     'FALHOU: CHECK — opcao SEM opcoes — ACEITO', False),
    ('B12', 'COM valor padrão: preenche BARRA_INTEIRA no PERFIL de quem já existia',
     [("ON CONFLICT (categoria_chave, chave) DO NOTHING;\n\n",
       "ON CONFLICT (categoria_chave, chave) DO NOTHING;\n"
       "UPDATE public.orcamentista_mp_categoria SET config = coalesce(config, '{}'::jsonb) || '{\"criterio_custo_barra\":\"BARRA_INTEIRA\"}'\n"
       " WHERE categoria_chave = 'PERFIL' AND NOT (coalesce(config, '{}'::jsonb) ? 'criterio_custo_barra');\n\n")],
     'FALHOU: sem padrao', False),
    ('B13', 'null deixa de passar (é o limpar)',
     [("   WHERE jsonb_typeof(e.value) <> 'null'\n     AND NOT CASE c.tipo", "   WHERE NOT CASE c.tipo")],
     'FALHOU: null foi recusado', False),
    ('B14', 'o ausente mexe: o config SUBSTITUI em vez de merge',
     [("coalesce(v_config, '{}'::jsonb) || p_corpo, p_por, now())", "p_corpo, p_por, now())")],
     'FALHOU: ausente mexeu no criterio', False),
    ('M0', 'CONTROLE: nada muda', [], None, False),
]


def mutar(texto, trocas):
    if callable(trocas):
        novo = trocas(texto)
        if novo == texto:
            raise SystemExit('a transformação não mudou nada — a mutação não exercitaria o que promete')
        return novo
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
            if espera is None:   # o controle
                ok = p.returncode == 0
                falhas += 0 if ok else 1
                print(f"{'VERDE        ' if ok else 'VERMELHO(!)  '} {ident:4} {descricao}  [{saida.strip().splitlines()[-1]}]")
                continue
            derrubou = p.returncode != 0 and espera in saida
            falhas += 0 if derrubou else 1
            linha = next((l for l in saida.splitlines() if espera in l), '')
            print(f"{'VERMELHO     ' if derrubou else 'NAO DERRUBOU '} {ident:4} {descricao}")
            print('      caiu: ' + linha.strip()[:200] if derrubou else '      esperado na saída: ' + espera)
            if not derrubou:
                print('      ' + '\n      '.join(l for l in saida.splitlines() if 'FALHOU' in l or 'ERRO' in l or 'casos ok' in l or 'ABORTOU' in l))
    if open(MIG, encoding='utf-8').read() != original:
        raise SystemExit('o arquivo da migração foi alterado durante as mutações — isto não deveria acontecer')
    print(f'{falhas} mutação(ões) que NÃO fizeram o que deviam')
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
