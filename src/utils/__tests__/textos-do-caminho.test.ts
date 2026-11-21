/**
 * PORTÃO — OS TEXTOS DO CAMINHO ATIVO (dono do produto, 20/11/2026, item (4); migração 20261121000003): "entrar no prompt so o do caminho ativo".
 * A família da montagem decide; o fornecedor entra pelo caminho da família, uma vez; o texto fora do caminho não entra.
 */
import { blocoDosTextosDoCaminho, CABECALHO_DOS_TEXTOS_DO_CAMINHO, familiasDoCaminhoAtivo, textosDoCaminhoAtivo, type TextosLidos } from '@/lib/atendimentos-ia/textos-do-caminho'

const PVC = { familia: 'PVC', rotulo: 'PVC Wolf' }
const ALU = { familia: 'ALUMINIO', rotulo: 'Alumínio' }
const LIDOS: TextosLidos = {
    estado: 'sim',
    daFamilia: new Map([['PVC', 'texto PVC'], ['ALUMINIO', 'texto ALU'], ['MADEIRA', 'texto fora']]),
    doFornecedor: new Map([['f-wolf', 'texto Wolf'], ['f-estrela', 'texto Estrela'], ['f-alcoa', 'texto Alcoa'], ['f-fora', 'texto fora']]),
    caminho: new Map([
        ['PVC', new Map([['f-wolf', 'Wolf'], ['f-estrela', 'Estrela'], ['f-sem-texto', 'Celsus']])],
        ['ALUMINIO', new Map([['f-alcoa', 'Alcoa'], ['f-estrela', 'Estrela']])],
    ]),
}

describe('a família do caminho ativo', () => {
    it('a da montagem, quando alguma esquadria já a tem', () => {
        expect(familiasDoCaminhoAtivo([{ familia: null }, { familia: 'ALUMINIO' }], [PVC, ALU])).toEqual([ALU])
    })
    it('nenhuma esquadria com família (ou nenhuma montagem): as que a conversa oferece', () => {
        expect(familiasDoCaminhoAtivo([{ familia: null }], [PVC, ALU])).toEqual([PVC, ALU])
        expect(familiasDoCaminhoAtivo([], [PVC])).toEqual([PVC])
    })
    it('a família da montagem que a conversa não oferece não entra', () => {
        expect(familiasDoCaminhoAtivo([{ familia: 'MADEIRA' }], [PVC])).toEqual([])
    })
})

describe('os textos do caminho ativo', () => {
    it('a família e os fornecedores do caminho dela, por nome; o de fora do caminho, não', () => {
        expect(textosDoCaminhoAtivo(LIDOS, [PVC])).toEqual([
            { alvo: 'familia', nome: 'PVC Wolf', texto: 'texto PVC' },
            { alvo: 'fornecedor', nome: 'Estrela', texto: 'texto Estrela' },
            { alvo: 'fornecedor', nome: 'Wolf', texto: 'texto Wolf' },
        ])
    })
    it('duas famílias ativas: o fornecedor comum entra UMA vez, na primeira', () => {
        const t = textosDoCaminhoAtivo(LIDOS, [PVC, ALU]).map((x) => `${x.alvo}:${x.nome}`)
        expect(t).toEqual(['familia:PVC Wolf', 'fornecedor:Estrela', 'fornecedor:Wolf', 'familia:Alumínio', 'fornecedor:Alcoa'])
    })
    it('sem migração ou nada escrito: nenhum', () => {
        expect(textosDoCaminhoAtivo({ estado: 'sem_migracao' }, [PVC])).toEqual([])
        expect(textosDoCaminhoAtivo({ estado: 'vazio' }, [PVC])).toEqual([])
    })
    it('família sem caminho ainda tem o texto dela', () => {
        const lidos: TextosLidos = { ...LIDOS, caminho: new Map() }
        expect(textosDoCaminhoAtivo(lidos, [ALU])).toEqual([{ alvo: 'familia', nome: 'Alumínio', texto: 'texto ALU' }])
    })
})

