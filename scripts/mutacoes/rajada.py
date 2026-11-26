import subprocess, sys, os
# MUTACOES do pedido 0029 (dono do produto, 25/11/2026): a rajada e um envio (a seguidora nao grava nem responde, a ultima junta tudo);
# o complemento de vidro vai ao item pelo numero; "Nao especificado" e vidro nao dito; a tipologia do modelo no complemento sai.
# Roda SOZINHO na arvore (nada le a arvore enquanto roda). SO=<trecho> roda so as mutacoes cujo texto contem o trecho.
# O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
# 1a passada 16/19: a rajada respondida que fecha a de antes, a foto que nao vira seguidora de um texto e a entrada gravada sem a
# coluna ganharam teste; 2a passada 19/19.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'atendimentos-ia-levantamento-por-nome.test.ts', U + 'atendimentos-ia-inbound.test.ts']
L = 'src/lib/atendimentos-ia/'
CI, CG, PA, IN = (L + 'conversa-da-ia.ts', L + 'conversa-gravada.ts', L + 'pergunta-em-aberto.ts', 'src/pages/api/atendimentos-ia/inbound.ts')
M = [
 # a rajada
 (CG, "    if (k + 1 < linhas.length && linhas[k + 1].t - linhas[k].t <= RAJADA.gapMs) return { seguidora: true }", "    if (false) return { seguidora: true }"),
 (CG, "    for (let i = k - 1; i >= 0 && linhas[i + 1].t - linhas[i].t <= RAJADA.gapMs; i--) cadeia.push(linhas[i])", "    for (let i = k - 1; i >= 0 && false; i--) cadeia.push(linhas[i])"),
 (CG, "        if (respondidas.has(l.id)) break", "        if (false) break"),
 (CG, ".filter((l) => l.id === entrada.id || !!l.midia)", ""),
 (CG, "    if (error && midia !== null && colunaAusente(error)) {", "    if (false) {"),
 (CG, "    let { data, error } = await supabaseAdmin.from('orcamentista_mensagem').insert(midia === null ? linha : { ...linha, midia }).select('id, criado_em').single()", "    let { data, error } = await supabaseAdmin.from('orcamentista_mensagem').insert(linha).select('id, criado_em').single()"),
 (IN, "gravarEntrada(tenantId, conversaId, textoDaEntrada, mensagemId, midia ? midia : null)", "gravarEntrada(tenantId, conversaId, textoDaEntrada, mensagemId, null)"),
 (CI, "                if (!('anteriores' in rajada)) return fim('rajada-seguidora')", "                if (false) return fim('rajada-seguidora')"),
 (CI, "        if (!c.entrada.repetida && c.midia && c.entrada.midiaGravada === true) {", "        if (false) {"),
 (CI, "                    c = { ...c, texto: [...rajada.anteriores.map((e) => e.texto), c.texto].filter((t) => t.trim() !== '').join('\\n') }", "                    c = { ...c }"),
 (CI, "                extras.push(conferida.anexo.bloco)", "                naoLidas += 0"),
 (CI, "content: anexo ? [...(anexo.extras ?? []), anexo.bloco,", "content: anexo ? [anexo.bloco,"),
 (CI, "            if (c.midia && (await outraEntradaRespondida(c.tenantId, c.conversaId, c.entrada).catch((): false => false)) === true) return fim('repetida', 'rajada=seguidora')", "            if (false) return fim('repetida', 'rajada=seguidora')"),
 # o complemento
 (PA, "        if (typeof o.vidro === 'string' && NAO_ESPECIFICADO.test(o.vidro)) delete o.vidro", "        if (false) delete o.vidro"),
 (PA, "            if (campos.some((c) => presente(a[c]))) return", "            if (false) return"),
 (PA, "        } else if (presente(o.tipologia)) {", "        } else if (false) {"),
 (PA, "    const complemento = (o: Record<string, unknown>, k: number) => semMedida(o) && (o.tipologia_dita !== true || mesmaDoItem(o, k))", "    const complemento = (o: Record<string, unknown>, k: number) => semMedida(o) && (o.tipologia_dita !== true)"),
 (PA, "        && (presente(o.vidro) || presente(o.cor_perfil)) && !presente(o.quantidade) && !presente(o.ambientes)", "        && (presente(o.vidro) || presente(o.cor_perfil))"),
 (CI, "        const complementos = juntarComplementos(semFornecedorInventado(dadosDaMensagem.proposta.itens))", "        const complementos = { itens: semFornecedorInventado(dadosDaMensagem.proposta.itens), juntados: 0, tipologiasDescartadas: 0 }"),
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
