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
 * AS UNIDADES (R$ e R$/mês), o DOMÍNIO da ação (BLOQUEAR | AVISAR) e o DEFAULT AVISAR foram
 * aprovados pelo dono do produto em 18/10/2026 — mudar na migração muda aqui, no mesmo commit.
 *
 * BLOCO 2C.1 (19/10/2026): o MODELO E O NICHO da conta — `modelo` e `nicho_id`, colunas da migração
 * `20261019000001` — entra no contrato como uma SEGUNDA gravação, separada do liga/desliga:
 *   - o corpo do liga/desliga continua sendo as quatro chaves, e NÃO leva modelo nem nicho — por
 *     isso ligar ou desligar não os apaga (portão P1 de `atendimentos-ia-contas-ligadas.test.ts`);
 *   - o corpo do modelo e do nicho é SÓ `modelo` e `nicho_id`, e NÃO leva `ativo` — por isso
 *     gravá-los não toca `ativo`, `ativado_por` nem `ativado_em`;
 *   - os dois no mesmo corpo são recusados: misturar faria a gravação do modelo e do nicho levar `ativo`.
 */
import { MODELOS, ROTULO_DO_MODELO, ehUuid, type Modelo } from '@/utils/atendimentos-ia-catalogo'

export const ACOES_AO_ATINGIR_TETO = ['BLOQUEAR', 'AVISAR'] as const
export type AcaoAoAtingirTeto = (typeof ACOES_AO_ATINGIR_TETO)[number]

/**
 * O MESMO default da coluna (`acao_ao_atingir_teto ... DEFAULT 'AVISAR'`, migração
 * `20261018000001`). A tela o usa para conta nunca configurada — nunca um terceiro valor.
 */
export const ACAO_PADRAO: AcaoAoAtingirTeto = 'AVISAR'

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
    acao_ao_atingir_teto: AcaoAoAtingirTeto
    ativado_por: string | null
    ativado_em: string | null
    atualizado_por: string | null
    atualizado_em: string
    /** O modelo da conta no Atendimentos I.A. — NÃO é a segmentação fiscal do tenant. */
    modelo: Modelo | null
    /** Nicho do `modelo` — FK composta `(modelo, nicho_id)`; nulo sempre que `modelo` é nulo. */
    nicho_id: string | null
}

/** O que a tela manda. NÃO tem tenant, autor nem data: a rota tira da URL, da sessão e do relógio. */
export interface CorpoDaConfig {
    ativo: boolean
    valor_adicional_brl: number | null
    teto_de_consumo_brl: number | null
    acao_ao_atingir_teto: AcaoAoAtingirTeto
}

/**
 * O modelo e o nicho da conta (bloco 2C.1). As DUAS chaves são obrigatórias juntas: `null` diz "não
 * definido", e uma chave ausente que virasse `null` apagaria o que está gravado.
 */
export interface CorpoDoModeloENicho {
    modelo: Modelo | null
    nicho_id: string | null
}

export type LeituraDoCorpo = { ok: true; corpo: CorpoDaConfig | CorpoDoModeloENicho } | { ok: false; erro: string }

/**
 * O estreitamento EXPLÍCITO: com `strictNullChecks` desligado no `tsconfig`, `if (!r.ok)` não
 * estreita a união e o `tsc` acusa `r.erro` — o jest passaria verde com o erro vivo.
 */
export function leituraRecusada(r: LeituraDoCorpo): r is { ok: false; erro: string } {
    return r.ok === false
}

export function leituraAceita(r: LeituraDoCorpo): r is { ok: true; corpo: CorpoDaConfig | CorpoDoModeloENicho } {
    return r.ok === true
}

/** Qual das duas gravações o corpo é. A do modelo e do nicho é a que NÃO tem `ativo`. */
export function ehModeloENicho(c: CorpoDaConfig | CorpoDoModeloENicho): c is CorpoDoModeloENicho {
    return !('ativo' in c)
}

const CHAVES_DA_CONFIG = ['ativo', 'valor_adicional_brl', 'teto_de_consumo_brl', 'acao_ao_atingir_teto'] as const
const CHAVES_DO_MODELO_E_NICHO = ['modelo', 'nicho_id'] as const

/**
 * Lê o modelo e o nicho ESPELHANDO o banco, para a recusa sair com frase em vez de código:
 *   - `modelo` é um de `MODELOS` ou nulo — a CHECK de domínio da coluna;
 *   - `nicho_id` sem `modelo` é recusado — a CHECK `orcamentista_config_nicho_exige_modelo`;
 *   - `nicho_id` que não é uuid é recusado — o Postgres o recusaria com 22P02.
 * O que NÃO dá para conferir aqui é se o PAR existe: isso é a FK composta, e só o banco sabe.
 */
function lerModeloENicho(b: Record<string, unknown>): LeituraDoCorpo {
    for (const k of CHAVES_DO_MODELO_E_NICHO) {
        if (!(k in b)) return { ok: false, erro: `Campo obrigatório ausente: ${k}. O modelo e o nicho vão juntos: modelo e nicho_id.` }
    }
    const modelo = b.modelo
    if (modelo !== null && !(MODELOS as readonly unknown[]).includes(modelo)) {
        return { ok: false, erro: `Modelo inválido. Aceitos: ${MODELOS.join(', ')}, ou nenhum.` }
    }
    const nicho = b.nicho_id
    if (nicho !== null && !ehUuid(nicho)) return { ok: false, erro: 'Nicho inválido.' }
    if (nicho !== null && modelo === null) {
        return { ok: false, erro: 'Não há nicho sem modelo: escolha o modelo antes do nicho.' }
    }
    return { ok: true, corpo: { modelo: modelo as Modelo | null, nicho_id: nicho as string | null } }
}

