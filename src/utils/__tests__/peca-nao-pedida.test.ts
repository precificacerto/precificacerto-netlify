/**
 * A PEÇA QUE NINGUÉM PEDIU NÃO ENTRA POR PADRÃO (dono do produto, 19/11/2026). O caso real: o item 6 do orçamento da Daiane — DP-72, PORTA DE
 * CORRER 04 FOLHAS MÓVEIS, 4750 x 2300, escolhas NULAS — saiu COM TRAVESSA, porque a variável UT ("USA TRAVESSA?") tem Padrão 1 = SIM no motor.
 * "A travessa se torna uma variável. Essa variável não foi solicitada." O motor (`fixtures/motor-das-tipologias-do-corte.json`) é o de produção.
 */
import { abaDoBanco, ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { avaliarTipologia, lerTipologia, type AbasDoMotor, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { lerEscolhasGravadas, PECAS_QUE_NAO_ENTRAM_POR_PADRAO, semAsPecasNaoPedidas } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MOTOR = require('./fixtures/motor-das-tipologias-do-corte.json') as { tabelas: Record<string, Array<Record<string, unknown>>> }
const abas: AbasDoMotor = Object.fromEntries(ABAS_DO_MOTOR.filter((a) => MOTOR.tabelas[a.tabela]).map((a) => [a.nome, abaDoBanco(a, MOTOR.tabelas[a.tabela])]))
const tipologia = (codigo: string): Tipologia => {
    const t = lerTipologia(abas, codigo)
    if ('recusas' in t) throw new Error(t.recusas[0].mensagem)
    return t.tipologia
}
const DP72 = 'PORTA DE CORRER 04 FOLHAS MÓVEIS | EUROPA 42'

describe('a peça que ninguém pediu não entra por padrão: a travessa (UT)', () => {
    it('a lista é FECHADA: só a travessa, como o dono do produto decidiu em 19/11/2026', () => {
        expect(Object.keys(PECAS_QUE_NAO_ENTRAM_POR_PADRAO)).toEqual(['UT'])
    })
    it('o DP-72 sem nada pedido: o agente acrescenta UT = 2 (NÃO), a opção que não acrescenta a travessa', () => {
        const t = tipologia('DP-72')
        expect(t.variaveis.find((v) => v.variavel === 'UT')).toEqual(expect.objectContaining({ padrao: '1', opcoes: '1 = SIM; 2 = NÃO' }))
        expect(semAsPecasNaoPedidas(t, null, DP72)).toEqual({ UT: 2 })
        expect(semAsPecasNaoPedidas(t, {}, DP72)).toEqual({ UT: 2 })
        expect(semAsPecasNaoPedidas(t, { ARI: 1 }, null)).toEqual({ UT: 2 })
    })
    it('o que o vendedor PEDIU vale: UT = 1 dito fica, e nada é acrescentado', () => {
        expect(semAsPecasNaoPedidas(tipologia('DP-72'), { UT: 1 }, DP72)).toEqual({})
        expect(semAsPecasNaoPedidas(tipologia('DP-72'), { UT: 2 }, DP72)).toEqual({})
    })
    it('A RESSALVA: a tipologia que já é "com travessa" pelo nome fica com a peça (a dela)', () => {
        expect(semAsPecasNaoPedidas(tipologia('DP-72'), null, 'PORTA DE CORRER 04 FOLHAS MÓVEIS | COM TRAVESSA | EUROPA 42')).toEqual({})
        expect(semAsPecasNaoPedidas(tipologia('DP-72'), null, 'MAXIM-AR | MODULAÇÃO TRAVESSA | EUROPA 60')).toEqual({})
        // a palavra inteira: "travessão" não é travessa
        expect(semAsPecasNaoPedidas(tipologia('DP-72'), null, 'PORTA | TRAVESSÃO | EUROPA 42')).toEqual({ UT: 2 })
    })
    it('a tipologia sem UT não ganha nada; a UT sem a opção "NÃO" na aba também não (nunca se inventa o valor)', () => {
        const semUT = tipologia('DP-02')
        expect(semUT.variaveis.some((v) => v.variavel === 'UT')).toBe(false)
        expect(semAsPecasNaoPedidas(semUT, null, null)).toEqual({})
        const t = tipologia('DP-72')
        const semNao = { variaveis: t.variaveis.map((v) => (v.variavel === 'UT' ? { ...v, opcoes: '1 = SIM' } : v)) }
        expect(semAsPecasNaoPedidas(semNao, null, DP72)).toEqual({})
        const naoCom3 = { variaveis: t.variaveis.map((v) => (v.variavel === 'UT' ? { ...v, opcoes: '1 = SIM; 3 = NÃO' } : v)) }
        expect(semAsPecasNaoPedidas(naoCom3, null, DP72)).toEqual({ UT: 3 })
        // o "NÃO" é o RÓTULO da opção, não uma palavra dentro de outro rótulo
        const naoNoMeio = { variaveis: t.variaveis.map((v) => (v.variavel === 'UT' ? { ...v, opcoes: '1 = SIM (NÃO REMOVÍVEL); 2 = NÃO' } : v)) }
        expect(semAsPecasNaoPedidas(naoNoMeio, null, DP72)).toEqual({ UT: 2 })
    })
    it('a escolha GRAVADA sobrevive à leitura (antes, só as capturadas e as sem padrão passavam): UT = 2 lida na tipologia que tem UT', () => {
        expect(lerEscolhasGravadas({ UT: 2 }, tipologia('DP-72'))).toEqual({ UT: 2 })
        expect(lerEscolhasGravadas({ UT: 2 }, tipologia('DP-02'))).toEqual({})
        expect(lerEscolhasGravadas({ UT: 2 }, null)).toEqual({})
    })
    it('O CASO REAL: o DP-72 de 4750 x 2300 sem nada pedido NÃO sai com travessa — com o padrão do motor (UT = 1) sairia', () => {
        const t = tipologia('DP-72')
        const corte = (escolhas: Record<string, number>) => {
            const r = avaliarTipologia({ tipologia: t, L_mm: 4750, H_mm: 2300, escolhas, espessura_vidro_mm: 4 })
            if ('recusas' in r) throw new Error(r.recusas.map((x) => x.mensagem).join('; '))
            return r
        }
        const comPadrao = corte({})
        const semTravessa = corte(semAsPecasNaoPedidas(t, null, DP72))
        const chaves = (r: ReturnType<typeof corte>) => r.pecas.map((p) => `${p.codigo}|${p.posicao}|${Math.trunc(p.comprimento_mm)}x${p.quantidade}`).sort()
        // a travessa acrescenta peças com o padrão; sem ela, nenhuma peça a mais
        const aMais = chaves(comPadrao).filter((k) => !chaves(semTravessa).includes(k))
        expect(aMais.length).toBeGreaterThan(0)
        expect(chaves(semTravessa).filter((k) => !chaves(comPadrao).includes(k)).every((k) => chaves(comPadrao).some((c) => c.split('|')[0] === k.split('|')[0]))).toBe(true)
        expect(chaves(semTravessa)).toEqual(chaves(corte({ UT: 2 })))
    })
})
