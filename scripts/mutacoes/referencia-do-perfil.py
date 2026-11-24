import subprocess, sys, os
# MUTACOES da referencia do perfil + cor (referencia_perfil; dono do produto, 24/11/2026). Roda SOZINHO na arvore (nada le a arvore enquanto roda).
# SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + x for x in ['referencia-do-perfil.test.ts', 'levantamento-de-barras.test.ts', 'atendimentos-ia-layout-unico.test.ts', 'atendimentos-ia-importar-rota.test.ts',
     'levantamento-da-conversa.test.ts', 'conferencia-de-referencias.test.ts', 'custo-do-levantamento-tres-caminhos.test.ts']]
RR = 'src/lib/atendimentos-ia/resolucao-de-referencia.ts'
LB = 'src/lib/atendimentos-ia/levantamento-de-barras.ts'
IM = 'src/utils/atendimentos-ia-importacao.ts'
LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
M = [
 # a referencia + cor
 (RR, "export const referenciaDoMotor = (codigoDoMotor: string): string => semOSufixo(codigoDoMotor, sufixoDoFornecedor(codigoDoMotor))", "export const referenciaDoMotor = (codigoDoMotor: string): string => codigoDoMotor"),
 (RR, "    const daReferencia = itens.filter((i) => i.referencia_perfil === referencia)", "    const daReferencia = itens.filter((i) => i.referencia_perfil?.toUpperCase() === referencia.toUpperCase())"),
 (RR, "    const daReferencia = itens.filter((i) => i.referencia_perfil === referencia)", "    const daReferencia = itens.filter((i) => i.referencia_perfil === referencia || i.codigo === referencia)"),
 (RR, "    const daReferencia = itens.filter((i) => i.referencia_perfil === referencia)", "    const daReferencia = itens.filter((i) => (i.referencia_perfil ?? '').startsWith(referencia))"),
 (RR, "    if (daReferencia.length === 0) return null\n", "    if (daReferencia.length === 0) return faltou('NAO_ACHADA', 'x', 'x')\n"),
 (RR, "    if (daReferencia.every((i) => corParaComparar(i.cor) === null)) {", "    if (false) {"),
 (RR, "    if (daReferencia.every((i) => corParaComparar(i.cor) === null)) {", "    if (daReferencia.some((i) => corParaComparar(i.cor) === null)) {"),
 (RR, "        return daReferencia.length === 1 ? { achada: true, como: 'referencia', item: daReferencia[0] } : ambigua(daReferencia, ' e sem cor')", "        return { achada: true, como: 'referencia', item: daReferencia[0] }"),
 (RR, "    if (pedida === null) {\n        return faltou('SEM_COR',", "    if (false) {\n        return faltou('SEM_COR',"),
 (RR, "    const daCor = daReferencia.filter((i) => corParaComparar(i.cor) === pedida)", "    const daCor = daReferencia.filter((i) => i.cor === ref.corPedida)"),
 (RR, "    const daCor = daReferencia.filter((i) => corParaComparar(i.cor) === pedida)", "    const daCor = daReferencia.filter((i) => (corParaComparar(i.cor) ?? '').startsWith(pedida))"),
 (RR, "    const daCor = daReferencia.filter((i) => corParaComparar(i.cor) === pedida)", "    const daCor = daReferencia.filter((i) => corParaComparar(i.cor) === pedida || corParaComparar(i.cor) === null)"),
 (RR, "    if (daCor.length === 1) return { achada: true, como: 'referencia', item: daCor[0] }\n    if (daCor.length > 1) return ambigua(daCor,", "    if (daCor.length >= 1) return { achada: true, como: 'referencia', item: daCor[0] }\n    if (daCor.length > 1) return ambigua(daCor,"),
 (RR, "    if (daCor.length === 1) return { achada: true, como: 'referencia', item: daCor[0] }", "    if (daCor.length === 1) return { achada: true, como: 'exato', item: daCor[0] }"),
 (RR, "    return faltou('REFERENCIA_SEM_A_COR',", "    if (daReferencia.length > 0) return { achada: true, como: 'referencia', item: daReferencia[0] }\n    return faltou('REFERENCIA_SEM_A_COR',"),
 (RR, "const corParaComparar = (cor: string | null | undefined): string | null => { const c = descricaoNormalizada(cor); return c === '' ? null : c }", "const corParaComparar = (cor: string | null | undefined): string | null => { const c = descricaoNormalizada(cor); return c }"),
 # a referencia antes da escada, e o item com referencia fora dela
 (RR, "    if (pelaReferencia !== null) return pelaReferencia\n", ""),
 (RR, "    const itens = todos.filter((i) => !temReferencia(i))", "    const itens = todos"),
 (RR, "    const haReferencias = itens.length !== todos.length", "    const haReferencias = false"),
 (RR, "export const temReferencia = (i: ItemResolvivel): boolean => i.referencia_perfil !== undefined && i.referencia_perfil !== null", "export const temReferencia = (i: ItemResolvivel): boolean => i.referencia_perfil !== undefined"),
 # as barras: a referencia antes da ponte
 (LB, "        if (pelaReferencia === null) {\n            const p = ponte(perfil, cor, entrada.regras)", "        if (true) {\n            const p = ponte(perfil, cor, entrada.regras)"),
 (LB, "        const r = pelaReferencia ?? resolverReferencia(", "        const r = resolverReferencia("),
 (LB, "resolverPelaReferencia({ codigoDoMotor: perfil, descricaoDoMotor: descricao, corPedida: cor }, entrada.itens)", "resolverPelaReferencia({ codigoDoMotor: perfil, descricaoDoMotor: descricao, corPedida: 'BRANCO' }, entrada.itens)"),
 (LB, "pela ${r.como === 'referencia' ? 'referência' : r.como.replace('_', ' ')}) está sem o valor", "pela ${r.como.replace('_', ' ')}) está sem o valor"),
 # a importacao
 (IM, "    if (typeof categoria === 'string' && categoria.trim() !== '' && categoria !== CATEGORIA_COM_REFERENCIA) {", "    if (typeof categoria === 'string' && categoria.trim() !== '') {"),
 (IM, "    if (typeof categoria === 'string' && categoria.trim() !== '' && categoria !== CATEGORIA_COM_REFERENCIA) {", "    if (categoria !== CATEGORIA_COM_REFERENCIA) {"),
 (IM, "    if (typeof categoria === 'string' && categoria.trim() !== '' && categoria !== CATEGORIA_COM_REFERENCIA) {", "    if (typeof categoria === 'string' && categoria !== CATEGORIA_COM_REFERENCIA) {"),
 (IM, "    if (typeof categoria === 'string' && categoria.trim() !== '' && categoria !== CATEGORIA_COM_REFERENCIA) {", "    if (categoria === 'PERFIL') {"),
 (IM, "        if (comBarra.length > 0) return fraseDaReferenciaComBarra(comBarra)\n", ""),
 (IM, "        if (repetidas.length > 0) return fraseDaReferenciaDoPerfilRepetida(repetidas)\n", ""),
 (IM, "            const chave = JSON.stringify([i.codigo_wvetro, cor])", "            const chave = JSON.stringify([i.codigo_wvetro])"),
 (IM, "            const chave = JSON.stringify([i.codigo_wvetro, cor])", "            const chave = JSON.stringify([i.codigo_wvetro, i.cor])"),
 (IM, "            const chave = JSON.stringify([i.codigo_wvetro, cor])", "            const chave = JSON.stringify([i.codigo_wvetro.toUpperCase(), cor])"),
 (IM, "            if (i.codigo_wvetro === null) continue\n            const cor = corParaComparar(i.cor)", "            const cor = corParaComparar(i.cor)"),
 (IM, "        for (const i of lida.itens) { i.referencia_perfil = i.codigo_wvetro; i.codigo_wvetro = null }", "        for (const i of lida.itens) { i.referencia_perfil = i.codigo_wvetro }"),
 (IM, "        for (const i of lida.itens) { i.referencia_perfil = i.codigo_wvetro; i.codigo_wvetro = null }", "        for (const i of lida.itens) { i.codigo_wvetro = null }"),
 (IM, "export const corParaComparar = (cor: string | null) => (cor ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase()", "export const corParaComparar = (cor: string | null) => (cor ?? '').toUpperCase()"),
 # a leitura dos itens do custo
 (LC, "${COLUNA_DA_REFERENCIA_DO_ITEM}, ${COLUNA_DA_REFERENCIA_DO_PERFIL}, tabela_id`\n    const pagina", "${COLUNA_DA_REFERENCIA_DO_ITEM}, tabela_id`\n    const pagina"),
 (LC, "    if (semAColunaDaReferenciaDoPerfil(primeira.error)) {", "    if (false) {"),
 (LC, "    if (semAColunaDaReferenciaDoPerfil(primeira.error)) {\n        colunas = `${COLUNAS_DO_ITEM_DA_TABELA}, ${COLUNA_DA_COR_DO_ITEM}, ${COLUNA_DA_REFERENCIA_DO_ITEM}, tabela_id`", "    if (semAColunaDaReferenciaDoPerfil(primeira.error)) {\n        colunas = `${COLUNAS_DO_ITEM_DA_TABELA}, tabela_id`"),
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
