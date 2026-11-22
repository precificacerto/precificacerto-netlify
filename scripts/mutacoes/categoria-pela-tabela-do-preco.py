import subprocess, sys, os
# MUTACOES da categoria pela tabela de onde o preco saiu + totais do relatorio de materiais (22/11/2026). Roda SOZINHO na arvore.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/categoria-pela-tabela-do-preco.test.ts', 'src/utils/__tests__/relatorio-de-materiais.test.ts',
     'src/utils/__tests__/relatorios-em-pdf.test.ts', 'src/utils/__tests__/atendimentos-ia-levantamentos-e-relatorios-ia-tela.test.tsx']
P = 'src/lib/atendimentos-ia/categoria-do-relatorio.ts'
S = 'src/lib/atendimentos-ia/categoria-do-relatorio-servidor.ts'
C = 'src/lib/atendimentos-ia/custo-do-orcamento-servidor.ts'
M_ = 'src/lib/atendimentos-ia/relatorio-de-materiais.ts'
D = 'src/lib/atendimentos-ia/relatorios-em-pdf.ts'
K = 'src/page-parts/atendimentos-ia/relatorio-de-materiais.component.tsx'
MS = 'src/lib/atendimentos-ia/relatorio-de-materiais-servidor.ts'
M = [
 (C, "    if (caminho === 'perfil') return motor === null ? [] : doCodigo.filter((i) => tabelaNoEscopo(i, motor))", "    if (caminho === 'perfil') return [...doCodigo]"),
 (C, "    if (caminho === 'vidro') return escopoDoVidro(doCodigo, p)", "    if (caminho === 'vidro') return [...doCodigo]"),
 (C, "    if (caminho === 'insumo') return niveisDoInsumo(doCodigo, p).find((n) => n.length > 0) ?? []", "    if (caminho === 'insumo') return escopoDoInsumo(doCodigo, p)"),
 (C, "    return []\n}\nconst textoOuNulo", "    return [...doCodigo]\n}\nconst textoOuNulo"),
 (P, "    if (doCodigo.length === 0) return { categoria: null, categorias: [], motivo: MOTIVO_EM_NENHUMA_TABELA }", ""),
 (P, "    if (deOndeSai.length === 0) return { categoria: null, categorias: [], motivo: motivoForaDoEscopo(caminho) }", "    if (deOndeSai.length === 0) return categoriaDoPreco(caminho, doCodigo, doCodigo)"),
 (P, "categorias: nomeadas.length > 1 ? nomeadas : [],", "categorias: nomeadas,"),
 (P, "    if (cats[0] === null) return { categoria: null, categorias: [], motivo: MOTIVO_TABELA_SEM_CATEGORIA }", ""),
 (P, "        if (falha) { categoriasDoCodigo.set(codigo, falha.categorias); motivos.set(codigo, falha.motivo); continue }", "        if (falha && rs.length === 1) { categoriasDoCodigo.set(codigo, falha.categorias); motivos.set(codigo, falha.motivo); continue }"),
 (P, "        if (cats.length > 1) motivos.set(codigo, MOTIVO_ITENS_EM_CATEGORIAS_DIFERENTES)", ""),
 (S, "        const doCodigo = (tabelasDoCodigo.get(l.codigo) ?? []).filter((t) => daFamilia.has(t.tabela_id))", "        const doCodigo = tabelasDoCodigo.get(l.codigo) ?? []"),
 (S, "        if (!f) return { codigo: l.codigo, r: { categoria: null, categorias: [], motivo: MOTIVO_ITEM_SEM_FAMILIA } }", "        if (!f) return { codigo: l.codigo, r: { categoria: null, categorias: [], motivo: '' } }"),
 (S, "        const motor = f.calculo ? escopoDoMotor.get(f.calculo.id) ?? null : null", "        const motor = null"),
 (S, "        const motivo = motivoDaConfiguracao(fam.frase)", "        const motivo = fam.frase"),
 (S, "    const unicas = [...new Map(linhas.map((l) => [JSON.stringify([l.codigo, l.caminho, l.familia]), l])).values()]", "    const unicas = [...new Map(linhas.map((l) => [l.codigo, l])).values()]"),
 (M_, "            atual.custo_bruto = somaOuNulo(atual.custo_bruto, bruto)", "            atual.custo_bruto = (atual.custo_bruto ?? 0) + (bruto ?? 0)"),
 (M_, "    const soma = (k: 'custo_bruto' | 'custo_liquido') => (sem(k).length ? null : materiais.reduce((t, m) => t + (m[k] as number), 0))", "    const soma = (k: 'custo_bruto' | 'custo_liquido') => materiais.reduce((t, m) => t + ((m[k] as number) ?? 0), 0)"),
 (M_, "        totalGeral: totalDoGrupo([...somados.values()]),", "        totalGeral: totalDoGrupo(g.categorias.flatMap((c) => c.itens)),"),
 (M_, "    const motivo = (codigo: string) => motivos.get(codigo) ?? 'sem tabela de preço com categoria'", "    const motivo = (_codigo: string) => 'sem tabela de preço com categoria'"),
 (M_, "    return v === null ? 'não sai' :", "    return v === null ? 'R$ 0,00' :"),
 (D, "        f.paragrafo(textoDoTotal(`Total de ${cat.rotulo}`, cat.total))\n", ""),
 (D, "    f.paragrafo(textoDoTotal('Total geral do pedido', r.totalGeral))\n", ""),
 (D, "linhaDeMaterial(m, `${m.descricao ?? '—'} (${m.motivo})`)", "linhaDeMaterial(m)"),
 (K, "                    <TotalDoGrupoNaTela nome={`Total de ${c.rotulo}`} total={c.total} />\n", ""),
 (K, "            {!vazio && <TotalDoGrupoNaTela nome=\"Total geral do pedido\" total={totalGeral} geral />}", "            <TotalDoGrupoNaTela nome=\"Total geral do pedido\" total={totalGeral} geral />"),
 (K, "{semCategoria.map((m) => `${m.codigo} (${m.motivo})`).join('; ')}", "{semCategoria.map((m) => m.codigo).join('; ')}"),
]
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
