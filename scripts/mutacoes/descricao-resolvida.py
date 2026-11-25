import subprocess, sys, os
# MUTACOES do pedido 0023 (dono do produto, 24/11/2026): a quantidade de modulos gravada nas escolhas e a descricao resolvida que o vendedor le.
# Roda SOZINHO na arvore (nada le a arvore enquanto roda). SO=<trecho> roda so as mutacoes cujo texto contem o trecho.
# O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
# 1a passada 58/66: uma viva era codigo redundante (o MOD isolado, que o COLUNA ja cobre) e saiu; o codigo da tipologia no lugar da descricao que falta
# no PDF do orcamento saiu tambem; as outras ganharam teste, e a suite da persiana entrou na lista.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
PURAS = [U + x for x in ['descricao-para-o-vendedor.test.ts', 'quantidade-de-modulos.test.ts', 'tipologia-padrao-atributo-por-atributo.test.ts', 'arquivo-do-levantamento.test.ts',
         'folha-do-levantamento.test.ts', 'atendimentos-ia-arquivo-do-orcamento-servidor.test.ts', 'levantamento-em-montagem.test.ts',
         'persiana-e-pano-confirmado.test.ts']]
TODAS = PURAS + [U + 'atendimentos-ia-levantamento-por-nome.test.ts']
L = 'src/lib/atendimentos-ia/'
DV, TP, CI, AL, FL, AO, ET, LM = (L + x for x in ['descricao-para-o-vendedor.ts', 'tipologia-padrao.ts', 'conversa-da-ia.ts', 'arquivo-do-levantamento.ts', 'folha-do-levantamento.ts',
                                                  'arquivo-do-orcamento-servidor.ts', 'escolhas-da-tipologia.ts', 'levantamento-em-montagem.ts'])
