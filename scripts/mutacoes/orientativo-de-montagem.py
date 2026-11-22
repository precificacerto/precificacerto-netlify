import subprocess, sys, os
# MUTACOES do orientativo de montagem (22/11/2026). Roda SOZINHO na arvore.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/orientativo-de-montagem.test.ts', 'src/utils/__tests__/orientativo-de-montagem-servidor.test.ts',
     'src/utils/__tests__/relatorios-em-pdf.test.ts', 'src/utils/__tests__/avaliador-de-formulas.test.ts', 'src/utils/__tests__/avaliador-insumos-e-vidros.test.ts']
O = 'src/lib/atendimentos-ia/orientativo-de-montagem.ts'
S = 'src/lib/atendimentos-ia/orientativo-de-montagem-servidor.ts'
A = 'src/lib/atendimentos-ia/avaliador-de-formulas.ts'
P = 'src/lib/atendimentos-ia/relatorios-em-pdf.ts'
M = [
 (A, "            linha, obs: p.obs ?? null })", "            linha: linha + 1, obs: p.obs ?? null })"),
 (A, "esp_vidro: texto(l['Esp. vidro']), condicao: textoObrigatorio(l['Condição']), obs: texto(l['Obs.']),", "esp_vidro: texto(l['Esp. vidro']), condicao: textoObrigatorio(l['Condição']), obs: null,"),
 (A, "quantidade: aoMicrometro(q), linha, obs: x.obs ?? null })", "quantidade: aoMicrometro(q), linha, obs: null })"),
 (A, "fixacao: x.fixacao, linha })", "fixacao: x.fixacao, linha: 0 })"),
 (O, "    const confere = r !== null && diferencas === 0", "    const confere = r !== null"),
 (O, "    for (const p of gravadas) conta.set(chaveDaPeca(p), (conta.get(chaveDaPeca(p)) ?? 0) - 1)", ""),
 (O, "    JSON.stringify([p.perfil, p.codigo, Math.round(p.comprimento_mm * 1000), p.quantidade_por_esquadria, p.corte ?? '', p.posicao ?? ''])", "    JSON.stringify([p.perfil, p.codigo, Math.round(p.comprimento_mm * 1000), p.quantidade_por_esquadria])"),
 (O, "corte: p.corte, posicao: p.posicao, peso_kg: pesoDaLinha(p.comprimento_mm, p.quantidade_por_esquadria, pesos.get(p.codigo)), obs: null,", "corte: p.corte, posicao: p.posicao, peso_kg: pesoDaLinha(p.comprimento_mm, p.quantidade_por_esquadria, pesos.get(p.codigo)), obs: 'x',"),
 (O, "    kgm === undefined ? null : (comprimento_mm / 1000) * quantidade * kgm", "    kgm === undefined ? 0 : (comprimento_mm / 1000) * quantidade * kgm"),
 (O, "        peso_kg: codigosSemPeso.length ? null :", "        peso_kg: false ? null :"),
 (O, "        acumulado = acumulado === null || x.perfis.peso_kg === null ? null : acumulado + x.perfis.peso_kg * x.quantidade", "        acumulado = acumulado === null || x.perfis.peso_kg === null ? null : acumulado + x.perfis.peso_kg"),
 (O, "                unidade: porComprimento ? 'm' : i.unidade, quantidade: porComprimento ? i.quantidade / 1000 : i.quantidade,", "                unidade: i.unidade, quantidade: i.quantidade,"),
 (O, "codigo: i.codigo_na_tabela ?? i.codigo, descricao: i.descricao_na_tabela ?? i.descricao,", "codigo: i.codigo, descricao: i.descricao,"),
 (O, "    if (!confere && e.materiais.some((m) => m.caminho === 'vidro')) lacunas.push(LACUNA_DOS_PANOS)\n", ""),
 (O, "    if (linhasDeVidro.length) lacunas.push(LACUNA_DA_COR_DO_VIDRO, LACUNA_DA_POSICAO_DO_VIDRO)\n", ""),
 (O, "    if (acessorios.length) lacunas.push(LACUNA_DA_FIGURA)\n", ""),
 (O, "    const descricaoDoVidro = confere ? ((r as MontagemDoItem).vidro?.descricao ?? e.vidro) : e.vidro", "    const descricaoDoVidro = e.vidro"),
 (O, "largura_mm: v.largura_mm, altura_mm: v.altura_mm, m2: (v.largura_mm * v.altura_mm / 1e6) * v.quantidade,", "largura_mm: v.largura_mm, altura_mm: v.altura_mm, m2: (v.largura_mm * v.altura_mm / 1e6),"),
 (O, "semDesenho: e.desenho === null ? (e.semDesenho ?? AVISO_SEM_DESENHO) : null,", "semDesenho: e.semDesenho,"),
 (O, "    ['', a.codigo, a.descricao ?? '—', a.unidade ?? '', quantidadeNoOrientativo(a.quantidade), a.obs ?? '']", "    [a.codigo, a.descricao ?? '—', a.unidade ?? '', quantidadeNoOrientativo(a.quantidade), a.obs ?? '']"),
 (S, "    const materiais = linhasDoCalculoVigente(calculados, (m.data ?? []) as Array<Record<string, unknown> & Comum>)", "    const materiais = (m.data ?? []) as Array<Record<string, unknown> & Comum>"),
 (S, "    const pecas = linhasDoCalculoVigente(calculados, (p.data ?? []) as Array<Record<string, unknown> & Comum>)", "    const pecas = (p.data ?? []) as Array<Record<string, unknown> & Comum>"),
 (S, "        if (e instanceof ErroDoCalculo) return { naoRodou: e.recusas.join('; ') }", ""),
 (S, "        if ('recusas' in custo) return { naoRodou: custo.recusas.join('; ') }", ""),
 (S, "            desenhoDa.set(x.ordem, 'imagem' in d ?", "            desenhoDa.set(1, 'imagem' in d ?"),
 (P, "        f.extra = () => topoDaEsquadria(f, e)\n", ""),
 (P, "    if (e.desenho) desenharFiguraProporcional(d, e.desenho, caixa)", "    if (false) desenharFiguraProporcional(d, e.desenho, caixa)"),
 (P, "        f.titulo2('Serviços')\n", ""),
 (P, "        if (k > 0 || r.itensSemCalculo.length) f.novaPagina()", "        if (r.itensSemCalculo.length) f.novaPagina()"),
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
