/**
 * PRODUTO DE REVENDA NOVO GANHA CUSTO PELA COMPOSIÇÃO — e o custo zero deixa de ser mudo.
 *
 * ── A REGRESSÃO QUE ISTO FECHA, medida em 17/09/2026 ─────────────────────────
 *
 * Ao remover o seletor "Item base", `base_item_id` passou a ser derivado na GRAVAÇÃO. O que
 * ficou de fora é que o seletor era também o **único escritor em tempo de edição**: o
 * `useEffect` de `content.component.tsx` que dá CUSTO ao produto de revenda depende de
 * `baseItemId`, e os pontos de UI que o escreviam caíram de **DOIS para ZERO**.
 *
 * | fluxo | antes | depois da remoção |
 * |---|---|---|
 * | REVENDA em EDIÇÃO | `baseItemId` vem do banco | igual — sem defeito |
 * | criado a partir de um item | prefill escreve | igual — sem defeito |
 * | **REVENDA NOVO, direto na tela** | o seletor escrevia | **ninguém escrevia** |
 *
 * No terceiro caso a composição ficava vazia, `itemsPriceSum = 0`, `doProductCalc` devolvia
 * preço 0, e a tabela inteira saía `R$ 0,00` com IRPJ e CSLL em `0,000%`. Foi lido como
 * "a coluna Valor (R$) está vazia" — e a leitura estava certa em estranhar: o número
 * estava lá e não significava nada.
 *
 * ── A CLASSE, e ela é a lição ────────────────────────────────────────────────
 *
 * A medição que autorizou a remoção listou os **cinco leitores** de `base_item_id` — no
 * banco e em outras telas — e não listou o **escritor** dentro da própria tela de produto.
 * Ver `docs/registros/leitores-e-escritores-sao-listas-diferentes.md`.
 *
 * ── O QUE CADA BLOCO AFIRMA ──────────────────────────────────────────────────
 *
 * O bloco 1 roda a REGRA pura. Os blocos 2 e 3 RENDERIZAM o card de preço real e leem a
 * tabela do DOM — é lá que "os valores estão preenchidos" e "o aviso aparece" viram efeito
 * observável em vez de leitura de arquivo.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ProductPrice } from '@/page-parts/products/product-price.component'
import { derivarBaseItemId } from '@/utils/base-item-derivado'
import { readFileSync } from 'fs'
import { join } from 'path'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))

function renderIn(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(node) })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

// ── o cenário: tenant de revenda, Lucro Real ────────────────────────────────
const CALC_BASE: any = {
  indirectLaborPct: 7.56, laborPercent: 0, fixedExpensePct: 14.89,
  variableExpensePct: 5.56, financialExpensePct: 0.56,
  taxPct: 0, taxLabel: '', isMei: false,
}
const FORM: any = { getFieldValue: (k: string) => (k === 'quantity' ? 1 : 'UN') }
const LUCRO = 5

/**
 * `productPriceInfo` como a tela o recebe DEPOIS do `doProductCalc`.
 * `custo = 0` reproduz a composição vazia: o motor devolve preço zero.
 */
const info = (custo: number): any => {
  // O motor forma P = custo ÷ MC. Com as alíquotas do cenário, Σ = 61,55% e MC = 38,45%.
  const preco = custo > 0 ? custo / 0.3845 : 0
  return {
    productCost: custo,
    totalProductPrice: preco,
    productProfitPercent: LUCRO,
    productProfitPrice: preco * LUCRO / 100,
    salesCommissionPercent: 5,
    salesCommissionPrice: preco * 0.05,
    rtReservePercent: 0,
    taxesPrice: 0,
  }
}

const props = (custo: number) => ({
  calcBase: CALC_BASE,
  productPriceInfo: info(custo),
  currentUser: { taxableRegime: 'LUCRO_REAL', calcType: 'RESALE' } as any,
  productForm: FORM,
  handleChangePrecificationInputs: () => {},
  icmsPct: 17, pisCofinsLRPct: 7.678,
  isResaleProduct: true,
}) as any

