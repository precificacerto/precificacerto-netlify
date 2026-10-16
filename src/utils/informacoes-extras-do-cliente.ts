/**
 * informacoes-extras-do-cliente.ts — o que sai do cabeçalho e vai para "Mais informações".
 *
 * O CABEÇALHO FICA COM TRÊS COISAS: nome, telefone e situação. Documento, cidade/UF e
 * e-mail saem — eles não são o que se olha ao abrir a ficha, e ocupavam a linha que o
 * telefone e a situação precisam.
 *
 * A TRAVA DO BOTÃO, E ELA É POR CLIENTE
 * --------------------------------------
 * Medido em 16/10/2026, sobre os 116 clientes: `document`, `city`, `state_code`, `ie`,
 * `email`, `cep`, `birth_date`, `address`, `notes` e `owner_id` estão **vazios em 116 de
 * 116**, e `is_icms_contributor` é não-nulo nos 116 e **`false` em todos**.
 *
 * Um botão que abre dez travessões e um "Não" é pior que não existir: ele ensina que ali
 * não há nada, e no dia em que houver ninguém vai clicar. Por isso **em CONSULTA o botão só
 * aparece se ao menos um campo daquele cliente tiver conteúdo**.
 *
 * O critério é POR CLIENTE, nunca pela base. O primeiro cliente cadastrado com e-mail ganha
 * o botão sem ninguém tocar em código — uma trava medida contra a base inteira viraria uma
 * constante errada no dia seguinte (`fato-vs-referencia.md`: a medição de hoje não é regra
 * de amanhã).
 *
 * **EM EDIÇÃO o bloco aparece SEMPRE**, porque é ali que se preenche. Esconder o campo
 * vazio no formulário tornaria impossível sair do estado vazio.
 *
 * `is_icms_contributor = false` NÃO É CONTEÚDO
 * ---------------------------------------------
 * Ele é o default de uma coluna preenchida em 116 de 116 e `true` em zero. Contá-lo como
 * conteúdo faria o botão aparecer para todo mundo, que é exatamente o que a trava evita —
 * e exibir "Não" não responde pergunta nenhuma que alguém tenha. `true`, sim, é conteúdo:
 * ali alguém classificou.
 */

/** O que a ficha lê do cliente para montar o bloco. Tudo opcional: tudo pode faltar. */
export interface ClienteComInformacoesExtras {
    email?: string | null
    document?: string | null
    ie?: string | null
    is_icms_contributor?: boolean | null
    cep?: string | null
    address?: string | null
    number?: string | null
    complement?: string | null
    neighborhood?: string | null
    city?: string | null
    state_code?: string | null
    owner_id?: string | null
    notes?: string | null
}

export interface InformacaoExtra {
    rotulo: string
    /** `null` quando não há valor — a tela exibe travessão. */
    valor: string | null
}

const vazio = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === ''

/** O endereço inteiro numa linha, com o CEP. `null` quando nenhuma parte existe. */
function montarEndereco(c: ClienteComInformacoesExtras): string | null {
    const logradouro = [c.address, c.number].filter((p) => !vazio(p)).join(', ')
    const partes = [logradouro, c.complement, c.neighborhood, [c.city, c.state_code].filter((p) => !vazio(p)).join(' - ')]
        .filter((p) => !vazio(p))
    const comCep = vazio(c.cep) ? partes : [...partes, `CEP ${c.cep}`]
    return comCep.length > 0 ? comCep.join(' · ') : null
}

/**
 * As linhas do bloco, na ordem em que aparecem.
 *
 * `resolverResponsavel` recebe o `owner_id` e devolve o nome — a ficha já tem o mapa de
 * funcionários carregado, e buscá-lo aqui seria consulta nova.
 */
export function informacoesExtras(
    c: ClienteComInformacoesExtras,
    resolverResponsavel: (ownerId: string) => string | null,
): InformacaoExtra[] {
    const responsavel = vazio(c.owner_id) ? null : resolverResponsavel(c.owner_id as string)
    return [
        { rotulo: 'E-mail', valor: vazio(c.email) ? null : String(c.email) },
        { rotulo: 'CPF / CNPJ', valor: vazio(c.document) ? null : String(c.document) },
        { rotulo: 'Inscrição estadual', valor: vazio(c.ie) ? null : String(c.ie) },
        {
            rotulo: 'Contribuinte do ICMS',
            // `null` quando a coluna é nula; "Não" quando é `false` — aqui o "Não" É a
            // resposta, e o que a trava do botão não aceita é ele ser a ÚNICA.
            valor: c.is_icms_contributor === null || c.is_icms_contributor === undefined
                ? null
                : c.is_icms_contributor ? 'Sim' : 'Não',
        },
        { rotulo: 'Endereço', valor: montarEndereco(c) },
        { rotulo: 'Vendedor responsável', valor: vazio(responsavel) ? null : String(responsavel) },
        { rotulo: 'Observação interna', valor: vazio(c.notes) ? null : String(c.notes) },
    ]
}

/**
 * `true` quando ao menos um campo tem conteúdo — é o que decide o botão em CONSULTA.
 *
 * `is_icms_contributor = false` não conta; ver o cabeçalho.
 */
export function temAlgumaInformacaoExtra(c: ClienteComInformacoesExtras): boolean {
    if (c.is_icms_contributor === true) return true
    return (
        !vazio(c.email) || !vazio(c.document) || !vazio(c.ie) || !vazio(c.notes) ||
        !vazio(c.owner_id) || montarEndereco(c) !== null
    )
}

export const ROTULO_MAIS_INFORMACOES = 'Mais informações'
export const PARAM_MAIS = 'mais'
