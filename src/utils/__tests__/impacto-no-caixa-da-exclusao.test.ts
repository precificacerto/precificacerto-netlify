/**
 * O IMPACTO NO CAIXA de excluir uma venda — os DOIS números da confirmação.
 *
 * CADA ASSERÇÃO PRECISA FALHAR SEM A SUA CORREÇÃO. Antes desta mudança:
 *   - `canDeleteSale` BLOQUEAVA venda com parcela paga;
 *   - a confirmação não informava valor nenhum;
 *   - `calcularImpactoNoCaixa` não existia.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * POR QUE DOIS NÚMEROS, E NÃO UM — o critério, na formulação do dono do produto
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > Um número só estaria CERTO sobre uma coisa e MUDO sobre a outra.
 *
 * Na VD-9171FE, dizer "R$ 0,00 saem do caixa" é VERDADE e SOA FALSO para quem sabe dos
 * R$ 50.000 registrados. Informar só um **AFIRMARIA IMPLICITAMENTE que não há mais nada**.
 *
 * É `.claude/rules/ausente-vs-falso.md` APLICADO A UM DIÁLOGO DE CONFIRMAÇÃO, e é a primeira
 * vez que a classe aparece numa MENSAGEM em vez de num DADO: a omissão do segundo número não
 * seria neutra — seria uma afirmação sobre o que não foi dito.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * OS ORÁCULOS, medidos na base em 09/09/2026 — só QUATRO `pending_receivables` na base inteira
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   VD-1E33FD  R$ 19.000,00 em receivable PAID, 1 `cash_entry` ativa e liquidada de R$ 19.000
 *              → HOJE BLOQUEADA; passa a ser excluível, e R$ 19.000,00 saem do caixa.
 *              É a ÚNICA venda que muda de estado com esta entrega.
 *   VD-9171FE  R$ 50.000,00 de `amount_paid` em receivable PENDING, ZERO `cash_entries` ativas
 *              → JÁ É EXCLUÍVEL HOJE. O caso da divergência.
 *   VD-85610B  CANCELLED, sem pagamento → irrelevante.
 */

import fs from 'fs'
import path from 'path'
import {
    STATUS_EXCLUIDO,
    TOOLTIP_EXCLUIR,
    calcularImpactoNoCaixa,
    canDeleteSale,
    frasePrimeiraLinha,
    fraseSegundaLinha,
} from '@/utils/document-deleted'

const MIGRACAO = fs.readFileSync(
    path.join(process.cwd(), 'supabase', 'migrations', '20260909000001_delete_sale_cascade_sem_precondicao.sql'),
    'utf-8',
)
const corpoDaFuncao = MIGRACAO.slice(
    MIGRACAO.indexOf('AS $function$'),
    MIGRACAO.indexOf('$function$;'),
)

describe('a pré-condição saiu dos DOIS lados', () => {
    it('venda com pagamento é excluível — o critério nem recebe mais o campo', () => {
        expect(canDeleteSale({ status: 'COMPLETED' })).toEqual({ allowed: true, reason: null })
    })

    it('a MIGRAÇÃO não chama mais `_sale_has_paid_receivable` no corpo da função', () => {
        // Uma UI não é garantia: se o bloqueio ficasse no banco, o botão habilitado falharia.
        // Afirmar sobre o CORPO e não sobre o arquivo é o que importa — o cabeçalho e a
        // verificação CITAM a função de propósito, e `pg_get_functiondef` não os devolve.
        expect(corpoDaFuncao).not.toContain('_sale_has_paid_receivable')
        expect(corpoDaFuncao).not.toContain('PAID_RECEIVABLE')
    })

    it('a idempotência PERMANECE — o que saiu foi a barreira, não a proteção', () => {
        expect(corpoDaFuncao).toContain("IF v_sale.status = 'EXCLUIDO' THEN")
        expect(corpoDaFuncao).toContain("'already_deleted', true")
    })

    it('o tratamento das `cash_entries` NÃO mudou — liquidadas e pendentes juntas', () => {
        // A função nunca mencionou `paid_date` em SQL EXECUTÁVEL: removido o bloqueio, o
        // dinheiro já recebido sai do caixa sem nenhuma outra alteração. Este caso trava a
        // ausência dessa distinção — e ignora as linhas `--`, que citam `paid_date` de
        // propósito para explicar por que ele NÃO aparece no filtro.
        const executavel = corpoDaFuncao
            .split('\n')
            .filter((l) => !l.trim().startsWith('--'))
            .join('\n')
        expect(executavel).not.toContain('paid_date')
        expect(executavel).toContain("origin_type = 'SALE'")
    })

    it('a migração diz que é MUDANÇA DE DECISÃO, não correção', () => {
        expect(MIGRACAO).toContain('MUDANÇA DE DECISÃO, NÃO CORREÇÃO')
        expect(MIGRACAO).toContain('decisao-sob-regra-da-epoca')
        expect(MIGRACAO).toContain('ANTES DO MERGE')
    })
})

