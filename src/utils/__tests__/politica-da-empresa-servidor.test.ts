/**
 * @jest-environment node
 *
 * PORTÃO — A LEITURA DA POLÍTICA (20261121000001): existindo a natureza da variável, ela manda (por família, sem o VIDRO, que é do vidro padrão);
 * sem a tabela, o caminho de antes (esquadrias_base sobre esquadrias_padrao); outro erro estoura, nunca vira "sem política".
 */
const respostas: Record<string, { data: unknown; error: { code: string; message: string } | null }> = {}
const filtros: Array<[string, string, unknown]> = []
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (col: string, v: unknown) => { filtros.push([tabela, col, v]); return q }
            q.maybeSingle = () => q
            q.then = (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(respostas[tabela] ?? { data: null, error: null }).then(ok, erro)
            return q
        },
    },
}))
import { lerPoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa-servidor'

const L = (familia: string, variavel: string, natureza: string, opcao: string | null) => ({ familia, linha: null as string | null, formato: null as string | null, variavel, natureza, opcao_padrao: opcao })
beforeEach(() => { for (const k of Object.keys(respostas)) delete respostas[k]; filtros.length = 0 })

it('com a família: as linhas dela, por variável, sem o VIDRO; filtrado pela conta', async () => {
    respostas.orcamentista_natureza_da_variavel = { data: [L('PVC', 'ARI', 'POLITICA', 'BZ1770'), L('PVC', 'INT', 'CALCULO', null), L('PVC', 'VIDRO', 'POLITICA', 'VIN05'), L('ALUMINIO', 'ARI', 'POLITICA', 'X')], error: null }
    const p = await lerPoliticaDaEmpresa('t1', 'PVC')
    expect(p.porVariavel).toEqual({ ARI: { natureza: 'POLITICA', opcao: 'BZ1770' }, INT: { natureza: 'CALCULO', opcao: null } })
    expect(filtros).toContainEqual(['orcamentista_natureza_da_variavel', 'tenant_id', 't1'])
})
it('sem a família: a única família da empresa; com duas, nenhuma política (a descrição não escolhe uma pela outra)', async () => {
    respostas.orcamentista_natureza_da_variavel = { data: [L('PVC', 'ARI', 'POLITICA', 'BZ1770')], error: null }
    expect((await lerPoliticaDaEmpresa('t1')).porVariavel).toEqual({ ARI: { natureza: 'POLITICA', opcao: 'BZ1770' } })
    respostas.orcamentista_natureza_da_variavel = { data: [L('PVC', 'ARI', 'POLITICA', 'BZ1770'), L('ALUMINIO', 'ARI', 'POLITICA', 'X')], error: null }
    expect((await lerPoliticaDaEmpresa('t1')).porVariavel).toEqual({})
})
it('a tabela vazia para a empresa é "nada definido" — os campos de antes não são lidos', async () => {
    respostas.orcamentista_natureza_da_variavel = { data: [], error: null }
    respostas.orcamentista_esquadrias_base = { data: { tenant_id: 't1', usa_arremate_interno: true, guarnicao_interna: 'BZ1770' }, error: null }
    expect(await lerPoliticaDaEmpresa('t1', 'PVC')).toEqual({ porVariavel: {} })
})
it('SEM a tabela (42P01/PGRST205): o caminho de antes, pelos campos', async () => {
    for (const code of ['42P01', 'PGRST205']) {
        respostas.orcamentista_natureza_da_variavel = { data: null, error: { code, message: 'x' } }
        respostas.orcamentista_esquadrias_base = { data: { tenant_id: 't1', usa_arremate_interno: true, guarnicao_interna: 'BZ1770' }, error: null }
        const p = await lerPoliticaDaEmpresa('t1', 'PVC')
        expect(p.porVariavel).toBeUndefined()
        expect(p).toEqual({ usa_arremate_interno: true, guarnicao_interna: 'BZ1770' })
    }
})
it('outro erro na natureza estoura — nunca vira política vazia nem o caminho de antes', async () => {
    respostas.orcamentista_natureza_da_variavel = { data: null, error: { code: '42501', message: 'x' } }
    await expect(lerPoliticaDaEmpresa('t1', 'PVC')).rejects.toThrow('orcamentista_natureza_da_variavel: 42501')
})
