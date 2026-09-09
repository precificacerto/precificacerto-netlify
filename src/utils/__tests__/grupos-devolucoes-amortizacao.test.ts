/**
 * Fonte única de grupos de despesa, Devoluções (estorno de receita) e Amortização.
 *
 * CADA ASSERÇÃO PRECISA FALHAR SEM A SUA CORREÇÃO. Antes destas mudanças:
 *   - a lista de grupos estava em CINCO cópias e nenhuma batia com as outras;
 *   - `DEDUCAO_RECEITA` entrava por `as ExpenseGroupKey` — cast sobre valor fora da união;
 *   - `AMORTIZACAO` não existia, e cairia no `default` do DFC, sumindo sem erro;
 *   - a linha de deduções da receita existia em UMA das TRÊS variantes de demonstração.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * O CASO QUE PROTEGE DO `default` SILENCIOSO — É O MOTIVO DESTE ARQUIVO
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * O `switch` do DFC termina em `default: break`. Um grupo novo que não ganhe um `case` cai ali
 * e **o valor desaparece da Análise Financeira sem erro nenhum**. Não basta afirmar que a linha
 * aparece: um caso assim passaria verde com o dinheiro sumindo.
 *
 * O caso `'todo grupo da fonte única SOMA em alguma linha do DFC'` fica VERMELHO quando um
 * grupo é acrescentado e esquecido no `switch`. É a diferença entre afirmar EFEITO e afirmar
 * passagem — `.claude/rules/teste-que-nao-exercita.md`, variante 3.
 *
 * `LUCRO` e `OUTROS` estão fora de `DFC_GROUPS_QUE_SOMAM` **de propósito e por decisão**, não
 * por esquecimento — é essa distinção que impede o caso de virar tautologia.
 *
 * MEDIDO NA BASE em 09/09/2026, e é o que dimensiona o risco do `default`:
 * `expense_group` está preenchido em 100% das despesas, com 15 valores DISTINTOS, TODOS
 * conhecidos — zero caem no `default` hoje. O buraco existe e não está materializado.
 */

import fs from 'fs'
import path from 'path'
import {
    DFC_GROUPS_QUE_SOMAM,
    EXPENSE_GROUPS,
    EXPENSE_GROUP_KEYS,
    EXPENSE_GROUP_META,
    EXPENSE_GROUP_OPTIONS,
    EXPENSE_TYPE_LABELS,
    HUB_GROUPS,
    type ExpenseGroupKey,
} from '@/constants/expense-groups'
import {
    CASHIER_CATEGORY,
    getDefaultGroupForCategory,
    getExpenseGroupLabel,
} from '@/constants/cashier-category'

const leia = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), 'src', ...p), 'utf-8')
const DFC = leia('pages', 'dfc', 'index.tsx')
const CATEGORIAS = leia('constants', 'cashier-category.ts')
const HUB = leia('utils', 'hub-engine.ts')
const FLUXO = leia('pages', 'fluxo-de-caixa', 'index.tsx')

describe('o `default` silencioso — o caso que quebra se um grupo novo for esquecido', () => {
    it('TODO grupo da fonte única SOMA em alguma linha do DFC', () => {
        // Extrai os `case '...'` do switch de agregação — é o que separa "somar" de "cair no
        // default". Um grupo acrescentado a EXPENSE_GROUP_KEYS e esquecido lá fica de fora.
        const casesDoSwitch = new Set(
            [...DFC.matchAll(/case '([A-Z_]+)':/g)].map((m) => m[1]),
        )
        // DOIS grupos somam ANTES do switch, por `if ... continue`, e por isso não têm `case`:
        // CUSTO_PRODUTOS (que separa impostos recuperáveis do custo líquido) e RESERVA_TECNICA
        // (que precisa vir antes do fallback textual de Comissões — BUG-DFC-RTCOMISSOES-001).
        // Não basta listá-los: o caso confere que cada um REALMENTE SOMA, senão a exceção viraria
        // uma porta para o mesmo esquecimento que o teste existe para pegar.
        const somamAntesDoSwitch: Record<string, string> = {
            CUSTO_PRODUTOS: 'data.custoProduto[monthKey] +=',
            RESERVA_TECNICA: 'data.reservaTecnica[monthKey] +=',
        }
        for (const [grupo, soma] of Object.entries(somamAntesDoSwitch)) {
            expect(DFC).toContain(soma)
            expect(DFC).toContain(`'${grupo}'`)
        }
        const orfaos = DFC_GROUPS_QUE_SOMAM.filter(
            (g) => !casesDoSwitch.has(g) && !(g in somamAntesDoSwitch),
        )
        expect(orfaos).toEqual([])
    })

    it('AMORTIZACAO tem `case` próprio — não cai no default nem vira subitem de LUCRO', () => {
        expect(DFC).toContain("case 'AMORTIZACAO':")
        expect(DFC).toContain('data.amortizacao[monthKey] += entry.amount')
    })

    it('LUCRO e OUTROS ficam fora de `DFC_GROUPS_QUE_SOMAM` — decisão, não esquecimento', () => {
        // Sem esta distinção o caso acima viraria tautologia: bastaria pôr tudo na lista.
        expect(DFC_GROUPS_QUE_SOMAM).not.toContain('LUCRO')
        expect(DFC_GROUPS_QUE_SOMAM).not.toContain('OUTROS')
        expect(EXPENSE_GROUP_KEYS).toContain('LUCRO')
        expect(EXPENSE_GROUP_KEYS).toContain('OUTROS')
    })

    it('o `case LUCRO` continua sem somar, e a consequência está escrita', () => {
        // REGISTRADO E NÃO CORRIGIDO: 15 lançamentos, R$ 125.318,22 confirmados, não aparecem.
        expect(DFC).toContain("case 'LUCRO':")
        expect(DFC).toContain('125.318,22')
    })
})

