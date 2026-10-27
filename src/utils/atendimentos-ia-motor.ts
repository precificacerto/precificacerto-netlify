/**
 * O BLOCO MOTOR da conta (dono do produto, 26/10/2026): o que a conta tem CARREGADO, na ordem da cascata
 * FAMÍLIA → LINHA → TIPOLOGIA → PERFIS, VIDROS, INSUMOS → PREÇO. Este arquivo é o mapa que a rota e a tela
 * leem juntas: cada contagem com a tabela do banco de onde vem e o rótulo da tela, e cada aba de UMA
 * tipologia com as colunas mostradas. Nenhuma lista de abas fica escrita em outro lugar.
 *
 * O bloco MOSTRA. "O BLOCO MOTOR NÃO É CAMPO DE TEXTO": o que se edita nele é só escolha estruturada — a
 * família e a marca de vigente da tabela (pela rota da tabela) e o critério de custo das barras (pela rota da
 * categoria da base de conhecimento, que faz merge).
 *
 * AS TABELAS SÃO AS DERIVADAS (dono do produto, 26/10/2026): as dos fornecedores que a base de conhecimento
 * da conta vincula (`tabelas-da-conta.ts`). Cada uma diz a categoria pela qual entra e se VALE para levantamento
 * novo (uma por fornecedor e família; com mais de uma, a vigente).
 *
 * O BLOCO LISTA SÓ O QUE TEM MOTOR CARREGADO (dono do produto, 27/10/2026), medido pelo CONTEÚDO — tipologias na
 * Detalhe —, não pelo nome do arquivo: `motor_nome` pode estar preenchido com uma importação que falhou, ou vazio
 * com conteúdo. A tabela de preço (sem tipologias) não é motor e sai da lista; nada é apagado. Cada motor diz A QUAL
 * FAMÍLIA pertence. Há dois lugares onde o motor mora: a TABELA do fornecedor (o modelo de hoje, que a conversa
 * lê) e a PLANILHA (`orcamentista_motor`, o modelo novo, por família e fornecedor de perfil), que só o PR C
 * enche. ARQUIVAR é da planilha: sai da lista e da conversa, o dado fica. Excluir não existe.
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
/** As contagens que são da PLANILHA: todas menos o preço, que é da tabela do fornecedor. */
export type AbaDaPlanilha = Exclude<ChaveDaContagem, 'itens_de_preco'>

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

/**
 * DE ONDE VEM o motor listado, e o que a conversa faz com ele HOJE: a tabela do fornecedor é lida (o PR D troca os
 * leitores); a planilha está guardada para o PR C e ainda não é lida. A tela diz isso, em vez de deixar a lista
 * sugerir que os dois valem igual.
 */
export const ROTULO_DA_ORIGEM = {
    TABELA: 'Motor da tabela do fornecedor — a conversa lê este',
    PLANILHA: 'Planilha do motor — a conversa ainda não lê',
} as const
export const AVISO_NENHUMA_COM_MOTOR = 'Nenhuma tabela desta conta tem o motor carregado: a conversa recusa escolher a tipologia até haver uma.'
export const SEM_MOTOR_NA_CONTA = 'A conta não tem nenhum motor carregado. Tabela de preço (sem tipologias) não é motor e não aparece aqui.'
export const fraseDoArquivar = (arquivo: string) =>
    `Arquivar "${arquivo}"? Ele sai da lista e da conversa; o conteúdo fica guardado e nada é apagado. Excluir não existe.`
const juntar = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)
/** Fornecedor vinculado sem tabela. No PERFIL a conversa recusa; nas outras categorias é só este aviso. */
export const fraseDoFornecedorSemTabela = (fornecedor: string, categorias: string[]) =>
    `${fornecedor} está vinculado na base de conhecimento (${juntar(categorias)}) e não tem tabela cadastrada.`
    + (categorias.includes('PERFIL') ? ' Como é do perfil, a conversa recusa escolher a tipologia até ele ter tabela.' : '')
export const fraseDoParSemVigente = (fornecedor: string, familia: string | null, arquivos: string[]) =>
    `${fornecedor} tem ${arquivos.length} tabelas ${familia === null ? 'sem a família informada' : `da família ${familia}`} (${juntar(arquivos)}) `
    + 'e nenhuma está marcada como vigente: nenhuma vale para levantamento novo. Marque a vigente.'

