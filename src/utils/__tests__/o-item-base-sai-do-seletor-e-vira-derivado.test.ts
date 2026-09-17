/**
 * O ITEM BASE SAI DO SELETOR E VIRA DERIVADO DA COMPOSIÇÃO.
 *
 * Decisão do dono do produto, 17/09/2026, registrada como está:
 *
 *   "Remova o banner e o seletor. Ao salvar um REVENDA com composição de UM item, derive
 *    `base_item_id` desse item — os dois vínculos sobrevivem. Com dois ou mais itens não
 *    há item base a derivar: grave NULL e registre que esse produto não terá sincronização
 *    de estoque pela coluna. **Não invente um 'primeiro item' como base.**"
 *
 * ── A MEDIÇÃO DERRUBOU O CASO QUE A DECISÃO LEGISLOU ─────────────────────────
 *
 * Medido em 17/09/2026, sobre os 77 produtos de revenda:
 *
 * | estado | produtos | o que a derivação literal faria |
 * |---|---:|---|
 * | com base, **1 item** | **30** | deriva o MESMO valor — sem perda |
 * | com base, **ZERO** itens | **32** | `null`, e **APAGA** o vínculo |
 * | com base, **2 ou mais** | **0** | — |
 * | sem base, 1 item | **5** | **ganham** vínculo |
 * | sem base, 2+ | 1 | segue sem |
 * | sem base, sem composição | 9 | segue sem |
 *
 * **O caso legislado — "dois ou mais" — tem ZERO produtos.** O caso real é ZERO itens, e
 * são 32. Aplicar `null` ali não é gravar `null` num produto novo: é apagar, em silêncio,
 * o único vínculo de estoque de 32 produtos existentes, na primeira vez que alguém abrir
 * e salvar cada um. `itens/index.tsx:245` e `:1030-1055` sincronizam estoque por essa
 * coluna e **não têm fallback**.
 *
 * `hipotese-derrubada-pela-propria-medicao.md`: a razão para escolher `null` era uma
 * suposição sobre ONDE o vazio acontece.
 *
 * Daí a regra implementada: a derivação **escreve** com um item; com zero ou dois e mais
 * ela **PRESERVA** o gravado — que num produto novo é `null`, exatamente como pedido.
 */

import { derivarBaseItemId } from '@/utils/base-item-derivado'
import { readFileSync } from 'fs'
import { join } from 'path'

const A = { id: 'item-a' }
const B = { id: 'item-b' }

describe('1. UM item na composição — a derivação escreve', () => {
  it('>>> REVENDA com um item: `base_item_id` é aquele item <<<', () => {
    const r = derivarBaseItemId({ productType: 'REVENDA', itens: [A] })
    expect(r.baseItemId).toBe('item-a')
    expect(r.origem).toBe('DERIVADO_DA_COMPOSICAO')
    expect(r.semVinculoDeEstoque).toBe(false)
  })

  it('e ela VENCE o gravado — trocar o item da composição troca o vínculo', () => {
    // O DISCRIMINANTE contra uma implementação que só preservasse: aqui o gravado é
    // OUTRO item, e o resultado tem de ser o da composição.
    const r = derivarBaseItemId({ productType: 'REVENDA', itens: [B], baseItemIdAtual: 'item-a' })
    expect(r.baseItemId).toBe('item-b')
    expect(r.origem).toBe('DERIVADO_DA_COMPOSICAO')
  })

  it('os 5 produtos que HOJE não têm base e têm um item GANHAM o vínculo', () => {
    const r = derivarBaseItemId({ productType: 'REVENDA', itens: [A], baseItemIdAtual: null })
    expect(r.baseItemId).toBe('item-a')
  })
})

describe('2. DOIS OU MAIS — não se inventa um "primeiro item"', () => {
  it('>>> produto NOVO com dois itens grava NULL <<<', () => {
    const r = derivarBaseItemId({ productType: 'REVENDA', itens: [A, B] })
    expect(r.baseItemId).toBeNull()
    expect(r.semVinculoDeEstoque).toBe(true)
    // O DISCRIMINANTE: `itens[0]` daria 'item-a'. A decisão proíbe exatamente isso.
    expect(r.baseItemId).not.toBe('item-a')
  })

  it('e a ORDEM não muda nada — invertida, continua null', () => {
    // Sem este caso, uma implementação que devolvesse o ÚLTIMO item passaria no de cima.
    expect(derivarBaseItemId({ productType: 'REVENDA', itens: [B, A] }).baseItemId).toBeNull()
    expect(derivarBaseItemId({ productType: 'REVENDA', itens: [A, B] }).baseItemId).toBeNull()
  })

  it('produto EXISTENTE com dois itens PRESERVA o que já tinha', () => {
    const r = derivarBaseItemId({ productType: 'REVENDA', itens: [A, B], baseItemIdAtual: 'item-z' })
    expect(r.baseItemId).toBe('item-z')
    expect(r.origem).toBe('PRESERVADO')
    expect(r.semVinculoDeEstoque).toBe(false)
  })
})

