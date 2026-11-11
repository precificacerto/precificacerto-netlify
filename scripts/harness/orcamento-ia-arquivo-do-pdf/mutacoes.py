#!/usr/bin/env python3
"""
As MUTAÇÕES do #258 (dono do produto, 11/11/2026, Nível 3): o rateio exato da operação interna, a interna que se grava, a gravação que gera o
arquivo, a conferência e o desenho do PDF, o upload antes da linha, a faixa dos itens antes do salvar, a mão de obra só em minutos e o orçamento
que abre na precificação. Cada uma estraga UMA coisa no arquivo de verdade, roda as suítes e DESFAZ. M0 é o controle. Roda SOZINHO ou numa
worktree (`mutacao-na-arvore-de-trabalho.md`), e confere TODAS as mutações antes de rodar qualquer suíte (`mutacao-que-nao-se-aplica.md`).

Uso:   python3 -B mutacoes.py            (todas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
RATEIO = 'src/lib/atendimentos-ia/rateio-do-orcamento.ts'
PREC = 'src/lib/atendimentos-ia/precificacao-do-orcamento.ts'
GRAVA = 'src/lib/atendimentos-ia/orcamento-precificado.ts'
PDF = 'src/lib/atendimentos-ia/arquivo-do-orcamento.ts'
SERV = 'src/lib/atendimentos-ia/arquivo-do-orcamento-servidor.ts'
FAIXA = 'src/page-parts/atendimentos-ia/itens-precificados.component.tsx'
INDUS = 'src/page-parts/products/content-industrialization.tsx'
LISTA = 'src/pages/atendimentos-ia/orcamentos-ia/index.tsx'
CONTENT = 'src/page-parts/products/content.component.tsx'
ROTA = 'src/pages/api/atendimentos-ia/orcamentos/[id]/precificacao.ts'
PRICE = 'src/page-parts/products/product-price.component.tsx'
TOPO = 'src/page-parts/atendimentos-ia/topo-do-orcamento.component.tsx'
PLANO = 'src/lib/atendimentos-ia/travessia-do-levantamento-plano.ts'
NCMPIS = 'src/utils/ncm-pis-cofins.ts'
T = 'src/utils/__tests__/'
SUITES = [T + s for s in ['atendimentos-ia-rateio-do-orcamento.test.ts', 'atendimentos-ia-arquivo-do-orcamento.test.ts',
          'atendimentos-ia-arquivo-do-orcamento-servidor.test.ts', 'atendimentos-ia-orcamento-precificado.test.ts',
          'atendimentos-ia-precificacao-do-orcamento-tela.test.tsx', 'atendimentos-ia-orcamentos-ia-tela.test.tsx',
          'atendimentos-ia-travessia-do-levantamento.test.ts', 'o-ncm-determina-a-aliquota-de-pis-cofins.test.ts']]

MUTACOES = [
    # o rateio
    ('R1', 'o desempate do resto pela ordem invertido', [(RATEIO, '(a.resto === b.resto ? a.ordem - b.ordem :', '(a.resto === b.resto ? b.ordem - a.ordem :')]),
    ('R2', 'o maior resto vira o menor', [(RATEIO, 'a.resto > b.resto ? -1 : 1', 'a.resto > b.resto ? 1 : -1')]),
    ('R3', 'a sobra não é repartida', [(RATEIO, 'if (q <= s && pode[k + 1][s - q]) { fila[k].unitario += UM; s -= q }', 'if (false) { fila[k].unitario += UM; s -= q }')]),
    ('R4', 'a sobra impossível não recusa', [(RATEIO, '    if (!pode[0][r]) {', '    if (false) {')]),
    ('R5', 'a interna fora do centavo passa', [(RATEIO, "    if (T === null) return { ok: false, recusa: fraseDaInternaForaDoCentavo(interna) }\n", '')]),
    ('R6', 'o peso ausente passa', [(RATEIO, 'if (!Number.isFinite(i.peso) || i.peso <= 0)', 'if (i.peso < 0)')]),
    ('R7', 'a quantidade fracionária passa', [(RATEIO, 'if (!Number.isInteger(i.quantidade) || i.quantidade < 1)', 'if (i.quantidade < 1)')]),
    ('R8', 'o total do item é só o unitário', [(RATEIO, 'total: Number(b.unitario * b.q) }', 'total: Number(b.unitario) }')]),
    # a interna que se grava
    ('I1', 'a interna divergente passa', [(PREC, '    if (Math.abs(emCentavos(valorPrecificado) - i) > 1) return { falta: faltaDaInternaDivergente(operacaoInterna, valorPrecificado) }\n', '')]),
    ('I2', 'a tolerância vira 5 centavos', [(PREC, 'if (Math.abs(emCentavos(valorPrecificado) - i) > 1)', 'if (Math.abs(emCentavos(valorPrecificado) - i) > 5)')]),
    ('I3', 'a interna gravada sem arredondar', [(PREC, '    return { interna: i / 100 }', '    return { interna: operacaoInterna }')]),
    ('G1', 'a interna acima da venda passa na rota', [(GRAVA, "    else if (valor !== null && valor > 0 && Math.round(interna * 100) > Math.round(valor * 100)) erros.push('Operação interna: não pode passar do valor de venda.')\n", '')]),
    ('G2', 'a interna fora do centavo passa na rota', [(GRAVA, "    else if (Math.abs(interna * 100 - Math.round(interna * 100)) > 1e-6) erros.push(`Operação interna: tem de estar em centavos (veio ${interna}).`)\n", '')]),
    # a gravação que gera o arquivo
    ('G3', 'o arquivo não é gerado ao salvar', [(GRAVA, '        const r = await gerarEGravarArquivo(tenantId, id, autor, lido.dados, lido.calculoId)\n        return', "        const r = { recusas: ['x'] } as { recusas: string[] }\n        return")]),
    ('G4', 'o rateio que não fecha derruba o salvar', [(GRAVA, "    if ('recusa' in rateio) return { arquivo: null, recusasDoArquivo: [rateio.recusa] }", "    if ('recusa' in rateio) throw new ErroDoEstado(rateio.recusa)")]),
    ('G5', 'a falha do arquivo vira 500', [(GRAVA, '        return { arquivo: null, recusasDoArquivo: [fraseDaFalhaDoArquivo(e)] }', '        throw e')]),
    ('G6', 'o arquivo gerado antes de o preço ser gravado', [(GRAVA, "    const rateio = rateioDoOrcamento(gravado, g.valor_operacao_interna)", "    const rateio = rateioDoOrcamento(orc, g.valor_operacao_interna)")]),
    ('G7', 'o autor do arquivo não é quem salvou', [(ROTA, 'gravarPrecificacao(caller.tenant_id, id, corpo, caller.user_id)', "gravarPrecificacao(caller.tenant_id, id, corpo, 'sistema')")]),
    # a conferência e o desenho do PDF
    ('P1', 'a soma que não fecha passa', [(PDF, '    if (soma !== centavos(d.operacaoInterna)) recusas.push(', '    if (false) recusas.push(')]),
    ('P2', 'a venda diferente da interna passa', [(PDF, '    if (centavos(d.valorVenda) !== centavos(d.operacaoInterna)) recusas.push(fraseDaVendaDiferente(d.valorVenda, d.operacaoInterna))\n', '')]),
    ('P3', 'a quantidade do rateio diferente da do item passa', [(PDF, "        else if (r.quantidade !== i.quantidade) recusas.push(", "        else if (false) recusas.push(")]),
    ('P4', 'a razão social vazia passa', [(PDF, "    if (texto(d.empresa.razaoSocial) === '') recusas.push('a razão social da empresa')\n", '')]),
    ('P5', 'a coluna do unitário imprime o total', [(PDF, 'texto(i.vidro), reais(r.unitario), reais(r.total)]', 'texto(i.vidro), reais(r.total), reais(r.total)]')]),
    ('P6', 'o TOTAL impresso é a venda, não a soma dos itens', [(PDF, '    const total = d.rateio.reduce((s, r) => s + r.total, 0)\n    fonte(doc, \'bold\', 11)', "    const total = centavos(d.valorVenda) + 1\n    fonte(doc, 'bold', 11)")]),
    ('P7', 'a observação do item sai em preto', [(PDF, "fonte(doc, 'normal', 7.5); doc.setTextColor(...VERMELHO)", "fonte(doc, 'normal', 7.5); doc.setTextColor(0)")]),
    ('P8', 'os itens fora da ordem', [(PDF, '    const itens = [...d.itens].sort((a, b) => a.ordem - b.ordem)\n    const doRateio', '    const itens = [...d.itens].reverse()\n    const doRateio')]),
    # o servidor: o objeto antes da linha, o tenant, o telefone
    ('S1', 'a linha gravada mesmo com o upload recusado', [(SERV, '    if (eUp) throw new Error(`storage ${BUCKET_DO_CATALOGO}: ${eUp.message}`)\n', '')]),
    ('S2', 'o upload sobrescreve', [(SERV, "{ contentType: 'application/pdf', upsert: false }", "{ contentType: 'application/pdf', upsert: true }")]),
    ('S3', 'o caminho fora da pasta do tenant', [(SERV, 'const caminho = `orcamentos/${tenantId}/${orcamentoId}/${id}.pdf`', 'const caminho = `orcamentos/${orcamentoId}/${id}.pdf`')]),
    ('S4', 'o arquivo gravado sem autor', [(SERV, "gerado_origem: 'manual', gerado_por: autor,", "gerado_origem: 'manual', gerado_por: null,")]),
    ('S5', 'o último arquivo é o mais antigo', [(SERV, ".order('gerado_em', { ascending: false }).limit(1)", ".order('gerado_em', { ascending: true }).limit(1)")]),
    ('S6', 'o último arquivo de qualquer empresa', [(SERV, "select('bucket, caminho, gerado_em').eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId)", "select('bucket, caminho, gerado_em').eq('orcamento_id', orcamentoId)")]),
    ('S7', 'o celular de 11 dígitos vira fixo', [(SERV, "(d.length === 11 && d[2] === '9') ||", "(d.length === 11 && d[2] === '8') ||")]),
    ('S8', 'o vendedor lido de outra empresa', [(SERV, "select('email').eq('tenant_id', tenantId).eq('id', funcionario)", "select('email').eq('id', funcionario)")]),
    # a tela
    ('T1', 'a faixa usa a venda, não a interna', [(CONTENT, '<ItensPrecificados itens={itensDoArquivo} recusaDosItens={recusaDosItensDoArquivo} interna={internaNaTela}', '<ItensPrecificados itens={itensDoArquivo} recusaDosItens={recusaDosItensDoArquivo} interna={internaNaTela + 1}')]),
    ('T2', 'a faixa sem o total', [(FAIXA, '<Typography.Text strong>{reais(rateio.centavos)}</Typography.Text>', '<Typography.Text strong>{reais(0)}</Typography.Text>')]),
    ('T3', 'a faixa sem as variáveis', [(FAIXA, "{i.variaveis.length > 0 && <div style={{ fontSize: 12, color: '#475569' }} data-variaveis-do-item=\"\">{i.variaveis.join(' · ')}</div>}", '')]),
    ('T4', 'a faixa mostra zero sem preço formado', [(FAIXA, '{rateio === null && <Typography.Paragraph type="secondary" data-sem-preco="">{FRASE_SEM_PRECO}</Typography.Paragraph>}', '')]),
    ('T5', 'o valor da mão de obra volta na tela do orçamento (celular)', [(INDUS, "              {!somenteLeitura && (\n                <div style={{ flex: '1 1 50%', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }} data-valor-da-mao-de-obra=\"\">", "              {true && (\n                <div style={{ flex: '1 1 50%', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }} data-valor-da-mao-de-obra=\"\">")]),
    ('T6', 'o orçamento abre na página de antes', [(LISTA, 'export const urlDaPrecificacao = (id: string) => `${ROUTES.ATENDIMENTOS_IA_ORCAMENTOS}/${id}/precificacao`', 'export const urlDaPrecificacao = (id: string) => `${ROUTES.ATENDIMENTOS_IA_ORCAMENTOS}/${id}`')]),
    ('T7', 'o salvar manda a interna zerada', [(CONTENT, "valor_operacao_interna: interna && 'interna' in interna ? interna.interna : 0,", 'valor_operacao_interna: 0,')]),
    ('T8', 'o salvar não recusa a interna divergente', [(CONTENT, "    if (interna && 'falta' in interna) faltas.push(interna.falta)\n", '')]),
    # o escopo fiscal (dono do produto, 11/11/2026): NCM opcional, a referência do tenant sem NCM, o preset da comercialização
    ('F1', 'o NCM volta a ser obrigatório', [(PREC, "    if (ncm !== '' && !FORMA_DO_NCM.test(ncm)) faltas.push(faltaDoNcmFora(ncm))", "    if (!FORMA_DO_NCM.test(ncm)) faltas.push(faltaDoNcmFora(ncm))")]),
    ('F2', 'sem NCM e sem a referência, o preço se grava', [(PREC, "    if (ncm === '' && args.referenciaDoTenant === false) faltas.push(FALTA_DA_REFERENCIA_DO_TENANT)\n", '')]),
    ('F3', 'a referência cobrada também com NCM', [(PREC, "    if (ncm === '' && args.referenciaDoTenant === false)", "    if (args.referenciaDoTenant === false)")]),
    ('F6', 'a travessia cria o orçamento sem o preset', [(PLANO, '        ...PRESET_DA_COMERCIALIZACAO,\n', '')]),
    ('F7', 'o preset é interestadual', [(PREC, "export const PRESET_DA_COMERCIALIZACAO = { sale_scope: 'INTRAESTADUAL',", "export const PRESET_DA_COMERCIALIZACAO = { sale_scope: 'INTERESTADUAL',")]),
    ('F8', 'a UF sem ICMS interno conta como referência', [(CONTENT, '        setReferenciaDoTenant(icmsDaUf !== null)', "        setReferenciaDoTenant(uf !== '')")]),
    ('F9', 'o PIS/COFINS da empresa não entra no orçamento', [(CONTENT, '    if (ehOrcamentoDeIndustrializacao && pisCofinsDaReferencia !== null) setPisCofinsLRPct(pisCofinsDaReferencia)', '    if (false) setPisCofinsLRPct(pisCofinsDaReferencia ?? 0)')]),
    ('F10', 'o PIS/COFINS da referência sem excluir o ICMS', [(NCMPIS, '  return parseFloat((PIS_COFINS_NAO_CUMULATIVO_PCT * (1 - args.icmsPct / 100)).toFixed(4))', '  return PIS_COFINS_NAO_CUMULATIVO_PCT')]),
    # a empresa é a fonte única dos impostos, o fiscal é invisível, e o topo do cliente (dono do produto, 11/11/2026, segunda rodada)
    ('E1', 'o servidor aceita o escopo do corpo', [(GRAVA, "    const fiscal = 'fiscal' in doModelo ? doModelo.fiscal : { ...PRESET_DA_COMERCIALIZACAO }", "    const fiscal = { ...PRESET_DA_COMERCIALIZACAO, sale_scope: (corpo.sale_scope === 'INTERESTADUAL' ? 'INTERESTADUAL' : 'INTRAESTADUAL') as 'INTRAESTADUAL', uf_destino: (typeof corpo.uf_destino === 'string' ? corpo.uf_destino : null) as null }")]),
    ('E2', 'o bloco Fiscal volta ao orçamento', [(CONTENT, '      {!ehOrcamentoDeIndustrializacao && (<>', '      {true && (<>')]),
    ('P0', 'o padrão da prop impostosDaEmpresa passa de ausente/falso a LIGADO (Produtos herdaria o comportamento do orçamento)', [(PRICE, '  impostosDaEmpresa = false,', '  impostosDaEmpresa = true,')]),
    ('E3', 'o ICMS se edita no orçamento', [(PRICE, "pricingRow('ICMS (%)', 'icms', impostosDaEmpresa ? undefined : 'icms',", "pricingRow('ICMS (%)', 'icms', 'icms',")]),
    ('E4', 'o PIS/COFINS se edita no orçamento', [(PRICE, "              impostosDaEmpresa ? undefined : 'pisCofins',", "              'pisCofins',")]),
    ('E5', 'a CBS nula entra como zero', [(CONTENT, '          cbsPct={ehOrcamentoDeIndustrializacao ? cbsDaEmpresa : cbsPct}', '          cbsPct={ehOrcamentoDeIndustrializacao ? (cbsDaEmpresa ?? 0) : cbsPct}')]),
    ('E6', 'a linha do tributo nulo aparece', [(PRICE, '.filter((r): r is typeof r & { value: number } => r.value !== null)', '.filter((r): r is typeof r & { value: number } => true)')]),
    ('E7', 'o IBS se edita no orçamento', [(PRICE, '                        disabled={impostosDaEmpresa}', '                        disabled={false}')]),
    ('E8', 'a CBS da empresa não é lida', [(CONTENT, '        setCbsDaEmpresa(data?.cbs_reference_pct != null ? Number(data.cbs_reference_pct) : null)', '        setCbsDaEmpresa(null)')]),
    ('E9', 'o topo esconde o campo sem dado', [(TOPO, '                {CAMPOS_DO_CLIENTE.map(([rotulo, chave]) => (', '                {CAMPOS_DO_CLIENTE.filter(([, c]) => cliente[c] != null).map(([rotulo, chave]) => (')]),
    ('E10', 'o topo preenche o vazio com zero', [(TOPO, "{cliente[chave] ?? ''}", "{cliente[chave] ?? '0'}")]),
    ('E11', 'o GET não traz o cliente', [(ROTA, 'lerClienteDoOrcamento(caller.tenant_id, id)])', 'Promise.resolve(null)])')]),
    ('E12', 'o cliente lido de outra empresa', [(SERV, "select('nome, levantamento_id').eq('tenant_id', tenantId).eq('id', orcamentoId)", "select('nome, levantamento_id').eq('id', orcamentoId)")]),
    ('E13', 'o PDF e a tela com rótulos diferentes', [(PDF, "['CLIENTE:', 'nome'], ['TEL. FIXO:', 'telFixo']", "['CLIENTE:', 'nome'], ['TELEFONE:', 'telFixo']")]),
    # o preset preso por teste, a chave pelo segmento, o aviso e o rastro da sobrescrita (dono do produto, 11/11/2026, terceira rodada)
    ('F7b', 'o preset é para contribuinte', [(PREC, "buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null as null, ncm_code: null as null } as const", "buyer_type: 'CONTRIBUINTE_PJ', uf_destino: null as null, ncm_code: null as null } as const")]),
    ('K1', 'a chave volta a ser o modo orçamento, sem o segmento', [(CONTENT, "  const ehOrcamentoDeIndustrializacao = ehOrcamento && productType === 'PRODUZIDO'", '  const ehOrcamentoDeIndustrializacao = ehOrcamento')]),
    ('K2', 'o servidor dá o preset a qualquer modelo', [(PREC, "    if (modelo === 'PRODUZIDO') return { fiscal: { ...PRESET_DA_COMERCIALIZACAO } }", '    if (true) return { fiscal: { ...PRESET_DA_COMERCIALIZACAO } }')]),
    ('D1', 'a divergência nunca é vista', [(PREC, '        return gravado !== null && gravado !== undefined && gravado !== preset[campo] ?', '        return false ?')]),
    ('D2', 'o nulo de antes do preset conta como divergência', [(PREC, '        return gravado !== null && gravado !== undefined && gravado !== preset[campo] ?', '        return gravado !== undefined && gravado !== preset[campo] ?')]),
    ('D3', 'a sobrescrita em silêncio', [(GRAVA, '    if (sobrescrito.length) console.error(', '    if (false) console.error(')]),
    ('D4', 'o salvar da tela sem a marca da edição manual', [(GRAVA, ', editado_manualmente_em: agora.toISOString(), editado_manualmente_por: autor })', ' })')]),
    ('D5', 'o aviso da divergência não aparece', [(TOPO, '    if (divergencia.length === 0) return null', '    if (true) return null')]),
    ('D6', 'o GET não aponta a divergência', [(ROTA, 'fiscal_divergente: fiscalDivergente(orcamento),', 'fiscal_divergente: [],')]),
    ('F11', 'a tela não passa a referência às faltas', [(CONTENT, '  const referenciaExigida = (): boolean | null => (ehOrcamentoDeIndustrializacao && isLRorLP ? referenciaDoTenant === true : null)', '  const referenciaExigida = (): boolean | null => null')]),
]
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
_textos = {}
def _texto(a):
    if a not in _textos: _textos[a] = open(os.path.join(RAIZ, a), encoding='utf-8').read()
    return _textos[a]
exigir_trecho_unico((i, [(a, _texto(a), de, para) for a, de, para in trocas]) for i, _d, trocas in MUTACOES)


def jest():
    return subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True).returncode


# G6 é EQUIVALENTE: o rateio lê só os itens (quantidade e custo líquido total), e o UPDATE da precificação não os toca — `orc` e `gravado`
# dão o mesmo rateio. Fica na lista para a próxima pessoa saber que foi medida e por que sobrevive.
EQUIVALENTES: set = {'G6'}


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda", flush=True)
        vivas += 0 if verde else 1
    for ident, descricao, trocas in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        originais = {a: open(os.path.join(RAIZ, a), encoding='utf-8').read() for a, _de, _para in trocas}
        try:
            novos = dict(originais)
            for a, de, para in trocas:
                novos[a] = novos[a].replace(de, para)
            for a, t in novos.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
            morta = jest() != 0
        finally:
            for a, t in originais.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
        if ident in EQUIVALENTES:
            print(f"{'morta   ' if morta else 'equival.'} {ident}: {descricao}", flush=True)
            continue
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}", flush=True)
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}", flush=True)
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
