/**
 * @jest-environment node
 *
 * PORTÃO — o ARQUIVO DO MOTOR é exigido SÓ na tabela de PERFIL (dono do produto, 27/10/2026; migração 20261027000007).
 *
 * POR QUÊ: "Hoje toda tabela nova exige arquivo de motor, e isso impede o dono do produto de subir a tabela de Reforço e a de
 * Acessórios da Wolff — que são preço puro. Exija o arquivo do motor apenas quando categoria_chave = 'PERFIL'. O motor tem casa
 * própria agora (orcamentista_motor)."
 *
 * O que este portão fica vermelho:
 *   (1) a PARIDADE com a migração: a categoria que exige motor no código é a do literal da CHECK; os nomes das duas CHECK que a rota
 *       reconhece são os que a migração cria; a migração não deixa a coluna NOT NULL;
 *   (2) os leitores: PERFIL sem motor é recusa com a frase; Reforço e Acessórios sem motor passam; caminho sem nome (ou nome sem
 *       caminho) é recusa nomeada em QUALQUER categoria; na edição, o motor não se apaga;
 *   (3) o PATCH: declarar PERFIL numa tabela sem motor é 400 (e com o motor chegando junto, passa); as duas CHECK do banco viram frase;
 *   (4) o índice da vigente recusado nomeia a vigente da MESMA categoria (o repositório real: `atendimentos-ia-motor-so-para-perfil-repositorio.test.ts`).
 *
 * O que NÃO alcança: o banco é falso. As duas CHECK estão provadas num Postgres real (`scripts/harness/etapa-aponta-o-motor/` e a
 * verificação `$verifica$` da própria migração), não aqui.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'

import {
    CATEGORIA_QUE_EXIGE_MOTOR, MENSAGEM_MOTOR_INCOMPLETO, MENSAGEM_MOTOR_NAO_SAI, MENSAGEM_MOTOR_OBRIGATORIO,
    ehTravaDoMotorPelaMetade, ehTravaDoPerfilSemMotor, fraseDaVigenteQueJaExiste, lerCorpoDaTabela, lerEdicaoDaTabela, recusada,
} from '@/utils/atendimentos-ia-catalogo'

interface Perfil { id: string; tenant_id: string | null; role: string; is_super_admin: boolean }
const SUPER: Perfil = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
let perfil: Perfil | null = SUPER

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: { getUser: async (): Promise<any> => (perfil ? { data: { user: { id: perfil.id } }, error: null } : { data: { user: null }, error: { message: 'sem sessão' } }) },
        from: () => { const q: any = { select: () => q, eq: () => q, single: async (): Promise<any> => ({ data: perfil, error: null }) }; return q },
    },
}))

const F = '11111111-1111-1111-1111-111111111111'
const T = '22222222-2222-2222-2222-222222222222'
const CATEGORIAS = [{ chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }, { chave: 'REFORCO', rotulo: 'Reforço', ordem: 3 }, { chave: 'VIDRO', rotulo: 'Vidro', ordem: 6 }]
const SEM_MOTOR = { id: T, fornecedor_id: F, arquivo_path: `${F}/arquivo/x-t.xlsx`, motor_path: null as string | null, motor_nome: null as string | null, categoria_chave: null as string | null }

jest.mock('@/lib/atendimentos-ia/repositorio', () => {
    const real = jest.requireActual('@/lib/atendimentos-ia/repositorio')
    return {
        ErroDoBanco: real.ErroDoBanco,
        codigoDoErro: real.codigoDoErro,
        falhaInterna: real.falhaInterna,
        listarFamilias: jest.fn(async () => [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }]),
        listarCategorias: jest.fn(async () => CATEGORIAS.map((c) => ({ ...c }))),
        obterTabela: jest.fn(async () => ({ ...SEM_MOTOR })),
        atualizarTabela: jest.fn(async () => 1),
        categoriasDoFornecedorDosItensGravados: jest.fn(async (): Promise<Array<string | null>> => []),
        objetoExiste: jest.fn(async () => true),
        tabelaVigenteDoPar: jest.fn(async (): Promise<Record<string, string> | null> => null),
        removerObjetos: jest.fn(async (): Promise<{ erro: string | null }> => ({ erro: null })),
        caminhosDaPlanilha: jest.fn(async () => new Set<string>()),
    }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require('@/lib/atendimentos-ia/repositorio') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ErroDoBanco } = jest.requireActual('@/lib/atendimentos-ia/repositorio') as { ErroDoBanco: new (e: { message?: string; code?: string }) => Error }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rotaDaTabela = () => require('@/pages/api/super-admin/atendimentos-ia/tabelas/[id]').default as (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>

async function patch(body: unknown) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res }, setHeader() { return res } }
    await rotaDaTabela()({ cookies: { token: 't' }, method: 'PATCH', query: { id: T }, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(() => {
    perfil = SUPER
    Object.values(repo).forEach((f) => { if (typeof f?.mockClear === 'function') f.mockClear() })
    repo.obterTabela.mockImplementation(async () => ({ ...SEM_MOTOR }))
    repo.atualizarTabela.mockImplementation(async () => 1)
    repo.categoriasDoFornecedorDosItensGravados.mockImplementation(async () => [])
    repo.objetoExiste.mockImplementation(async () => true)
})

const MIGRACAO = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261027000007_motor_so_para_perfil.sql'), 'utf8')
const DA_ETAPA = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261027000008_etapa_aponta_o_motor.sql'), 'utf8')

const CORPO = { fornecedor_id: F, arquivo_path: `${F}/arquivo/a-t.xlsx`, arquivo_nome: 't.xlsx', motor_path: `${F}/motor/a-m.xlsx`, motor_nome: 'm.xlsx', vigencia: null as string | null, familia: 'PVC', categoria_chave: 'PERFIL' }
const semMotor = (extra: object = {}) => ({ ...CORPO, motor_path: undefined as string | undefined, motor_nome: undefined as string | undefined, ...extra })

describe('(1) a paridade com a migração 20261027000007', () => {
    it('a categoria que exige motor no código é a do literal da CHECK', () => {
        expect(CATEGORIA_QUE_EXIGE_MOTOR).toBe('PERFIL')
        // "ter motor" é ter um caminho com algum caractere que não seja espaço: NULL, '' e '   ' NÃO são motor (achado do dono do produto, 27/10/2026)
        expect(MIGRACAO).toContain(`CHECK (categoria_chave IS DISTINCT FROM '${CATEGORIA_QUE_EXIGE_MOTOR}' OR coalesce(motor_path ~ '[^[:space:]]', false))`)
        expect(MIGRACAO).not.toContain('motor_path IS NOT NULL)')
    })

    it('as duas CHECK que a rota reconhece pelo nome são as que a migração cria', () => {
        for (const nome of ['orcamentista_tabela_perfil_exige_motor', 'orcamentista_tabela_motor_par']) {
            expect(MIGRACAO).toContain(`ADD CONSTRAINT ${nome} CHECK`)
        }
        expect(ehTravaDoPerfilSemMotor(new ErroDoBanco({ code: '23514', message: 'violates check constraint "orcamentista_tabela_perfil_exige_motor"' }))).toBe(true)
        expect(ehTravaDoMotorPelaMetade(new ErroDoBanco({ code: '23514', message: 'violates check constraint "orcamentista_tabela_motor_par"' }))).toBe(true)
        // e uma reconhece só a sua
        expect(ehTravaDoPerfilSemMotor(new ErroDoBanco({ code: '23514', message: 'violates check constraint "orcamentista_tabela_motor_par"' }))).toBe(false)
        expect(ehTravaDoMotorPelaMetade(new ErroDoBanco({ code: '23514', message: 'violates check constraint "orcamentista_tabela_perfil_exige_motor"' }))).toBe(false)
    })

    it('a migração solta o NOT NULL das duas colunas, e só delas', () => {
        expect(MIGRACAO).toContain('ALTER COLUMN motor_path DROP NOT NULL')
        expect(MIGRACAO).toContain('ALTER COLUMN motor_nome DROP NOT NULL')
        const executavel = MIGRACAO.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
        expect(executavel.match(/DROP NOT NULL/g)).toHaveLength(2)
    })

    it('a migração NÃO escreve dado: nenhum UPDATE, DELETE, DROP TABLE ou TRUNCATE executável', () => {
        const executavel = MIGRACAO.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
        expect(executavel).not.toMatch(/\b(UPDATE|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|INSERT\s+INTO)\b/i)
    })
})

describe('(1b) a paridade com a migração 20261027000008 — o que a etapa aceita é o que a função aceita', () => {
    it('a lista de campos permitidos da função é a do leitor do corpo', () => {
        const m = DA_ETAPA.match(/v_permitidas text\[\] := ARRAY\[([^\]]+)\]/)
        expect(m).not.toBeNull()
        const daFuncao = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
        const mensagem = daFuncao.slice(0, -1).join(', ') + ' e ' + daFuncao[daFuncao.length - 1]
        expect(daFuncao).toEqual(['id', 'rotulo', 'acao', 'instrucao', 'abas', 'motor_id'])
        expect(DA_ETAPA).toContain(`(so ${mensagem})`)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { lerCorpoDasEtapas } = require('@/utils/atendimentos-ia-etapas') as typeof import('@/utils/atendimentos-ia-etapas')
        const valido: Record<string, unknown> = { id: null, rotulo: 'x', acao: 'APANHAR', instrucao: 'x', abas: [], motor_id: null }
        for (const campo of daFuncao) {
            // cada campo da função, sozinho, passa no leitor: nenhum é "desconhecido" para a rota
            const r = lerCorpoDasEtapas({ etapas: [{ rotulo: 'x', acao: 'APANHAR', [campo]: valido[campo] }] })
            expect(r.ok).toBe(true)
        }
        expect(lerCorpoDasEtapas({ etapas: [{ rotulo: 'x', acao: 'APANHAR', numero: 1 }] }).ok).toBe(false)
    })
})

describe('(2) os leitores', () => {
    it('PERFIL sem motor (ausente ou em branco) é recusa com a frase do Perfil', () => {
        for (const corpo of [semMotor(), { ...CORPO, motor_path: '  ', motor_nome: '  ' }, { ...CORPO, motor_path: null, motor_nome: null }]) {
            const l = lerCorpoDaTabela(corpo)
            expect(recusada(l) && l.erro).toBe(MENSAGEM_MOTOR_OBRIGATORIO)
        }
    })

    it.each(['REFORCO', 'ACESSORIOS_VEDACAO', 'VIDRO', 'FERRAGENS'])('%s sem motor passa, e o corpo leva motor nulo — nunca vazio', (categoria_chave) => {
        const l = lerCorpoDaTabela(semMotor({ categoria_chave }))
        expect(recusada(l)).toBe(false)
        if (!recusada(l)) expect([l.corpo.motor_path, l.corpo.motor_nome]).toEqual([null, null])
    })

    it('o motor que VEM, vem inteiro, em qualquer categoria (a Estrela, de Vidro, já tem o dela)', () => {
        const l = lerCorpoDaTabela({ ...CORPO, categoria_chave: 'VIDRO' })
        expect(recusada(l) ? l.erro : [l.corpo.motor_path, l.corpo.motor_nome]).toEqual([CORPO.motor_path, 'm.xlsx'])
    })

    it.each([['só o caminho', { motor_nome: undefined }], ['só o nome', { motor_path: undefined }]])('motor pela metade (%s) é recusa nomeada em QUALQUER categoria, antes da regra do Perfil', (_c, extra) => {
        for (const categoria_chave of ['PERFIL', 'REFORCO']) {
            const l = lerCorpoDaTabela({ ...CORPO, categoria_chave, ...extra })
            expect(recusada(l) && l.erro).toBe(MENSAGEM_MOTOR_INCOMPLETO)
        }
    })

    it('a categoria inválida é recusada ANTES do motor: a frase da categoria, não a do motor', () => {
        const l = lerCorpoDaTabela(semMotor({ categoria_chave: 'perfil' }))
        expect(recusada(l) && l.erro).not.toBe(MENSAGEM_MOTOR_OBRIGATORIO)
    })

    it('o motor fora da pasta do fornecedor continua recusado, e o nulo não derruba a conferência', () => {
        expect(recusada(lerCorpoDaTabela({ ...CORPO, motor_path: 'outro/motor/m.xlsx' }))).toBe(true)
        expect(recusada(lerCorpoDaTabela(semMotor({ categoria_chave: 'REFORCO' })))).toBe(false)
    })

    it('na edição o motor TROCA inteiro ou não mexe; apagar é recusado com a frase própria, e a metade com a da metade', () => {
        const troca = lerEdicaoDaTabela({ motor_path: `${F}/motor/n.xlsx`, motor_nome: 'n.xlsx' }, F)
        expect(recusada(troca) ? troca.erro : troca.corpo.motor).toEqual({ path: `${F}/motor/n.xlsx`, nome: 'n.xlsx' })
        const apaga = lerEdicaoDaTabela({ motor_path: '', motor_nome: '' }, F)
        expect(recusada(apaga) && apaga.erro).toBe(MENSAGEM_MOTOR_NAO_SAI)
        const metade = lerEdicaoDaTabela({ motor_path: `${F}/motor/n.xlsx` }, F)
        expect(recusada(metade) && metade.erro).toBe(MENSAGEM_MOTOR_INCOMPLETO)
        const arquivoMetade = lerEdicaoDaTabela({ arquivo_path: `${F}/arquivo/n.xlsx` }, F)
        expect(recusada(arquivoMetade) && arquivoMetade.erro).toBe('Suba o arquivo da tabela.')
    })
})

describe('(3) PATCH /tabelas/[id]', () => {
    it('declarar PERFIL numa tabela SEM motor é 400 com a frase do Perfil, e nada é gravado', async () => {
        const r = await patch({ categoria_chave: 'PERFIL' })
        expect(r.status).toBe(400)
        expect(r.json.error).toBe(MENSAGEM_MOTOR_OBRIGATORIO)
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
    })

    it('declarar PERFIL COM o motor chegando junto passa, e grava os dois', async () => {
        const r = await patch({ categoria_chave: 'PERFIL', motor_path: `${F}/motor/n.xlsx`, motor_nome: 'n.xlsx' })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, expect.objectContaining({ categoria_chave: 'PERFIL', motor_path: `${F}/motor/n.xlsx`, motor_nome: 'n.xlsx' }))
    })

    it('declarar PERFIL numa tabela que JÁ tem o motor passa (o motor de antes vale)', async () => {
        repo.obterTabela.mockImplementation(async () => ({ ...SEM_MOTOR, motor_path: `${F}/motor/x-m.xlsx`, motor_nome: 'm.xlsx' }))
        expect((await patch({ categoria_chave: 'PERFIL' })).status).toBe(200)
    })

    it('declarar REFORCO numa tabela sem motor passa: preço puro', async () => {
        const r = await patch({ categoria_chave: 'REFORCO' })
        expect(r.status).toBe(200)
        expect(repo.atualizarTabela).toHaveBeenCalledWith(T, { categoria_chave: 'REFORCO' })
    })

    it('apagar o motor é 400 com a frase própria, e nada é gravado', async () => {
        const r = await patch({ motor_path: '', motor_nome: '' })
        expect(r.status).toBe(400)
        expect(r.json.error).toBe(MENSAGEM_MOTOR_NAO_SAI)
        expect(repo.atualizarTabela).not.toHaveBeenCalled()
    })

    it('as duas CHECK do banco (corrida) viram frase, e não 500', async () => {
        repo.atualizarTabela.mockImplementationOnce(async () => { throw new ErroDoBanco({ code: '23514', message: 'violates check constraint "orcamentista_tabela_perfil_exige_motor"' }) })
        const a = await patch({ vigencia: 'x' })
        expect([a.status, a.json.error]).toEqual([400, MENSAGEM_MOTOR_OBRIGATORIO])
        repo.atualizarTabela.mockImplementationOnce(async () => { throw new ErroDoBanco({ code: '23514', message: 'violates check constraint "orcamentista_tabela_motor_par"' }) })
        const b = await patch({ vigencia: 'x' })
        expect([b.status, b.json.error]).toEqual([400, MENSAGEM_MOTOR_INCOMPLETO])
    })

    it('o índice da vigente recusado nomeia a vigente de hoje COM a categoria dela', async () => {
        repo.tabelaVigenteDoPar.mockImplementationOnce(async () => ({ familia: 'PVC', arquivo_nome: 'Reforço 2026.xlsx', categoria_chave: 'REFORCO' }))
        repo.atualizarTabela.mockImplementationOnce(async () => { throw new ErroDoBanco({ code: '23505', message: 'duplicate key value violates unique constraint "orcamentista_tabela_uma_vigente"' }) })
        const r = await patch({ vigente: true })
        expect(r.status).toBe(409)
        expect(r.json.error).toBe(fraseDaVigenteQueJaExiste('PVC', 'Reforço 2026.xlsx', 'REFORCO'))
        expect(r.json.error).toContain('REFORCO')
    })

    it('a frase da vigente sem categoria é a de sempre (a tabela de antes), sem a palavra "categoria"', () => {
        expect(fraseDaVigenteQueJaExiste('PVC', 'Wolff 2026.xlsx')).not.toMatch(/categoria/i)
    })
})
