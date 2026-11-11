#!/usr/bin/env python3
"""
As MUTAÇÕES de `formarPrecoDoProduto` (`src/utils/preco-do-produto.ts`), a formação do preço extraída do `ProductPrice` (11/11/2026). O juiz é
SÓ o portão do módulo (`preco-do-produto.test.ts`): a trava de Produtos protege a tela e NÃO conta como cobertura dele (dono do produto). Cada
mutação estraga UMA regra, roda a suíte e DESFAZ. M0 é o controle. Roda numa worktree (`mutacao-na-arvore-de-trabalho.md`) e confere todo
trecho antes (`mutacao-que-nao-se-aplica.md`).
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
MOD = 'src/utils/preco-do-produto.ts'
SUITES = ['src/utils/__tests__/preco-do-produto.test.ts']
TELA = 'src/page-parts/products/product-price.component.tsx'
# as mutações da TELA (a fórmula de volta no ProductPrice) têm outro juiz: o portão de fonte que afirma que a tela não refaz conta nenhuma
SUITES_DA_TELA = ['src/utils/__tests__/tela-do-produto-soma-fecha.test.ts']
ANCORA = "    ivaReductionCbsPct, isResaleProduct,\n  })\n"

MUTACOES = [
    ('I1', 'o IRPJ é 16% do lucro', [(MOD, 'const irpjVal = showIrpjCsll ? profitVal * 0.15 : 0', 'const irpjVal = showIrpjCsll ? profitVal * 0.16 : 0')]),
    ('I2', 'a CSLL é 10% do lucro', [(MOD, 'const csllVal = showIrpjCsll ? profitVal * 0.09 : 0', 'const csllVal = showIrpjCsll ? profitVal * 0.10 : 0')]),
    ('I3', 'o Híbrido ganha IRPJ e CSLL', [(MOD, 'const showIrpjCsll = isLucroReal || isLucroPresumed', 'const showIrpjCsll = isLucroReal || isLucroPresumed || isSimplesHibrido')]),
    ('A1', 'o Híbrido perde o acréscimo', [(MOD, 'const terceirizadasTotal = (isLucroReal || isLucroPresumed || isSimplesHibrido)', 'const terceirizadasTotal = (isLucroReal || isLucroPresumed)')]),
    ('A2', 'o acréscimo vale em todo regime', [(MOD, 'const terceirizadasTotal = (isLucroReal || isLucroPresumed || isSimplesHibrido)', 'const terceirizadasTotal = (true)')]),
    ('B1', 'a interna ignora a matriz', [(MOD, 'const baseForSalePrice = _matriz.applied ? _matriz.opInterna : pricePerUnit', 'const baseForSalePrice = pricePerUnit')]),
    ('B2', 'o final ignora a matriz', [(MOD, 'const finalPriceWithTaxes = _matriz.applied ? _matriz.totalGeral : _iva.finalPrice', 'const finalPriceWithTaxes = _iva.finalPrice')]),
    ('B3', 'o por fora ignora a matriz', [(MOD, 'const totalInlineTax = _matriz.applied ? (_matriz.resolved?.externalValue ?? 0) : _iva.totalOutside', 'const totalInlineTax = _iva.totalOutside')]),
    ('B4', 'o final sem o acréscimo no caminho de antes', [(MOD, 'const finalSalePrice = baseForSalePrice + terceirizadasTotal', 'const finalSalePrice = baseForSalePrice')]),
    ('C1', 'a CBS nula entra como 1%', [(MOD, 'cbsPct: (cbsPct || 0) / 100,', 'cbsPct: (cbsPct ?? 1) / 100,')]),
    ('C2', 'o ICMS vira linha fora do Lucro Real e do Presumido', [(MOD, "    ...((isLucroReal || isLucroPresumed) && tributoExisteNoSegmento(_segmento, 'ICMS')", "    ...(tributoExisteNoSegmento(_segmento, 'ICMS')")]),
    ('F1', 'o formado esquece a operação por dentro do Lucro Real', [(MOD, 'const formado = finalPriceWithTaxes > 0 && (!(isLucroReal || isLucroPresumed) || valorPrecificado > 0)', 'const formado = finalPriceWithTaxes > 0')]),
    ('F2', 'o formado aceita o preço zero', [(MOD, 'const formado = finalPriceWithTaxes > 0 && (!(isLucroReal || isLucroPresumed) || valorPrecificado > 0)', 'const formado = finalPriceWithTaxes >= 0 && (!(isLucroReal || isLucroPresumed) || valorPrecificado > 0)')]),
    ('F3', 'o formado sempre verdadeiro', [(MOD, 'const formado = finalPriceWithTaxes > 0 && (!(isLucroReal || isLucroPresumed) || valorPrecificado > 0)', 'const formado = true')]),
    # a FÓRMULA DE VOLTA no ProductPrice (dono do produto, 11/11/2026): cada uma recalcula na tela algo que o módulo já devolve
    ('T1', 'a tela remonta as linhas', [(TELA, ANCORA, ANCORA + "  const linhasDeNovo = buildProductPriceRows({ rows: [], costTotal, opInterna: null, resolved: null })\n")]),
    ('T2', 'a tela recalcula o IRPJ à mão', [(TELA, ANCORA, ANCORA + "  const irpjNaTela = productPriceInfo.productProfitPrice * 0.15\n")]),
    ('T3', 'a tela recalcula o preço final pela matriz', [(TELA, ANCORA, ANCORA + "  const finalNaTela = _matriz.applied ? _matriz.totalGeral : finalPriceWithTaxes\n")]),
    ('T4', 'a tela recompõe o final a partir das partes devolvidas', [(TELA, ANCORA, ANCORA + "  const finalNaTela = baseForSalePrice + totalInlineTax\n")]),
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
