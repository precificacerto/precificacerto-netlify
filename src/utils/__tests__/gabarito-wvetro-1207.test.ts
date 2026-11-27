/**
 * PORTÃO — O GABARITO DO WVETRO 1207 (pedido 0040, 27/11/2026): o motor de produção (`fixtures/gabarito-wvetro-1207/motor.json`, as abas
 * das 9 tipologias do orçamento 14 / levantamento 31 da De Paula, PRETO LISO, lidas por consulta só de leitura em 27/11/2026) contra os cortes
 * REAIS do WVetro (`gabarito.json`, o orçamento 1207 de Marcelo e Rita, 11 itens, 256 barras). "O WVetro é a verdade" (dono do produto).
 *
 * O CAMINHO É O DO CÁLCULO: a política da De Paula (a natureza de cada variável) + a cor do perfil → `escolhasDoCalculo` → `avaliarTipologia`.
 * Por cima vão SÓ as escolhas que o gabarito pede e que NÃO são política da empresa (variação do item, dita pelo vendedor no levantamento):
 *   - DP-17 (item 2, 1200 mm): MD = 2 (SEM mancal divisor): a lâmina inteira de 1135 mm, sem BZ4556;
 *   - DP-69 (itens 9 e 10): ID = 1 (instalação com desnível): entra o 9125;
 *   - DP-73 (item 8): PTM = 2 (HF112, 03 vias) — a política da De Paula ainda diz HF88: SQL no relatório, NÃO aplicado;
 *   - DP-155 (item 11): TA = 2 (abertura interna: FR106 em vez de SF106) e AT = 1180 (a altura da travessa que dá GB34 1034, GB25 1066, PP150N × 8);
 *   - FV = 3 em todas (calço 8597): vira política da De Paula — SQL no relatório, NÃO aplicado.
 *
 * O QUE O PORTÃO AINDA NÃO FECHA, nomeado (relatado em respostas/0040-*.md), e que ele CONFERE que continua assim — quando a causa for resolvida,
 * ele fica vermelho e a linha sai da lista:
 *   - [MOTOR] ARREMATE: o WVetro imprime o BZ1770/BZ0010 com a medida do VÃO; o motor soma o acréscimo da opção (decisão do dono do produto,
 *     17/11/2026: "o certo é o do motor"). O portão confere que a quantidade por perfil é a mesma e só o comprimento e o corte diferem;
 *   - [MOTOR] BAGUETE DO VIDRO MINI BOREAL (itens 4 e 5): o WVetro não corta baguete; o motor corta (a linha entra pela espessura do vidro, sem
 *     condição que a tire);
 *   - [MOTOR] A ESTEIRA DA PERSIANA DIVIDIDA (itens 9 e 10): o motor desconta o `&MD` (18 mm) da largura da esteira; o WVetro não: 1117 × 1108 e 1067 × 1058.
 */
