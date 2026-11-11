#!/usr/bin/env python3
"""
As MUTAÇÕES de `calcularNoMotorDoProduto` (`src/utils/motor-do-produto.ts`), a conta do motor extraída do `doProductCalc` (11/11/2026). O juiz é
SÓ o portão do módulo (`motor-do-produto.test.ts`): as travas de Produtos protegem a tela e NÃO contam como cobertura dele (dono do produto).
Cada mutação estraga UMA regra, roda a suíte e DESFAZ. M0 é o controle. Roda numa worktree (`mutacao-na-arvore-de-trabalho.md`) e confere todo
trecho antes (`mutacao-que-nao-se-aplica.md`).
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
MOD = 'src/utils/motor-do-produto.ts'
SUITES = ['src/utils/__tests__/motor-do-produto.test.ts']
TELA = 'src/page-parts/products/content.component.tsx'
# as mutações da TELA (a conta de volta no doProductCalc) têm outro juiz: o portão de fonte que afirma que o Content não refaz a conta
SUITES_DA_TELA = ['src/utils/__tests__/o-content-nao-refaz-a-conta-do-motor.test.ts']
ANCORA = "    if (conta) setProductPriceInfo((prev) => ({ ...prev, ...conta.campos, ...conta.porProdutoDoServico(prev) }))\n"

MUTACOES = [
    ('W1', 'o produzido perde a mão de obra produtiva', [(MOD, "      productWorkloadMinutes: effectiveCalcType === 'REVENDA' ? 0 : entrada.productWorkloadMinutes,", '      productWorkloadMinutes: 0,')]),
    ('W2', 'o produto de revenda segue o tenant', [(MOD, "  return productType === 'REVENDA'\n    ? 'REVENDA'", "  return false\n    ? 'REVENDA'")]),
    ('X1', 'o IRPJ do imposto efetivo é 16% do lucro', [(MOD, '      const irpjPct = productPriceInfo.productProfitPercent * 0.15', '      const irpjPct = productPriceInfo.productProfitPercent * 0.16')]),
    ('X2', 'a CSLL do imposto efetivo é 10% do lucro', [(MOD, '      const csllPct = productPriceInfo.productProfitPercent * 0.09', '      const csllPct = productPriceInfo.productProfitPercent * 0.10')]),
    ('X3', 'o adicional de IRPJ não entra', [(MOD, '      const adicionalPct = isLRorLP ? (additionalIrpjPercent || 0) : 0', '      const adicionalPct = 0')]),
    ('X4', 'o MEI ganha imposto por item', [(MOD, '        isMei: !!calcBase.isMei,', '        isMei: false,')]),
    ('E1', 'a despesa fixa sai pelo percentual da variável', [(MOD, '        fixedExpensePrice: priceUnit * (calcBase.fixedExpensePct / 100),', '        fixedExpensePrice: priceUnit * (calcBase.variableExpensePct / 100),')]),
    ('E2', 'o divisor da estrutura sem a despesa fixa', [(MOD, '      fixaPct: calcBase.fixedExpensePct,', '      fixaPct: 0,')]),
    ('S1', 'o lucro por produto do serviço sai pela comissão', [(MOD, '        productProfitPriceByProduct: resultProductService * (prev.productProfitPercentByProduct / 100) || 0,', '        productProfitPriceByProduct: resultProductService * (prev.salesCommissionPercentByProduct / 100) || 0,')]),
    ('S2', 'o preço de serviço aparece fora do serviço', [(MOD, '        totalServicePrice: isCalcService ? engineResult.priceUnit : 0,', '        totalServicePrice: engineResult.priceUnit,')]),
    ('V1', 'o motor inválido devolve campos', [(MOD, '    if (!engineResult.isValid) return null', '    if (false) return null')]),
    ('O1', 'o orçamento é calculado como produto (a entrada ignora o modo)', [(MOD, '    const entrada = entradaDoMotor(modo, {', "    const entrada = entradaDoMotor({ tipo: 'produto' }, {")]),
    # a CONTA DE VOLTA no doProductCalc: cada uma recalcula na tela algo que o módulo já devolve
    ('T1', 'a tela chama o motor de novo', [(TELA, ANCORA, ANCORA + "    const deNovo = calculatePricing({} as never)\n")]),
    ('T2', 'a tela recalcula o IRPJ do imposto efetivo', [(TELA, ANCORA, ANCORA + "    const irpjNaTela = productPriceInfo.productProfitPercent * 0.15\n")]),
    ('T3', 'a tela relê o preço do motor', [(TELA, ANCORA, ANCORA + "    const precoNaTela = conta?.campos.totalProductPrice ?? engineResult.priceUnit\n")]),
    ('T4', 'a tela volta a ter o ternário do tipo de cálculo', [(TELA, '    const effectiveCalcType = tipoDeCalculoEfetivo(productType, currentUser?.calcType)\n', "    const effectiveCalcType = productType === 'REVENDA' ? 'REVENDA' : currentUser?.calcType === 'RESALE' ? 'REVENDA' : 'SERVICO'\n")]),
]
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
_textos = {}
def _texto(a):
    if a not in _textos: _textos[a] = open(os.path.join(RAIZ, a), encoding='utf-8').read()
    return _textos[a]
exigir_trecho_unico((i, [(a, _texto(a), de, para) for a, de, para in trocas]) for i, _d, trocas in MUTACOES)


def jest(suites=None):
    return subprocess.run(['npx', 'jest', '--silent', *(suites or SUITES)], cwd=RAIZ, capture_output=True, text=True).returncode


EQUIVALENTES: set = set()


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0 and jest(SUITES_DA_TELA) == 0
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
            morta = jest(SUITES_DA_TELA if ident.startswith('T') else None) != 0
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
