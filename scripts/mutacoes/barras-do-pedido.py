import subprocess, sys, os
# MUTACOES das barras do pedido (22/11/2026). Roda SOZINHO na arvore.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/barras-do-pedido.test.ts', 'src/utils/__tests__/barras-do-pedido-servidor.test.ts', 'src/utils/__tests__/relatorios-em-pdf.test.ts']
B = 'src/lib/atendimentos-ia/barras-do-pedido.ts'
S = 'src/lib/atendimentos-ia/barras-do-pedido-servidor.ts'
M = [
 (B, "if (consumo <= resto && (melhor === -1 || resto < utilUm - abertas[melhor].ocupadoUm)) melhor = k", "if (consumo <= resto && melhor === -1) melhor = k"),
 (B, "if (consumo <= resto && (melhor === -1 || resto < utilUm - abertas[melhor].ocupadoUm)) melhor = k", "if (consumo <= resto && (melhor === -1 || resto <= utilUm - abertas[melhor].ocupadoUm)) melhor = k"),
 (B, "        const consumo = c.um + serraUm\n", "        const consumo = c.um\n"),
 (B, "const utilUm = paraUm(barra_mm) - 2 * paraUm(refilo_mm)", "const utilUm = paraUm(barra_mm) - paraUm(refilo_mm)"),
 (B, "(normalizarCor(cor).includes(COR_COM_REFILO) ? REFILO_POR_PONTA_MM : 0)", "(normalizarCor(cor).includes('MADEIRA') ? REFILO_POR_PONTA_MM : 0)"),
 (B, "cortes.sort((a, b) => b.um - a.um ||", "cortes.sort((a, b) => a.um - b.um ||"),
 (B, "const maior = cortes.find((c) => c.um + serraUm > utilUm)", "const maior = cortes.find((c) => c.um > utilUm)"),
 (B, "if (barras.length > 1) return", "if (false) return"),
 (B, "if (serras.length > 1) return", "if (false) return"),
 (B, "const chave = `${p.codigo}\\u0000${normalizarCor(p.cor)}`", "const chave = p.codigo"),
 (B, "peso_bruto_kg: peso === null ? null : metros_comprados * peso,", "peso_bruto_kg: peso === null ? null : metros_uteis * peso,"),
 (B, "aproveitamento_pct: (pecasUm / compradoUm) * 100,", "aproveitamento_pct: (pecasUm / (pecasUm + 1)) * 100,"),
 (B, "const todosComPeso = perfis.length > 0 && perfis.every((p) => p.peso_kg_m !== null)", "const todosComPeso = perfis.length > 0"),
 (B, "aproveitamento_pct: compradosUm === 0 ? null :", "aproveitamento_pct: compradosUm === 0 ? 0 :"),
 (B, "        if (numeroOuNulo(l.medida_barra_m) === null || peso === null || !(peso > 0)) continue", "        if (peso === null || !(peso > 0)) continue"),
 (B, ".filter(([, s]) => s.size === 1)", ".filter(([, s]) => s.size >= 1)"),
 (B, "serra_mm: paraMm(b.fracoes.length * serraUm),", "serra_mm: paraMm((b.fracoes.length - 1) * serraUm),"),
 (S, "const ids = tabelas.filter((t) => t.vale).map((t) => t.tabelaId)", "const ids = tabelas.map((t) => t.tabelaId)"),
 (S, "        cor: doItem.get(x.orcamento_item_id)?.cor_perfil ?? null,", "        cor: null,"),
]
mortas = 0
for arq, a, b in M:
    s = open(R + arq).read()
    if s.count(a) != 1: print('ABORTA', arq, a[:70], s.count(a)); sys.exit(3)
    open(R + arq, 'w').write(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', *T], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:90].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
