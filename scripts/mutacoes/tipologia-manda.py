import subprocess, sys, os
# MUTACOES da regra 'a tipologia manda' (22/11/2026): o padrao da tipologia quando a lista nao tem a opcao da politica. Roda SOZINHO na arvore.
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
 (PE, "if (achadas.length === 0 && !opcoes.some((o) => { const r = forma(o.rotulo); return r !== '' && texto.startsWith(r) })) {", "if (achadas.length === 0) {"),
 (PE, "if (achadas.length === 0 && !opcoes.some((o) => { const r = forma(o.rotulo); return r !== '' && texto.startsWith(r) })) {", "if (!opcoes.some((o) => { const r = forma(o.rotulo); return r !== '' && texto.startsWith(r) })) {"),
 (PE, "if (achadas.length === 0 && !opcoes.some((o) => { const r = forma(o.rotulo); return r !== '' && texto.startsWith(r) })) {", "if (achadas.length === 0 && !opcoes.some((o) => { const r = forma(o.rotulo); return texto.startsWith(r) })) {"),
 (PE, "const padrao = /^\\d+$/.test(p) ? opcoes.find((o) => o.valor === Number(p)) : undefined", "const padrao = opcoes[0]"),
 (PE, "const padrao = /^\\d+$/.test(p) ? opcoes.find((o) => o.valor === Number(p)) : undefined", "const padrao = opcoes.find((o) => o.valor === Number(p))"),
 (PE, "return { valor: padrao.valor, campo: v.variavel, pelaTipologia:", "return { valor: padrao.valor, campo: v.variavel, xpelaTipologia:"),
 (FR, "origem[v.variavel] = t.ajuste !== undefined ? 'politica_ajuste_em_obra' : t.pelaTipologia !== undefined ? 'tipologia' : 'politica'", "origem[v.variavel] = t.ajuste !== undefined ? 'politica_ajuste_em_obra' : 'politica'"),
 (FR, "            if (t.pelaTipologia !== undefined) pelaTipologia.push({ variavel: v.variavel, motivo: t.pelaTipologia })\n", ""),
 (LC, "    rastro.push(...dg.esquadrias.flatMap((e, k) => decididas[k].pelaTipologia.map(", "    rastro.slice(...dg.esquadrias.flatMap((e, k) => decididas[k].pelaTipologia.map("),
 (ET, "tipologia: 'a opção da política não cabe nesta tipologia: o padrão dela', ", ""),
 (TN, "        else if ('pelaTipologia' in t && t.pelaTipologia !== undefined) out.pelaTipologia.push(tipologia)\n", ""),
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