describe('a fonte única acabou com as CINCO cópias divergentes', () => {
    it('as quatro listas derivadas cobrem exatamente as mesmas chaves', () => {
        const daFonte = [...EXPENSE_GROUP_KEYS].sort()
        expect(Object.keys(EXPENSE_GROUP_META).sort()).toEqual(daFonte)
        expect(HUB_GROUPS.map((g) => g.group).sort()).toEqual(daFonte)
        expect(Object.keys(EXPENSE_TYPE_LABELS).sort()).toEqual(daFonte)
    })

    it('DEDUCAO_RECEITA está nas quatro — antes estava em duas', () => {
        // Medido antes: presente em HUB_GROUPS e no switch do DFC; AUSENTE do tipo, do seletor
        // e dos rótulos. Era a divergência que o cast escondia.
        expect(EXPENSE_GROUP_KEYS).toContain('DEDUCAO_RECEITA')
        expect(EXPENSE_TYPE_LABELS.DEDUCAO_RECEITA).toBeDefined()
        expect(HUB_GROUPS.some((g) => g.group === 'DEDUCAO_RECEITA')).toBe(true)
        expect(getExpenseGroupLabel('DEDUCAO_RECEITA')).toBe('Deduções da Receita')
    })

    it('nenhuma página redefine a lista de grupos', () => {
        expect(HUB).not.toContain("{ group: 'CUSTO_PRODUTOS',")
        expect(CATEGORIAS).not.toContain("export type ExpenseGroupKey = 'MAO_DE_OBRA' |")
    })

    it('o seletor esconde os grupos técnicos, e só eles', () => {
        // DEDUCAO_RECEITA e OUTROS não são escolhidos à mão: um vem da categoria, o outro é o
        // balde do desconhecido. Aparecer no seletor convidaria a classificar errado.
        const noSeletor = EXPENSE_GROUP_OPTIONS.map((o) => o.value)
        expect(noSeletor).not.toContain('DEDUCAO_RECEITA')
        expect(noSeletor).not.toContain('OUTROS')
        expect(noSeletor).toContain('AMORTIZACAO')
        expect(noSeletor).toContain('LUCRO')
    })

    it('os cinco grupos com cor continuam sendo cinco', () => {
        expect(Object.keys(EXPENSE_GROUPS).sort()).toEqual(
            ['DESPESA_FINANCEIRA', 'DESPESA_FIXA', 'DESPESA_VARIAVEL', 'IMPOSTO', 'MAO_DE_OBRA'],
        )
        for (const g of Object.values(EXPENSE_GROUPS)) expect(g.color).toMatch(/^#[0-9A-F]{6}$/i)
    })
})

describe('o cast que calava o compilador saiu', () => {
    it('nenhuma categoria usa `as ExpenseGroupKey`', () => {
        // Cast em ponto de extensão e default neutro em contrato de cálculo são o MESMO
        // defeito: os dois transformam erro em silêncio. O oposto do #47, onde tornar o campo
        // obrigatório fez o `tsc` apontar os três chamadores de uma vez.
        // Eram CENTO E QUATRO casts, não os dois de `INSS_RETIDO_FONTE` e `ISS_RETIDO_TOMADOR`:
        // o mesmo defeito repetido em toda categoria. Com o tipo correto, `satisfies` confere
        // todos — e o build passou, o que PROVA que os 104 grupos pertencem à união.
        const semComentario = CATEGORIAS.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
        expect(semComentario).not.toContain('as ExpenseGroupKey')
        expect(semComentario.split('satisfies ExpenseGroupKey').length - 1).toBeGreaterThan(100)
    })

    it('o `satisfies` que ficou no lugar VALIDA em vez de calar', () => {
        // `satisfies` confere o valor contra o tipo sem alargá-lo: um grupo inexistente quebra
        // o build, que é exatamente o que o cast impedia.
        expect(CATEGORIAS).toContain("satisfies ExpenseGroupKey")
    })
})

describe('DEVOLUÇÕES — estorno de receita, não despesa', () => {
    const devolucoes = CASHIER_CATEGORY.EXPENSE.DEVOLUCOES as { key: string; value: string; group: ExpenseGroupKey }

    it('existe e usa o grupo DEDUCAO_RECEITA, que já existia', () => {
        expect(devolucoes.value).toBe('Devoluções')
        expect(devolucoes.group).toBe('DEDUCAO_RECEITA')
    })

    it('NÃO é despesa operacional — não cai em nenhum grupo de despesa', () => {
        // É o requisito: reduz o FATURAMENTO. Cair em DESPESA_VARIAVEL a somaria ao custo da
        // operação e o resultado ficaria certo por acaso, com a demonstração dizendo outra coisa.
        expect(devolucoes.group).not.toBe('DESPESA_VARIAVEL')
        expect(devolucoes.group).not.toBe('DESPESA_FIXA')
        expect(devolucoes.group).not.toBe('CUSTO_PRODUTOS')
    })

    it('a resolução por chave devolve o grupo certo', () => {
        expect(getDefaultGroupForCategory('DEVOLUCOES')).toBe('DEDUCAO_RECEITA')
    })

    it('a linha de deduções existe nas TRÊS variantes — antes existia em UMA', () => {
        // Medido: `agg.deducaoReceita` só era exibido em `buildDrePresumidoRET`. Uma devolução
        // lançada por tenant de outro regime era agregada e DESCARTADA por falta de linha —
        // mesmo efeito do `default`, por outro caminho.
        const linhas = DFC.split("buildRow('deducoes_devolucoes'").length - 1
        expect(linhas).toBe(2) // LR/Presumido e Simples; a RET usa a linha `deducoes_receita`
        expect(DFC).toContain("buildRow('deducoes_receita', '(-) Devoluções e Deduções da Receita Bruta'")
    })

    it('as três linhas de dedução contam como % da Receita BRUTA, não da líquida', () => {
        expect(DFC).toContain("'deducoes_receita', 'deducoes_devolucoes',")
    })
})

describe('AMORTIZAÇÃO — categoria própria, depois do resultado operacional', () => {
    const amort = CASHIER_CATEGORY.EXPENSE.AMORTIZACAO as { key: string; value: string; group: ExpenseGroupKey }

    it('tem GRUPO PRÓPRIO, e não é subitem de LUCRO', () => {
        // Se fosse LUCRO, sumiria: aquele grupo é descartado da demonstração.
        expect(amort.group).toBe('AMORTIZACAO')
        expect(amort.group).not.toBe('LUCRO')
        expect(amort.value).toContain('Amortização')
    })

    it('NÃO é despesa operacional', () => {
        expect(amort.group).not.toBe('DESPESA_FINANCEIRA')
        expect(amort.group).not.toBe('DESPESA_FIXA')
        expect(amort.group).not.toBe('DESPESA_VARIAVEL')
    })

    it('a linha existe nas TRÊS variantes — a regra é do NEGÓCIO, não do regime', () => {
        expect(DFC.split("buildRow('amortizacao'").length - 1).toBe(3)
    })

    it('as TRÊS subtraem a amortização do resultado final', () => {
        // Exibir a linha sem subtrair seria a variante 3 de `teste-que-nao-exercita`: a linha
        // aparece e não tem efeito. As três precisam levá-la ao total.
        expect(DFC.split('agg.amortizacao,\n  )').length - 1).toBe(2) // as duas com subtração aninhada
        expect(DFC).toContain('subtractMonths(resultadoFinanceiro, agg.amortizacao)')
    })

    it('a resolução por chave devolve o grupo certo', () => {
        expect(getDefaultGroupForCategory('AMORTIZACAO')).toBe('AMORTIZACAO')
    })
})

describe('Excluir venda a partir do Fluxo de Caixa', () => {
    it('usa a MESMA rota de Vendas, não uma cópia', () => {
        expect(FLUXO).toContain("'/api/delete/sales-permanent'")
        expect(FLUXO).not.toContain('delete_sale_cascade(')
    })

    it('o botão só aparece quando o lançamento VEIO de uma venda', () => {
        // Em lançamento manual não há venda a excluir, e um botão sem o que fazer AFIRMA que a
        // ação existe ali. `.claude/rules/ausente-vs-falso.md`.
        expect(FLUXO).toContain("paymentEntry.origin_type === 'SALE' && paymentEntry.origin_id")
    })

    it('confirma antes, e a confirmação diz o que sai', () => {
        expect(FLUXO).toContain('title="Excluir a venda inteira?"')
        expect(FLUXO).toContain('Irreversível. Venda com pagamento registrado é bloqueada.')
    })

    it('trata o bloqueio de parcela paga — 409 vira aviso, não erro genérico', () => {
        expect(FLUXO).toContain('res.status === 409')
    })

    it('a distinção com o #52 está escrita: NÃO é reverter', () => {
        // O botão removido chamava `/api/delete/cash-entries` e apagava O LANÇAMENTO; este apaga
        // A CADEIA. Mesmo rótulo, mesmo lugar, ação diferente.
        expect(FLUXO).toContain('AÇÃO DIFERENTE')
        expect(FLUXO).toContain('api/delete/cash-entries')
    })
})
