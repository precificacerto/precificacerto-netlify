/**
 * @jest-environment node
 *
 * PORTÃO — A TELA DA NATUREZA DA VARIÁVEL (dono do produto, item (3) da ordem, 21/11/2026; migração 20261121000002). O que a tela e a rota
 * decidem sem banco: o resumo das variáveis do motor, a conferência de uma opção em texto contra as tipologias (pelo tradutor da conversa),
 * a leitura do corpo do PUT com as CHECKs ditas antes da função, e a rota (quem passa, o autor da sessão, a linha 1:1 à função).
 * O que a FUNÇÃO faz (cria/troca/igual, o log, a família da empresa, a trava, os grants) está no Postgres real: scripts/harness/gravar-natureza/.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { conferirOpcao, fraseDaConferencia, lerLinhaDaTela, resumoDasVariaveis } from '@/lib/atendimentos-ia/tela-da-natureza'
import type { VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'

const V = (variavel: string, opcoes: string | null, descricao: string | null = null) => ({ variavel, descricao, padrao: null as string | null, condicao: null as string | null, opcoes })
// a MAE como medida em 20/11/2026: a opção 2 é "VÃO+50" numa tipologia e "VÃO+90" noutra
const MOTOR: Record<string, VariaveisDaTipologia> = {
    'DP-01': { variaveis: [V('MAE', '1=SEM ARREMATE;2=VÃO+50MM (CORTE 90/90)', 'Medida do arremate externo'), V('RL', '0=NAO;1=SIM')] },
    'DP-02': { variaveis: [V('MAE', '1=SEM ARREMATE;2=VÃO+50MM (CORTE 90/90)'), V('RL', '0=NAO;1=SIM')] },
    'DP-07': { variaveis: [V('MAE', '1=SEM ARREMATE;2=VÃO+90MM (CORTE 45/45)')] },
    'DP-09': { variaveis: [V('MAE', '1=VÃO+50MM (CORTE 90/90);2=VÃO+50MM (CORTE 45/45)')] },
}

describe('o resumo das variáveis', () => {
    it('cada variável com as tipologias e as opções distintas pelo rótulo, contadas', () => {
        const r = resumoDasVariaveis(MOTOR)
        expect(r.map((v) => `${v.variavel}:${v.tipologias}`)).toEqual(['MAE:4', 'RL:2'])
        const mae = r[0]
        expect(mae.descricao).toBe('Medida do arremate externo')
        expect(mae.opcoes).toEqual([
            { rotulo: 'SEM ARREMATE', tipologias: 3 },
            { rotulo: 'VÃO+50MM (CORTE 45/45)', tipologias: 1 },
            { rotulo: 'VÃO+50MM (CORTE 90/90)', tipologias: 3 },
            { rotulo: 'VÃO+90MM (CORTE 45/45)', tipologias: 1 },
        ])
    })
    it('a descrição é a primeira que o motor traz, não a última', () => {
        const r = resumoDasVariaveis({ 'DP-01': { variaveis: [V('UT', null, 'primeira')] }, 'DP-02': { variaveis: [V('UT', null, 'segunda')] } })
        expect(r[0].descricao).toBe('primeira')
    })
    it('variável sem opções lidas entra com a lista vazia; nenhuma descrição é null', () => {
        const r = resumoDasVariaveis({ 'DP-01': { variaveis: [V('UT', null)] } })
        expect(r).toEqual([{ variavel: 'UT', descricao: null, tipologias: 1, opcoes: [] }])
    })
})

describe('a conferência da opção em texto', () => {
    // a mesma forma de opções numa variável SEM a regra do ajuste em obra (só a MAE a tem): nenhuma e mais de uma continuam listadas
    const OUTRA: Record<string, VariaveisDaTipologia> = Object.fromEntries(Object.entries(MOTOR).map(([t, { variaveis }]) =>
        [t, { variaveis: variaveis.map((v) => (v.variavel === 'MAE' ? { ...v, variavel: 'MAX' } : v)) }]))
    it('o começo do rótulo casa por tipologia; nenhuma e mais de uma são listadas', () => {
        expect(conferirOpcao('MAX', 'VAO+50MM (CORTE 90/90)', OUTRA)).toEqual({ casam: 3, ajuste: [], semOpcao: ['DP-07'], maisDeUma: [] })
        expect(conferirOpcao('MAX', 'VÃO+50', OUTRA)).toEqual({ casam: 2, ajuste: [], semOpcao: ['DP-07'], maisDeUma: ['DP-09'] })
    })
    it('na MAE, a tipologia sem a opção da política vai para o AJUSTE (a de ajuste em obra, ou a 1), não para a recusa; mais de uma continua recusa', () => {
        expect(conferirOpcao('MAE', 'VAO+50MM (CORTE 90/90)', MOTOR)).toEqual({ casam: 3, ajuste: ['DP-07'], semOpcao: [], maisDeUma: [] })
        expect(conferirOpcao('MAE', 'VÃO+50', MOTOR)).toEqual({ casam: 2, ajuste: ['DP-07'], semOpcao: [], maisDeUma: ['DP-09'] })
    })
    it('SIM/NAO casam exatos, e a tipologia sem a variável não conta', () => {
        expect(conferirOpcao('RL', 'SIM', MOTOR)).toEqual({ casam: 2, ajuste: [], semOpcao: [], maisDeUma: [] })
        expect(conferirOpcao('RL', 'TALVEZ', MOTOR)).toEqual({ casam: 0, ajuste: [], semOpcao: ['DP-01', 'DP-02'], maisDeUma: [] })
    })
    it('a frase diz quantas casam e nomeia as outras; todas casando, null', () => {
        expect(fraseDaConferencia('RL', 'SIM', { casam: 2, ajuste: [], semOpcao: [], maisDeUma: [] })).toBeNull()
        expect(fraseDaConferencia('MAX', 'VÃO+50', conferirOpcao('MAX', 'VÃO+50', OUTRA))).toBe(
            'Casa em 2 tipologias; 1 sem opção de MAX que comece com "VÃO+50" (DP-07); 1 com mais de uma opção que começa assim (DP-09). '
            + 'Nas que não casam nem têm ajuste, a conversa recusa nomeando a política, nunca escolhe uma opção.')
        expect(fraseDaConferencia('MAE', 'VÃO+50', { casam: 5, ajuste: ['DP-113'], semOpcao: [], maisDeUma: [] }))
            .toBe('Casa em 5 tipologias; 1 sem essa opção, onde entra a de ajuste em obra que a tipologia oferece (DP-113).')
        expect(fraseDaConferencia('MAE', 'VÃO', { casam: 0, ajuste: [], semOpcao: [], maisDeUma: ['DP-09'] }))
            .toBe('Casa em 0 tipologias; 1 com mais de uma opção que começa assim (DP-09). Nas que não casam nem têm ajuste, a conversa recusa nomeando a política, nunca escolhe uma opção.')
        const muitas = Array.from({ length: 12 }, (_, i) => `T${i + 1}`)
        expect(fraseDaConferencia('X', 'a', { casam: 1, ajuste: [], semOpcao: muitas, maisDeUma: [] })).toContain('(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10 e mais 2)')
    })
})

describe('a leitura do corpo do PUT', () => {
    const ok = (linha: Record<string, unknown>) => lerLinhaDaTela({ linha })
    it('a política com a opção aparada; o item e o cálculo sem opção; o formato vazio é nulo', () => {
        expect(ok({ familia: 'PVC', variavel: 'ARI', natureza: 'POLITICA', opcao_padrao: ' BZ1770 ' }))
            .toEqual({ ok: true, linha: { familia: 'PVC', formato: null, variavel: 'ARI', natureza: 'POLITICA', opcao_padrao: 'BZ1770' } })
        expect(ok({ familia: 'PVC', variavel: 'INT', natureza: 'CALCULO', opcao_padrao: '  ', formato: '' }))
            .toEqual({ ok: true, linha: { familia: 'PVC', formato: null, variavel: 'INT', natureza: 'CALCULO', opcao_padrao: null } })
        expect(ok({ familia: 'PVC', variavel: 'VIDRO', natureza: 'POLITICA', opcao_padrao: 'VBO3,4', formato: 'maxim-ar' }))
            .toEqual({ ok: true, linha: { familia: 'PVC', formato: 'maxim-ar', variavel: 'VIDRO', natureza: 'POLITICA', opcao_padrao: 'VBO3,4' } })
    })
    const recusa = (linha: Record<string, unknown>) => { const r = ok(linha); return r.ok === false ? r.erros : [] }
    it('as CHECKs ditas antes da função, cada uma com a sua frase', () => {
        expect(recusa({ familia: 'PVC', variavel: 'ARI', natureza: 'POLITICA' })).toEqual(['A política da empresa precisa da opção padrão: é ela que o agente aplica sem perguntar.'])
        expect(recusa({ familia: 'PVC', variavel: 'ARI', natureza: 'ITEM', opcao_padrao: 'X' })).toEqual(['Só a política da empresa tem opção padrão; do item e do cálculo, deixe em branco.'])
        expect(recusa({ familia: 'PVC', variavel: 'ARI', natureza: 'OUTRA' })).toEqual(['A natureza é uma de: POLITICA, ITEM, CALCULO.'])
        expect(recusa({ familia: 'PVC', variavel: 'ARI', natureza: 'ITEM', formato: 'maxim-ar' })).toEqual(['Só o VIDRO tem padrão por formato; as variáveis do motor valem para a família inteira.'])
        expect(recusa({ familia: 'PVC', variavel: 'VIDRO', natureza: 'ITEM', formato: 'Maxim-ar' })).toEqual(['O formato é o grupo da tipologia em minúsculas ("janela correr", "maxim-ar").'])
        expect(recusa({ familia: 'pvc', variavel: 'ARI', natureza: 'ITEM' })).toEqual(['A família é a chave do catálogo (maiúsculas, números e _).'])
        expect(recusa({ familia: 'PVC', variavel: 'ari', natureza: 'ITEM' })).toEqual(['A variável é o nome do motor (maiúsculas, números e _).'])
        expect(recusa({ familia: 'PVC', variavel: 'ARI', natureza: 'POLITICA', opcao_padrao: 'x'.repeat(121) })).toEqual(['A opção padrão tem 121 caracteres; o limite é 120.'])
        expect(recusa({ familia: 'PVC', variavel: 'ARI', natureza: 'POLITICA', opcao_padrao: 5 })).toContain('A opção padrão é texto.')
        expect(recusa({ familia: 'PVC', variavel: 'ARI', natureza: 'ITEM', linha: 'EUROPA 42' })).toEqual(['Chave desconhecida: "linha".'])
        expect(lerLinhaDaTela({})).toEqual({ ok: false, erros: ['O corpo precisa de "linha", um objeto.'] })
        expect(lerLinhaDaTela({ linha: [] })).toEqual({ ok: false, erros: ['O corpo precisa de "linha", um objeto.'] })
    })
    it('120 caracteres passam (o limite da CHECK)', () => {
        expect(ok({ familia: 'PVC', variavel: 'ARI', natureza: 'POLITICA', opcao_padrao: 'x'.repeat(120) }).ok).toBe(true)
    })
})

// ── a rota ──
const T = '00000000-0000-4000-8000-0000000000a1'
const chamadas: Array<{ funcao: string; args: Record<string, unknown> }> = []
let superAdmin: { user_id: string } | null = { user_id: 'sessao-1' }
jest.mock('@/lib/get-caller-tenant', () => ({
    superAdminOu404: jest.fn(async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
        if (superAdmin === null) { res.status(404).json({ error: 'Not found' }); return null }
        return superAdmin
    }),
}))
jest.mock('@/lib/atendimentos-ia/base-de-conhecimento-servidor', () => ({
    empresaDoPedido: jest.fn(async (req: { query: Record<string, string> }) => req.query.tenant),
    falhaDeLeitura: jest.fn((res: { status: (n: number) => { json: (b: unknown) => void } }) => res.status(500).json({ error: 'Falha ao ler a base de conhecimento.' })),
    metodoNaoPermitido: jest.fn((res: { status: (n: number) => { json: (b: unknown) => void } }) => res.status(405).json({ error: 'Method not allowed' })),
    gravarPelaFuncaoComAMensagemDela: jest.fn(async (res: { status: (n: number) => { json: (b: unknown) => void } }, funcao: string, args: Record<string, unknown>) => {
        chamadas.push({ funcao, args }); return res.status(200).json({ depois: { resultado: 'criada' } })
    }),
}))
const tela = { ok: true, familias: [] as unknown[] }
jest.mock('@/lib/atendimentos-ia/tela-da-natureza-servidor', () => ({ lerTelaDaNatureza: jest.fn(async () => tela) }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const handler = require('@/pages/api/super-admin/base-de-conhecimento/natureza').default

async function chamar(method: string, body: unknown = undefined) {
    let status = 0; let json: unknown = null
    const res = { status(n: number) { status = n; return this }, json(b: unknown) { json = b; return this }, setHeader() { return this } }
    await handler({ method, query: { tenant: T }, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json: json as Record<string, unknown> }
}

describe('a rota', () => {
    beforeEach(() => { chamadas.length = 0; superAdmin = { user_id: 'sessao-1' } })
    it('quem não é super admin: 404 e nada chamado', async () => {
        superAdmin = null
        expect((await chamar('PUT', { linha: { familia: 'PVC', variavel: 'ARI', natureza: 'ITEM' } })).status).toBe(404)
        expect(chamadas).toEqual([])
    })
    it('GET devolve a leitura da tela', async () => {
        expect(await chamar('GET')).toEqual({ status: 200, json: tela })
    })
    it('PUT: a linha lida vai à função com o autor da SESSÃO e o tenant do pedido', async () => {
        const r = await chamar('PUT', { linha: { familia: 'PVC', variavel: 'ARI', natureza: 'POLITICA', opcao_padrao: ' BZ0006 ' } })
        expect(r.status).toBe(200)
        expect(chamadas).toEqual([{ funcao: 'superadmin_gravar_natureza', args: { p_tenant: T, p_por: 'sessao-1',
            p_linha: { familia: 'PVC', formato: null, variavel: 'ARI', natureza: 'POLITICA', opcao_padrao: 'BZ0006' } } }])
    })
    it('PUT recusado antes da função: 400 com as frases, nada chamado', async () => {
        const r = await chamar('PUT', { linha: { familia: 'PVC', variavel: 'ARI', natureza: 'POLITICA', por: 'outro' } })
        expect(r.status).toBe(400)
        expect(r.json.erros).toEqual(['Chave desconhecida: "por".', 'A política da empresa precisa da opção padrão: é ela que o agente aplica sem perguntar.'])
        expect(chamadas).toEqual([])
    })
    it('DELETE não existe: 405', async () => {
        expect((await chamar('DELETE')).status).toBe(405)
        expect(chamadas).toEqual([])
    })
})

// ── a rota dos textos por família e fornecedor (20261121000003) ──
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDosTextos = require('@/pages/api/super-admin/base-de-conhecimento/textos-do-caminho').default
async function chamarTextos(method: string, body: unknown = undefined) {
    let status = 0; let json: unknown = null
    const res = { status(n: number) { status = n; return this }, json(b: unknown) { json = b; return this }, setHeader() { return this } }
    await rotaDosTextos({ method, query: { tenant: T }, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json: json as Record<string, unknown> }
}
describe('a rota dos textos do caminho', () => {
    beforeEach(() => { chamadas.length = 0; superAdmin = { user_id: 'sessao-1' } })
    it('PUT: o alvo lido vai à função com o autor da SESSÃO e o tenant do pedido', async () => {
        expect((await chamarTextos('PUT', { fornecedor_id: '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', texto: ' Tabela rev2 ' })).status).toBe(200)
        expect(chamadas).toEqual([{ funcao: 'superadmin_gravar_texto_do_caminho', args: { p_tenant: T, p_por: 'sessao-1',
            p_alvo: { fornecedor_id: '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', texto: 'Tabela rev2' } } }])
    })
    it('PUT recusado antes da função (os dois alvos): 400 com a frase, nada chamado', async () => {
        const r = await chamarTextos('PUT', { familia: 'PVC', fornecedor_id: '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', texto: 'a' })
        expect(r.status).toBe(400)
        expect(r.json.erros).toEqual(['Diga a família OU o fornecedor, um só.'])
        expect(chamadas).toEqual([])
    })
    it('quem não é super admin: 404, nada chamado; GET e DELETE: 405', async () => {
        superAdmin = null
        expect((await chamarTextos('PUT', { familia: 'PVC', texto: 'a' })).status).toBe(404)
        superAdmin = { user_id: 'sessao-1' }
        expect((await chamarTextos('GET')).status).toBe(405)
        expect((await chamarTextos('DELETE')).status).toBe(405)
        expect(chamadas).toEqual([])
    })
})
