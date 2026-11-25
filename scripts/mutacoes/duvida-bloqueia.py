import subprocess, sys, os
# MUTACOES do pedido 0026 (dono do produto, 25/11/2026): a lista inteira substitui; a duvida aberta bloqueia a entrega; a tipologia do modelo nao
# entra no item com pedido em aberto; os modulos escritos na linha do item; a contagem que nao fecha nao grava.
# Roda SOZINHO na arvore (nada le a arvore enquanto roda). SO=<trecho> roda so as mutacoes cujo texto contem o trecho.
# O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
# 1a passada 25/36: a condicao do numero de itens na contagem era redundante com a das unidades (a esquadria que se perde leva as unidades dela) e
# saiu, com o filtro dos itens montados; as outras vivas ganharam teste.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'atendimentos-ia-levantamento-por-nome.test.ts', U + 'levantamento-em-montagem.test.ts', U + 'quantidade-de-modulos.test.ts']
L = 'src/lib/atendimentos-ia/'
CI, LM, ET, PA = (L + x for x in ['conversa-da-ia.ts', 'levantamento-em-montagem.ts', 'escolhas-da-tipologia.ts', 'pergunta-em-aberto.ts'])
M = [
 # a lista inteira substitui
 (CI, "export const ehListaInteira = (esquadrias: ReadonlyArray<Record<string, unknown>>) => esquadrias.filter(esquadriaInteira).length >= 2", "export const ehListaInteira = (esquadrias: ReadonlyArray<Record<string, unknown>>) => esquadrias.filter(esquadriaInteira).length >= 1"),
 (CI, "export const ehListaInteira = (esquadrias: ReadonlyArray<Record<string, unknown>>) => esquadrias.filter(esquadriaInteira).length >= 2", "export const ehListaInteira = (esquadrias: ReadonlyArray<Record<string, unknown>>) => esquadrias.filter(esquadriaInteira).length >= 3"),
 (CI, "        if (alvo !== null && rastro.rota !== 'MONTAGEM' && alvo.itens.length > 0 && intencao === null && ehListaInteira(emEspera)) intencao = 'substituir'\n", ""),
 (CI, "        if (alvo !== null && rastro.rota !== 'MONTAGEM' && alvo.itens.length > 0 && intencao === null && ehListaInteira(emEspera)) intencao = 'substituir'", "        if (alvo !== null && rastro.rota !== 'MONTAGEM' && alvo.itens.length > 0 && ehListaInteira(emEspera)) intencao = 'substituir'"),
 (CI, "        if (alvo !== null && rastro.rota !== 'MONTAGEM' && alvo.itens.length > 0 && intencao === null && ehListaInteira(emEspera)) intencao = 'substituir'", "        if (alvo !== null && alvo.itens.length > 0 && intencao === null && ehListaInteira(emEspera)) intencao = 'substituir'"),
 (CI, "        const atuais = alvo && !substituir ? alvo.itens : [itemVazio(1)]", "        const atuais = alvo ? alvo.itens : [itemVazio(1)]"),
 (CI, "proposta.alteracao === 'substituir' ? 'substituir' : null", "null"),
 (CI, "            || (substituir && nadaMudou)", "            || false"),
 # a duvida aberta nao se resolve sozinha
 (CI, "        const semTrocaPeloModelo = pedidosAbertos.size === 0 ? naLinhaPadrao : naLinhaPadrao.map((raw) => {", "        const semTrocaPeloModelo = true ? naLinhaPadrao : naLinhaPadrao.map((raw) => {"),
 (CI, "            if (ordem !== null && !pedidosAbertos.has(ordem)) return raw\n            // a MESMA tipologia", "            // a MESMA tipologia"),
 (CI, "            if (dosPedidos.includes(r.tipologia)) return raw\n", ""),
 (CI, "            rastro.tipologiasDoModeloRecusadas += 1\n", ""),
 (CI, "            delete semTipologia.tipologia\n", ""),
 (CI, "return l && pedidoEmAberto(l, i) ? [[i.ordem, l]] : [] }))", "return l ? [[i.ordem, l]] : [] }))"),
 (CI, "            if (item.tipologia === null && pedidoDoItem && pedidoEmAberto(pedidoDoItem, item) && !negados.includes(item.ordem)) {", "            if (false) {"),
 (CI, "            if (item.tipologia === null && pedidoDoItem && pedidoEmAberto(pedidoDoItem, item) && !negados.includes(item.ordem)) {", "            if (item.tipologia === null && pedidoDoItem && !negados.includes(item.ordem)) {"),
 (CI, "            if (item.tipologia === null && pedidoDoItem && pedidoEmAberto(pedidoDoItem, item) && !negados.includes(item.ordem)) {", "            if (item.tipologia === null && pedidoDoItem && pedidoEmAberto(pedidoDoItem, item)) {"),
 (CI, "            if (pedidosDeLimite.length > 1) {", "            if (false) {"),
 (CI, "            } else if (item.tipologia === null && limites !== 'sem_migracao' && proposta_.recusas.some((r) => r.ordem === item.ordem && r.motivo === 'LIMITES' && origemDaTipologiaProposta(r.tipologia, c.texto) === 'dito')) {", "            } else if (false) {"),
 (CI, "r.motivo === 'LIMITES' && origemDaTipologiaProposta(r.tipologia, c.texto) === 'dito')) {", "r.motivo === 'LIMITES')) {"),
 (CI, "                const resto = pendencias.filter((p) => !(p.tipo === 'CAMPO' && p.campo === 'tipologia' && jaDitos.has(p.ordem)))\n                const linhas = [\n", "                const resto = pendencias\n                const linhas = [\n"),
 # os modulos escritos na linha do item
 (LM, "...(ordemValida(b.modulos_horizontais) ? { horizontais: b.modulos_horizontais } : {}),", "...{},"),
 (LM, "...(ordemValida(b.modulos_verticais) ? { verticais: b.modulos_verticais } : {}) }", "...{} }"),
 (LM, "...(ordemValida(b.modulos_verticais) ? { verticais: b.modulos_verticais } : {}) }", "...(typeof b.modulos_verticais === 'number' ? { verticais: b.modulos_verticais } : {}) }"),
 (ET, "    const alvo = sentido === 'horizontais' ? 'HORIZONTAIS' : 'VERTICAIS'", "    const alvo = sentido === 'horizontais' ? 'VERTICAIS' : 'HORIZONTAIS'"),
 (ET, "?.[1]?.toUpperCase() === alvo && !(opcoesDaVariavel(x.opcoes)?.length))\n    return v ? v.variavel : null", "?.[1]?.toUpperCase() === alvo)\n    return v ? v.variavel : null"),
 (CI, "                if (variavel !== null && quantos !== undefined) escritos[variavel] = quantos\n", ""),
 (CI, "            const modulos = modulosNaoDitos(def, { ...(item.escolhas ?? {}), ...escritos })", "            const modulos = modulosNaoDitos(def, item.escolhas)"),
 (CI, "            return { ...item, escolhas: { ...(item.escolhas ?? {}), ...acrescentadas, ...escritos, ...modulos } }", "            return { ...item, escolhas: { ...(item.escolhas ?? {}), ...acrescentadas, ...modulos } }"),
 (CI, "            if (Object.keys(acrescentadas).length === 0 && Object.keys(modulos).length === 0 && Object.keys(escritos).length === 0) return item", "            if (Object.keys(acrescentadas).length === 0 && Object.keys(modulos).length === 0) return item"),
 (PA, "'obs', 'modulos_horizontais', 'modulos_verticais']", "'obs']"),
 # a contagem que nao fecha
 (CI, "        if (ehListaInteira(emEspera) && (alvo === null || substituir)) {", "        if (false) {"),
 (CI, "        if (ehListaInteira(emEspera) && (alvo === null || substituir)) {", "        if (ehListaInteira(emEspera) && (alvo === null)) {"),
 (CI, "        if (ehListaInteira(emEspera) && (alvo === null || substituir)) {", "        if (ehListaInteira(emEspera) && (substituir)) {"),
 (CI, "            if (somaMontada !== somaLida) return", "            if (false) return"),
 (CI, "Number.isInteger(e.quantidade) && e.quantidade > 0 ? e.quantidade : 1), 0)", "Number.isInteger(e.quantidade) && e.quantidade > 0 ? e.quantidade : 0), 0)"),
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
