import subprocess, sys, os
# MUTACOES da familia de revenda (23/11/2026). Roda SOZINHO na arvore.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
T = ['src/utils/__tests__/revenda-na-familia.test.ts', 'src/utils/__tests__/levantamento-da-conversa.test.ts',
     'src/utils/__tests__/o-servidor-forma-o-preco-da-tela.test.tsx', 'src/utils/__tests__/atendimentos-ia-precificacao-do-orcamento-tela.test.tsx',
     'src/utils/__tests__/atendimentos-ia-orcamento-precificado.test.ts']
MF = 'src/lib/atendimentos-ia/motor-da-familia.ts'
LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
CO = 'src/lib/atendimentos-ia/custo-do-orcamento.ts'
CS = 'src/lib/atendimentos-ia/custo-do-orcamento-servidor.ts'
PO = 'src/lib/atendimentos-ia/precificacao-do-orcamento.ts'
OP = 'src/lib/atendimentos-ia/orcamento-precificado.ts'
PR = 'src/lib/atendimentos-ia/preco-do-orcamento.ts'
CC = 'src/page-parts/products/content.component.tsx'
CI = 'src/page-parts/products/content-industrialization.tsx'
# EQUIVALENTES, fora da bateria (sobreviveram na 1a passada, e a razao e esta):
#  - LC linhaDaMaoDeObra sem o ramo da revenda: inalcancavel — a familia e toda de revenda ou nenhuma, e a toda-revenda sai antes, pela
#    LINHA_DA_REVENDA; o ramo existe para o tipo (MaoDeObra) fechar.
#  - PR productType = 'PRODUZIDO' no servidor: com o item de revenda gravado com 0 minutos, o motor da o MESMO preco nos dois tipos (a mao de
#    obra do produto ja e 0; a carga horaria so bloqueia com minutos > 0) — medido pelo teste de paridade. O tipo e passado para espelhar a tela.
# A 1a passada: 26/29; a sobrevivente do select (o banco falso nao projetava) ganhou a projecao no teste.
M = [
 (MF, "(v === 'FABRICACAO' || v === 'REVENDA' ? v : null)", "(typeof v === 'string' ? (v as FormatoDaFamilia) : 'FABRICACAO')"),
 (MF, "if (new Set(dela.map((m) => formatoLido(m.formato))).size > 1) {", "if (false) {"),
 (MF, "            formato: formatoLido(m.formato),\n", "            formato: 'FABRICACAO',\n"),
 (MF, ".select('id, nome, familia, formato')", ".select('id, nome, familia')"),
 (LC, "    if (familia.formato === null) {\n        faltas.push", "    if (false) {\n        faltas.push"),
 (LC, "    const maos: MaoDeObra[] = familia.formato === 'REVENDA'", "    const maos: MaoDeObra[] = false"),
 (LC, "    if (maos.length > 0 && maos.every((m) => 'revenda' in m)) {", "    if (false) {"),
 (LC, "...(bloco ? [] : ['', O_QUE_O_PRECO_COBRE_NA_REVENDA])", "...(bloco ? [] : ['', O_QUE_O_PRECO_COBRE])"),
 (CO, "    const fabricados = e.itens.filter((it) => !it.revenda)", "    const fabricados = e.itens"),
 (CO, "    if (fabricados.length > 0 && (e.valor_minuto === null", "    if ((e.valor_minuto === null"),
 (CO, "        const minutos = it.revenda ? 0 : (it.minutos as number)", "        const minutos = it.revenda ? (it.minutos ?? 0) : (it.minutos as number)"),
 (CO, "valor_minuto: it.revenda ? null : (e.valor_minuto as number),", "valor_minuto: e.valor_minuto as number,"),
 (CS, "                    revenda: g.familia.formato === 'REVENDA',", "                    revenda: false,"),
 (CS, "    if ((algumFabrica && maoDeObra === null)", "    if ((maoDeObra === null)"),
 (PO, "    if (semFamilia.length) return { recusa: FRASE_ITEM_SEM_FAMILIA(semFamilia) }", ""),
 (PO, "    const semFormato = familias.filter((f) => (formatos.get(f) ?? null) === null)", "    const semFormato = familias.filter((f) => formatos.get(f) === null)"),
 (PO, "    if (de('FABRICACAO').length && de('REVENDA').length) return", "    if (false) return"),
 (PO, "    return { formato: de('REVENDA').length ? 'REVENDA' : 'FABRICACAO' }", "    return { formato: 'FABRICACAO' }"),
 (PO, "    if ('recusa' in args.orcamento.formato && estado !== 'sem_itens') faltas.push", "    if (false) faltas.push"),
 (PO, "&& estado !== 'sem_itens') faltas.push", ") faltas.push"),
 (OP, "    if (divergentes.length) return {", "    if (false) return {"),
 (OP, ".select('familia, formato').eq('tenant_id', tenantId).in('familia', familias)", ".select('familia, formato').in('familia', familias)"),
 (OP, "    if ('recusa' in orc.formato) throw new ErroDoEstado(", "    if (false) throw new ErroDoEstado("),
 (CC, "  const tipoNoMotor: 'PRODUZIDO' | 'REVENDA' = orcamento ? tipoDoProdutoDoOrcamento(orcamento) : productType", "  const tipoNoMotor: 'PRODUZIDO' | 'REVENDA' = productType"),
 (CC, "<span>🛠️ {tipoNoMotor === 'REVENDA' ? 'Revenda' : CABECALHO_FIXO.tipo}</span>", "<span>🛠️ {CABECALHO_FIXO.tipo}</span>"),
 (CC, "          semMaoDeObra={ehOrcamento && tipoNoMotor === 'REVENDA'}\n", ""),
 (CI, "        {semMaoDeObra ? null : isMobile ? (", "        {isMobile ? ("),
]
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
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:90].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
