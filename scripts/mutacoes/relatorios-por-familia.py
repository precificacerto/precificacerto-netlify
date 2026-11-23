import subprocess, sys, os
# MUTACOES dos relatorios por familia (PR4, 23/11/2026), so do trecho novo (nivel 2). Roda SOZINHO na arvore.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/barras-do-pedido-servidor.test.ts', 'src/utils/__tests__/orientativo-de-montagem-servidor.test.ts',
     'src/utils/__tests__/relatorios-em-pdf.test.ts', 'src/utils/__tests__/atendimentos-ia-levantamentos-e-relatorios-ia-tela.test.tsx',
     'src/utils/__tests__/atendimentos-ia-precificacao-do-orcamento-tela.test.tsx', 'src/utils/__tests__/atendimentos-ia-orcamentos-ia.test.ts']
BS = 'src/lib/atendimentos-ia/barras-do-pedido-servidor.ts'
OS = 'src/lib/atendimentos-ia/orientativo-de-montagem-servidor.ts'
NS = 'src/lib/atendimentos-ia/numero-do-orcamento-servidor.ts'
OI = 'src/lib/atendimentos-ia/orcamentos-ia.ts'
RE = 'src/pages/atendimentos-ia/relatorios-ia/index.tsx'
CC = 'src/page-parts/products/content.component.tsx'
M = [
 (BS, "(dasFamilias.size === 0 || t.familiaChave === null || dasFamilias.has(t.familiaChave))", "(true)"),
 (BS, "t.familiaChave === null || dasFamilias.has(t.familiaChave)", "dasFamilias.has(t.familiaChave as string)"),
 (BS, "dasFamilias.size === 0 || t.familiaChave", "t.familiaChave"),
 (BS, "pesosNasTabelasQueValem(tenantId, codigos, [...new Set(calculados.map((i) => i.familia)", "pesosNasTabelasQueValem(tenantId, codigos, [...new Set([].map((i: { familia: string }) => i.familia)"),
 (OS, "pesosNasTabelasQueValem(tenantId, codigos, [...new Set(calculados.map((i) => i.familia).filter((f): f is string => !!f))])", "pesosNasTabelasQueValem(tenantId, codigos, ['OUTRA'])"),
 (NS, ".filter((x) => texto(x.rotulo) !== null).map((x) => [x.chave, texto(x.rotulo) as string])", ".map((x) => [x.chave, x.chave])"),
 (OI, "familia_rotulo: o.familia ? rotulos.get(o.familia) ?? o.familia : null,", "familia_rotulo: null,"),
 (RE, "numero={aberto.numero_exibido ?? aberto.numero} cliente={aberto.nome} /> : a.key === 'corte'", "numero={aberto.numero} cliente={aberto.nome} /> : a.key === 'corte'"),
 (RE, "render: (_: unknown, o: OrcamentoParaRelatorio) => o.familia_rotulo ?? '' },", "render: () => '' },"),
 (RE, "${aberto.familia_rotulo ? ` · ${aberto.familia_rotulo}` : ''}", ""),
 (CC, "    ...(tipoNoMotor === 'REVENDA' ? [] : [{", "    ...(false ? [] : [{"),
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
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:90].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