M = [
 # os trechos da descricao
 (DV, "const DE_MODULACAO = /\\bMODULA[ÇC][ÃA]O\\b|\\bCOLUNA\\b/i", "const DE_MODULACAO = /\\bMODULA[ÇC][ÃA]O\\b/i"),
 (DV, "const DE_MODULACAO = /\\bMODULA[ÇC][ÃA]O\\b|\\bCOLUNA\\b/i", "const DE_MODULACAO = /\\bCOLUNA\\b/i"),
 (DV, "    const meio = trechos.slice(1, -1).filter((x) => x !== '')", "    const meio = trechos.slice(1).filter((x) => x !== '')"),
 (DV, "    const meio = trechos.slice(1, -1).filter((x) => x !== '')", "    const meio = trechos.slice(1, -1)"),
 (DV, "tem: meio.filter((x) => !DE_MODULACAO.test(x)),", "tem: meio,"),
 (DV, "        linha: trechos.length > 1 ? trechos[trechos.length - 1] : null,", "        linha: null,"),
 (DV, "        if (lido[sentido] !== null) return null\n", ""),
 (DV, "        if (!p) return null\n", "        if (!p) continue\n"),
 # a descricao resolvida
 (DV, "        return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : semValor === 'omite' ? null : semValor", "        return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : semValor === 'omite' ? null : semValor"),
 (DV, "        return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : semValor === 'omite' ? null : semValor", "        return typeof v === 'number' && v > 0 ? v : semValor === 'omite' ? null : semValor"),
 (DV, "        return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : semValor === 'omite' ? null : semValor", "        return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 'a_definir'"),
 (DV, "q === 'aberta' ? [`módulos ${sentido}`] : q !== null && q >= 2 ?", "q === 'aberta' ? [`módulos ${sentido}`] : q !== null && q >= 1 ?"),
 (DV, "q === 'aberta' ? [`módulos ${sentido}`] : q !== null && q >= 2 ?", "q === 'aberta' ? [] : q !== null && q >= 2 ?"),
 (DV, "    const comOQueTem = (nome: string) => [nome, ...tem.map(comInicialMaiuscula)].join(' | ')", "    const comOQueTem = (nome: string) => nome"),
 (DV, "    if (principal === '') return null\n", ""),
 (DV, "const doisDigitos = (n: number) => String(n).padStart(2, '0')", "const doisDigitos = (n: number) => String(n)"),
 (DV, "semValor: 'omite' | 'aberta' = 'omite'): string | null => descricaoParaOVendedor(descricao, null, semValor)", "semValor: 'omite' | 'aberta' = 'aberta'): string | null => descricaoParaOVendedor(descricao, null, semValor)"),
 # as candidatas
 (DV, "        const repetido = nomes.some((outro, j) => j !== k && outro === nome)", "        const repetido = true"),
 (DV, "        const repetido = nomes.some((outro, j) => j !== k && outro === nome)", "        const repetido = false"),
 (DV, "        return repetido && tipo !== '' ? `${nome} (${tipo})` : nome", "        return repetido ? `${nome} (${tipo})` : nome"),
 (DV, "    const nomes = descricoes.map((d) => nomeDaCandidata(d, semValor) ?? '')", "    const nomes = descricoes.map((d) => nomeDaCandidata(d) ?? '')"),
 # os valores dos modulos do item
 (DV, "        if (typeof dita === 'number' && Number.isInteger(dita) && dita > 0) { valores[variavel] = dita; continue }", "        if (typeof dita === 'number' && Number.isInteger(dita) && dita >= 0) { valores[variavel] = dita; continue }"),
 (DV, "        if (typeof dita === 'number' && Number.isInteger(dita) && dita > 0) { valores[variavel] = dita; continue }", "        if (typeof dita === 'number' && dita > 0) { valores[variavel] = dita; continue }"),
 (DV, "        if (typeof dita === 'number' && Number.isInteger(dita) && dita > 0) { valores[variavel] = dita; continue }", ""),
 (DV, "        if (/^\\d+$/.test(padrao) && Number(padrao) > 0) valores[variavel] = Number(padrao)", "        if (/^\\d+$/.test(padrao)) valores[variavel] = Number(padrao)"),
 (DV, "        if (/^\\d+$/.test(padrao) && Number(padrao) > 0) valores[variavel] = Number(padrao)", "        if (Number(padrao) > 0) valores[variavel] = Number(padrao)"),
 (DV, "        if (/^\\d+$/.test(padrao) && Number(padrao) > 0) valores[variavel] = Number(padrao)", ""),
 # as frases do padrao
 (TP, "        partes.push(total === 1 ? a.tipo : `${a.tipo}, ${total} módulos`)", "        partes.push(`${a.tipo}, ${total} módulos`)"),
 (TP, "nomesDasCandidatas(cs.map((c) => c.descricao), 'aberta')", "nomesDasCandidatas(cs.map((c) => c.descricao))"),
 (TP, "fraseDosModulosDitos(ditos.modulos, nomesDasOpcoes(opcoes))", "fraseDosModulosDitos(ditos.modulos, opcoes.map((c) => c.descricao ?? ''))"),
 (TP, "nomesDasTipologias(fora)[fora.indexOf(escolhida)] ?? nomesDasTipologias([escolhida])[0]", "nomesDasTipologias([escolhida])[0]"),
 (TP, "`“${nomesDasTipologias(fora)[k]}” (${limiteNaFrase(c)})`", "`“${nomesDasTipologias([c])[0]}” (${limiteNaFrase(c)})`"),
 (TP, "descricao: nomesDasTipologias([escolhida.c])[0]", "descricao: escolhida.c.descricao ?? ''"),
 (TP, "descricoes: nomesDasOpcoes(restantes.map(({ c }) => c))", "descricoes: restantes.map(({ c }) => c.descricao ?? '')"),
 # a conversa
 (CI, "nomeDe(e) ?? 'tipologia sem descrição no motor'", "String(e.tipologia)"),
 (CI, "?.descricao, modulosDaProposta(e.escolhas), 'omite')", "?.descricao, null, 'omite')"),
 (CI, "?.descricao, modulosDaProposta(e.escolhas), 'omite')", "?.descricao, modulosDaProposta(e.escolhas))"),
 (CI, "            const modulos = modulosNaoDitos(def, item.escolhas)", "            const modulos: Record<string, number> = {}"),
 (CI, "            return { ...item, escolhas: { ...(item.escolhas ?? {}), ...acrescentadas, ...modulos } }", "            return { ...item, escolhas: { ...(item.escolhas ?? {}), ...acrescentadas } }"),
 (CI, "            return { ...item, escolhas: { ...(item.escolhas ?? {}), ...acrescentadas, ...modulos } }", "            return { ...item, escolhas: { ...modulos, ...acrescentadas } }"),
 (CI, "            if (Object.keys(acrescentadas).length === 0 && Object.keys(modulos).length === 0) return item", "            if (Object.keys(acrescentadas).length === 0) return item"),
 # a gravacao dos modulos
 (ET, "export const MODULOS_QUANDO_NAO_DITO = 1", "export const MODULOS_QUANDO_NAO_DITO = 2"),
 (ET, "const DESCRICAO_DA_QUANTIDADE_DE_MODULOS = /^QUANTIDADE DE M[ÓO]DULOS (HORIZONTAIS|VERTICAIS)$/i", "const DESCRICAO_DA_QUANTIDADE_DE_MODULOS = /^QUANTIDADE DE M[ÓO]DULOS (HORIZONTAIS)$/i"),
 (ET, "const DESCRICAO_DA_QUANTIDADE_DE_MODULOS = /^QUANTIDADE DE M[ÓO]DULOS (HORIZONTAIS|VERTICAIS)$/i", "const DESCRICAO_DA_QUANTIDADE_DE_MODULOS = /QUANTIDADE DE M[ÓO]DULOS/i"),
 (ET, " && !(opcoesDaVariavel(v.opcoes)?.length))\n        .map((v) => v.variavel)", ")\n        .map((v) => v.variavel)"),
 (ET, "return !(typeof g === 'number' && Number.isInteger(g) && g > 0) })", "return !(typeof g === 'number') })"),
 (ET, "return !(typeof g === 'number' && Number.isInteger(g) && g > 0) })", "return true })"),
 (ET, "    if (typeof variavel !== 'string' || !variaveisDeQuantidadeDeModulos(tipologia).includes(variavel)) return null", "    if (typeof variavel !== 'string') return null"),
 (ET, "includes(variavel)) return null\n    if (typeof opcao !== 'number' || !Number.isInteger(opcao) || opcao <= 0) return null", "includes(variavel)) return null\n    if (typeof opcao !== 'number' || !Number.isInteger(opcao) || opcao < 0) return null"),
 (ET, "includes(variavel)) return null\n    if (typeof opcao !== 'number' || !Number.isInteger(opcao) || opcao <= 0) return null", "includes(variavel)) return null\n    if (typeof opcao !== 'number' || opcao <= 0) return null"),
 (ET, " || (deModulos.has(k) && v > 0) || ", " || "),
 (ET, " || (deModulos.has(k) && v > 0) || ", " || (deModulos.has(k)) || "),
 (LM, "        if (modulos) { propostos += 1; alvo.escolhas = { ...(alvo.escolhas ?? {}), [modulos.variavel]: modulos.valor }; continue }", "        if (modulos) { propostos += 1; continue }"),
 # a folha e o arquivo
 (AL, "(v) => a.definicao(i)?.variaveis.find((x) => x.variavel === v)?.padrao)) ?? '',", "() => null)) ?? '',"),
 (AL, "(v) => a.definicao(i)?.variaveis.find((x) => x.variavel === v)?.padrao)) ?? '',", "(v) => a.definicao(i)?.variaveis.find((x) => x.variavel === v)?.padrao)) ?? i.tipologia ?? '',"),
 (AL, "            nome: descricaoParaOVendedor(d?.descricao, valoresDosModulos(d?.descricao, i.escolhas,", "            nome: descricaoParaOVendedor(d?.descricao, valoresDosModulos(d?.descricao, null,"),
 (AL, "${i.tipologia}${i.nome ? ` (${i.nome})` : ''}, ${i.quantidade} unidade(s)", "${i.tipologia}, ${i.quantidade} unidade(s)"),
 (AL, "${i.tipologia}${i.nome ? ` (${i.nome})` : ''}, ${i.quantidade} unidade(s)", "${i.tipologia} (${i.nome}), ${i.quantidade} unidade(s)"),
 (FL, "    doc.text(`Item ${i.ordem}`, cx + 1.5, y + 3.3)", "    doc.text(`Item ${i.ordem} · ${i.tipologia}`, cx + 1.5, y + 3.3)"),
 (FL, "    linhasDoNome(doc, i.nome, COLUNAS.item - 3)", "    linhasDoNome(doc, i.descricao, COLUNAS.item - 3)"),
 (FL, "    const k = comCaixa.indexOf('|')", "    const k = comCaixa.lastIndexOf('|')"),
 (FL, "const nomeDoItem = (i: Pick<ItemDaFolha, 'ordem'>) => `Item ${i.ordem}`", "const nomeDoItem = (i: Pick<ItemDaFolha, 'ordem' | 'tipologia'>) => `Item ${i.ordem} (${i.tipologia})`"),
 (AO, "valoresDosModulos(d?.descricao, escolhas, (v) => def?.variaveis.find((x) => x.variavel === v)?.padrao)),", "valoresDosModulos(d?.descricao, null, (v) => def?.variaveis.find((x) => x.variavel === v)?.padrao)),"),
 (AO, "valoresDosModulos(d?.descricao, escolhas, (v) => def?.variaveis.find((x) => x.variavel === v)?.padrao)),", "valoresDosModulos(d?.descricao, escolhas)),"),
 (AO, "valoresDosModulos(d?.descricao, escolhas, (v) => def?.variaveis.find((x) => x.variavel === v)?.padrao)),", "valoresDosModulos(d?.descricao, escolhas, (v) => def?.variaveis.find((x) => x.variavel === v)?.padrao)) ?? tipologia,"),
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
        # a conversa e a montagem so se exercitam de ponta a ponta na suite grande; o resto, nas puras
        r = subprocess.run(['npx', 'jest', *(TODAS if arq in (CI, LM, ET, TP, AL, FL) else PURAS)], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:70].replace('\n', ' ') + '  =>  ' + b[:70].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
