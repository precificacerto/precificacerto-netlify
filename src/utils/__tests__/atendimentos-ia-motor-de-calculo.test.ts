/**
 * @jest-environment node
 *
 * PORTÃO — o MOTOR DE CÁLCULO e o AVALIADOR RESTRITO das fórmulas. Função pura; nada de banco.
 *
 * As regras daqui são MONTADAS no teste: os dados reais da DP-02 não estão no repositório. Os
 * valores escolhidos DISTINGUEM o certo do errado (`teste-que-nao-exercita.md`, variante 2): cor
 * do perfil diferente da do acessório, barra que não fecha inteira, família e usuário com valores
 * diferentes para a mesma variável.
 *
 *   (1) a fórmula em pt-BR — `·`, `−` e vírgula decimal — resolve certo;
 *   (2) função ou operador fora dos medidos vai para pendentes com a fórmula COMO ESTÁ ESCRITA;
 *   (3) variável ausente vai para pendentes NOMEANDO a variável — nunca vira zero; o usuário vence
 *       a família;
 *   (4) condição falsa exclui a regra; verdadeira inclui;
 *   (5) barra inteira arredonda para cima; consumo cobra o proporcional; os dois pesos;
 *   (6) cor: o perfil filtra pela cor do perfil, o reforço não filtra, o acessório usa a cor do
 *       acessório;
 *   (7) a quantidade ambígua: uma alternativa sem marca, duas ou três marcadas, e o total soma;
 *   (8) o insumo: o unitário está em `valor_metro_interno`; vendido por barra é pendente;
 *   (9) O LÍQUIDO (dono do produto, 20/10/2026): bruto − ICMS − PIS − COFINS, todos sobre o bruto, com
 *       as alíquotas da ENTRADA (o ICMS interno sai do item). Faltando QUALQUER alíquota, o líquido
 *       não sai e a linha diz qual faltou — e o total segue a regra. O IPI é linha própria, fora do
 *       líquido; o que se faz com ele vem da entrada. Nenhuma alíquota padrão no código;
 *  (10) código sem preço, e os totais por categoria;
 * (1b) A VÍRGULA PELA ARIDADE CONHECIDA (medição de 20/10/2026 nas 4.055 regras): IIF tem
 *       SEMPRE 3 argumentos e as vírgulas de topo dele são separadores; ROUND e ARREDMAIOR têm
 *       SEMPRE 1, e a vírgula de topo dentro deles é decimal. Os casos são os exemplos reais;
 * (5b) o IPI por fora: bruto × `ipi`, que vem como FRAÇÃO (6,5% é 0,065);
 *  (11) NADA DE `eval` nem `Function` nos dois módulos. Este afirma o CAMINHO, não o efeito — e é
 *       o caso limite que `teste-que-nao-exercita.md` admite: o defeito seria a presença, e não há
 *       número que mude com ela.
 */
import * as fs from 'fs'
import * as path from 'path'

import { avaliarCondicao, avaliarNumero, type Resolver } from '@/utils/atendimentos-ia-motor-formula'
import {
    calcularTipologia, MOTIVO_INSUMO_VENDIDO_POR_BARRA, PESO_E_APROXIMADO,
    type EntradaDoMotor, type EntradaFiscal, type ItemDoPreco, type RegraDoMotor,
} from '@/utils/atendimentos-ia-motor-de-calculo'
import { COLUNA_DA_CATEGORIA_DO_FORNECEDOR } from '@/utils/atendimentos-ia-importacao'

