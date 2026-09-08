/**
 * O critério do Histórico do Cliente: STATUS, não `is_active` — e o tratamento por status.
 *
 * CADA ASSERÇÃO PRECISA FALHAR SEM A SUA CORREÇÃO. Antes destas mudanças:
 *   - as duas consultas de venda carregavam `.eq('is_active', true)` e `.neq('status','CANCELLED')`;
 *   - a lista branca dos orçamentos não tinha `EXCLUIDO`;
 *   - o mapa de pedidos não tinha `EXCLUIDO` e caía no fallback, imprimindo a STRING CRUA;
 *   - não existia marcador de status: o selo de pagamento respondia sozinho;
 *   - não existia carimbo de tempo nenhum.
 * Cada caso abaixo fica VERMELHO se a sua correção for desfeita. MEDIDO, não presumido:
 * restaurada a página do `origin/main`, SEIS casos ficam vermelhos — os que afirmam a fonte
 * (filtros removidos, remoção explicada, constante em vez de lista literal, resolvedor em vez
 * de mapa local, marcador renderizado, ressalva renderizada).
 *
 * RESSALVA DE MÉTODO, dita por extenso: os outros dezenove afirmam funções que NASCERAM nesta
 * correção, então contra o `main` eles não compilam em vez de falhar. O que eles protegem é o
 * DESFAZIMENTO — unificar os dois estilos, tirar `EXCLUIDO` da lista branca, rotular o carimbo
 * como "Excluído em", dar estilo próprio às vendas da janete. Cada um desses gestos deixa um
 * caso vermelho. Chamá-los de "falham sem a correção" no mesmo sentido dos seis seria afirmar
 * mais do que se mediu.
 *
 * OS ORÁCULOS, medidos na base em 08/09/2026 (tenant Salão Eliane):
 *   - VD-96AF84, cliente Felipe Klein, R$ 2,58, PIX, `status='EXCLUIDO'` — criada 06/09,
 *     excluída 08/09 16:37. 1 `sale_item` preservado (produto "Agua mineral"), 1 `cash_entry`
 *     com ZERO ativas, `order_id` NULL (Caso B: direta de orçamento, sem pedido no meio).
 *     É o oráculo do ESMAECIDO.
 *   - VD-C90058 e VD-A8246D, cliente janete, `COMPLETED` com `is_active=false` — o TERCEIRO
 *     ESTADO SEM NOME. Pelo critério novo aparecem como venda NORMAL, sem estilo próprio.
 *
 * VD-2AA2A9 FICA DELIBERADAMENTE FORA DOS ORÁCULOS, e o motivo tem de ficar escrito para
 * ninguém "consertar" a omissão depois sem saber por que ela existe: ela tem `customer_id` E
 * `budget_id` NULOS. Nenhum dos dois caminhos do histórico a alcança, então ela CONTINUA
 * INVISÍVEL depois da correção — e um caso montado sobre ela passaria VERDE sem exercitar o
 * filtro que esta rodada removeu. Ela não está escondida; está DESVINCULADA, que é outra coisa
 * e não se corrige aqui. (Mesma razão para as outras cinco canceladas sem cliente: VD-D28BF1,
 * VD-9D2272, VD-45876C, VD-51B0E2 e VD-F406F8.)
 */

import fs from 'fs'
import path from 'path'
import {
    BUDGET_STATUSES_NO_HISTORICO,
    LIFECYCLE_STYLE,
    RESSALVA_ULTIMA_ALTERACAO,
    ROTULO_ULTIMA_ALTERACAO,
    buildCarimboUltimaAlteracao,
    isDeadDocument,
    resolveDocumentLifecycle,
    resolveOrderStatusLabel,
    statusExibivelNoHistorico,
} from '@/utils/customer-history-status'
import { buildSaleHistoryDetail } from '@/utils/sale-history-detail'

const PAGINA = path.join(process.cwd(), 'src', 'pages', 'clientes', 'index.tsx')
const fonte = fs.readFileSync(PAGINA, 'utf-8')

