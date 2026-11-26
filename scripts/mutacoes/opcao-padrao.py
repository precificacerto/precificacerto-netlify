import subprocess, sys, os
# MUTACOES do pedido 0030 (dono do produto, 26/11/2026): a opcao que veio por PADRAO e nao vale no item da lugar a que vale (a unica, ou a primeira
# na ordem das opcoes), com a troca no rastro; a dita pelo vendedor continua recusa, e a resposta junta as linhas numa pergunta so.
# Roda SOZINHO na arvore (nada le a arvore enquanto roda). SO=<trecho> roda so as mutacoes cujo texto contem o trecho.
# O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
# 1a passada 15/16: a guarda contra a troca repetida era redundante (a memoria das variaveis ja garante uma avaliacao por variavel) e saiu,
# com a mutacao dela; 15/15.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'avaliador-regras-do-wvetro.test.ts', U + 'levantamento-da-conversa.test.ts']
L = 'src/lib/atendimentos-ia/'
AV, LB, LC = (L + 'avaliador-de-formulas.ts', L + 'levantamento-de-barras.ts', L + 'levantamento-da-conversa.ts')
M = [
 (AV, "                if (validas.length > 0 && (ctx.entrada.escolhasPorPadrao ?? []).includes(nome)) {", "                if (false) {"),
 (AV, "                if (validas.length > 0 && (ctx.entrada.escolhasPorPadrao ?? []).includes(nome)) {", "                if ((ctx.entrada.escolhasPorPadrao ?? []).includes(nome)) {"),
 (AV, "                if (validas.length > 0 && (ctx.entrada.escolhasPorPadrao ?? []).includes(nome)) {", "                if (validas.length > 0) {"),
 (AV, "                    const para = validas[0]", "                    const para = validas[validas.length - 1]"),
 (AV, "motivo: validas.length === 1 ? 'unica_valida_padrao_invalido' : 'primeira_valida_padrao_invalido' })", "motivo: 'unica_valida_padrao_invalido' })"),
 (AV, "                    return deNumero(para) as Q", "                    return deNumero(escolha) as Q"),
 (AV, "    return { ok: true, pecas, linhas, avisos, insumos, vidros, faltas, trocas: ctx.trocas }", "    return { ok: true, pecas, linhas, avisos, insumos, vidros, faltas, trocas: [] }"),
 (LB, "            ...(e.escolhasPorPadrao ? { escolhasPorPadrao: e.escolhasPorPadrao } : {}) })", "            })"),
 (LB, "        trocas.push(...r.trocas.map((t) => ({ ...t, esquadria: indice })))", ""),
 (LC, "            escolhasPorPadrao: Object.entries(decididas[k].origem).filter(([, o]) => o !== 'vendedor').map(([v]) => v),", ""),
 (LC, "            escolhasPorPadrao: Object.entries(decididas[k].origem).filter(([, o]) => o !== 'vendedor').map(([v]) => v),", "            escolhasPorPadrao: Object.keys(decididas[k].origem),"),
 (LC, "        rastro.push(...r.trocas.map((t) =>", "        void (r.trocas.map((t) =>"),
 (LC, "faltas: juntarEscolhasQueNaoValem([...recusas.map(frase), ...semTempo.map((t) => t.frase), ...precoQueFalta]), rotulos,", "faltas: [...recusas.map(frase), ...semTempo.map((t) => t.frase), ...precoQueFalta], rotulos,"),
 (LC, "        if (vistas.has(chave)) continue", ""),
 (LC, "        const chave = `${item ?? ''}|${m[1]}|${m[2]}`", "        const chave = `${m[1]}|${m[2]}`"),
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
