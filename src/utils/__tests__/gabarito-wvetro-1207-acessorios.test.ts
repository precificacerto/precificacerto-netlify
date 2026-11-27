/**
 * PORTÃO — OS ACESSÓRIOS contra o gabarito WVetro 1207, POR FUNÇÃO E QUANTIDADE (pedido 0045, dono do produto, 27/11/2026).
 *
 * A regra de comparação (dono do produto): peça equivalente (outro código ou outro fornecedor, mesma função e mesma quantidade) conta como igual;
 * só FALTA (função que o WVetro tem e o motor não gera), SOBRA (o motor gera e o WVetro não) e QUANTIDADE DIFERENTE são problema. Marca não entra.
 *
 * O QUE ELE PROVA: com as escolhas de item que o WVetro 1207 tem — ditas pelo vendedor, no caminho do cálculo (`escolhasDoCalculo`) —, o motor gera os
 * MESMOS acessórios, função a função, quantidade a quantidade. SEM elas (o padrão da De Paula), o motor erra: o contraste abaixo nomeia o que falta.
 *
 * AS ESCOLHAS (as que mudam função ou quantidade, nada de marca):
 *   - MFV = tela fecha só com concha (itens 2 e 4: 5; itens 9 e 10: 6);
 *   - MFI/MFE = fecho da folha de vidro da porta: cremona com maçaneta COM CHAVE (cilindro + roseta) ou com FECHO ALAVANCA (concha alavanca);
 *   - MF = DP-128: cremona + maçaneta (item 5); DP-155: fechadura multiponto (item 11); TD = DP-155: kit de componentes (oscilo-batente, item 11).
 * O QUE O WVETRO NÃO DIZ: o relatório de acessórios é o TOTAL DA OBRA. Os 4 fechos com chave (cilindro 35 × 35 e roseta × 4) e os 2 de alavanca valem
 * para as 4 esquadrias das portas de correr (itens 8, 9 e 10), mas a distribuição entre elas NÃO é única — há outras que dão o mesmo total. O teste
 * usa uma (item 9: chave nos dois lados; item 10: chave por dentro e alavanca por fora) e CONFERE o total, não a distribuição.
 */
