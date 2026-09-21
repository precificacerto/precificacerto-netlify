/**
 * O ORÁCULO DO COMANDO DE 21/09/2026 — §7, casos A a F.
 *
 *   > Na LC 214/2025 quase toda aquisição para a atividade gera crédito (água, luz, telefone,
 *   > aluguel, frete, serviços tomados). Se o crédito só existir em matéria-prima, o custo
 *   > efetivo do resto fica inflado e o preço sai errado.
 *
 * >>> O QUE ESTE ARQUIVO PRECISA DISTINGUIR <<<
 *
 * O caso A não pode se contentar em afirmar que "o cabeçalho tem um número". O defeito que o
 * §2 corrige é o cabeçalho exibir o BRUTO — e o bruto também é um número, também bate com o
 * caixa, e também fecha consigo mesmo. Por isso todo caso do cabeçalho afirma os DOIS: que
 * ele é o líquido E que ele NÃO é o bruto, com os dois valores medidos no banco.
 * (`teste-que-nao-exercita.md`, variante 2.)
 */
import {
  montarBlocoDeCustoDosProdutos,
  detalheDoCreditoPorTributo,
  LINHAS_DE_APRESENTACAO_DO_CUSTO,
  DETALHE_DO_CREDITO_POR_TRIBUTO,
  ordemDaLinhaDeApresentacao,
} from '@/utils/custo-produtos-no-dre'
import { naturezaDaDespesa, temBlocoDeImpostos } from '@/utils/natureza-da-despesa'
import {
  mesDoCredito, cardsDoPeriodo, situacaoDaNota, filtrarNotas, creditoTotalDaNota,
  SPLIT_PAYMENT_DESLIGADO, type NotaDeCompra,
} from '@/utils/creditos-do-periodo'
import {
  apurarMes, competenciaSugerida, guiaEntraNaApuracao, TRIBUTOS_QUE_SAO_DESPESA,
} from '@/utils/apuracao-de-tributos'
import { resolverFlagsDoItem, calcularCustoDoItem } from '@/utils/custo-liquido-do-item'

const r2 = (v: number) => Math.round(v * 100) / 100

// ─────────────────────────────────────────────────────────────────────────────────────────
// A — Hub: o cabeçalho passa a ser o LÍQUIDO. Dados reais da Esquadrias De Paula, jan/26.
// ─────────────────────────────────────────────────────────────────────────────────────────

const FATURAMENTO = 357399.47
const BRUTO = 184628.50
const CREDITOS = 35543.88
const LIQUIDO = 149084.62

