/**
 * Atendimentos I.A. — o MODELO da LLM e a versão da API da Anthropic. ÚNICO lugar do código onde o
 * nome do modelo aparece: quem precisar dele importa daqui.
 *
 * ══ POR QUE NÃO VEM DE `orcamentista_config.modelo` ══
 * Aquela coluna NÃO é o modelo da LLM: é o modelo de ATENDIMENTO da conta (FABRICACAO | REVENDA |
 * SERVICO), com CHECK no banco e amarrada a `nicho_id` por `orcamentista_config_nicho_exige_modelo`.
 * Medido em produção em 22/10/2026. Usá-la aqui mandaria "FABRICACAO" como modelo para a Anthropic.
 * Um modelo por conta precisaria de coluna própria — ver o ponto marcado em `conversa-da-ia.ts`.
 *
 * ══ POR QUE ESTE MODELO ══
 * `claude-sonnet-5-5`, decisão do dono do produto (22/10/2026): nesta geração o ID sem data É o
 * snapshot fixo, não um apelido que escorrega. US$ 2 / US$ 10 por milhão de tokens (entrada /
 * saída); a diferença para o Haiku numa conversa de WhatsApp é de centavos, e a extração de campos
 * é onde errar custa caro.
 */
export const MODELO_PADRAO_DA_IA = 'claude-sonnet-5-5'

/**
 * O header `anthropic-version`. Sem o SDK ele é obrigatório: sem ele a API recusa. Nesta versão a
 * API RECUSA `temperature`, `top_p` e `top_k` — não os mande.
 */
export const VERSAO_DA_API_ANTHROPIC = '2026-10-21'

export const URL_DA_API_ANTHROPIC = 'https://api.anthropic.com/v1/messages'