describe('3. ZERO itens — o caso que a medição encontrou, e são 32', () => {
  it('>>> produto EXISTENTE com base e sem composição NÃO PERDE o vínculo <<<', () => {
    // Os 32. `itens/index.tsx:245` e `:1030-1055` sincronizam estoque por esta coluna e
    // não têm caminho alternativo: apagá-la é estoque órfão, sem nada falhar.
    const r = derivarBaseItemId({ productType: 'REVENDA', itens: [], baseItemIdAtual: 'item-a' })
    expect(r.baseItemId).toBe('item-a')
    expect(r.origem).toBe('PRESERVADO')
    expect(r.semVinculoDeEstoque).toBe(false)
  })

  it('e produto NOVO sem composição fica sem vínculo — e ISSO é dito, não calado', () => {
    const r = derivarBaseItemId({ productType: 'REVENDA', itens: [] })
    expect(r.baseItemId).toBeNull()
    // A decisão mandou REGISTRAR que esse produto não terá sincronização de estoque.
    // O campo existe para a tela poder dizê-lo em vez de deixar o silêncio decidir.
    expect(r.semVinculoDeEstoque).toBe(true)
  })

  it('item sem `id` não conta como item — não vira base nem faz número', () => {
    const r = derivarBaseItemId({
      productType: 'REVENDA',
      itens: [{ id: '' }, A] as { id: string }[],
      baseItemIdAtual: null,
    })
    // Sobra UM id válido: deriva dele.
    expect(r.baseItemId).toBe('item-a')
    // E só os inválidos: nada a derivar.
    expect(derivarBaseItemId({ productType: 'REVENDA', itens: [{ id: '' }] }).baseItemId).toBeNull()
  })
})

describe('4. FORA DA REVENDA a coluna é sempre nula', () => {
  it('PRODUZIDO com um item não ganha item base', () => {
    const r = derivarBaseItemId({ productType: 'PRODUZIDO', itens: [A], baseItemIdAtual: 'item-a' })
    expect(r.baseItemId).toBeNull()
    expect(r.origem).toBe('NAO_SE_APLICA')
    // E NÃO é reportado como "sem vínculo": produto produzido nunca teve um.
    expect(r.semVinculoDeEstoque).toBe(false)
  })

  it('e tipo ausente ou desconhecido também zera', () => {
    expect(derivarBaseItemId({ productType: null, itens: [A] }).baseItemId).toBeNull()
    expect(derivarBaseItemId({ productType: undefined, itens: [A] }).baseItemId).toBeNull()
  })

  it('o tipo é comparado sem depender de caixa nem de espaço', () => {
    expect(derivarBaseItemId({ productType: ' revenda ', itens: [A] }).baseItemId).toBe('item-a')
  })
})

describe('5. A TELA — o seletor saiu e a gravação passou a derivar', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'page-parts', 'products', 'content.component.tsx'),
    'utf-8',
  )

  it('>>> o banner e o seletor NÃO EXISTEM MAIS <<<', () => {
    expect(src).not.toContain('Item base (mercadoria para revenda)')
    expect(src).not.toContain('Selecione um item do tipo &ldquo;Mercadoria para revenda&rdquo; como base do custo')
    expect(src).not.toContain('Selecione o item de revenda')
  })

  it('a gravação usa a DERIVAÇÃO, não o estado do seletor', () => {
    expect(src).toContain('const _baseItemDerivado = derivarBaseItemId({')
    expect(src).toContain('base_item_id: _baseItemDerivado.baseItemId,')
    // O que ela NÃO pode mais ser: o valor do seletor, direto.
    expect(src).not.toContain("base_item_id: productType === 'REVENDA' ? baseItemId : null")
  })

  it('e a derivação recebe o GRAVADO — sem ele, os 32 seriam apagados', () => {
    expect(src).toContain('baseItemIdAtual: baseItemId,')
    expect(src).toContain('itens: productItemsData.map((i) => ({ id: String(i.id) })),')
  })

  it('>>> a MENSAGEM do bloqueio parou de mandar selecionar o que não existe <<<', () => {
    expect(src).not.toContain('Selecione o item de revenda como base do custo.')
    expect(src).toContain('Adicione o item de revenda à composição do produto')
  })

  it('e o BLOQUEIO em si continua o mesmo — composição preenchida já passava', () => {
    // Decisão: corrigir a mensagem, não endurecer a regra. O `OU` fica.
    expect(src).toContain('if (!baseItemId && !productItemsData.length) {')
  })
})

describe('6. O OUTRO PRODUTOR da coluna continua vivo — e é o majoritário', () => {
  const itens = readFileSync(
    join(__dirname, '..', '..', 'pages', 'itens', 'index.tsx'),
    'utf-8',
  )

  it('cadastrar um item de REVENDA ainda cria o produto com `base_item_id`', () => {
    // CORREÇÃO DE REGISTRO: o seletor era UM DE DOIS produtores, e o minoritário.
    // 30 dos 62 produtos com base têm o nome idêntico ao do item — a assinatura desta
    // rota, que não passa por tela de produto nenhuma. Remover o seletor não a toca.
    expect(itens).toContain('base_item_id: savedItem.id,')
  })

  it('e os leitores da coluna seguem intactos — a remoção não os alcança', () => {
    expect(itens).toContain("eq('base_item_id', itemId)")
    const estoque = readFileSync(join(__dirname, '..', '..', 'pages', 'estoque', 'index.tsx'), 'utf-8')
    expect(estoque).toContain('if (product.base_item_id) {')
  })
})