describe('A — o cabeçalho do Custo dos Produtos é o LÍQUIDO', () => {
  const bloco = montarBlocoDeCustoDosProdutos({
    valorBrutoPago: BRUTO, creditoRecuperavel: CREDITOS, regime: 'LUCRO_REAL',
  })

  it('>>> o cabeçalho exibe 149.084,62 (41,71%), e NÃO os 184.628,50 (51,66%) <<<', () => {
    expect(bloco.totalExibidoNoCabecalho).toBeCloseTo(LIQUIDO, 2)
    expect(bloco.totalExibidoNoCabecalho).not.toBeCloseTo(BRUTO, 2)
    expect(r2((bloco.totalExibidoNoCabecalho / FATURAMENTO) * 100)).toBeCloseTo(41.71, 2)
    expect(r2((BRUTO / FATURAMENTO) * 100)).toBeCloseTo(51.66, 2)
    expect(r2((CREDITOS / FATURAMENTO) * 100)).toBeCloseTo(9.95, 2)
  })

  it('>>> e o RESULTADO DO MÊS continua o bruto pago — as duas perguntas são outras <<<', () => {
    expect(bloco.totalNoResultado).toBeCloseTo(BRUTO, 2)
    expect(bloco.totalNoResultado).not.toBeCloseTo(LIQUIDO, 2)
    // Cabeçalho e resultado divergem em exatamente o crédito. É a asserção que quebra tanto
    // se alguém levar o líquido para o resultado quanto se levar o bruto para o cabeçalho.
    expect(bloco.totalNoResultado - bloco.totalExibidoNoCabecalho).toBeCloseTo(CREDITOS, 2)
  })

  it('as três linhas de dentro somam o cabeçalho, e só a do bruto entra no resultado', () => {
    const [bruto, creditos, liquido] = bloco.linhas
    expect(bruto.valor).toBeCloseTo(BRUTO, 2)
    expect(creditos.valor).toBeCloseTo(-CREDITOS, 2)
    expect(liquido.valor).toBeCloseTo(LIQUIDO, 2)
    expect(bruto.apenasApresentacao).toBe(false)
    expect(creditos.apenasApresentacao).toBe(true)
    expect(liquido.apenasApresentacao).toBe(true)
  })

  it('>>> o LÍQUIDO é a CABEÇA do bloco: menor ordem que o bruto e que os créditos <<<', () => {
    expect(LINHAS_DE_APRESENTACAO_DO_CUSTO.liquido.ordem)
      .toBeLessThan(LINHAS_DE_APRESENTACAO_DO_CUSTO.bruto.ordem)
    expect(LINHAS_DE_APRESENTACAO_DO_CUSTO.bruto.ordem)
      .toBeLessThan(LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.ordem)
    expect(LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.ordem)
      .toBeLessThan(DETALHE_DO_CREDITO_POR_TRIBUTO.icms.ordem)
  })

  it('sem crédito, cabeçalho e resultado coincidem — e é por isso que A precisa de um mês COM', () => {
    const semCredito = montarBlocoDeCustoDosProdutos({
      valorBrutoPago: BRUTO, creditoRecuperavel: 0, regime: 'LUCRO_REAL',
    })
    expect(semCredito.totalExibidoNoCabecalho).toBeCloseTo(semCredito.totalNoResultado, 10)
  })
})

/**
 * OS OITO MESES DA DE PAULA, medidos no banco em 21/09/2026 com a régua do HUB (INCOME sem
 * boleto/cheque pendente; EXPENSE só com `paid_date`).
 *
 * É o critério do §9: *"o resultado do mês não muda em nenhum mês da De Paula (prove com os
 * 8 meses)"*. Um caso com um mês só não distinguiria a implementação certa da que troca os
 * dois campos em algum caminho — e é por isso que os oito estão aqui, e não um.
 */
const DE_PAULA: { mes: string; receita: number; bruto: number; creditos: number }[] = [
  { mes: '2026-01', receita: 357399.47, bruto: 184628.50, creditos: 35543.88 },
  { mes: '2026-02', receita: 219456.39, bruto: 137737.86, creditos: 25598.55 },
  { mes: '2026-03', receita: 297639.07, bruto: 156196.83, creditos: 25001.93 },
  { mes: '2026-04', receita: 303991.20, bruto: 200702.71, creditos: 30667.81 },
  { mes: '2026-05', receita: 310745.63, bruto: 193836.40, creditos: 7300.77 },
  { mes: '2026-06', receita: 458323.83, bruto: 246221.99, creditos: 50114.29 },
  { mes: '2026-07', receita: 426226.38, bruto: 236743.45, creditos: 44608.23 },
  { mes: '2026-08', receita: 418923.62, bruto: 257908.19, creditos: 39475.53 },
]