const regra = (codigo: string, extra: Partial<RegraDoMotor> = {}): RegraDoMotor => ({
    codigo, descricao: `regra ${codigo}`, [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Perfil PVC', cor: 'BRANCO', linha: 'EUROPA 42',
    tipo: 'Perfil', eixo: 'Largura', corte: '45/45', formula_em_lh: 'L', formula_qtde: '2', condicao: null, tipologias: ['DP-02'],
    ...extra,
})
const perfil = (codigo: string, extra: Partial<ItemDoPreco> = {}): ItemDoPreco => ({
    codigo, descricao: `item ${codigo}`, medida_barra_m: 6, peso: 2, ipi: 0, aliquota_interna_pct: 17, vendido_por: 'barra',
    valor_metro_interno: 100, valor_barra_interno: 600, valor_metro_12: 90, valor_barra_12: 540, ...extra,
})
const unitario = (codigo: string, extra: Partial<ItemDoPreco> = {}): ItemDoPreco => ({
    codigo, descricao: `item ${codigo}`, medida_barra_m: null, peso: 0.05, ipi: 0, aliquota_interna_pct: null, vendido_por: 'unidade',
    valor_metro_interno: 3.5, valor_barra_interno: 35, valor_metro_12: null, valor_barra_12: null, ...extra,
})
const entrada = (regras: RegraDoMotor[], itens: ItemDoPreco[], extra: Partial<EntradaDoMotor> = {}): EntradaDoMotor => ({
    regras, itens, formulas: [], tipologia: 'DP-02', linha: 'PVC EUROPA 42', L: 1500, H: 1200, quantidade: 1,
    corPerfil: 'BRANCO', corAcessorio: 'PRETO', variaveis: {}, modo: 'barra-inteira', colunaDePreco: 'interna', ...extra,
})
const nenhuma: Resolver = (nome) => ({ ok: false, motivo: `${nome} não informada`, variavel: nome })
const com = (v: Record<string, number>): Resolver => (nome) => (nome in v ? { ok: true, valor: v[nome] } : nenhuma(nome))

describe('(1) a fórmula em pt-BR resolve certo', () => {
    it.each([
        ['1/2·L − 4,2', { L: 1500 }, 745.8],
        ['H − 87,8', { H: 1200 }, 1112.2],
        ['L + 6', { L: 1500 }, 1506],
        ['(NF*2)', { NF: 4 }, 8],
        ['-2 + 3·(1,5 − 0,5)', {}, 1],
        ['ARREDMAIOR(NF/3)', { NF: 4 }, 2],
        // 0,1 · 3 · 10 dá 3,0000000000000004 em ponto flutuante: sem tirar o ruído, ARREDMAIOR daria 4.
        ['ARREDMAIOR(X·3·10)', { X: 0.1 }, 3],
        ['ROUND(L/7)', { L: 1500 }, 214],
        ['IIF(L > 1000, 3, 2)', { L: 1500 }, 3],
        ['IIF(L < 1000, 3, 2)', { L: 1500 }, 2],
    ])('%s', (formula, vars, esperado) => {
        const r = avaliarNumero(formula, com(vars))
        expect(r).toEqual({ ok: true, valor: esperado })
    })

    it('a condição: `=`, `>`, `<`, `and`, `or`', () => {
        expect(avaliarCondicao('NF = 4 and L > 1000', com({ NF: 4, L: 1500 }))).toEqual({ ok: true, valor: true })
        expect(avaliarCondicao('NF < 2 or L < 1000', com({ NF: 4, L: 1500 }))).toEqual({ ok: true, valor: false })
    })

    it('de ponta a ponta: a medida do corte sai da coluna 11', () => {
        const r = calcularTipologia(entrada([regra('9681', { formula_em_lh: '1/2·L − 4,2', formula_qtde: '2' })], [perfil('9681')]))
        expect(r.linhas[0].cortes[0].medidaMm).toBe(745.8)
        expect(r.linhas[0].mmTotais).toBeCloseTo(1491.6, 9)
    })
})

describe('(1b) a vírgula pela ARIDADE conhecida — os exemplos reais', () => {
    it('"IIF(UT=1,8,4)": 3 argumentos, as vírgulas são separadores', () => {
        expect(avaliarNumero('IIF(UT=1,8,4)', com({ UT: 1 }))).toEqual({ ok: true, valor: 8 })
        expect(avaliarNumero('IIF(UT=1,8,4)', com({ UT: 2 }))).toEqual({ ok: true, valor: 4 })
    })

    it('"ROUND(QTPAL*0,8)": 1 argumento, a vírgula é DECIMAL — ROUND(QTPAL × 0,8)', () => {
        expect(avaliarNumero('ROUND(QTPAL*0,8)', com({ QTPAL: 7 }))).toEqual({ ok: true, valor: 6 })
        expect(avaliarNumero('ROUND(QTPAL*0,8)', com({ QTPAL: 3 }))).toEqual({ ok: true, valor: 2 })
    })

    it('"IIF(UT=1,(NF*4),(NF*2))": 3 argumentos', () => {
        expect(avaliarNumero('IIF(UT=1,(NF*4),(NF*2))', com({ UT: 1, NF: 3 }))).toEqual({ ok: true, valor: 12 })
        expect(avaliarNumero('IIF(UT=1,(NF*4),(NF*2))', com({ UT: 0, NF: 3 }))).toEqual({ ok: true, valor: 6 })
    })

    it('ARREDMAIOR com vírgula de topo: decimal — ARREDMAIOR(NF/2,5) é ARREDMAIOR(NF ÷ 2,5)', () => {
        expect(avaliarNumero('ARREDMAIOR(NF/2,5)', com({ NF: 4 }))).toEqual({ ok: true, valor: 2 })
    })

    it('decimal dentro de parêntese, dentro do IIF: "IIF(UT=1,(NF*0,5),2)"', () => {
        expect(avaliarNumero('IIF(UT=1,(NF*0,5),2)', com({ UT: 1, NF: 4 }))).toEqual({ ok: true, valor: 2 })
    })

    it('ponto entre dígitos: pendente — ZERO ocorrências HOJE, neste arquivo, e não é garantia', () => {
        const r = avaliarNumero('L - 4.2', com({ L: 1500 }))
        expect(r.ok).toBe(false)
        expect(r.ok ? '' : (r as { motivo: string }).motivo).toMatch(/ponto entre dígitos/)
    })

    it('ROUND no meio exato vai para pendentes — o lado do WVetro não foi medido; fora do meio, arredonda', () => {
        expect(avaliarNumero('ROUND(X)', com({ X: 2.5 }))).toEqual(expect.objectContaining({ ok: false, motivo: expect.stringMatching(/meio exato/) }))
        expect(avaliarNumero('ROUND(X)', com({ X: 2.51 }))).toEqual({ ok: true, valor: 3 })
        expect(avaliarNumero('ROUND(X)', com({ X: 2.49 }))).toEqual({ ok: true, valor: 2 })
    })
})

describe('(2) o que está fora dos medidos vai para pendentes, com a fórmula COMO ESTÁ ESCRITA', () => {
    it.each([
        ['SQRT(L)', /função "SQRT"/],
        ['L >= 1000', /operador ">="/],
        ['L <> 1000', /operador "<>"/],
        ['1.000 + L', /ponto/],
        ['IIF(L > 1000, 3)', /IIF com 2 argumento/],
        ['IIF(L > 1000,0,5,1)', /IIF com 4 argumento/],
        ['ROUND(L,2)', /ROUND com 2 argumento/],
        // Decimal é dígito,dígito COLADO; com espaço a vírgula não é decimal, e sobra argumento.
        ['ROUND(3, 7)', /ROUND com 2 argumento/],
        ['ARREDMAIOR(NF, L)', /ARREDMAIOR com 2 argumento/],
        ['IIF(L > 1000; 3; 2)', /caractere ";"/],
        ['L × 2', /caractere "×"/],
    ])('%s', (formula, motivo) => {
        const r = avaliarNumero(formula, com({ L: 1500, NF: 4 }))
        expect(r.ok).toBe(false)
        expect(r.ok ? '' : (r as { motivo: string }).motivo).toMatch(motivo)
    })

    it('no motor: a regra com função desconhecida não vira linha; vira pendente com a fórmula literal', () => {
        const r = calcularTipologia(entrada([regra('9681', { formula_em_lh: 'SQRT(L) − 4,2' })], [perfil('9681')]))
        expect(r.linhas).toEqual([])
        expect(r.pendentes).toEqual([expect.objectContaining({ nivel: 'regra', codigo: '9681', formula: 'SQRT(L) − 4,2', motivo: expect.stringMatching(/SQRT/) })])
    })
})

describe('(3) variável ausente NÃO vira zero', () => {
    it('a condição usa AQ e ninguém informou: pendente nomeando AQ', () => {
        const r = calcularTipologia(entrada([regra('9681', { condicao: 'AQ > 0' })], [perfil('9681')]))
        expect(r.linhas).toEqual([])
        expect(r.pendentes).toEqual([expect.objectContaining({ codigo: '9681', variavel: 'AQ', formula: 'AQ > 0' })])
    })

    it('a quantidade usa NF e nem o usuário nem a família o dão: pendente nomeando NF', () => {
        const r = calcularTipologia(entrada([regra('9681', { formula_qtde: '(NF*2)' })], [perfil('9681')]))
        expect(r.pendentes).toEqual([expect.objectContaining({ variavel: 'NF', formula: '(NF*2)' })])
    })

    it('a família dá o valor pela linha (QMA = NF − 1, NF = 4), e o usuário VENCE a família', () => {
        const formulas = [
            { linha: 'EUROPA 42', variavel: 'NF', formula: '4' },
            { linha: 'EUROPA 42', variavel: 'QMA', formula: '(NF-1)' },
            { linha: 'OUTRA', variavel: 'NF', formula: '9' },
        ]
        const sem = calcularTipologia(entrada([regra('9681', { formula_qtde: '(QMA*2)' })], [perfil('9681')], { formulas }))
        expect(sem.linhas[0].pecas).toBe(6)
        const comUsuario = calcularTipologia(entrada([regra('9681', { formula_qtde: '(QMA*2)' })], [perfil('9681')], { formulas, variaveis: { NF: 5 } }))
        expect(comUsuario.linhas[0].pecas).toBe(8)
    })

    it('o ramo do IIF que não é escolhido não exige a variável dele', () => {
        expect(avaliarNumero('IIF(L > 1000, 2, AQ)', com({ L: 1500 }))).toEqual({ ok: true, valor: 2 })
        expect(avaliarNumero('IIF(L < 1000, 2, AQ)', com({ L: 1500 }))).toEqual(expect.objectContaining({ ok: false, variavel: 'AQ' }))
    })
})

describe('(4) a condição decide se a regra entra', () => {
    it('falsa exclui — nem linha nem pendente; verdadeira inclui', () => {
        const regras = [regra('9681', { condicao: 'L > 2000' }), regra('9682', { condicao: 'L > 1000' })]
        const r = calcularTipologia(entrada(regras, [perfil('9681'), perfil('9682')]))
        expect(r.linhas.map((l) => l.codigo)).toEqual(['9682'])
        expect(r.pendentes).toEqual([])
    })
})

describe('(5) barra inteira e consumo, e os dois pesos', () => {
    // 2 peças de 3.500 mm = 7.000 mm; barra de 6 m; R$ 600 a barra, R$ 100 o metro; 2 kg/m.
    const regras = [regra('9681', { formula_em_lh: '3500', formula_qtde: '2' })]

    it('barra inteira: 7.000 mm em barras de 6.000 → 2 barras, R$ 1.200; comprado ≠ consumido', () => {
        const [l] = calcularTipologia(entrada(regras, [perfil('9681')])).linhas
        expect(l.mmTotais).toBe(7000)
        expect(l.barras).toBe(2)
        expect(l.valorBruto).toBe(1200)
        expect(l.aproveitamento).toBeCloseTo(7000 / 12000, 9)
        expect(l.pesoConsumidoKg).toBe(14)
        expect(l.pesoCompradoKg).toBe(24)
    })

    it('consumo: 7 m × R$ 100 = R$ 700; comprado = consumido', () => {
        const [l] = calcularTipologia(entrada(regras, [perfil('9681')], { modo: 'consumo' })).linhas
        expect(l.valorBruto).toBe(700)
        expect(l.pesoConsumidoKg).toBe(14)
        expect(l.pesoCompradoKg).toBe(14)
    })

    it('a coluna de 12% vem da entrada', () => {
        const [l] = calcularTipologia(entrada(regras, [perfil('9681')], { colunaDePreco: 'doze' })).linhas
        expect(l.valorBruto).toBe(1080)
    })

    it('a quantidade de esquadrias multiplica as peças', () => {
        const [l] = calcularTipologia(entrada(regras, [perfil('9681')], { quantidade: 3 })).linhas
        expect(l.pecas).toBe(6)
        expect(l.barras).toBe(4)
    })

    it('o peso sai marcado como aproximado', () => {
        expect(calcularTipologia(entrada(regras, [perfil('9681')])).pesoAproximado).toBe(PESO_E_APROXIMADO)
    })
})

describe('(5b) o IPI por fora', () => {
    const regras = [regra('9681', { formula_em_lh: '3500', formula_qtde: '2' })]

    it('IPI = bruto × ipi, e a coluna vem como FRAÇÃO: 0,065 é 6,5%', () => {
        const r = calcularTipologia(entrada(regras, [perfil('9681', { ipi: 0.065 })]))
        expect(r.linhas[0].valorBruto).toBe(1200)
        expect(r.linhas[0].ipiPorFora).toBeCloseTo(78, 9)
        expect(r.total.ipiPorFora).toBeCloseTo(78, 9)
    })

    it('ipi zero é zero — o item diz que não tem', () => {
        const r = calcularTipologia(entrada(regras, [perfil('9681', { ipi: 0 })]))
        expect(r.linhas[0].ipiPorFora).toBe(0)
    })

    it('ipi ausente NÃO vira zero: a linha e o total ficam sem IPI, e há aviso', () => {
        const r = calcularTipologia(entrada([...regras, regra('9682', { formula_em_lh: '1000', formula_qtde: '1' })], [perfil('9681', { ipi: null }), perfil('9682', { ipi: 0.0325 })]))
        expect(r.linhas.find((l) => l.codigo === '9681')!.ipiPorFora).toBeNull()
        expect(r.linhas.find((l) => l.codigo === '9682')!.ipiPorFora).toBeCloseTo(19.5, 9)
        expect(r.total.ipiPorFora).toBeNull()
        expect(r.avisos).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: 'ipi_ausente', codigo: '9681' })]))
    })
})

