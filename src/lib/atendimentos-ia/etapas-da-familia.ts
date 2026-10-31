/**
 * As ETAPAS da família-instância e o CATÁLOGO DE MOTORES — a leitura, e a criação do motor. SÓ SERVIDOR (`supabaseAdmin`).
 *
 * A ETAPA É DA FAMÍLIA-INSTÂNCIA (dono do produto, 28/10/2026; migração 20261028000001): da matéria-prima de UMA empresa, e não da chave do
 * catálogo ('PVC') — a mesma empresa pode ter três famílias PVC, cada uma com os seus fornecedores e as suas etapas. A gravação é a função
 * `superadmin_gravar_etapas_da_materia_prima`, chamada pela rota; aqui só se lê.
 *
 * O MOTOR É GLOBAL, NUM CATÁLOGO, com fornecedor + categoria + tipo; a etapa só o seleciona. Criar é `superadmin_criar_motor`, que grava as
 * 12 tabelas por `motor_id` e registra a importação numa transação só, sem apontar etapa nenhuma.
 *
 * Nada disto muda o cálculo: quem lê as etapas na conversa é o PR D, que deriva POR INSTÂNCIA.
 */
import { supabaseAdmin } from '@/supabase/admin'
import {
    ABAS_DA_ETAPA, ehAcaoDaEtapa, type AbaDaEtapa, type AcaoDaEtapa, type EtapaDaFamilia, type EtapaDoCatalogo, type UsoDaEtapaDoCatalogo,
} from '@/utils/atendimentos-ia-etapas'
import type { MotorDoCatalogo, UsoDoMotor } from '@/utils/atendimentos-ia-catalogo-de-motores'

// O cliente admin não tem os tipos destas tabelas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

