import subprocess, sys, os
# MUTACOES do pedido 0025 (dono do produto, 25/11/2026): ausencia nao se escreve, o vidro nunca em sigla, e em quantos trilhos as folhas correm.
# Roda SOZINHO na arvore (nada le a arvore enquanto roda). SO=<trecho> roda so as mutacoes cujo texto contem o trecho.
# O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
PURAS = [U + x for x in ['trilhos-do-marco.test.ts', 'descricao-para-o-vendedor.test.ts', 'tipologia-padrao-atributo-por-atributo.test.ts', 'arquivo-do-levantamento.test.ts',
         'folha-do-levantamento.test.ts', 'atendimentos-ia-arquivo-do-orcamento-servidor.test.ts', 'vidro-padrao-por-grupo.test.ts', 'persiana-e-pano-confirmado.test.ts']]
TODAS = PURAS + [U + 'atendimentos-ia-levantamento-por-nome.test.ts']
L = 'src/lib/atendimentos-ia/'
TM, DV, TP, VP, AL, AO, LC, CI = (L + x for x in ['trilhos-do-marco.ts', 'descricao-para-o-vendedor.ts', 'tipologia-padrao.ts', 'vidro-padrao.ts', 'arquivo-do-levantamento.ts',
                                                  'arquivo-do-orcamento-servidor.ts', 'levantamento-da-conversa.ts', 'conversa-da-ia.ts'])
