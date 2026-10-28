/**
 * AS ABAS DO MOTOR: cada contagem com a tabela do banco de onde vem e o rótulo da tela. As etapas da família (`atendimentos-ia-etapas.ts`)
 * leem daqui as abas que uma etapa carrega, e o portão de paridade as amarra às CHECK da migração.
 *
 * O bloco "Motor" da página da conta, que também lia este mapa, saiu (27/10/2026, #188) e o código dele foi apagado em 28/10/2026
 * (migração 20261028000001): lia `orcamentista_motor.vigente`, que deixou de existir. O motor mora no CATÁLOGO (o antigo "Fornecedores e tabelas")
 * (`atendimentos-ia-catalogo-de-motores.ts`), e a etapa da família-instância o seleciona.
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
