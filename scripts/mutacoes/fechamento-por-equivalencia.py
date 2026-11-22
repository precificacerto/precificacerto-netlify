import subprocess, sys, os
# MUTACOES do fechamento (22/11/2026): a equivalencia pela ausencia de chave e o 'com chave' do vendedor. Roda SOZINHO na arvore.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/escolhas-da-tipologia.test.ts', 'src/utils/__tests__/fronteira-das-escolhas.test.ts', 'src/utils/__tests__/levantamento-da-conversa.test.ts', 'src/utils/__tests__/tela-da-natureza.test.ts',
     'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
PE = 'src/lib/atendimentos-ia/politica-da-empresa.ts'
FR = 'src/lib/atendimentos-ia/fronteira-das-escolhas.ts'
LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
TN = 'src/lib/atendimentos-ia/tela-da-natureza.ts'
CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
PA = 'src/lib/atendimentos-ia/pergunta-em-aberto.ts'
LM = 'src/lib/atendimentos-ia/levantamento-em-montagem.ts'
ET = 'src/lib/atendimentos-ia/escolhas-da-tipologia.ts'
M = [
 (PE, "if (achadas.length === 0 && texto.endsWith('SEMCHAVE') && !opcoes.some((o) => forma(o.rotulo).includes('CHAVE'))) {", "if (achadas.length === 0 && !booleano && texto.endsWith('SEMCHAVE')) {"),
 (PE, "if (achadas.length === 0 && texto.endsWith('SEMCHAVE') && !opcoes.some((o) => forma(o.rotulo).includes('CHAVE'))) {", "if (achadas.length === 0 && !opcoes.some((o) => forma(o.rotulo).includes('CHAVE'))) {"),
# EQUIVALENTE, fora da bateria: tirar `!booleano` -- o texto SIM/NAO nunca termina em SEMCHAVE; a condicao saiu do codigo.
 (PE, "const iguais = opcoes.filter((o) => forma(o.rotulo) === semAChave)", "const iguais = opcoes.filter((o) => semAChave.startsWith(forma(o.rotulo)))"),
 (PE, "        if (iguais.length === 1) {", "        if (iguais.length >= 1) {"),
 (PE, "return { valor: iguais[0].valor, campo: v.variavel, equivalencia:", "return { valor: iguais[0].valor, campo: v.variavel, xequivalencia:"),
 (FR, "            if (t.equivalencia !== undefined) equivalencias.push({ variavel: v.variavel, motivo: t.equivalencia })\n", ""),
 (LC, "    rastro.push(...dg.esquadrias.flatMap((e, k) => decididas[k].equivalencias.map(", "    rastro.slice(...dg.esquadrias.flatMap((e, k) => decididas[k].equivalencias.map("),
 (LC, "        rastro: rastroDoCalculo,\n", ""),
 (CV, "                + (e.rastro?.length ? ` rastro=${listaNoLog(e.rastro)}` : '')", "                + ''"),
 (CV, "                + (e.rastro?.length ? ` rastro=${listaNoLog(e.rastro)}` : '')", "                + ` rastro=${listaNoLog(e.rastro ?? [])}`"),
 (ET, "    if (!capturada(variavel) && !doItem(variavel)) return null", "    if (!capturada(variavel)) return null"),
 (ET, "    return [...ESCOLHAS_CAPTURADAS, ...ESCOLHAS_DO_ITEM].map((v) => escolhaPedida(tipologia, v))", "    return ESCOLHAS_CAPTURADAS.map((v) => escolhaPedida(tipologia, v))"),
 (ET, "if (capturada(k) || (doItem(k) && v > 0) ||", "if (capturada(k) ||"),
 (ET, "if (capturada(k) || (doItem(k) && v > 0) ||", "if (capturada(k) || doItem(k) ||"),
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
