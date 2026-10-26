/**
 * O BLOCO MOTOR da conta (dono do produto, 26/10/2026): o que a conta tem CARREGADO, na ordem da cascata
 * FAMÍLIA → LINHA → TIPOLOGIA → PERFIS, VIDROS, INSUMOS → PREÇO. Este arquivo é o mapa que a rota e a tela
 * leem juntas: cada contagem com a tabela do banco de onde vem e o rótulo da tela, e cada aba de UMA
 * tipologia com as colunas mostradas. Nenhuma lista de abas fica escrita em outro lugar.
 *
 * O bloco MOSTRA. "O BLOCO MOTOR NÃO É CAMPO DE TEXTO": o que se edita nele é só escolha estruturada — a
 * família da tabela (pela rota da tabela) e o critério de custo das barras (pela rota da categoria da base
 * de conhecimento, que faz merge).
 */

/** As contagens do resumo, na ordem da cascata: a chave da resposta, a tabela do banco e o rótulo. */
export const CONTAGENS_DO_MOTOR = [
    { chave: 'tipologias', tabela: 'orcamentista_motor_tipologia_detalhe', coluna: 'tipologia', rotulo: 'Tipologias (Detalhe)' },
    { chave: 'perfis', tabela: 'orcamentista_motor_perfil', coluna: 'id', rotulo: 'Perfis' },
    { chave: 'formulas', tabela: 'orcamentista_motor_formula', coluna: 'id', rotulo: 'Fórmulas' },
    { chave: 'variaveis', tabela: 'orcamentista_motor_variavel', coluna: 'id', rotulo: 'Variáveis' },
    { chave: 'vidros', tabela: 'orcamentista_motor_vidro', coluna: 'id', rotulo: 'Vidros' },
    { chave: 'baguetes', tabela: 'orcamentista_motor_baguete', coluna: 'id', rotulo: 'Baguetes' },
    { chave: 'insumos', tabela: 'orcamentista_motor_insumo', coluna: 'id', rotulo: 'Insumos' },
    { chave: 'validacoes', tabela: 'orcamentista_motor_validacao', coluna: 'id', rotulo: 'Validações' },
    { chave: 'otimizacao', tabela: 'orcamentista_motor_otimizacao', coluna: 'id', rotulo: 'Otimização' },
    // o nome da tabela está vencido: a "família" dela é a LINHA do motor
    { chave: 'formulas_da_linha', tabela: 'orcamentista_motor_formula_familia', coluna: 'id', rotulo: 'Fórmulas da linha' },
    { chave: 'regras', tabela: 'orcamentista_motor_regra', coluna: 'id', rotulo: 'Regras (Motor por barra)' },
    { chave: 'tempos', tabela: 'orcamentista_motor_tipologia_tempo', coluna: 'tipologia', rotulo: 'Tempos de fabricação' },
    { chave: 'itens_de_preco', tabela: 'orcamentista_tabela_item', coluna: 'id', rotulo: 'Itens de preço (tabela do fornecedor)' },
] as const

export type ChaveDaContagem = (typeof CONTAGENS_DO_MOTOR)[number]['chave']

/** As abas de UMA tipologia: a chave da resposta, a tabela do banco, o rótulo e as colunas mostradas. */
export const ABAS_DA_TIPOLOGIA = [
    { chave: 'perfis', tabela: 'orcamentista_motor_perfil', rotulo: 'Perfis', colunas: ['ordem', 'linha', 'perfil', 'descricao', 'corte', 'qtd', 'medida', 'posicao', 'esp_vidro', 'condicao', 'obs'] },
    { chave: 'formulas', tabela: 'orcamentista_motor_formula', rotulo: 'Fórmulas', colunas: ['ordem', 'linha', 'variavel', 'descricao', 'formula'] },
    { chave: 'variaveis', tabela: 'orcamentista_motor_variavel', rotulo: 'Variáveis', colunas: ['ordem', 'linha', 'variavel', 'descricao', 'padrao', 'min_max', 'condicao', 'opcoes'] },
    { chave: 'vidros', tabela: 'orcamentista_motor_vidro', rotulo: 'Vidros', colunas: ['ordem', 'linha', 'vidro', 'largura', 'altura', 'qtd', 'fixacao', 'condicao'] },
    { chave: 'baguetes', tabela: 'orcamentista_motor_baguete', rotulo: 'Baguetes', colunas: ['ordem', 'linha', 'baguete', 'descricao', 'espessuras_vidro', 'qtd_medida_condicao'] },
    { chave: 'insumos', tabela: 'orcamentista_motor_insumo', rotulo: 'Insumos', colunas: ['ordem', 'linha', 'insumo', 'descricao', 'qtd', 'condicao', 'obs'] },
    { chave: 'validacoes', tabela: 'orcamentista_motor_validacao', rotulo: 'Validações', colunas: ['ordem', 'linha', 'condicao_valida', 'mensagem'] },
] as const

export type ChaveDaAba = (typeof ABAS_DA_TIPOLOGIA)[number]['chave']

export type CriterioDeCustoDaBarra = 'BARRA_INTEIRA' | 'CONSUMO_REAL'
export const ROTULO_DO_CRITERIO: Record<CriterioDeCustoDaBarra, string> = { BARRA_INTEIRA: 'Barra inteira', CONSUMO_REAL: 'Consumo real' }

export interface TabelaNoMotor {
    tabela_id: string
    fornecedor: string
    arquivo_nome: string
    motor_nome: string
    vigencia: string | null
    /** A chave da família; null = não informada. */
    familia: string | null
    /** O NOME das contas que usam a tabela: trocar a família muda para todas. */
    contas_usando: string[]
    linhas: Array<{ linha: string | null; tipologias: number }>
    contagens: Record<ChaveDaContagem, number>
    otimizacao: Array<{ parametro: string | null; valor: string | null }>
}

export interface MotorDaConta {
    tabelas: TabelaNoMotor[]
    familias: Array<{ chave: string; rotulo: string; ordem: number }>
    /** O critério de custo das barras de cada matéria-prima da conta (base de conhecimento, PERFIL). null = não configurado. */
    materias_primas: Array<{ id: string; nome: string; criterio_custo_barra: CriterioDeCustoDaBarra | null }>
}

export interface TipologiaNoMotor {
    tipologia: string
    linha: string | null
    descricao: string | null
    tipo: string | null
    larg_min_mm: number | null
    larg_max_mm: number | null
    alt_min_mm: number | null
    alt_max_mm: number | null
    n_perfis: number | null
    n_vidros: number | null
    n_insumos: number | null
    tempo_fabricacao_min: number | null
    tempo_origem: string | null
}

export type AbasDaTipologia = Record<ChaveDaAba, Array<Record<string, unknown>>>

const base = (tenantId: string) => `/api/super-admin/atendimentos-ia/contas/${tenantId}/motor`
export const ROTAS_DO_MOTOR = {
    resumo: (tenantId: string) => base(tenantId),
    tipologias: (tenantId: string, tabelaId: string) => `${base(tenantId)}/tipologias?tabela=${encodeURIComponent(tabelaId)}`,
    tipologia: (tenantId: string, tabelaId: string, tipologia: string) =>
        `${base(tenantId)}/tipologia?tabela=${encodeURIComponent(tabelaId)}&tipologia=${encodeURIComponent(tipologia)}`,
}
