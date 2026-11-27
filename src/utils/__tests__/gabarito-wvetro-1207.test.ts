/**
 * PORTÃO — O GABARITO DO WVETRO 1207 (pedido 0040, 27/11/2026): o motor de produção (`fixtures/gabarito-wvetro-1207/motor.json`, as abas
 * das 9 tipologias do orçamento 14 / levantamento 31 da De Paula, PRETO LISO, lidas por consulta só de leitura em 27/11/2026) contra os cortes
 * REAIS do WVetro (`gabarito.json`, o orçamento 1207 de Marcelo e Rita, 11 itens, 256 barras). "O WVetro é a verdade" (dono do produto).
 *
 * O CAMINHO É O DO CÁLCULO: a política da De Paula (a natureza de cada variável) + a cor do perfil → `escolhasDoCalculo` → `avaliarTipologia`.
 * Por cima vão SÓ as escolhas que o gabarito pede e que NÃO são política da empresa (variação do item, dita pelo vendedor no levantamento):
 *   - DP-69 (itens 9 e 10): ID = 1 (instalação com desnível): entra o 9125;
 *   - DP-73 (item 8): PTM = 2 (HF112, 03 vias) — a política da De Paula ainda diz HF88: SQL no relatório, NÃO aplicado;
 *   - DP-155 (item 11): TA = 2 (abertura interna: FR106 em vez de SF106) e AT = 1180 (a altura da travessa que dá GB34 1034, GB25 1066, PP150N × 8);
 *   - FV = 3 em todas (calço 8597): vira política da De Paula — SQL no relatório, NÃO aplicado.
 *
 * O QUE O PORTÃO AINDA NÃO FECHA, nomeado (relatado em respostas/0040-*.md), e que ele CONFERE que continua assim — quando a causa for resolvida,
 * ele fica vermelho e a linha sai da lista:
 *   - ARREMATE (dono do produto, 27/11/2026, pedido 0042): o BZ1770 e o BZ0010 saem com a MEDIDA DO VÃO, como o WVetro (`&ARI`, `&MAE` e `&MAI` valem 0);
 *     o corte 90/90 do BZ0010 pede a opção MAE = "VÃO+50MM (CORTE 90/90)" na política (a De Paula diz MEDIDA DO VÃO, corte 45): SQL na resposta 0042;
 *   - VIDRO do item 1 (DP-144, 5 panos): o motor dá 1032 mm de altura (a fórmula dá 1032,0 exato) e o WVetro 1031: 1 mm, sem regra de fórmula que o explique
 *     (o único pano das 12 medidas com valor exato inteiro; ver `VIDRO_RESTO_CONHECIDO`). Não remendado.
 */
