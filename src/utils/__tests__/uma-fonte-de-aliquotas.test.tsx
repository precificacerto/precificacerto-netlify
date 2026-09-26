/**
 * O FORMULÁRIO DE ITEM TEM UMA FONTE SÓ, E O ESTOQUE GANHA "ADICIONAR ITEM" — oráculos A–J
 * do comando do PO de 26/09/2026.
 *
 * >>> POR QUE OS CASOS DE CÁLCULO RODAM O MOTOR, E NÃO O FORMULÁRIO <<<
 *
 * `NewItemForm` depende de contexto de autenticação e de device; renderizá-lo aqui exigiria
 * um andaime que testaria o andaime. Os casos B, D, E e F medem o que a mudança PODERIA ter
 * quebrado — a conta e os padrões — chamando `calcularCustoDoItem` com os mesmos valores
 * que o formulário monta, e leem o arquivo para afirmar QUAL campo alimenta cada um.
 *
 * Isso é declarado em vez de disfarçado: onde o caso afirma caminho, ele diz que afirma.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { calcularCustoDoItem, resolverFlagsDoItem } from '@/utils/custo-liquido-do-item'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const formulario = () => ler('src/page-parts/items/new-item-form.component.tsx')
const estoque = () => ler('src/pages/estoque/index.tsx')
const itens = () => ler('src/pages/itens/index.tsx')
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** O objeto `camposDeAliquota`, do nome dele até o `return` do componente. */
const blocoDosExtras = (s: string) => {
  const c = semComentario(s)
  return c.slice(c.indexOf('const camposDeAliquota'), c.indexOf('return (\n    <Form layout="vertical"'))
}

/** O recorte de fora do container: do início até a abertura de `<PurchaseTaxCredits`. */
const foraDoContainer = (s: string) => semComentario(s).slice(0, semComentario(s).indexOf('<PurchaseTaxCredits'))

