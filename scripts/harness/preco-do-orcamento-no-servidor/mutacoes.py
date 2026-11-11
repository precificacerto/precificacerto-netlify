#!/usr/bin/env python3
"""
As MUTAÇÕES da ligação do preço do orçamento no SERVIDOR (`src/lib/atendimentos-ia/preco-do-orcamento.ts`, a cadeia do "sim", 11/11/2026). O juiz
é o portão permanente servidor = tela (`o-servidor-forma-o-preco-da-tela.test.tsx`): cada mutação muda UMA entrada que o servidor liga, e a
tela, que não muda, tem de discordar. C1 e C2 são a mutação de UM CENTAVO que o dono do produto exigiu que morresse. M0 é o controle. Roda
numa worktree (`mutacao-na-arvore-de-trabalho.md`) e confere todo trecho antes (`mutacao-que-nao-se-aplica.md`).
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
MOD = 'src/lib/atendimentos-ia/preco-do-orcamento.ts'
SUITES = ['src/utils/__tests__/o-servidor-forma-o-preco-da-tela.test.tsx']

MUTACOES = [
    ('C1', 'UM CENTAVO a mais na venda', [(MOD, '            valor_venda: venda,', '            valor_venda: venda + 0.01,')]),
    ('C2', 'UM CENTAVO a mais na interna', [(MOD, '            valor_operacao_interna: interna.interna,', '            valor_operacao_interna: interna.interna + 0.01,')]),
    ('P1', 'o PIS/COFINS da referência não entra', [(MOD, 'pisCofinsLRPct: pisCofins ?? 0,', 'pisCofinsLRPct: 0,')]),
    ('P2', 'o Presumido apura como o Real', [(MOD, 'pisCofinsDaReferenciaDoTenant({ isLucroReal, isLucroPresumido, icmsPct: icmsDaUf })', 'pisCofinsDaReferenciaDoTenant({ isLucroReal: isLRorLP, isLucroPresumido: false, icmsPct: icmsDaUf })')]),
    ('I1', 'o ICMS da UF não entra', [(MOD, 'icmsPct: icmsDaUf ?? 0,', 'icmsPct: 0,')]),
    ('I2', 'o Simples Nacional lê o ICMS da UF', [(MOD, '    const icmsDaUf = isLRorLPorSH ? empresa.icmsDaUf : null', '    const icmsDaUf = empresa.icmsDaUf')]),
    ('B1', 'o IBS da empresa não entra', [(MOD, 'ibsPct: isLRorLPorSH ? empresa.ibsDaEmpresa : null,', 'ibsPct: null,')]),
    ('B2', 'a CBS da empresa não entra', [(MOD, 'cbsPct: isLRorLPorSH ? empresa.cbsDaEmpresa : null,', 'cbsPct: null,')]),
    ('B3', 'o IBS/CBS entra no Simples Nacional', [(MOD, 'ibsPct: isLRorLPorSH ? empresa.ibsDaEmpresa : null,', 'ibsPct: empresa.ibsDaEmpresa,')]),
    ('R1', 'a comissão do orçamento é ignorada', [(MOD, '        salesCommissionPercent: orcamento.comissao_percentual ?? 0,', '        salesCommissionPercent: 0,')]),
    ('R2', 'a reserva técnica nula vira 1%', [(MOD, '        rtReservePercent: orcamento.reserva_tecnica_percentual ?? 0,', '        rtReservePercent: orcamento.reserva_tecnica_percentual ?? 1,')]),
    ('R3', 'o lucro do orçamento é ignorado', [(MOD, '        productProfitPercent: orcamento.lucro_projetado_percentual ?? 0,', '        productProfitPercent: 10,')]),
    ('W1', 'os minutos da fabricação não entram', [(MOD, '        productWorkloadInMinutes: entradaDoMotor(modo, { itemsPriceSum: 0, workloadMinutes: 0 }).productWorkloadMinutes,', '        productWorkloadInMinutes: 0,')]),
    ('K1', 'sem a carga horária, o servidor precifica assim mesmo', [(MOD, "    if (carga.isUnset && tipoDeCalculoEfetivo('PRODUZIDO', usuario.calcType) !== 'REVENDA' && inicial.productWorkloadInMinutes > 0) {", "    if (false) {")]),
    ('A1', 'o IRPJ adicional de 5% entra no preço', [(MOD, 'productPriceInfo: info, customTaxPercent: null, additionalIrpjPercent: 0,', 'productPriceInfo: info, customTaxPercent: null, additionalIrpjPercent: 5,')]),
    ('F1', 'sem o motor, a reconciliação acusa "recalcule"', [(MOD, '        custoDoMotor: conta ? Number(info.productCost) || 0 : somaDasLinhas(orcamento.itens),', '        custoDoMotor: Number(info.productCost) || 0,')]),
    ('F2', 'o preço não formado é gravado', [(MOD, '    const venda = p.formado && p.finalPriceWithTaxes > 0 ? p.finalPriceWithTaxes : 0', '    const venda = p.finalPriceWithTaxes > 0 ? p.finalPriceWithTaxes : 0')]),
    ('F3', 'a falta da referência do tenant não é cobrada', [(MOD, '        referenciaDoTenant: isLRorLP ? icmsDaUf !== null : null,', '        referenciaDoTenant: null,')]),
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


# I2 é EQUIVALENTE, medido na primeira passada (11/11/2026): no Simples Nacional a matriz não usa o ICMS (o DAS o cobre), e o preço com o ICMS
# de 17% entrando saiu idêntico ao da tela, que não o lê. Ler o ICMS ali é a ligação errada, mas não muda número nenhum hoje.
EQUIVALENTES: set = {'I2'}


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
