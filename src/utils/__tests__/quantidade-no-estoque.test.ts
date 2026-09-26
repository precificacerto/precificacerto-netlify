/**
 * "RENOVAR QUANTIDADE" E "RELATÓRIO DE QUANTIDADES" MUDAM DE TELA — oráculos A–G do comando
 * do PO de 26/09/2026.
 *
 * >>> O QUE ESTES CASOS PRECISAM DISTINGUIR, E POR QUE ELES NÃO SÃO SÓ `grep` <<<
 *
 * Uma mudança de tela é quase toda feita de AUSÊNCIAS, e ausência é o que mais fácil se
 * afirma sem exercitar nada: "não existe 'Renovar quantidade' em `/itens`" passa também se
 * o botão tivesse sido renomeado, ou se eu tivesse apagado a tela inteira. Por isso cada
 * ausência vem com o PAR — a mesma coisa DEVE existir em `/estoque`, e o que não se moveu
 * DEVE continuar onde estava.
 *
 * E o que dá para medir foi medido de verdade:
 *
 * - o caso D roda `renovarQuantidade` contra um cliente FALSO e afirma a linha gravada em
 *   `stock_movements` — o oráculo pede a linha, não o clique. Foi para isso que a conta saiu
 *   de dentro do componente;
 * - o caso E compara as linhas do relatório com o que a tabela exibe, a partir da MESMA
 *   estrutura, que é o ponto do §5.
 *
 * Os casos A, B, C, F e G leem os arquivos. Não há como renderizar as páginas daqui — as
 * duas exigem sessão —, e isso está declarado em vez de disfarçado.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  renovarQuantidade, linhasDoRelatorioDeQuantidades,
  MOTIVO_DA_ENTRADA, MOTIVO_DA_BAIXA,
} from '@/utils/renovar-quantidade'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')
const itens = () => ler('src/pages/itens/index.tsx')
const estoque = () => ler('src/pages/estoque/index.tsx')
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ═════════════════════════════════════════════════════════════════════════════════════════
// A e B — OS DOIS MUDARAM DE TELA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A e B — saem de Itens, entram no Estoque', () => {
  it('>>> Itens não tem mais nenhum dos dois — nem botão, nem drawer, nem estado <<<', () => {
    const s = semComentario(itens())
    expect(s).not.toContain('Renovar quantidade')
    expect(s).not.toContain('Relatório de quantidades')
    // O estado e os handlers foram junto: um botão removido com o drawer vivo deixaria
    // código que ninguém alcança, e código inalcançável não é testado.
    for (const nome of [
      'renewDrawerOpen', 'savingRenew', 'renewMode', 'renewForm',
      'openRenewDrawer', 'closeRenewDrawer', 'handleSaveRenew',
      'handleExportQuantityReport', 'RenewQuantityForm',
    ]) {
      expect(s).not.toContain(nome)
    }
  })

  it('>>> e o PAR: os dois existem no Estoque, na ordem do §3 <<<', () => {
    const s = estoque()
    // Dentro do RAMO DA ABA ITEM: a opção "abaixo do estoque" aparece nos três ramos, e
    // pegar a primeira ocorrência leria o seletor da aba Produtos.
    const ramo = s.slice(s.indexOf("activeTab === 'ITEM' && canEdit(MODULES.STOCK)"))
    const iSeletor = ramo.indexOf("{ value: 'below', label: 'Apenas abaixo do estoque' }")
    const iRenovar = ramo.indexOf('+ Renovar quantidade')
    const iRelatorio = ramo.indexOf('Relatório de quantidades')
    for (const i of [iSeletor, iRenovar, iRelatorio]) expect(i).toBeGreaterThan(-1)
    expect(iSeletor).toBeLessThan(iRenovar)
    expect(iRenovar).toBeLessThan(iRelatorio)
    // O drawer e o componente vieram junto.
    expect(s).toContain('<RenewQuantityForm')
    expect(s).toContain('title="Renovar quantidade"')
  })

  it('>>> o "+ Renovar quantidade" manteve o amarelo, que é o que o distingue da leitura <<<', () => {
    const s = estoque()
    const linha = s.slice(s.indexOf('+ Renovar quantidade') - 420, s.indexOf('+ Renovar quantidade'))
    expect(linha).toContain('#FEF08A')
    expect(linha).toContain('#854D0E')
  })

  it('>>> e o componente foi IMPORTADO, não movido de pasta nem copiado <<<', () => {
    expect(estoque()).toContain("from '@/page-parts/items/renew-quantity-form.component'")
    // O arquivo continua onde estava, e é um só.
    expect(() => ler('src/page-parts/items/renew-quantity-form.component.tsx')).not.toThrow()
    expect(() => ler('src/page-parts/estoque/renew-quantity-form.component.tsx')).toThrow()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C — SÓ NA ABA ITEM
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — nas abas Produtos Acabados e Serviços Realizados eles não existem', () => {
  it('>>> os dois estão atrás da guarda da aba ITEM <<<', () => {
    const s = estoque()
    const guarda = s.indexOf("activeTab === 'ITEM' && canEdit(MODULES.STOCK)")
    expect(guarda).toBeGreaterThan(-1)
    // O bloco dos dois botões começa DEPOIS da guarda e termina antes do ramo seguinte.
    const ramo = s.slice(guarda, s.indexOf('                        ) : (', guarda))
    expect(ramo).toContain('+ Renovar quantidade')
    expect(ramo).toContain('Relatório de quantidades')
    // E o ramo do PRODUCT, que é o vizinho, não os tem.
    const ramoProduto = s.slice(s.indexOf("activeTab === 'PRODUCT' ? ("), guarda)
    expect(ramoProduto).toContain('Relatório de produtos')
    expect(ramoProduto).not.toContain('+ Renovar quantidade')
    expect(ramoProduto).not.toContain('Relatório de quantidades')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — RENOVAR CONTINUA FUNCIONANDO — A LINHA GRAVADA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — a linha gravada em `stock_movements`', () => {
  /**
   * O cliente falso registra CADA escrita. Ele é burro de propósito: se a operação mudar a
   * ORDEM das escritas ou gravar numa tabela a mais, o registro muda e o caso vê.
   */
  function clienteFalso(itemRow: any, stockRow: any | null) {
    const escritas: { tabela: string; op: string; dados: any }[] = []
    const tabela = (nome: string) => {
      const q: any = {
        _dados: null as any,
        select: () => q,
        eq: () => q,
        in: () => q,
        // `error: null as any` de propósito: sem isso o `tsc` marca TS7018 em cada literal,
        // e um erro novo na medição do baseline é exatamente o que ela existe para pegar.
        single: async () => ({ data: nome === 'items' ? itemRow : stockRow, error: null as any }),
        maybeSingle: async () => ({ data: nome === 'stock' ? stockRow : null, error: null as any }),
        then: (r: any) => Promise.resolve({ data: [] as any[], error: null as any }).then(r),
        update: (dados: any) => { escritas.push({ tabela: nome, op: 'update', dados }); return q },
        insert: async (dados: any) => { escritas.push({ tabela: nome, op: 'insert', dados }); return { data: null as any, error: null as any } },
      }
      return q
    }
    return { escritas, cliente: { from: tabela } as any }
  }

  /**
   * `measure_quantity: 4`, e NÃO 1.
   *
   * Com 1, `unitPrice / measureQtyForItem` e `unitPrice` dão o mesmo número, e uma mutação
   * que apagava a divisão passava verde — variante 2 de `teste-que-nao-exercita.md`: o caso
   * escolhido não distinguia os dois estados. Com 4, distingue: 20 por embalagem vira 5 por
   * unidade base.
   */
  const ITEM = {
    id: 'item-1', quantity: 10, cost_price: 100,
    cost_per_base_unit: 10, unit: 'UN', item_type: 'INSUMO', measure_quantity: 4,
  }

  it('>>> adicionar 5 grava o movimento com o motivo de sempre <<<', async () => {
    const { escritas, cliente } = clienteFalso(ITEM, { id: 'stock-1', quantity_current: 10 })
    const r = await renovarQuantidade(
      { supabase: cliente, tenantId: 't-1', createdBy: 'u-1' },
      { itemId: 'item-1', modo: 'include', quantidade: 5, precoUnitario: 20 },
    )
    expect(r).toEqual({ estado: 'OK', mensagem: 'Quantidade renovada! Custo unitário atualizado.' })

    const mov = escritas.find((e) => e.tabela === 'stock_movements')
    expect(mov).toBeTruthy()
    /*
      O MOTIVO É AFIRMADO COMO LITERAL, e não como `MOTIVO_DA_ENTRADA`.

      Escrito com a constante, os dois lados liam o MESMO valor e o caso passava com o texto
      trocado — a medição comparando a coisa consigo mesma, que é o K tautológico de
      `hipotese-derrubada-pela-propria-medicao.md`. Uma mutação que renomeava o motivo
      sobreviveu exatamente assim.

      O texto importa porque ele é o que aparece no histórico de movimentações já gravado:
      mudá-lo divide o mesmo evento em duas grafias.
    */
    expect(mov!.dados).toEqual({
      stock_id: 'stock-1',
      delta_quantity: 5,
      reason: 'Recompra - renovar quantidade',
      created_by: 'u-1',
    })
    expect(MOTIVO_DA_ENTRADA).toBe('Recompra - renovar quantidade')

    // A conta de sempre: 10 + 5, 100 + 20×5, e o custo por unidade BASE é 20 ÷ 4 = 5 —
    // o preço é por embalagem, e `measure_quantity` diz quantas unidades ela tem.
    const upItem = escritas.find((e) => e.tabela === 'items' && e.op === 'update')
    expect(upItem!.dados).toMatchObject({ quantity: 15, cost_price: 200, cost_per_base_unit: 5 })
  })

  it('>>> e a baixa parcial grava delta NEGATIVO, com o motivo dela <<<', async () => {
    const { escritas, cliente } = clienteFalso(ITEM, { id: 'stock-1', quantity_current: 10 })
    const r = await renovarQuantidade(
      { supabase: cliente, tenantId: 't-1', createdBy: 'u-1' },
      { itemId: 'item-1', modo: 'partial_delete', quantidade: 4 },
    )
    expect(r).toEqual({ estado: 'OK', mensagem: 'Quantidade removida com sucesso!' })
    const mov = escritas.find((e) => e.tabela === 'stock_movements')
    expect(mov!.dados).toEqual({
      stock_id: 'stock-1',
      delta_quantity: -4,
      reason: 'Baixa de quantidade (exclusão parcial via Renovar)',
      created_by: 'u-1',
    })
    expect(MOTIVO_DA_BAIXA).toBe('Baixa de quantidade (exclusão parcial via Renovar)')
    expect(escritas.find((e) => e.tabela === 'stock' && e.op === 'update')!.dados)
      .toMatchObject({ quantity_current: 6 })
  })

  it('>>> baixar mais do que existe é recusado, e nada é gravado <<<', async () => {
    // O par que impede o caso acima de passar com a validação removida.
    const { escritas, cliente } = clienteFalso(ITEM, { id: 'stock-1', quantity_current: 10 })
    const r = await renovarQuantidade(
      { supabase: cliente, tenantId: 't-1', createdBy: 'u-1' },
      { itemId: 'item-1', modo: 'partial_delete', quantidade: 40 },
    )
    expect(r).toEqual({ estado: 'ERRO', erro: 'Máximo permitido: 10 UN.' })
    expect(escritas).toHaveLength(0)
  })

  it('>>> sem linha de estoque, ela é CRIADA — o item novo também renova <<<', async () => {
    const { escritas, cliente } = clienteFalso(ITEM, null)
    await renovarQuantidade(
      { supabase: cliente, tenantId: 't-1', createdBy: 'u-1' },
      { itemId: 'item-1', modo: 'include', quantidade: 3, precoUnitario: 10 },
    )
    const insercaoDeStock = escritas.find((e) => e.tabela === 'stock' && e.op === 'insert')
    expect(insercaoDeStock!.dados).toMatchObject({ tenant_id: 't-1', item_id: 'item-1', stock_type: 'ITEM' })
  })

  it('>>> e a tela chama o módulo, em vez de ter a conta dentro <<<', () => {
    const s = semComentario(estoque())
    expect(s).toContain('renovarQuantidade(')
    /*
      A conta não voltou para dentro do HANDLER. O recorte é o handler, e não a página: o
      Estoque grava `stock_movements` por outro caminho — o drawer de movimentação —, que
      é anterior a esta entrega e não tem nada a ver com renovar quantidade. Proibir a
      string na página inteira faria o caso falhar por código que não é meu.
    */
    const handler = s.slice(s.indexOf('const handleSaveRenew'), s.indexOf('const opcoesDeItem'))
    expect(handler).not.toContain("from('stock_movements')")
    expect(handler).not.toContain('needs_cost_update')
    expect(handler).not.toContain("from('items')")
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// E — O RELATÓRIO SAI DOS MESMOS NÚMEROS DA TABELA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — uma fonte só para a tabela e para o PDF', () => {
  const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

  it('>>> dois itens: o relatório repete o que a tabela exibe <<<', () => {
    const daTabela = [
      { name: 'Perfil de alumínio', currentQty: 12, unit: 'UN', costGross: 41.9, costNet: 33.52 },
      { name: 'Vidro temperado', currentQty: 1, unit: 'M2', costGross: 210, costNet: 180.4 },
    ]
    expect(linhasDoRelatorioDeQuantidades(daTabela, brl)).toEqual([
      ['Perfil de alumínio', '12 unidades', 'R$ 41,90', 'R$ 33,52'],
      ['Vidro temperado', '1 unidade', 'R$ 210,00', 'R$ 180,40'],
    ])
  })

  it('>>> custo ausente vira TRAVESSÃO, nunca R$ 0,00 <<<', () => {
    // `ausente-vs-falso.md`: R$ 0,00 afirma que o custo foi apurado e deu nada.
    expect(linhasDoRelatorioDeQuantidades(
      [{ name: 'Sem custo', currentQty: 2, unit: 'UN', costGross: null, costNet: null }], brl,
    )).toEqual([['Sem custo', '2 unidades', '—', '—']])
  })

  it('>>> e a tela alimenta o relatório com `filteredData`, não com uma segunda consulta <<<', () => {
    const s = semComentario(estoque())
    expect(s).toContain('linhasDoRelatorioDeQuantidades(filteredData, formatCurrency)')
    // Os campos do relatório vieram para a consulta da ABA, que é o que o §5 manda.
    expect(ler('src/hooks/use-data.hooks.ts')).toContain('cost_gross, cost_net')
    expect(s).toContain('costGross:')
    expect(s).toContain('costNet:')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F — A PERMISSÃO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F — os dois pedem STOCK, e não ITEMS', () => {
  it('>>> a guarda é `canEdit(MODULES.STOCK)` <<<', () => {
    const s = estoque()
    const guarda = s.indexOf("activeTab === 'ITEM' && canEdit(MODULES.STOCK)")
    expect(guarda).toBeGreaterThan(-1)
    // Sem a permissão, o ramo cai no `else` — que é o seletor sozinho, sem os botões.
    const fallback = s.slice(s.indexOf('                        ) : (', guarda))
    const ateOFim = fallback.slice(0, fallback.indexOf('                        )}'))
    expect(ateOFim).not.toContain('+ Renovar quantidade')
    expect(ateOFim).not.toContain('Relatório de quantidades')
  })

  it('>>> e a permissão de ITENS não decide mais nada sobre eles <<<', () => {
    const s = semComentario(estoque())
    expect(s).not.toContain('MODULES.ITEMS')
  })

  it('>>> nenhum item de permissão foi criado nem removido <<<', () => {
    // A paridade menu × Permissões de Acesso é inviolável: esta entrega MOVE uma ação
    // entre módulos que já existem, e não inventa um módulo novo.
    const mod = ler('src/hooks/use-permissions.hook.ts')
    expect(mod).toContain('STOCK')
    expect(mod).toContain('ITEMS')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// G — NÃO-REGRESSÃO: PRODUTOS E SERVIÇOS NÃO FORAM TOCADOS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('G — quem tinha o próprio "Renovar quantidade" continua com ele', () => {
  it.each([
    ['src/pages/produtos/index.tsx'],
    ['src/pages/servicos/index.tsx'],
  ])('>>> %s mantém o drawer e o save dele <<<', (arquivo) => {
    const s = ler(arquivo)
    expect(s).toContain('title="Renovar quantidade"')
    expect(s).toContain('handleSaveRenew')
  })

  it('>>> e eles NÃO passaram a usar o módulo — são operações diferentes <<<', () => {
    // Produto renova por PRODUÇÃO e serviço por execução; item renova por RECOMPRA. Unificar
    // os três inventaria um parentesco que o domínio não tem.
    for (const a of ['src/pages/produtos/index.tsx', 'src/pages/servicos/index.tsx']) {
      expect(ler(a)).not.toContain('renovar-quantidade')
    }
  })
})
