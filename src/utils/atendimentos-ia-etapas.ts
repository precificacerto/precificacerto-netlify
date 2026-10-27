/**
 * As ETAPAS e a PLANILHA do motor (dono do produto, 27/10/2026; migração 20261027000002).
 *
 * O motor deixou de ser "o arquivo da tabela do fornecedor". São duas coisas separadas:
 *   - a PLANILHA (`orcamentista_motor`): a fonte de dados, importada UMA vez por (família, fornecedor de
 *     perfil). O Motor_Wolf_PVC é a planilha da família PVC com o fornecedor Wolff — não pertence a uma etapa;
 *   - a ETAPA (`orcamentista_familia_etapa`): o que o consultor cadastra por família — número, rótulo LIVRE,
 *     AÇÃO de uma lista FECHADA, texto de instrução e quais abas da planilha ela carrega. Várias etapas leem a
 *     mesma planilha: o apanhado carrega a Detalhe e as Variáveis; a relação de barras carrega tudo.
 *
 * O RÓTULO É LIVRE; A AÇÃO NÃO É. "Etapa sem ação da lista é erro, não etapa nova": o código precisa saber o que
 * fazer ali (apanhar, confirmar, gerar o PDF, calcular as barras, enviar), e um rótulo não diz isso.
 *
 * ESTA LISTA MORA TAMBÉM NO BANCO (as CHECK da etapa). Acrescentar uma ação aqui exige a migração que a põe na
 * CHECK, e é isso que o portão `atendimentos-ia-etapas-paridade.test.ts` confere — a lista não vive em dois
 * lugares sem alguém olhar os dois (`copia-divergente.md`).
 */
import { CONTAGENS_DO_MOTOR, type ChaveDaContagem } from '@/utils/atendimentos-ia-motor'

/** O que o código sabe fazer numa etapa. Ordem = a do processo do dono do produto. */
export const ACOES_DA_ETAPA = ['APANHAR', 'CONFIRMAR', 'GERAR_LEVANTAMENTO', 'CALCULAR_BARRAS', 'ENVIAR'] as const
export type AcaoDaEtapa = (typeof ACOES_DA_ETAPA)[number]

export const ROTULO_DA_ACAO: Record<AcaoDaEtapa, string> = {
    APANHAR: 'Apanhar o que o vendedor pede',
    CONFIRMAR: 'Confirmar o apanhado',
    GERAR_LEVANTAMENTO: 'Gerar o levantamento',
    CALCULAR_BARRAS: 'Calcular as barras e os materiais',
    ENVIAR: 'Enviar ao vendedor',
}

export const ehAcaoDaEtapa = (v: unknown): v is AcaoDaEtapa => typeof v === 'string' && (ACOES_DA_ETAPA as readonly string[]).includes(v)

/**
 * As abas da PLANILHA que uma etapa pode carregar: as contagens do bloco Motor, sem os itens de preço — o preço é
 * da tabela do fornecedor (`orcamentista_tabela_item`), não do motor. Vêm de `CONTAGENS_DO_MOTOR`: nenhuma lista
 * de abas fica escrita em outro lugar.
 */
export type AbaDaEtapa = Exclude<ChaveDaContagem, 'itens_de_preco'>
export const ABAS_DA_ETAPA: readonly AbaDaEtapa[] = CONTAGENS_DO_MOTOR.map((c) => c.chave).filter((c): c is AbaDaEtapa => c !== 'itens_de_preco')

/**
 * As 14 tabelas que pendem de `tabela_id` hoje (13 do motor e a das importações) e que passam a ter `motor_id`:
 * cada linha é da tabela do fornecedor OU da planilha, nunca das duas e nunca de nenhuma (CHECK `_um_dono`).
 */
export const TABELAS_DO_MOTOR = [
    'orcamentista_importacao',
    'orcamentista_motor_baguete',
    'orcamentista_motor_formula',
    'orcamentista_motor_formula_familia',
    'orcamentista_motor_insumo',
    'orcamentista_motor_otimizacao',
    'orcamentista_motor_perfil',
    'orcamentista_motor_regra',
    'orcamentista_motor_tipologia',
    'orcamentista_motor_tipologia_detalhe',
    'orcamentista_motor_tipologia_tempo',
    'orcamentista_motor_validacao',
    'orcamentista_motor_variavel',
    'orcamentista_motor_vidro',
] as const
