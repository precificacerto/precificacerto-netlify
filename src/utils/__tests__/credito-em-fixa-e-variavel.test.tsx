/**
 * CRÉDITO DE IBS/CBS EM DESPESA FIXA E VARIÁVEL, E O TERCEIRIZADO — oráculos A–K do comando
 * do PO de 24/09/2026 (noite).
 *
 * >>> O QUE CADA GRUPO DE CASO PRECISA DISTINGUIR <<<
 *
 * O §3 é uma tabela de AUSÊNCIAS — nove categorias que deixam de abrir bloco. Um caso de
 * ausência por rótulo é o mais fácil de escrever verde sem exercitar nada: basta errar a
 * grafia e ele passa, porque a categoria desconhecida cai no padrão e o padrão… abre o
 * bloco. Não passa: o padrão é `COM_CREDITO`, e o caso afirma `SEM_BLOCO`. Uma grafia errada
 * faz o caso FALHAR, que é exatamente o que se quer de nove rótulos copiados à mão — e o
 * caso J fixa o padrão para que essa proteção não dependa de sorte.
 *
 * O §1 é uma decisão de FORMA, e ela foi extraída para `formaDoBlocoFiscal` justamente para
 * ser medida como função pura, em vez de afirmada lendo o arquivo da tela. O caso C — "o
 * link revela" — é o que essa extração comprou: ele roda a decisão nos dois estados, em vez
 * de olhar para um `&&` no JSX.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Form } from 'antd'
import PurchaseTaxCredits from '@/page-parts/items/purchase-tax-credits.component'
import { resolverFlagsDoItem } from '@/utils/custo-liquido-do-item'
import { descascarANota } from '@/utils/nota-de-compra'
import { valorAPartirDaAliquota } from '@/utils/entrada-de-imposto'
import { naturezaDaDespesa, formaDoBlocoFiscal } from '@/utils/natureza-da-despesa'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const tela = () => ler('src/pages/fluxo-de-caixa/index.tsx')
const categorias = () => ler('src/constants/expense-categories-by-regime.ts')

const corpoDoDrawer = (s: string) => {
  const i = s.indexOf('Novo Lançamento de Despesa"')
  return s.slice(i, s.indexOf('</Drawer>', i))
}

const bandeirasDe = (destinacao: 'INSUMO' | 'USO_CONSUMO' | 'REVENDA') =>
  resolverFlagsDoItem({ regime: 'LUCRO_REAL', destinacao, segmento: 'INDUSTRIALIZACAO' }, {})

function textoDe(no: React.ReactNode): string {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => { createRoot(host).render(<Form layout="vertical">{no}</Form>) })
  const t = host.textContent ?? ''
  host.remove()
  return t
}

/** A forma compacta como a tela a monta: o MESMO componente, com `tributos` filtrando. */
const blocoCompacto = () => (
  <PurchaseTaxCredits
    modo="posicao" visivel semDestinacao semBlocoB semRodape semFornecedorDoSimples
    titulo="Crédito de IBS/CBS sobre esta despesa"
    tributos={['CBS', 'IBS']}
    bandeiras={bandeirasDe('USO_CONSUMO')}
    custo={null}
    leitura={{ CBS: 'R$ 88,00', IBS: 'R$ 177,00' }}
    onToggle={() => {}} onRecalc={() => {}}
  />
)

const forma = (categoria: string, grupo: string, revelado = false) =>
  formaDoBlocoFiscal(naturezaDaDespesa(categoria, grupo), revelado)