export interface TabelaNoMotor {
    tabela_id: string
    fornecedor: string
    arquivo_nome: string
    motor_nome: string
    vigencia: string | null
    /** A chave da família; null = não informada. */
    familia: string | null
    /** O NOME das contas que usam a tabela (as que vinculam o fornecedor dela): trocar a família muda para todas. */
    contas_usando: string[]
    /** As categorias da base de conhecimento pelas quais ESTA conta vincula o fornecedor. */
    categorias: string[]
    /** A marca de vigente (migração 20261026000005). */
    vigente: boolean
    /** Vale para levantamento novo: a única do par (fornecedor, família), ou a vigente dele. */
    vale: boolean
    /** Tem tipologias na Detalhe: entra na conversa. Sem: tabela de preço. */
    com_motor: boolean
    linhas: Array<{ linha: string | null; tipologias: number }>
    contagens: Record<ChaveDaContagem, number>
    otimizacao: Array<{ parametro: string | null; valor: string | null }>
}

/** A planilha do motor (`orcamentista_motor`) que a conta usa: o fornecedor dela é vinculado na base de conhecimento. */
export interface PlanilhaNoMotor {
    motor_id: string
    /** A chave da família — sempre informada: a planilha é de (família, fornecedor de perfil). */
    familia: string
    fornecedor: string
    arquivo_nome: string
    /** A vigente do par (família, fornecedor). Arquivar tira a marca. */
    vigente: boolean
    /** O NOME das contas que usam a planilha (as que vinculam o fornecedor): arquivar sai da lista de TODAS elas. */
    contas_usando: string[]
    linhas: Array<{ linha: string | null; tipologias: number }>
    /** Sem os itens de preço: o preço é da tabela do fornecedor. */
    contagens: Record<AbaDaPlanilha, number>
    otimizacao: Array<{ parametro: string | null; valor: string | null }>
}

export interface MotorDaConta {
    /** Só as tabelas COM motor carregado (tipologias > 0). A tabela de preço não é motor e não entra aqui. */
    tabelas: TabelaNoMotor[]
    /** As planilhas COM motor carregado e não arquivadas, das famílias e fornecedores que a conta vincula. */
    planilhas: PlanilhaNoMotor[]
    familias: Array<{ chave: string; rotulo: string; ordem: number }>
    /** O critério de custo das barras de cada matéria-prima da conta (base de conhecimento, PERFIL). null = não configurado. */
    materias_primas: Array<{ id: string; nome: string; criterio_custo_barra: CriterioDeCustoDaBarra | null }>
    avisos: {
        fornecedores_sem_tabela: Array<{ fornecedor: string; categorias: string[] }>
        pares_sem_vigente: Array<{ fornecedor: string; familia: string | null; arquivos: string[] }>
        nenhuma_com_motor: boolean
    }
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

/** De quem é o motor que o detalhe lê: de uma tabela do fornecedor, ou de uma planilha. */
export type DonoDoMotor = { tabela: string } | { motor: string }
const donoNaRota = (d: DonoDoMotor) => ('tabela' in d ? `tabela=${encodeURIComponent(d.tabela)}` : `motor=${encodeURIComponent(d.motor)}`)

const base = (tenantId: string) => `/api/super-admin/atendimentos-ia/contas/${tenantId}/motor`
export const ROTAS_DO_MOTOR = {
    resumo: (tenantId: string) => base(tenantId),
    tipologias: (tenantId: string, dono: DonoDoMotor | string) => `${base(tenantId)}/tipologias?${donoNaRota(typeof dono === 'string' ? { tabela: dono } : dono)}`,
    tipologia: (tenantId: string, dono: DonoDoMotor | string, tipologia: string) =>
        `${base(tenantId)}/tipologia?${donoNaRota(typeof dono === 'string' ? { tabela: dono } : dono)}&tipologia=${encodeURIComponent(tipologia)}`,
    /** POST `{ motor }` — arquiva a planilha (`superadmin_arquivar_motor`). Não existe rota de excluir. */
    arquivar: (tenantId: string) => `${base(tenantId)}/arquivar`,
}