describe('o filtro que escondia — removido das DUAS consultas de venda', () => {
    // Asserção de CAMINHO, e é o caso limite honesto da regra: o defeito era exatamente a
    // PRESENÇA de dois filtros numa consulta PostgREST. Não há efeito numérico a medir sem
    // mockar o Supabase, e a asserção fica vermelha na fonte anterior à correção.
    it('nenhuma consulta do histórico filtra `is_active` nem status em vendas', () => {
        // As linhas de comentário saem antes da conferência: elas CITAM os filtros removidos,
        // de propósito, e é código executável que está sendo afirmado aqui.
        // A consulta vai do `.from('sales')` até a primeira linha que não é encadeamento nem
        // comentário — delimitar por `),` pegaria código de OUTRA consulta mais abaixo.
        const consultaApos = (t: string) => {
            const linhas: string[] = []
            for (const l of t.split('\n').slice(1)) {
                const corpo = l.trim()
                if (corpo.startsWith('//')) continue
                if (!corpo.startsWith('.')) break
                linhas.push(corpo)
            }
            return linhas.join('\n')
        }
        const trechosDeVenda = fonte.split(".from('sales')").slice(1)
        expect(trechosDeVenda).toHaveLength(2)
        for (const trecho of trechosDeVenda) {
            const consulta = consultaApos(trecho)
            expect(consulta).toContain("select(")
            expect(consulta).not.toContain("eq('is_active', true)")
            expect(consulta).not.toContain("neq('status', 'CANCELLED')")
        }
    })

    it('a remoção está EXPLICADA no código, não feita em silêncio', () => {
        expect(fonte).toContain('significa TRÊS coisas')
        expect(fonte).toContain('O STATUS SEPARA')
    })
})

describe('a lista branca dos orçamentos', () => {
    it('inclui EXCLUIDO', () => {
        expect(BUDGET_STATUSES_NO_HISTORICO).toContain('EXCLUIDO')
    })

    it('inclui CANCELLED — a suspensão da regra de 31/07 para cadeias mortas', () => {
        // ESTE CASO SUBSTITUI UM ANTERIOR que afirmava o contrário, e a troca é deliberada: a
        // decisão de 08/09 revoga a parte da regra de 31/07 que escondia cadeia morta. Não é
        // defeito da regra antiga nem descuido de quem a escreveu — é MUDANÇA DE PROPÓSITO: a
        // regra da época cobria um histórico sem propósito de auditoria, e o propósito nasceu
        // agora. `.claude/rules/decisao-sob-regra-da-epoca.md`.
        expect(BUDGET_STATUSES_NO_HISTORICO).toContain('CANCELLED')
        expect(BUDGET_STATUSES_NO_HISTORICO).toContain('EXCLUIDO')
    })

    it('NÃO reabre DRAFT — rascunho não é cadeia morta, e essa metade da regra permanece', () => {
        expect(BUDGET_STATUSES_NO_HISTORICO).not.toContain('DRAFT')
        expect(statusExibivelNoHistorico('ORCAMENTO', 'DRAFT')).toBe(false)
        expect(statusExibivelNoHistorico('PEDIDO', 'DRAFT')).toBe(false)
    })

    it('inclui SENT_TO_ORDER — lacuna medida, status criado DEPOIS da regra de 30/07', () => {
        // 2 linhas na base, uma delas o ORC-8520 do Felipe Klein: ficava escondido sem ninguém
        // ter decidido esconder.
        expect(BUDGET_STATUSES_NO_HISTORICO).toContain('SENT_TO_ORDER')
    })

    it('o filtro de status saiu das CONSULTAS — a cadeia tem de chegar inteira', () => {
        // Requisito do cálculo, não preferência: filtrar antes faria `buildChainIndex` concluir
        // que o topo da cadeia é o estágio anterior. O filtro é aplicado DEPOIS.
        expect(fonte).not.toContain("BUDGET_STATUSES_NO_HISTORICO as unknown")
        expect(fonte).not.toContain('\'("DRAFT","CANCELLED")\'')
        expect(fonte).toContain('statusExibivelNoHistorico')
    })
})

describe('o pedido EXCLUIDO deixa de imprimir a string crua', () => {
    it('traduz EXCLUIDO para "Excluído"', () => {
        const conf = resolveOrderStatusLabel('EXCLUIDO')
        expect(conf.label).toBe('Excluído')
        // O defeito anterior, nomeado: o mapa não tinha a entrada e devolvia o status cru.
        expect(conf.label).not.toBe('EXCLUIDO')
    })

    it('mantém os rótulos que já existiam', () => {
        expect(resolveOrderStatusLabel('CANCELLED').label).toBe('Cancelado')
        expect(resolveOrderStatusLabel('SENT_TO_SALE').label).toBe('Efetivado')
    })

    it('status desconhecido ainda cai no cru — não se inventa rótulo', () => {
        expect(resolveOrderStatusLabel('QUALQUER_COISA').label).toBe('QUALQUER_COISA')
    })

    it('a página usa o resolvedor, não um mapa local', () => {
        expect(fonte).toContain('resolveOrderStatusLabel(o.status)')
        expect(fonte).not.toContain('const ORDER_STATUS_MAP')
    })
})

