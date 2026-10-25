#!/usr/bin/env python3
"""
HARNESS do catálogo de categorias — as MUTAÇÕES da migração 20261024000004. NÃO TOCA PRODUÇÃO.

Cada mutação estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório nunca é escrito, e
o script confere isso no fim) e roda `run.sh` sobre a cópia. A mutação tem de DERRUBAR o que está
no 4º elemento: a verificação que aborta a migração (V), ou o caso que fica vermelho (B). Uma
mutação que passa verde é um caso que não exercita o que promete (`teste-que-nao-exercita.md`).

As B tiram a verificação JUNTO com a regra: é o que prova que o CASO, sozinho, também pega — e não
só a verificação de dentro da migração.

O controle M0 não muda nada e TEM de sair verde (`instrumento-que-se-enxerga.md`).

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py V1 B1      (só estas)
Sai com 1 se alguma não derrubar, ou se o controle não sair verde.
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261024000004_categorias_persianas_e_reforco.sql')

BACKFILL = "INSERT INTO public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave)\nSELECT m.tenant_id, m.id, 'PERSIANAS'\n  FROM public.orcamentista_materia_prima m\nON CONFLICT (materia_prima_id, categoria_chave) DO NOTHING;\n\n"
VERIF3 = "  -- (3) toda matéria-prima: exatamente uma linha por chave do catálogo, e PERSIANAS com config NULL\n  SELECT string_agg(m.id::text, ', ') INTO v_mp_ruins\n    FROM public.orcamentista_materia_prima m\n   WHERE (SELECT count(*) FROM public.orcamentista_mp_categoria c WHERE c.materia_prima_id = m.id) <> (SELECT count(*) FROM public.orcamentista_categoria_catalogo)\n      OR EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo k\n                  WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_mp_categoria c WHERE c.materia_prima_id = m.id AND c.categoria_chave = k.chave))\n      OR EXISTS (SELECT 1 FROM public.orcamentista_mp_categoria c\n                  WHERE c.materia_prima_id = m.id AND c.categoria_chave = 'PERSIANAS' AND c.config IS NOT NULL);\n  IF v_mp_ruins IS NOT NULL THEN\n    RAISE EXCEPTION 'verificacao 3: materia(s)-prima(s) sem exatamente uma linha por categoria do catalogo, ou com PERSIANAS ja configurada: %. Nada foi alterado.', v_mp_ruins;\n  END IF;\n\n"
VERIF1_MD5 = "  SELECT string_agg(ordem || ' ' || chave || ' ' || rotulo, '|' ORDER BY ordem) INTO v_texto FROM public.orcamentista_categoria_catalogo;\n  IF md5(v_texto) <> '1877aa9191cb638df5ff8053fa22d5fb' THEN\n    RAISE EXCEPTION 'verificacao 1: chaves ou rotulos do catalogo diferentes do decidido (md5 %). Nada foi alterado.', md5(v_texto);\n  END IF;\n"


def pela_area_de_transferencia(texto):
    """O arquivo inteiro lido como Latin-1 e regravado como UTF-8 — o que corrompeu a 20261023000002."""
    return texto.encode('utf-8').decode('latin-1')


# (id, o que estraga, [(trecho, troca), ...] ou função, fragmento que TEM de aparecer na saída, só aplicar?
#  [, ambiente extra para o run.sh])
MUTACOES = [
    ('V1', 'sem o backfill de PERSIANAS', [(BACKFILL, "")], 'verificacao 3', False),
    ('B1', 'sem o backfill E sem a verificação 3 — o CASO tem de pegar sozinho',
     [(BACKFILL, ""), (VERIF3, "")], 'FALHOU: caso 3', False),
    ('V2', 'reordena com UPDATE direto, sem deslocar para a faixa livre',
     [("UPDATE public.orcamentista_categoria_catalogo SET ordem = ordem + 1000;\n", "")], 'duplicate key', False),
    ('V3', 'REFORCO fica com o rótulo antigo',
     [("('REFORCO',            'Reforço metálico',     3),", "('REFORCO',            'Reforço de aço',       3),")], 'verificacao 1', False),
    ('B2', 'REFORCO com o rótulo antigo E sem o md5 da verificação 1 — o CASO tem de pegar sozinho',
     [("('REFORCO',            'Reforço metálico',     3),", "('REFORCO',            'Reforço de aço',       3),"), (VERIF1_MD5, "")],
     'FALHOU: caso 1', False),
    ('V4', 'PERSIANAS e REFORCO trocados de lugar',
     [("('PERSIANAS',          'Persianas',            2),", "('PERSIANAS',          'Persianas',            3),"),
      ("('REFORCO',            'Reforço metálico',     3),", "('REFORCO',            'Reforço metálico',     2),")], 'verificacao 1', False),
    ('V5', 'o backfill grava config vazio em vez de NULL',
     [("INSERT INTO public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave)\nSELECT m.tenant_id, m.id, 'PERSIANAS'",
       "INSERT INTO public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave, config)\nSELECT m.tenant_id, m.id, 'PERSIANAS', '{}'::jsonb")],
     'verificacao 3', False),
    ('V6', 'o backfill mexe nas outras: refaz todas as categorias e zera o config',
     [(BACKFILL, "INSERT INTO public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave)\n"
                 "SELECT m.tenant_id, m.id, k.chave FROM public.orcamentista_materia_prima m CROSS JOIN public.orcamentista_categoria_catalogo k\n"
                 "ON CONFLICT (materia_prima_id, categoria_chave) DO UPDATE SET config = NULL;\n\n")], 'verificacao 4', False),
    ('V7', 'o arquivo inteiro pela área de transferência (Latin-1 → UTF-8)', pela_area_de_transferencia, 'verificacao 1', False),
    ('V8', 'um rótulo de campo volta com mojibake',
     [("-- ── 4. PERSIANAS sem campo escalar",
       "UPDATE public.orcamentista_categoria_campo SET rotulo = convert_from(convert_to(rotulo, 'UTF8'), 'LATIN1') WHERE categoria_chave = 'ACESSORIOS_VEDACAO' AND chave = 'vedacao';\n-- ── 4. PERSIANAS sem campo escalar")],
     'verificacao 2', False),
    ('V9', 'o COMMENT do catálogo continua com "As 6 categorias…"',
     [("  'As categorias de uma matéria-prima, fixas e numeradas pela coluna ordem. Da plataforma, sem tenant. Quais são e em que ordem está nas LINHAS desta tabela, não neste comentário: um número escrito aqui envelhece na próxima categoria.';",
       "  'As 6 categorias de uma matéria-prima, fixas e numeradas: 1 PERFIL, 2 REFORCO, 3 FERRAGENS, 4 ACESSORIOS_VEDACAO, 5 VIDRO, 6 INSTALACAO. Da plataforma, sem tenant.';")],
     'verificacao 1', False),
    ('V10', 'PERSIANAS ganha um campo escalar',
     [("-- ── 4. PERSIANAS sem campo escalar",
       "INSERT INTO public.orcamentista_categoria_campo (categoria_chave, chave, tipo, rotulo, ordem) VALUES ('PERSIANAS', 'modelo', 'texto', 'Modelo', 1) ON CONFLICT DO NOTHING;\n-- ── 4. PERSIANAS sem campo escalar")],
     'verificacao 5', False),
    ('V11', 'a verificação 2 volta a ser chr(195) sozinho — com um rótulo CERTO com "Ã" no banco',
     [("     WHERE rotulo ~ v_par\n    UNION ALL\n    SELECT categoria_chave || '.' || chave FROM public.orcamentista_categoria_campo\n     WHERE rotulo ~ v_par",
       "     WHERE rotulo ~ v_par\n    UNION ALL\n    SELECT categoria_chave || '.' || chave FROM public.orcamentista_categoria_campo\n     WHERE strpos(rotulo, chr(195)) > 0 OR strpos(rotulo, chr(194)) > 0")],
     'verificacao 2', False, {'TEXTO_CERTO_COM_A_TIL': '1'}),
    ('M0', 'CONTROLE: nada muda', [], None, False),
    ('M1', 'CONTROLE com um rótulo CERTO com "Ã" no banco: a migração passa', [], None, False, {'TEXTO_CERTO_COM_A_TIL': '1'}),
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
        for ident, descricao, trocas, espera, so_aplicar, *ambiente in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            open(copia, 'w', encoding='utf-8').write(mutar(original, trocas))
            env = dict(os.environ)
            if so_aplicar:
                env['SO_APLICAR'] = '1'
            env.update(ambiente[0] if ambiente else {})
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
