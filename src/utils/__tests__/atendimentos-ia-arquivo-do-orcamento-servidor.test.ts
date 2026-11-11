/**
 * @jest-environment node
 *
 * PORTÃO — o ARQUIVO "ORÇAMENTO" do lado do servidor (dono do produto, 11/11/2026): os itens montados do que está gravado, no tenant do chamador;
 * a empresa, o cliente e o vendedor lidos das colunas que existem (o resto em branco); o objeto no bucket e a linha do arquivo com o sha256 do que
 * subiu, a origem manual e o autor; e nada gravado quando o arquivo recusa ou o Storage falha.
 */
import { createHash } from 'crypto'

type Linha = Record<string, unknown>
const T = 'tenant-de-paula'
const OUTRO = 'tenant-de-outra'
const ORC = 'orc-1'
const estado = {
    db: {} as Record<string, Linha[]>,
    ops: [] as Array<{ tabela: string; op: string; filtros: Array<[string, unknown]>; carga?: unknown }>,
    uploads: [] as Array<{ bucket: string; caminho: string; bytes: Buffer; opcoes: unknown }>,
    erroDoUpload: null as string | null,
}
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            let op = 'select'
            let carga: unknown
            let ordem: [string, boolean] | null = null
            let limite: number | null = null
            const q: Record<string, unknown> = {}
            const rodar = () => {
                estado.ops.push({ tabela, op, filtros, carga })
                if (op === 'insert') { (estado.db[tabela] ??= []).push(carga as Linha); return Promise.resolve({ data: null, error: null }) }
                let r = (estado.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => (Array.isArray(v) ? (v as unknown[]).includes(l[c]) : l[c] === v)))
                if (ordem) { const [c, asc] = ordem; r = [...r].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (asc ? 1 : -1)) }
                if (limite !== null) r = r.slice(0, limite)
                return Promise.resolve({ data: r.map((l) => ({ ...l })), error: null })
            }
            q.select = () => q
            q.order = (c: string, o?: { ascending?: boolean }) => { ordem = [c, o?.ascending !== false]; return q }
            q.limit = (n: number) => { limite = n; return q }
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.in = (c: string, v: unknown[]) => { filtros.push([c, v]); return q }
            q.insert = (c: unknown) => { op = 'insert'; carga = c; return q }
            q.maybeSingle = () => rodar().then((r) => ({ data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error }))
            q.then = (ok: (v: unknown) => unknown, e?: (x: unknown) => unknown) => rodar().then(ok, e)
            return q
        },
        storage: {
            from: (bucket: string) => ({
                download: async (caminho: string): Promise<{ data: Blob | null; error: { message: string } | null }> => {
                    const up = estado.uploads.find((u) => u.bucket === bucket && u.caminho === caminho)
                    return up ? { data: new Blob([new Uint8Array(up.bytes)]), error: null } : { data: null, error: { message: 'objeto ausente' } }
                },
                upload: async (caminho: string, bytes: Buffer, opcoes: unknown): Promise<{ data: { path: string } | null; error: { message: string } | null }> => {
                    if (estado.erroDoUpload) return { data: null, error: { message: estado.erroDoUpload } }
                    estado.uploads.push({ bucket, caminho, bytes, opcoes }); return { data: { path: caminho }, error: null }
                },
            }),
        },
    },
}))
// o contexto da tipologia (definição e detalhe) é o da conversa, com portão próprio: aqui ele devolve a descrição, o tipo, a linha e o fornecedor
jest.mock('@/lib/atendimentos-ia/conversa-da-ia', () => ({
    contextoDaFolhaDaEmpresa: async () => ({
        definicao: (): null => null,
        detalhe: (tipologia: string, familia: string | null) => ({ descricao: `${tipologia} DA ${familia ?? 'SEM FAMÍLIA'}`, linha: 'EUROPA 60', tipo: 'Porta', fornecedor: 'Wolf' }),
    }),
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const S = require('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor') as typeof import('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor')
const { ratearOperacaoInterna } = require('@/lib/atendimentos-ia/rateio-do-orcamento') as typeof import('@/lib/atendimentos-ia/rateio-do-orcamento')
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(() => {
    estado.ops = []; estado.uploads = []; estado.erroDoUpload = null
    estado.db = {
        tenants: [{ id: T, name: 'ESQUADRIAS DE PAULA LTDA', cnpj_cpf: '12.345.678/0001-90', email: null, phone: null, cep: '90000-000', street: 'Rua das Flores', number: '100',
            complement: null, neighborhood: 'Centro', city: 'Porto Alegre', state_code: 'RS', logo_url: null }],
        tenant_settings: [{ tenant_id: T, inscricao_estadual: '0960000000', logo_url: null }],
        orcamentista_orcamento: [{ id: ORC, tenant_id: T, numero: 1, nome: 'Geraldo Huck', levantamento_id: 'lev-1' }],
        orcamentista_orcamento_item: [
            { id: 'oi-1', tenant_id: T, orcamento_id: ORC, ordem: 1, levantamento_item_id: 'li-1', tipologia: 'DP-39', largura_mm: 2500, altura_mm: 2200, quantidade: 1,
                cor_perfil: 'Branco', vidro: 'comum 6 mm incolor', obs: null, ambientes: [{ ambiente: 'Sala', quantidade: 1 }], escolhas: null, calculo_id: 'calc-1', custo_liquido_total: 2594.15 },
            { id: 'oi-2', tenant_id: T, orcamento_id: ORC, ordem: 2, levantamento_item_id: 'li-2', tipologia: 'DP-02', largura_mm: null, altura_mm: null, quantidade: 2,
                cor_perfil: 'Branco', vidro: 'incolor 4 mm comum', obs: 'vão de gesso', ambientes: null, escolhas: null, calculo_id: 'calc-1', custo_liquido_total: 2225.04 },
            { id: 'oi-x', tenant_id: OUTRO, orcamento_id: ORC, ordem: 9, levantamento_item_id: null, tipologia: 'X', quantidade: 1 },
        ],
        orcamentista_levantamento_item: [{ id: 'li-1', tenant_id: T, familia: 'PVC' }, { id: 'li-2', tenant_id: T, familia: 'PVC' }, { id: 'li-1', tenant_id: OUTRO, familia: 'OUTRA' }],
        orcamentista_levantamento: [{ id: 'lev-1', tenant_id: T, nome: 'Geraldo Huck', telefone: '(51) 99999-0000', email: null, endereco: 'Porto Alegre', data_entrega: null,
            vendedor_nome: 'Cristiano Fernandes', vendedor_employee_id: 'emp-1' }],
        // o MESMO id em outra empresa vem PRIMEIRO: sem o filtro do tenant, a leitura pegaria o e-mail dela
        employees: [{ id: 'emp-1', tenant_id: OUTRO, email: 'outro@exemplo.com' }, { id: 'emp-1', tenant_id: T, email: 'cristiano@exemplo.com' }],
    }
})

describe('os itens do arquivo, montados do que está gravado', () => {
    it('no tenant do chamador; a família do item de origem decide o detalhe; ambientes por extenso; sem medida, sem desenho', async () => {
        const r = await S.itensDoArquivo(T, ORC)
        if ('recusa' in r) throw new Error(r.recusa)
        expect(r.itens.map((i) => i.ordem)).toEqual([1, 2])
        expect(r.itens[0]).toEqual(expect.objectContaining({ descricao: 'DP-39 DA PVC', tipo: 'Porta', fornecedor: 'Wolf', linha: 'EUROPA 60', ambientes: 'Sala (1)', vidro: 'comum 6 mm incolor' }))
        expect(r.itens[0].desenho).toEqual(expect.objectContaining({ largura_mm: 2500, altura_mm: 2200 }))
        expect(r.itens[1]).toEqual(expect.objectContaining({ ambientes: null, obs: 'vão de gesso', desenho: null }))
        for (const o of estado.ops) expect(o.filtros).toContainEqual(['tenant_id', T])
    })
})

describe('a empresa, o cliente e o vendedor', () => {
    it('o telefone vai a CELULAR ou a TEL. FIXO pela forma do número', () => {
        expect(S.tipoDoTelefone('(51) 99999-0000')).toBe('celular')
        expect(S.tipoDoTelefone('+55 51 99999-0000')).toBe('celular')
        expect(S.tipoDoTelefone('99999-0000')).toBe('celular')
        expect(S.tipoDoTelefone('(51) 3333-0000')).toBe('fixo')
        expect(S.tipoDoTelefone('3333-0000')).toBe('fixo')
    })
    it('os dados: o que tem coluna, preenchido; o que não tem (telefone 2, site, contato, observações), em branco; o e-mail do vendedor DA empresa', async () => {
        const r = ratearOperacaoInterna(7000, [{ ordem: 1, quantidade: 1, peso: 2594.15 }, { ordem: 2, quantidade: 2, peso: 2225.04 }])
        if ('recusa' in r) throw new Error(r.recusa)
        const lido = await S.lerDadosDoArquivo(T, ORC, { operacaoInterna: 7000, valorVenda: 7000, rateio: r.itens, geradoEm: new Date('2026-11-11T15:00:00Z') })
        if ('recusa' in lido) throw new Error(lido.recusa)
        const d = lido.dados
        expect(d.empresa).toEqual(expect.objectContaining({ razaoSocial: 'ESQUADRIAS DE PAULA LTDA', endereco: 'Rua das Flores, 100 - Centro', cidadeUf: 'Porto Alegre/RS', ie: '0960000000',
            telefone: null, telefone2: null, site: null, email: null, logo: null }))
        expect(d.cliente).toEqual({ nome: 'Geraldo Huck', telFixo: null, celular: '(51) 99999-0000', email: null, tel2: null, endereco: 'Porto Alegre', ieRg: null, cep: null, cnpjCpf: null })
        expect([d.vendedor, d.emailDoVendedor, d.contato, d.observacoesGerais]).toEqual(['Cristiano Fernandes', 'cristiano@exemplo.com', null, null])
        expect(lido.calculoId).toBe('calc-1')
    })
    it('o logo: data URL de PNG vale; http sem s, nunca; sem URL, nulo', async () => {
        expect(await S.lerLogo('data:image/png;base64,AAAA')).toEqual({ dados: 'data:image/png;base64,AAAA', formato: 'PNG' })
        expect(await S.lerLogo('http://exemplo.com/logo.png')).toBeNull()
        expect(await S.lerLogo(null)).toBeNull()
    })
})

describe('gerar e gravar: o objeto primeiro, a linha depois, e nada quando não pode', () => {
    const dadosDoArquivo = async (venda = 7000) => {
        const r = ratearOperacaoInterna(7000, [{ ordem: 1, quantidade: 1, peso: 2594.15 }, { ordem: 2, quantidade: 2, peso: 2225.04 }])
        if ('recusa' in r) throw new Error(r.recusa)
        const lido = await S.lerDadosDoArquivo(T, ORC, { operacaoInterna: 7000, valorVenda: venda, rateio: r.itens, geradoEm: new Date('2026-11-11T15:00:00Z') })
        if ('recusa' in lido) throw new Error(lido.recusa)
        return lido
    }
    it('sobe o PDF no bucket, num caminho novo e sem espaço, e grava a linha com o sha256 DO QUE SUBIU, a origem manual e o autor', async () => {
        const lido = await dadosDoArquivo()
        const r = await S.gerarEGravarArquivo(T, ORC, 'usuario-1', lido.dados, lido.calculoId)
        if (!r.ok) throw new Error('recusou')
        expect(estado.uploads).toHaveLength(1)
        const up = estado.uploads[0]
        expect(up.bucket).toBe('atendimentos-ia')
        expect(up.caminho).toMatch(new RegExp(`^orcamentos/${T}/${ORC}/[0-9a-f-]{36}\\.pdf$`))
        expect(up.opcoes).toEqual({ contentType: 'application/pdf', upsert: false })
        expect(up.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')
        const [linha] = estado.db.orcamentista_orcamento_arquivo
        expect(linha).toEqual(expect.objectContaining({ tenant_id: T, orcamento_id: ORC, calculo_id: 'calc-1', bucket: 'atendimentos-ia', caminho: up.caminho,
            sha256: createHash('sha256').update(up.bytes).digest('hex'), tamanho_bytes: up.bytes.length, valor_venda: 7000, gerado_origem: 'manual', gerado_por: 'usuario-1' }))
        expect(r.arquivo.nomeDoArquivo).toBe('Orcamento 1 - Geraldo Huck.pdf')
    })
    it('sem autor (o AGENTE, a cadeia do "sim"): a linha sai com a origem agente e gerado_por NULO (a CHECK gerado_por_amarrado)', async () => {
        const lido = await dadosDoArquivo()
        const r = await S.gerarEGravarArquivo(T, ORC, null, lido.dados, lido.calculoId)
        if (!r.ok) throw new Error('recusou')
        const [linha] = estado.db.orcamentista_orcamento_arquivo
        expect(linha).toEqual(expect.objectContaining({ gerado_origem: 'agente', gerado_por: null }))
    })
    it('a recusa do arquivo (a venda diferente da interna): nada sobe e nada se grava', async () => {
        const lido = await dadosDoArquivo(7300)
        const r = await S.gerarEGravarArquivo(T, ORC, 'usuario-1', lido.dados, lido.calculoId)
        expect(r.ok).toBe(false)
        expect(estado.uploads).toEqual([])
        expect(estado.db.orcamentista_orcamento_arquivo).toBeUndefined()
    })
    it('o Storage falha: lança, e a linha do arquivo NÃO é gravada (nunca uma linha apontando para nada)', async () => {
        const lido = await dadosDoArquivo()
        estado.erroDoUpload = 'bucket indisponível'
        await expect(S.gerarEGravarArquivo(T, ORC, 'usuario-1', lido.dados, lido.calculoId)).rejects.toThrow('bucket indisponível')
        expect(estado.db.orcamentista_orcamento_arquivo).toBeUndefined()
    })
})

describe('o cliente do TOPO da tela (11/11/2026)', () => {
    it('as credenciais do levantamento de origem, no tenant do chamador; o que não tem coluna fica nulo (a tela o mostra em branco)', async () => {
        expect(await S.lerClienteDoOrcamento(T, ORC)).toEqual({ nome: 'Geraldo Huck', telFixo: null, celular: '(51) 99999-0000', email: null, tel2: null,
            endereco: 'Porto Alegre', ieRg: null, cep: null, cnpjCpf: null })
        expect(estado.ops.filter((o) => o.tabela === 'orcamentista_orcamento' || o.tabela === 'orcamentista_levantamento')
            .every((o) => o.filtros.some(([c, v]) => c === 'tenant_id' && v === T))).toBe(true)
    })
    it('o orçamento de outra empresa não é achado: nulo', async () => {
        expect(await S.lerClienteDoOrcamento(OUTRO, ORC)).toBeNull()
    })
})

describe('o último arquivo, para a tela abrir', () => {
    it('o mais novo do orçamento, no tenant do chamador; sem arquivo, nulo', async () => {
        expect(await S.lerUltimoArquivo(T, ORC)).toBeNull()
        const r = ratearOperacaoInterna(7000, [{ ordem: 1, quantidade: 1, peso: 2594.15 }, { ordem: 2, quantidade: 2, peso: 2225.04 }])
        if ('recusa' in r) throw new Error(r.recusa)
        const lido = await S.lerDadosDoArquivo(T, ORC, { operacaoInterna: 7000, valorVenda: 7000, rateio: r.itens, geradoEm: new Date('2026-11-11T15:00:00Z') })
        if ('recusa' in lido) throw new Error(lido.recusa)
        const g = await S.gerarEGravarArquivo(T, ORC, 'usuario-1', lido.dados, lido.calculoId)
        if (!g.ok) throw new Error('recusou')
        estado.ops = []
        const a = await S.lerUltimoArquivo(T, ORC)
        expect(a?.caminho).toBe(g.arquivo.caminho)
        expect(a?.pdf.subarray(0, 4).toString('latin1')).toBe('%PDF')
        expect(estado.ops.filter((o) => o.tabela === 'orcamentista_orcamento_arquivo').every((o) => o.filtros.some(([c, v]) => c === 'tenant_id' && v === T))).toBe(true)
        expect(await S.lerUltimoArquivo(OUTRO, ORC)).toBeNull()
    })
    it('com dois arquivos, abre o MAIS NOVO (gerado_em), não o primeiro gravado', async () => {
        const pdf = (t: string) => Buffer.from(`%PDF-${t}`)
        estado.db.orcamentista_orcamento_arquivo = [
            { tenant_id: T, orcamento_id: ORC, bucket: 'atendimentos-ia', caminho: 'orcamentos/velho.pdf', gerado_em: '2026-11-10T10:00:00.000Z' },
            { tenant_id: T, orcamento_id: ORC, bucket: 'atendimentos-ia', caminho: 'orcamentos/novo.pdf', gerado_em: '2026-11-11T10:00:00.000Z' },
            { tenant_id: T, orcamento_id: ORC, bucket: 'atendimentos-ia', caminho: 'orcamentos/meio.pdf', gerado_em: '2026-11-10T20:00:00.000Z' },
        ]
        for (const c of ['velho', 'novo', 'meio']) estado.uploads.push({ bucket: 'atendimentos-ia', caminho: `orcamentos/${c}.pdf`, bytes: pdf(c), opcoes: {} })
        const a = await S.lerUltimoArquivo(T, ORC)
        expect(a?.caminho).toBe('orcamentos/novo.pdf')
        expect(a?.pdf.toString('latin1')).toBe('%PDF-novo')
    })
})