import fs from 'fs'
import path from 'path'
import { abaDoBanco, ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { avaliarTipologia, lerTipologia, type AbasDoMotor } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { lerEscolhasGravadas } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { escolhasDoCalculo } from '@/lib/atendimentos-ia/fronteira-das-escolhas'
import { naturezasPara, type LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'
import type { PoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa'
import { agruparEmBarras } from '@/lib/atendimentos-ia/agrupador-de-barras'
import { lerVidro, vidroSemBaguete } from '@/lib/atendimentos-ia/vidro'

const DIR = path.join(__dirname, 'fixtures', 'gabarito-wvetro-1207')
const MOTOR = JSON.parse(fs.readFileSync(path.join(DIR, 'motor.json'), 'utf8')) as { tabelas: Record<string, Array<Record<string, unknown>>> }
const INSUMOS = JSON.parse(fs.readFileSync(path.join(DIR, 'insumos-das-9-tipologias.json'), 'utf8')) as { insumos: Array<Record<string, unknown>> }
const ACESSORIOS = JSON.parse(fs.readFileSync(path.join(DIR, 'acessorios.json'), 'utf8')) as { acessorios: Array<{ codigo: string; un: string; qtd: number; descricao: string }> }
const GAB = JSON.parse(fs.readFileSync(path.join(DIR, 'gabarito.json'), 'utf8')) as {
    politica: LinhaDaNatureza[]
    itens: Array<{ n: number; t: string; L: number; H: number; q: number; esc: Record<string, number>; vidro_texto: string }>
}
const abas: AbasDoMotor = Object.fromEntries(ABAS_DO_MOTOR.filter((a) => MOTOR.tabelas[a.tabela] || a.tabela === 'orcamentista_motor_insumo')
    .map((a) => [a.nome, abaDoBanco(a, a.tabela === 'orcamentista_motor_insumo' ? INSUMOS.insumos : MOTOR.tabelas[a.tabela])]))

const L = (variavel: string, opcao_padrao: string): LinhaDaNatureza => ({ familia: 'PVC', linha: null, formato: null, variavel, natureza: 'POLITICA', opcao_padrao }) as LinhaDaNatureza
/** A política da De Paula como está em produção em 27/11/2026 (o que mudou desde o retrato do gabarito: MAE, PTM, AE e FV). */
const AGORA: Record<string, LinhaDaNatureza> = {
    MAE: L('MAE', 'VÃO+50MM (CORTE 90/90)'), PTM: L('PTM', 'HF112 - 03 VIAS REFILADO'), AE: L('AE', 'RECOLHEDOR EMBUTIDO'), FV: L('FV', 'CALÇO 5MM - FOLGA DE 5MM CADA LADO'),
}
const POLITICA = [...GAB.politica.filter((l) => !AGORA[l.variavel]), ...Object.values(AGORA)]
const politica = (): PoliticaDaEmpresa => ({ porVariavel: naturezasPara(POLITICA, { familia: 'PVC', linha: null, formato: null }) }) as PoliticaDaEmpresa

/** O que o vendedor diz, item a item, além do que o levantamento 31 já tem (V, N, UT). Persiana: motor 220 V controle remoto (AE = 4), simultâneo (LA = 2). */
const DO_WVETRO: Record<number, Record<string, number>> = {
    2: { AE: 4, MFV: 5 }, 4: { MFV: 5 }, 5: { MF: 2 }, 9: { AE: 4, LA: 2, ID: 1, MFI: 2, MFE: 2, MFV: 6 }, 10: { AE: 4, LA: 2, ID: 1, MFI: 2, MFE: 3, MFV: 6 }, 11: { AT: 1180, TA: 2, TD: 2, MF: 2 },
}
const VIDRO: Record<number, string> = { 4: 'VIDRO MINI BOREAL 04MM' }

function totais(ditasDoWvetro: boolean, pecas?: Array<{ codigo: string; comprimento_mm: number; quantidade: number }>): Map<string, number> {
    const soma = new Map<string, number>()
    for (const item of GAB.itens) {
        const t = lerTipologia(abas, item.t)
        if ('recusas' in t) throw new Error(t.recusas[0].mensagem)
        const ditas = { ...item.esc, ...(ditasDoWvetro ? DO_WVETRO[item.n] ?? {} : item.n === 2 || item.n === 9 || item.n === 10 ? { AE: 4, ...(item.n > 2 ? { LA: 2, ID: 1 } : {}) } : item.n === 11 ? { AT: 1180, TA: 2 } : {}) }
        const e = escolhasDoCalculo(t.tipologia, ditas, politica(), null, 'Preto Liso', item.L)
        const texto = VIDRO[item.n] ?? item.vidro_texto
        const esp = lerVidro(texto).espessura_mm
        const r = avaliarTipologia({ tipologia: t.tipologia, L_mm: item.L, H_mm: item.H, escolhas: e.escolhas, espessura_vidro_mm: esp, semBagueteDoVidro: vidroSemBaguete(texto, esp), arremateNaMedidaDoVao: true })
        if ('recusas' in r) throw new Error(`${item.n}: ${r.recusas[0].mensagem}`)
        for (const p of r.pecas) pecas?.push({ codigo: p.codigo.replace('/WOLFF', ''), comprimento_mm: p.comprimento_mm, quantidade: p.quantidade * item.q })
        for (const i of r.insumos) soma.set(i.codigo.replace('/WOLFF', ''), (soma.get(i.codigo.replace('/WOLFF', '')) ?? 0) + i.quantidade * item.q)
    }
    return soma
}

/** O motor dá estes em milímetros; o WVetro, em metros. */
const EM_METROS = new Set(['1325', '1354', '1927', '2537', '3349', '919', '9347', '946', 'TELAM01'])
/** Mesma função, outro código (a regra de equivalência do pedido): a soma do grupo é que tem de fechar. */
const EQUIVALENTES: string[][] = [['14545', '14518'], ['15391', '15396', '15397', '15398', '15855'], ['17569', '17601']]
const grupoDe = (codigo: string) => EQUIVALENTES.find((g) => g.includes(codigo)) ?? [codigo]

function problemas(motor: Map<string, number>): string[] {
    const gabarito = new Map<string, number>()
    for (const a of ACESSORIOS.acessorios) gabarito.set(a.codigo.endsWith('W') && /^\d+W$/.test(a.codigo) ? a.codigo.slice(0, -1) : a.codigo, a.qtd)
    const unidade = (c: string, q: number) => (EM_METROS.has(c) ? q / 1000 : q)
    const vistos = new Set<string>()
    const out: string[] = []
    for (const c of new Set([...gabarito.keys(), ...motor.keys()])) {
        const g = grupoDe(c)
        const chave = g.join('+')
        if (vistos.has(chave)) continue
        vistos.add(chave)
        const a = g.reduce((s, k) => s + (gabarito.get(k) ?? 0), 0)
        const b = g.reduce((s, k) => s + unidade(k, motor.get(k) ?? 0), 0)
        // o arredondamento do WVetro na unidade (parafuso 1.036 contra 1.035,744; o silicone na terceira casa) não é diferença de função
        const fecha = Math.abs(a - b) <= 0.001 * Math.max(a, 1) || (a > 100 && Math.abs(a - b) < 1)
        if (!fecha) out.push(`${a === 0 ? 'SOBRA' : b === 0 ? 'FALTA' : 'QUANTIDADE DIFERENTE'} ${chave}: WVetro ${a} × motor ${Number(b.toFixed(4))}`)
    }
    return out.sort()
}

describe('acessórios do WVetro 1207 — por função e quantidade', () => {
    it('COM as escolhas de item do WVetro, o motor gera os mesmos acessórios: nenhuma falta, nenhuma sobra, nenhuma quantidade diferente', () => {
        expect(problemas(totais(true))).toEqual([])
    })

    it('MFV, MF e TD gravados no item (0045-1 a) são LIDOS: a concha da tela (itens 2, 4, 9, 10), o MF do 5 e do 11 e o TD do 11 chegam ao cálculo', () => {
        for (const item of GAB.itens) {
            const t = lerTipologia(abas, item.t)
            if ('recusas' in t) throw new Error(t.recusas[0].mensagem)
            const gravadas = DO_WVETRO[item.n] ?? {}
            const lidas = lerEscolhasGravadas(gravadas, t.tipologia)
            for (const k of ['MFV', 'MF', 'TD']) if (k in gravadas) expect([item.n, k, lidas[k]]).toEqual([item.n, k, gravadas[k]])
        }
    })
    it('CONTRASTE — SEM elas (o padrão da De Paula e o que o levantamento 31 já diz), o motor erra, e o erro tem nome', () => {
        const p = problemas(totais(false))
        expect(p.length).toBeGreaterThanOrEqual(15)
        // as funções que só existem com a escolha do item
        for (const f of ['FALTA 20207', 'FALTA 10869', 'FALTA 21045', 'FALTA 18189', 'FALTA 11612', 'FALTA 7449', 'FALTA 7689', 'FALTA 21223', 'FALTA 15406', 'SOBRA 15407', 'SOBRA 18034', 'SOBRA 16791']) {
            expect(p.some((x) => x.startsWith(f))).toBe(true)
        }
        // e as quantidades que mudam com ela (tela sem cremona, contrafecho, kit oscilo-batente)
        for (const f of ['QUANTIDADE DIFERENTE 15391+15396+15397+15398+15855', 'QUANTIDADE DIFERENTE 7586', 'QUANTIDADE DIFERENTE 20354', 'QUANTIDADE DIFERENTE 12349']) {
            expect(p.some((x) => x.startsWith(f))).toBe(true)
        }
    })

    it('a regra de equivalência: o código diferente com a mesma função e a mesma quantidade NÃO é problema (a roldana de janela 14518 no lugar da 14545)', () => {
        const m = totais(true)
        expect(m.get('14518')).toBe(12)
        expect(m.get('14545') ?? 0).toBe(0)
        expect(problemas(m).some((x) => x.includes('14545'))).toBe(false)
    })

    it('uma quantidade que de fato difere É problema (o teste enxerga): um item a mais de cilindro', () => {
        const m = new Map(totais(true))
        m.set('10869', (m.get('10869') ?? 0) + 1)
        expect(problemas(m)).toEqual(['QUANTIDADE DIFERENTE 10869: WVetro 4 × motor 5'])
    })

    // AS BARRAS (meta 256): os cortes do motor são os do WVetro, código a código; a barra a mais é do REFILO da cor (regra do pedido 0034: 45 mm por ponta
    // fora do branco). Sem refilo, as mesmas peças dão as 256 do WVetro. É [COMERCIAL] — decisão do dono do produto —, não do motor nem do agente.
    it('barras: as peças do motor empacotam como as do WVetro; o PRETO LISO não leva refilo (regra do WVetro: só madeira) e dá as 256; com 45 mm por ponta daria 257', () => {
        const pecas: Array<{ codigo: string; comprimento_mm: number; quantidade: number }> = []
        totais(true, pecas)
        const gab = JSON.parse(fs.readFileSync(path.join(DIR, 'gabarito.json'), 'utf8')) as { cortes: Record<string, string[]> }
        const dosCortes = Object.values(gab.cortes).flatMap((l) => l.map((x) => { const [codigo, m, q] = x.split(':'); return { codigo, comprimento_mm: Number(m), quantidade: Number(q) } }))
        const barras = Object.fromEntries([...new Set([...pecas, ...dosCortes].map((p) => p.codigo))].map((c) => [c, { comprimento_mm: 6000 }]))
        const n = (ps: typeof pecas, cor: string) => { const r = agruparEmBarras({ pecas: ps, barras, serra_mm: 5, cor }); if ('recusas' in r) throw new Error(r.recusas[0].mensagem); return r.total }
        expect(n(pecas, 'Preto Liso').barras_por_codigo).toEqual(n(dosCortes, 'Preto Liso').barras_por_codigo)
        expect(n(pecas, 'Preto Liso').n_barras).toBe(256)
        expect(n(pecas, 'Branco').n_barras).toBe(256)
        expect(n(pecas, 'Amadeirado Golden Oak').n_barras).toBe(257) // o refilo só existe na madeira
    })
})
