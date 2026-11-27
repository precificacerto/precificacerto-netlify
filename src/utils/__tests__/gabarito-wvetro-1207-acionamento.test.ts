/**
 * PORTÃO — O ACIONAMENTO DA PERSIANA contra o gabarito WVetro 1207 (pedido 0043, dono do produto, 27/11/2026).
 *
 * A regra: o vendedor NÃO pediu motor → MANUAL por fita (recolhedor), SEM perguntar; 1 pano (largura nominal < 1800 mm) = 1 recolhedor, com divisória
 * (>= 1800 mm) = 2 recolhedores, um por pano. Pediu motor (controle remoto ou botoeira, 110 ou 220 V, dito por ele) → simultâneo (1 motor para os 2 panos)
 * ou individual (1 motor por pano), como ele disser; sem divisória, 1 motor.
 *
 * O GABARITO: os itens 2, 9 e 10 motorizados (220 V, controle remoto), 1 motor por esquadria (simultâneo no item 9) → 1904 × 4 (item 2: 1; item 9: 1; item 10: 2 esquadrias
 * × 1) e 1930 × 8 (o adaptador de ponteira do tubo de 60 mm: 2 por esquadria com LA único). O tubo de 60 mm (TB = 2) é o do gabarito.
 *
 * O QUE NÃO EXISTE (relatado em respostas/0043-*.md): o limite de largura de recolhimento do motor — não está no motor (as validações da DP-17 e da DP-69 são só de
 * ALTURA) nem na tabela de preço da Wolff; nada o impõe aqui, e nada foi inventado. E o lado do MOTOR: a variável LR só vale para o recolhedor.
 */
