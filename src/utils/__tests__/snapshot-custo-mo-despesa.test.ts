/**
 * snapshot-custo-mo-despesa.test.ts — o snapshot fiscal precisa receber CUSTO, MO e DESPESA.
 *
 * O DEFEITO: `ItemHydrationInput` declarava `cp_unit?`, `mod_unit?` e `dop_unit?` — opcionais,
 * com default 0. NENHUM chamador do sistema passava, em lugar nenhum: `grep` por eles fora do
 * próprio `items-snapshot.ts` devolvia zero ocorrências. O motor calcula
 *
 *     rro = ancora_interna − imp_total − cp − mod − dop        (margin-reapuration.ts:347)
 *
 * e com os três zerados o RRO virava o PREÇO INTEIRO. Daí comissão e lucro terem de consumir
 * 100% dele: no ORC-0689, 382,28 + 114,68 = 496,96 exatos. A normalização 50/65 e 15/65 não
 * era o defeito — era a única partição aritmeticamente possível dado RRO = preço.
 *
 * CADA TESTE AQUI FALHA SEM A SUA CORREÇÃO. Um teste que passa antes e depois não exercita o
 * campo: por isso os casos abaixo comparam o snapshot COM o campo contra o snapshot SEM ele e
 * afirmam que o número MUDA. Omitir `cp`, `mod` ou `dop` individualmente quebra o seu par.
 *
 * O QUARTO CAMPO NÃO ESTÁ AQUI. O `imp_total` sai zerado pelo mesmo motivo estrutural, mas a
 * alíquota por item (`das_pct`, resolvida em `item-tax-rates.ts:630`) não tem entrada no
 * `ReapurationInput` — não há campo para omitir, logo não há teste que falhe sem a correção.
 * Vai no PR seguinte, com caso de tenant com alíquota > 0. Testá-lo sobre a Salão Eliane, que
 * é MEI com alíquota zero de verdade, passaria verde sem exercitar nada.
 */

import fs from 'fs'
import path from 'path'
import { hydrateItemSnapshot, type ItemHydrationInput, type TenantSnapshotContext } from '@/lib/items-snapshot'
import type { ReapurationInput } from '@/types/mrm'

/**
 * ATUALIZADO no PR da cobertura: a entrada do motor agora chega PRONTA em `motorInput`, em vez
 * de ser remontada dentro de `hydrateItemSnapshot`. Os casos abaixo são os mesmos — o que muda
 * é onde cada campo mora. Omitir `cp`, `mod` ou `dop` continua quebrando o seu par.
 */
const motor = (o: Partial<ReapurationInput> & { rb: number }): ReapurationInput => ({
    desc_value: 0,
    regime: 'SIMPLES_NACIONAL',
    rates: [],
    cp: 0,
    mod: 0,
    dop: 0,
    commission_pct: 0.5,
    profit_pct: 0.15,
    csll_pct: 0,
    irpj_pct: 0,
    effective_date: '2026-09-05',
    use_snapshot_rates: true,
    ...o,
})

const CTX: TenantSnapshotContext = {
    regime: 'SIMPLES_NACIONAL',
    rates: [],
    csll_pct: 0,
    irpj_pct: 0,
    use_snapshot_rates: true,
}

/** Serviço do ORC-0689 (Salão Eliane): Coloração, 363,24, comissão 50%, lucro 15%. */
const SERVICO: ItemHydrationInput = {
    commission_pct: 0.5,
    profit_pct: 0.15,
    motorInput: motor({ rb: 363.24, cp: 120, mod: 30, dop: 20 }),
}

/** Produto do mesmo orçamento: Agua mineral, 2,58 — revenda, tem custo. */
const PRODUTO: ItemHydrationInput = {
    commission_pct: 0.5,
    profit_pct: 0.15,
    motorInput: motor({ rb: 2.58, cp: 0.85, mod: 0, dop: 0.2 }),
}

/** Devolve o mesmo item com UM campo do motor zerado — o "sem a correção". */
const sem = (base: ItemHydrationInput, campo: 'cp' | 'mod' | 'dop'): ItemHydrationInput => ({
    ...base,
    motorInput: { ...base.motorInput, [campo]: 0 },
})