describe.each(DE_PAULA)('A.1 — De Paula $mes: o cabeçalho muda, o resultado NÃO', ({ receita, bruto, creditos }) => {
  const b = montarBlocoDeCustoDosProdutos({
    valorBrutoPago: bruto, creditoRecuperavel: creditos, regime: 'LUCRO_REAL',
  })

  it('>>> o que entra no resultado é o BRUTO, ao centavo <<<', () => {
    expect(b.totalNoResultado).toBeCloseTo(bruto, 2)
  })

  it('>>> e o cabeçalho é o líquido, que é OUTRO número <<<', () => {
    expect(b.totalExibidoNoCabecalho).toBeCloseTo(bruto - creditos, 2)
    expect(b.totalExibidoNoCabecalho).toBeLessThan(b.totalNoResultado)
  })

  it('o percentual do cabeçalho é menor que o do bruto, e a diferença é o crédito', () => {
    const pctCabecalho = (b.totalExibidoNoCabecalho / receita) * 100
    const pctBruto = (bruto / receita) * 100
    expect(pctBruto - pctCabecalho).toBeCloseTo((creditos / receita) * 100, 6)
  })
})

describe('A.2 — o detalhe POR TRIBUTO, a pendência que o #68 deixou aberta', () => {
  const TRIBUTOS = { icms: 180, pis: 16.5, cofins: 76, ipi: 50, cbs: 88, ibs: 1 }

  it('cinco linhas, PIS e COFINS somados numa só, na ordem da apuração', () => {
    const d = detalheDoCreditoPorTributo(TRIBUTOS, 'LUCRO_REAL')
    expect(d.map((x) => x.label)).toEqual(['ICMS', 'PIS/COFINS', 'IPI', 'CBS', 'IBS'])
    expect(d.map((x) => x.valor)).toEqual([180, 92.5, 50, 88, 1])
    expect(d.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(411.5, 2)
  })

  it('>>> no Híbrido só CBS e IBS têm linha — o detalhe LÊ o regime, não infere <<<', () => {
    const d = detalheDoCreditoPorTributo(TRIBUTOS, 'SIMPLES_HIBRIDO')
    expect(d.map((x) => x.label)).toEqual(['CBS', 'IBS'])
    expect(d.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(89, 2)
  })

  it('>>> tributo com crédito ZERO não vira linha de R$ 0,00 <<<', () => {
    const d = detalheDoCreditoPorTributo({ icms: 180, ipi: 0, cbs: null }, 'LUCRO_REAL')
    expect(d.map((x) => x.label)).toEqual(['ICMS'])
  })

  it('em Simples e MEI não há linha nenhuma', () => {
    expect(detalheDoCreditoPorTributo(TRIBUTOS, 'SIMPLES_NACIONAL')).toEqual([])
    expect(detalheDoCreditoPorTributo(TRIBUTOS, 'MEI')).toEqual([])
  })

  it('as cinco chaves têm ordem própria, e ela vem DEPOIS da linha-mãe', () => {
    for (const d of Object.values(DETALHE_DO_CREDITO_POR_TRIBUTO)) {
      expect(ordemDaLinhaDeApresentacao(d.key)).toBe(d.ordem)
      expect(d.ordem).toBeGreaterThan(LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.ordem)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
// B, C, D — o bloco de impostos em TODA despesa
// ─────────────────────────────────────────────────────────────────────────────────────────

/** A MESMA função pura do cadastro de item. Reimplementar aqui seria a cópia divergente. */
function custoDaDespesa(args: {
  valor: number
  category: string
  group: string
  regime?: string
  segmento?: string
  icmsPct?: number
  pisCofinsPct?: number
}) {
  const nat = naturezaDaDespesa(args.category, args.group)
  const ctx = {
    regime: args.regime ?? 'LUCRO_REAL',
    segmento: args.segmento ?? 'INDUSTRIALIZACAO',
    destinacao: nat.destinacao,
  }
  const bandeiras = resolverFlagsDoItem(ctx, {})
  const custo = calcularCustoDoItem(
    { base: args.valor, icmsPct: args.icmsPct ?? null, pisCofinsPct: args.pisCofinsPct ?? null },
    bandeiras,
  )
  return { nat, bandeiras, custo }
}

describe('B — despesa COM crédito: energia na indústria', () => {
  const { nat, bandeiras, custo } = custoDaDespesa({
    valor: 1000, category: 'Energia Elétrica', group: 'DESPESA_FIXA',
    icmsPct: 25, pisCofinsPct: 9.25,
  })

  it('o bloco existe, e os dois botões nascem LIGADOS', () => {
    expect(nat.estado).toBe('COM_CREDITO')
    expect(bandeiras.ICMS.ativo).toBe(true)
    expect(bandeiras.PIS_COFINS.ativo).toBe(true)
  })

  it('>>> ICMS 250,00 · PIS/COFINS 69,38 · crédito 319,38 · LÍQUIDO 680,62 <<<', () => {
    expect(custo.creditos.ICMS).toBeCloseTo(250, 2)
    // A base do PIS/COFINS é o valor MENOS o ICMS destacado: (1.000 − 250) × 9,25%.
    expect(custo.creditos.PIS_COFINS).toBeCloseTo(69.38, 2)
    expect(custo.creditoTotal).toBeCloseTo(319.38, 2)
    expect(custo.custoLiquido).toBeCloseTo(680.62, 2)
  })

  it('>>> o % do que foi pago é 31,94% — é o card novo do rodapé <<<', () => {
    expect(r2((custo.creditoTotal / custo.custoBruto) * 100)).toBeCloseTo(31.94, 2)
  })

  it('>>> e o líquido NÃO é o bruto: sem a Parte 2, 1.000,00 entrariam no custo <<<', () => {
    expect(custo.custoLiquido).not.toBeCloseTo(1000, 2)
  })
})

describe('C — despesa SEM crédito: folha', () => {
  it('>>> o bloco NÃO existe — e ausência não é um bloco zerado <<<', () => {
    for (const [cat, grp] of [
      ['Salários Produção', 'MAO_DE_OBRA_PRODUTIVA'],
      ['Pró Labore', 'MAO_DE_OBRA_ADMINISTRATIVA'],
      ['FGTS (Setor Produtivo)', 'MAO_DE_OBRA_PRODUTIVA'],
      ['INSS (Pró-Labo/ Admin/ Comer)', 'MAO_DE_OBRA_ADMINISTRATIVA'],
    ]) {
      expect(temBlocoDeImpostos(cat, grp)).toBe(false)
      expect(naturezaDaDespesa(cat, grp).estado).toBe('SEM_BLOCO')
    }
  })

  it('o custo é o valor cheio: 10.000,00 entram inteiros', () => {
    const { custo } = custoDaDespesa({ valor: 10000, category: 'Salários Produção', group: 'MAO_DE_OBRA_PRODUTIVA' })
    expect(custo.creditoTotal).toBeCloseTo(0, 2)
    expect(custo.custoLiquido).toBeCloseTo(10000, 2)
  })

  it('>>> uma rubrica de folha que ninguém cadastrou aqui TAMBÉM nasce sem bloco <<<', () => {
    // O grupo decide antes da categoria. Uma lista nominal deixaria a próxima rubrica de
    // fora e o bloco apareceria numa folha de pagamento.
    expect(temBlocoDeImpostos('Rubrica que ainda não existe', 'MAO_DE_OBRA_PRODUTIVA')).toBe(false)
  })

  it('multa, juros e tarifa bancária também ficam sem bloco', () => {
    expect(temBlocoDeImpostos('Juros', 'DESPESA_FINANCEIRA')).toBe(false)
    expect(temBlocoDeImpostos('Taxas Bancárias', 'DESPESA_FINANCEIRA')).toBe(false)
  })
})

describe('D — uso pessoal: o bloco EXISTE, desligado e travado', () => {
  const nat = naturezaDaDespesa('Bens de uso pessoal', 'DESPESA_VARIAVEL')

  it('>>> `VEDADO` não é `SEM_BLOCO`: aqui HÁ imposto, e a lei proíbe o crédito <<<', () => {
    expect(nat.estado).toBe('VEDADO')
    expect(nat.estado).not.toBe('SEM_BLOCO')
    expect(temBlocoDeImpostos('Bens de uso pessoal', 'DESPESA_VARIAVEL')).toBe(true)
  })

  it('e o motivo cita o artigo — restrição sem razão citada não se sustenta', () => {
    expect(nat.motivo).toContain('art. 57')
  })

  it('o líquido é o valor cheio: 500,00', () => {
    const { custo } = custoDaDespesa({ valor: 500, category: 'Bens de uso pessoal', group: 'DESPESA_VARIAVEL' })
    expect(custo.custoLiquido).toBeCloseTo(500, 2)
  })
})

describe('A natureza da despesa — a tabela do §3, lida e não inferida', () => {
  it.each([
    ['Matéria Prima - Base dos produtos', 'CUSTO_PRODUTOS', 'COM_CREDITO', 'INSUMO'],
    ['Fornecedores - Produtos para Revenda', 'CUSTO_PRODUTOS', 'COM_CREDITO', 'REVENDA'],
    ['Energia Elétrica', 'DESPESA_FIXA', 'COM_CREDITO', 'INSUMO'],
    ['Água / Esgoto', 'DESPESA_FIXA', 'COM_CREDITO', 'USO_CONSUMO'],
    ['Aluguel', 'DESPESA_FIXA', 'COM_CREDITO', 'USO_CONSUMO'],
    ['Manutenções', 'DESPESA_VARIAVEL', 'COM_CREDITO', 'USO_CONSUMO'],
  ])('%s → %s / %s', (cat, grp, estado, destinacao) => {
    const n = naturezaDaDespesa(cat, grp)
    expect(n.estado).toBe(estado)
    expect(n.destinacao).toBe(destinacao)
  })

  it('>>> ENERGIA é INSUMO e ÁGUA é USO E CONSUMO — e a diferença tem efeito medido <<<', () => {
    // Energia consumida no processo industrial credita ICMS (LC 87/1996 art. 33, II, "b");
    // água não tem essa previsão. Em USO_CONSUMO o padrão liga CBS e IBS e deixa ICMS e
    // PIS/COFINS desligados COM BOTÃO.
    const energia = custoDaDespesa({ valor: 1000, category: 'Energia Elétrica', group: 'DESPESA_FIXA', icmsPct: 25 })
    const agua = custoDaDespesa({ valor: 1000, category: 'Água / Esgoto', group: 'DESPESA_FIXA', icmsPct: 25 })
    expect(energia.bandeiras.ICMS.ativo).toBe(true)
    expect(agua.bandeiras.ICMS.ativo).toBe(false)
    expect(agua.bandeiras.ICMS.vedado).toBe(false)   // desligado, NÃO vedado: há botão
    expect(energia.custo.custoLiquido).toBeCloseTo(750, 2)
    expect(agua.custo.custoLiquido).toBeCloseTo(1000, 2)
  })

  it('categoria desconhecida em grupo creditável não inventa crédito de ICMS', () => {
    const n = naturezaDaDespesa('Categoria que ninguém classificou', 'DESPESA_VARIAVEL')
    expect(n.estado).toBe('COM_CREDITO')
    expect(n.destinacao).toBe('USO_CONSUMO')
  })

  it('>>> guia de imposto não é aquisição: o grupo IMPOSTO fica sem bloco <<<', () => {
    expect(temBlocoDeImpostos('Imposto ICMS', 'IMPOSTO')).toBe(false)
    expect(naturezaDaDespesa('Imposto ICMS', 'IMPOSTO').motivo).toContain('quadro de apuração')
  })
})

describe('>>> O QUE VAI PARA `valor_*` É O CRÉDITO, NÃO O DESTACADO <<<', () => {
  /**
   * O HUB soma os seis `valor_*` e os DEDUZ (`creditoRecuperavelDaCompra`). Gravar o
   * destacado de um tributo cujo botão está DESLIGADO faria o Hub deduzir um crédito que o
   * usuário disse não ter — e o custo líquido da tela diria uma coisa e o cabeçalho do Hub
   * outra, sem nada acusar.
   */
  const comIcmsDesligado = () => {
    const nat = naturezaDaDespesa('Água / Esgoto', 'DESPESA_FIXA')
    const ctx = { regime: 'LUCRO_REAL', segmento: 'INDUSTRIALIZACAO', destinacao: nat.destinacao }
    const bandeiras = resolverFlagsDoItem(ctx, {})
    return calcularCustoDoItem({ base: 1000, icmsPct: 25 }, bandeiras)
  }

  it('o DESTACADO existe e vale 250,00 — a nota tem ICMS', () => {
    expect(comIcmsDesligado().valores.icms).toBeCloseTo(250, 2)
  })

  it('>>> e o CRÉDITO é zero: é este o número que o Hub pode deduzir <<<', () => {
    expect(comIcmsDesligado().creditos.ICMS).toBeCloseTo(0, 2)
    expect(comIcmsDesligado().creditos.ICMS).not.toBeCloseTo(250, 2)
  })

  it('ligar o botão move o crédito, e só ele — o destacado não muda', () => {
    const ctx = { regime: 'LUCRO_REAL', segmento: 'INDUSTRIALIZACAO', destinacao: 'USO_CONSUMO' as const }
    const ligado = calcularCustoDoItem({ base: 1000, icmsPct: 25 }, resolverFlagsDoItem(ctx, { ICMS: true }))
    expect(ligado.valores.icms).toBeCloseTo(250, 2)
    expect(ligado.creditos.ICMS).toBeCloseTo(250, 2)
    expect(ligado.custoLiquido).toBeCloseTo(750, 2)
  })

  it('>>> sem bloco, NENHUM dos seis é gravado — `null` não é zero <<<', () => {
    // A ausência do bloco é a única forma de não afirmar nada. Gravar seis zeros numa folha
    // de pagamento afirma que houve imposto e ele deu zero.
    expect(temBlocoDeImpostos('Salários Produção', 'MAO_DE_OBRA_PRODUTIVA')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
// E — o quadro de apuração
// ─────────────────────────────────────────────────────────────────────────────────────────

describe('E — apuração do ICMS em agosto', () => {
  it('>>> guia 12.000,00 + crédito 23.315,15 → débito 35.315,15; a recolher 12.000,00 <<<', () => {
    const a = apurarMes({ guia: 12000, credito: 23315.15, saldoCredorAnterior: 0 })
    expect(a.debito).toBeCloseTo(35315.15, 2)
    expect(a.aRecolher).toBeCloseTo(12000, 2)
    expect(a.saldoCredorATransportar).toBeCloseTo(0, 2)
    expect(a.alertaGuiaFaltando).toBe(false)
  })

  it('>>> crédito 40.000,00 com guia ZERO: a recolher 0,00 e saldo credor a transportar <<<', () => {
    // Com guia zero o débito é 40.000,00 (guia + crédito), a recolher é zero e o que sobra é
    // `crédito − débito` = 0 — a conta fecha em si mesma, e é o que a fórmula do §5 diz.
    const a = apurarMes({ guia: 0, credito: 40000, saldoCredorAnterior: 0 })
    expect(a.aRecolher).toBeCloseTo(0, 2)
    expect(a.debito).toBeCloseTo(40000, 2)
    expect(a.saldoCredorATransportar).toBeCloseTo(40000 - (a.debito as number), 2)
  })

  it('o saldo credor anterior reduz o a recolher, e o que sobra transporta', () => {
    const a = apurarMes({ guia: 5000, credito: 10000, saldoCredorAnterior: 3000, saldoCredorAtual: 0 })
    expect(a.debito).toBeCloseTo(5000 + 10000 + 3000, 2)
    expect(a.aRecolher).toBeCloseTo(5000, 2)
  })

  it('>>> SEM GUIA o débito é `null`, não zero — e o alerta acende <<<', () => {
    // Zero afirmaria que não houve operação no mês. O que há é lançamento faltando.
    const a = apurarMes({ guia: null, credito: 23315.15, saldoCredorAnterior: 0 })
    expect(a.debito).toBeNull()
    expect(a.aRecolher).toBeNull()
    expect(a.alertaGuiaFaltando).toBe(true)
    expect(a.saldoCredorATransportar).toBeCloseTo(23315.15, 2)
  })

  it('sem guia E sem crédito não há alerta: aí o mês realmente não teve nada', () => {
    expect(apurarMes({ guia: null, credito: 0, saldoCredorAnterior: 0 }).alertaGuiaFaltando).toBe(false)
  })
})

describe('A COMPETÊNCIA sugerida é o mês ANTERIOR ao vencimento', () => {
  it.each([['2026-09-20', '2026-08'], ['2026-01-10', '2025-12'], ['2026-03-31', '2026-02']])(
    'vence em %s → competência %s', (venc, esperado) => {
      expect(competenciaSugerida(venc)).toBe(esperado)
    })

  it('>>> sem vencimento não se sugere competência — `null` entra, `null` sai <<<', () => {
    expect(competenciaSugerida(null)).toBeNull()
    expect(competenciaSugerida('')).toBeNull()
  })
})

describe('>>> QUEM APURA E QUEM É DESPESA — §5, lido e não deduzido <<<', () => {
  it.each(['ICMS', 'PIS', 'COFINS', 'IPI', 'CBS', 'IBS'])('%s principal apura', (t) => {
    expect(guiaEntraNaApuracao(t, 'principal')).toBe(true)
    expect(guiaEntraNaApuracao(t, 'complementar')).toBe(true)
  })

  it.each(['retificadora', 'multa_juros', 'parcelamento'])('ICMS %s NÃO apura', (tipo) => {
    // A retificadora SUBSTITUI outra: somá-la contaria o mesmo período duas vezes.
    expect(guiaEntraNaApuracao('ICMS', tipo)).toBe(false)
  })

  it.each([...TRIBUTOS_QUE_SAO_DESPESA])('%s é despesa, e não apura nem como principal', (t) => {
    expect(guiaEntraNaApuracao(t, 'principal')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
// A aba Créditos — o momento do crédito
// ─────────────────────────────────────────────────────────────────────────────────────────

const nota = (over: Partial<NotaDeCompra> = {}): NotaDeCompra => ({
  id: 'n1', invoiceNumber: '123', supplierName: 'Fornecedor A',
  expenseNature: 'INSUMO', expenseCategory: 'Matéria Prima - Base dos produtos',
  totalAmount: 1000, creditDate: '2026-08-10', creditDateEstimated: false,
  settlementDate: '2026-09-05', origin: 'NOVO',
  creditos: { ICMS: 180, PIS_COFINS: 92.5, IPI: 50, CBS: 88, IBS: 1 },
  ...over,
})

describe('O MOMENTO do crédito — art. 48 enquanto o split payment não operar', () => {
  it('>>> com o split DESLIGADO, os cinco creditam no mês da NOTA <<<', () => {
    for (const t of ['ICMS', 'PIS_COFINS', 'IPI', 'CBS', 'IBS'] as const) {
      expect(mesDoCredito(nota(), t, SPLIT_PAYMENT_DESLIGADO)).toBe('2026-08')
    }
  })

  it('>>> ligado, CBS e IBS passam para o mês da LIQUIDAÇÃO; os outros três não mudam <<<', () => {
    const split = { ativo: true, inicio: '2026-01-01' }
    expect(mesDoCredito(nota(), 'ICMS', split)).toBe('2026-08')
    expect(mesDoCredito(nota(), 'CBS', split)).toBe('2026-09')
    expect(mesDoCredito(nota(), 'IBS', split)).toBe('2026-09')
  })

  it('o split só vale para notas a partir do início — antes dele, mês da nota', () => {
    const split = { ativo: true, inicio: '2026-09-01' }
    expect(mesDoCredito(nota(), 'CBS', split)).toBe('2026-08')
  })

  it('>>> sem data de liquidação sob split, o mês é `null` — não se chuta competência <<<', () => {
    const split = { ativo: true, inicio: '2026-01-01' }
    expect(mesDoCredito(nota({ settlementDate: null }), 'CBS', split)).toBeNull()
  })

  it('nota sem data de crédito não credita em mês nenhum', () => {
    expect(mesDoCredito(nota({ creditDate: null }), 'ICMS')).toBeNull()
  })
})

describe('Os cards do mês, e o "A apropriar"', () => {
  it('somam por tributo e no total', () => {
    const c = cardsDoPeriodo([nota()], '2026-08')
    expect(c.porTributo.ICMS).toBeCloseTo(180, 2)
    expect(c.porTributo.PIS_COFINS).toBeCloseTo(92.5, 2)
    expect(c.total).toBeCloseTo(411.5, 2)
    expect(c.aApropriar).toBeCloseTo(0, 2)
    expect(creditoTotalDaNota(nota())).toBeCloseTo(411.5, 2)
  })

  it('>>> sob split sem liquidação, CBS e IBS saem do total e vão para "A apropriar" <<<', () => {
    const split = { ativo: true, inicio: '2026-01-01' }
    const c = cardsDoPeriodo([nota({ settlementDate: null })], '2026-08', split)
    expect(c.total).toBeCloseTo(322.5, 2)
    expect(c.aApropriar).toBeCloseTo(89, 2)
  })

  it('os tributos da MESMA nota podem cair em meses diferentes', () => {
    const split = { ativo: true, inicio: '2026-01-01' }
    expect(cardsDoPeriodo([nota()], '2026-08', split).total).toBeCloseTo(322.5, 2)
    expect(cardsDoPeriodo([nota()], '2026-09', split).total).toBeCloseTo(89, 2)
  })
})

describe('A situação e os filtros da aba', () => {
  it('>>> LEGADO vence as outras: a data ali foi DEDUZIDA, não informada <<<', () => {
    expect(situacaoDaNota(nota({ origin: 'LEGADO' }), '2026-08')).toBe('LEGADO')
    expect(situacaoDaNota(nota({ creditDateEstimated: true }), '2026-08')).toBe('LEGADO')
    expect(situacaoDaNota(nota(), '2026-08')).toBe('APROPRIADO')
    expect(situacaoDaNota(nota(), '2026-09')).toBe('A_APROPRIAR')
  })

  it.each([
    ['mês', { mes: '2026-08' }, 1],
    ['mês errado', { mes: '2026-07' }, 0],
    ['tributo presente', { tributo: 'ICMS' as const }, 1],
    ['fornecedor', { fornecedor: 'fornecedor a' }, 1],
    ['natureza', { natureza: 'INSUMO' }, 1],
    ['natureza errada', { natureza: 'REVENDA' }, 0],
  ])('filtro por %s devolve %s nota(s)', (_n, filtros, esperado) => {
    expect(filtrarNotas([nota()], filtros)).toHaveLength(esperado as number)
  })

  it('>>> filtrar por tributo que a nota não tem a exclui, e zero não é presença <<<', () => {
    expect(filtrarNotas([nota({ creditos: { ICMS: 0, CBS: 88 } })], { tributo: 'ICMS' })).toHaveLength(0)
    expect(filtrarNotas([nota({ creditos: { ICMS: 0, CBS: 88 } })], { tributo: 'CBS' })).toHaveLength(1)
  })
})