import fs from 'fs'
import path from 'path'
import { abaDoBanco, ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { avaliarTipologia, lerTipologia, type AbasDoMotor } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { escolhasDoCalculo } from '@/lib/atendimentos-ia/fronteira-das-escolhas'
import { naturezasPara, type LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'
import { arremateNaMedidaDoVaoDaPolitica, type PoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa'
import { lerVidro, vidroSemBaguete } from '@/lib/atendimentos-ia/vidro'

const DIR = path.join(__dirname, 'fixtures', 'gabarito-wvetro-1207')
const MOTOR = JSON.parse(fs.readFileSync(path.join(DIR, 'motor.json'), 'utf8')) as { tabelas: Record<string, Array<Record<string, unknown>>> }
const GAB = JSON.parse(fs.readFileSync(path.join(DIR, 'gabarito.json'), 'utf8')) as {
    politica: LinhaDaNatureza[]
    itens: Array<{ n: number; t: string; L: number; H: number; q: number; vid: string; vidro_texto: string; esc: Record<string, number> }>
    vidros: Record<string, Array<[number, number, number]>>
    cortes: Record<string, string[]>
}
const abas: AbasDoMotor = Object.fromEntries(ABAS_DO_MOTOR.filter((a) => MOTOR.tabelas[a.tabela]).map((a) => [a.nome, abaDoBanco(a, MOTOR.tabelas[a.tabela])]))
const COR = 'Preto Liso'
/** O que o gabarito pede e não é política (comentário do arquivo). */
const DO_GABARITO: Record<string, Record<string, number>> = { 'DP-69': { ID: 1 }, 'DP-73': { PTM: 2 }, 'DP-155': { TA: 2, AT: 1180 } }
const FV_DO_CALCO_8597 = 3

/**
 * A política da De Paula e o que o gabarito pede dela: o BZ0010 do WVetro é 90/90 com a medida do VÃO — a opção "VÃO+50MM (CORTE 90/90)" com o
 * acréscimo zerado. A política hoje diz MAE = MEDIDA DO VÃO (corte 45): é pergunta ao PO (0042-1).
 */
const POLITICA_DO_GABARITO: LinhaDaNatureza[] = GAB.politica.map((l) => (l.variavel === 'MAE' ? { ...l, opcao_padrao: 'VÃO+50MM (CORTE 90/90)' } : l))

const politicaDe = (linhas: LinhaDaNatureza[]) => ({ porVariavel: naturezasPara(linhas, { familia: 'PVC', linha: null, formato: null }) }) as PoliticaDaEmpresa

type Corte = { codigo: string; comprimento: number; corte: string; quantidade: number }
const chave = (c: { codigo: string; comprimento: number; corte: string }) => `${c.codigo}|${c.comprimento}|${c.corte}`
function contar(cs: readonly Corte[]): Map<string, number> {
    const m = new Map<string, number>()
    for (const c of cs) m.set(chave(c), (m.get(chave(c)) ?? 0) + c.quantidade)
    return m
}
const sobra = (a: Map<string, number>, b: Map<string, number>) => [...a].flatMap(([k, n]) => (n > (b.get(k) ?? 0) ? [[k, n - (b.get(k) ?? 0)] as const] : []))
const ARREMATES = new Set(['BZ1770', 'BZ0010'])

/** O vidro do item no GABARITO: o item 4 é mini boreal 4 mm no WVetro (o levantamento 31 trouxe float 5 mm — dado do item, a corrigir no levantamento). */
const VIDRO_DO_GABARITO: Record<number, string> = { 4: 'VIDRO MINI BOREAL 04MM' }
GAB.itens = GAB.itens.map((i) => ({ ...i, vidro_texto: VIDRO_DO_GABARITO[i.n] ?? i.vidro_texto }))
function avaliarItem(item: (typeof GAB.itens)[number]) {
    const t = lerTipologia(abas, item.t)
    if ('recusas' in t) throw new Error(`${item.n}: ${t.recusas[0].mensagem}`)
    const politica = politicaDe(POLITICA_DO_GABARITO)
    const e = escolhasDoCalculo(t.tipologia, item.esc, politica, null, COR, item.L)
    expect(e.voltas).toEqual([])
    const escolhas: Record<string, number> = { ...e.escolhas, ...(DO_GABARITO[item.t] ?? {}), FV: FV_DO_CALCO_8597 }
    const espessura = lerVidro(item.vidro_texto).espessura_mm
    const r = avaliarTipologia({ tipologia: t.tipologia, L_mm: item.L, H_mm: item.H, escolhas, espessura_vidro_mm: espessura, semBagueteDoVidro: vidroSemBaguete(item.vidro_texto, espessura), arremateNaMedidaDoVao: arremateNaMedidaDoVaoDaPolitica(politica) })
    if ('recusas' in r) throw new Error(`${item.n}: ${r.recusas[0].mensagem}`)
    return { r, escolhas }
}
function motorDoItem(item: (typeof GAB.itens)[number]): Corte[] {
    const { r } = avaliarItem(item)
    return r.pecas.map((p) => ({ codigo: p.codigo.replace('/WOLFF', ''), comprimento: Math.trunc(p.comprimento_mm), corte: p.corte, quantidade: p.quantidade * item.q }))
}
function gabaritoDoItem(n: number): Corte[] {
    return GAB.cortes[String(n)].map((p) => {
        const [codigo, comprimento, quantidade, corte] = p.split(':')
        return { codigo, comprimento: Number(comprimento), corte, quantidade: Number(quantidade) }
    })
}
const semArremate = (cs: readonly Corte[]) => cs.filter((c) => !ARREMATES.has(c.codigo))

/** O que ainda difere no vidro, nomeado: o item 1 (DP-144, 5 panos): o motor dá 1032 mm de altura (5320 − 67,2 − 4 × 23,2, ÷ 5) e o WVetro 1031 — 1 mm, [MOTOR/WVETRO], sem decisão ainda. */
const VIDRO_RESTO_CONHECIDO: Record<number, Array<[number, number, number]>> = { 1: [[1532, 1032, 5]] }
const ordem = (xs: ReadonlyArray<readonly [string, number]>) => [...xs].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, n]) => [k, n])