describe('os dois números — VD-1E33FD, o caso SEM divergência', () => {
    const impacto = calcularImpactoNoCaixa({ somaCashEntriesAtivas: 19000, somaAmountPaid: 19000 })

    it('o que sai do caixa é o valor real', () => {
        expect(impacto.valorQueSaiDoCaixa).toBe(19000)
    })

    it('NÃO há divergência, e a segunda linha é OMITIDA', () => {
        // `null`, não string vazia: a tela omite o bloco, e omitir não afirma nada. Uma linha
        // dizendo "sem divergência" afirmaria uma conferência que não se fez.
        expect(impacto.haDivergencia).toBe(false)
        expect(fraseSegundaLinha(impacto)).toBeNull()
    })

    it('a primeira linha informa o valor e diz que o saldo diminui', () => {
        const frase = frasePrimeiraLinha(impacto)
        expect(frase).toContain('19.000,00')
        expect(frase).toContain('SAEM DO CAIXA')
        expect(frase).toContain('saldo')
    })
})

describe('os dois números — VD-9171FE, o caso QUE MOTIVOU a decisão', () => {
    const impacto = calcularImpactoNoCaixa({ somaCashEntriesAtivas: 0, somaAmountPaid: 50000 })

    it('o que sai do caixa é ZERO — e isso é verdade', () => {
        expect(impacto.valorQueSaiDoCaixa).toBe(0)
    })

    it('a primeira linha NÃO promete saída de dinheiro que não vai acontecer', () => {
        const frase = frasePrimeiraLinha(impacto)
        expect(frase).toContain('Nenhum lançamento ativo')
        expect(frase).not.toContain('SAEM DO CAIXA')
    })

    it('a SEGUNDA linha aparece e nomeia os R$ 50.000 — sem ela, o silêncio mentiria', () => {
        // É o caso decisivo do arquivo: com um número só, a confirmação diria a verdade sobre o
        // caixa e AFIRMARIA IMPLICITAMENTE que não há mais nada.
        expect(impacto.haDivergencia).toBe(true)
        const segunda = fraseSegundaLinha(impacto)
        expect(segunda).not.toBeNull()
        expect(segunda).toContain('50.000,00')
        expect(segunda).toContain('NÃO TÊM lançamento de caixa')
    })

    it('a diferença vem calculada — quem lê não precisa fazer a conta', () => {
        expect(impacto.valorSemLancamento).toBe(50000)
    })

    it('os DOIS números aparecem juntos, e nenhum esconde o outro', () => {
        const juntos = `${frasePrimeiraLinha(impacto)} ${fraseSegundaLinha(impacto)}`
        expect(juntos).toContain('Nenhum lançamento ativo')
        expect(juntos).toContain('50.000,00')
    })
})

describe('divergência PARCIAL — o caso que os dois oráculos não cobrem', () => {
    // Nenhuma venda da base tem pagamento parcial COM lançamento parcial. O caso existe para o
    // cálculo não passar por acaso nos dois extremos (tudo ou nada) e errar no meio.
    const impacto = calcularImpactoNoCaixa({ somaCashEntriesAtivas: 8000, somaAmountPaid: 12000 })

    it('informa o que sai E o que falta, com os valores certos', () => {
        expect(impacto.valorQueSaiDoCaixa).toBe(8000)
        expect(impacto.valorSemLancamento).toBe(4000)
        expect(frasePrimeiraLinha(impacto)).toContain('8.000,00')
        expect(fraseSegundaLinha(impacto)).toContain('4.000,00')
    })
})

describe('bordas do cálculo', () => {
    it('venda sem pagamento nenhum: sem divergência, sem segunda linha', () => {
        const i = calcularImpactoNoCaixa({ somaCashEntriesAtivas: 0, somaAmountPaid: 0 })
        expect(i.haDivergencia).toBe(false)
        expect(fraseSegundaLinha(i)).toBeNull()
    })

    it('diferença de CENTAVO não é divergência — arredondamento não vira aviso', () => {
        const i = calcularImpactoNoCaixa({ somaCashEntriesAtivas: 100, somaAmountPaid: 100.001 })
        expect(i.haDivergencia).toBe(false)
    })

    it('caixa MAIOR que o registrado não dispara o aviso', () => {
        // A segunda linha afirma "pagamento registrado sem lançamento". O contrário é outra
        // história, e dizê-la com esse texto seria afirmar o que não se apurou.
        const i = calcularImpactoNoCaixa({ somaCashEntriesAtivas: 500, somaAmountPaid: 100 })
        expect(i.haDivergencia).toBe(false)
        expect(fraseSegundaLinha(i)).toBeNull()
    })

    it('valores nulos ou ausentes viram zero, não NaN', () => {
        const i = calcularImpactoNoCaixa({
            somaCashEntriesAtivas: Number.NaN,
            somaAmountPaid: undefined as unknown as number,
        })
        expect(i.valorQueSaiDoCaixa).toBe(0)
        expect(i.valorRegistradoComoPago).toBe(0)
    })
})

describe('o tooltip AVISA em vez de anunciar bloqueio', () => {
    it('fala no que acontece com o dinheiro já recebido', () => {
        expect(TOOLTIP_EXCLUIR).toContain('INCLUSIVE OS JÁ RECEBIDOS')
        expect(TOOLTIP_EXCLUIR).toContain('saldo diminui')
    })

    it('NÃO promete mais um bloqueio que não existe', () => {
        expect(TOOLTIP_EXCLUIR).not.toContain('não pode ser excluída')
        expect(TOOLTIP_EXCLUIR).not.toContain('Lançamentos a Receber')
    })

    it('a única recusa que restou tem texto próprio', () => {
        expect(canDeleteSale({ status: STATUS_EXCLUIDO }).reason).toContain('já foi excluída')
    })
})
