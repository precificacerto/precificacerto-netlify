import subprocess, sys, os
# MUTACOES do pedido 0028 (dono do produto, 25/11/2026): o agente distingue acrescimo de alteracao item a item; nunca a lista na conversa;
# a linha do que foi feito; a lista completa substitui; duas fotos da rajada, uma pergunta so e as retidas juntas pelo numero.
# Roda SOZINHO na arvore (nada le a arvore enquanto roda). SO=<trecho> roda so as mutacoes cujo texto contem o trecho.
# O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'atendimentos-ia-levantamento-por-nome.test.ts']
L = 'src/lib/atendimentos-ia/'
CI, AA, PA = (L + x for x in ['conversa-da-ia.ts', 'acrescimo-ou-alteracao.ts', 'pergunta-em-aberto.ts'])
M = [
 # a funcao pura
 (AA, "const outraTipologia = comTipologia(e) && e.tipologia !== doNumero.tipologia", "const outraTipologia = false"),
 (AA, "const corresponde = !outraTipologia || esquadriasEquivalentes(e, comoProposta(doNumero)) || mesmoAmbiente(doNumero)", "const corresponde = !outraTipologia || esquadriasEquivalentes(e, comoProposta(doNumero))"),
 (AA, "{ tipo: 'alterar', ordem: doNumero.ordem, inteira: comTipologia(e) } : { tipo: 'ambiguo', ordem: doNumero.ordem })", "{ tipo: 'alterar', ordem: doNumero.ordem, inteira: true } : { tipo: 'ambiguo', ordem: doNumero.ordem })"),
 (AA, "        if (!inteira) return null\n", ""),
 (AA, "        if (iguais.length === 1) { destinos.push({ tipo: 'alterar', ordem: iguais[0].ordem, inteira: comTipologia(e) }); continue }\n", ""),
 (AA, "        if (iguais.length > 1) { destinos.push({ tipo: 'ambiguo', ordem: null }); continue }\n", ""),
 (AA, "const alvo = mesmaTipologia.length === 1 ? mesmaTipologia[0] : doAmbiente.length === 1 ? doAmbiente[0] : null", "const alvo = mesmaTipologia.length === 1 ? mesmaTipologia[0] : null"),
 (AA, "(contagem.get(d.ordem) ?? 0) > 1 ? { tipo: 'ambiguo', ordem: d.ordem } : d))", "false ? { tipo: 'ambiguo', ordem: d.ordem } : d))"),
 (AA, "    for (const k of ['ordem', 'numero'] as const) {", "    for (const k of ['ordem'] as const) {"),
 # a conversa
 (CI, "            return correspondentes >= Math.max(2, alvo.itens.length - 1) || (inteirasDaLista >= 3 && inteirasDaLista >= alvo.itens.length - 1)", "            return correspondentes >= 1 || (inteirasDaLista >= 3 && inteirasDaLista >= alvo.itens.length - 1)"),
 (CI, "            return correspondentes >= Math.max(2, alvo.itens.length - 1) || (inteirasDaLista >= 3 && inteirasDaLista >= alvo.itens.length - 1)", "            return correspondentes >= Math.max(2, alvo.itens.length - 1) || (inteirasDaLista >= 2)"),
 (CI, "                if (ambiguas.length > 0 && resolverAmbiguas === null) {", "                if (false) {"),
 (CI, "resolverAmbiguas === 'alterar' && d.ordem !== null ? { tipo: 'alterar', ordem: d.ordem, inteira: true } : { tipo: 'acrescentar' }))", "{ tipo: 'acrescentar' }))"),
 (CI, "if (d.tipo === 'alterar') { if (d.inteira) refazer.add(d.ordem); return { ...semIntencao, ordem: d.ordem } }", "if (d.tipo === 'alterar') { return { ...semIntencao, ordem: d.ordem } }"),
 (CI, "const atuais = alvo && !substituir ? alvo.itens.map((i) => (refazer.has(i.ordem) ? itemVazio(i.ordem) : i)) : [itemVazio(1)]", "const atuais = alvo && !substituir ? alvo.itens : [itemVazio(1)]"),
 (CI, "        const confirmouAtualizar = confirmouAcrescimo && !soAcrescentar(retidas)", "        const confirmouAtualizar = false"),
 (CI, "            return !!doNumero && typeof e.tipologia === 'string' && e.tipologia !== '' && e.tipologia !== doNumero.tipologia", "            return false"),
 (CI, " && intencao !== 'substituir' && distinguido === null) {", " && distinguido === null) {"),
 (CI, "                return await responder(`${atualizacao ? `${atualizacao}\\n\\n` : ''}${textoDoEnvioDoArquivo(dados.numero, dados.cliente.nome)}`, 'arquivo', doArquivo)", "                return await responder(textoDoEnvioDoArquivo(dados.numero, dados.cliente.nome), 'arquivo', doArquivo)"),
 (CI, "substituidos: substituir ? aplicada.itens.length : null })", "substituidos: null })"),
 (CI, "            if (typeof item.tipologia === 'string' && origemDaTipologiaProposta(item.tipologia, textoComImagem) === 'dito') item.tipologia_dita = true\n", ""),
 (CI, "origem: origemDaTipologiaProposta(item.tipologia, textoDosCodigos) }])", "origem: origemDaTipologiaProposta(item.tipologia, c.texto) }])"),
 # a rajada
 (CI, "                    if (outra === true) {", "                    if (false) {"),
 (CI, "                    p = { ...p, itens: esquadriasDaProposta({ itens: juntarEsquadrias(agora.itens, p.itens).itens }) }\n", ""),
 (CI, "            if (c.midia && guardaPergunta && (p.pergunta === 'SEM_NOME' || p.pergunta === 'CONFIRMAR_DA_IMAGEM')) {", "            if (guardaPergunta && (p.pergunta === 'SEM_NOME' || p.pergunta === 'CONFIRMAR_DA_IMAGEM')) {"),
 (PA, "        if (k < 0 && typeof campos.numero === 'number') {", "        if (false) {"),
 (PA, "return !!r && r.numero === campos.numero && (soCompleta(r) || soCompleta(campos))", "return !!r && r.numero === campos.numero"),
 (PA, "'modulos_horizontais', 'modulos_verticais', 'numero', 'tipologia_dita']) if (!presente(fusao[c])", "'numero']) if (!presente(fusao[c])"),
 (PA, "        if (campos.ordem === undefined && typeof numero === 'number' && Number.isInteger(numero) && numero > 0) campos.numero = numero", "        if (typeof numero === 'number' && Number.isInteger(numero) && numero > 0) campos.numero = numero"),
 (PA, "        if (b.tipologia_dita === true && typeof campos.tipologia === 'string') campos.tipologia_dita = true", "        if (b.tipologia_dita && typeof campos.tipologia === 'string') campos.tipologia_dita = true"),
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
