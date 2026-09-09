/**
 * excluir-venda-cascata.test.ts — Excluir venda: a última instância.
 *
 * O CONCEITO QUE TODO CASO AQUI DEFENDE
 * -------------------------------------
 *   CANCELAR volta à etapa anterior e PERMITE RETOMAR.
 *   EXCLUIR  é a última instância — como se a evolução nunca tivesse chegado ali.
 *
 * São dois estados, e é por isso que o marcador é `status = 'EXCLUIDO'` e não `is_active`:
 * o cancelamento JÁ grava `is_active = false`, então os dois virariam o mesmo booleano e o
 * filtro "mostrar excluídos" — que é REQUISITO — seria impossível de escrever sem ambiguidade.
 * Medido em 06/09/2026: `is_active` já diverge do status em 6 linhas na base (3 budgets DRAFT
 * e 3 sales COMPLETED, todos inativos).
 *
 * CADA ASSERÇÃO FALHA SEM A SUA CORREÇÃO, e as de comportamento usam PRODUTO E SERVIÇO.
 *
 * A ARMADILHA QUE ESTES CASOS EVITAM, e é a terceira variante desta rodada
 * (`.claude/rules/teste-que-nao-exercita.md`): afirmar que o botão EXISTE não é afirmar que
 * ele fica DESABILITADO no caso certo. Por isso `canDeleteSale` é exercitada com os dois
 * estados — com e sem pagamento — e a asserção é sobre o VEREDITO, não sobre a presença.
 */

import fs from 'fs'
import path from 'path'
import {
    STATUS_EXCLUIDO,
    canDeleteSale,
    filterDeletedDocuments,
    isDeletedDocument,
    TOOLTIP_CANCELAR,
    TOOLTIP_EXCLUIR,
} from '@/utils/document-deleted'