const semTodos = (base: ItemHydrationInput): ItemHydrationInput => ({
    ...base,
    motorInput: { ...base.motorInput, cp: 0, mod: 0, dop: 0 },
})

const rro = (input: ItemHydrationInput): number =>
    Number(hydrateItemSnapshot(input, CTX).tax_breakdown?.rro) || 0

const comissao = (input: ItemHydrationInput): number =>
    Number(hydrateItemSnapshot(input, CTX).tax_breakdown?.new_commission) || 0

describe('O defeito reproduzido — sem os três campos o RRO vira o preço inteiro', () => {
    it('SERVIÇO: cp/mod/dop zerados ⇒ RRO = preço, e comissão + lucro consomem 100%', () => {
        const semNada = semTodos(SERVICO)
        const tb = hydrateItemSnapshot(semNada, CTX).tax_breakdown!

        expect(tb.rro).toBeCloseTo(363.24, 2)
        // 50/65 e 15/65 — a normalização que aparecia na tela, aqui como consequência.
        expect(tb.new_commission).toBeCloseTo(279.4154, 3)
        expect(tb.new_profit).toBeCloseTo(83.8246, 3)
        expect(Number(tb.new_commission) + Number(tb.new_profit)).toBeCloseTo(363.24, 2)
    })

    it('PRODUTO: mesma assinatura em escala menor', () => {
        const semNada = semTodos(PRODUTO)
        const tb = hydrateItemSnapshot(semNada, CTX).tax_breakdown!

        expect(tb.rro).toBeCloseTo(2.58, 2)
        expect(tb.new_commission).toBeCloseTo(1.9846, 3)
        expect(tb.new_profit).toBeCloseTo(0.5954, 3)
    })

    it('com os três campos o RRO deixa de ser o preço', () => {
        expect(rro(SERVICO)).toBeCloseTo(363.24 - 120 - 30 - 20, 2)
        expect(rro(PRODUTO)).toBeCloseTo(2.58 - 0.85 - 0.2, 2)
    })
})

describe('Cada campo falha sozinho — omitir UM já muda o número', () => {
    // Estes três são o coração do arquivo. Se algum passar com o campo omitido, ele não está
    // exercitando nada e o defeito volta sem ninguém ver.

    it('`cp` — omiti-lo infla o RRO pelo custo inteiro, no serviço E no produto', () => {
        expect(rro(sem(SERVICO, 'cp'))).toBeCloseTo(rro(SERVICO) + 120, 2)
        expect(rro(sem(PRODUTO, 'cp'))).toBeCloseTo(rro(PRODUTO) + 0.85, 2)

        expect(rro(sem(SERVICO, 'cp'))).not.toBeCloseTo(rro(SERVICO), 2)
        expect(comissao(sem(SERVICO, 'cp'))).not.toBeCloseTo(comissao(SERVICO), 2)
    })

    it('`mod` — omiti-lo infla o RRO pela mão de obra', () => {
        expect(rro(sem(SERVICO, 'mod'))).toBeCloseTo(rro(SERVICO) + 30, 2)
        expect(rro(sem(SERVICO, 'mod'))).not.toBeCloseTo(rro(SERVICO), 2)
        expect(comissao(sem(SERVICO, 'mod'))).not.toBeCloseTo(comissao(SERVICO), 2)

        // No produto de revenda a MO é zero DE VERDADE (regra V9 D1) — e é por isso que ele
        // não serve para exercitar este campo. Registrado para ninguém trocar o caso depois.
        expect(rro(sem(PRODUTO, 'mod'))).toBeCloseTo(rro(PRODUTO), 2)
    })

    it('`dop` — omiti-lo infla o RRO pela despesa, no serviço E no produto', () => {
        expect(rro(sem(SERVICO, 'dop'))).toBeCloseTo(rro(SERVICO) + 20, 2)
        expect(rro(sem(PRODUTO, 'dop'))).toBeCloseTo(rro(PRODUTO) + 0.2, 2)

        expect(comissao(sem(SERVICO, 'dop'))).not.toBeCloseTo(comissao(SERVICO), 2)
        expect(comissao(sem(PRODUTO, 'dop'))).not.toBeCloseTo(comissao(PRODUTO), 2)
    })

    it('os três juntos: cada um contribui com a sua parcela, sem sobreposição', () => {
        const completo = rro(SERVICO)
        const soSemCp = rro(sem(SERVICO, 'cp')) - completo
        const soSemMod = rro(sem(SERVICO, 'mod')) - completo
        const soSemDop = rro(sem(SERVICO, 'dop')) - completo
        expect(soSemCp + soSemMod + soSemDop).toBeCloseTo(170, 2)
        expect(rro(semTodos(SERVICO))).toBeCloseTo(completo + 170, 2)
    })
})

