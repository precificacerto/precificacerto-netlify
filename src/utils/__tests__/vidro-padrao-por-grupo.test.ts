/**
 * PORTÃO — O VIDRO PADRÃO POR GRUPO DE TIPOLOGIA, COM EXCEÇÃO POR TIPOLOGIA (dono do produto, 13/11/2026; `orcamentista_vidro_padrao`, migração
 * 20261113000001, aplicada e conferida). As sementes de produção: janela de correr → VIN05; maxim-ar → VBO3,4. As descrições são as do motor
 * 022fc55e (catálogo da plataforma). `teste-que-nao-exercita`: cada asserção cai sem a peça que ela prova.
 */
const chamadas: Array<{ tabela: string; filtros: Array<[string, string, unknown]> }> = []
const respostas: Record<string, { data: unknown; error: { code: string; message: string } | null }> = {}
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const c = { tabela, filtros: [] as Array<[string, string, unknown]> }
            chamadas.push(c)
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (col: string, v: unknown) => { c.filtros.push(['eq', col, v]); return q }
            q.in = (col: string, v: unknown) => { c.filtros.push(['in', col, v]); return q }
            q.then = (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(respostas[tabela] ?? { data: [], error: null }).then(ok, erro)
            return q
        },
    },
}))
import { readFileSync } from 'fs'
import { join } from 'path'
import {
    grupoDaTipologia, lerVidrosPadraoDaConta, origemNaFrase, padraoDoVidro, vidroCodigoDaEsquadria, vidroNoConsiderado, vidroPadraoDaEsquadria,
    type LinhaDoVidroPadrao, type VidrosPadraoDaConta,
} from '@/lib/atendimentos-ia/vidro-padrao'

