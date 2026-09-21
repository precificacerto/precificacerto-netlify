/**
 * ENTRADA DE IMPOSTO EM % OU EM R$ — o oráculo A–F do comando do PO de 22/09/2026.
 *
 * Nota de R$ 10.000,00 · ICMS 18,00% · PIS/COFINS 9,25% · IPI 5,00%.
 *
 * >>> O QUE ESTES CASOS PRECISAM DISCRIMINAR <<<
 *
 * O risco desta mudança não é a conversão errar: é a conversão acertar por uma fórmula
 * PRÓPRIA, escrita na tela, que fecha consigo mesma e diverge da conta do imposto quando a
 * base de uma linha muda. É `copia-divergente.md` na forma mais direta — duas escritas da
 * mesma base, uma delas esquecendo que a do PIS/COFINS desconta o ICMS.
 *
 * Por isso o caso central não é "1.800 ÷ 10.000 = 18%". É: a alíquota derivada de um valor,
 * devolvida à função pura, reproduz AQUELE valor — e reproduz para o PIS/COFINS, cuja base
 * NÃO é o preço da nota. Um caso só com ICMS passaria verde com a base errada, porque ali as
 * duas bases coincidem (`teste-que-nao-exercita.md`, variante 2).
 */
import {
  aliquotaAPartirDoValor,
  valorAPartirDaAliquota,
  converterFormato,
  entradaParaReabertura,
  baseDisponivel,
  formatoGravado,
  MENSAGEM_SEM_BASE,
  CASAS_DA_ALIQUOTA,
  CASAS_DO_VALOR,
  type FormatoDaEntrada,
} from '@/utils/entrada-de-imposto'
import {
  baseDoTributo,
  calcularCustoDoItem,
  resolverFlagsDoItem,
  TRIBUTOS_CREDITAVEIS,
  type TributoCreditavel,
  type ValoresDaCompra,
} from '@/utils/custo-liquido-do-item'

/** A nota do gabarito. */
const NOTA: ValoresDaCompra = {
  base: 10000,
  icmsPct: 18,
  pisCofinsPct: 9.25,
  ipiPct: 5,
}

const bandeiras = () => resolverFlagsDoItem({ regime: 'LUCRO_REAL', destinacao: 'INSUMO', segmento: 'INDUSTRIALIZACAO' }, {})
const apurar = (v: ValoresDaCompra) => calcularCustoDoItem(v, bandeiras()).valores

