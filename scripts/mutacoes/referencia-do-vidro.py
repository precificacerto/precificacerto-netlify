import subprocess, sys, os
# MUTACOES da referencia unica do vidro (codigo_wvetro; dono do produto, 24/11/2026). Roda SOZINHO na arvore (nada le a arvore enquanto roda).
# SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + x for x in ['vidro-por-segmento.test.ts', 'vidro-da-tabela.test.ts', 'vidro-padrao-por-grupo.test.ts', 'tela-da-natureza-vidro.test.ts', 'tela-da-natureza.test.ts',
     'tela-da-natureza-linhas.test.tsx', 'atendimentos-ia-layout-unico.test.ts', 'atendimentos-ia-importar-rota.test.ts', 'levantamento-da-conversa.test.ts',
     'custo-do-levantamento-tres-caminhos.test.ts', 'atendimentos-ia-levantamento-por-nome.test.ts']]
VT = 'src/lib/atendimentos-ia/vidro-da-tabela.ts'
VP = 'src/lib/atendimentos-ia/vidro-padrao.ts'
TS = 'src/lib/atendimentos-ia/tela-da-natureza-servidor.ts'
RN = 'src/pages/api/super-admin/base-de-conhecimento/natureza.ts'
IM = 'src/utils/atendimentos-ia-importacao.ts'
RT = 'src/pages/api/super-admin/atendimentos-ia/tabelas/[id]/importar.ts'
LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
CO = 'src/page-parts/atendimentos-ia/natureza/natureza-da-variavel.component.tsx'
M = [
 # o vidro escolhido e o padrao pela referencia
 (VT, "        const achados = itens.filter((i) => referenciaDo(i) === codigoEscolhido)", "        const achados = itens.filter((i) => i.codigo === codigoEscolhido)"),
 (VT, "        const achados = itens.filter((i) => referenciaDo(i) === codigoEscolhido)", "        const achados = itens.filter((i) => (referenciaDo(i) ?? i.codigo) === codigoEscolhido)"),
 (VT, "        const achados = itens.filter((i) => referenciaDo(i) === codigoEscolhido)", "        const achados = itens.filter((i) => referenciaDo(i)?.toUpperCase() === codigoEscolhido.trim().toUpperCase())"),
 (VT, "    const dos = candidatos.filter((c) => { const r = referenciaDo(c); return r !== null && padrao.has(r) })", "    const dos = candidatos.filter((c) => padrao.has(c.codigo))"),
 (VT, "    const dos = candidatos.filter((c) => { const r = referenciaDo(c); return r !== null && padrao.has(r) })", "    const dos = candidatos.filter((c) => { const r = referenciaDo(c) ?? c.codigo; return padrao.has(r) })"),
 (VT, "    if (achados > 1) return", "    if (false) return"),
 (VT, "    if (itens.length > 0 && !itens.some((i) => referenciaDo(i) !== null)) {", "    if (false) {"),
 (VT, "frase: fraseDaReferenciaForaDaTabela(codigoEscolhido, itens, achados.length), candidatos: achados }", "frase: fraseDaReferenciaForaDaTabela(codigoEscolhido, itens, achados.length), candidatos: [] }"),
 # a descricao do padrao e as referencias do principal
 (VP, ".in('tabela_id', tabelas).in('codigo_wvetro', [...codigos])", ".in('tabela_id', tabelas).in('codigo', [...codigos])"),
 (VP, "    if (error) { if (semAColunaDaReferencia(error)) return new Map(); throw", "    if (error) { throw"),
 (VP, "(e.code === '42703' || e.code === 'PGRST204') && /\\bcodigo_wvetro\\b/.test(e.message ?? '')", "(e.code === '42703' || e.code === 'PGRST204')"),
 (VP, "            .not('codigo_wvetro', 'is', null).order(", "            .order("),
 (VP, "        ultima = linhas.length\n    }\n    return todas.sort(", "        ultima = 0\n    }\n    return todas.sort("),
 (VP, "    return todas.sort((a, b) => a.referencia.localeCompare(b.referencia, 'pt-BR'))", "    return todas"),
 (VP, "        if (error) { if (semAColunaDaReferencia(error)) return []; throw", "        if (error) { throw"),
 (VP, "export const fraseDaReferenciaQueOPrincipalNaoTem = (referencia: string, quantas: number) => (quantas === 0", "export const fraseDaReferenciaQueOPrincipalNaoTem = (referencia: string, quantas: number) => (quantas < 0"),
 (VP, "    return derivacao.tabelas.filter((t) => t.fornecedorId === principal && t.categoria === 'VIDRO' && t.vale)", "    return derivacao.tabelas.filter((t) => t.categoria === 'VIDRO' && t.vale)"),
 (VP, "    return derivacao.tabelas.filter((t) => t.fornecedorId === principal && t.categoria === 'VIDRO' && t.vale)", "    return derivacao.tabelas.filter((t) => t.fornecedorId === principal && t.vale)"),
 # a tela da natureza
 (TS, "            if (l.variavel === 'VIDRO') return referencias.has(l.opcao_padrao) ? base :", "            if (l.variavel === 'VIDRO') return true ? base :"),
 (TS, "    if (linha.variavel !== 'VIDRO' || linha.natureza !== 'POLITICA' || linha.opcao_padrao === null) return null", "    if (linha.natureza !== 'POLITICA' || linha.opcao_padrao === null) return null"),
 (TS, "    if (linha.variavel !== 'VIDRO' || linha.natureza !== 'POLITICA' || linha.opcao_padrao === null) return null", "    if (linha.variavel !== 'VIDRO' || linha.opcao_padrao === null) return null"),
 (TS, "    return referencias.some((r) => r.referencia === linha.opcao_padrao) ? null :", "    return true ? null :"),
 (TS, "    return referencias.some((r) => r.referencia === linha.opcao_padrao) ? null :", "    return referencias.some((r) => r.referencia.toUpperCase() === linha.opcao_padrao?.toUpperCase()) ? null :"),
 (TS, "textos: textosDaFamiliaNaTela(textos, f.familia), vidros }", "textos: textosDaFamiliaNaTela(textos, f.familia), vidros: [] }"),
 (TS, "referenciasDeVidroDoPrincipal(tenantId)])\n", "referenciasDeVidroDoPrincipal('outra-conta')])\n"),
 (RN, "        if (recusa !== null) return res.status(422).json({ error: recusa })\n", ""),
 (CO, "        opcoes: f.vidros.map((v) => v.referencia), rotulos:", "        opcoes: [], rotulos:"),
 (CO, "rotulos: Object.fromEntries(f.vidros.flatMap((v) => (v.descricao ? [[v.referencia, v.descricao]] : []))),", "rotulos: {},"),
 # a importacao
 (IM, "            codigo_wvetro: texto('codigo_wvetro')?.trim() || null,", "            codigo_wvetro: null,"),
 (IM, "            codigo_wvetro: texto('codigo_wvetro')?.trim() || null,", "            codigo_wvetro: texto('codigo_wvetro') || null,"),
 (IM, "            codigo_wvetro: texto('codigo_wvetro')?.trim() || null,", "            codigo_wvetro: texto('codigo_wvetro')?.trim() ?? null,"),
 (IM, "    if (categoria !== CATEGORIA_COM_REFERENCIA) {", "    if (false) {"),
 (IM, "        for (const i of lida.itens) i.codigo_wvetro = null\n", ""),
 (IM, "        if (comValor === 0) return null\n", ""),
 (IM, "        const colunas = { ...(antes?.colunas ?? {}), [COLUNA_DA_REFERENCIA_DO_ITEM]: comValor }", "        const colunas = { [COLUNA_DA_REFERENCIA_DO_ITEM]: comValor }"),
 (IM, "        if (k >= 0) lida.avisos[k] = aviso\n        else lida.avisos.push(aviso)", "        lida.avisos.push(aviso)"),
 (IM, "    if (repetidas.length > 0) return fraseDaReferenciaRepetida(repetidas)\n", ""),
 (IM, "    const repetidas = [...porReferencia].filter(([, cs]) => cs.length > 1)", "    const repetidas = [...porReferencia].filter(([, cs]) => cs.length > 2)"),
 (IM, "    if (sem.length > 0) lida.avisos.push({ tipo: 'itens_sem_referencia'", "    if (false) lida.avisos.push({ tipo: 'itens_sem_referencia'"),
 (IM, "    if (sem.length > 0) lida.avisos.push({ tipo: 'itens_sem_referencia'", "    lida.avisos.push({ tipo: 'itens_sem_referencia'"),
 (RT, "  if (referenciaRecusada !== null) return res.status(422).json({ error: fraseDoArquivo(daTabela.nome, referenciaRecusada) })\n", ""),
 (RT, "  const referenciaRecusada = referenciasDaCategoria(lida, declarada)", "  const referenciaRecusada = referenciasDaCategoria(lida, 'VIDRO')"),
 (RT, "  const referenciaRecusada = referenciasDaCategoria(lida, declarada)", "  const referenciaRecusada = referenciasDaCategoria(lida, declarada ?? 'VIDRO')"),
 # a leitura dos itens do custo
 (LC, "    let colunas = `${COLUNAS_DO_ITEM_DA_TABELA}, ${COLUNA_DA_COR_DO_ITEM}, ${COLUNA_DA_REFERENCIA_DO_ITEM}, tabela_id`", "    let colunas = `${COLUNAS_DO_ITEM_DA_TABELA}, ${COLUNA_DA_COR_DO_ITEM}, tabela_id`"),
 (LC, "    if (semAColunaDaReferencia(primeira.error)) {", "    if (false) {"),
 (LC, "    if (semAColunaDaReferencia(primeira.error)) {\n        colunas = `${COLUNAS_DO_ITEM_DA_TABELA}, ${COLUNA_DA_COR_DO_ITEM}, tabela_id`", "    if (semAColunaDaReferencia(primeira.error)) {\n        colunas = `${COLUNAS_DO_ITEM_DA_TABELA}, tabela_id`"),
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
