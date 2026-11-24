import subprocess, sys, os
# MUTACOES da lista do vendedor sem teto de saida (pedido 0024, 24/11/2026). Roda SOZINHO na arvore (nada le a arvore enquanto roda).
# 1a passada 23/28: duas vivas eram guardas redundantes do leitor (sairam); as outras tres ganharam teste. 26/26.
# SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
C = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
PM = 'src/lib/atendimentos-ia/pedido-ao-modelo.ts'
RF = 'src/lib/atendimentos-ia/resposta-em-fluxo.ts'
M = [
 (PM, "export const MAX_TOKENS_DA_PRIMEIRA_CHAMADA = 128_000", "export const MAX_TOKENS_DA_PRIMEIRA_CHAMADA = 2_000"),
 (PM, "export const CONTINUACOES_DA_LISTA_CORTADA = 2", "export const CONTINUACOES_DA_LISTA_CORTADA = 1"),
 (PM, "export const CONTINUACOES_DA_LISTA_CORTADA = 2", "export const CONTINUACOES_DA_LISTA_CORTADA = 3"),
 (PM, "export const instrucaoDaContinuacao = (guardadas: number): string => (guardadas > 0", "export const instrucaoDaContinuacao = (guardadas: number): string => (guardadas >= 0"),
 (PM, "SÓ os itens a partir do de número ${guardadas + 1} da lista", "SÓ os itens a partir do de número ${guardadas} da lista"),
 (PM, "            if (ch === '[' && profundidade === 1 && ultimaChave === 'itens') noArray = true", "            if (ch === '[' && ultimaChave === 'itens') noArray = true"),
 (PM, "            if (ch === '[' && profundidade === 1 && ultimaChave === 'itens') noArray = true", "            if (ch === '[' && profundidade === 1) noArray = true"),
 (PM, "            else if (ch === '{' && noArray && profundidade === 2) inicioDoItem = k", "            else if (ch === '{' && noArray) inicioDoItem = k"),
 (PM, "            if (ch === ']' && noArray && profundidade === 1) return itens\n", ""),
 (PM, "            if (escape) escape = false\n            else if (ch === '\\\\') escape = true\n", ""),
 (RF, "        return input === null ? { type: 'tool_use', id: b.id, name: b.name, input, json_cortado: b.jsonParcial } : { type: 'tool_use', id: b.id, name: b.name, input }", "        return { type: 'tool_use', id: b.id, name: b.name, input }"),
 (C, "            if (guardadas.length > 0) r.proposta.itens = [...guardadas, ...(Array.isArray(r.proposta.itens) ? r.proposta.itens : [])]\n", ""),
 (C, "            if (guardadas.length > 0) r.proposta.itens = [...guardadas, ...(Array.isArray(r.proposta.itens) ? r.proposta.itens : [])]", "            if (guardadas.length > 0) r.proposta.itens = [...(Array.isArray(r.proposta.itens) ? r.proposta.itens : []), ...guardadas]"),
 (C, "        guardadas.push(...r.itens)\n", ""),
 (C, "        if (r.tipo !== 'cortada') return fechar(r, volta)\n        guardadas.push", "        if (r.tipo !== 'cortada') return fechar(r, 0)\n        guardadas.push"),
 (C, "volta === 0 ? null : guardadas.length, restante)", "null, restante)"),
 (C, "        soma.entrada = somar(soma.entrada, medida.entrada); soma.saida = somar(soma.saida, medida.saida); soma.raciocinio = somar(soma.raciocinio, medida.raciocinio)\n", "        soma.entrada = medida.entrada; soma.saida = medida.saida; soma.raciocinio = medida.raciocinio\n"),
 (C, "        if (continuacoes > 0) medida.continuacoes = continuacoes\n", ""),
 (C, "    medida.entrada = null; medida.saida = null; medida.raciocinio = null\n", ""),
 (C, "    if (!fechou && corpo?.stop_reason === 'max_tokens') {", "    if (false) {"),
 (C, "    if (!fechou && corpo?.stop_reason === 'max_tokens') {", "    if (corpo?.stop_reason === 'max_tokens') {"),
 (C, "        const itens = typeof cortado === 'string' ? itensCompletosDoJsonCortado(cortado) : []", "        const itens: Array<Record<string, unknown>> = []"),
 (C, "        if (resposta.tipo === 'lista-cortada') {\n            rastro.etapas.coletar = `historico=${rastro.historico} ia=lista-cortada faltou=lista_inteira linhas_msg=${linhasDaMensagem} lidas=${resposta.lidas}`\n            return await responder(falhaDaListaCortada(resposta.lidas), 'lista-cortada', resposta.detalhe)", "        if (resposta.tipo === 'lista-cortada') {\n            rastro.etapas.coletar = `historico=${rastro.historico} ia=lista-cortada faltou=lista_inteira linhas_msg=${linhasDaMensagem} lidas=${resposta.lidas}`\n            return await responder(FALHA_DA_IA, 'lista-cortada', resposta.detalhe)"),
 (C, "        const linhasDaMensagem = c.texto.split('\\n').filter((l) => l.trim() !== '').length", "        const linhasDaMensagem = c.texto.split('\\n').length + 0 * c.texto.length - (c.texto.endsWith('\\n') ? 0 : 0) + 1"),
 (C, " linhas_msg=${linhasDaMensagem} lidas=${Array.isArray(proposta.itens) ? proposta.itens.length : 0}`", " linhas_msg=${linhasDaMensagem} lidas=${daMensagem.length + 1}`"),
 (C, "        if (volta >= CONTINUACOES_DA_LISTA_CORTADA || semPrazo) {", "        if (semPrazo) {"),
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
        r = subprocess.run(['npx', 'jest', *T], cwd=R, capture_output=True, text=True, timeout=600)
        m = r.returncode != 0
    except subprocess.TimeoutExpired:
        m = True
    finally:
        open(R + arq, 'w').write(s)
    mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:70].replace('\n', ' ') + '  =>  ' + b[:60].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
