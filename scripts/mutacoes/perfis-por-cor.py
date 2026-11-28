import subprocess, sys, os
# MUTACOES do pedido 0055 (dono do produto): perfis por cor em ABAS — a aba e a cor, a coluna e a referencia, o importador nao decifra pelo codigo.
# Roda SOZINHO na arvore. SO=<trecho>. Trecho que nao aparece UMA vez aborta (3).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'atendimentos-ia-abas-por-cor.test.ts', U + 'atendimentos-ia-importar-rota.test.ts', U + 'atendimentos-ia-importacao-a-tela.test.tsx', U + 'referencia-do-perfil.test.ts', U + 'levantamento-de-barras.test.ts']
IMP, ABA, ROTA, CONT, RES = 'src/utils/atendimentos-ia-importacao.ts', 'src/utils/atendimentos-ia-abas-por-cor.ts', 'src/pages/api/super-admin/atendimentos-ia/tabelas/[id]/importar.ts', 'src/pages/api/super-admin/atendimentos-ia/tabelas/[id]/conteudo.ts', 'src/lib/atendimentos-ia/resolucao-de-referencia.ts'
TELA = 'src/page-parts/atendimentos-ia/perfis-por-cor.component.tsx'
M = [
 (IMP, "        if (nome === undefined) { foraDaLista.push(ws.name); continue }", "        if (nome === undefined) continue"),
 (IMP, "    if (duas.length) recusas.push(fraseDasAbasDaMesmaCor(duas))", "    if (false) recusas.push(fraseDasAbasDaMesmaCor(duas))"),
 (IMP, "    if (!cores || cores.length === 0) return { ...vazia, recusas: [FRASE_DAS_ABAS_SEM_LISTA_DE_CORES] }", "    if (false) return { ...vazia, recusas: [FRASE_DAS_ABAS_SEM_LISTA_DE_CORES] }"),
 (IMP, "            const referencia = l.texto(r, coluna('referencia'))?.trim() || null", "            const referencia = l.texto(r, coluna('referencia'))?.trim() || codigo"),
 (IMP, "            if (referencia === null) { semReferencia.push({ aba: ws.name, linha: r, codigo }); continue }", "            if (referencia === null) continue"),
 (IMP, "            if (codigo === null) { semCodigo.push({ aba: ws.name, linha: r }); continue }", "            if (codigo === null) continue"),
 (IMP, "            const custo = numero(r, 'preco')", "            const custo = numero(r, 'barra')"),
 (IMP, "                medida_barra_m: numero(r, 'barra'),", "                medida_barra_m: numero(r, 'preco'),"),
 (IMP, "                codigo, descricao: l.texto(r, coluna('descricao')), cor,", "                codigo, descricao: l.texto(r, coluna('descricao')), cor: ws.name,"),
 (IMP, "                vendido_por: 'barra', valor_metro_interno: null, valor_barra_interno: custo,", "                vendido_por: 'barra', valor_metro_interno: null, valor_barra_interno: null,"),
 (IMP, "            if (antes !== undefined) { recusas.push(", "            if (false) { recusas.push("),
 (IMP, "    if (semReferencia.length) recusas.push(fraseDasLinhasSemReferencia(semReferencia))", "    if (false) recusas.push(fraseDasLinhasSemReferencia(semReferencia))"),
 (IMP, "    if (invalidas.length) recusas.push(fraseDasCelulasInvalidasDasAbas(invalidas))", "    if (false) recusas.push(fraseDasCelulasInvalidasDasAbas(invalidas))"),
 (IMP, "    if (foraDaLista.length) recusas.push(fraseDasAbasForaDaLista(foraDaLista, [...canonica.values()]))", "    if (false) recusas.push(fraseDasAbasForaDaLista(foraDaLista, [...canonica.values()]))"),
 (IMP, "    if (wb.worksheets.some((w) => w.name.trim() === ABAS_DA_IMPORTACAO.preco)) return false", "    if (false) return false"),
 (IMP, "        if (faltam.length) { recusas.push(fraseDaAbaSemColunas(ws.name, faltam)); continue }", "        if (false) { recusas.push(fraseDaAbaSemColunas(ws.name, faltam)); continue }"),
 (IMP, "        if (repetidas.length) { recusas.push(fraseDaAbaComColunaRepetida(ws.name, repetidas)); continue }", "        if (false) { recusas.push(fraseDaAbaComColunaRepetida(ws.name, repetidas)); continue }"),
 (IMP, "lerTabelaDePreco(wbTabela, arquivos.tabela.nome, arquivos.coresDoFornecedor)", "lerTabelaDePreco(wbTabela, arquivos.tabela.nome)"),
 (ROTA, "  if (lida.layout === 'abas_por_cor' && (tabela.categoria_chave === null || tabela.categoria_chave === CATEGORIA_COM_VARIANTES)) {", "  if (false) {"),
 (ROTA, "    coresDoFornecedor: listaDeCores,", "    coresDoFornecedor: [],"),
 (CONT, "...(perfis ? { perfis_por_cor: perfis } : {})", "...({})"),
 (RES, "referência ${referencia} não existe na aba ${ref.corPedida} — ela existe nas abas: ${cores.join(', ')}", "referência ${referencia} existe na tabela de preço, mas não na cor ${ref.corPedida} — as cores dela: ${cores.join(', ')}"),
 (ABA, "    const t = sem(texto)\n    return COLUNAS_DA_ABA_NA_ORDEM.find((c) => NOMES[c].includes(t)) ?? null", "    return null"),
 (ABA, "    codigo: ['CODIGO DO FORNECEDOR', 'CODIGO'],", "    codigo: ['CODIGO DO FORNECEDOR'],"),
 (ABA, "    const comCor = itens.filter((i) => i.cor !== null)\n    if (comCor.length === 0) return null", "    const comCor = [...itens]\n    if (comCor.length === 0) return null"),
 (ABA, "        if (i.referencia_perfil === null) g.sem += 1\n        else g.refs.add(i.referencia_perfil)", "        g.refs.add(i.referencia_perfil ?? '')"),
 (ABA, "return cores.map((cor) => {\n        const dela = refsDa(cor)\n        return { cor, faltam: [...base].filter((r) => !dela.has(r)).sort()", "return cores.map((cor) => {\n        const dela = refsDa(cor)\n        return { cor, faltam: [...base].filter((r) => dela.has(r)).sort()"),
 (ABA, "    if (!itens.some((i) => i.cor === COR_BASE_DAS_ABAS)) return []", "    if (false) return []"),
 (ABA, "(a.referencia_perfil ?? '\\uffff').localeCompare(b.referencia_perfil ?? '\\uffff') || a.codigo.localeCompare(b.codigo)", "a.codigo.localeCompare(b.codigo)"),
 (ABA, "(v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? null :", "(v === null || v === undefined ? null :"),
 (TELA, "{f && f.faltam.length > 0 && (\n                                        <Typography.Text data-faltas-da-aba", "{false && (\n                                        <Typography.Text data-faltas-da-aba"),
 (TELA, "return f && f.faltam.length > 0 ? <span data-faltam>{f.faltam.length}</span> : <span data-faltam>0</span>", "return <span data-faltam>0</span>"),
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
