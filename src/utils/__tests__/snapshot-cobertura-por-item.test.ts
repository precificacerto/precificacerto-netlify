/**
 * snapshot-cobertura-por-item.test.ts — o gravador cobria MENOS campos que a rota de runtime.
 *
 * A VERIFICAÇÃO que originou este arquivo é o "como reconhecer" de
 * `.claude/rules/construtor-empobrecido.md`: enumerar quem produz o mesmo tipo e comparar a
 * cobertura de campos. Comparados `buildMotorInput` (runtime) e `hydrateItemSnapshot`
 * (gravador) campo a campo de `ReapurationInput`, faltavam QUATRO:
 *
 *   `rates`         runtime `mergeItemAndTenantRates(itemTaxRates, tenant)` · gravador `ctx.rates` cru
 *   `csll_pct`      runtime `resolveItemCsllPct(...)` por item             · gravador a do tenant
 *   `irpj_pct`      runtime `resolveItemIrpjPct(...)` por item             · gravador a do tenant
 *   `discount_mode` runtime o modo escolhido                              · gravador ausente
 *
 * O DEFEITO É USAR O PARÂMETRO ERRADO, NÃO GERAR ZERO — e esta é a correção de enquadramento
 * que vinha errada desde o começo da rodada. Quando o tenant TEM alíquota cadastrada, o
 * snapshot congelava a do tenant no lugar da do item. O `imp_total: 0` do ORC-0689 é caso
 * particular: Simples e MEI não têm alíquota de tenant, então não sobra nada para congelar.
 *
 * ALCANCE medido no banco: 77 produtos com ICMS próprio e 68 com PIS/COFINS, contra 21 itens
 * com DAS. O `das_pct`, que abriu a investigação, era o menor dos cinco buracos — e é o único
 * que fica de fora aqui, porque mexe no CONTRATO do motor e vai em PR próprio.
 *
 * A ARMADILHA QUE ESTES TESTES EVITAM: se o item tiver a MESMA alíquota do tenant, o caso
 * passa verde sem exercitar nada — é o MEI de novo, noutro campo. Por isso todo caso abaixo
 * usa item e tenant com valores DIFERENTES, e afirma qual dos dois o snapshot congelou.
 */

import fs from 'fs'
import path from 'path'
import { hydrateItemSnapshot, type TenantSnapshotContext } from '@/lib/items-snapshot'
import { buildMotorInput } from '@/utils/mrm-orchestrator'
import type { ItemTaxRates } from '@/utils/item-tax-rates'
import type { TaxRatePeriod } from '@/types/mrm'

const CTX: TenantSnapshotContext = {
    regime: 'LUCRO_PRESUMIDO',
    rates: [],
    csll_pct: 0,
    irpj_pct: 0,
    use_snapshot_rates: true,
}

/** ICMS do TENANT: 12%. O item vai ter 4% — diferente de propósito. */
const RATES_TENANT: TaxRatePeriod[] = [
    { tax_type: 'ICMS', rate_pct: 0.12, valid_from: '2020-01-01', valid_to: null },
] as unknown as TaxRatePeriod[]

const TENANT_CTX = {
    regime: 'LUCRO_PRESUMIDO' as const,
    rates: RATES_TENANT,
    csll_pct: 0.0207,
    irpj_pct: 0.0345,
    useSnapshotRates: true,
}

/** PRODUTO com alíquotas PRÓPRIAS, todas diferentes das do tenant. */
const TAXAS_DO_PRODUTO: ItemTaxRates = { icms_pct: 0.04, csll_pct: 0.05, irpj_pct: 0.06 }

/** SERVIÇO com alíquotas próprias — o mesmo teste do outro lado do catálogo. */
const TAXAS_DO_SERVICO: ItemTaxRates = { iss_pct: 0.03, csll_pct: 0.01, irpj_pct: 0.02 }

const itemBase = {
    unit_price: 1000,
    quantity: 1,
    cost_total: 300,
    productive_labor_unit: 0,
    commission_percent: 5,
    profit_percent: 10,
}

const gravar = (itemTaxRates: ItemTaxRates | null, discountPct = 0, modo: 'PROPORTIONAL' | 'SELLER_REDUCTION' = 'PROPORTIONAL') =>
    hydrateItemSnapshot(
        {
            commission_pct: 0.05,
            profit_pct: 0.1,
            motorInput: buildMotorInput({
                item: { ...itemBase, item_tax_rates: itemTaxRates },
                tenantCtx: TENANT_CTX,
                globalDiscountPercent: discountPct,
                discountMode: modo,
            }),
        },
        CTX,
    ).tax_breakdown!

