import subprocess, sys, os
# MUTACOES do pedido 0038 (dono do produto, 26/11/2026): a peca sem a cor do perfil em PRETO, o reforco interno sem cor, a persiana pela cor e a
# cor so da lista do fornecedor. Roda SOZINHO na arvore. SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA
# vez aborta (codigo 3).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'referencia-do-perfil.test.ts', U + 'fronteira-das-escolhas.test.ts', U + 'cor-da-lista-do-fornecedor.test.ts', U + 'atendimentos-ia-importar-rota.test.ts',
     U + 'resolucao-de-referencia.test.ts', U + 'levantamento-de-barras.test.ts']
RR = 'src/lib/atendimentos-ia/resolucao-de-referencia.ts'
FR = 'src/lib/atendimentos-ia/fronteira-das-escolhas.ts'
IM = 'src/utils/atendimentos-ia-importacao.ts'
RT = 'src/pages/api/super-admin/atendimentos-ia/tabelas/[id]/importar.ts'
M = [
 (RR, "    if (daReferencia.length === 1 && corParaComparar(daReferencia[0].categoria) === 'REFORCO') return", "    if (daReferencia.length === 1) return"),
 (RR, "    if (daReferencia.length === 1 && corParaComparar(daReferencia[0].categoria) === 'REFORCO') return", "    if (false) return"),
 (RR, "    if (pedida !== COR_BRANCA) {", "    if (true) {"),
 (RR, "    if (pedida !== COR_BRANCA) {", "    if (false) {"),
 (RR, "        if (emPreto.length === 1) return { achada: true, como: 'referencia', item: emPreto[0], substituicao: 'peca_sem_a_cor' }", "        if (emPreto.length >= 1) return { achada: true, como: 'referencia', item: emPreto[0], substituicao: 'peca_sem_a_cor' }"),
 (RR, "        if (emPreto.length > 1) return ambigua(emPreto, ' na cor PRETO')", ""),
 (RR, "item: emPreto[0], substituicao: 'peca_sem_a_cor' }", "item: emPreto[0] }"),
 (FR, "export const palhetaPelaCor = (cor: string): number => (semAcento(cor).toUpperCase().trim() === 'BRANCO' ? 37 : 45)", "export const palhetaPelaCor = (cor: string): number => (semAcento(cor).toUpperCase().trim() === 'BRANCO' ? 37 : 57)"),
 (FR, "    if (palheta && cor !== null && escolhas[palheta.variavel] === undefined &&", "    if (palheta && cor !== null &&"),
 (FR, "        if ((opcoesDaVariavel(palheta.opcoes) ?? []).some((o) => o.valor === pelaCor)) {", "        if (true) {"),
 (FR, "            origem[palheta.variavel] = 'pela_cor'", "            origem[palheta.variavel] = 'padrao_do_motor'"),
 (IM, "        if (c === '' || valem.has(c) || valem.has(SEM_O_LADO(c))) return i", "        if (c === '' || valem.has(c)) return i"),
 (IM, "        if (c === '' || valem.has(c) || valem.has(SEM_O_LADO(c))) return i", "        return i"),
 (IM, "        return { ...i, cor: null }", "        return i"),
 (IM, "    if (lista.length === 0) return { itens: [...itens], aviso: { tipo: 'fornecedor_sem_lista_de_cores', mensagem: FRASE_DO_FORNECEDOR_SEM_LISTA_DE_CORES } }", "    if (lista.length === 0) return { itens: [...itens], aviso: null }"),
 (RT, "  if (declarada !== CATEGORIA_COM_VARIANTES) {\n    let lista: string[]", "  if (true) {\n    let lista: string[]"),
 (RT, "    lida.itens = conferidas.itens", ""),
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