const c = (tipologia: string, descricao: string, tipo: string, familia = 'PVC') => ({ tipologia, descricao, tipo, linha: `PVC WOLFF ${descricao.split('|').pop()!.trim()}`, familia })
const DP02 = c('DP-02', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'Correr')
const DP39 = c('DP-39', 'PORTA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'Correr')
const DP01 = c('DP-01', 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | DESIGN', 'Maxim-ar')
const DP128 = c('DP-128', 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | PERFIL MODULAÇÃO | EUROPA 60', 'Maxim-ar')
const DP17 = c('DP-17', 'JANELA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | 02 VIDROS - 01 TELA | EUROPA 42', 'Correr')
const DP017 = c('DP-017', 'JANELA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | 02 VIDROS - 01 TELA | EUROPA 42', 'Correr')
const DP143 = c('DP-143', 'FIXO COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | MODULAÇÃO TRAVESSA | EUROPA 60', 'Fixo')
const L = (x: Partial<LinhaDoVidroPadrao>): LinhaDoVidroPadrao => ({ materia_prima_id: 'mp', abertura: null, tipo: null, tipologia: null, item_codigo: 'X', ...x })
// as duas sementes de produção
const SEMENTES = [L({ abertura: 'janela', tipo: 'correr', item_codigo: 'VIN05' }), L({ abertura: null, tipo: 'maxim-ar', item_codigo: 'VBO3,4' })]
const CONTA: VidrosPadraoDaConta = { ok: true, porFamilia: new Map([['PVC', SEMENTES]]), descricaoDo: new Map([['VIN05', 'VIDRO COMUM INCOLOR 05MM'], ['VBO3,4', 'VIDRO MINI BOREAL 3,4MM']]) }

describe('O GRUPO (forma A): abertura + tipo, pelo leitor do padrão da tipologia', () => {
    it('janela de correr, porta de correr, maxim-ar sem abertura, fixo sem abertura', () => {
        expect(grupoDaTipologia(DP02)).toEqual({ abertura: 'janela', tipo: 'correr' })
        expect(grupoDaTipologia(DP39)).toEqual({ abertura: 'porta', tipo: 'correr' })
        expect(grupoDaTipologia(DP01)).toEqual({ abertura: null, tipo: 'maxim-ar' })
        expect(grupoDaTipologia(DP143)).toEqual({ abertura: null, tipo: 'fixo' })
        expect(grupoDaTipologia({ descricao: 'X', tipo: null, linha: null })).toBeNull()
    })
})

describe('O PADRÃO: a exceção vence o grupo; o PAR exato; nunca a primeira de duas que discordam', () => {
    it('as sementes: a janela de correr leva VIN05; as maxim-ar (as 15, de qualquer módulo) levam VBO3,4', () => {
        expect(padraoDoVidro(SEMENTES, DP02)).toMatchObject({ codigo: 'VIN05', origem: 'grupo' })
        expect(padraoDoVidro(SEMENTES, DP17)).toMatchObject({ codigo: 'VIN05', origem: 'grupo' })
        expect(padraoDoVidro(SEMENTES, DP01)).toMatchObject({ codigo: 'VBO3,4', origem: 'grupo' })
        expect(padraoDoVidro(SEMENTES, DP128)).toMatchObject({ codigo: 'VBO3,4', origem: 'grupo' })
    })
    it('os 7 grupos sem semente: sem padrão (a porta de correr não herda a janela; o fixo não herda a maxim-ar)', () => {
        expect(padraoDoVidro(SEMENTES, DP39)).toBeNull()
        expect(padraoDoVidro(SEMENTES, DP143)).toBeNull()
    })
    it('o PAR exato: (NULL, correr) — a linha fantasma — não casa a janela de correr nem a porta de correr', () => {
        const fantasma = [L({ abertura: null, tipo: 'correr', item_codigo: 'VIN04' })]
        expect(padraoDoVidro(fantasma, DP02)).toBeNull()
        expect(padraoDoVidro(fantasma, DP39)).toBeNull()
        // e a maxim-ar (sem abertura) não casa uma linha com abertura
        expect(padraoDoVidro([L({ abertura: 'janela', tipo: 'maxim-ar', item_codigo: 'VBO3,4' })], DP01)).toBeNull()
    })
    it('a EXCEÇÃO vence o grupo, pelo código CRU: DP-17 e DP-017 são duas tipologias', () => {
        const linhas = [...SEMENTES, L({ tipologia: 'DP-17', item_codigo: 'VTIN06' })]
        expect(padraoDoVidro(linhas, DP17)).toMatchObject({ codigo: 'VTIN06', origem: 'excecao' })
        expect(padraoDoVidro(linhas, DP017)).toMatchObject({ codigo: 'VIN05', origem: 'grupo' })
    })
    it('duas matérias-primas da mesma família que discordam: sem padrão; que concordam: o padrão', () => {
        expect(padraoDoVidro([...SEMENTES, L({ materia_prima_id: 'mp2', abertura: 'janela', tipo: 'correr', item_codigo: 'VIN04' })], DP02)).toBeNull()
        expect(padraoDoVidro([...SEMENTES, L({ materia_prima_id: 'mp2', abertura: 'janela', tipo: 'correr', item_codigo: 'VIN05' })], DP02)).toMatchObject({ codigo: 'VIN05' })
        expect(padraoDoVidro([L({ tipologia: 'DP-02', item_codigo: 'A' }), L({ materia_prima_id: 'mp2', tipologia: 'DP-02', item_codigo: 'B' })], DP02)).toBeNull()
    })
    it('a origem no CONSIDERADO: o grupo em linguagem de obra, ou a tipologia da exceção', () => {
        expect(origemNaFrase(padraoDoVidro(SEMENTES, DP02)!, 'DP-02')).toBe('padrão da empresa para janela de correr')
        expect(origemNaFrase(padraoDoVidro(SEMENTES, DP01)!, 'DP-01')).toBe('padrão da empresa para maxim-ar')
        expect(origemNaFrase(padraoDoVidro([L({ tipologia: 'DP-02', item_codigo: 'A' })], DP02)!, 'DP-02')).toBe('padrão da empresa para a tipologia DP-02')
    })
})

describe('A ESQUADRIA: o texto da tabela do principal, o código gravado e o CONSIDERADO', () => {
    const item = (tipologia: string | null, vidro: string | null = null, familia: string | null = 'PVC') => ({ tipologia, familia, vidro })
    it('o texto é a descrição do principal; sem ela (o código fora da tabela), o próprio código — o custo o acusa como falta nomeada', () => {
        expect(vidroPadraoDaEsquadria(CONTA, item('DP-02'), [DP02])).toMatchObject({ texto: 'VIDRO COMUM INCOLOR 05MM', codigo: 'VIN05', noPrincipal: true })
        const semDescricao: VidrosPadraoDaConta = { ...CONTA, descricaoDo: new Map() }
        expect(vidroPadraoDaEsquadria(semDescricao, item('DP-02'), [DP02])).toMatchObject({ texto: 'VIN05', codigo: 'VIN05', noPrincipal: false })
    })
    it('a família da esquadria filtra as candidatas; o código em duas famílias com padrões diferentes não é padrão', () => {
        const ALU = { ...DP02, familia: 'ALUMINIO' }
        const conta: VidrosPadraoDaConta = { ...CONTA, porFamilia: new Map([['PVC', SEMENTES], ['ALUMINIO', [L({ abertura: 'janela', tipo: 'correr', item_codigo: 'VBO3,4' })]]]) }
        expect(vidroPadraoDaEsquadria(conta, item('DP-02', null, null), [DP02, ALU])).toBeNull()
        expect(vidroPadraoDaEsquadria(conta, item('DP-02', null, 'PVC'), [DP02, ALU])).toMatchObject({ codigo: 'VIN05' })
        expect(vidroPadraoDaEsquadria(conta, item('DP-02', null, 'ALUMINIO'), [DP02, ALU])).toMatchObject({ codigo: 'VBO3,4' })
        expect(vidroPadraoDaEsquadria(CONTA, item(null), [DP02])).toBeNull()
        expect(vidroPadraoDaEsquadria(CONTA, item('DP-99'), [DP02])).toBeNull()
    })
    it('o vidro_codigo só com o vidro do padrão: o dito, ou o alterado, grava nulo', () => {
        expect(vidroCodigoDaEsquadria(CONTA, item('DP-02', 'VIDRO COMUM INCOLOR 05MM'), [DP02])).toBe('VIN05')
        expect(vidroCodigoDaEsquadria(CONTA, item('DP-02', 'temperado 8mm'), [DP02])).toBeNull()
        expect(vidroCodigoDaEsquadria(CONTA, item('DP-39', 'VIDRO COMUM INCOLOR 05MM'), [DP39])).toBeNull()
    })
    it('o CONSIDERADO diz o código e a origem, só quando o vidro é o do padrão', () => {
        expect(vidroNoConsiderado(CONTA, item('DP-02', 'VIDRO COMUM INCOLOR 05MM'), [DP02])).toBe('vidro VIN05, padrão da empresa para janela de correr')
        expect(vidroNoConsiderado(CONTA, item('DP-01', 'VIDRO MINI BOREAL 3,4MM'), [DP01])).toBe('vidro VBO3,4, padrão da empresa para maxim-ar')
        expect(vidroNoConsiderado(CONTA, item('DP-02', 'vidro 4mm'), [DP02])).toBeNull()
    })
    it('a leitura que não deu: nenhum padrão', () => {
        const falhou: VidrosPadraoDaConta = { ok: false, motivo: 'sem_migracao', detalhe: 'x' }
        expect(vidroPadraoDaEsquadria(falhou, item('DP-02'), [DP02])).toBeNull()
    })
})

describe('QUEM LÊ: o service_role, em servidor (a RLS só deixa passar is_super_admin — com o JWT de um usuário a leitura voltaria VAZIA)', () => {
    beforeEach(() => { chamadas.length = 0; for (const k of Object.keys(respostas)) delete respostas[k] })
    it('o módulo lê pelo supabaseAdmin, e por nenhum outro cliente', () => {
        const fonte = readFileSync(join(process.cwd(), 'src/lib/atendimentos-ia/vidro-padrao.ts'), 'utf-8')
        expect(fonte).toMatch(/import \{ supabaseAdmin \} from '@\/supabase\/admin'/)
        expect(fonte).not.toMatch(/createClient|@\/supabase\/client|createBrowserClient|createServerClient/)
    })
    it('a leitura vai à tabela pelo cliente admin, filtrada pela CONTA, e casa a família pela matéria-prima', async () => {
        respostas.orcamentista_vidro_padrao = { data: [{ materia_prima_id: 'mp', abertura: 'janela', tipo: 'correr', tipologia: null, item_codigo: 'VIN05' }, { materia_prima_id: 'mp-sem-familia', abertura: null, tipo: 'maxim-ar', tipologia: null, item_codigo: 'VBO3,4' }], error: null }
        respostas.orcamentista_materia_prima = { data: [{ id: 'mp', familia: 'PVC' }, { id: 'mp-sem-familia', familia: null }], error: null }
        const r = await lerVidrosPadraoDaConta('t1')
        const daTabela = chamadas.find((x) => x.tabela === 'orcamentista_vidro_padrao')!
        expect(daTabela.filtros).toContainEqual(['eq', 'tenant_id', 't1'])
        expect(chamadas.find((x) => x.tabela === 'orcamentista_materia_prima')!.filtros).toContainEqual(['eq', 'tenant_id', 't1'])
        expect(r.ok).toBe(true)
        if (!('porFamilia' in r)) throw new Error('leitura falhou')
        expect([...r.porFamilia.keys()]).toEqual(['PVC'])
        expect(r.porFamilia.get('PVC')!.map((l) => l.item_codigo)).toEqual(['VIN05'])
    })
    it('a tabela ausente (PGRST205 ou 42P01) é sem_migracao; outro erro é falhou — nunca um padrão inventado', async () => {
        respostas.orcamentista_vidro_padrao = { data: null, error: { code: 'PGRST205', message: 'x' } }
        expect(await lerVidrosPadraoDaConta('t1')).toMatchObject({ ok: false, motivo: 'sem_migracao' })
        respostas.orcamentista_vidro_padrao = { data: null, error: { code: '42P01', message: 'x' } }
        expect(await lerVidrosPadraoDaConta('t1')).toMatchObject({ ok: false, motivo: 'sem_migracao' })
        respostas.orcamentista_vidro_padrao = { data: null, error: { code: '42501', message: 'x' } }
        expect(await lerVidrosPadraoDaConta('t1')).toMatchObject({ ok: false, motivo: 'falhou' })
    })
    it('a descrição vem SÓ da tabela VIDRO do fornecedor PRINCIPAL que vale — nunca de uma busca global pelo código', async () => {
        respostas.orcamentista_vidro_padrao = { data: [{ materia_prima_id: 'mp', abertura: 'janela', tipo: 'correr', tipologia: null, item_codigo: 'VIN05' }], error: null }
        respostas.orcamentista_materia_prima = { data: [{ id: 'mp', familia: 'PVC' }], error: null }
        respostas.orcamentista_mp_categoria = { data: [{ id: 'c-vidro', categoria_chave: 'VIDRO' }], error: null }
        respostas.orcamentista_mp_categoria_fornecedor = { data: [{ mp_categoria_id: 'c-vidro', fornecedor_id: 'f-estrela', principal: true }], error: null }
        respostas.orcamentista_fornecedor = { data: [{ id: 'f-estrela', nome: 'Estrela' }], error: null }
        respostas.orcamentista_tabela = { data: [{ id: 'tab-vidro', fornecedor_id: 'f-estrela', arquivo_nome: 'v.xlsx', familia: 'PVC', categoria_chave: 'VIDRO', vigente: false }], error: null }
        respostas.orcamentista_familia_catalogo = { data: [{ chave: 'PVC', rotulo: 'PVC' }], error: null }
        respostas.orcamentista_tabela_item = { data: [{ codigo: 'VIN05', descricao: 'VIDRO COMUM INCOLOR 05MM' }], error: null }
        const r = await lerVidrosPadraoDaConta('t1')
        if (!('descricaoDo' in r)) throw new Error('leitura falhou')
        expect(r.descricaoDo.get('VIN05')).toBe('VIDRO COMUM INCOLOR 05MM')
        const itens = chamadas.filter((x) => x.tabela === 'orcamentista_tabela_item')
        expect(itens).toHaveLength(1)
        expect(itens[0].filtros).toContainEqual(['in', 'tabela_id', ['tab-vidro']])
        // sem principal de VIDRO, nenhuma descrição — e o item da tabela nem é lido
        chamadas.length = 0
        respostas.orcamentista_mp_categoria_fornecedor = { data: [], error: null }
        const sem = await lerVidrosPadraoDaConta('t1')
        if (!('descricaoDo' in sem)) throw new Error('leitura falhou')
        expect(sem.descricaoDo.size).toBe(0)
        expect(chamadas.some((x) => x.tabela === 'orcamentista_tabela_item')).toBe(false)
    })
    it('a tabela VIDRO de OUTRO fornecedor, e a de outra categoria do principal, não entram; o código com duas descrições no principal não escolhe nenhuma', async () => {
        respostas.orcamentista_vidro_padrao = { data: [{ materia_prima_id: 'mp', abertura: 'janela', tipo: 'correr', tipologia: null, item_codigo: 'VIN05' }], error: null }
        respostas.orcamentista_materia_prima = { data: [{ id: 'mp', familia: 'PVC' }], error: null }
        respostas.orcamentista_mp_categoria = { data: [{ id: 'c-vidro', categoria_chave: 'VIDRO' }, { id: 'c-perfil', categoria_chave: 'PERFIL' }], error: null }
        respostas.orcamentista_mp_categoria_fornecedor = { data: [
            { mp_categoria_id: 'c-vidro', fornecedor_id: 'f-estrela', principal: true },
            { mp_categoria_id: 'c-perfil', fornecedor_id: 'f-outro', principal: true },
        ], error: null }
        respostas.orcamentista_fornecedor = { data: [{ id: 'f-estrela', nome: 'Estrela' }, { id: 'f-outro', nome: 'Outro' }], error: null }
        respostas.orcamentista_tabela = { data: [
            { id: 'tab-vidro', fornecedor_id: 'f-estrela', arquivo_nome: 'v.xlsx', familia: 'PVC', categoria_chave: 'VIDRO', vigente: false },
            { id: 'tab-vidro-do-outro', fornecedor_id: 'f-outro', arquivo_nome: 'o.xlsx', familia: 'PVC', categoria_chave: 'VIDRO', vigente: false },
            { id: 'tab-perfil-da-estrela', fornecedor_id: 'f-estrela', arquivo_nome: 'p.xlsx', familia: 'PVC', categoria_chave: 'PERFIL', vigente: false },
        ], error: null }
        respostas.orcamentista_familia_catalogo = { data: [{ chave: 'PVC', rotulo: 'PVC' }], error: null }
        respostas.orcamentista_tabela_item = { data: [{ codigo: 'VIN05', descricao: 'VIDRO COMUM INCOLOR 05MM' }, { codigo: 'VIN05', descricao: 'VIDRO INCOLOR 5' }], error: null }
        const r = await lerVidrosPadraoDaConta('t1')
        if (!('descricaoDo' in r)) throw new Error('leitura falhou')
        expect(chamadas.find((x) => x.tabela === 'orcamentista_tabela_item')!.filtros).toContainEqual(['in', 'tabela_id', ['tab-vidro']])
        expect(r.descricaoDo.has('VIN05')).toBe(false)
    })
})