describe('`rates` — a alíquota do ITEM, não a do tenant', () => {
    // Este é o buraco de maior alcance: 77 produtos com ICMS próprio e 68 com PIS/COFINS.
    it('PRODUTO: o snapshot congela os 4% do item, não os 12% do tenant', () => {
        const comItem = gravar(TAXAS_DO_PRODUTO)
        const semItem = gravar(null)

        // 1000 × 4% = 40 contra 1000 × 12% = 120. Se o teste passasse com os dois iguais,
        // não estaria exercitando nada.
        expect(comItem.imp_total).toBeCloseTo(40, 2)
        expect(semItem.imp_total).toBeCloseTo(120, 2)
        expect(comItem.imp_total).not.toBeCloseTo(semItem.imp_total, 2)
    })

    it('SERVIÇO: mesma regra pelo ISS próprio', () => {
        const comItem = gravar(TAXAS_DO_SERVICO)
        // ISS 3% do item entra; o ICMS 12% do tenant NÃO se aplica a serviço com taxa própria.
        expect(Number(comItem.imp_total)).toBeGreaterThan(0)
        expect(comItem.imp_total).not.toBeCloseTo(120, 2)
    })

    it('o RRO muda junto — o imposto é abatido antes do resíduo', () => {
        expect(gravar(TAXAS_DO_PRODUTO).rro).not.toBeCloseTo(Number(gravar(null).rro), 2)
    })

    it('item SEM alíquota própria continua caindo na do tenant — o fallback não sumiu', () => {
        expect(gravar(null).imp_total).toBeCloseTo(120, 2)
    })
})

describe('`csll_pct` e `irpj_pct` — por item, não do tenant', () => {
    it('PRODUTO: CSLL 5% e IRPJ 6% do item substituem 2,07% e 3,45% do tenant', () => {
        const comItem = gravar(TAXAS_DO_PRODUTO)
        const semItem = gravar(null)
        expect(comItem.new_csll).not.toBeCloseTo(Number(semItem.new_csll), 2)
        expect(comItem.new_irpj).not.toBeCloseTo(Number(semItem.new_irpj), 2)
    })

    it('SERVIÇO: CSLL 1% e IRPJ 2% do item, também diferentes do tenant', () => {
        const comItem = gravar(TAXAS_DO_SERVICO)
        const semItem = gravar(null)
        expect(comItem.new_csll).not.toBeCloseTo(Number(semItem.new_csll), 2)
        expect(comItem.new_irpj).not.toBeCloseTo(Number(semItem.new_irpj), 2)
    })
})

describe('`discount_mode` — o modo de absorção entra no snapshot', () => {
    // Antes o gravador não passava o modo e caía no default PROPORTIONAL: o desconto era
    // sempre rateado, mesmo quando o documento dizia que sai só da comissão.
    it('PROPORTIONAL e SELLER_REDUCTION produzem partições diferentes', () => {
        const proporcional = gravar(TAXAS_DO_PRODUTO, 10, 'PROPORTIONAL')
        const doVendedor = gravar(TAXAS_DO_PRODUTO, 10, 'SELLER_REDUCTION')

        expect(proporcional.new_commission).not.toBeCloseTo(Number(doVendedor.new_commission), 2)
        // O RRO total é o mesmo — muda só COMO ele se reparte.
        expect(proporcional.rro).toBeCloseTo(Number(doVendedor.rro), 2)
    })

    it('o modo importa MESMO SEM DESCONTO — o alcance é maior do que parecia', () => {
        // Eu esperava que sem desconto os dois modos coincidissem, e a medição diz o
        // contrário: 126,92 no PROPORTIONAL contra 380,77 no SELLER_REDUCTION, mesmo item,
        // desconto zero. O modo governa o rateio do RRO SEMPRE, não só quando há desconto a
        // absorver. Consequência: o campo ausente afetava TODO documento gravado, não um
        // subconjunto — o alcance é maior do que eu tinha suposto ao escrever este caso.
        const proporcional = gravar(TAXAS_DO_PRODUTO, 0, 'PROPORTIONAL')
        const doVendedor = gravar(TAXAS_DO_PRODUTO, 0, 'SELLER_REDUCTION')
        expect(proporcional.new_commission).toBeCloseTo(126.9231, 3)
        expect(doVendedor.new_commission).toBeCloseTo(380.7692, 3)
        expect(proporcional.rro).toBeCloseTo(Number(doVendedor.rro), 2)
    })
})

describe('A rota é uma só — a cobertura não pode divergir de novo', () => {
    const SRC = path.resolve(__dirname, '../..')
    const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8')

    it('`hydrateItemSnapshot` consome o input pronto, não remonta', () => {
        const conteudo = read('lib/items-snapshot.ts')
        expect(conteudo).toContain('motorInput: ReapurationInput')
        expect(conteudo).toContain('...item.motorInput')
        // As fontes que o gravador usava por conta própria não podem voltar.
        expect(conteudo).not.toContain('rates: ctx.rates')
        expect(conteudo).not.toContain('csll_pct: ctx.csll_pct')
        expect(conteudo).not.toContain('irpj_pct: ctx.irpj_pct')
    })

    it('o `das_pct` entrou no contrato — e trouxe o seu oráculo junto', () => {
        // Este caso nasceu no PR anterior afirmando o CONTRÁRIO: que `das_pct` continuava fora
        // do contrato, para avisar se alguém o ligasse sem o teste do oráculo. Ele cumpriu o
        // papel — falhou no PR que ligou o campo. Agora afirma o estado novo, e a existência do
        // oráculo é parte da asserção: o campo não pode entrar sem o caso da TAMARA a 8,02%.
        expect(read('types/mrm.ts')).toContain('das_pct')
        expect(read('utils/mrm-orchestrator.ts')).toContain('das_pct: Number(itemTaxRates?.das_pct)')
        expect(fs.existsSync(path.join(SRC, 'utils/__tests__/das-pct-no-motor.test.ts'))).toBe(true)
    })
})
