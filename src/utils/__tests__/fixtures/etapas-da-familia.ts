/**
 * As ETAPAS DECLARADAS de uma família nos testes (dono do produto, 04/11/2026): o item do catálogo diz a AÇÃO; a etapa da conta diz o número (a
 * ordem), a instrução e o motor. É o estado da De Paula medido em 04/11/2026: dois itens, "Apanhado e levantamento de esquadrias"
 * (GERAR_LEVANTAMENTO) e "Relação de barras, materiais e tempo" (CALCULAR_BARRAS), um uso cada, instrução vazia.
 */
export const ITEM_DO_LEVANTAMENTO = 'cat-levantamento'
export const ITEM_DO_CALCULO = 'cat-calculo'
export const ITEM_DO_APANHADO = 'cat-apanhado'
export const ITEM_DA_CONFIRMACAO = 'cat-confirmacao'
export const ITEM_DO_ENVIO = 'cat-envio'

export const CATALOGO_DE_ETAPAS = [
    { id: ITEM_DO_APANHADO, nome: 'Apanhado do pedido', acao: 'APANHAR', abas: ['tipologias', 'variaveis'], ordem: 1 },
    { id: ITEM_DA_CONFIRMACAO, nome: 'Confirmação do apanhado', acao: 'CONFIRMAR', abas: [], ordem: 2 },
    { id: ITEM_DO_LEVANTAMENTO, nome: 'Apanhado e levantamento de esquadrias', acao: 'GERAR_LEVANTAMENTO', abas: ['tipologias', 'variaveis', 'vidros', 'formulas_da_linha'], ordem: 3 },
    {
        id: ITEM_DO_CALCULO, nome: 'Relação de barras, materiais e tempo', acao: 'CALCULAR_BARRAS', ordem: 4,
        abas: ['tipologias', 'perfis', 'formulas', 'variaveis', 'vidros', 'baguetes', 'insumos', 'validacoes', 'formulas_da_linha', 'regras', 'tempos'],
    },
    { id: ITEM_DO_ENVIO, nome: 'Envio ao vendedor', acao: 'ENVIAR', abas: [], ordem: 5 },
]

type Etapa = { id: string; tenant_id: string; materia_prima_id: string; numero: number; etapa_catalogo_id: string; instrucao: string; motor_id: string | null }

let sequencia = 0
/** Uma etapa da conta: o número (a ordem), o item do catálogo (a ação) e o motor. */
export const etapa = (tenant: string, materiaPrima: string, numero: number, item: string, motor: string | null, instrucao = ''): Etapa =>
    ({ id: `etapa-${materiaPrima}-${numero}-${++sequencia}`, tenant_id: tenant, materia_prima_id: materiaPrima, numero, etapa_catalogo_id: item, instrucao, motor_id: motor })

/** As duas etapas da De Paula: 1 levantamento, 2 cálculo, o mesmo motor nas duas. */
export const etapasPadrao = (tenant: string, materiaPrima: string, motor: string): Etapa[] =>
    [etapa(tenant, materiaPrima, 1, ITEM_DO_LEVANTAMENTO, motor), etapa(tenant, materiaPrima, 2, ITEM_DO_CALCULO, motor)]
