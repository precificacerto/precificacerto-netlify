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

describe('A PRÉ-CONDIÇÃO: só exclui venda SEM pagamento registrado', () => {
    it('PRODUTO sem pagamento: permitido', () => {
        expect(canDeleteSale({ status: VENDA_PRODUTO.status, hasPaidReceivable: false }))
            .toEqual({ allowed: true, reason: null })
    })

    it('SERVIÇO sem pagamento: permitido', () => {
        expect(canDeleteSale({ status: VENDA_SERVICO.status, hasPaidReceivable: false }))
            .toEqual({ allowed: true, reason: null })
    })

    it('PRODUTO COM pagamento: BLOQUEADO, e o motivo é texto para o usuário ler', () => {
        const veredito = canDeleteSale({ status: VENDA_PRODUTO.status, hasPaidReceivable: true })
        expect(veredito.allowed).toBe(false)
        expect(veredito.reason).toContain('pagamentos registrados')
        expect(veredito.reason).toContain('Lançamentos a Receber')
    })

    it('SERVIÇO COM pagamento: BLOQUEADO pelo mesmo motivo', () => {
        const veredito = canDeleteSale({ status: VENDA_SERVICO.status, hasPaidReceivable: true })
        expect(veredito.allowed).toBe(false)
        expect(veredito.reason).toContain('pagamentos registrados')
    })

    it('venda JÁ excluída: bloqueada, e por motivo DIFERENTE do pagamento', () => {
        const veredito = canDeleteSale({ status: STATUS_EXCLUIDO, hasPaidReceivable: false })
        expect(veredito.allowed).toBe(false)
        expect(veredito.reason).toContain('já foi excluída')
        expect(veredito.reason).not.toContain('pagamentos')
    })

    it('o estado com pagamento e o sem pagamento NÃO dão o mesmo veredito', () => {
        // A asserção que impede o caso de passar sem discriminar nada.
        const com = canDeleteSale({ status: 'COMPLETED', hasPaidReceivable: true })
        const sem = canDeleteSale({ status: 'COMPLETED', hasPaidReceivable: false })
        expect(com.allowed).not.toBe(sem.allowed)
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

    it('o botão é DESABILITADO pelo veredito — não é botão ativo que falha depois', () => {
        // Afirmar que o botão existe não é afirmar que ele bloqueia. O que este caso trava é
        // o `disabled` estar ligado ao veredito de `canDeleteSale`, e não a um literal.
        const conteudo = vendas()
        expect(conteudo).toContain('canDeleteSale({')
        expect(conteudo).toContain('hasPaidReceivable: vendasComPagamento.has(record.id)')
        expect(conteudo).toContain('disabled={!allowed}')
        expect(conteudo).not.toContain('disabled={false}')
    })

    it('as vendas com pagamento são carregadas em UMA consulta, não uma por linha', () => {
        const conteudo = vendas()
        expect(conteudo).toContain("from('pending_receivables')")
        expect(conteudo).toContain("eq('status', 'PAID')")
        expect(conteudo).toContain('setVendasComPagamento')
    })

    it('a confirmação LISTA o que será removido antes de executar', () => {
        const conteudo = vendas()
        const i = conteudo.indexOf('const confirmDeleteSale')
        expect(i).toBeGreaterThanOrEqual(0)
        const trecho = conteudo.slice(i, i + 2000)
        expect(trecho).toContain('Os produtos VOLTAM ao estoque')
        expect(trecho).toContain('fluxo de caixa')
        expect(trecho).toContain('Irreversível')
        expect(trecho).toContain('Excluir permanentemente?')
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