import fs from 'fs'
import path from 'path'
import { abaDoBanco, ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { avaliarTipologia, lerTipologia, type AbasDoMotor } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { escolhasDoCalculo } from '@/lib/atendimentos-ia/fronteira-das-escolhas'
import { naturezasPara, type LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'
import type { PoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa'

const DIR = path.join(__dirname, 'fixtures', 'gabarito-wvetro-1207')
const MOTOR = JSON.parse(fs.readFileSync(path.join(DIR, 'motor.json'), 'utf8')) as { tabelas: Record<string, Array<Record<string, unknown>>> }
const GAB = JSON.parse(fs.readFileSync(path.join(DIR, 'gabarito.json'), 'utf8')) as {
    politica: LinhaDaNatureza[]
    itens: Array<{ n: number; t: string; L: number; H: number; q: number; vid: string; esc: Record<string, number> }>
    cortes: Record<string, string[]>
}
const abas: AbasDoMotor = Object.fromEntries(ABAS_DO_MOTOR.filter((a) => MOTOR.tabelas[a.tabela]).map((a) => [a.nome, abaDoBanco(a, MOTOR.tabelas[a.tabela])]))
const COR = 'Preto Liso'
/** O que o gabarito pede e não é política (comentário do arquivo). */
const DO_GABARITO: Record<string, Record<string, number>> = { 'DP-17': { MD: 2 }, 'DP-69': { ID: 1 }, 'DP-73': { PTM: 2 }, 'DP-155': { TA: 2, AT: 1180 } }
const FV_DO_CALCO_8597 = 3

type Corte = { codigo: string; comprimento: number; corte: string; quantidade: number }
const chave = (c: { codigo: string; comprimento: number; corte: string }) => `${c.codigo}|${c.comprimento}|${c.corte}`
function contar(cs: readonly Corte[]): Map<string, number> {
    const m = new Map<string, number>()
    for (const c of cs) m.set(chave(c), (m.get(chave(c)) ?? 0) + c.quantidade)
    return m
}
const sobra = (a: Map<string, number>, b: Map<string, number>) => [...a].flatMap(([k, n]) => (n > (b.get(k) ?? 0) ? [[k, n - (b.get(k) ?? 0)] as const] : []))
const ARREMATES = new Set(['BZ1770', 'BZ0010'])

function motorDoItem(item: (typeof GAB.itens)[number]): Corte[] {
    const t = lerTipologia(abas, item.t)
    if ('recusas' in t) throw new Error(`${item.n}: ${t.recusas[0].mensagem}`)
    const politica = { porVariavel: naturezasPara(GAB.politica, { familia: 'PVC', linha: null, formato: null }) } as PoliticaDaEmpresa
    const e = escolhasDoCalculo(t.tipologia, item.esc, politica, null, COR)
    expect(e.voltas).toEqual([])
    const escolhas = { ...e.escolhas, ...(DO_GABARITO[item.t] ?? {}), FV: FV_DO_CALCO_8597 }
    const r = avaliarTipologia({ tipologia: t.tipologia, L_mm: item.L, H_mm: item.H, escolhas, espessura_vidro_mm: Number(item.vid.slice(-2)) })
    if ('recusas' in r) throw new Error(`${item.n}: ${r.recusas[0].mensagem}`)
    return r.pecas.map((p) => ({ codigo: p.codigo.replace('/WOLFF', ''), comprimento: Math.trunc(p.comprimento_mm), corte: p.corte, quantidade: p.quantidade * item.q }))
}
function gabaritoDoItem(n: number): Corte[] {
    return GAB.cortes[String(n)].map((p) => {
        const [codigo, comprimento, quantidade, corte] = p.split(':')
        return { codigo, comprimento: Number(comprimento), corte, quantidade: Number(quantidade) }
    })
}
const semArremate = (cs: readonly Corte[]) => cs.filter((c) => !ARREMATES.has(c.codigo))
const porPerfil = (cs: readonly Corte[]) => {
    const m = new Map<string, number>()
    for (const c of cs) m.set(c.codigo, (m.get(c.codigo) ?? 0) + c.quantidade)
    return m
}

/** A divergência que ainda resta FORA do arremate, por item: o que sobra no motor e o que sobra no WVetro (chave → quantidade). */
const RESTO_CONHECIDO: Record<number, { soMotor: Array<[string, number]>; soWvetro: Array<[string, number]> }> = {
    4: { soMotor: [['GB25|514|45/45', 4], ['GB25|961|45/45', 4]], soWvetro: [] },
    5: { soMotor: [['GB34|320|45/45', 4], ['GB34|570|45/45', 4]], soWvetro: [] },
    9: { soMotor: [['2681|1108|90/90', 80], ['2681.1|1108|90/90', 20], ['4661|1108|90/90', 2]], soWvetro: [['2681|1117|90/90', 80], ['2681.1|1117|90/90', 20], ['4661|1117|90/90', 2]] },
    10: { soMotor: [['2681|1058|90/90', 160], ['2681.1|1058|90/90', 40], ['4661|1058|90/90', 4]], soWvetro: [['2681|1067|90/90', 160], ['2681.1|1067|90/90', 40], ['4661|1067|90/90', 4]] },
}
const ordem = (xs: ReadonlyArray<readonly [string, number]>) => [...xs].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, n]) => [k, n])

describe('gabarito do WVetro 1207 — os cortes do motor contra os do WVetro, item a item', () => {
    test.each(GAB.itens.map((i) => [i.n, i.t, i] as const))('item %i (%s): fora o resto nomeado, os cortes são os do WVetro', (_n, _t, item) => {
        const motor = semArremate(motorDoItem(item))
        const wv = semArremate(gabaritoDoItem(item.n))
        const soMotor = ordem(sobra(contar(motor), contar(wv)))
        const soWvetro = ordem(sobra(contar(wv), contar(motor)))
        const esperado = RESTO_CONHECIDO[item.n] ?? { soMotor: [], soWvetro: [] }
        expect({ soMotor, soWvetro }).toEqual({ soMotor: ordem(esperado.soMotor), soWvetro: ordem(esperado.soWvetro) })
    })

    test.each(GAB.itens.map((i) => [i.n, i.t, i] as const))('item %i (%s): o arremate tem a mesma quantidade por perfil, e só a medida e o corte diferem', (_n, _t, item) => {
        const motor = motorDoItem(item).filter((c) => ARREMATES.has(c.codigo))
        const wv = gabaritoDoItem(item.n).filter((c) => ARREMATES.has(c.codigo))
        expect([...porPerfil(motor)].sort()).toEqual([...porPerfil(wv)].sort())
    })

    test('a persiana de 1200 mm vai com a lâmina inteira (MD = 2): sem BZ4556, 4661 × 1 e 2681 × 24 de 1135 mm', () => {
        const motor = motorDoItem(GAB.itens.find((i) => i.n === 2)!)
        expect(motor.some((c) => c.codigo === 'BZ4556')).toBe(false)
        expect(motor.filter((c) => c.codigo === '4661')).toEqual([{ codigo: '4661', comprimento: 1135, corte: '90/90', quantidade: 1 }])
        expect(motor.filter((c) => c.codigo === '2681')).toEqual([{ codigo: '2681', comprimento: 1135, corte: '90/90', quantidade: 24 }])
    })

    test('o BZ4556 da persiana dividida existe nos itens 9 e 10, com o 9125 do desnível', () => {
        for (const n of [9, 10]) {
            const motor = motorDoItem(GAB.itens.find((i) => i.n === n)!)
            expect(motor.find((c) => c.codigo === 'BZ4556')?.quantidade).toBe(n === 9 ? 1 : 2)
            expect(motor.find((c) => c.codigo === '9125')?.quantidade).toBe(n === 9 ? 1 : 2)
        }
    })
})