describe('gabarito do WVetro 1207 — os cortes e os vidros do motor contra os do WVetro, item a item', () => {
    test.each(GAB.itens.map((i) => [i.n, i.t, i] as const))('item %i (%s): fora o arremate, os cortes são os do WVetro', (_n, _t, item) => {
        const motor = semArremate(motorDoItem(item))
        const wv = semArremate(gabaritoDoItem(item.n))
        expect({ soMotor: ordem(sobra(contar(motor), contar(wv))), soWvetro: ordem(sobra(contar(wv), contar(motor))) }).toEqual({ soMotor: [], soWvetro: [] })
    })

    // O ARREMATE É A MEDIDA DO VÃO (dono do produto, 27/11/2026, pedido 0042): o comprimento é o do WVetro; o corte do BZ0010 é o que a opção da política dá
    test.each(GAB.itens.map((i) => [i.n, i.t, i] as const))('item %i (%s): o arremate tem a medida do vão, a mesma quantidade e o mesmo comprimento do WVetro', (_n, _t, item) => {
        const comprimentos = (cs: readonly Corte[]) => [...contar(cs.filter((c) => ARREMATES.has(c.codigo)))].sort()
        expect(comprimentos(motorDoItem(item))).toEqual(comprimentos(gabaritoDoItem(item.n)))
    })

    test('SEM a política "arremate na medida do vão", o acréscimo da opção entra (as outras contas não mudam); COM ela, o vão', () => {
        const item = GAB.itens.find((i) => i.n === 1)!
        const tip = lerTipologia(abas, item.t)
        if ('recusas' in tip) throw new Error('recusa')
        const sem = POLITICA_DO_GABARITO.filter((l) => l.variavel !== 'ARREMATE_NA_MEDIDA_DO_VAO')
        const larguraDoBZ1770 = (linhas: LinhaDaNatureza[]) => {
            const p = politicaDe(linhas)
            const escolhas = { ...avaliarItem(item).escolhas }
            const r = avaliarTipologia({ tipologia: tip.tipologia, L_mm: item.L, H_mm: item.H, escolhas, espessura_vidro_mm: 6, arremateNaMedidaDoVao: arremateNaMedidaDoVaoDaPolitica(p) })
            if ('recusas' in r) throw new Error(r.recusas[0].mensagem)
            return r.pecas.filter((x) => x.codigo.startsWith('BZ1770') && x.posicao === 'Largura').map((x) => Math.trunc(x.comprimento_mm))
        }
        expect(arremateNaMedidaDoVaoDaPolitica(politicaDe(sem))).toBe(false)
        expect(larguraDoBZ1770(POLITICA_DO_GABARITO)).toEqual([item.L])
        expect(larguraDoBZ1770(sem)).toEqual([item.L + 100])
        // só o "SIM" liga: outra opção, ou natureza ITEM, não
        expect(arremateNaMedidaDoVaoDaPolitica(politicaDe(sem.concat([{ familia: 'PVC', linha: null, formato: null, variavel: 'ARREMATE_NA_MEDIDA_DO_VAO', natureza: 'POLITICA', opcao_padrao: 'NAO' }])))).toBe(false)
        expect(arremateNaMedidaDoVaoDaPolitica(politicaDe(sem.concat([{ familia: 'PVC', linha: null, formato: null, variavel: 'ARREMATE_NA_MEDIDA_DO_VAO', natureza: 'ITEM', opcao_padrao: null }])))).toBe(false)
    })

    test('o arremate de 20 mm com ajuste em obra (MAI = vão + 100) também é a medida do vão: o acréscimo da opção não entra', () => {
        const item = GAB.itens.find((i) => i.n === 2)!
        const tip = lerTipologia(abas, item.t)
        if ('recusas' in tip) throw new Error('recusa')
        const r = avaliarTipologia({ tipologia: tip.tipologia, L_mm: item.L, H_mm: item.H, escolhas: { ...avaliarItem(item).escolhas, TI: 2, ARI: 3, MAI: 2 }, espessura_vidro_mm: 5, arremateNaMedidaDoVao: arremateNaMedidaDoVaoDaPolitica(politicaDe(POLITICA_DO_GABARITO)) })
        if ('recusas' in r) throw new Error(r.recusas[0].mensagem)
        const comp = r.pecas.filter((p) => p.codigo.startsWith('BZ0010') && p.corte === '90/90').map((p) => Math.trunc(p.comprimento_mm))
        expect(comp).toContain(item.L)
        expect(comp).not.toContain(item.L + 100)
    })

    // O VIDRO SAI NA MEDIDA DO WVETRO (dono do produto, 27/11/2026): o relatório de vidros vai para a vidraçaria; a folga do FV vale para o calço
    test.each(GAB.itens.map((i) => [i.n, i.t, i] as const))('item %i (%s): o vidro tem a medida do WVetro, sem desconto de folga', (_n, _t, item) => {
        const { r } = avaliarItem(item)
        const motor = r.vidros.map((v) => [Math.trunc(v.largura_mm), Math.trunc(v.altura_mm), v.quantidade * item.q])
        expect(motor).toEqual(VIDRO_RESTO_CONHECIDO[item.n] ?? GAB.vidros[String(item.n)])
    })

    test('o calço 8597 vem da FV = 3, e o vidro não encolhe com ela: a mesma medida com FV = 1', () => {
        const item = GAB.itens.find((i) => i.n === 6)!
        const t = lerTipologia(abas, item.t)
        if ('recusas' in t) throw new Error('recusa')
        const com = (fv: number) => {
            const r = avaliarTipologia({ tipologia: t.tipologia, L_mm: item.L, H_mm: item.H, escolhas: { ...escolhasDoCalculo(t.tipologia, item.esc, { porVariavel: naturezasPara(GAB.politica, { familia: 'PVC', linha: null, formato: null }) } as PoliticaDaEmpresa, null, COR, item.L).escolhas, FV: fv }, espessura_vidro_mm: 6 })
            if ('recusas' in r) throw new Error('recusa')
            return r.vidros.map((v) => [v.largura_mm, v.altura_mm])
        }
        expect(com(3)).toEqual(com(1))
        expect(com(6)).toEqual(com(1))
    })

    test('a persiana de 1200 mm vai com a lâmina inteira (MD pela largura): sem BZ4556, 4661 × 1 e 2681 × 24 de 1135 mm', () => {
        const item = GAB.itens.find((i) => i.n === 2)!
        const motor = motorDoItem(item)
        expect(avaliarItem(item).escolhas.MD).toBe(2)
        expect(motor.some((c) => c.codigo === 'BZ4556')).toBe(false)
        expect(motor.filter((c) => c.codigo === '4661')).toEqual([{ codigo: '4661', comprimento: 1135, corte: '90/90', quantidade: 1 }])
        expect(motor.filter((c) => c.codigo === '2681')).toEqual([{ codigo: '2681', comprimento: 1135, corte: '90/90', quantidade: 24 }])
    })

    test('a persiana de 2200 e 2300 mm leva o divisor central (MD = SIM da política), com a esteira sem o desconto do mancal: 1117 e 1067', () => {
        for (const [n, esteira, bz4556] of [[9, 1117, 1], [10, 1067, 2]] as const) {
            const item = GAB.itens.find((i) => i.n === n)!
            const motor = motorDoItem(item)
            expect(avaliarItem(item).escolhas.MD).toBe(1)
            expect(motor.find((c) => c.codigo === 'BZ4556')?.quantidade).toBe(bz4556)
            expect(motor.filter((c) => c.codigo === '2681').map((c) => c.comprimento)).toEqual([esteira])
            expect(motor.find((c) => c.codigo === '9125')?.quantidade).toBe(n === 9 ? 1 : 2)
        }
    })

    test('o vidro mini boreal de 4 mm não leva baguete nas folhas de vidro (itens 4 e 5); o baguete da folha de tela do item 4 fica', () => {
        const i4 = motorDoItem(GAB.itens.find((i) => i.n === 4)!) // o vidro do gabarito: mini boreal 4 mm
        expect(i4.filter((c) => c.codigo === 'GB25')).toEqual([])
        expect(i4.filter((c) => c.codigo === 'GB34').length).toBeGreaterThan(0)
        expect(motorDoItem(GAB.itens.find((i) => i.n === 5)!).some((c) => c.codigo === 'GB34')).toBe(false)
        // o mesmo item com outro vidro volta a ter o baguete
        expect(avaliarItem({ ...GAB.itens.find((i) => i.n === 4)!, vidro_texto: 'VIDRO FLOAT (COMUM) INCOLOR 05MM' }).r.pecas.some((p) => p.codigo.startsWith('GB25'))).toBe(true)
    })
})