import fs from 'fs'
import path from 'path'
import { abaDoBanco, ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { avaliarTipologia, lerTipologia, type AbasDoMotor } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { escolhasDoCalculo } from '@/lib/atendimentos-ia/fronteira-das-escolhas'
import { descreverAcionamento, escolhaPedida, lerEscolhasGravadas } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { naturezasPara, type LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'
import type { PoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa'

const DIR = path.join(__dirname, 'fixtures', 'gabarito-wvetro-1207')
const MOTOR = JSON.parse(fs.readFileSync(path.join(DIR, 'motor.json'), 'utf8')) as { tabelas: Record<string, Array<Record<string, unknown>>> }
const INSUMOS = JSON.parse(fs.readFileSync(path.join(DIR, 'insumos-da-persiana.json'), 'utf8')) as { insumos: Array<Record<string, unknown>> }
const GAB = JSON.parse(fs.readFileSync(path.join(DIR, 'gabarito.json'), 'utf8')) as { politica: LinhaDaNatureza[]; itens: Array<{ n: number; t: string; L: number; H: number; q: number; esc: Record<string, number> }> }
const abas: AbasDoMotor = Object.fromEntries(ABAS_DO_MOTOR.filter((a) => MOTOR.tabelas[a.tabela] || a.tabela === 'orcamentista_motor_insumo')
    .map((a) => [a.nome, abaDoBanco(a, a.tabela === 'orcamentista_motor_insumo' ? INSUMOS.insumos : MOTOR.tabelas[a.tabela])]))
/** A política da De Paula com o acionamento do pedido 0043: AE = RECOLHEDOR EMBUTIDO (o SQL da resposta), e o resto como o gabarito pede. */
const POLITICA: LinhaDaNatureza[] = [
    ...GAB.politica.filter((l) => l.variavel !== 'AE' && l.variavel !== 'MAE').map((l) => (l.variavel === 'TB' ? { ...l, opcao_padrao: 'Ø60MM' } : l)),
    { familia: 'PVC', linha: null, formato: null, variavel: 'AE', natureza: 'POLITICA', opcao_padrao: 'RECOLHEDOR EMBUTIDO' },
    { familia: 'PVC', linha: null, formato: null, variavel: 'MAE', natureza: 'POLITICA', opcao_padrao: 'VÃO+50MM (CORTE 90/90)' },
]
const politica = (): PoliticaDaEmpresa => ({ porVariavel: naturezasPara(POLITICA, { familia: 'PVC', linha: null, formato: null }) }) as PoliticaDaEmpresa
const MOTOR_220_CR = 4

function calcular(n: number, ditas: Record<string, number> = {}, largura?: number) {
    const item = GAB.itens.find((i) => i.n === n)!
    const t = lerTipologia(abas, item.t)
    if ('recusas' in t) throw new Error(t.recusas[0].mensagem)
    const L = largura ?? item.L
    const e = escolhasDoCalculo(t.tipologia, { ...item.esc, ...ditas }, politica(), null, 'Preto Liso', L)
    const escolhas: Record<string, number> = { ...e.escolhas, FV: 3, ...(item.t === 'DP-69' ? { ID: 1 } : {}) }
    const r = avaliarTipologia({ tipologia: t.tipologia, L_mm: L, H_mm: item.H, escolhas, espessura_vidro_mm: 6, arremateNaMedidaDoVao: true })
    if ('recusas' in r) throw new Error(r.recusas[0].mensagem)
    const insumo = (codigo: string) => r.insumos.filter((i) => i.codigo.startsWith(`${codigo}/`)).reduce((s, i) => s + i.quantidade * item.q, 0)
    return { e, r, insumo, tipologia: t.tipologia, escolhas }
}

describe('acionamento da persiana — o vendedor não pediu motor: manual por fita, sem perguntar', () => {
    it('1 pano (item 2, 1200 mm): 1 recolhedor embutido preto, 1 polia; LA único; sem pergunta', () => {
        const { e, insumo } = calcular(2)
        expect(e.voltas.filter((v) => v.variavel === 'AE' || v.variavel === 'LA')).toEqual([])
        expect([e.escolhas.AE, e.escolhas.LA, e.origem.LA]).toEqual([1, 2, 'pelo_acionamento'])
        expect([insumo('4799'), insumo('7266'), insumo('4791')]).toEqual([1, 1, 0])
        expect(insumo('1904')).toBe(0)
    })
    it('com divisória (itens 9 e 10, 2300 e 2200 mm): 2 recolhedores por esquadria, um por pano', () => {
        const nove = calcular(9)
        expect([nove.e.escolhas.AE, nove.e.escolhas.MD, nove.e.escolhas.LA]).toEqual([1, 1, 3])
        expect(nove.insumo('4799')).toBe(2)
        expect(nove.insumo('1329')).toBe(1) // o testeiro central do acionamento nos dois lados
        const dez = calcular(10)
        expect(dez.insumo('4799')).toBe(4) // 2 esquadrias × 2
    })
    it('a largura decide a divisória e o número de recolhedores: 1799 mm = 1, 1800 mm = 2', () => {
        expect(calcular(9, {}, 1799).insumo('4799')).toBe(1)
        expect(calcular(9, {}, 1800).insumo('4799')).toBe(2)
    })
})

describe('acionamento da persiana — o vendedor pediu motor', () => {
    it('GABARITO: itens 2, 9 e 10 com motor 220 V controle remoto, 1 motor por esquadria → 1904 × 4 e 1930 × 8', () => {
        // item 2: sem divisória (1 motor); item 9: simultâneo (LA único); item 10: simultâneo nas 2 esquadrias — o vendedor diz
        const itens = [[2, {}], [9, { LA: 2 }], [10, { LA: 2 }]] as const
        const motores = itens.map(([n, extra]) => calcular(n, { AE: MOTOR_220_CR, ...extra }).insumo('1904'))
        const adaptadores = itens.map(([n, extra]) => calcular(n, { AE: MOTOR_220_CR, ...extra }).insumo('1930'))
        expect(motores).toEqual([1, 1, 2])
        expect(motores.reduce((a, b) => a + b, 0)).toBe(4)
        expect(adaptadores.reduce((a, b) => a + b, 0)).toBe(8)
        // nenhum recolhedor quando é motor
        expect(calcular(9, { AE: MOTOR_220_CR, LA: 2 }).insumo('4799')).toBe(0)
    })
    it('individual (1 motor por pano): com divisória, 2 motores por esquadria', () => {
        expect(calcular(9, { AE: MOTOR_220_CR, LA: 3 }).insumo('1904')).toBe(2)
    })
    it('com divisória e sem ele dizer simultâneo ou individual: a pergunta volta ao agente; sem divisória, 1 motor sem perguntar', () => {
        const com = calcular(9, { AE: MOTOR_220_CR })
        expect(com.e.voltas.filter((v) => v.variavel === 'LA')).toHaveLength(1)
        expect(com.e.voltas.find((v) => v.variavel === 'LA')!.frase).toContain('simultâneo')
        expect(calcular(2, { AE: MOTOR_220_CR }).e.voltas.filter((v) => v.variavel === 'LA')).toEqual([])
    })
})

describe('acionamento da persiana — o que o levantamento e o orçamento mostram', () => {
    const texto = (n: number, ditas: Record<string, number> = {}) => { const c = calcular(n, ditas); return descreverAcionamento(c.tipologia, c.escolhas, new Set(Object.keys(ditas))) }
    it('manual por fita, com o lado do recolhedor; sem o lado dito, o padrão da tipologia para confirmar', () => {
        expect(texto(2)).toBe('manual por fita (recolhedor embutido, 1 recolhedor), lado esquerdo (padrão da tipologia: confirme o lado)')
        expect(texto(2, { LR: 2 })).toBe('manual por fita (recolhedor embutido, 1 recolhedor), lado direito')
        expect(texto(9)).toBe('manual por fita (recolhedor embutido, 2 recolhedores, um por pano)')
    })
    it('motor com o modelo e a tensão, e simultâneo ou individual quando há divisória', () => {
        expect(texto(2, { AE: MOTOR_220_CR })).toBe('motor 220V controle remoto')
        expect(texto(9, { AE: MOTOR_220_CR, LA: 2 })).toBe('motor 220V controle remoto, simultâneo (1 motor para os 2 panos)')
        expect(texto(9, { AE: MOTOR_220_CR, LA: 3 })).toBe('motor 220V controle remoto, individual (1 motor por pano)')
        expect(texto(2, { AE: 6 })).toBe('motor 220V botoeira')
    })
})

describe('acionamento da persiana — o que o vendedor pode dizer', () => {
    it('AE, LA e LR são escolhas do ITEM: o agente as vê com as opções e o que ele disse é gravado', () => {
        const t = lerTipologia(abas, 'DP-17')
        if ('recusas' in t) throw new Error('recusa')
        for (const v of ['AE', 'LA', 'LR']) expect(escolhaPedida(t.tipologia, v)?.opcoes.length).toBeGreaterThan(0)
        expect(lerEscolhasGravadas({ AE: 4, LA: 3, LR: 2 }, t.tipologia)).toEqual({ AE: 4, LA: 3, LR: 2 })
    })
})