describe('o bloco do sistema', () => {
    it('nenhuma linha sem texto; com texto, o cabeçalho e um rótulo por alvo', () => {
        expect(blocoDosTextosDoCaminho([])).toEqual([])
        expect(blocoDosTextosDoCaminho([{ alvo: 'familia', nome: 'PVC Wolf', texto: 'a' }, { alvo: 'fornecedor', nome: 'Wolf', texto: 'b' }]))
            .toEqual([CABECALHO_DOS_TEXTOS_DO_CAMINHO, '[Família PVC Wolf]', 'a', '[Fornecedor Wolf]', 'b'])
    })
})

// ── o corpo do PUT ──
import { lerCorpoDoTexto, textosDaFamiliaNaTela } from '@/lib/atendimentos-ia/textos-do-caminho'
const F = '44c5c0fe-a0d3-4aab-802d-20a6eff3f654'
describe('o corpo do PUT', () => {
    it('a família OU o fornecedor, com o texto aparado; vazio e null limpam', () => {
        expect(lerCorpoDoTexto({ familia: 'PVC', texto: '  a  ' })).toEqual({ ok: true, alvo: { familia: 'PVC', texto: 'a' } })
        expect(lerCorpoDoTexto({ fornecedor_id: F, texto: '   ' })).toEqual({ ok: true, alvo: { fornecedor_id: F, texto: null } })
        expect(lerCorpoDoTexto({ fornecedor_id: F, texto: null })).toEqual({ ok: true, alvo: { fornecedor_id: F, texto: null } })
        expect(lerCorpoDoTexto({ familia: 'PVC', texto: 'é'.repeat(1500) }).ok).toBe(true)
    })
    const erros = (c: unknown) => { const r = lerCorpoDoTexto(c); return r.ok === false ? r.erros : [] }
    it('as recusas, cada uma com a sua frase', () => {
        expect(erros({ familia: 'PVC', fornecedor_id: F, texto: 'a' })).toEqual(['Diga a família OU o fornecedor, um só.'])
        expect(erros({ texto: 'a' })).toEqual(['Diga a família OU o fornecedor, um só.'])
        expect(erros({ familia: 'pvc', texto: 'a' })).toEqual(['A família é a chave do catálogo (maiúsculas, números e _).'])
        expect(erros({ fornecedor_id: 'Wolf', texto: 'a' })).toEqual(['O fornecedor é o id dele.'])
        expect(erros({ familia: 'PVC', texto: 5 })).toEqual(['O texto é texto (ou null para limpar).'])
        expect(erros({ familia: 'PVC', texto: 'x'.repeat(1501) })).toEqual(['O texto tem 1501 caracteres; o limite é 1500.'])
        expect(erros({ familia: 'PVC', texto: 'a', tenant_id: 'outra' })).toEqual(['Chave desconhecida: "tenant_id".'])
        expect(erros([])).toEqual(['O corpo precisa ser um objeto: { familia, texto } ou { fornecedor_id, texto }.'])
    })
})

describe('os textos de uma família na tela', () => {
    it('o da família e o de cada fornecedor do caminho, por nome, com o não escrito null; sem a tabela, null', () => {
        expect(textosDaFamiliaNaTela(LIDOS, 'PVC')).toEqual({
            familia: 'texto PVC',
            fornecedores: [{ id: 'f-sem-texto', nome: 'Celsus', texto: null }, { id: 'f-estrela', nome: 'Estrela', texto: 'texto Estrela' }, { id: 'f-wolf', nome: 'Wolf', texto: 'texto Wolf' }],
        })
        expect(textosDaFamiliaNaTela({ estado: 'sem_migracao' }, 'PVC')).toBeNull()
        expect(textosDaFamiliaNaTela({ estado: 'vazio' }, 'PVC')).toEqual({ familia: null, fornecedores: [] })
    })
})