/** `true` para um número finito com no máximo duas casas — `numeric(12,2)` arredondaria o resto. */
function emCentavos(v: number): boolean {
    return Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 && Math.abs(v) < 1e10
}

/**
 * Lê o corpo SÓ pelas chaves do contrato — e o contrato tem DUAS formas, nunca misturadas:
 *   - o liga/desliga: as quatro chaves, todas OBRIGATÓRIAS — `null` é um valor dizendo "não
 *     definido", e ausente seria a tela esquecendo de mandar: os dois não são a mesma coisa
 *     (`ausente-vs-falso.md`), e uma chave ausente que virasse `null` apagaria um teto gravado;
 *   - o modelo e o nicho (bloco 2C.1): `modelo` e `nicho_id`, as duas obrigatórias, pela mesma razão.
 * Um corpo sem nenhuma das seis é lido como o liga/desliga, e recusado pela chave que falta.
 */
export function lerCorpoDaConfig(bruto: unknown): LeituraDoCorpo {
    if (bruto === null || typeof bruto !== 'object') return { ok: false, erro: 'Corpo inválido.' }
    const b = bruto as Record<string, unknown>
    const temConfig = CHAVES_DA_CONFIG.some((k) => k in b)
    const temModeloENicho = CHAVES_DO_MODELO_E_NICHO.some((k) => k in b)
    if (temConfig && temModeloENicho) {
        return { ok: false, erro: 'O modelo e o nicho são gravados sozinhos, sem o liga/desliga.' }
    }
    if (temModeloENicho) return lerModeloENicho(b)
    for (const k of CHAVES_DA_CONFIG) {
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
    // A ação é SEMPRE uma das duas (a coluna é NOT NULL) — e só tem efeito quando há teto.
    const acao = b.acao_ao_atingir_teto
    if (!(ACOES_AO_ATINGIR_TETO as readonly unknown[]).includes(acao)) {
        return { ok: false, erro: `Ação ao atingir o teto inválida. Aceitas: ${ACOES_AO_ATINGIR_TETO.join(', ')}.` }
    }
    return {
        ok: true,
        corpo: {
            ativo: b.ativo,
            valor_adicional_brl: valor as number | null,
            teto_de_consumo_brl: teto as number | null,
            acao_ao_atingir_teto: acao as AcaoAoAtingirTeto,
        },
    }
}

/**
 * A linha a gravar (upsert pela PK `tenant_id`).
 *
 * "QUEM ATIVOU, QUANDO" é gravado SÓ na transição desligado → ligado, e PRESERVADO depois:
 * desligar não apaga quem ligou. Quem mudou por último vai em `atualizado_por`/`atualizado_em`.
 * Sem a transição, `ativado_*` não entra no payload — e o upsert não toca a coluna.
 *
 * `atualizado_por` e `atualizado_em` vão em TODA gravação, e isto é a regra, não detalhe: a tabela
 * NÃO tem trigger (migração `20261018000001`, escolha b do dono do produto, 18/10/2026). O DEFAULT
 * de `atualizado_em` só vale no INSERT; num UPDATE, quem o move é este payload, e mais nada.
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

/**
 * A gravação do modelo e do nicho: SÓ `modelo` e `nicho_id`, mais quem mudou e quando — a tabela não
 * tem trigger, e `atualizado_*` vai em toda gravação. NÃO leva `tenant_id` (a rota filtra a conta
 * pela URL num UPDATE) nem `ativo`/`ativado_*`: o modelo e o nicho não ligam nem desligam nada.
 */
export function montarGravacaoDoModeloENicho(args: { corpo: CorpoDoModeloENicho; usuarioId: string; agora: string }): Record<string, unknown> {
    return {
        modelo: args.corpo.modelo,
        nicho_id: args.corpo.nicho_id,
        atualizado_por: args.usuarioId,
        atualizado_em: args.agora,
    }
}

/**
 * A frase do 409 quando o BANCO recusa o par (FK composta `(modelo, nicho_id)`, 23503): diz o que
 * segura — o nicho é de outro modelo, ou não existe no catálogo.
 */
export function fraseDoParRecusado(modeloPedido: Modelo, nicho: { nome: string; modelo: Modelo } | null): string {
    if (!nicho) return 'O nicho escolhido não existe no catálogo — pode ter sido excluído. Recarregue e escolha de novo.'
    return `O nicho “${nicho.nome}” é do modelo ${ROTULO_DO_MODELO[nicho.modelo]}, não de ${ROTULO_DO_MODELO[modeloPedido]}.`
}

/** O corpo que a tela manda para alternar SÓ o liga/desliga, preservando o resto. */
export function corpoParaAlternar(config: ConfigDoOrcamentista | undefined, ativo: boolean): CorpoDaConfig {
    return {
        ativo,
        valor_adicional_brl: config?.valor_adicional_brl ?? null,
        teto_de_consumo_brl: config?.teto_de_consumo_brl ?? null,
        acao_ao_atingir_teto: config?.acao_ao_atingir_teto ?? ACAO_PADRAO,
    }
}

export const ROTA_DO_ORCAMENTISTA = '/api/super-admin/orcamentista'
export const rotaDaConfig = (tenantId: string) => `${ROTA_DO_ORCAMENTISTA}/${tenantId}`