// ═════════════════════════════════════════════════════════════════════════════════════════
// A — ALUGUEL É COMPACTO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A — Aluguel: duas linhas, e nenhum degrau', () => {
  it('>>> a forma é COMPACTA <<<', () => {
    const n = naturezaDaDespesa('Aluguel', 'DESPESA_FIXA')
    expect(n.estado).toBe('COM_CREDITO')
    expect(n.destinacao).toBe('USO_CONSUMO')
    expect(forma('Aluguel', 'DESPESA_FIXA')).toBe('COMPACTA')
  })

  it('>>> e o bloco mostra CBS e IBS — e NADA de ICMS, PIS/COFINS ou IPI <<<', () => {
    const t = textoDe(blocoCompacto())
    expect(t).toContain('Crédito de IBS/CBS sobre esta despesa')
    expect(t).toContain('CBS')
    expect(t).toContain('IBS')
    expect(t).not.toContain('ICMS')
    expect(t).not.toContain('PIS/COFINS')
    expect(t).not.toContain('IPI')
  })

  it('>>> e a ESCADA inteira fica atrás de `!formaCompacta` <<<', () => {
    const c = corpoDoDrawer(tela())
    // Os degraus e os campos que só existem na nota de mercadoria.
    // Os nomes dos quatro campos de custo moram em `CAMPOS_DO_BLOCO_DE_CUSTO`, em escopo de
    // módulo — no corpo do drawer o que aparece é o `map` deles.
    for (const degrau of [
      'Reduções — não geram crédito',
      'linhaDoBloco1A(1)',
      'linhaDoBloco1A(2)',
      'valor_is',
      'Saldo (base para os demais tributos)',
      "tributos={['IPI', 'CBS', 'IBS']}",
      'Base dos produtos (vProd)',
      "tributos={['ICMS', 'PIS_COFINS']}",
      '<LinhaDaBaseManual',
      'CST do documento',
    ]) {
      expect(c.indexOf(degrau)).toBeGreaterThan(-1)
      expect(c.indexOf(degrau)).toBeGreaterThan(c.indexOf('{!formaCompacta && ('))
    }
    // E o bloco compacto vem ANTES da guarda — ele é o que sobra sem a escada.
    expect(c.indexOf("tributos={['CBS', 'IBS']}")).toBeLessThan(c.indexOf('{!formaCompacta && ('))
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// B e E — O QUE NÃO MUDOU
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B e E — matéria-prima e energia seguem COMPLETAS', () => {
  it('>>> Matéria Prima é INSUMO, e INSUMO é completo <<<', () => {
    expect(naturezaDaDespesa('Matéria Prima - Base dos produtos', 'DESPESA_VARIAVEL').destinacao).toBe('INSUMO')
    expect(forma('Matéria Prima - Base dos produtos', 'DESPESA_VARIAVEL')).toBe('COMPLETA')
  })

  it('>>> Energia Elétrica continua INSUMO — ela credita ICMS na indústria <<<', () => {
    // LC 87/1996 art. 33, II, "b". Empurrá-la para a compacta tiraria a linha do ICMS de
    // uma despesa que credita ICMS de verdade.
    expect(forma('Energia Elétrica', 'DESPESA_FIXA')).toBe('COMPLETA')
    expect(forma('Energia elétrica', 'DESPESA_FIXA')).toBe('COMPLETA')
  })

  it('>>> e REVENDA e VEDADO também ficam na completa <<<', () => {
    expect(forma('Fornecedores - Produtos para Revenda', 'DESPESA_VARIAVEL')).toBe('COMPLETA')
    // VEDADO tem destinação USO_CONSUMO, e mesmo assim não é compacto: o bloco continua
    // visível e travado, com o motivo. Sem esta linha, a guarda poderia ser só a destinação.
    expect(naturezaDaDespesa('Brindes', 'DESPESA_VARIAVEL').estado).toBe('VEDADO')
    expect(forma('Brindes', 'DESPESA_VARIAVEL')).toBe('COMPLETA')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C — O LINK REVELA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — o link do caso raro', () => {
  it('>>> revelado, o MESMO lançamento passa a COMPLETA <<<', () => {
    expect(forma('Aluguel', 'DESPESA_FIXA', false)).toBe('COMPACTA')
    expect(forma('Aluguel', 'DESPESA_FIXA', true)).toBe('COMPLETA')
  })

  it('>>> o link existe, e NÃO é preferência salva <<<', () => {
    const c = corpoDoDrawer(tela())
    expect(c).toContain('esta nota tem outros tributos')
    expect(c).toContain('setRevelarEscadaCompleta(true)')
    const s = tela()
    // Nasce falso, e volta a falso ao fechar o drawer. Nada de localStorage nem de coluna.
    expect(s).toContain('useState(false)')
    expect((s.match(/setRevelarEscadaCompleta\(false\)/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(s).not.toMatch(/localStorage[\s\S]{0,80}revelar/i)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — O CRÉDITO CHEGA AO BANCO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — aluguel de 1.000,00 credita 265,00', () => {
  it('>>> a base é o TOTAL: 8,80% e 17,70% dão 88,00 e 177,00 <<<', () => {
    // A travessia da borda, que é a MESMA que a linha usa para exibir o R$.
    expect(valorAPartirDaAliquota(8.8, 1000)).toBeCloseTo(88, 2)
    expect(valorAPartirDaAliquota(17.7, 1000)).toBeCloseTo(177, 2)

    const d = descascarANota({
      total: 1000,
      porFora: { cbs: { brl: 88 }, ibs: { brl: 177 } },
      bandeiras: bandeirasDe('USO_CONSUMO'),
    })
    expect(d.creditos.cbs).toBeCloseTo(88, 2)
    expect(d.creditos.ibs).toBeCloseTo(177, 2)
    expect(d.creditoTotal).toBeCloseTo(265, 2)
    expect(d.custoLiquido).toBeCloseTo(735, 2)
  })

  it('>>> e NÃO é a conta da nota de mercadoria, que daria outro número <<<', () => {
    // O par que discrimina. Mandando as MESMAS alíquotas como `pct`, o motor as trata como
    // por fora e descasca a base: 1.000 ÷ 1,265 = 790,51, e o crédito cai para 209,48.
    // É a conta certa para a nota de produto e a errada para a conta de luz — e sem este
    // caso, trocar `creditoSobreOTotal` por `entradaDe` passaria despercebido.
    const d = descascarANota({
      total: 1000,
      porFora: { cbs: { pct: 8.8 }, ibs: { pct: 17.7 } },
      bandeiras: bandeirasDe('USO_CONSUMO'),
    })
    expect(d.creditoTotal).toBeLessThan(215)
  })

  /**
   * ACRESCENTADO DEPOIS DE UMA MUTAÇÃO SOBREVIVER.
   *
   * Trocar `creditoSobreOTotal` por `entradaDe` no ramo compacto derruba o crédito de
   * R$ 265,00 para R$ 209,48 quando a linha está em `%` — e os dois casos acima continuavam
   * verdes, porque eles medem `descascarANota` direto, e não a FIAÇÃO da tela.
   *
   * >>> ESTE CASO AFIRMA CAMINHO, e é o caso-limite que a regra admite <<<
   * O efeito só existe renderizando a página, e a página exige sessão. O que dá para
   * afirmar daqui é QUAL das duas travessias o ramo compacto usa — e o nome é específico o
   * bastante para que a troca não passe.
   *
   * A armadilha, registrada porque ela quase escondeu o defeito: em modo `R$` as duas
   * travessias dão o MESMO número, porque `entradaDe` manda `{ brl }` e o valor informado
   * vence. A divergência só aparece em `%`. Um caso que exercitasse só o R$ seria verde
   * antes e depois da correção.
   */
  it('>>> e é `creditoSobreOTotal` que alimenta o ramo compacto, não `entradaDe` <<<', () => {
    const s = tela()
    const inicio = s.indexOf('descascarANota(formaCompacta ? {')
    const corte = s.indexOf('    } : {', inicio)
    const compacto = s.slice(inicio, corte)
    expect(compacto).toContain('cbs: creditoSobreOTotal(taxaCbs)')
    expect(compacto).toContain('ibs: creditoSobreOTotal(taxaIbs)')
    expect(compacto).not.toContain('entradaDe(')
    // E o ramo COMPLETO continua com a travessia dele — o par que separa as duas contas.
    const completo = s.slice(corte, s.indexOf('}), [', corte))
    expect(completo).toContain("entradaDe('CBS', taxaCbs)")
    expect(completo).not.toContain('creditoSobreOTotal')
  })

  it('>>> e a base da LINHA é a mesma que alimenta a conta — o total <<<', () => {
    // Converter por uma base e calcular por outra é o defeito que `entrada-de-imposto.ts`
    // existe para impedir, e no ramo compacto as duas são o total.
    const s = tela()
    expect(s).toContain('base={formaCompacta ? (totalDoLancamento ?? 0)')
    expect(s).toContain('valorAPartirDaAliquota(soNumero(aliquota), totalDoLancamento)')
  })

  it('>>> e a tela continua criando a nota quando há crédito <<<', () => {
    const s = tela()
    expect(s).toContain('temBlocoDeImposto && descascamentoDaNota.creditoTotal > 0')
    expect(s).toContain('credit_cbs')
    expect(s).toContain('credit_ibs')
    expect(s).toContain('purchase_invoices')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F e G — O TERCEIRIZADO, E O VETO QUE CONTINUA DE PÉ
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F e G — a exceção é nominal', () => {
  const TERCEIRIZADO = 'Mão de obra produtiva terceirizada — passível de crédito'

  it('>>> o terceirizado ABRE, na forma compacta <<<', () => {
    const n = naturezaDaDespesa(TERCEIRIZADO, 'MAO_DE_OBRA_PRODUTIVA')
    expect(n.estado).toBe('COM_CREDITO')
    expect(n.destinacao).toBe('USO_CONSUMO')
    expect(n.motivo).toBeNull()
    expect(forma(TERCEIRIZADO, 'MAO_DE_OBRA_PRODUTIVA')).toBe('COMPACTA')
  })

  it('>>> e o rótulo é o do sistema, caractere por caractere <<<', () => {
    // A exceção é NOMINAL: uma grafia diferente não atravessa. Se o rótulo aqui divergisse
    // do cadastrado, o caso acima passaria e a tela continuaria sem bloco.
    expect(categorias()).toContain(`{ category: '${TERCEIRIZADO}', group: 'MAO_DE_OBRA_PRODUTIVA' }`)
  })

  it('>>> o VETO DE GRUPO continua: categoria inventada no mesmo grupo NÃO abre <<<', () => {
    const n = naturezaDaDespesa('Salários da equipe nova que ninguém cadastrou', 'MAO_DE_OBRA_PRODUTIVA')
    expect(n.estado).toBe('SEM_BLOCO')
    expect(n.motivo).toBeTruthy()
  })

  it('>>> e as outras rubricas de folha seguem sem bloco <<<', () => {
    for (const c of ['Salários Produção', 'FGTS (Setor Produtivo)', 'Pró Labore']) {
      expect(naturezaDaDespesa(c, 'MAO_DE_OBRA_PRODUTIVA').estado).toBe('SEM_BLOCO')
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// H — AS NOVE DO §3
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('H — as nove que deixam de abrir bloco', () => {
  const NOVE: [string, string][] = [
    ['Depreciação', 'DESPESA_FIXA'],
    ['Impostos IPTU / IPVA', 'DESPESA_FIXA'],
    ['Taxas de Licenças', 'DESPESA_FIXA'],
    ['MEI (Microempreendedor Individual)', 'DESPESA_FIXA'],
    ['Horas Extras - Salários', 'DESPESA_VARIAVEL'],
    ['Recisões / Indenizações', 'DESPESA_FIXA'],
    ['Rescisões / Indenizações', 'DESPESA_VARIAVEL'],
    ['Saúde Trabalhista / Ocupacional', 'DESPESA_FIXA'],
    ['Saúde trabalhista / Ocupacional', 'DESPESA_FIXA'],
  ]

  it.each(NOVE)('>>> %s não tem bloco, e o motivo aparece <<<', (categoria, grupo) => {
    const n = naturezaDaDespesa(categoria, grupo)
    expect(n.estado).toBe('SEM_BLOCO')
    expect(n.motivo).toBeTruthy()
  })

  it.each(NOVE)('>>> e a grafia de %s é a do sistema <<<', (categoria) => {
    // >>> ESTE É O CASO QUE FAZ OS NOVE ACIMA VALEREM <<<
    // Nove rótulos copiados à mão, dois deles com erro de digitação preservado de propósito
    // ('Recisões' sem o "s", 'Saúde trabalhista' em minúscula). Sem esta conferência contra
    // a fonte, um erro meu de transcrição criaria uma chave que NUNCA é consultada — e os
    // casos acima continuariam verdes, porque eles leem a MESMA chave errada.
    expect(categorias()).toContain(`category: '${categoria}'`)
  })

  it('>>> Multas de Trânsito já era SEM e continua <<<', () => {
    expect(naturezaDaDespesa('Multas de Trânsito', 'DESPESA_VARIAVEL').estado).toBe('SEM_BLOCO')
  })

  it('>>> e a de MAO_DE_OBRA com travessão segue sem bloco pelo GRUPO <<<', () => {
    // 'Horas extras — Salários' (travessão) vive em MAO_DE_OBRA_PRODUTIVA e nunca teve
    // bloco. A do §3 é a de DESPESA_VARIAVEL, com hífen. São duas categorias, não uma.
    expect(naturezaDaDespesa('Horas extras — Salários', 'MAO_DE_OBRA_PRODUTIVA').estado).toBe('SEM_BLOCO')
    expect(categorias()).toContain("category: 'Horas extras — Salários'")
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// I — AS QUE ABREM, INCLUSIVE AS DUVIDOSAS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('I — Seguros e Viagens abrem, por decisão do PO', () => {
  const VIAGENS = [
    'Viagens (hotéis / passagens / alimentação / ETC)',
    'Viagens (hotéis / passagens / alimentação / etc)',
  ]

  it.each(['Seguros', 'Seguros imóveis e veículos', ...VIAGENS])('>>> %s abre, na compacta <<<', (c) => {
    expect(naturezaDaDespesa(c, 'DESPESA_FIXA').estado).toBe('COM_CREDITO')
    expect(forma(c, 'DESPESA_FIXA')).toBe('COMPACTA')
    expect(categorias()).toContain(`category: '${c}'`)
  })

  it.each(VIAGENS)('>>> e %s carrega o aviso do art. 57 <<<', (c) => {
    const aviso = naturezaDaDespesa(c, 'DESPESA_VARIAVEL').aviso
    expect(aviso).toContain('LC 214/2025 art. 57')
    expect(aviso).toContain('Hospedagem, passagem e alimentação')
  })

  it('>>> o aviso NÃO é o motivo, e Seguros não tem aviso <<<', () => {
    // O par que separa as duas coisas: `motivo` explica a ausência do crédito e é null aqui;
    // o aviso acompanha o bloco ABERTO. Sem esta linha, um `aviso` colado em toda categoria
    // passaria pelos casos acima.
    expect(naturezaDaDespesa(VIAGENS[0], 'DESPESA_VARIAVEL').motivo).toBeNull()
    expect(naturezaDaDespesa('Seguros', 'DESPESA_FIXA').aviso ?? null).toBeNull()
    expect(naturezaDaDespesa('Aluguel', 'DESPESA_FIXA').aviso ?? null).toBeNull()
  })

  it('>>> e a tela EXIBE o aviso, no bloco aberto <<<', () => {
    expect(corpoDoDrawer(tela())).toContain('naturezaDoLancamento.aviso')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// J — O PADRÃO, QUE É O QUE A PRÓXIMA CATEGORIA HERDA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('J — categoria desconhecida em fixa continua COM_CREDITO/USO_CONSUMO', () => {
  it('>>> e portanto COMPACTA <<<', () => {
    const n = naturezaDaDespesa('Uma categoria que ainda não existe', 'DESPESA_FIXA')
    expect(n.estado).toBe('COM_CREDITO')
    expect(n.destinacao).toBe('USO_CONSUMO')
    expect(forma('Uma categoria que ainda não existe', 'DESPESA_FIXA')).toBe('COMPACTA')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// K — NÃO-REGRESSÃO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('K — a tabela mudou, a conta não', () => {
  it('>>> o gabarito continua: saldo 1.060,00 · base 1.000,00 · crédito 315,85 · líquido 856,15 <<<', () => {
    const d = descascarANota({
      total: 1172,
      composicao: { frete: 100 },
      reducoes: { ipiCusto: 40, icmsSt: 50, difal: 18, fcp: 4 },
      porFora: { ipi: { brl: 60 } },
      valorIs: 50,
      porDentro: { icms: { brl: 180 }, pisCofins: { pct: 9.25 } },
      bandeiras: bandeirasDe('INSUMO'),
    })
    expect(d.saldo).toBeCloseTo(1060.0, 2)
    expect(d.base).toBeCloseTo(1000.0, 2)
    expect(d.creditoTotal).toBeCloseTo(315.85, 2)
    expect(d.custoLiquido).toBeCloseTo(856.15, 2)
  })

  it('>>> e a forma compacta não trouxe fórmula para a tela <<<', () => {
    const c = corpoDoDrawer(tela())
    expect(c).not.toMatch(/\*\s*\d+\s*\/\s*100/)
    // A conversão vem da borda, não de uma multiplicação escrita aqui.
    expect(tela()).toContain('valorAPartirDaAliquota(soNumero(aliquota), totalDoLancamento)')
  })
})
