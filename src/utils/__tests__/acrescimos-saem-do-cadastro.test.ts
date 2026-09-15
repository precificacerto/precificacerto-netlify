/**
 * OS ACRÉSCIMOS SAEM DO CADASTRO — R11, e só a metade que a R11 manda sair.
 *
 * "Acréscimos pertencem ao orçamento, não ao produto. Um frete atende vários produtos.
 *  `products.freight_value`, `insurance_value` e `accessory_expenses_value` deixam de ser
 *  alimentados DAQUI PARA A FRENTE; os produtos que já têm valor ali permanecem como estão,
 *  SEM MIGRAÇÃO RETROATIVA."
 *
 * São duas frases, e a segunda é a que este arquivo protege. O que sai é a ENTRADA e a
 * GRAVAÇÃO; o que FICA é a leitura — e ela não é detalhe: `resolveAccessoriesSource` decide a
 * precedência documento × cadastro lendo exatamente essas colunas, e a porta 2 de
 * `buildProductConstruction` depende delas para não mudar o preço de quem já tem valor.
 *
 * Apagar a leitura junto seria migração retroativa disfarçada de limpeza.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { legacyAccessoriesTotal, resolveAccessoriesSource } from '@/utils/budget-accessories'
import { buildProductConstruction } from '@/utils/product-price-construction'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

describe('1. A ENTRADA saiu da tela de produto', () => {
  const price = ler('page-parts/products/product-price.component.tsx')

  it('não há mais campo editável de frete, seguro ou despesas acessórias', () => {
    // Os três eram `CurrencyInput` dentro da seção "Atividades Terceirizadas", e eram os
    // ÚNICOS do arquivo. A asserção é sobre o IDENTIFICADOR, não sobre a linha de import:
    // uma mutação que reintroduzisse o import com aspas duplas passaria por uma asserção
    // sobre o texto do import — e passou, na primeira rodada. Variante 2 de
    // `.claude/rules/teste-que-nao-exercita.md`: o caso escolhido não discriminava.
    expect(price).not.toContain('CurrencyInput')
    expect(price).not.toContain('onFreightChange')
    expect(price).not.toContain('onInsuranceChange')
    expect(price).not.toContain('onAccessoryExpensesChange')
  })

  it('e a seção de ENTRADA não existe mais — sobra só a nota do valor legado', () => {
    expect(price).not.toMatch(/Atividades Terceirizadas\s*$/m)
    expect(price).toContain('Acréscimos legados no cadastro')
    // A nota só aparece para quem TEM valor: um produto sem acréscimo não vê nada.
    //
    // A guarda é procurada NO BLOCO DA NOTA, e não no arquivo inteiro: `terceirizadasTotal
    // > 0` aparece em outros três pontos, e uma asserção sobre o arquivo continuaria verde
    // com a guarda da nota apagada. Foi o que a mutação E6 mostrou na primeira rodada.
    const iNota = price.indexOf('Acréscimos legados no cadastro')
    const blocoDaNota = price.slice(Math.max(0, iNota - 900), iNota)
    expect(blocoDaNota).toContain('terceirizadasTotal > 0 && (')
  })

  it('os wrappers não repassam mais os handlers', () => {
    for (const arquivo of ['page-parts/products/content-industrialization.tsx', 'page-parts/products/content-resale.tsx']) {
      expect(ler(arquivo)).not.toContain('onFreightChange')
    }
  })

  it('a tela de SERVIÇO nunca teve o bloco, e continua sem', () => {
    // Medido: zero ocorrências antes desta rodada. Está afirmado para que ninguém o
    // acrescente lá depois, achando que faltava.
    const svc = ler('page-parts/services/content.component.tsx')
    expect(svc).not.toContain('freightValue')
    expect(svc).not.toContain('Atividades Terceirizadas')
  })
})

describe('2. A GRAVAÇÃO parou — e NÃO virou gravar zero', () => {
  const content = ler('page-parts/products/content.component.tsx')

  it('o save não alimenta mais as três colunas', () => {
    expect(content).not.toContain('extraFields.freight_value')
    expect(content).not.toContain('extraFields.insurance_value')
    expect(content).not.toContain('extraFields.accessory_expenses_value')
  })

  it('e não grava zero no lugar — isso seria migração retroativa disfarçada de save', () => {
    // O discriminante entre "parou de alimentar" e "passou a zerar". Um `= 0` aqui apagaria
    // o valor de todo produto legado no primeiro save, que é exatamente o que a R11 proíbe.
    expect(content).not.toMatch(/freight_value\s*=\s*0/)
    expect(content).not.toMatch(/insurance_value\s*=\s*0/)
    expect(content).not.toMatch(/accessory_expenses_value\s*=\s*0/)
  })
})

describe('3. A LEITURA fica — e é dela que a precedência depende', () => {
  const content = ler('page-parts/products/content.component.tsx')

  it('o produto legado continua carregando os valores gravados', () => {
    expect(content).toContain('setFreightValue(Number((product as any).freight_value))')
    expect(content).toContain('setInsuranceValue(Number((product as any).insurance_value))')
    expect(content).toContain('setAccessoryExpensesValue(Number((product as any).accessory_expenses_value))')
  })

  it('o orçamento ainda lê o cadastro quando o documento NÃO cotou', () => {
    const orc = ler('pages/orcamentos/index.tsx')
    expect(orc).toContain('Number(prod.freight_value)')
  })

  it('EFEITO — sem cotação no documento, o cadastro prevalece', () => {
    const semCotacao = resolveAccessoriesSource({ freightValue: null, insuranceValue: null, accessoryExpensesValue: null })
    expect(semCotacao.source).toBe('CADASTRO')
    // E o total do cadastro continua sendo somado, item a item.
    expect(legacyAccessoriesTotal([
      { id: 'a', freightUnit: 10, insuranceUnit: 2, accessoryUnit: 3, quantity: 4 },
    ])).toBeCloseTo(60, 6)
  })

  it('EFEITO — com cotação no documento, o cadastro é ignorado (R11)', () => {
    const comCotacao = resolveAccessoriesSource({ freightValue: 3000 })
    expect(comCotacao.source).toBe('DOCUMENTO')
  })
})

describe('4. O PREÇO de quem já tem valor NÃO muda', () => {
  const base = {
    taxableRegime: 'LUCRO_REAL' as const,
    segment: 'INDUSTRIALIZACAO' as const,
    buyerType: 'CONSUMIDOR_FINAL' as const,
    saleScope: 'INTRAESTADUAL' as const,
    costTotal: 1000,
    structurePct: 0.18, rtReservePct: 0, commissionPct: 0.05, profitPct: 0.08, profitTaxPct: 0.02,
    rates: { icmsPct: 0.17, issPct: null as number | null, pisCofinsEffectivePct: 0.076775, ibsPct: 0.01, cbsPct: 0.088 },
  }

  it('com acréscimo gravado, a matriz continua NÃO governando — porta 2 intacta', () => {
    const comLegado = buildProductConstruction({ ...base, despAcessorias: 250 })
    expect(comLegado.applied).toBe(false)
    expect(comLegado.reason).toContain('acréscimos gravados')
  })

  it('e sem acréscimo, ela governa — o contraste que mostra que a porta é a do acréscimo', () => {
    const semLegado = buildProductConstruction({ ...base, despAcessorias: 0 })
    expect(semLegado.applied).toBe(true)
    expect(semLegado.opInterna).toBeGreaterThan(0)
  })
})