describe('o estado de vida sai do STATUS', () => {
    it('EXCLUIDO é excluído; CANCELLED é cancelado; COMPLETED é vivo', () => {
        expect(resolveDocumentLifecycle('EXCLUIDO')).toBe('EXCLUIDO')
        expect(resolveDocumentLifecycle('CANCELLED')).toBe('CANCELADO')
        expect(resolveDocumentLifecycle('COMPLETED')).toBe('ATIVO')
    })

    it('as DUAS vendas da janete — o terceiro estado — são ATIVO, sem estilo próprio', () => {
        // `is_active = false` com `status = 'COMPLETED'`. Pelo critério novo elas aparecem como
        // venda NORMAL: o critério é o status, e o status diz concluída. Está CERTO pela regra e
        // provavelmente errado pela intenção de quem as desativou — registrado, sem quarto estilo.
        for (const venda of [
            { sale_code: 'VD-C90058', status: 'COMPLETED', is_active: false },
            { sale_code: 'VD-A8246D', status: 'COMPLETED', is_active: false },
        ]) {
            const ciclo = resolveDocumentLifecycle(venda.status)
            expect(ciclo).toBe('ATIVO')
            expect(LIFECYCLE_STYLE[ciclo].markerLabel).toBeNull()
            expect(LIFECYCLE_STYLE[ciclo].opacity).toBe(1)
        }
    })

    it('status desconhecido é ATIVO — não se marca documento por não reconhecer o rótulo', () => {
        expect(resolveDocumentLifecycle('SENT_TO_ORDER')).toBe('ATIVO')
        expect(resolveDocumentLifecycle(null)).toBe('ATIVO')
        expect(resolveDocumentLifecycle(undefined)).toBe('ATIVO')
    })

    it('isDeadDocument separa vivo de morto', () => {
        expect(isDeadDocument('ATIVO')).toBe(false)
        expect(isDeadDocument('CANCELADO')).toBe(true)
        expect(isDeadDocument('EXCLUIDO')).toBe(true)
    })
})

describe('CANCELADO e EXCLUÍDO têm aparências DISTINTAS', () => {
    // Se ficarem iguais, some a distinção que a rodada inteira criou — cancelar permite retomar,
    // excluir é a última instância. Este caso é o que impede alguém de unificar os dois estilos.
    it('os dois estilos divergem em mais de um atributo', () => {
        const cancelado = LIFECYCLE_STYLE.CANCELADO
        const excluido = LIFECYCLE_STYLE.EXCLUIDO
        expect(excluido.markerLabel).not.toBe(cancelado.markerLabel)
        expect(excluido.opacity).not.toBe(cancelado.opacity)
        expect(excluido.riscarValor).not.toBe(cancelado.riscarValor)
    })

    it('o cancelado NÃO é esmaecido — é documento vivo, pode ser retomado', () => {
        expect(LIFECYCLE_STYLE.CANCELADO.opacity).toBe(1)
        expect(LIFECYCLE_STYLE.CANCELADO.markerLabel).toBe('Cancelado')
    })

    it('o excluído é esmaecido E rotulado — a opacidade é reforço, nunca o marcador sozinho', () => {
        // Opacidade só se lê por CONTRASTE: um cliente com uma venda só, e ela excluída, não tem
        // com o que comparar. Por isso o rótulo em texto é obrigatório.
        expect(LIFECYCLE_STYLE.EXCLUIDO.opacity).toBeLessThan(1)
        expect(LIFECYCLE_STYLE.EXCLUIDO.markerLabel).toBe('Excluído')
    })

    it('o marcador é elemento PRÓPRIO na tela, ao lado do selo de pagamento', () => {
        // O selo sai das `cash_entries` ATIVAS, que as cascatas desativam: sozinho ele diria
        // "Pago" em VD-96AF84 (PIX) e "Aguardando Pagamento" nas canceladas BOLETO. Os dois
        // elementos precisam conviver — este caso falha se alguém substituir um pelo outro.
        expect(fonte).toContain('estilo.markerLabel && (')
        expect(fonte).toContain('{entry.badgeLabel}')
    })
})