describe('A quantidade multiplica — os campos são TOTAIS, não por unidade', () => {
    // A interface mudou de `cp_unit` (× quantity dentro da função) para `cp` (total). Se
    // alguém reintroduzir a multiplicação interna, este teste quebra.
    it('o `rb` e o custo chegam já multiplicados pela quantidade', () => {
        const duas: ItemHydrationInput = {
            ...SERVICO,
            motorInput: motor({ rb: 363.24 * 2, cp: 240, mod: 60, dop: 40 }),
        }
        expect(rro(duas)).toBeCloseTo(363.24 * 2 - 240 - 60 - 40, 2)
    })
})

describe('A política do snapshot não foi alterada', () => {
    it('snapshot anterior válido continua PRESERVADO — não recalcula com os campos novos', () => {
        const anterior = hydrateItemSnapshot(SERVICO, CTX).tax_breakdown!
        const reidratado = hydrateItemSnapshot(
            {
                ...SERVICO,
                motorInput: { ...SERVICO.motorInput, cp: 999, mod: 999, dop: 999 },
                prev_breakdown: anterior,
            },
            CTX,
        )
        expect(reidratado.tax_breakdown).toEqual(anterior)
    })

    it('`use_snapshot_rates: false` continua devolvendo `tax_breakdown` nulo', () => {
        const snap = hydrateItemSnapshot(SERVICO, { ...CTX, use_snapshot_rates: false })
        expect(snap.tax_breakdown).toBeNull()
        expect(snap.commission_pct).toBe(0.5)
    })

    it('idempotência: duas chamadas com o mesmo input devolvem o mesmo snapshot', () => {
        const a = hydrateItemSnapshot(SERVICO, CTX).tax_breakdown
        const b = hydrateItemSnapshot(SERVICO, CTX).tax_breakdown
        expect(a).toEqual(b)
    })
})

describe('TODOS os gravadores passam pelo construtor único', () => {
    // A duplicação real: `hydrateItemSnapshot` e `buildMotorInput` alimentavam o MESMO motor,
    // e uma das duas rotas cobria menos campos. Agora existe UMA rota — o gravador consome o
    // `ReapurationInput` pronto, e nenhum chamador remonta a entrada.
    const SRC = path.resolve(__dirname, '../..')
    const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8')

    it.each([
        ['Orçamento — inserção, edição e os dois baselines', 'pages/orcamentos/index.tsx', 4],
        ['Venda de balcão', 'pages/vendas/index.tsx', 1],
        ['Pedido — save e espelho', 'pages/pedidos/index.tsx', 2],
        ['Mapeador orçamento→venda', 'utils/budget-item-to-sale-item.ts', 1],
    ])('%s entrega `motorInput` de `buildMotorInput`', (_nome, arquivo, vezes) => {
        const conteudo = read(arquivo as string)
        expect(conteudo.split('buildMotorInput({').length - 1).toBeGreaterThanOrEqual(vezes as number)
        expect(conteudo).toContain('motorInput:')
    })

    it('nenhum chamador remonta a entrada do motor à mão', () => {
        // `cp:`, `mod:` e `dop:` soltos num objeto de hidratação eram a rota antiga. Se
        // voltarem, é sinal de que alguém recriou o segundo construtor.
        for (const arquivo of [
            'pages/orcamentos/index.tsx',
            'pages/vendas/index.tsx',
            'pages/pedidos/index.tsx',
            'utils/budget-item-to-sale-item.ts',
        ]) {
            const trecho = read(arquivo)
            const i = trecho.indexOf('hydrateItemSnapshot(')
            expect(i).toBeGreaterThanOrEqual(0)
            expect(trecho.slice(i, i + 900)).not.toMatch(/\n\s+cp: (?!0\b)/)
        }
    })
})