describe('(6) a cor filtra o perfil, e não filtra tudo', () => {
    const regras = [
        regra('9681', { cor: 'BRANCO' }),
        regra('9682', { cor: 'PRETO' }),
        regra('R100', { [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Reforço', cor: 'BRANCO', formula_em_lh: 'L' }),
        regra('A-BR', { [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Acessórios', cor: 'BRANCO', tipo: 'Insumo', formula_em_lh: null }),
        regra('A-PR', { [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Acessórios', cor: 'PRETO', tipo: 'Insumo', formula_em_lh: null }),
    ]
    const itens = [perfil('9681'), perfil('9682'), perfil('R100'), unitario('A-BR'), unitario('A-PR')]

    it('perfil BRANCO, acessório PRETO: o perfil branco, o reforço, e o acessório PRETO', () => {
        const r = calcularTipologia(entrada(regras, itens, { corPerfil: 'BRANCO', corAcessorio: 'PRETO' }))
        expect(r.linhas.map((l) => l.codigo).sort()).toEqual(['9681', 'A-PR', 'R100'])
    })

    it('trocando a cor do perfil para PRETO, o reforço continua — ele não tem cor a filtrar', () => {
        const r = calcularTipologia(entrada(regras, itens, { corPerfil: 'PRETO', corAcessorio: 'BRANCO' }))
        expect(r.linhas.map((l) => l.codigo).sort()).toEqual(['9682', 'A-BR', 'R100'])
    })
})

describe('(7) a quantidade ambígua: a primeira alternativa, MARCADA', () => {
    it('uma alternativa: sem marca; duas e três: marcadas com o número e a fórmula usada; o total soma', () => {
        const regras = [
            regra('9681', { formula_qtde: '2' }),
            regra('9682', { formula_qtde: '(NF*2) | (QT*2)' }),
            regra('9683', { formula_qtde: '(QMA*2) | (QMA)*2 | QMA' }),
        ]
        const r = calcularTipologia(entrada(regras, [perfil('9681'), perfil('9682'), perfil('9683')], { variaveis: { NF: 4, QT: 10, QMA: 3 } }))
        const corte = (c: string) => r.linhas.find((l) => l.codigo === c)!.cortes[0]
        expect([corte('9681').alternativasDaQuantidade, corte('9681').quantidadeUsada]).toEqual([1, '2'])
        expect([corte('9682').alternativasDaQuantidade, corte('9682').quantidadeUsada, corte('9682').pecas]).toEqual([2, '(NF*2)', 8])
        expect([corte('9683').alternativasDaQuantidade, corte('9683').quantidadeUsada, corte('9683').pecas]).toEqual([3, '(QMA*2)', 6])
        expect(corte('9683').formulaQtde).toBe('(QMA*2) | (QMA)*2 | QMA')
        expect(r.regrasComQuantidadeAmbigua).toBe(2)
    })
})

describe('(8) o insumo', () => {
    const regras = [regra('A-PR', { [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Acessórios', cor: 'PRETO', tipo: 'Insumo', formula_em_lh: null, formula_qtde: '4' })]

    it('o UNITÁRIO está em `valor_metro_interno` ("VALOR UNIT"), não em `valor_barra_interno` ("VALOR TOTAL")', () => {
        const [l] = calcularTipologia(entrada(regras, [unitario('A-PR')])).linhas
        expect(l.valorBruto).toBe(14)
        expect([l.mmTotais, l.barras, l.aproveitamento]).toEqual([null, null, null])
        expect(l.pesoConsumidoKg).toBeCloseTo(0.2, 9)
    })

    it('insumo cujo item é vendido por BARRA: pendente com o motivo, não linha', () => {
        const r = calcularTipologia(entrada(regras, [perfil('A-PR')]))
        expect(r.linhas).toEqual([])
        expect(r.pendentes).toEqual([expect.objectContaining({ nivel: 'codigo', codigo: 'A-PR', motivo: expect.stringContaining(MOTIVO_INSUMO_VENDIDO_POR_BARRA) })])
    })

    it('com a coluna de 12%, o item por unidade é pendente — o unitário a 12% não foi medido', () => {
        const r = calcularTipologia(entrada(regras, [unitario('A-PR', { valor_metro_12: 3 })], { colunaDePreco: 'doze' }))
        expect(r.linhas).toEqual([])
        expect(r.pendentes[0].motivo).toMatch(/12%/)
    })
})

describe('(9) o líquido', () => {
    // Uma barra de R$ 1.000: 3.000 mm numa barra de 6 m.
    const regras = [regra('9681', { formula_em_lh: '3000', formula_qtde: '1' })]
    const item = (extra: Partial<ItemDoPreco> = {}) => perfil('9681', { valor_barra_interno: 1000, valor_barra_12: 1000, aliquota_interna_pct: 17, ipi: 0.065, ...extra })
    const fiscal = (extra: Partial<EntradaFiscal> = {}): EntradaFiscal => ({ icmsInterestadualPct: null, pisPct: 1.65, cofinsPct: 7.6, tratamentoDoIpi: null, ...extra })

    it('bruto 1.000, ICMS 17%, PIS 1,65%, COFINS 7,6% → líquido 737,50', () => {
        const [l] = calcularTipologia(entrada(regras, [item()], { fiscal: fiscal() })).linhas
        expect(l.valorBruto).toBe(1000)
        expect([l.icms, l.pis, l.cofins]).toEqual([170, 16.5, 76])
        expect(l.valorLiquido).toBeCloseTo(737.5, 9)
        expect(l.motivoSemLiquido).toBeNull()
    })

    it('alíquota de PIS ausente: líquido NULO, a linha e o aviso nomeiam o PIS, o bruto fica intacto', () => {
        const r = calcularTipologia(entrada(regras, [item()], { fiscal: fiscal({ pisPct: null }) }))
        const [l] = r.linhas
        expect(l.valorBruto).toBe(1000)
        expect(l.valorLiquido).toBeNull()
        expect(l.motivoSemLiquido).toMatch(/PIS/)
        expect(l.motivoSemLiquido).not.toMatch(/COFINS|ICMS/)
        expect(r.avisos).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: 'aliquota_ausente', mensagem: expect.stringMatching(/PIS/) })]))
        expect(r.total.valorLiquido).toBeNull()
    })

    it('sem entrada fiscal nenhuma: líquido NULO, e as três faltas nomeadas', () => {
        const [l] = calcularTipologia(entrada(regras, [item()])).linhas
        expect(l.valorLiquido).toBeNull()
        expect(l.motivoSemLiquido).toMatch(/PIS/)
        expect(l.motivoSemLiquido).toMatch(/COFINS/)
    })

    it('ICMS interno sai do ITEM: sem `aliquota_interna_pct`, líquido nulo nomeando o ICMS', () => {
        const [l] = calcularTipologia(entrada(regras, [item({ aliquota_interna_pct: null })], { fiscal: fiscal() })).linhas
        expect(l.valorLiquido).toBeNull()
        expect(l.motivoSemLiquido).toMatch(/ICMS/)
    })

    it('interestadual: o ICMS vem da ENTRADA — 12% dá 787,50; sem ela, nulo nomeando o ICMS', () => {
        const com12 = calcularTipologia(entrada(regras, [item()], { colunaDePreco: 'doze', fiscal: fiscal({ icmsInterestadualPct: 12 }) })).linhas[0]
        expect(com12.icms).toBeCloseTo(120, 9)
        expect(com12.valorLiquido).toBeCloseTo(787.5, 9)
        const sem = calcularTipologia(entrada(regras, [item()], { colunaDePreco: 'doze', fiscal: fiscal() })).linhas[0]
        expect(sem.valorLiquido).toBeNull()
        expect(sem.motivoSemLiquido).toMatch(/ICMS/)
    })

    it('ipi 0,065 sobre 1.000 → IPI 65, FORA do líquido', () => {
        const [l] = calcularTipologia(entrada(regras, [item()], { fiscal: fiscal() })).linhas
        expect(l.ipiPorFora).toBeCloseTo(65, 9)
        expect(l.valorLiquido).toBeCloseTo(737.5, 9)
    })

    it('o que se faz com o IPI vem da entrada: soma ao custo, credita — ou, sem a informação, NÃO é aplicado', () => {
        const custo = (tratamentoDoIpi: EntradaFiscal['tratamentoDoIpi']) =>
            calcularTipologia(entrada(regras, [item()], { fiscal: fiscal({ tratamentoDoIpi }) }))
        expect(custo('soma-ao-custo').linhas[0].custo).toBeCloseTo(802.5, 9)
        expect(custo('credita').linhas[0].custo).toBeCloseTo(737.5, 9)
        const sem = custo(null)
        expect(sem.linhas[0].custo).toBeNull()
        expect(sem.linhas[0].ipiPorFora).toBeCloseTo(65, 9)
        expect(sem.avisos).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: 'ipi_sem_tratamento' })]))
    })

    it('o total segue a regra das linhas: soma quando todas têm líquido, NULO quando uma não tem', () => {
        const duas = [regra('9681', { formula_em_lh: '3000', formula_qtde: '1' }), regra('9682', { formula_em_lh: '3000', formula_qtde: '1' })]
        const ok = calcularTipologia(entrada(duas, [item(), perfil('9682', { valor_barra_interno: 500, aliquota_interna_pct: 18, ipi: 0 })], { fiscal: fiscal() }))
        // 9682: 500 − 90 − 8,25 − 38 = 363,75
        expect(ok.total.valorLiquido).toBeCloseTo(737.5 + 363.75, 9)
        const furo = calcularTipologia(entrada(duas, [item(), perfil('9682', { valor_barra_interno: 500, aliquota_interna_pct: null, ipi: 0 })], { fiscal: fiscal() }))
        expect(furo.linhas.find((l) => l.codigo === '9681')!.valorLiquido).toBeCloseTo(737.5, 9)
        expect(furo.total.valorLiquido).toBeNull()
        expect(furo.total.valorBruto).toBe(1500)
    })

    it('nenhuma alíquota padrão nos dois módulos — PIS e COFINS dependem do regime da conta, que o motor não conhece', () => {
        for (const arquivo of ['atendimentos-ia-motor-formula.ts', 'atendimentos-ia-motor-de-calculo.ts']) {
            const texto = fs.readFileSync(path.resolve(__dirname, '..', arquivo), 'utf8')
            expect(texto).not.toMatch(/\b1[.,]65\b|\b7[.,]6\b|\b9[.,]25\b|0[.,]0165|0[.,]076\b|0[.,]0925/)
        }
    })
})

describe('(10) código sem preço, e os totais', () => {
    it('código do motor sem item de preço: pendente do código', () => {
        const r = calcularTipologia(entrada([regra('9681'), regra('9681', { formula_qtde: '1' })], []))
        expect(r.pendentes).toEqual([expect.objectContaining({ nivel: 'codigo', codigo: '9681', motivo: expect.stringMatching(/não está na tabela de preço.*2 regra/) })])
    })

    it('totais por categoria e da tipologia; o peso total é NULO se uma linha não tem peso', () => {
        const regras = [
            regra('9681', { formula_em_lh: '3000', formula_qtde: '2' }),
            regra('A-PR', { [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Acessórios', cor: 'PRETO', tipo: 'Insumo', formula_em_lh: null, formula_qtde: '4' }),
        ]
        const r = calcularTipologia(entrada(regras, [perfil('9681'), unitario('A-PR', { peso: null })]))
        const porCategoria = Object.fromEntries(r.totaisPorCategoria.map((t) => [t.categoria, t]))
        expect(porCategoria['Perfil PVC'].valorBruto).toBe(600)
        expect(porCategoria['Perfil PVC'].pesoConsumidoKg).toBe(12)
        expect(porCategoria['Acessórios'].valorBruto).toBe(14)
        expect(porCategoria['Acessórios'].pesoConsumidoKg).toBeNull()
        expect(r.total.valorBruto).toBe(614)
        expect(r.total.pesoConsumidoKg).toBeNull()
        expect(r.avisos.filter((a) => a.tipo === 'peso_ausente')).toEqual([expect.objectContaining({ codigo: 'A-PR' })])
    })

    it('regra de outra linha não entra, mesmo com a tipologia certa', () => {
        const r = calcularTipologia(entrada([regra('9681'), regra('9699', { linha: 'GOLD 60' })], [perfil('9681'), perfil('9699')]))
        expect(r.linhas.map((l) => l.codigo)).toEqual(['9681'])
    })
})

describe('(11) nada de eval nem Function', () => {
    it.each(['atendimentos-ia-motor-formula.ts', 'atendimentos-ia-motor-de-calculo.ts'])('%s', (arquivo) => {
        const texto = fs.readFileSync(path.resolve(__dirname, '..', arquivo), 'utf8')
        expect(texto).not.toMatch(/\beval\s*\(|\bFunction\s*\(/)
    })
})
