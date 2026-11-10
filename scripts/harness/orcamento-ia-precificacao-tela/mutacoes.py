#!/usr/bin/env python3
"""
MUTAÇÕES do modo "orçamento" da precificação final (o 1b, dono do produto, 09/11/2026): toda mutação que faça o caminho "produto" entrar no
ramo "orçamento", ou o contrário, ou que tire uma das travas (a reconciliação, o cálculo incompleto, a recusa sem NCM, o salvar fora de
`products`), tem de MORRER nas duas suítes do 1b.

Roda numa WORKTREE própria (`mutacao-na-arvore-de-trabalho.md`): a árvore de trabalho não é tocada, e nada a lê enquanto isto roda.
Uso: python3 -I mutacoes.py [--so NOME]. Sai 1 se alguma sobreviver, ou se o controle (sem mutação) não estiver verde.
"""
import os, shutil, subprocess, sys, tempfile

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../..'))
SUITES = ['src/utils/__tests__/atendimentos-ia-precificacao-do-orcamento-tela.test.tsx', 'src/utils/__tests__/atendimentos-ia-orcamento-precificado.test.ts']
C = 'src/page-parts/products/content.component.tsx'
I = 'src/page-parts/products/content-industrialization.tsx'
P = 'src/lib/atendimentos-ia/precificacao-do-orcamento.ts'
S = 'src/lib/atendimentos-ia/orcamento-precificado.ts'
PP = 'src/page-parts/products/product-price.component.tsx'
MUT = [
    # ── o DESVIO entre os modos ──
    ('D1 entrada: o produto entra no ramo do orçamento e vice-versa', P, "    if (modo.tipo === 'orcamento') {", "    if (modo.tipo !== 'orcamento') {"),
    ('D2 o modo é sempre "produto"', C, "    () => (orcamento ? { tipo: 'orcamento', itens: orcamento.itens } : MODO_PRODUTO),", "    () => MODO_PRODUTO,"),
    ('D3 o modo é sempre "orçamento"', C, "    () => (orcamento ? { tipo: 'orcamento', itens: orcamento.itens } : MODO_PRODUTO),", "    () => ({ tipo: 'orcamento', itens: orcamento?.itens ?? [] } as ModoDaPrecificacao),"),
    ('D4 ehOrcamento invertido', C, "  const ehOrcamento = modo.tipo === 'orcamento'", "  const ehOrcamento = modo.tipo !== 'orcamento'"),
    ('D5 o salvar do orçamento cai no caminho de products', C, "    if (orcamento) return salvarOrcamento()\n", ""),
    ('D6 o produto salva pelo caminho do orçamento', C, "    if (orcamento) return salvarOrcamento()\n", "    return salvarOrcamento()\n"),
    ('D7 o cabeçalho do orçamento nunca aparece', C, "      {orcamento ? (\n        <Card size=\"small\" data-cabecalho-do-orcamento=\"\">", "      {false ? (\n        <Card size=\"small\" data-cabecalho-do-orcamento=\"\">"),
    ('D8 o cabeçalho do orçamento aparece também no produto', C, "      {orcamento ? (\n        <Card size=\"small\" data-cabecalho-do-orcamento=\"\">", "      {true ? (\n        <Card size=\"small\" data-cabecalho-do-orcamento=\"\">"),
    ('D9 o tipo fixo do orçamento some', C, "        {orcamento ? (\n          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} data-tipo-do-orcamento=\"\">", "        {false ? (\n          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} data-tipo-do-orcamento=\"\">"),
    ('D10 os avisos do orçamento aparecem no produto', C, "  const avisosDoOrcamento = orcamento ? (", "  const avisosDoOrcamento = true ? ("),
    ('D11 as colunas do produto no orçamento', C, "          columns={ehOrcamento ? colunasDoOrcamento : columns}", "          columns={columns}"),
    ('D12 os itens do orçamento editáveis', C, "          somenteLeitura={ehOrcamento}", "          somenteLeitura={false}"),
    ('D13 os itens do produto só leitura', C, "          somenteLeitura={ehOrcamento}", "          somenteLeitura={true}"),
    ('D14 o incluir item não se esconde', I, "        {!somenteLeitura && (\n        <div className=\"flex flex-col column mb-5\">", "        {true && (\n        <div className=\"flex flex-col column mb-5\">"),
    ('D15 os minutos do orçamento editáveis', I, "                  readOnly={somenteLeitura}\n", "                  readOnly={false}\n"),
    ('D15b os minutos do orçamento editáveis (desktop)', I, "                readOnly={somenteLeitura}\n              />", "                readOnly={false}\n              />"),
    ('D16 o orçamento herda o tipo do tenant de revenda', C, "    orcamento ? 'PRODUZIDO' : (isCalcTypeService", "    (isCalcTypeService"),
    ('D17 os percentuais do orçamento não entram', C, "        ...(orcamento ? {\n          salesCommissionPercent:", "        ...(false ? {\n          salesCommissionPercent:"),
    ('D18 os minutos do orçamento não chegam à tela', C, "          productWorkloadInMinutes: entradaDoMotor(modo, { itemsPriceSum: 0, workloadMinutes: 0 }).productWorkloadMinutes,\n", ""),
    ('D19 o motor do produto lê a entrada do orçamento', C, "      totalItemsCost: entrada.totalItemsCost,", "      totalItemsCost: itemsPriceSum * 1.01,"),
    ('D20 a fórmula do ICMS preenche o PIS/COFINS também no orçamento', C, "            if (!orcamento) {\n              const pisCofinsBase", "            if (true) {\n              const pisCofinsBase"),
    ('D21 o preço não formado não zera no orçamento', C, "          onPrecoNaoFormado={ehOrcamento ? zerarPrecoNaoFormado : undefined}", "          onPrecoNaoFormado={undefined}"),
    ('D22 o preço não formado zera também no produto', C, "          onPrecoNaoFormado={ehOrcamento ? zerarPrecoNaoFormado : undefined}", "          onPrecoNaoFormado={zerarPrecoNaoFormado}"),
    ('P1 não formado só sem preço positivo (sem olhar a operação por dentro)', PP, "    const formado = finalPriceWithTaxesPerUnit > 0 && (!(isLucroReal || isLucroPresumed) || valorPrecificado > 0)", "    const formado = finalPriceWithTaxesPerUnit > 0"),
    ('P2 o aviso de não formado nunca dispara', PP, "    if (!formado) onPrecoNaoFormado?.()", "    if (false) onPrecoNaoFormado?.()"),
    # ── a entrada do orçamento ──
    ('E1 a fabricação entra no custo (o total, não o líquido)', P, "            totalItemsCost: modo.itens.reduce((t, i) => t + (i.custo_liquido_materiais ?? 0), 0),", "            totalItemsCost: modo.itens.reduce((t, i) => t + (i.custo_liquido_total ?? 0), 0),"),
    ('E2 os minutos do produto no orçamento', P, "            productWorkloadMinutes: modo.itens.reduce((t, i) => t + (i.tempo_fabricacao_min ?? 0), 0),", "            productWorkloadMinutes: produto.workloadMinutes,"),
    # ── as travas ──
    ('T1 a reconciliação aceita dois centavos', P, "    return { fecha: Math.abs(diferenca) <= 0.01,", "    return { fecha: Math.abs(diferenca) <= 0.02,"),
    ('T2 a reconciliação sempre fecha', P, "        if (!r.fecha) faltas.push(", "        if (false) faltas.push("),
    ('T3 o salvar ignora as faltas', C, "    if (faltas.length) { setRecusasDoOrcamento(faltas); return }", "    if (false) { setRecusasDoOrcamento(faltas); return }"),
    ('T4 o incompleto exige os dois totais nulos', P, "    const semTotais = orc.valor_total_bruto === null || orc.valor_total_liquido === null", "    const semTotais = orc.valor_total_bruto === null && orc.valor_total_liquido === null"),
    ('T5 o incompleto ignora os itens sem cálculo', P, "    if (semTotais || calculados.length < orc.itens.length) return 'incompleto'", "    if (semTotais) return 'incompleto'"),
    ('T6 o desatualizado nunca dispara', P, "Date.parse(i.atualizado_em) > Date.parse(i.calculado_em))) return 'desatualizado'", "Date.parse(i.atualizado_em) > Date.parse(i.calculado_em) + 1e12)) return 'desatualizado'"),
    ('T7 sem NCM não é falta', P, "    if (ncm === '') faltas.push(FALTA_DO_NCM)", "    if (false) faltas.push(FALTA_DO_NCM)"),
    ('T8 o NCM sem pontos passa', P, "export const FORMA_DO_NCM = /^[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}$/", "export const FORMA_DO_NCM = /^[0-9]{4}\\.?[0-9]{2}\\.?[0-9]{2}$/"),
    ('T9 a alíquota do NCM nunca é exigida', C, "  const aliquotaExigida = (): boolean | null => (isLRorLP ? aliquotaDoNcm === true : null)", "  const aliquotaExigida = (): boolean | null => null"),
    ('T10 o NCM sem linha conta como resolvido', C, "    setAliquotaDoNcm(pct === undefined ? null : pct !== null)", "    setAliquotaDoNcm(pct === undefined ? null : true)"),
    ('T11 a UF da interestadual não é exigida', P, "    if (f.sale_scope === 'INTERESTADUAL' && uf === '') faltas.push(FALTA_DA_UF)", "    if (false) faltas.push(FALTA_DA_UF)"),
    ('T12 o escopo nulo não é falta', P, "    if (f.sale_scope === null) faltas.push(FALTA_DO_ESCOPO)", "    if (false) faltas.push(FALTA_DO_ESCOPO)"),
    ('T13 o salvar grava sem o preço formado', C, "    if (!(valorDeVenda > 0)) faltas.push(", "    if (false) faltas.push("),
    # ── o servidor ──
    ('S1 a rota grava com o cálculo incompleto', S, "    if (estado !== 'completo') throw new ErroDoEstado(FRASE_DO_ESTADO[estado])", ""),
    ('S2 a escrita sem o tenant', S, "        .eq('tenant_id', tenantId).eq('id', id).select('id')", "        .eq('id', id).select('id')"),
    ('S3 os numéricos chegam como texto', S, "        ...Object.fromEntries(NUMERICOS_DO_ORCAMENTO.map((c) => [c, numeroOuNulo(o[c])])),\n", ""),
    ('S4 o valor de venda zero passa', S, "    if (valor === null || valor <= 0) erros.push(", "    if (valor === null || valor < 0) erros.push("),
    ('S5 o fiscal não é conferido na rota', S, "    erros.push(...faltasDoFiscal(fiscal).map((f) => `Falta ${f}.`))", ""),
    ('S6 a FK da UF vira 500', S, "        if (error.code === '23503') throw new ErroDeValidacao(", "        if (error.code === 'nunca') throw new ErroDeValidacao("),
    ('S7 a rota grava o que não pediu (o valor de venda nulo)', S, "        .update({ ...g, atualizado_em: agora.toISOString() })", "        .update({ ...g, valor_total_liquido: null, atualizado_em: agora.toISOString() })"),
    ('S8 a coluna ausente não é 503', S, "const colunaAusente = (e: { code?: string } | null | undefined) => e?.code === '42703' || e?.code === 'PGRST204'", "const colunaAusente = (e: { code?: string } | null | undefined) => e?.code === 'nunca'"),
    ('S9 percentual acima de 100 passa', S, "    if (n === null || n < 0 || n > 100) {", "    if (n === null || n < 0) {"),
]
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
exigir_trecho_unico((nome, [(arq, open(os.path.join(R, arq), encoding='utf-8').read(), de, para)]) for nome, arq, de, para in MUT)

