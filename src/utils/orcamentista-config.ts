/**
 * orcamentista-config.ts — a configuração do Orçamentista por conta, do lado do código.
 *
 * Bloco 1 (18/10/2026): o super admin liga/desliga por conta, com o valor do adicional e o teto
 * de consumo. A tabela é `orcamentista_config` (migração `20261018000001`), e a ESCRITA é só do
 * super admin — no banco por política com `is_super_admin()`, na rota por `requireSuperAdmin`.
 *
 * PURO e importável do browser: a rota o importa para validar e montar a gravação; a tela o
 * importa para exibir. A validação ESPELHA as CHECK da migração, para que o usuário leia a frase
 * da rota em vez do código de erro do banco — mas a AUTORIDADE é o banco: um corpo que passe
 * aqui e viole uma CHECK é recusado lá, e a rota devolve o erro.
 *
 * AS UNIDADES (R$ e R$/mês) e o DOMÍNIO da ação (BLOQUEAR | AVISAR) são escolha registrada na
 * migração para revisão do dono do produto — mudar lá muda aqui, no mesmo commit.
 */

export const ACOES_AO_ATINGIR_TETO = ['BLOQUEAR', 'AVISAR'] as const
export type AcaoAoAtingirTeto = (typeof ACOES_AO_ATINGIR_TETO)[number]

export const ROTULO_DA_ACAO: Record<AcaoAoAtingirTeto, string> = {
    BLOQUEAR: 'Bloquear ao atingir o teto',
    AVISAR: 'Avisar e seguir',
}

/** A linha de `orcamentista_config`, como o banco a devolve. */
export interface ConfigDoOrcamentista {
    tenant_id: string
    ativo: boolean
    valor_adicional_brl: number | null
    teto_de_consumo_brl: number | null
    acao_ao_atingir_teto: AcaoAoAtingirTeto | null
    ativado_por: string | null
    ativado_em: string | null
    atualizado_por: string | null
    atualizado_em: string
}

/** O que a tela manda. NÃO tem tenant, autor nem data: a rota tira da URL, da sessão e do relógio. */
export interface CorpoDaConfig {
    ativo: boolean
    valor_adicional_brl: number | null
    teto_de_consumo_brl: number | null
    acao_ao_atingir_teto: AcaoAoAtingirTeto | null
}

export type LeituraDoCorpo = { ok: true; corpo: CorpoDaConfig } | { ok: false; erro: string }

/**
 * O estreitamento EXPLÍCITO: com `strictNullChecks` desligado no `tsconfig`, `if (!r.ok)` não
 * estreita a união e o `tsc` acusa `r.erro` — o jest passaria verde com o erro vivo.
 */
export function leituraRecusada(r: LeituraDoCorpo): r is { ok: false; erro: string } {
    return r.ok === false
}

export function leituraAceita(r: LeituraDoCorpo): r is { ok: true; corpo: CorpoDaConfig } {
    return r.ok === true
}

/** `true` para um número finito com no máximo duas casas — `numeric(12,2)` arredondaria o resto. */
function emCentavos(v: number): boolean {
    return Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 && Math.abs(v) < 1e10
}

/**
 * Lê o corpo SÓ pelas quatro chaves do contrato. As quatro são OBRIGATÓRIAS — `null` é um valor
 * dizendo "não definido", e ausente seria a tela esquecendo de mandar: os dois não são a mesma
 * coisa (`ausente-vs-falso.md`), e uma chave ausente que virasse `null` apagaria um teto gravado.
 */
export function lerCorpoDaConfig(bruto: unknown): LeituraDoCorpo {
    if (bruto === null || typeof bruto !== 'object') return { ok: false, erro: 'Corpo inválido.' }
    const b = bruto as Record<string, unknown>
    for (const k of ['ativo', 'valor_adicional_brl', 'teto_de_consumo_brl', 'acao_ao_atingir_teto']) {
        if (!(k in b)) return { ok: false, erro: `Campo obrigatório ausente: ${k}.` }
    }
    if (typeof b.ativo !== 'boolean') return { ok: false, erro: 'O campo "ativo" tem de ser verdadeiro ou falso.' }

    const valor = b.valor_adicional_brl
    if (valor !== null && (typeof valor !== 'number' || !emCentavos(valor) || valor < 0)) {
        return { ok: false, erro: 'O valor do adicional tem de ser um valor em reais, zero ou maior, com até duas casas.' }
    }
    const teto = b.teto_de_consumo_brl
    if (teto !== null && (typeof teto !== 'number' || !emCentavos(teto) || teto <= 0)) {
        return { ok: false, erro: 'O teto de consumo tem de ser um valor em reais maior que zero, com até duas casas.' }
    }
    const acao = b.acao_ao_atingir_teto
    if (acao !== null && !(ACOES_AO_ATINGIR_TETO as readonly unknown[]).includes(acao)) {
        return { ok: false, erro: `Ação ao atingir o teto inválida. Aceitas: ${ACOES_AO_ATINGIR_TETO.join(', ')}.` }
    }
    // A mesma regra de `orcamentista_config_teto_e_acao`: os dois juntos, ou nenhum.
    if ((teto === null) !== (acao === null)) {
        return { ok: false, erro: 'Teto e ação andam juntos: defina os dois, ou nenhum.' }
    }
    return {
        ok: true,
        corpo: {
            ativo: b.ativo,
            valor_adicional_brl: valor as number | null,
            teto_de_consumo_brl: teto as number | null,
            acao_ao_atingir_teto: acao as AcaoAoAtingirTeto | null,
        },
    }
}

/**
 * A linha a gravar (upsert pela PK `tenant_id`).
 *
 * "QUEM ATIVOU, QUANDO" é gravado SÓ na transição desligado → ligado, e PRESERVADO depois:
 * desligar não apaga quem ligou. Quem mudou por último vai em `atualizado_por`/`atualizado_em`.
 * Sem a transição, `ativado_*` não entra no payload — e o upsert não toca a coluna.
 */
export function montarGravacao(args: {
    tenantId: string
    corpo: CorpoDaConfig
    estavaAtivo: boolean
    usuarioId: string
    agora: string
}): Record<string, unknown> {
    const linha: Record<string, unknown> = {
        tenant_id: args.tenantId,
        ...args.corpo,
        atualizado_por: args.usuarioId,
        atualizado_em: args.agora,
    }
    if (args.corpo.ativo && !args.estavaAtivo) {
        linha.ativado_por = args.usuarioId
        linha.ativado_em = args.agora
    }
    return linha
}

/** O corpo que a tela manda para alternar SÓ o liga/desliga, preservando o resto. */
export function corpoParaAlternar(config: ConfigDoOrcamentista | undefined, ativo: boolean): CorpoDaConfig {
    return {
        ativo,
        valor_adicional_brl: config?.valor_adicional_brl ?? null,
        teto_de_consumo_brl: config?.teto_de_consumo_brl ?? null,
        acao_ao_atingir_teto: config?.acao_ao_atingir_teto ?? null,
    }
}

export const ROTA_DO_ORCAMENTISTA = '/api/super-admin/orcamentista'
export const rotaDaConfig = (tenantId: string) => `${ROTA_DO_ORCAMENTISTA}/${tenantId}`
