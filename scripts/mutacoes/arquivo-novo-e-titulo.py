import subprocess, sys, os
# MUTACOES do pedido 0037 (dono do produto, 26/11/2026): o "sim" refaz o arquivo, o titulo sem "|" nem o tipo de trilho, e a figura pelo Padrao.
# Roda SOZINHO na arvore. SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA vez aborta (codigo 3).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'atendimentos-ia-cadeia-do-sim.test.ts', U + 'descricao-para-o-vendedor.test.ts', U + 'folha-do-levantamento.test.ts', U + 'trilhos-do-marco.test.ts',
     U + 'atendimentos-ia-travessia-do-levantamento.test.ts', U + 'atendimentos-ia-levantamento-por-nome.test.ts']
C = 'src/lib/atendimentos-ia/cadeia-do-sim.ts'
D = 'src/lib/atendimentos-ia/descricao-para-o-vendedor.ts'
F = 'src/lib/atendimentos-ia/folha-do-levantamento.ts'
A = 'src/lib/atendimentos-ia/arquivo-do-levantamento.ts'
V = 'src/lib/atendimentos-ia/custo-do-orcamento.ts'
CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
M = [
 (C, "        const r = await deps.regerarArquivo(tenantId, orcamento.id)\n        if ('recusas' in r) {", "        const r = (primeiro.versao ?? null) === VERSAO_DO_ARQUIVO ? { ok: true as const } : await deps.regerarArquivo(tenantId, orcamento.id)\n        if ('recusas' in r) {"),
 (C, "            return { rastro: `reenvio=parou regerou=recusou motivo=\"${motivoDoLog(r.recusas.join('; '))}\" parou=arquivo`, paraOVendedor: fraseDoArquivoQueNaoSaiu(n, orcamento.nome, r.recusas) }", "            lido = primeiro"),
 (C, "        if (!novo) return { rastro: 'reenvio=parou regerou=ok releu=nada parou=arquivo', paraOVendedor: fraseDoArquivoQueNaoSaiu(n, orcamento.nome, ['o arquivo refeito não foi achado depois de gravado']) }", ""),
 (C, "        lido = novo\n", ""),
 (V, "export const VERSAO_DO_CALCULO = 'barras-unicas-pedido-total-peca-exata-2026-11-26'", "export const VERSAO_DO_CALCULO = 'consumo-do-item-2026-11-16'"),
 (D, "const DE_TRILHO = /^TRILHOS?\\b/i", "const DE_TRILHO = /^NUNCA_CASA$/"),
 (D, "...tem.map((t) => t.toLocaleLowerCase('pt-BR'))].join(', ')", "...tem.map((t) => t.toLocaleLowerCase('pt-BR'))].join(' | ')"),
 (D, "const tipo = [tipoDeModulacao(descricoes[k]), tipoDeTrilho(descricoes[k])].filter((t) => t !== '').join(', ').toLocaleLowerCase('pt-BR')", "const tipo = tipoDeModulacao(descricoes[k]).toLocaleLowerCase('pt-BR')"),
 (F, "    const k = comCaixa.includes('|') ? comCaixa.indexOf('|') : comCaixa.indexOf(', ')", "    const k = comCaixa.indexOf('|')"),
 (A, "definicao: a.definicaoDoDesenho ?? a.definicao, detalhe: a.detalhe", "definicao: a.definicao, detalhe: a.detalhe"),
 (CV, "itens: aplicada.itens, definicao, detalhe, definicaoDoDesenho,", "itens: aplicada.itens, definicao, detalhe,"),
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