const SRC = path.resolve(__dirname, '../..')
const RAIZ = path.resolve(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8')
const readRaiz = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')

/** Documentos de teste: um de PRODUTO, um de SERVIÇO, um cancelado, um excluído. */
const VENDA_PRODUTO = { id: 'v-prod', status: 'COMPLETED' }
const VENDA_SERVICO = { id: 'v-svc', status: 'COMPLETED' }
const VENDA_CANCELADA = { id: 'v-canc', status: 'CANCELLED' }
const VENDA_EXCLUIDA = { id: 'v-exc', status: STATUS_EXCLUIDO }

describe('EXCLUÍDO e CANCELADO são estados DIFERENTES', () => {
    // Se este bloco passasse com os dois iguais, o filtro do requisito não teria como existir.
    it('só o excluído é excluído — o cancelado NÃO é', () => {
        expect(isDeletedDocument(VENDA_EXCLUIDA)).toBe(true)
        expect(isDeletedDocument(VENDA_CANCELADA)).toBe(false)
        expect(isDeletedDocument(VENDA_PRODUTO)).toBe(false)
    })

    it('documento SEM status não é excluído — ausência não é classificação', () => {
        // `.claude/rules/ausente-vs-falso.md`: `null` é "nunca classificado", nunca "excluído".
        expect(isDeletedDocument({ status: null })).toBe(false)
        expect(isDeletedDocument({})).toBe(false)
        expect(isDeletedDocument(undefined)).toBe(false)
    })
})

describe('O filtro "mostrar excluídos" — ocultos por padrão', () => {
    const lista = [VENDA_PRODUTO, VENDA_SERVICO, VENDA_CANCELADA, VENDA_EXCLUIDA]

    it('PADRÃO: esconde o excluído e MANTÉM o cancelado', () => {
        const visiveis = filterDeletedDocuments(lista, false)
        expect(visiveis.map((v) => v.id)).toEqual(['v-prod', 'v-svc', 'v-canc'])
        // O cancelado continuar na lista é o que distingue este filtro de um filtro por
        // `is_active` — que levaria os dois embora.
        expect(visiveis).toContain(VENDA_CANCELADA)
    })

    it('LIGADO: traz o excluído de volta, sem duplicar os demais', () => {
        const visiveis = filterDeletedDocuments(lista, true)
        expect(visiveis).toHaveLength(4)
        expect(visiveis.map((v) => v.id)).toContain('v-exc')
    })

    it('devolve cópia, não a lista original — a tela não pode mutar a fonte', () => {
        const visiveis = filterDeletedDocuments(lista, true)
        expect(visiveis).not.toBe(lista)
        expect(visiveis).toEqual(lista)
    })
})

describe('O CRITÉRIO, depois que a pré-condição de pagamento saiu', () => {
    it('PRODUTO sem pagamento: permitido', () => {
        expect(canDeleteSale({ status: VENDA_PRODUTO.status }))
            .toEqual({ allowed: true, reason: null })
    })

    it('SERVIÇO sem pagamento: permitido', () => {
        expect(canDeleteSale({ status: VENDA_SERVICO.status }))
            .toEqual({ allowed: true, reason: null })
    })

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // OS TRÊS CASOS ABAIXO SUBSTITUEM CASOS QUE AFIRMAVAM O CONTRÁRIO, e a troca é deliberada.
    //
    // Eles diziam que venda com pagamento era BLOQUEADA. Aquilo estava CERTO sob a regra da
    // época; a decisão de 09/09/2026 REVOGOU a pré-condição. Não é correção de teste errado —
    // é `.claude/rules/decisao-sob-regra-da-epoca.md`, e é a SEGUNDA mudança de decisão da
    // mesma rodada (a primeira foi o botão voltar ao popup do Fluxo de Caixa).
    // ═══════════════════════════════════════════════════════════════════════════════════════

    // RESSALVA DE MÉTODO, e ela custou uma medição: a primeira versão destes dois casos
    // chamava `canDeleteSale({ status })` sem mais nada — e PASSAVA CONTRA O `origin/main`,
    // porque lá `hasPaidReceivable` ausente vira `undefined`, que é falsy, e o veredito saía
    // `allowed: true` do mesmo jeito. Era `teste-que-nao-exercita.md` dentro do próprio teste.
    //
    // O que discrimina é passar o campo COM `true`: no `main` isso bloqueia, aqui é ignorado.
    // O alias tipado abaixo é o que permite passá-lo sem quebrar o `tsc` — o campo NÃO existe
    // mais na assinatura, e é exatamente isso que se está afirmando.
    const comCampoAntigo = canDeleteSale as (input: {
        status?: string | null
        hasPaidReceivable?: boolean
    }) => { allowed: boolean; reason: string | null }

    it('PRODUTO COM pagamento: AGORA É EXCLUÍVEL — a pré-condição saiu', () => {
        expect(comCampoAntigo({ status: VENDA_PRODUTO.status, hasPaidReceivable: true }))
            .toEqual({ allowed: true, reason: null })
    })

    it('SERVIÇO COM pagamento: AGORA É EXCLUÍVEL, pela mesma razão', () => {
        expect(comCampoAntigo({ status: VENDA_SERVICO.status, hasPaidReceivable: true }))
            .toEqual({ allowed: true, reason: null })
    })

    it('venda JÁ excluída continua bloqueada — é idempotência, não barreira', () => {
        // A única condição que sobrou. Sem este caso, `canDeleteSale` viraria uma função que
        // devolve `true` sempre, e o teste acima passaria sem discriminar coisa nenhuma.
        const veredito = canDeleteSale({ status: STATUS_EXCLUIDO })
        expect(veredito.allowed).toBe(false)
        expect(veredito.reason).toContain('já foi excluída')
        expect(veredito.reason).not.toContain('pagamentos')
    })

    it('o veredito ainda DISCRIMINA — excluída e ativa não dão o mesmo resultado', () => {
        const excluida = canDeleteSale({ status: STATUS_EXCLUIDO })
        const ativa = canDeleteSale({ status: 'COMPLETED' })
        expect(excluida.allowed).not.toBe(ativa.allowed)
    })
})

describe('Os tooltips distinguem as duas ações', () => {
    it('Cancelar fala em RETORNAR à etapa anterior', () => {
        expect(TOOLTIP_CANCELAR).toContain('etapa anterior')
        expect(TOOLTIP_CANCELAR).toContain('retomá-lo')
    })

    it('Excluir fala em PERMANENTE, na cadeia e no que acontece com o estoque', () => {
        expect(TOOLTIP_EXCLUIR).toContain('permanentemente')
        expect(TOOLTIP_EXCLUIR).toContain('pedido e orçamento')
        expect(TOOLTIP_EXCLUIR).toContain('Estoque volta')
        expect(TOOLTIP_EXCLUIR).toContain('Não há desfazer')
    })

    it('os dois textos são DIFERENTES — é a diferença que o usuário precisa ler', () => {
        expect(TOOLTIP_CANCELAR).not.toEqual(TOOLTIP_EXCLUIR)
    })
})

describe('A tela de Vendas: botão ao lado do Cancelar, desabilitado quando bloqueado', () => {
    const vendas = () => read('pages/vendas/index.tsx')

    it('o botão Excluir existe na coluna Ações, com os DOIS tooltips', () => {
        const conteudo = vendas()
        expect(conteudo).toContain('TOOLTIP_CANCELAR')
        expect(conteudo).toContain('TOOLTIP_EXCLUIR')
        expect(conteudo).toContain('confirmDeleteSale')
    })

    it('o `disabled` continua ligado ao veredito, não a um literal', () => {
        const conteudo = vendas()
        expect(conteudo).toContain('canDeleteSale({ status: record.status })')
        expect(conteudo).toContain('disabled={!allowed}')
        expect(conteudo).not.toContain('disabled={false}')
    })

    it('a tela NÃO passa mais `hasPaidReceivable` — o campo saiu do critério', () => {
        // SUBSTITUI o caso que afirmava a consulta de bloqueio. Este fica vermelho se alguém
        // reintroduzir a pré-condição pela porta da tela.
        expect(vendas()).not.toContain('hasPaidReceivable')
    })

    it('os DOIS números são carregados em duas consultas para a lista inteira', () => {
        // E o filtro `status = 'PAID'` SAIU: ele ignorava `amount_paid` de recebível PENDING,
        // que é o caso da VD-9171FE — R$ 50.000 pagos que nunca foram contados.
        const conteudo = vendas()
        expect(conteudo).toContain("from('pending_receivables')")
        expect(conteudo).toContain('sale_id, amount_paid')
        expect(conteudo).toContain("eq('origin_type', 'SALE')")
        expect(conteudo).toContain('setImpactoPorVenda')
        // O ponto antes do `eq` é necessário: `.neq('status', 'PAID')`, que a tela usa noutro
        // lugar, CONTÉM a substring `eq('status', 'PAID')` — uma asserção ingênua acusaria
        // código que não tem nada a ver com o filtro removido.
        expect(conteudo).not.toContain(".eq('status', 'PAID')")
    })

    it('a confirmação LISTA o que será removido antes de executar', () => {
        const conteudo = vendas()
        const i = conteudo.indexOf('const confirmDeleteSale')
        expect(i).toBeGreaterThanOrEqual(0)
        const trecho = conteudo.slice(i, i + 3000)
        expect(trecho).toContain('Os produtos VOLTAM ao estoque')
        expect(trecho).toContain('fluxo de caixa')
        expect(trecho).toContain('Irreversível')
        expect(trecho).toContain('Excluir permanentemente?')
    })

    it('a confirmação exibe a PRIMEIRA linha sempre e a SEGUNDA só na divergência', () => {
        const conteudo = vendas()
        expect(conteudo).toContain('frasePrimeiraLinha(impacto)')
        // O `&&` é o que faz a segunda linha ser OMITIDA quando não há divergência. Trocar por
        // um texto fixo de "sem divergência" afirmaria uma conferência que não se fez.
        expect(conteudo).toContain('{linhaDivergencia && (')
    })

    it('chama a rota SEPARADA, não a do Cancelar', () => {
        const conteudo = vendas()
        expect(conteudo).toContain("'/api/delete/sales-permanent'")
        // E a do Cancelar continua existindo — as duas ações convivem.
        expect(conteudo).toContain("'/api/delete/sales'")
    })
})

describe('O filtro nas TRÊS telas', () => {
    it.each([
        ['Orçamentos', 'pages/orcamentos/index.tsx'],
        ['Pedidos', 'pages/pedidos/index.tsx'],
        ['Vendas', 'pages/vendas/index.tsx'],
    ])('%s tem o filtro, com excluídos ocultos por padrão', (_nome, arquivo) => {
        const conteudo = read(arquivo)
        expect(conteudo).toContain('Mostrar excluídos')
        expect(conteudo).toContain('useState(false)')
        expect(conteudo).toContain('filterDeletedDocuments')
        expect(conteudo).toContain('useDeletedDocuments')
    })

    it('o hook dos excluídos é ÚNICO — não há uma cópia por tela', () => {
        // Três blocos iguais seriam a quinta aparição da CÓPIA DIVERGENTE, na mesma rodada em
        // que a quarta foi corrigida (`.claude/rules/copia-divergente.md`).
        for (const arquivo of ['pages/orcamentos/index.tsx', 'pages/pedidos/index.tsx', 'pages/vendas/index.tsx']) {
            const conteudo = read(arquivo)
            expect(conteudo).toContain('useDeletedDocuments<')
            expect(conteudo).not.toContain("eq('status', STATUS_EXCLUIDO)")
        }
    })
})

describe('O Fluxo de Caixa perde o botão, e SÓ o botão', () => {
    const fluxo = () => read('pages/fluxo-de-caixa/index.tsx')

    it('o botão Excluir do modal saiu, e o handler órfão junto', () => {
        const conteudo = fluxo()
        expect(conteudo).not.toContain('handleDeleteFromPaymentModal')
        expect(conteudo).not.toContain('Excluir este lançamento?')
    })

    it('a ROTA continua existindo e em uso pelos outros call sites', () => {
        // A rota fica: quatro chamadores fora desta tela.
        const rota = read('pages/api/delete/cash-entries.ts')
        expect(rota).toContain("from('cash_entries')")
        for (const arquivo of ['pages/agenda/index.tsx', 'pages/controle-financeiro/index.tsx', 'pages/relatorios/index.tsx']) {
            expect(read(arquivo)).toContain('/api/delete/cash-entries')
        }
        // E esta tela não a chama mais.
        expect(fluxo()).not.toMatch(/fetch\('\/api\/delete\/cash-entries'/)
    })
})

describe('As migrações — a ordem de aplicação é instrução de operação', () => {
    it('a migração do enum contém APENAS o ALTER TYPE, sem uso do valor novo', () => {
        // `ALTER TYPE ... ADD VALUE` não permite USAR o valor na mesma transação. Um UPDATE
        // aqui quebraria a aplicação.
        const sql = readRaiz('supabase/migrations/20260906000001_add_excluido_to_budget_status.sql')
        const executavel = sql.split('\n').filter((l) => !l.trim().startsWith('--') && l.trim())
        expect(executavel).toHaveLength(1)
        expect(executavel[0]).toContain("ALTER TYPE public.budget_status ADD VALUE IF NOT EXISTS 'EXCLUIDO'")
    })

    it('a função marca os TRÊS documentos e NUNCA emite DELETE', () => {
        const sql = readRaiz('supabase/migrations/20260906000002_delete_sale_cascade.sql')
        const executavel = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
        // A FK `orders.sale_id` é NO ACTION: ela só bloquearia um DELETE. É por não haver
        // DELETE que ela deixa de ser risco — e é isto que esta asserção trava.
        expect(executavel).not.toMatch(/\bDELETE\s+FROM\b/i)
        expect(executavel).toContain('UPDATE public.sales')
        expect(executavel).toContain('UPDATE public.orders')
        expect(executavel).toContain('UPDATE public.budgets')
        expect(executavel).toContain('UPDATE public.cash_entries')
    })

    it('a função MANTÉM o bloqueio de parcela paga — não passa por cima dele', () => {
        const sql = readRaiz('supabase/migrations/20260906000002_delete_sale_cascade.sql')
        expect(sql).toContain('_sale_has_paid_receivable')
        expect(sql).toContain("'blocked_reason', 'PAID_RECEIVABLE'")
    })

    it('a função devolve o estoque pela rota única, e é idempotente', () => {
        const sql = readRaiz('supabase/migrations/20260906000002_delete_sale_cascade.sql')
        expect(sql).toContain('_reverse_stock_for_sale')
        expect(sql).toContain("IF v_sale.status = 'EXCLUIDO' THEN")
        expect(sql).toContain('CREATE OR REPLACE FUNCTION')
    })

    it('a regra versionada cobre a ORDEM, não só o "pendente por padrão"', () => {
        const regra = readRaiz('.claude/rules/migration-delivery.md')
        expect(regra).toContain('A ORDEM depende do que a migração CRIA')
        expect(regra).toContain('FUNÇÃO')
        expect(regra).toContain('ANTES DO MERGE')
        expect(regra).toContain('Corpo de PR protege ESTE merge; a regra versionada protege os FUTUROS')
    })
})
