import subprocess, sys, os
# MUTACOES do pedido 0035 (dono do produto, 26/11/2026): "com um modulo", todas as perguntas de uma vez, e o fecho do "arquivo nao mudou".
# Roda SOZINHO na arvore. SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA vez aborta (codigo 3).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'descricao-para-o-vendedor.test.ts', U + 'quantidade-de-modulos.test.ts', U + 'atendimentos-ia-levantamento-por-nome.test.ts']
D = 'src/lib/atendimentos-ia/descricao-para-o-vendedor.ts'
C = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
M = [
 (D, "    const umModuloSo = sentidos.length > 0 && sentidos.every((q) => q === 1)", "    const umModuloSo = false"),
 (D, "    const umModuloSo = sentidos.length > 0 && sentidos.every((q) => q === 1)", "    const umModuloSo = sentidos.some((q) => q === 1)"),
 (D, "    const umModuloSo = sentidos.length > 0 && sentidos.every((q) => q === 1)", "    const umModuloSo = sentidos.every((q) => q === 1 || q === null)"),
 (D, "umModuloSo ? ' com um módulo' : ''", "umModuloSo ? ' com 01 módulo horizontal' : ''"),
 (D, ".filter((q): q is QuantidadeDeModulos => q !== null).map(quantidade)", ".map(quantidade)"),
 (C, "        const faltaVendedor = !vendedorPendente && vendedorDoLevantamento === null", "        const faltaVendedor = !pendencia && !vendedorPendente && vendedorDoLevantamento === null"),
 (C, "        if (!vendedorPendente && !faltaVendedor) {", "        if (!pendencia && !vendedorPendente && !faltaVendedor) {"),
 (C, "            if (!pendencia) congelar = r.doCadastro", "            congelar = r.doCadastro"),
 (C, "        const comAsDoVendedor = (texto: string) => [texto, ...(pendencia ? perguntasDoVendedor : [])].join('\\n')", "        const comAsDoVendedor = (texto: string) => texto"),
 (C, "            : faltamCondicoes.length ? [perguntaDasCondicoes(faltamCondicoes, vendedorDoLevantamento)] : []", "            : []"),
 (C, "const perguntasDoVendedor = vendedorPendente ? [fraseDosHomonimos(nomeDosHomonimos, homonimos)] : faltaVendedor ? [FRASE_FALTA_O_VENDEDOR]", "const perguntasDoVendedor = vendedorPendente ? [fraseDosHomonimos(nomeDosHomonimos, homonimos)] : faltaVendedor ? []"),
 (C, "                    ...(restoDaRecusa.length ? [perguntaDasPendencias(restoDaRecusa, aplicada.itens.length, null, filtro.jaDito)] : [])].join('\\n'))", "                    ].join('\\n'))"),
 (C, "            return await falar(comAsDoVendedor(perguntaPara(pendencias, aplicada.itens.length, proposta, filtro.jaDito)), 'perguntou')", "            return await falar(perguntaPara(pendencias, aplicada.itens.length, proposta, filtro.jaDito), 'perguntou')"),
 (C, "export const FRASE_O_ARQUIVO_NAO_MUDOU = `Essa resposta não mudou nada no levantamento: o arquivo que enviei continua valendo. ${CONFERE_O_ARQUIVO}`", "export const FRASE_O_ARQUIVO_NAO_MUDOU = 'Essa resposta não mudou nada no levantamento: o arquivo que enviei continua valendo. Confere? Responda sim, ou diga o que muda.'"),
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