async function ler(onde: string, p: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<unknown> {
    const { data, error } = await p
    if (error) throw new Error(`${onde}: ${error.message ?? 'erro do banco'}`)
    return data
}

/**
 * As etapas de UMA família-instância, na ordem. A matéria-prima tem de ser DESTA empresa: a de outra (ou inexistente) é `null` — a rota
 * responde 404. Família sem etapa é a lista vazia. `familia` é o TIPO da matéria-prima (null = ainda não escolhido: sem tipo, não há etapa).
 * O NOME, a AÇÃO e as ABAS vêm do item do catálogo que a etapa seleciona (20261031000002); o número, a instrução e o motor são da conta.
 */
export async function lerEtapasDaMateriaPrima(tenantId: string, materiaPrimaId: string): Promise<{ familia: string | null; etapas: EtapaDaFamilia[] } | null> {
    const mp = (await ler('orcamentista_materia_prima', db().from('orcamentista_materia_prima').select('id, familia').eq('id', materiaPrimaId).eq('tenant_id', tenantId).maybeSingle())) as Linha | null
    if (!mp) return null
    const linhas = ((await ler('orcamentista_familia_etapa',
        db().from('orcamentista_familia_etapa').select('id, numero, etapa_catalogo_id, instrucao, motor_id')
            .eq('materia_prima_id', materiaPrimaId).eq('tenant_id', tenantId).order('numero', { ascending: true }))) ?? []) as Linha[]
    const itens = new Map<string, Linha>()
    const ids = [...new Set(linhas.map((l) => String(l.etapa_catalogo_id)))]
    if (ids.length > 0) {
        for (const c of ((await ler('orcamentista_etapa_catalogo', db().from('orcamentista_etapa_catalogo').select('id, nome, acao, abas').in('id', ids))) ?? []) as Linha[]) itens.set(String(c.id), c)
    }
    const etapas = linhas.map((l) => {
        // a FK (RESTRICT, NOT NULL) garante o item; se ele não vier, é erro — nunca uma etapa sem nome
        const c = itens.get(String(l.etapa_catalogo_id))
        if (!c) throw new Error(`orcamentista_familia_etapa: a etapa ${l.numero} aponta o item ${String(l.etapa_catalogo_id)}, que o catálogo de etapas não devolveu`)
        const item = itemDoCatalogo(c)
        return {
            id: String(l.id), numero: Number(l.numero), etapa_catalogo_id: item.id, rotulo: item.nome, acao: item.acao, abas: item.abas,
            instrucao: String(l.instrucao ?? ''), motor_id: l.motor_id == null ? null : String(l.motor_id),
        }
    })
    return { familia: mp.familia == null ? null : String(mp.familia), etapas }
}

/** Uma linha do catálogo de etapas, conferida: a CHECK do banco garante a ação e as abas; se uma linha fugir disso, é erro — nunca um item sem ação. */
function itemDoCatalogo(c: Linha): { id: string; nome: string; acao: AcaoDaEtapa; abas: AbaDaEtapa[] } {
    if (!ehAcaoDaEtapa(c.acao)) throw new Error(`orcamentista_etapa_catalogo: o item "${String(c.nome)}" tem a ação "${String(c.acao)}", que não é da lista`)
    const abas = ((c.abas ?? []) as unknown[]).filter((a): a is AbaDaEtapa => typeof a === 'string' && (ABAS_DA_ETAPA as readonly string[]).includes(a))
    return { id: String(c.id), nome: String(c.nome), acao: c.acao, abas }
}

/**
 * O CATÁLOGO DE ETAPAS (20261031000002), na ordem, cada item com QUEM USA: empresa · família (o nome da matéria-prima) · número da etapa, em ordem.
 * `usos: false` deixa de fora quem usa (o combo da base de conhecimento só precisa dos itens).
 */
export async function lerCatalogoDeEtapas(o: { usos?: boolean } = {}): Promise<EtapaDoCatalogo[]> {
    const itens = ((await ler('orcamentista_etapa_catalogo', db().from('orcamentista_etapa_catalogo').select('id, nome, acao, abas, ordem, criado_em').order('ordem', { ascending: true }))) ?? []) as Linha[]
    if (itens.length === 0) return []
    const usos = new Map<string, UsoDaEtapaDoCatalogo[]>()
    if (o.usos !== false) {
        const etapas = ((await ler('orcamentista_familia_etapa', db().from('orcamentista_familia_etapa').select('etapa_catalogo_id, materia_prima_id, tenant_id, numero')
            .in('etapa_catalogo_id', itens.map((c) => String(c.id))))) ?? []) as Linha[]
        if (etapas.length > 0) {
            const mps = new Map<string, string>()
            for (const m of ((await ler('orcamentista_materia_prima', db().from('orcamentista_materia_prima').select('id, nome').in('id', [...new Set(etapas.map((e) => String(e.materia_prima_id)))]))) ?? []) as Linha[]) mps.set(String(m.id), String(m.nome))
            const empresas = new Map<string, string>()
            for (const t of ((await ler('tenants', db().from('tenants').select('id, name').in('id', [...new Set(etapas.map((e) => String(e.tenant_id)))]))) ?? []) as Linha[]) empresas.set(String(t.id), String(t.name ?? ''))
            for (const e of etapas) {
                const u: UsoDaEtapaDoCatalogo = { empresa: empresas.get(String(e.tenant_id)) || '(sem nome)', familia: mps.get(String(e.materia_prima_id)) ?? '(família removida)', numero: Number(e.numero) }
                usos.set(String(e.etapa_catalogo_id), [...(usos.get(String(e.etapa_catalogo_id)) ?? []), u])
            }
        }
    }
    const porUso = (a: UsoDaEtapaDoCatalogo, b: UsoDaEtapaDoCatalogo) => a.empresa.localeCompare(b.empresa, 'pt-BR') || a.familia.localeCompare(b.familia, 'pt-BR') || a.numero - b.numero
    return itens.map((c) => ({ ...itemDoCatalogo(c), ordem: Number(c.ordem), criado_em: String(c.criado_em), usos: [...(usos.get(String(c.id)) ?? [])].sort(porUso) }))
}

/** `superadmin_criar_etapa_do_catalogo` (20261031000002): o item vai ao fim, com o autor e o log. Falha LANÇA `ErroDaFuncao` com o código. */
export async function criarEtapaDoCatalogo(a: { por: string; nome: string; acao: AcaoDaEtapa; abas: AbaDaEtapa[] }): Promise<Record<string, unknown>> {
    const { data, error } = await db().rpc('superadmin_criar_etapa_do_catalogo', { p_por: a.por, p_nome: a.nome, p_acao: a.acao, p_abas: a.abas })
    if (error) throw new ErroDaFuncao(error)
    return data as Record<string, unknown>
}

/** `superadmin_editar_etapa_do_catalogo`: o nome, a ação e as abas — também COM uso (o item é o mesmo para toda conta que o seleciona). */
export async function editarEtapaDoCatalogo(a: { por: string; id: string; nome: string; acao: AcaoDaEtapa; abas: AbaDaEtapa[] }): Promise<Record<string, unknown>> {
    const { data, error } = await db().rpc('superadmin_editar_etapa_do_catalogo', { p_por: a.por, p_id: a.id, p_nome: a.nome, p_acao: a.acao, p_abas: a.abas })
    if (error) throw new ErroDaFuncao(error)
    return data as Record<string, unknown>
}

/** `superadmin_remover_etapa_do_catalogo`: em uso é recusa NOMEADA (22023, empresa / família / etapa N); sem uso, sai, com o antes no log. */
export async function removerEtapaDoCatalogo(a: { por: string; id: string }): Promise<Record<string, unknown>> {
    const { data, error } = await db().rpc('superadmin_remover_etapa_do_catalogo', { p_por: a.por, p_id: a.id })
    if (error) throw new ErroDaFuncao(error)
    return data as Record<string, unknown>
}

/** As famílias de cada motor (`orcamentista_motor_familia`, 20261029000003), em ordem de chave. Motor sem linha aqui não existe (o gatilho adiado). */
async function familiasDosMotores(ids: readonly string[]): Promise<Map<string, string[]>> {
    const porMotor = new Map<string, string[]>()
    if (ids.length === 0) return porMotor
    for (const l of ((await ler('orcamentista_motor_familia', db().from('orcamentista_motor_familia').select('motor_id, familia').in('motor_id', ids))) ?? []) as Linha[]) {
        porMotor.set(String(l.motor_id), [...(porMotor.get(String(l.motor_id)) ?? []), String(l.familia)])
    }
    for (const fs of porMotor.values()) fs.sort()
    return porMotor
}

/**
 * O CATÁLOGO: todos os motores (também os arquivados — a tela os separa), com o NOME do fornecedor, a categoria, as FAMÍLIAS em que atua, as
 * tipologias que o arquivo trouxe e QUEM USA (empresa e título da família — só nomes; a etapa não aparece, 29/10/2026, e as etapas da mesma
 * família são um uso só). `tipo` dá os que uma família pode apontar — os que atuam NELA (20261029000003) —, não arquivados, e deixa de fora as
 * tipologias e os usos (o combo da etapa não precisa deles).
 */
export async function lerCatalogoDeMotores(o: { tipo?: string } = {}): Promise<MotorDoCatalogo[]> {
    const colunas = 'id, nome, fornecedor_id, categoria_chave, arquivo_nome, criado_em, arquivado_em'
    let motores: Linha[]
    if (o.tipo === undefined) {
        motores = ((await ler('orcamentista_motor', db().from('orcamentista_motor').select(colunas).order('criado_em', { ascending: true }))) ?? []) as Linha[]
    } else {
        const daFamilia = ((await ler('orcamentista_motor_familia', db().from('orcamentista_motor_familia').select('motor_id').eq('familia', o.tipo))) ?? []) as Linha[]
        if (daFamilia.length === 0) return []
        motores = ((await ler('orcamentista_motor', db().from('orcamentista_motor').select(colunas).in('id', [...new Set(daFamilia.map((l) => String(l.motor_id)))])
            .is('arquivado_em', null).order('criado_em', { ascending: true }))) ?? []) as Linha[]
    }
    if (motores.length === 0) return []
    const familias = await familiasDosMotores(motores.map((m) => String(m.id)))

    const fIds = [...new Set(motores.map((m) => String(m.fornecedor_id)))]
    const nomes = new Map<string, string>()
    for (const f of ((await ler('orcamentista_fornecedor', db().from('orcamentista_fornecedor').select('id, nome').in('id', fIds))) ?? []) as Linha[]) nomes.set(String(f.id), String(f.nome))

    const usos = new Map<string, UsoDoMotor[]>()
    const tipologias = new Map<string, number>()
    if (o.tipo === undefined) {
        const ids = motores.map((m) => String(m.id))
        const etapas = ((await ler('orcamentista_familia_etapa', db().from('orcamentista_familia_etapa').select('motor_id, materia_prima_id, tenant_id').in('motor_id', ids))) ?? []) as Linha[]
        if (etapas.length > 0) {
            const mps = new Map<string, string>()
            for (const m of ((await ler('orcamentista_materia_prima', db().from('orcamentista_materia_prima').select('id, nome').in('id', [...new Set(etapas.map((e) => String(e.materia_prima_id)))]))) ?? []) as Linha[]) mps.set(String(m.id), String(m.nome))
            const empresas = new Map<string, string>()
            for (const t of ((await ler('tenants', db().from('tenants').select('id, name').in('id', [...new Set(etapas.map((e) => String(e.tenant_id)))]))) ?? []) as Linha[]) empresas.set(String(t.id), String(t.name ?? ''))
            const vistos = new Set<string>()
            for (const e of etapas) {
                const chave = `${e.motor_id}|${e.materia_prima_id}`
                if (vistos.has(chave)) continue
                vistos.add(chave)
                const u: UsoDoMotor = { empresa: empresas.get(String(e.tenant_id)) || '(sem nome)', familia: mps.get(String(e.materia_prima_id)) ?? '(família removida)' }
                usos.set(String(e.motor_id), [...(usos.get(String(e.motor_id)) ?? []), u])
            }
        }
        // uma contagem por motor (o catálogo é pequeno): ler as linhas para contar seria cortado pelo PostgREST
        for (const id of ids) {
            const { count, error } = await db().from('orcamentista_motor_tipologia_detalhe').select('motor_id', { count: 'exact', head: true }).eq('motor_id', id)
            if (error) throw new Error(`orcamentista_motor_tipologia_detalhe: ${error.message ?? 'erro do banco'}`)
            tipologias.set(id, Number(count ?? 0))
        }
    }

    const porUso = (a: UsoDoMotor, b: UsoDoMotor) => a.empresa.localeCompare(b.empresa, 'pt-BR') || a.familia.localeCompare(b.familia, 'pt-BR')
    return motores.map((m) => ({
        id: String(m.id), nome: String(m.nome), familias: familias.get(String(m.id)) ?? [], fornecedor_id: String(m.fornecedor_id), fornecedor: nomes.get(String(m.fornecedor_id)) ?? '(fornecedor removido)',
        categoria: String(m.categoria_chave), arquivo_nome: String(m.arquivo_nome), criado_em: String(m.criado_em), arquivado_em: m.arquivado_em == null ? null : String(m.arquivado_em),
        tipologias: o.tipo === undefined ? tipologias.get(String(m.id)) ?? 0 : null, usos: [...(usos.get(String(m.id)) ?? [])].sort(porUso),
    }))
}

/** Erro do banco com o CÓDIGO (SQLSTATE) e a mensagem da função, para a rota decidir o status e a frase. */
export class ErroDaFuncao extends Error {
    code: string | null
    constructor(e: { message?: string; code?: string | null }) { super(e.message ?? 'erro do banco'); this.code = e.code ?? null }
}

/**
 * `superadmin_criar_motor` (20261028000001): cria o motor no catálogo, grava as 12 tabelas por `motor_id` e registra a importação, numa
 * transação só. Devolve as contagens que a função gravou. Falha LANÇA `ErroDaFuncao` com o código.
 */
/** UM motor do catálogo, como está no banco — o que trocar e editar precisam saber antes de chamar a função. Ausente é null. */
export async function obterMotor(id: string): Promise<{ id: string; nome: string; fornecedor_id: string; categoria_chave: string; familias: string[]; arquivo_path: string; arquivo_nome: string; arquivado_em: string | null } | null> {
    const ls = ((await ler('orcamentista_motor', db().from('orcamentista_motor').select('id, nome, fornecedor_id, categoria_chave, arquivo_path, arquivo_nome, arquivado_em').eq('id', id))) ?? []) as Linha[]
    const m = ls[0]
    if (!m) return null
    return {
        id: String(m.id), nome: String(m.nome), fornecedor_id: String(m.fornecedor_id), categoria_chave: String(m.categoria_chave), familias: (await familiasDosMotores([String(m.id)])).get(String(m.id)) ?? [],
        arquivo_path: String(m.arquivo_path), arquivo_nome: String(m.arquivo_nome), arquivado_em: m.arquivado_em == null ? null : String(m.arquivado_em),
    }
}

/**
 * TROCAR O ARQUIVO = MOTOR NOVO (`superadmin_trocar_arquivo_do_motor`, 20261029000005): arquiva o antigo, cria o novo com o MESMO nome e reaponta
 * as etapas, numa transação (o antigo é arquivado primeiro porque o nome é único entre os ativos do fornecedor).
 */
export async function trocarArquivoDoMotor(a: { por: string; motorId: string; arquivoPath: string; arquivoNome: string; payload: unknown }): Promise<Record<string, unknown>> {
    const { data, error } = await db().rpc('superadmin_trocar_arquivo_do_motor', {
        p_por: a.por, p_motor: a.motorId, p_arquivo_path: a.arquivoPath, p_arquivo_nome: a.arquivoNome, p_payload: a.payload,
    })
    if (error) throw new ErroDaFuncao(error)
    return data as Record<string, unknown>
}

/**
 * EDITAR (`superadmin_editar_motor`, 20261029000005): categoria e fornecedor só em motor SEM USO; as famílias e o NOME também com uso, e tirar a
 * família que uma etapa ou item usa é recusa 23001 nomeando quem usa.
 */
export async function editarMotor(a: { por: string; motorId: string; fornecedorId: string; categoria: string; familias: string[]; nome: string; arquivoPath: string }): Promise<Record<string, unknown>> {
    const { data, error } = await db().rpc('superadmin_editar_motor', {
        p_por: a.por, p_motor: a.motorId, p_fornecedor: a.fornecedorId, p_categoria: a.categoria, p_familias: a.familias, p_nome: a.nome, p_arquivo_path: a.arquivoPath,
    })
    if (error) throw new ErroDaFuncao(error)
    return data as Record<string, unknown>
}

export async function criarMotor(a: { por: string; fornecedorId: string; categoria: string; familias: string[]; nome: string; arquivoPath: string; arquivoNome: string; payload: unknown }): Promise<Record<string, unknown>> {
    const { data, error } = await db().rpc('superadmin_criar_motor', {
        p_por: a.por, p_fornecedor: a.fornecedorId, p_categoria: a.categoria, p_familias: a.familias, p_nome: a.nome,
        p_arquivo_path: a.arquivoPath, p_arquivo_nome: a.arquivoNome, p_payload: a.payload,
    })
    if (error) throw new ErroDaFuncao(error)
    return data as Record<string, unknown>
}
