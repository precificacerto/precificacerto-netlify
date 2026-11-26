import subprocess, sys, os
# MUTACOES do pedido 0036 (dono do produto, 26/11/2026): o preco acha a peca EXATAMENTE, sem o codigo + cor e sem o desempate do nome tecnico.
# Roda SOZINHO na arvore. SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA vez aborta (codigo 3).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'resolucao-de-referencia.test.ts', U + 'levantamento-de-barras.test.ts', U + 'referencia-do-perfil.test.ts', U + 'levantamento-da-conversa.test.ts']
F = 'src/lib/atendimentos-ia/resolucao-de-referencia.ts'
AMB = "        return falta(ref, 'AMBIGUA', passam.map((item) => ({ item, porque: `${passam.length} itens no mesmo degrau (${ROTULO_DO_COMO[como]}): nenhum é escolhido` })))"
M = [
 (F, AMB, "        return { achada: true, como, item: passam[0] }"),
 (F, AMB, "        { const n = passam.filter((i) => nomeTecnicoNaDescricao(nome, i.descricao).noInicio); if (n.length === 1) return { achada: true, como, item: n[0] } }\n" + AMB),
 (F, "        const doDegrau = d.candidatas", "        const ancorados = como === 'nome_tecnico' ? d.candidatas.filter((i) => nomeTecnicoNaDescricao(nome, i.descricao).noInicio) : []\n        const doDegrau = ancorados.length ? ancorados : d.candidatas"),
 (F, "export const COMO_ACHOU: readonly DegrauDaEscada[] = ['ponte', 'exato', 'nome_tecnico']", "export const COMO_ACHOU: readonly DegrauDaEscada[] = ['ponte', 'exato', 'cor' as DegrauDaEscada, 'nome_tecnico']"),
 (F, "nem pelo código, nem pelo nome técnico na descrição`", "nem pelo código, nem pela cor, nem pelo nome técnico na descrição`"),
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