def rodar_suites(arvore):
    r = subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=arvore, capture_output=True, text=True)
    return r.returncode == 0

def main():
    so = sys.argv[sys.argv.index('--so') + 1] if '--so' in sys.argv else None
    wt = tempfile.mkdtemp(prefix='mut-precificacao-')
    shutil.rmtree(wt)
    subprocess.run(['git', 'worktree', 'add', '--detach', wt, 'HEAD'], cwd=R, check=True, capture_output=True)
    try:
        # a worktree recebe o estado ATUAL dos arquivos mutados e das suítes (mesmo os não commitados), e o node_modules por link
        for f in {C, I, P, S, PP, *SUITES, 'src/pages/api/atendimentos-ia/orcamentos/[id]/precificacao.ts'}:
            shutil.copyfile(os.path.join(R, f), os.path.join(wt, f))
        os.symlink(os.path.join(R, 'node_modules'), os.path.join(wt, 'node_modules'))
        if not rodar_suites(wt):
            print('CONTROLE VERMELHO: as suítes falham sem mutação'); return 1
        print('controle verde')
        vivas = []
        for nome, arq, de, para in MUT:
            if so and not nome.startswith(so): continue
            caminho = os.path.join(wt, arq)
            original = open(caminho, encoding='utf-8').read()
            if original.count(de) != 1:
                print(f'  NAO APLICADA: {nome} ({original.count(de)} ocorrencias)'); return 3
            open(caminho, 'w', encoding='utf-8').write(original.replace(de, para))
            try:
                viva = rodar_suites(wt)
            finally:
                open(caminho, 'w', encoding='utf-8').write(original)
            print(f"  {'VIVA ' if viva else 'morta'}: {nome}")
            if viva: vivas.append(nome)
        total = len([m for m in MUT if not so or m[0].startswith(so)])
        print(f'{total - len(vivas)} de {total} mortas')
        return 1 if vivas else 0
    finally:
        subprocess.run(['git', 'worktree', 'remove', '--force', wt], cwd=R, capture_output=True)

sys.exit(main())
