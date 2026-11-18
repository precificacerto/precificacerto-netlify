/**
 * PORTÃO — O CONFERIDOR DO CORTE (tarefa 0017 do bridge, 18/11/2026): o motor de produção (`fixtures/motor-das-tipologias-do-corte.json`, as
 * abas do motor 259035a9 lidas por consulta só de leitura em 18/11/2026) contra o corte REAL do WVetro (`fixtures/corte-do-wvetro.json`, os
 * Orientativos de Montagem dos orçamentos 1159 e 1163 da De Paula: 19 esquadrias, 408 linhas de peça). Peça a peça: código, posição,
 * comprimento truncado ao milímetro (como o relatório imprime) e quantidade. Peça que sobra ou falta é falha, não aviso.
 *
 * A EXCEÇÃO DOCUMENTADA — O ARREMATE (decisão do PO, 17/11/2026): o motor soma o acréscimo da opção escolhida (`HARI = (H − Y) + (&ARI * 2)`,
 * com [33,00] por lado no BZ1770 e no BZ0006; `HARE = H + &MAE`, com [50,00] ou [100,00]) e o WVetro imprimiu a medida do VÃO. O certo é o do
 * motor: nos perfis de arremate a referência é a regra, não o número impresso — o portão confere que só o comprimento difere, e para MAIS.
 *
 * O QUE O PORTÃO AINDA NÃO TRAVA, nomeado (relatado no bridge, resposta 0017):
 *   - 4 casos SEM ESCOLHAS NA FIXTURE: a extração pegou só o cabeçalho da página ("ESQUADRIAS DE PAULA": "Emissão: …") — sem as escolhas, o
 *     motor usaria o padrão, e o confronto mediria o padrão, não o corte;
 *   - 2 casos (DP-128) sem baguete impresso: a espessura do vidro, que decide o baguete, não se lê — o avaliador recusa nomeando-a;
 *   - 9 casos com divergência FORA do arremate, relatados com a peça e os dois números, e NÃO consertados aqui (a tarefa: "Pode ser defeito
 *     do avaliador, e é exatamente isso que o portão existe para achar"). O portão confere que continuam divergindo: quando a causa for
 *     resolvida, ele fica vermelho e o caso passa para a lista dos que fecham.
 *
 * A ESPESSURA DO VIDRO não vem nos casos: é lida do BAGUETE que o WVetro cortou (a faixa do baguete na aba Perfis; GB25 = 4 a 8 mm). Dentro da
 * faixa a linha do baguete é uma só, e a medida não depende do valor escolhido nela.
 */