const bandeiras = () =>
  resolverFlagsDoItem({ regime: 'LUCRO_REAL', destinacao: 'INSUMO', segmento: 'INDUSTRIALIZACAO' }, {})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A — NÃO HÁ LINHA LEGADA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A — as duas linhas legadas saíram', () => {
  it('>>> os rótulos das linhas de cima não existem mais em lugar nenhum <<<', () => {
    const s = semComentario(formulario())
    for (const rotulo of ['ICMS (%)', 'ICMS Deferido (%)', 'ICMS recuperáveis (%)', 'ICMS recuperável (%)', 'Impostos recuperáveis (%)', 'PIS/COFINS (%)']) {
      expect(s).not.toContain(rotulo)
    }
    // E os comentários que as nomeavam também.
    expect(s).not.toContain('Linha de impostos 1')
    expect(s).not.toContain('Linha de impostos 2 (Lucro Real)')
    expect(s).not.toContain('Linha de impostos 2 (Lucro Presumido)')
  })

  it('>>> e o PAR: os CAMPOS continuam, agora dentro do container <<<', () => {
    // Sem esta metade, apagar os campos junto com os rótulos passaria — e o item deixaria
    // de gravar alíquota nenhuma.
    const s = semComentario(formulario())
    for (const campo of ['icms_rate', 'icms_deferido_enabled', 'icms_deferido_rate', 'pis_cofins_rate']) {
      expect(s).toContain(campo)
    }
    expect(s).toContain('const camposDeAliquota')
    expect(s).toContain('extras={camposDeAliquota}')
    // Os dois de ICMS ficam DEPOIS do ponto em que as linhas legadas estavam: dentro do
    // objeto `extras`, que é montado logo antes do `return`.
    const fora = foraDoContainer(formulario())
    expect(fora.indexOf('name="icms_rate"')).toBeGreaterThan(fora.indexOf('const camposDeAliquota'))
  })

  it('>>> a linha do Simples Híbrido NÃO saiu — ela usa outros dois campos <<<', () => {
    // §3 nomeia `pis_cofins_rate`. `pis_rate` e `cofins_rate` do SH são outra coisa, e o
    // §6 proíbe remover o que não foi pedido.
    const s = formulario()
    expect(s).toContain('Linha de impostos 2 (Simples Híbrido)')
    expect(s).toContain('name="pis_rate"')
    expect(s).toContain('name="cofins_rate"')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// B — DENTRO DO CONTAINER DÁ PARA DIGITAR
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — os tributos aceitam entrada, e o crédito sai em R$', () => {
  it('>>> ICMS 18%, PIS/COFINS 9,25% e IPI 5% sobre R$ 1.000,00 <<<', () => {
    const r = calcularCustoDoItem(
      { base: 1000, icmsPct: 18, pisCofinsPct: 9.25, ipiPct: 5 },
      bandeiras(),
    )
    expect(r.creditos.ICMS).toBeCloseTo(180, 2)
    // A base do PIS/COFINS é `base − ICMS destacado`: 1.000 − 180 = 820.
    expect(r.creditos.PIS_COFINS).toBeCloseTo(75.85, 2)
    expect(r.creditoTotal).toBeCloseTo(180 + 75.85 + r.creditos.IPI, 2)
  })

  it('>>> e cada um dos cinco tem onde ser digitado <<<', () => {
    const s = semComentario(formulario())
    // ICMS e PIS/COFINS pela costura `extras`, que é a novidade.
    const extras = blocoDosExtras(formulario())
    expect(extras).toContain('name="icms_rate"')
    expect(extras).toContain('pis_cofins_rate')
    // CBS e IBS já eram editáveis, pelo campo padrão do próprio container.
    const container = ler('src/page-parts/items/purchase-tax-credits.component.tsx')
    expect(container).toContain("name={t === 'CBS' ? 'cbs_rate' : 'ibs_rate'}")
    // O IPI é `ipi_nr_pct`, e continua no bloco de custo — ver a ressalva no corpo do PR.
    expect(s).toContain('name="ipi_nr_pct"')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C — A DESTINAÇÃO APARECE UMA VEZ
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — a destinação já era única, e continua', () => {
  it('>>> ela mora no container, e o formulário não tem uma segunda <<<', () => {
    const container = ler('src/page-parts/items/purchase-tax-credits.component.tsx')
    expect((container.match(/name="destination"/g) ?? []).length).toBe(1)
    expect(formulario()).not.toContain('name="destination"')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — DIFERIMENTO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — ICMS 18% com 60% deferido', () => {
  it('>>> o efetivo é 7,20%, e é ele que credita <<<', () => {
    const efetivo = 18 * (1 - 60 / 100)
    expect(efetivo).toBeCloseTo(7.2, 4)
    const r = calcularCustoDoItem(
      { base: 1000, icmsPct: efetivo, pisCofinsPct: 9.25 },
      bandeiras(),
    )
    expect(r.creditos.ICMS).toBeCloseTo(72, 2)
    // E a base do PIS/COFINS é `base − ICMS efetivo` = 928.
    expect(r.creditos.PIS_COFINS).toBeCloseTo(928 * 0.0925, 2)
  })

  it('>>> o par: sem diferimento o mesmo item credita 180,00 <<<', () => {
    const r = calcularCustoDoItem({ base: 1000, icmsPct: 18, pisCofinsPct: 9.25 }, bandeiras())
    expect(r.creditos.ICMS).toBeCloseTo(180, 2)
  })

  it('>>> e a leitura do efetivo acompanha o CAMPO, na linha do ICMS <<<', () => {
    const extras = blocoDosExtras(formulario())
    const linhaDoIcms = extras.slice(extras.indexOf('ICMS: ('), extras.indexOf('PIS_COFINS: ('))
    expect(linhaDoIcms).toContain('name="icms_rate"')
    expect(linhaDoIcms).toContain('name="icms_deferido_rate"')
    expect(linhaDoIcms).toContain('{leituraDoIcmsEfetivo}')
    // A leitura vem DEPOIS do campo: com ela ocupando a linha, o campo desalinharia.
    expect(linhaDoIcms.indexOf('name="icms_rate"')).toBeLessThan(linhaDoIcms.indexOf('{leituraDoIcmsEfetivo}'))
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// E — O PADRÃO DO PIS/COFINS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — o padrão por regime e a suspensão após edição', () => {
  it('>>> 9,25% no Lucro Real e 3,65% no Presumido, com a suspensão preservada <<<', () => {
    const s = semComentario(formulario())
    expect(s).toContain('const PIS_COFINS_BASE = 9.25')
    expect(s).toContain('const PIS_COFINS_LP = 3.65')
    // A regra de auto-preenchimento e a de suspensão continuam onde estavam.
    expect(s).toContain('pisCofinsManuallyEdited')
    expect(s).toContain('form.setFieldsValue({ pis_cofins_rate: PIS_COFINS_BASE })')
    expect(s).toContain('form.setFieldsValue({ pis_cofins_rate: PIS_COFINS_LP })')
  })

  it('>>> e o campo novo mantém as duas metades da regra: edita suspende, limpa reativa <<<', () => {
    const extras = blocoDosExtras(formulario())
    const linha = extras.slice(extras.indexOf('PIS_COFINS: ('))
    expect(linha).toContain('setPisCofinsManuallyEdited(v !== null && v !== undefined)')
    expect(linha).toContain('form.setFieldsValue({ pis_cofins_rate: numeric })')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F — ITEM EXISTENTE INTACTO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F — abrir um item gravado e salvar sem tocar em nada', () => {
  /**
   * >>> O QUE ESTE CASO PODE AFIRMAR, E O QUE NÃO PODE <<<
   *
   * Ele não renderiza o formulário, então não prova o ciclo abrir→salvar. O que ele prova é
   * a única coisa que a mudança PODERIA ter quebrado: que a conta a partir dos mesmos
   * valores dá os mesmos números, e que as colunas gravadas são as mesmas.
   *
   * Nenhum caso de cálculo foi editado neste PR, e a suíte inteira do motor segue verde —
   * é ela que cobre o resto.
   */
  it('>>> a conta com os mesmos valores dá o mesmo custo líquido e o mesmo por fração <<<', () => {
    const entrada = {
      base: 250, icmsPct: 12, pisCofinsPct: 9.25, ipiPct: 0,
      icmsSt: 0, qtdMedida: 4, difalOrigemPct: 0, difalDestinoPct: 0, fcp: null as number | null,
    }
    const r = calcularCustoDoItem(entrada, bandeiras())
    expect(r.custoBruto).toBeCloseTo(250, 2)
    expect(r.creditos.ICMS).toBeCloseTo(30, 2)
    expect(r.creditos.PIS_COFINS).toBeCloseTo(220 * 0.0925, 2)
    expect(r.custoLiquido).toBeCloseTo(250 - 30 - 220 * 0.0925, 2)
    expect(r.custoPorFracao).toBeCloseTo(r.custoLiquido / 4, 4)
  })

  it('>>> e a gravação escreve as MESMAS colunas de sempre <<<', () => {
    const g = semComentario(ler('src/utils/gravar-item.ts'))
    for (const coluna of [
      'icms_rate:', 'icms_deferido_rate:', 'pis_rate:', 'cofins_rate:',
      'cost_net:', 'cost_gross:', 'cost_per_base_unit:', 'cbs_rate:', 'ibs_rate:',
    ]) {
      expect(g).toContain(coluna)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// G, H e I — O "+ ADICIONAR ITEM" DO ESTOQUE
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('G, H e I — o botão novo, o formulário único e a permissão', () => {
  it('>>> "+ Adicionar item" existe na aba Itens / Insumos <<<', () => {
    const s = estoque()
    const ramo = s.slice(s.indexOf("activeTab === 'ITEM' && canEdit(MODULES.STOCK)"))
    const ateOFim = ramo.slice(0, ramo.indexOf('                        ) : ('))
    expect(ateOFim).toContain('+ Adicionar item')
    expect(ateOFim).toContain('+ Renovar quantidade')
    expect(ateOFim).toContain('Relatório de quantidades')
  })

  it('>>> e NÃO nas abas Produtos Acabados e Serviços Realizados <<<', () => {
    const s = estoque()
    const guarda = s.indexOf("activeTab === 'ITEM' && canEdit(MODULES.STOCK)")
    const ramoProduto = s.slice(s.indexOf("activeTab === 'PRODUCT' ? ("), guarda)
    expect(ramoProduto).not.toContain('+ Adicionar item')
    // O `else`, que atende Serviços e o caso sem permissão, também não.
    const fallback = s.slice(s.indexOf('                        ) : (', guarda))
    expect(fallback.slice(0, fallback.indexOf('                        )}'))).not.toContain('+ Adicionar item')
  })

  it('>>> é o MESMO formulário e a MESMA gravação — não duas árvores <<<', () => {
    for (const s of [estoque(), itens()]) {
      expect(s).toContain("from '@/page-parts/items/new-item-form.component'")
      expect(s).toContain('<NewItemForm')
      expect(s).toContain("from '@/utils/gravar-item'")
      expect(s).toContain('gravarItem(')
    }
    // E existe UM arquivo de formulário, não dois.
    expect(() => ler('src/page-parts/estoque/new-item-form.component.tsx')).toThrow()
  })

  it('>>> a permissão: STOCK no Estoque, ITEMS em Itens <<<', () => {
    expect(estoque()).toContain("activeTab === 'ITEM' && canEdit(MODULES.STOCK)")
    const i = itens()
    const antesDoBotao = i.slice(0, i.indexOf('Adicionar item'))
    expect(antesDoBotao.lastIndexOf('canEdit(MODULES.ITEMS)')).toBeGreaterThan(-1)
  })

  it('>>> e o Estoque NÃO passa `aoMudarCredito` — ele não tem o modal <<<', () => {
    // Passar um callback que não abre nada seria fingir que a tela avisa.
    const s = semComentario(estoque())
    expect(s).not.toContain('aoMudarCredito')
    expect(semComentario(itens())).toContain('aoMudarCredito:')
  })
})