/** Lê a tabela pelo CABEÇALHO — comparar por índice fixo quebra quando uma coluna entra. */
const tabela = (c: HTMLElement) => {
  const ths = Array.from(c.querySelectorAll('thead th')).map((t) => (t.textContent || '').trim())
  const iValor = ths.findIndex((t) => t.startsWith('Valor'))
  const iEfet = ths.findIndex((t) => t.startsWith('% Efetivo'))
  const out: Record<string, { valor: string; efetivo: string }> = {}
  for (const tr of Array.from(c.querySelectorAll('tbody tr'))) {
    const tds = Array.from(tr.querySelectorAll('td'))
    if (tds.length < ths.length) continue
    const rotulo = (tds[1]?.textContent || '').trim()
    out[rotulo] = {
      valor: (tds[iValor]?.textContent || '').trim(),
      efetivo: (tds[iEfet]?.textContent || '').trim(),
    }
  }
  return out
}

const reais = (s: string) => Number(s.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'))

describe('1. A REGRA — a composição de UM item escreve o item base', () => {
  it('a tela deriva pela MESMA função da gravação, e ela devolve o item', () => {
    const r = derivarBaseItemId({
      productType: 'REVENDA',
      itens: [{ id: 'item-x' }],
      baseItemIdAtual: null,
    })
    expect(r.baseItemId).toBe('item-x')
    expect(r.origem).toBe('DERIVADO_DA_COMPOSICAO')
  })

  it('>>> e com ZERO ou DOIS itens ela NÃO escreve — é o que impede o laço e o apagamento <<<', () => {
    // O efeito só escreve quando a origem é DERIVADO_DA_COMPOSICAO. Nos outros dois casos
    // o gravado continua valendo: sobrescrever apagaria o vínculo dos 32 produtos medidos.
    expect(derivarBaseItemId({ productType: 'REVENDA', itens: [], baseItemIdAtual: 'item-a' }).origem)
      .toBe('PRESERVADO')
    expect(derivarBaseItemId({ productType: 'REVENDA', itens: [{ id: 'a' }, { id: 'b' }], baseItemIdAtual: 'item-a' }).origem)
      .toBe('PRESERVADO')
  })
})

describe('2. COM ITEM NA COMPOSIÇÃO — a precificação sai, e o IRPJ deriva do lucro', () => {
  const CUSTO = 1250
  const r = renderIn(<ProductPrice {...props(CUSTO)} />)
  const t = tabela(r.container)
  afterAll(() => r.unmount())

  it('>>> o CUSTO chega, e nenhuma linha fica em zero por falta de base <<<', () => {
    // O DISCRIMINANTE do bloco 3: aqui TODAS as categorias com % > 0 têm R$ > 0.
    for (const rotulo of ['Mão de obra administrativa', 'Despesas fixas', 'Despesas variáveis',
      'Despesas financeiras', 'Comissão total do vendedor', 'Lucro', 'ICMS (%)']) {
      expect(t[rotulo]).toBeDefined()
      expect(reais(t[rotulo].valor)).toBeGreaterThan(0)
    }
  })

  it('>>> IRPJ 0,750% e CSLL 0,450% — derivados do lucro de 5% <<<', () => {
    // R6: IRPJ = 15% × % Lucro, CSLL = 9% × % Lucro. Com lucro 5%: 0,750% e 0,450%.
    expect(t['IRPJ (15% sobre lucro)'].efetivo).toBe('0,750%')
    expect(t['CSLL (9% sobre lucro)'].efetivo).toBe('0,450%')
    // E os DOIS têm R$ — o que faltava era a base, não a fórmula.
    expect(reais(t['IRPJ (15% sobre lucro)'].valor)).toBeGreaterThan(0)
    expect(reais(t['CSLL (9% sobre lucro)'].valor)).toBeGreaterThan(0)
  })

  it('a razão IRPJ ÷ CSLL é 15/9, em R$ e em % — a relação legal sobrevive', () => {
    // O discriminante contra uma derivação que acertasse a magnitude e errasse a razão.
    const irpj = reais(t['IRPJ (15% sobre lucro)'].valor)
    const csll = reais(t['CSLL (9% sobre lucro)'].valor)
    expect(irpj / csll).toBeCloseTo(15 / 9, 2)
  })

  it('e o AVISO de custo zero NÃO aparece', () => {
    expect(r.container.querySelector('[data-testid="custo-zero"]')).toBeNull()
  })
})

describe('3. SEM ITEM NENHUM — o aviso aparece, e diz por quê', () => {
  const r = renderIn(<ProductPrice {...props(0)} />)
  const t = tabela(r.container)
  afterAll(() => r.unmount())

  it('>>> o aviso de CUSTO ZERO aparece <<<', () => {
    const aviso = r.container.querySelector('[data-testid="custo-zero"]')
    expect(aviso).not.toBeNull()
    expect(aviso!.textContent).toContain('Sem custo, não há preço a formar')
    // Ele diz o que FAZER, não só que algo está errado.
    expect(aviso!.textContent).toContain('Adicione o item na composição')
  })

  it('a tabela inteira sai R$ 0,00 — e é ISSO que o aviso explica', () => {
    // O número estava lá e não significava nada. `ausente-vs-falso.md` na coluna.
    for (const rotulo of ['Mão de obra administrativa', 'Despesas fixas', 'Lucro', 'ICMS (%)']) {
      expect(reais(t[rotulo].valor)).toBe(0)
    }
  })

  it('>>> as alíquotas CADASTRADAS continuam lá — o que falta é a base <<<', () => {
    // O discriminante contra ler "custo zero" como "alíquota zero": as do cadastro seguem.
    expect(t['ICMS (%)'].efetivo).toBe('17,000%')
    expect(t['Lucro'].efetivo).toBe('5,000%')
    expect(t['Despesas fixas'].efetivo).toBe('14,890%')
  })

  it('>>> mas IRPJ e CSLL ZERAM TAMBÉM — e isso NÃO é o cadastro, é a derivação <<<', () => {
    /**
     * MEDIDO AO ESCREVER ESTE CASO, e ele derrubou a minha própria asserção: eu afirmei
     * no texto do aviso que "as alíquotas continuam válidas", e para IRPJ e CSLL isso é
     * FALSO. Elas não vêm do cadastro — vêm do PREÇO:
     *
     *   `irpjPct = pricePerUnit > 0 ? (profitVal × 0,15) ÷ pricePerUnit × 100 : 0`
     *
     * Com `pricePerUnit = 0` a guarda devolve 0, e a linha exibe `0,000%` mesmo com o
     * lucro cadastrado em 5%. Algebricamente a expressão É `15% × %Lucro` — a dependência
     * do preço é do CAMINHO, não da fórmula.
     *
     * O texto do aviso foi corrigido por causa deste caso, não o contrário.
     */
    expect(t['IRPJ (15% sobre lucro)'].efetivo).toBe('0,000%')
    expect(t['CSLL (9% sobre lucro)'].efetivo).toBe('0,000%')
    // E o CONTRASTE que prova que a fórmula está certa: com base, elas aparecem.
    const comBase = renderIn(<ProductPrice {...props(1250)} />)
    const t2 = tabela(comBase.container)
    expect(t2['IRPJ (15% sobre lucro)'].efetivo).toBe('0,750%')
    expect(t2['CSLL (9% sobre lucro)'].efetivo).toBe('0,450%')
    comBase.unmount()
  })
})

describe('4. A JUNTA — o efeito existe na tela e usa a função da gravação', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'page-parts', 'products', 'content.component.tsx'),
    'utf-8',
  )

  /**
   * Asserção de CAMINHO, e é o caso-limite que `teste-que-nao-exercita.md` permite: o
   * `useEffect` vive dentro de um componente de página que não é montável isoladamente, e
   * o EFEITO dele — a composição virar item base — já está afirmado no bloco 1 sobre a
   * função pura. O que falta é que a tela CHAME aquela função, e é só isso que se afirma.
   */
  it('o efeito reverso existe, e chama `derivarBaseItemId`', () => {
    const memo = src.slice(src.indexOf("if (productType !== 'REVENDA') return"))
    const corpo = memo.slice(0, memo.indexOf('}, [productType, productItemsData, baseItemId])'))
    expect(corpo).toContain('derivarBaseItemId({')
    expect(corpo).toContain('setBaseItemId(derivado.baseItemId)')
  })

  it('>>> e ele só escreve quando DERIVOU — o guarda contra o laço e contra o apagamento <<<', () => {
    const memo = src.slice(src.indexOf("if (productType !== 'REVENDA') return"))
    const corpo = memo.slice(0, memo.indexOf('}, [productType, productItemsData, baseItemId])'))
    expect(corpo).toContain("if (derivado.origem !== 'DERIVADO_DA_COMPOSICAO') return")
    // A comparação por ID é o que faz os dois efeitos convergirem numa volta.
    expect(corpo).toContain('if (derivado.baseItemId === baseItemId) return')
  })

  it('o efeito de CUSTO continua dependendo de `baseItemId` — é ele que o ciclo alimenta', () => {
    expect(src).toContain('}, [productType, baseItemId, items])')
    expect(src).toContain('setTimeout(() => setUpdatedProductPriceInfoWithApi(prev => prev + 1), 100)')
  })

  it('e o SELETOR não voltou', () => {
    expect(src).not.toContain('Item base (mercadoria para revenda)')
    expect(src).not.toContain('Selecione o item de revenda')
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 5. O IRPJ EM R$ — a divergência contra `main` é DELIBERADA
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Decisão do dono do produto, 17/09/2026, registrada como está:
 *
 *   "Main mostrava R$ 59,05 ao lado de 0,000%. Um R$ que a porcentagem ao lado nega é pior
 *    que zero — afirma valor onde não há conta. R$ 0,00 coerente com 0,000% é o certo.
 *    Registre que foi mudança deliberada, não regressão, senão alguém 'conserta' de volta."
 *
 * Em `origin/main` o R$ do IRPJ vinha de `profitValDisplay × 0,15`, independente do preço;
 * a % vinha de `(profitVal × 0,15) ÷ pricePerUnit`. Com o motor ainda sem responder a
 * segunda dava 0 e a primeira não — e a tela exibia os dois lado a lado.
 */
describe('5. IRPJ em R$ x % — nunca mais um valor que a alíquota ao lado nega', () => {
  const r = renderIn(<ProductPrice {...props(0)} />)
  const t = tabela(r.container)
  afterAll(() => r.unmount())

  it('>>> o R$ e a % andam JUNTOS — os dois zero, ou os dois com número <<<', () => {
    // Sem base: 0,000% e R$ 0,00. Coerentes.
    expect(t['IRPJ (15% sobre lucro)'].efetivo).toBe('0,000%')
    expect(reais(t['IRPJ (15% sobre lucro)'].valor)).toBe(0)
    // Com base: 0,750% e R$ > 0. Coerentes.
    const comBase = renderIn(<ProductPrice {...props(1250)} />)
    const t2 = tabela(comBase.container)
    expect(t2['IRPJ (15% sobre lucro)'].efetivo).toBe('0,750%')
    expect(reais(t2['IRPJ (15% sobre lucro)'].valor)).toBeGreaterThan(0)
    comBase.unmount()
    // É ISTO que `main` não garantia: lá o R$ vinha de `profitValDisplay × 0,15`, uma
    // conta paralela à da %, e as duas podiam discordar na mesma linha.
  })

  it('e o R$ sai da MESMA linha que a %, nunca de uma conta paralela', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'page-parts', 'products', 'product-price.component.tsx'),
      'utf-8',
    )
    // É isto que garante a coerência: um valor, uma origem. A conta paralela de `main`
    // (`profitValDisplay * 0.15`) não existe mais.
    expect(src).toContain("const irpjValDisplay = valorDa('irpj')")
    expect(src).toContain("const csllValDisplay = valorDa('csll')")
    expect(src).not.toContain('profitValDisplay * 0.15')
    expect(src).not.toContain('profitValDisplay * 0.09')
  })
})