// ── o leitor (banco falso, filtrado pela empresa) ──
type L = Record<string, unknown>
const T = 't-de-paula'
const banco: { db: Record<string, L[]>; ausente: boolean; leituras: string[] } = { db: {}, ausente: false, leituras: [] }
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const fs: Array<(l: L) => boolean> = []
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { fs.push((l) => l[c] === v); return q }
            q.in = (c: string, vs: unknown[]) => { fs.push((l) => vs.includes(l[c])); return q }
            q.not = (c: string) => { fs.push((l) => l[c] !== null && l[c] !== undefined); return q }
            q.then = (ok: (v: unknown) => unknown) => {
                banco.leituras.push(tabela)
                if (banco.ausente && tabela === 'orcamentista_texto_do_caminho') return Promise.resolve({ data: null, error: { code: 'PGRST205' } }).then(ok)
                return Promise.resolve({ data: (banco.db[tabela] ?? []).filter((l) => fs.every((f) => f(l))), error: null }).then(ok)
            }
            return q
        },
    },
}))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const leitor = () => require('@/lib/atendimentos-ia/textos-do-caminho-servidor') as typeof import('@/lib/atendimentos-ia/textos-do-caminho-servidor')
describe('o leitor', () => {
    beforeEach(() => {
        banco.ausente = false
        banco.leituras = []
        banco.db = {
            orcamentista_texto_do_caminho: [
                { tenant_id: T, familia: 'PVC', fornecedor_id: null, texto: 'texto PVC' },
                { tenant_id: T, familia: null, fornecedor_id: 'f-wolf', texto: 'texto Wolf' },
                { tenant_id: T, familia: null, fornecedor_id: 'f-estrela', texto: null },
                { tenant_id: 'outra', familia: 'PVC', fornecedor_id: null, texto: 'DE OUTRA EMPRESA' },
            ],
            orcamentista_materia_prima: [{ id: 'mp-1', tenant_id: T, familia: 'PVC' }, { id: 'mp-x', tenant_id: 'outra', familia: 'PVC' }],
            orcamentista_mp_categoria: [{ id: 'c-1', tenant_id: T, materia_prima_id: 'mp-1' }, { id: 'c-x', tenant_id: 'outra', materia_prima_id: 'mp-x' }],
            orcamentista_mp_categoria_fornecedor: [{ tenant_id: T, mp_categoria_id: 'c-1', fornecedor_id: 'f-estrela' }, { tenant_id: 'outra', mp_categoria_id: 'c-x', fornecedor_id: 'f-alheio' }],
            orcamentista_familia_etapa: [{ tenant_id: T, materia_prima_id: 'mp-1', motor_id: 'm-1' }, { tenant_id: T, materia_prima_id: 'mp-1', motor_id: null }],
            orcamentista_motor: [{ id: 'm-1', fornecedor_id: 'f-wolf' }],
            orcamentista_fornecedor: [{ id: 'f-wolf', nome: 'Wolf' }, { id: 'f-estrela', nome: '  ' }, { id: 'f-alheio', nome: 'Alheio' }],
        }
    })
    it('os escritos da empresa e o caminho de cada família (o vínculo e o motor da etapa); o de outra empresa não', async () => {
        const r = await leitor().lerTextosDoCaminho(T)
        if (r.estado !== 'sim') throw new Error(r.estado)
        expect([...r.daFamilia]).toEqual([['PVC', 'texto PVC']])
        expect([...r.doFornecedor]).toEqual([['f-wolf', 'texto Wolf']])
        expect([...r.caminho.get('PVC')!]).toEqual([['f-estrela', '(fornecedor sem nome)'], ['f-wolf', 'Wolf']])
        expect([...r.caminho.keys()]).toEqual(['PVC'])
    })
    it('nada escrito: UMA leitura só, vazio; com sempreOCaminho (a tela), o caminho vem', async () => {
        banco.db.orcamentista_texto_do_caminho = []
        expect(await leitor().lerTextosDoCaminho(T)).toEqual({ estado: 'vazio' })
        expect(banco.leituras).toEqual(['orcamentista_texto_do_caminho'])
        const r = await leitor().lerTextosDoCaminho(T, { sempreOCaminho: true })
        if (r.estado !== 'sim') throw new Error(r.estado)
        expect([...r.caminho.get('PVC')!.keys()]).toEqual(['f-estrela', 'f-wolf'])
    })
    it('sem a tabela (a migração pendente): sem_migracao, sem lançar', async () => {
        banco.ausente = true
        expect(await leitor().lerTextosDoCaminho(T)).toEqual({ estado: 'sem_migracao' })
    })
})