// ═════════════════════════════════════════════════════════════════════════════════════════
// A BASE DE CADA LINHA — lida da função pura, nunca reescrita
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A base de cada linha vem da MESMA fonte que a conta usa', () => {
  it('>>> preço da nota para ICMS, IPI, CBS e IBS; base APÓS o ICMS para PIS/COFINS <<<', () => {
    expect(baseDoTributo(NOTA, 'ICMS')).toBeCloseTo(10000, 2)
    expect(baseDoTributo(NOTA, 'IPI')).toBeCloseTo(10000, 2)
    expect(baseDoTributo(NOTA, 'CBS')).toBeCloseTo(10000, 2)
    expect(baseDoTributo(NOTA, 'IBS')).toBeCloseTo(10000, 2)
    expect(baseDoTributo(NOTA, 'PIS_COFINS')).toBeCloseTo(8200, 2)
  })

  it('>>> e ela é a base que o VALOR apurado usa — os dois lados não podem divergir <<<', () => {
    const v = apurar(NOTA)
    expect(v.icms).toBeCloseTo(baseDoTributo(NOTA, 'ICMS') * 18 / 100, 6)
    expect(v.pisCofins).toBeCloseTo(baseDoTributo(NOTA, 'PIS_COFINS') * 9.25 / 100, 6)
    expect(v.ipi).toBeCloseTo(baseDoTributo(NOTA, 'IPI') * 5 / 100, 6)
  })

  it('a base do PIS/COFINS ACOMPANHA o ICMS: mudou a alíquota do ICMS, mudou a base', () => {
    expect(baseDoTributo({ ...NOTA, icmsPct: 12 }, 'PIS_COFINS')).toBeCloseTo(8800, 2)
    // Sem ICMS informado a base é o preço cheio — ausente não desconta nada.
    expect(baseDoTributo({ ...NOTA, icmsPct: null }, 'PIS_COFINS')).toBeCloseTo(10000, 2)
  })

  it('o ICMS DIFERIDO reduz o destacado, e a base do PIS/COFINS acompanha', () => {
    const comDiferimento: ValoresDaCompra = { ...NOTA, icmsDeferidoAtivo: true, icmsDeferidoPct: 50 }
    // 18% × (1 − 50%) = 9% → ICMS 900,00 → base do PIS/COFINS 9.100,00
    expect(baseDoTributo(comDiferimento, 'PIS_COFINS')).toBeCloseTo(9100, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// CASO A — tudo em percentual, que é o comportamento de hoje
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A — tudo em %, e é o número de hoje', () => {
  const v = apurar(NOTA)

  it('>>> ICMS 1.800,00 · PIS/COFINS 758,50 · IPI 500,00 <<<', () => {
    expect(v.icms).toBeCloseTo(1800.0, 2)
    expect(v.pisCofins).toBeCloseTo(758.5, 2)
    expect(v.ipi).toBeCloseTo(500.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// CASO B — ICMS digitado em R$
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — ICMS em R$ 1.800,00', () => {
  const derivada = aliquotaAPartirDoValor(1800, baseDoTributo(NOTA, 'ICMS'))

  it('>>> a alíquota derivada é 18,0000% <<<', () => {
    expect(derivada).toBeCloseTo(18.0, 4)
  })

  it('>>> e o resultado é IDÊNTICO ao caso A, incluindo o custo líquido <<<', () => {
    const emReais = calcularCustoDoItem({ ...NOTA, icmsPct: derivada }, bandeiras())
    const emPercentual = calcularCustoDoItem(NOTA, bandeiras())
    expect(emReais.valores.icms).toBeCloseTo(1800.0, 2)
    expect(emReais.valores.pisCofins).toBeCloseTo(758.5, 2)
    expect(emReais.valores.ipi).toBeCloseTo(500.0, 2)
    expect(emReais.custoLiquido).toBeCloseTo(emPercentual.custoLiquido, 2)
    expect(emReais.creditoTotal).toBeCloseTo(emPercentual.creditoTotal, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// CASO C — PIS/COFINS em R$, sobre a base que NÃO é o preço da nota
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — PIS/COFINS em R$ 758,50', () => {
  it('>>> a alíquota derivada é 9,2500%, sobre a base de 8.200,00 — e NÃO 7,5850% sobre 10.000 <<<', () => {
    const derivada = aliquotaAPartirDoValor(758.5, baseDoTributo(NOTA, 'PIS_COFINS'))
    expect(derivada).toBeCloseTo(9.25, 4)
    // O número que a base ERRADA produziria. Ele está aqui porque é o defeito que este caso
    // existe para barrar: com o preço da nota como base, a alíquota sai 7,5850%.
    expect(derivada).not.toBeCloseTo(7.585, 3)
  })

  it('e devolvida à conta ela reproduz os 758,50', () => {
    const derivada = aliquotaAPartirDoValor(758.5, baseDoTributo(NOTA, 'PIS_COFINS'))
    expect(apurar({ ...NOTA, pisCofinsPct: derivada }).pisCofins).toBeCloseTo(758.5, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A IDA E VOLTA, PARA OS CINCO TRIBUTOS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('>>> A alíquota derivada de um VALOR reproduz AQUELE valor, tributo a tributo <<<', () => {
  const ALVO: Record<TributoCreditavel, number> = {
    ICMS: 1800, PIS_COFINS: 758.5, IPI: 500, CBS: 880, IBS: 10,
  }
  const CAMPO: Record<TributoCreditavel, keyof ValoresDaCompra> = {
    ICMS: 'icmsPct', PIS_COFINS: 'pisCofinsPct', IPI: 'ipiPct', CBS: 'cbsPct', IBS: 'ibsPct',
  }

  it.each(TRIBUTOS_CREDITAVEIS.map((t) => [t] as const))('%s', (t) => {
    const base = baseDoTributo(NOTA, t)
    const derivada = aliquotaAPartirDoValor(ALVO[t], base)
    const apurado = apurar({ ...NOTA, [CAMPO[t]]: derivada })
    const lido = {
      ICMS: apurado.icms, PIS_COFINS: apurado.pisCofins, IPI: apurado.ipi,
      CBS: apurado.cbs, IBS: apurado.ibs,
    }[t]
    expect(lido).toBeCloseTo(ALVO[t], 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// CASO D — trocar de formato e voltar
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — % → R$ → % não muda nada', () => {
  const base = baseDoTributo(NOTA, 'ICMS')

  it('>>> ida: 18,00% vira R$ 1.800,00 <<<', () => {
    const ida = converterFormato({ de: 'PCT', para: 'BRL', aliquotaPct: 18, valor: null, base })
    expect(ida.valor).toBeCloseTo(1800.0, 2)
    expect(ida.aliquotaPct).toBeCloseTo(18.0, 4)
  })

  it('>>> volta: R$ 1.800,00 vira 18,0000%, e o imposto calculado é o mesmo <<<', () => {
    const ida = converterFormato({ de: 'PCT', para: 'BRL', aliquotaPct: 18, valor: null, base })
    const volta = converterFormato({ de: 'BRL', para: 'PCT', aliquotaPct: ida.aliquotaPct, valor: ida.valor, base })
    expect(volta.aliquotaPct).toBeCloseTo(18.0, 4)
    expect(apurar({ ...NOTA, icmsPct: volta.aliquotaPct }).icms).toBeCloseTo(1800.0, 2)
  })

  it('>>> e o custo líquido não se mexe em nenhum dos três estados <<<', () => {
    const base0 = calcularCustoDoItem(NOTA, bandeiras()).custoLiquido
    const ida = converterFormato({ de: 'PCT', para: 'BRL', aliquotaPct: 18, valor: null, base })
    const volta = converterFormato({ de: 'BRL', para: 'PCT', aliquotaPct: ida.aliquotaPct, valor: ida.valor, base })
    expect(calcularCustoDoItem({ ...NOTA, icmsPct: ida.aliquotaPct }, bandeiras()).custoLiquido).toBeCloseTo(base0, 2)
    expect(calcularCustoDoItem({ ...NOTA, icmsPct: volta.aliquotaPct }, bandeiras()).custoLiquido).toBeCloseTo(base0, 2)
  })

  /**
   * O LIMITE DO ARREDONDAMENTO, medido em vez de afirmado.
   *
   * A alíquota derivada guarda 4 casas, então a volta ao valor não é exata para qualquer
   * par (valor, base). O que se afirma é o que o comando pede: o total dos impostos não
   * varia por causa da troca de formato — e "não varia" aqui significa abaixo de um centavo.
   */
  it('>>> a troca de formato não move o total dos impostos: diferença < R$ 0,01 <<<', () => {
    const casos = [
      { valor: 1800, base: 10000 },
      { valor: 758.5, base: 8200 },
      { valor: 123.45, base: 333 },
      { valor: 0.07, base: 999.99 },
      { valor: 7777.77, base: 12345.67 },
    ]
    for (const c of casos) {
      const pct = aliquotaAPartirDoValor(c.valor, c.base)
      const devolta = valorAPartirDaAliquota(pct, c.base)
      expect(Math.abs((devolta ?? 0) - c.valor)).toBeLessThan(0.01)
    }
  })

  it('a alíquota guarda 4 casas e o valor exibido, 2', () => {
    expect(CASAS_DA_ALIQUOTA).toBe(4)
    expect(CASAS_DO_VALOR).toBe(2)
    // 1/3 da base: 33,3333% e não 33,33%
    expect(aliquotaAPartirDoValor(1000, 3000)).toBeCloseTo(33.3333, 4)
    expect(valorAPartirDaAliquota(33.3333, 3000)).toBeCloseTo(999.999, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// CASO E — base ausente. AUSENTE NÃO É ZERO.
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — sem valor total da nota, o campo em R$ não existe', () => {
  it('>>> base ausente ou zero: o campo fica indisponível, com a mensagem <<<', () => {
    expect(baseDisponivel(null)).toBe(false)
    expect(baseDisponivel(undefined)).toBe(false)
    expect(baseDisponivel(0)).toBe(false)
    expect(baseDisponivel(10000)).toBe(true)
    expect(MENSAGEM_SEM_BASE).toBe('informe o valor total da nota primeiro')
  })

  it('>>> e a alíquota derivada é `null`, NUNCA zero — zero afirmaria que o tributo deu nada <<<', () => {
    expect(aliquotaAPartirDoValor(500, 0)).toBeNull()
    expect(aliquotaAPartirDoValor(500, null)).toBeNull()
    expect(aliquotaAPartirDoValor(null, 10000)).toBeNull()
    // E a distinção chega à conta: `null` some da linha, zero afirma valor apurado.
    expect(apurar({ ...NOTA, icmsPct: null }).icms).toBeNull()
    expect(apurar({ ...NOTA, icmsPct: 0 }).icms).toBe(0)
  })

  it('base negativa também não serve — ela não é uma base, é um erro de digitação', () => {
    expect(baseDisponivel(-1)).toBe(false)
    expect(aliquotaAPartirDoValor(500, -1000)).toBeNull()
  })

  it('a conversão com base ausente devolve os dois lados nulos, sem inventar nenhum', () => {
    const r = converterFormato({ de: 'PCT', para: 'BRL', aliquotaPct: 18, valor: null, base: 0 })
    expect(r.valor).toBeNull()
    // A alíquota digitada NÃO se perde: ela volta intacta se o usuário desistir da troca.
    expect(r.aliquotaPct).toBeCloseTo(18, 4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A REABERTURA — o formato é do lançamento, não da sessão
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('O formato gravado reabre do jeito que foi digitado', () => {
  it('>>> gravado BRL: reabre em R$, com o valor recomposto da alíquota e da base <<<', () => {
    const r = entradaParaReabertura({ aliquotaPct: 18, formato: 'BRL' }, 10000)
    expect(r.formato).toBe('BRL')
    expect(r.valor).toBeCloseTo(1800.0, 2)
    expect(r.aliquotaPct).toBeCloseTo(18, 4)
  })

  it('>>> gravado PCT: reabre em %, e o valor acompanha para o rótulo <<<', () => {
    const r = entradaParaReabertura({ aliquotaPct: 18, formato: 'PCT' }, 10000)
    expect(r.formato).toBe('PCT')
    expect(r.aliquotaPct).toBeCloseTo(18, 4)
  })

  it('>>> formato AUSENTE cai em % — o padrão, e não uma escolha que ninguém fez <<<', () => {
    expect(entradaParaReabertura({ aliquotaPct: 18, formato: null }, 10000).formato).toBe('PCT')
    expect(entradaParaReabertura({ aliquotaPct: 18 }, 10000).formato).toBe('PCT')
    expect(formatoGravado('LIXO')).toBeNull()
    expect(formatoGravado('BRL')).toBe('BRL')
    expect(formatoGravado('PCT')).toBe('PCT')
  })

  it('alíquota ausente reabre ausente: nem zero na % nem zero no R$', () => {
    const r = entradaParaReabertura({ aliquotaPct: null, formato: 'BRL' }, 10000)
    expect(r.aliquotaPct).toBeNull()
    expect(r.valor).toBeNull()
  })

  it('>>> gravado em BRL mas SEM base hoje: o formato é respeitado e o valor fica nulo <<<', () => {
    const r = entradaParaReabertura({ aliquotaPct: 18, formato: 'BRL' }, 0)
    expect(r.formato).toBe('BRL')
    expect(r.aliquotaPct).toBeCloseTo(18, 4)
    expect(r.valor).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F — OS ORÁCULOS A–I DO CUSTO LÍQUIDO CONTINUAM BATENDO
//
// A suíte inteira de `custo-liquido-do-item.test.ts` é a afirmação completa. O que este bloco
// acrescenta é a regressão do ponto que ESTA rodada mexeu: `calcularCustoDoItem` passou a ler
// a base por `baseDoTributo` em vez de recompô-la inline.
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F — a conta não mudou ao passar a LER a base em vez de recompô-la', () => {
  const COMPRA: ValoresDaCompra = { base: 1000, icmsPct: 18, pisCofinsPct: 9.25, ipiPct: 5, icmsSt: 50 }

  it('>>> o caso A do gabarito do custo líquido: bruto 1.100,00 · créditos 255,85 · líquido 844,15 <<<', () => {
    const r = calcularCustoDoItem(
      { ...COMPRA, qtdMedida: 6 },
      resolverFlagsDoItem({ regime: 'LUCRO_REAL', destinacao: 'REVENDA', segmento: 'INDUSTRIALIZACAO' }, {}),
    )
    expect(r.custoBruto).toBeCloseTo(1100.0, 2)
    expect(r.creditoTotal).toBeCloseTo(255.85, 2)
    expect(r.custoLiquido).toBeCloseTo(844.15, 2)
    expect(r.custoPorFracao).toBeCloseTo(140.69, 2)
  })

  it('>>> e o PIS/COFINS continua sobre `base − ICMS DESTACADO`: 75,85, não 92,50 <<<', () => {
    const r = calcularCustoDoItem(
      COMPRA,
      resolverFlagsDoItem({ regime: 'LUCRO_REAL', destinacao: 'USO_CONSUMO', segmento: 'INDUSTRIALIZACAO' }, {}),
    )
    expect(r.valores.pisCofins).toBeCloseTo(75.85, 2)
    expect(r.creditos.PIS_COFINS).toBeCloseTo(0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A CONTA NÃO EXISTE FORA DA FUNÇÃO PURA — o critério de aceite, verificável
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('>>> A conversão mora na BORDA, e a conta do imposto em UM lugar só <<<', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

  it('a página de fluxo de caixa NÃO recompõe a base do PIS/COFINS', () => {
    const src = ler('src/pages/fluxo-de-caixa/index.tsx')
    // A assinatura do defeito: a tela subtraindo o ICMS para achar a base do PIS/COFINS.
    expect(src).not.toMatch(/base\s*-\s*icms/i)
    expect(src).not.toMatch(/-\s*icmsVal/i)
  })

  it('>>> e o componente do bloco de impostos NÃO divide valor por base <<<', () => {
    const src = ler('src/page-parts/items/purchase-tax-credits.component.tsx')
    // `/ base` é a fórmula da conversão. Ela vive em `entrada-de-imposto.ts`.
    expect(src).not.toMatch(/\/\s*base\b/)
  })

  /**
   * A afirmação mais forte que este bloco faz, e a que barra o defeito de verdade.
   *
   * "A fórmula aparece uma vez" se verifica por texto e envelhece mal. O que não envelhece é
   * QUEM PODE LER A BASE: se uma tela importar `baseDoTributo`, ela passa a poder decidir
   * sozinha o que dividir por quê — e é exatamente daí que a segunda escrita nasce.
   */
  it('>>> só a BORDA lê a base: nenhuma TELA importa `baseDoTributo` <<<', () => {
    const raiz = path.join(process.cwd(), 'src')
    const arquivos: string[] = []
    const varrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const cheio = path.join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== '__tests__') varrer(cheio); continue }
        if (/\.tsx?$/.test(e.name)) arquivos.push(cheio)
      }
    }
    varrer(raiz)
    // IMPORTAÇÃO, não menção: citar a função num comentário é o que se quer que as telas
    // façam. O defeito é passar a LER a base e decidir sozinha o que dividir por quê.
    const importa = (src: string) => /import[^;]*\bbaseDoTributo\b[^;]*from/s.test(src)
    const consumidores = arquivos
      .filter((f) => importa(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(process.cwd(), f))
      .sort()
    expect(consumidores).toEqual(['src/utils/entrada-de-imposto.ts'])
    // E ela é DEFINIDA na função pura, que é onde a conta mora.
    expect(ler('src/utils/custo-liquido-do-item.ts')).toMatch(/export function baseDoTributo\b/)
  })

  it('e a divisão pela base mora no módulo da borda', () => {
    expect(ler('src/utils/entrada-de-imposto.ts')).toMatch(/valorDigitado\s*\/\s*baseDaLinha/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// §2 e §3 — a largura DESTE modal, e a coluna que saiu
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('>>> §2 — o "Novo Lançamento de Despesa" abre em 50vw <<<', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const src = () => fs.readFileSync(path.join(process.cwd(), 'src/pages/fluxo-de-caixa/index.tsx'), 'utf8')

  /** O trecho de abertura DESTE Drawer — não "um modal qualquer do arquivo". */
  const aberturaDoDrawer = (s: string) => {
    const i = s.indexOf('Novo Lançamento de Despesa"')
    const inicio = s.lastIndexOf('<Drawer', i)
    return s.slice(inicio, s.indexOf('>', i) + 1)
  }

  it('>>> a largura é a de 50vw, e a classe que o CSS de tablet e mobile usa está nela <<<', () => {
    const bloco = aberturaDoDrawer(src())
    expect(bloco).toContain('LARGURA_MODAL_50.width')
    expect(bloco).toContain('drawer-50')
    // O defeito que este caso barra: cair no padrão de 75vw, ou numa largura literal.
    expect(bloco).not.toContain('LARGURA_MODAL_75')
    expect(bloco).not.toMatch(/width=\{?['"]?\d+/)
  })

  it('o CSS cobre tablet e mobile para esta classe', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/globals.scss'), 'utf8')
    expect(css).toContain('.drawer-50')
    expect(css).toMatch(/max-width:\s*1024px/)
    expect(css).toMatch(/max-width:\s*640px/)
  })
})

describe('>>> §3 — a coluna "Efeito no custo" saiu, e o "nunca credita" ficou <<<', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const src = () => fs.readFileSync(path.join(process.cwd(), 'src/page-parts/items/purchase-tax-credits.component.tsx'), 'utf8')

  it('>>> a coluna não existe mais, nem o texto que ela exibia <<<', () => {
    const s = src()
    expect(s).not.toContain('Efeito no custo')
    expect(s).not.toContain('sai do custo')
    expect(s).not.toContain('soma no custo')
  })

  it('>>> mas ICMS-ST, DIFAL e FCP continuam dizendo que NUNCA creditam <<<', () => {
    const s = src()
    expect(s).toContain('sempre custo')
    expect(s).toContain('ICMS-ST')
    expect(s).toContain('DIFAL')
    expect(s).toContain('FCP')
  })

  it('a grade do cabeçalho e a da linha continuam com o MESMO número de colunas', () => {
    const s = src()
    const grades = [...s.matchAll(/gridTemplateColumns:\s*'([^']+)'/g)].map((m) => m[1])
    const comColunas = grades.filter((g) => g.includes('px') && g.includes('1fr'))
    // Cabeçalho e linha: as duas grades têm de casar, senão as colunas desalinham.
    expect(comColunas.length).toBeGreaterThanOrEqual(2)
    const colunas = comColunas.map((g) => g.trim().split(/\s+/).length)
    expect(new Set(colunas).size).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// §5 — a ordem do formulário
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('>>> §5 — condições de pagamento logo APÓS o valor total <<<', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const src = () => fs.readFileSync(path.join(process.cwd(), 'src/pages/fluxo-de-caixa/index.tsx'), 'utf8')

  /** Só o corpo do Drawer de despesa — a página inteira tem outros formulários. */
  const corpoDoDrawer = (s: string) => {
    const i = s.indexOf('Novo Lançamento de Despesa"')
    return s.slice(i, s.indexOf('</Drawer>', i))
  }

  it('>>> valor total → condições de pagamento → bloco de impostos, nesta ordem <<<', () => {
    const c = corpoDoDrawer(src())
    const valorTotal = c.indexOf('label="Valor Total"')
    const pagamento = c.indexOf('name="payment_method"')
    const impostos = c.indexOf('<PurchaseTaxCredits')
    expect(valorTotal).toBeGreaterThan(-1)
    expect(pagamento).toBeGreaterThan(-1)
    expect(impostos).toBeGreaterThan(-1)
    expect(pagamento).toBeGreaterThan(valorTotal)
    // É ESTA a comparação que a ordem de hoje reprova: o método de pagamento vinha DEPOIS.
    expect(impostos).toBeGreaterThan(pagamento)
  })

  it('>>> e o vencimento da 1ª parcela vem junto das condições, não depois dos impostos <<<', () => {
    const c = corpoDoDrawer(src())
    expect(c.indexOf('Datas e valores de vencimento')).toBeLessThan(c.indexOf('<PurchaseTaxCredits'))
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O FORMATO É POR LINHA — e um caso que a troca de UMA linha não arrasta as outras
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('O seletor é POR LINHA', () => {
  it('>>> trocar o formato do ICMS não muda o do PIS/COFINS <<<', () => {
    const estado: Partial<Record<TributoCreditavel, FormatoDaEntrada>> = { ICMS: 'BRL' }
    expect(estado.ICMS).toBe('BRL')
    expect(entradaParaReabertura({ aliquotaPct: 9.25, formato: estado.PIS_COFINS ?? null }, 8200).formato).toBe('PCT')
  })

  it('>>> e o imposto calculado é o mesmo com formatos MISTOS <<<', () => {
    const icmsDeValor = aliquotaAPartirDoValor(1800, baseDoTributo(NOTA, 'ICMS'))
    const misto = apurar({ ...NOTA, icmsPct: icmsDeValor })
    const todoPct = apurar(NOTA)
    expect(misto.icms).toBeCloseTo(todoPct.icms ?? 0, 2)
    expect(misto.pisCofins).toBeCloseTo(todoPct.pisCofins ?? 0, 2)
  })
})
