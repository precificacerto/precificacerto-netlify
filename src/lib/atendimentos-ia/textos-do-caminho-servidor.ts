/**
 * A LEITURA dos textos da empresa por família e por fornecedor (`textos-do-caminho.ts`, migração 20261121000003). SÓ SERVIDOR (`service_role`,
 * filtrada pela empresa em toda tabela).
 */
import { supabaseAdmin } from '@/supabase/admin'
import { TABELA_DOS_TEXTOS_DO_CAMINHO, type TextosLidos } from '@/lib/atendimentos-ia/textos-do-caminho'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas da base são lidas como linha solta
const db = () => supabaseAdmin as any
const semTabela = (codigo: string | undefined) => codigo === '42P01' || codigo === 'PGRST205'
type Lida = { data: unknown; error: { code?: string; message?: string } | null }
const linhas = (onde: string, r: Lida): Array<Record<string, unknown>> => {
    if (r.error) throw new Error(`${onde}: ${r.error.code ?? r.error.message ?? 'erro'}`)
    return (r.data ?? []) as Array<Record<string, unknown>>
}
const escrito = (t: unknown): t is string => typeof t === 'string' && t.trim() !== ''

/**
 * A leitura, só servidor. Na CONVERSA, UMA ida ao banco quando nada está escrito (o caso comum); com algum texto, o caminho de cada família em
 * mais três ondas (as matérias-primas, as categorias, os vínculos e as etapas; os motores; os nomes dos fornecedores), tudo filtrado pela
 * empresa. A TELA pede `sempreOCaminho`: o caminho vem também sem texto escrito (é onde o consultor escreve o primeiro).
 */
export async function lerTextosDoCaminho(tenantId: string, o: { sempreOCaminho?: boolean } = {}): Promise<TextosLidos> {
    const r = await db().from(TABELA_DOS_TEXTOS_DO_CAMINHO).select('familia, fornecedor_id, texto').eq('tenant_id', tenantId).not('texto', 'is', null)
    if (r.error && semTabela(r.error.code)) return { estado: 'sem_migracao' }
    const textos = linhas(TABELA_DOS_TEXTOS_DO_CAMINHO, r).filter((l) => escrito(l.texto))
    if (textos.length === 0 && o.sempreOCaminho !== true) return { estado: 'vazio' }

    const [materias, categorias, vinculos, etapas] = (await Promise.all([
        db().from('orcamentista_materia_prima').select('id, familia').eq('tenant_id', tenantId),
        db().from('orcamentista_mp_categoria').select('id, materia_prima_id').eq('tenant_id', tenantId),
        db().from('orcamentista_mp_categoria_fornecedor').select('mp_categoria_id, fornecedor_id').eq('tenant_id', tenantId),
        db().from('orcamentista_familia_etapa').select('materia_prima_id, motor_id').eq('tenant_id', tenantId),
    ])) as Lida[]
    const familiaDaMateria = new Map(linhas('orcamentista_materia_prima', materias).filter((m) => typeof m.familia === 'string' && m.familia !== '').map((m) => [String(m.id), String(m.familia)]))
    const materiaDaCategoria = new Map(linhas('orcamentista_mp_categoria', categorias).map((c) => [String(c.id), String(c.materia_prima_id)]))
    const dasEtapas = linhas('orcamentista_familia_etapa', etapas).filter((e) => typeof e.motor_id === 'string')
    const idsDosMotores = [...new Set(dasEtapas.map((e) => String(e.motor_id)))]
    const motores = idsDosMotores.length === 0 ? [] : linhas('orcamentista_motor', await db().from('orcamentista_motor').select('id, fornecedor_id').in('id', idsDosMotores))
    const fornecedorDoMotor = new Map(motores.map((m) => [String(m.id), String(m.fornecedor_id)]))

    const porFamilia = new Map<string, Set<string>>()
    const junta = (familia: string | undefined, fornecedor: string | undefined) => {
        if (familia === undefined || fornecedor === undefined) return
        porFamilia.set(familia, (porFamilia.get(familia) ?? new Set<string>()).add(fornecedor))
    }
    for (const v of linhas('orcamentista_mp_categoria_fornecedor', vinculos)) {
        const materia = materiaDaCategoria.get(String(v.mp_categoria_id))
        junta(materia === undefined ? undefined : familiaDaMateria.get(materia), String(v.fornecedor_id))
    }
    for (const e of dasEtapas) junta(familiaDaMateria.get(String(e.materia_prima_id)), fornecedorDoMotor.get(String(e.motor_id)))

    const idsDosFornecedores = [...new Set([...porFamilia.values()].flatMap((s) => [...s]))]
    const nomes = idsDosFornecedores.length === 0 ? [] : linhas('orcamentista_fornecedor', await db().from('orcamentista_fornecedor').select('id, nome').in('id', idsDosFornecedores))
    const nomeDo = new Map(nomes.map((f) => [String(f.id), String(f.nome ?? '').trim() || '(fornecedor sem nome)']))
    return {
        estado: 'sim',
        daFamilia: new Map(textos.filter((t) => typeof t.familia === 'string').map((t) => [String(t.familia), String(t.texto).trim()])),
        doFornecedor: new Map(textos.filter((t) => typeof t.fornecedor_id === 'string').map((t) => [String(t.fornecedor_id), String(t.texto).trim()])),
        caminho: new Map([...porFamilia.entries()].map(([f, ids]) => [f, new Map([...ids].map((id) => [id, nomeDo.get(id) ?? '(fornecedor sem nome)']))])),
    }
}