import { abaDoBanco, ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { avaliarTipologia, lerTipologia, opcoesDaVariavel, type AbasDoMotor, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CORTE = require('./fixtures/corte-do-wvetro.json') as { totais: Record<string, number>; casos: Caso[] }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MOTOR = require('./fixtures/motor-das-tipologias-do-corte.json') as { tabelas: Record<string, Array<Record<string, unknown>>> }

type Peca = { codigo: string; posicao: string; comprimento_mm: number; quantidade: number }
type Caso = { orcamento: number; item: number; tipologia: string; L_mm: number; H_mm: number; variaveis_do_relatorio: Record<string, string>; pecas: Peca[] }

const ARREMATE = new Set(['BZ1770/WOLFF', 'BZ0006/WOLFF', 'BZ0010/WOLFF', 'BZ0012/WOLFF'])
const id = (c: Caso) => `${c.orcamento}/${c.item}`
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const abas: AbasDoMotor = Object.fromEntries(ABAS_DO_MOTOR.filter((a) => MOTOR.tabelas[a.tabela]).map((a) => [a.nome, abaDoBanco(a, MOTOR.tabelas[a.tabela])]))

/** As escolhas que o relatório imprimiu, casadas pelo NOME da variável; o valor impresso é o começo do rótulo (o relatório o corta). */
function escolhasDoRelatorio(t: Tipologia, impressas: Record<string, string>): { escolhas: Record<string, number>; semVariavel: string[] } {
    const escolhas: Record<string, number> = {}
    const semVariavel: string[] = []
    for (const [rotulo, valor] of Object.entries(impressas)) {
        const v = t.variaveis.find((x) => x.descricao !== null && norm(x.descricao) === norm(rotulo))
        if (!v) { semVariavel.push(rotulo); continue }
        if (v.opcoes === null) { escolhas[v.variavel] = Number(valor.replace(',', '.')); continue }
        const ops = (opcoesDaVariavel(v.opcoes) ?? []).filter((o) => norm(o.rotulo).startsWith(norm(valor)))
        if (ops.length !== 1) throw new Error(`${rotulo} = "${valor}": ${ops.length} opções começam assim em ${v.variavel}`)
        escolhas[v.variavel] = ops[0].valor
    }
    return { escolhas, semVariavel }
}
/** A espessura do vidro, pela faixa do baguete cortado; null sem baguete impresso (ou com duas faixas). */
function espessuraDoBaguete(c: Caso): number | null {
    const perfis = MOTOR.tabelas.orcamentista_motor_perfil.filter((p) => p.tipologia === c.tipologia && p.esp_vidro)
    const faixas = [...new Set(c.pecas.flatMap((p) => perfis.filter((x) => x.perfil === p.codigo).map((x) => String(x.esp_vidro))))]
    return faixas.length === 1 ? Number(faixas[0].split(',')[0]) : null
}
const chave = (p: { codigo: string; posicao: string; comprimento_mm: number }) => `${p.codigo}|${p.posicao}|${Math.trunc(p.comprimento_mm)}`
function contar(ps: readonly Peca[]): Map<string, number> {
    const m = new Map<string, number>()
    for (const p of ps) m.set(chave(p), (m.get(chave(p)) ?? 0) + p.quantidade)
    return m
}
/** O que sobra num lado contra o outro: chave → quantidade a mais. */
const sobra = (a: Map<string, number>, b: Map<string, number>) => [...a].flatMap(([k, n]) => (n > (b.get(k) ?? 0) ? [[k, n - (b.get(k) ?? 0)] as const] : []))
function conferir(c: Caso) {
    const t = lerTipologia(abas, c.tipologia)
    if ('recusas' in t) throw new Error(`${id(c)}: ${t.recusas[0].mensagem}`)
    const { escolhas } = escolhasDoRelatorio(t.tipologia, c.variaveis_do_relatorio)
    const r = avaliarTipologia({ tipologia: t.tipologia, L_mm: c.L_mm, H_mm: c.H_mm, escolhas, espessura_vidro_mm: espessuraDoBaguete(c) })
    if ('recusas' in r) return { recusas: r.recusas.map((x) => x.mensagem) }
    const motor = contar(r.pecas), wv = contar(c.pecas)
    return { soMotor: sobra(motor, wv), soWvetro: sobra(wv, motor) }
}

const SEM_ESCOLHAS_NA_FIXTURE = ['1159/4', '1159/5', '1159/6', '1163/4']
const SEM_BAGUETE_IMPRESSO = ['1159/3', '1163/5']
const FECHAM = ['1159/2', '1163/1', '1163/3', '1163/6']
/** As divergências FORA do arremate, relatadas ao PO em 18/11/2026 (bridge, resposta 0017) — com a causa provável, não confirmada. */
const DIVERGENCIAS_RELATADAS: Record<string, string> = {
    '1159/1': 'a travessa: o relatório não imprime "USA TRAVESSA?", o motor usa o padrão (sim) e corta o GB25 em dois; o WVetro cortou inteiro',
    '1159/9': 'a travessa, como em 1159/1',
    '1163/8': 'a travessa, como em 1159/1',
    '1159/7': 'a altura de BR60, 8431, SF78C, 8428 e GB34 sai 6 mm menor no motor que no WVetro (850 × 856, 704 × 710…), com a altura do peitoril 850',
    '1159/8': 'os 6 mm, como em 1159/7',
    '1163/2': 'as escolhas que o relatório não imprimiu (o interlock, a folha, a persiana): o motor usa o padrão — IL36, HF88, MF52, 1318 — e o WVetro cortou IL42 + KT42, HF112, SF66, 2681',
    '1163/9': 'as escolhas não impressas, como em 1163/2 (HF88 × HF112, MF52 × SF92, 1318 × 2681, IL50 × IL42 + KT42)',
    '1163/10': 'as escolhas não impressas, como em 1163/9, e o WVetro cortou o dobro das folhas (quantidade 2 na mesma linha?)',
    '1163/7': 'o WVetro cortou BR60, 8431, FR73N, 8429 e GB34 que o motor não gera para o DP-122 de 500 × 750',
}

describe('o conferidor do corte: o motor de produção contra o corte real do WVetro', () => {
    it('a fixture: 19 esquadrias, 13 tipologias, 408 linhas de peça; e cada caso está em UMA das listas', () => {
        expect(CORTE.casos).toHaveLength(19)
        expect(new Set(CORTE.casos.map((c) => c.tipologia)).size).toBe(13)
        expect(CORTE.casos.reduce((n, c) => n + c.pecas.length, 0)).toBe(408)
        const listas = [...SEM_ESCOLHAS_NA_FIXTURE, ...SEM_BAGUETE_IMPRESSO, ...FECHAM, ...Object.keys(DIVERGENCIAS_RELATADAS)]
        expect([...listas].sort()).toEqual(CORTE.casos.map(id).sort())
    })

    it.each(FECHAM)('%s FECHA: fora do arremate, peça a peça igual ao WVetro; no arremate, o mesmo código e posição, só o comprimento MAIOR (o acréscimo)', (k) => {
        const c = CORTE.casos.find((x) => id(x) === k) as Caso
        const r = conferir(c)
        if ('recusas' in r) throw new Error(r.recusas.join('; '))
        expect([r.soMotor.filter(([x]) => !ARREMATE.has(x.split('|')[0])), r.soWvetro.filter(([x]) => !ARREMATE.has(x.split('|')[0]))]).toEqual([[], []])
        const comp = (x: string) => Number(x.split('|')[2])
        const semComp = (xs: ReadonlyArray<readonly [string, number]>) => xs.map(([x, n]) => `${x.split('|').slice(0, 2).join('|')}×${n}`).sort()
        const arrMotor = r.soMotor.filter(([x]) => ARREMATE.has(x.split('|')[0])), arrWv = r.soWvetro.filter(([x]) => ARREMATE.has(x.split('|')[0]))
        expect(semComp(arrMotor)).toEqual(semComp(arrWv))
        for (const [x] of arrMotor) {
            const doWv = arrWv.filter(([y]) => y.split('|').slice(0, 2).join('|') === x.split('|').slice(0, 2).join('|'))
            expect(doWv.every(([y]) => comp(x) > comp(y))).toBe(true)
        }
    })

    it.each(SEM_ESCOLHAS_NA_FIXTURE)('%s: a fixture não traz as escolhas — só o cabeçalho da página — e o caso não é conferido pelo padrão', (k) => {
        const c = CORTE.casos.find((x) => id(x) === k) as Caso
        expect(Object.keys(c.variaveis_do_relatorio)).toEqual(['ESQUADRIAS DE PAULA'])
    })

    it.each(SEM_BAGUETE_IMPRESSO)('%s: sem baguete impresso, a espessura do vidro não se lê, e o avaliador RECUSA nomeando-a', (k) => {
        const c = CORTE.casos.find((x) => id(x) === k) as Caso
        expect(espessuraDoBaguete(c)).toBeNull()
        const r = conferir(c)
        expect('recusas' in r && r.recusas.some((m) => m.includes('depende da espessura do vidro'))).toBe(true)
    })

    it.each(Object.entries(DIVERGENCIAS_RELATADAS))('%s DIVERGE fora do arremate (%s): continua divergindo — quando a causa for resolvida, este caso passa para os que fecham', (k) => {
        const c = CORTE.casos.find((x) => id(x) === k) as Caso
        const r = conferir(c)
        if ('recusas' in r) throw new Error(r.recusas.join('; '))
        const fora = [...r.soMotor, ...r.soWvetro].filter(([x]) => !ARREMATE.has(x.split('|')[0]))
        expect(fora.length).toBeGreaterThan(0)
    })
})