describe('o carimbo de tempo — rótulo IMPRECISO sobre dado impreciso', () => {
    const CARIMBO_VD96AF84 = '2026-09-08T16:37:15.061903Z'

    it('rotula como "Última alteração", NUNCA como "Excluído em"', () => {
        const c = buildCarimboUltimaAlteracao({ lifecycle: 'EXCLUIDO', updatedAt: CARIMBO_VD96AF84 })
        expect(c).not.toBeNull()
        expect(c!.rotulo).toBe(ROTULO_ULTIMA_ALTERACAO)
        // O ponto do requisito: "Excluído em 08/09" AFIRMARIA MAIS DO QUE SE SABE.
        expect(c!.rotulo).not.toMatch(/exclu/i)
    })

    it('a ressalva de que é PROXY acompanha o valor', () => {
        const c = buildCarimboUltimaAlteracao({ lifecycle: 'EXCLUIDO', updatedAt: CARIMBO_VD96AF84 })
        expect(c!.ressalva).toBe(RESSALVA_ULTIMA_ALTERACAO)
        expect(c!.ressalva).toMatch(/não necessariamente da exclusão/)
    })

    it('a ressalva é RENDERIZADA na tela, não só escrita no código', () => {
        // A exigência é explícita: o auditor tem de saber o que está lendo.
        expect(fonte).toContain('entry.carimbo.ressalva')
        expect(fonte).toContain('entry.carimbo.rotulo')
    })

    it('documento vivo não tem carimbo — não há nada a auditar', () => {
        expect(buildCarimboUltimaAlteracao({ lifecycle: 'ATIVO', updatedAt: CARIMBO_VD96AF84 })).toBeNull()
    })

    it('sem `updated_at` não se inventa data', () => {
        expect(buildCarimboUltimaAlteracao({ lifecycle: 'EXCLUIDO', updatedAt: null })).toBeNull()
        expect(buildCarimboUltimaAlteracao({ lifecycle: 'EXCLUIDO', updatedAt: undefined })).toBeNull()
    })
})

describe('o rastro da venda excluída chega à tela — PRODUTO e SERVIÇO', () => {
    // O dado sobreviveu ao soft delete (a linha permanece, o CASCADE não disparou). O que se
    // afirma aqui é que ele CHEGA MONTADO, com itens e valor, nos dois tipos de item.
    const PRODUTO = { id: 'd3064175-0ded-4feb-a0ef-a92be9f32ae7', name: 'Agua mineral' }
    const SERVICO = { id: 'svc-corte', name: 'Corte masculino' }

    it('VD-96AF84 (produto) mantém item, quantidade, unitário e total', () => {
        const detalhe = buildSaleHistoryDetail({
            sale: { final_value: 2.58, payment_method: 'PIX' },
            items: [{ product_id: PRODUTO.id, quantity: 1, unit_price: 2.58, description: null }],
            cashEntries: [],
            products: [PRODUTO],
        })
        expect(detalhe.itens).toHaveLength(1)
        expect(detalhe.itens[0]).toMatchObject({ nome: 'Agua mineral', tipo: 'PRODUTO', quantidade: 1 })
        expect(detalhe.total).toBe(2.58)
    })

    it('a mesma venda com SERVIÇO mantém o item, com o tipo certo', () => {
        const detalhe = buildSaleHistoryDetail({
            sale: { final_value: 80, payment_method: 'PIX' },
            items: [{ service_id: SERVICO.id, quantity: 2, unit_price: 40, description: null }],
            cashEntries: [],
            services: [SERVICO],
        })
        expect(detalhe.itens[0]).toMatchObject({ nome: 'Corte masculino', tipo: 'SERVICO', total: 80 })
        expect(detalhe.total).toBe(80)
    })

    it('o parcelamento é OMITIDO, não zerado — `cash_entries` não tem status, só `is_active`', () => {
        // A cascata desativa os lançamentos, e a consulta do histórico traz só os ativos. Ali o
        // booleano é o ÚNICO marcador e significa REMOVIDO — o critério "status separa" não se
        // aplica porque não há status a separar. Lista vazia diria "zero parcelas"; `null` não
        // diz nada, que é a leitura certa. `.claude/rules/ausente-vs-falso.md`.
        const detalhe = buildSaleHistoryDetail({
            sale: { final_value: 2.58, payment_method: 'PIX' },
            items: [{ product_id: PRODUTO.id, quantity: 1, unit_price: 2.58 }],
            cashEntries: [],
            products: [PRODUTO],
        })
        expect(detalhe.parcelamento).toBeNull()
    })
})
