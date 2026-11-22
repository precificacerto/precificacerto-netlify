import subprocess, sys, os
# MUTACOES das decisoes do PO de 21/11/2026 (a MAE sem VAO+50 e o alterar x acrescentar). Roda SOZINHO na arvore.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/fronteira-das-escolhas.test.ts', 'src/utils/__tests__/levantamento-da-conversa.test.ts', 'src/utils/__tests__/tela-da-natureza.test.ts',
     'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
PE = 'src/lib/atendimentos-ia/politica-da-empresa.ts'
FR = 'src/lib/atendimentos-ia/fronteira-das-escolhas.ts'
LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
TN = 'src/lib/atendimentos-ia/tela-da-natureza.ts'
CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
PA = 'src/lib/atendimentos-ia/pergunta-em-aberto.ts'
LM = 'src/lib/atendimentos-ia/levantamento-em-montagem.ts'
M = [
# EQUIVALENTE, fora da bateria: `achadas.length <= 1` -- com uma opcao casando, a funcao ja devolveu na linha de cima.
 (PE, "if (achadas.length === 0 && VARIAVEIS_COM_AJUSTE_EM_OBRA.has(v.variavel)) {", "if (achadas.length === 0) {"),
 (PE, "return r.includes('AJUSTEEMOBRA') && r.includes('CORTE90/90') && m ?", "return r.includes('AJUSTEEMOBRA') && m ?"),
 (PE, "return r.includes('AJUSTEEMOBRA') && r.includes('CORTE90/90') && m ?", "return r.includes('CORTE90/90') && m ?"),
 (PE, "(b.mm < a.mm || (b.mm === a.mm && b.o.valor < a.o.valor) ? b : a)", "(b.mm > a.mm ? b : a)"),
 (PE, "const primeira = opcoes.find((o) => o.valor === 1)", "const primeira = opcoes[opcoes.length - 1]"),
 (FR, "origem[v.variavel] = t.ajuste === undefined ? 'politica' : 'politica_ajuste_em_obra'", "origem[v.variavel] = 'politica'"),
 (FR, "if (t.ajuste !== undefined) ajustes.push({ variavel: v.variavel, motivo: t.ajuste })", ""),
 (LC, "    rotulos.push(...ajustesEmObra.map(({ e, a }) => fraseDoAjusteEmObra(e.numero, d.esquadrias.length, a.motivo)))\n", ""),
 (TN, "if ('ajuste' in t && t.ajuste !== undefined) out.ajuste.push(tipologia)", "if (false) out.ajuste.push(tipologia)"),
 (PA, "if (b.intencao === 'alterar' && typeof b.ordem === 'number'", "if (typeof b.ordem === 'number'"),
 (PA, "if (b.intencao === 'alterar' || b.intencao === 'acrescentar') campos.intencao = b.intencao", ""),
 (LM, "        if (ctx.acrescentar === true) {", "        if (false) {"),
 (CV, "const intencaoDita: IntencaoNoLevantamento | null = proposta.alteracao === true || proposta.alteracao === 'alterar' ? 'alterar'", "const intencaoDita: IntencaoNoLevantamento | null = proposta.alteracao === 'alterar' ? 'alterar'"),
 (CV, "        if (alvo !== null && (alvo.estado !== EM_MONTAGEM || daPergunta) && alvo.itens.length > 0 && intencao === null && algumaNova) {", "        if (false) {"),
 (CV, "        const algumaNova = alvo !== null && !(alvo.itens.some((i) => ordensDitas.has(i.ordem)))", "        const algumaNova = alvo !== null"),
 (CV, "emEspera.some((e) => inteira(e) && !alvo!.itens.some", "emEspera.some((e) => !alvo!.itens.some"),
 (CV, "        if (intencao === null && confirmouAcrescimo) intencao = 'acrescentar'", ""),
 (CV, "if (numero !== undefined && k >= 0) juncao.itens[k] =", "if (false) juncao.itens[k] ="),
 (CV, "        if (daPergunta && alvo && !nadaMudou && !confirmado && !respondeuAPergunta && intencao !== 'alterar') {", "        if (daPergunta && alvo && !nadaMudou && !confirmado && !respondeuAPergunta) {"),
 (CV, "        if (daPergunta && alvo && !nadaMudou && !confirmado && !respondeuAPergunta && intencao !== 'alterar') {", "        if (daPergunta && alvo && !nadaMudou && !confirmado && intencao !== 'alterar') {"),
 (CV, "texto: soAcrescentar(p.itens) ? fraseDeConfirmarAcrescimo(", "texto: true ? fraseDeConfirmarAcrescimo("),
]
mortas = 0
for arq, a, b in M:
    s = open(R + arq).read()
    if s.count(a) != 1: print('ABORTA', arq, a[:70], s.count(a)); sys.exit(3)
    open(R + arq, 'w').write(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', *T], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:90].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