M = [
 # os marcos da aba Perfis
 (TM, "const DESCRICAO_DO_MARCO = /^MARCO DE CORRER\\s*-\\s*(\\d+)\\s+TRILHOS?$/i", "const DESCRICAO_DO_MARCO = /MARCO DE CORRER\\s*-\\s*(\\d+)\\s+TRILHOS?/i"),
 (TM, "const DESCRICAO_DO_MARCO = /^MARCO DE CORRER\\s*-\\s*(\\d+)\\s+TRILHOS?$/i", "const DESCRICAO_DO_MARCO = /^MARCO DE CORRER\\s*-\\s*(\\d+)\\s+TRILHOS$/i"),
 (TM, "const DESCRICAO_DO_MARCO = /^MARCO DE CORRER\\s*-\\s*(\\d+)\\s+TRILHOS?$/i", "const DESCRICAO_DO_MARCO = /^MARCO DE CORRER\\s*-\\s*(\\d+)\\s+TRILHOS?$/"),
 (TM, "const REFILADO = /\\bREFILAD[OA]\\b/i", "const REFILADO = /\\bREFILADO\\b/i"),
 (TM, "const REFILADO = /\\bREFILAD[OA]\\b/i", "const REFILADO = /\\bREFILAD[OA]\\b/"),
 (TM, "        if (!m || REFILADO.test(p.obs ?? '')) return []", "        if (!m) return []"),
 (TM, "        const m = DESCRICAO_DO_MARCO.exec((p.descricao ?? '').replace(/\\s+/g, ' ').trim())", "        const m = DESCRICAO_DO_MARCO.exec(p.descricao ?? '')"),
 (TM, "        return [{ trilhos: Number(m[1]), condicao: (p.condicao ?? '').trim() }]", "        return [{ trilhos: Number(m[1]), condicao: p.condicao ?? '' }]"),
 (TM, "marcos.filter((m) => !SEMPRE.test(m.condicao)).flatMap(", "marcos.flatMap("),
 (TM, "))].sort()", "))]"),
 # os trilhos do item
 (TM, "    if (!daTipologia || daTipologia.marcos.length === 0) return null", "    if (!daTipologia) return null"),
 (TM, "    const valores: Record<string, number> = { ...daTipologia.padroes }", "    const valores: Record<string, number> = {}"),
 (TM, "if (typeof v === 'number' && Number.isInteger(v)) valores[nome] = v", "if (typeof v === 'number') valores[nome] = v"),
 (TM, "if (typeof v === 'number' && Number.isInteger(v)) valores[nome] = v", "if (false) valores[nome] = v as number"),
 (TM, "    if (escolhas !== null && typeof escolhas === 'object' && !Array.isArray(escolhas)) {", "    if (escolhas !== null && typeof escolhas === 'object') {"),
 (TM, "        if (SEMPRE.test(marco.condicao)) { valem.add(marco.trilhos); continue }\n", ""),
 (TM, "        if (!r.ok || typeof r.valor !== 'boolean') return", "        if (!r.ok) return"),
 (TM, "        if (r.valor) valem.add(marco.trilhos)", "        valem.add(marco.trilhos)"),
 (TM, "    if (valem.size === 1) return { trilhos: [...valem][0] }", "    if (valem.size >= 1) return { trilhos: [...valem][0] }"),
 (TM, "valem.size === 0 ? 'nenhum marco de correr vale para as escolhas do item'", "false ? 'nenhum marco de correr vale para as escolhas do item'"),
 (TM, ".sort((a, b) => a - b).join(' e ')", ".join(' e ')"),
 # a descricao
 (DV, "const emTrilhos = typeof trilhos === 'number' && Number.isInteger(trilhos) && trilhos > 0 ?", "const emTrilhos = typeof trilhos === 'number' && Number.isInteger(trilhos) && trilhos >= 0 ?"),
 (DV, "const emTrilhos = typeof trilhos === 'number' && Number.isInteger(trilhos) && trilhos > 0 ?", "const emTrilhos = typeof trilhos === 'number' && trilhos > 0 ?"),
 (DV, "${trilhos === 1 ? 'trilho' : 'trilhos'}", "trilhos"),
 (DV, "[`${nome}${emTrilhos}`, ...tem.map(comInicialMaiuscula)].join(' | ')", "[nome, ...tem.map(comInicialMaiuscula)].join(' | ') + emTrilhos"),
 # ausencia nao se escreve
 (TP, "        if (!a.extras.has(e)) continue\n", "        if (!a.extras.has(e)) { partes.push(`sem ${e}`); continue }\n"),
 (TP, "        const panos = e === 'persiana' && panosDaPersiana !== null ?", "        const panos = panosDaPersiana !== null ?"),
 # o vidro nunca em sigla
 (VP, "texto: descricao ?? textoDoVidroForaDaTabela(padrao), codigo: padrao.codigo,", "texto: descricao ?? padrao.codigo, codigo: padrao.codigo,"),
 (VP, "    return aplicado.noPrincipal ? `vidro ${origemNaFrase(aplicado.padrao)}` : null", "    return `vidro ${origemNaFrase(aplicado.padrao)}`"),
 (VP, "    return aplicado.noPrincipal ? `vidro ${origemNaFrase(aplicado.padrao)}` : null", "    return aplicado.noPrincipal ? `vidro ${aplicado.codigo}, ${origemNaFrase(aplicado.padrao)}` : null"),
 (CI, "            if (!aplicado.noPrincipal) rastro.vidrosForaDaTabela += 1\n", ""),
 (CI, "            if (!aplicado.noPrincipal) rastro.vidrosForaDaTabela += 1\n", "            rastro.vidrosForaDaTabela += 1\n"),
 # a folha, o PDF do orcamento e a leitura do motor
 (AL, "    return t !== null && 'trilhos' in t ? t.trilhos : null", "    return t !== null && 'trilhos' in t ? t.trilhos : 2"),
 (AL, "                'a_definir', trilhosParaADescricao(d?.marcos, i.escolhas)) ?? '',", "                'a_definir', trilhosParaADescricao(d?.marcos, null)) ?? '',"),
 (AL, "                'a_definir', trilhosParaADescricao(d?.marcos, i.escolhas)) ?? '',", "                'a_definir', null) ?? '',"),
 (AL, "        const t = i.tipologia ? trilhosDoItem(detalhe(i.tipologia, i.familia)?.marcos, i.escolhas) : null", "        const t = i.tipologia ? trilhosDoItem(detalhe(i.tipologia, i.familia)?.marcos, null) : null"),
 (AL, "        return t !== null && 'indeterminado' in t ? [`item=", "        return t !== null ? [`item="),
 (AL, "    for (const pendencia of trilhosIndeterminados(a.itens, a.detalhe)) console.error(", "    for (const pendencia of [] as string[]) console.error("),
 (AO, "                'a_definir', trilhosParaADescricao(d?.marcos, escolhas)),", "                'a_definir', trilhosParaADescricao(d?.marcos, null)),"),
 (AO, "                'a_definir', trilhosParaADescricao(d?.marcos, escolhas)),", "                'a_definir', null),"),
 (LC, "        const marcos = marcosDeCorrer(doCodigo)\n        if (marcos.length > 0) marcosDe.set(tipologia, marcos)", "        const marcos = marcosDeCorrer(doCodigo)\n        marcosDe.set(tipologia, marcos)"),
 (LC, "            if (typeof v.tipologia !== 'string' || typeof v.variavel !== 'string' || !/^\\d+$/.test(padrao)) continue", "            if (typeof v.tipologia !== 'string' || typeof v.variavel !== 'string') continue"),
 (LC, "{ marcos, padroes: padroes.get(tipologia) ?? {} }]))", "{ marcos, padroes: {} }]))"),
 (LC, "            .ilike('descricao', 'MARCO DE CORRER%').order(", "            .order("),
 (LC, ".select('tipologia, variavel, padrao').eq('motor_id', motorId).in('variavel', nomes)", ".select('tipologia, variavel, padrao').in('variavel', nomes)"),
 (LC, ".select('tipologia, descricao, condicao, obs').eq('motor_id', motorId)\n", ".select('tipologia, descricao, condicao, obs')\n"),
 (LC, "            if (!tabelaAusente(error)) console.error(`[TRILHOS] a leitura dos marcos falhou: codigo=${error.code ?? '-'}`)\n            return {}", "            throw new Error('x')"),
 (CI, "marcos: marcosPorFamilia[d.familia]?.[tipologia] ?? null } : null", "marcos: null } : null"),
 (CI, "definicaoEDetalhe(tabela, Object.fromEntries(variaveisLidas), doCodigo, Object.fromEntries(marcosLidos))", "definicaoEDetalhe(tabela, Object.fromEntries(variaveisLidas), doCodigo, {})"),
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
        r = subprocess.run(['npx', 'jest', *(PURAS if arq in (TM, DV, VP, AO) else TODAS)], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:70].replace('\n', ' ') + '  =>  ' + b[:70].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
