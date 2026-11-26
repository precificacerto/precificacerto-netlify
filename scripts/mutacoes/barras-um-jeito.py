import subprocess, sys, os
# MUTACOES do pedido 0034, item 1 (dono do produto, 26/11/2026): uma contagem so de barras, a do WVetro (regra-das-barras.ts), no agrupador do
# levantamento, no relatorio de corte e nas barras do pedido. Roda SOZINHO na arvore. SO=<trecho>. Trecho que nao aparece UMA vez aborta (3).
# 1a passada 10/12: as duas do relatorio de corte (a cor do item e as cores divergentes) ganharam teste; 12/12.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'agrupador-de-barras.test.ts', U + 'relatorio-de-corte.test.ts', U + 'barras-do-pedido.test.ts']
L = 'src/lib/atendimentos-ia/'
RB, AG, RC = L + 'regra-das-barras.ts', L + 'agrupador-de-barras.ts', L + 'relatorio-de-corte.ts'
M = [
 (RB, "            if (consumo <= resto && (melhor === -1 || resto < utilUm - abertas[melhor].ocupadoUm)) melhor = k", "            if (consumo <= resto && melhor === -1) melhor = k"),
 (RB, "        const consumo = c.um + serraUm", "        const consumo = c.um"),
 (RB, "    if (c === COR_SEM_REFILO) return 0", "    if (c === COR_SEM_REFILO) return REFILO_POR_PONTA_MM"),
 (RB, "    if (/\\bBRANCO\\b/.test(c)) return", "    if (false) return"),
 (AG, "        const utilBarraUm = barraUm - 2 * refiloUm", "        const utilBarraUm = barraUm"),
 (AG, "            if (p.um + serraUm > utilBarraUm) {", "            if (p.um > utilBarraUm) {"),
 (AG, "    if (typeof refilo !== 'number') recusas.push(", "    if (false) recusas.push("),
 (AG, "pecasUm: b.pecas.map((c) => c.um), cortes: b.pecas.length, serraUm: b.pecas.length * serraUm,", "pecasUm: b.pecas.map((c) => c.um), cortes: b.pecas.length - 1, serraUm: b.pecas.length * serraUm,"),
 (AG, "sobra_mm: paraMm(utilBarraUm - b.usadoUm) })),", "sobra_mm: paraMm(barraUm - b.usadoUm) })),"),
 (AG, "            refilo_mm: paraMm(refiloUm),", "            refilo_mm: 0,"),
 (RC, "    if (cores.length > 1) return", "    if (false) return"),
 (RC, "        cor: p0.cor,\n    })", "        cor: 'BRANCO',\n    })"),
]
M = [x for x in M if os.environ.get('SO', '') in x[1]]
for arq, a, b in M:
    n = open(R + arq).read().count(a)
    if n != 1: print('ABORTA', arq, a[:70], n); sys.exit(3)
mortas = 0
for arq, a, b in M:
    s = open(R + arq).read()
    open(R + arq, 'w').write(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', *T], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:70].replace('\n', ' ') + '  =>  ' + b[:70].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
