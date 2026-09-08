/**
 * O vínculo de origem da venda no Histórico do Cliente.
 *
 * É o ÚNICO acréscimo de campo desta rodada — daí o arquivo e o commit próprios. O que ele
 * entrega é a metade que faltava do requisito de auditoria: data, valor e itens já chegavam à
 * tela; a ORIGEM não. `budget_id` servia só para juntar anexos e desduplicar, e nada em
 * `TimelineEntry` a carregava.
 *
 * ORÁCULO: VD-96AF84, cliente Felipe Klein, `status='EXCLUIDO'`, `budget_id` =
 * 3b82c75e-5fff-4cd8-a3ad-6dd233edbe9e, `order_id` NULL — Caso B, venda direta de orçamento,
 * sem pedido no meio. Medido em 08/09/2026.
 *
 * POR QUE O ORÁCULO NÃO PODIA SER RESOLVIDO PELA LISTA BRANCA. O orçamento dele tem `sale_id`
 * preenchido, e a página PULA orçamento convertido em venda antes de montar a entrada da seção
 * Orçamentos (`if (b.sale_id) continue`). Acrescentar `EXCLUIDO` à lista branca — feito no
 * commit anterior — NÃO o traz de volta à tela. Só este vínculo traz. Sem ele, o painel do
 * Felipe Klein mostraria a venda esmaecida e nada dizendo de onde ela veio.
 */

import fs from 'fs'
import path from 'path'
import { buildOriginLines, formatBudgetCode, formatOrderCode } from '@/utils/document-origin-link'

const ORCAMENTO_FELIPE = '3b82c75e-5fff-4cd8-a3ad-6dd233edbe9e'
const PEDIDO_QUALQUER = '7c1d9a4e-0000-4000-8000-1234567890ab'

describe('a venda excluída carrega o orçamento de origem', () => {
    it('VD-96AF84 (Caso B) devolve o orçamento — e SÓ o orçamento', () => {
        const linhas = buildOriginLines({ budgetId: ORCAMENTO_FELIPE, orderId: null })
        expect(linhas).toHaveLength(1)
        expect(linhas[0]).toMatchObject({ rotulo: 'Orçamento', valor: 'ORC-3B82', id: ORCAMENTO_FELIPE })
    })

    it('a linha do PEDIDO é OMITIDA no Caso B — sem traço e sem travessão', () => {
        // Campo vazio afirmaria que não houve pedido; no Caso B a etapa NÃO EXISTIU. São coisas
        // diferentes. `.claude/rules/ausente-vs-falso.md`.
        const linhas = buildOriginLines({ budgetId: ORCAMENTO_FELIPE, orderId: null })
        const rotulos = linhas.map((l) => l.rotulo)
        expect(rotulos).not.toContain('Pedido')
        for (const l of linhas) {
            expect(l.valor).not.toBe('—')
            expect(l.valor).not.toBe('-')
            expect(l.valor.trim()).not.toBe('')
        }
    })

    it('a cadeia COM pedido devolve as duas linhas, nesta ordem', () => {
        const linhas = buildOriginLines({
            budgetId: ORCAMENTO_FELIPE,
            orderId: PEDIDO_QUALQUER,
            orderCode: 'PED-18A461',
        })
        expect(linhas.map((l) => l.rotulo)).toEqual(['Orçamento', 'Pedido'])
        expect(linhas[1].valor).toBe('PED-18A461')
    })

    it('pedido sem `order_code` cai no id curto, não em vazio', () => {
        const linhas = buildOriginLines({ orderId: PEDIDO_QUALQUER })
        expect(linhas[0].valor).toBe('Pedido 7C1D9A4E')
    })

    it('venda de balcão devolve lista VAZIA — o bloco inteiro é omitido', () => {
        expect(buildOriginLines({ budgetId: null, orderId: null })).toEqual([])
        expect(buildOriginLines({})).toEqual([])
    })

    it('os códigos saem no mesmo formato que as outras seções do painel já usam', () => {
        expect(formatBudgetCode(ORCAMENTO_FELIPE)).toBe('ORC-3B82')
        expect(formatOrderCode(PEDIDO_QUALQUER, 'PED-18A461')).toBe('PED-18A461')
    })
})

describe('a página consome o vínculo', () => {
    // Asserção de caminho, e é o caso limite honesto: o defeito era a AUSÊNCIA do campo na
    // entrada. Não há efeito numérico a medir — o efeito é a linha existir na tela. Fica
    // vermelha contra o `origin/main`, onde nem `order_id` era selecionado.
    const fonte = fs.readFileSync(path.join(process.cwd(), 'src', 'pages', 'clientes', 'index.tsx'), 'utf-8')

    it('a venda monta a origem a partir de `budget_id` e `order_id`', () => {
        expect(fonte).toContain('origem: buildOriginLines({ budgetId: s.budget_id, orderId: s.order_id })')
    })

    it('`order_id` está nos DOIS selects de venda — senão o vínculo chega `undefined`', () => {
        // Cópia divergente: são duas consultas montando o mesmo objeto. Uma delas esquecer o
        // campo o faria chegar vazio, sem erro. `.claude/rules/copia-divergente.md`.
        const ocorrencias = fonte.split('budget_id, order_id').length - 1
        expect(ocorrencias).toBe(2)
    })

    it('a origem é renderizada, e o bloco some quando a lista é vazia', () => {
        expect(fonte).toContain('entry.origem && entry.origem.length > 0')
        expect(fonte).toContain('<strong>Origem:</strong>')
    })
})
