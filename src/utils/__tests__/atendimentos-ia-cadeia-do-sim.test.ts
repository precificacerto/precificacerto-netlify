/**
 * @jest-environment node
 *
 * PORTÃO — A ETAPA DO PREÇO NA CADEIA DO "SIM" (dono do produto, 11/11/2026):
 *   (d) o preço que não se forma PARA antes do PDF: nada lido, nada enviado, o vendedor recebe as faltas nomeadas, o rastro diz
 *       `parou=precificacao`;
 *   o arquivo recusado depois do preço: nada enviado, o porquê ao vendedor, `parou=arquivo`;
 *   o envio vai ao DONO do levantamento, com o arquivo gerado; o envio que falha fica no rastro e nada é desfeito;
 *   `telefoneDoDonoDoOrcamento`: orçamento → levantamento → remetente, sempre com o tenant; elo ausente é nulo.
 */
type Linha = Record<string, unknown>
const banco = { db: {} as Record<string, Linha[]>, ops: [] as Array<{ tabela: string; filtros: Array<[string, unknown]> }> }
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.maybeSingle = () => {
                banco.ops.push({ tabela, filtros })
                const r = (banco.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v))
                return Promise.resolve({ data: r[0] ?? null, error: null })
            }
            return q
        },
    },
}))
jest.mock('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor', () => ({ lerUltimoArquivo: jest.fn() }))
jest.mock('@/lib/atendimentos-ia/preco-do-orcamento-servidor', () => ({ precificarComoAgente: jest.fn() }))

/* eslint-disable @typescript-eslint/no-require-imports */
const C = require('@/lib/atendimentos-ia/cadeia-do-sim') as typeof import('@/lib/atendimentos-ia/cadeia-do-sim')
/* eslint-enable @typescript-eslint/no-require-imports */
type Deps = import('@/lib/atendimentos-ia/cadeia-do-sim').DependenciasDaEtapa
type Precificacao = import('@/lib/atendimentos-ia/preco-do-orcamento-servidor').PrecificacaoDoAgente

const T = 'tenant-1'
const ORC = 'orc-1'
const PDF = new Uint8Array([37, 80, 68, 70])
const gravado = (arquivo: boolean, recusas: string[] = []): Precificacao => ({
    gravado: {
        orcamento: { numero: 7, nome: 'Geraldo Huck', valor_venda: 8765.43, valor_operacao_interna: 8765.43 } as never,
        arquivo: arquivo ? { id: 'a', caminho: 'c', sha256: 's', tamanho_bytes: 4, paginas: 1, nomeDoArquivo: 'Orcamento 7 - Geraldo Huck.pdf' } : null,
        recusasDoArquivo: recusas, fiscalSobrescrito: [],
    },
})
function deps(p: Precificacao, extra: Partial<Deps> = {}) {
    let t = 1000
    const d = {
        precificar: jest.fn(async () => p),
        lerArquivo: jest.fn(async () => ({ pdf: PDF })),
        telefoneDoDono: jest.fn(async (): Promise<{ id: string; telefone: string } | null> => ({ id: 'rem-dono', telefone: '5551999990000' })),
        registrarMedido: jest.fn(async () => 'gravado'),
        enviar: jest.fn(async () => ({ ok: true, status: 200, prazoEsgotado: false })),
        agora: () => (t += 10),
        ...extra,
    }
    return d
}

describe('a etapa do preço', () => {
    it('(d) o preço que NÃO se forma: para antes do PDF — nada lido, nada enviado —, o vendedor recebe as faltas nomeadas, e o rastro registra', async () => {
        const faltas = ['a carga horária da equipe produtiva', 'o preço formado']
        const d = deps({ faltas, orcamento: { numero: 7, nome: 'Geraldo Huck' } })
        const r = await C.etapaDoPreco(T, ORC, d)
        expect(d.lerArquivo).not.toHaveBeenCalled()
        expect(d.telefoneDoDono).not.toHaveBeenCalled()
        expect(d.enviar).not.toHaveBeenCalled()
        expect(r.paraOVendedor).toBe(C.fraseDoPrecoQueNaoSaiu(7, 'Geraldo Huck', faltas))
        for (const f of faltas) expect(r.paraOVendedor).toContain(f)
        expect(r.rastro).toMatch(/^precificacao=recusou faltas=2 ms_preco=\d+ parou=precificacao motivo="/)
    })
    it('o arquivo recusado depois do preço gravado: nada enviado, o porquê ao vendedor, parou=arquivo', async () => {
        const d = deps(gravado(false, ['o rateio não fecha']))
        const r = await C.etapaDoPreco(T, ORC, d)
        expect(d.enviar).not.toHaveBeenCalled()
        expect(r.paraOVendedor).toBe(C.fraseDoArquivoQueNaoSaiu(7, 'Geraldo Huck', 8765.43, ['o rateio não fecha']))
        expect(r.rastro).toContain('precificacao=ok venda=8765.43 interna=8765.43')
        expect(r.rastro).toContain('arquivo=recusou parou=arquivo')
    })
    it('com preço e arquivo: envia ao DONO do levantamento o arquivo gerado, com o nome do arquivo, e o texto diz que foi enviado', async () => {
        const d = deps(gravado(true))
        const r = await C.etapaDoPreco(T, ORC, d)
        expect(d.telefoneDoDono).toHaveBeenCalledWith(T, ORC)
        expect(d.enviar).toHaveBeenCalledWith('5551999990000', 'Orcamento 7 - Geraldo Huck.pdf', PDF)
        expect(r.paraOVendedor).toBe(C.fraseDoOrcamentoEnviado(7, 'Geraldo Huck', 8765.43))
        expect(r.rastro).toMatch(/arquivo=ok ms_leitura=\d+ envio=ok ms_envio=\d+$/)
        // 4.3 (12/11/2026): o número que recebeu o arquivo — a conversa cala quando foi quem disse "sim"
        expect(r.enviadoPara).toBe('5551999990000')
    })
    it('o enviadoPara é o número que o canal ACEITOU, quando há; e não existe quando o envio falha', async () => {
        const aceito = await C.etapaDoPreco(T, ORC, deps(gravado(true), { enviar: jest.fn(async () => ({ ok: true, status: 200, prazoEsgotado: false, destino: '55519999990000' })) }))
        expect(aceito.enviadoPara).toBe('55519999990000')
        const falhou = await C.etapaDoPreco(T, ORC, deps(gravado(true), { enviar: jest.fn(async (): Promise<{ ok: boolean; status: number | null; prazoEsgotado: boolean }> => ({ ok: false, status: 500, prazoEsgotado: false })) }))
        expect('enviadoPara' in falhou).toBe(false)
    })
    it('(c) O PALPITE VIRA MEDIÇÃO: o canal aceitou OUTRA variante do número do dono — ela é persistida no remetente, e o rastro diz', async () => {
        const d = deps(gravado(true), { enviar: jest.fn(async () => ({ ok: true, status: 200, prazoEsgotado: false, destino: '55519999990000' })) })
        const r = await C.etapaDoPreco(T, ORC, d)
        expect(d.registrarMedido).toHaveBeenCalledWith(T, 'rem-dono', '5551999990000', '55519999990000')
        expect(r.rastro).toMatch(/envio=ok ms_envio=\d+ telefone=gravado$/)
    })
    it('o canal aceitou o PRÓPRIO número gravado: nada a registrar', async () => {
        const d = deps(gravado(true), { enviar: jest.fn(async () => ({ ok: true, status: 200, prazoEsgotado: false, destino: '5551999990000' })) })
        const r = await C.etapaDoPreco(T, ORC, d)
        expect(d.registrarMedido).not.toHaveBeenCalled()
        expect(r.rastro).toMatch(/envio=ok ms_envio=\d+$/)
    })
    it('o envio que FALHA não registra nada (só o ACEITO é medição)', async () => {
        const d = deps(gravado(true), { enviar: jest.fn(async (): Promise<{ ok: boolean; status: number | null; prazoEsgotado: boolean; destino?: string }> => ({ ok: false, status: 500, prazoEsgotado: false })) })
        await C.etapaDoPreco(T, ORC, d)
        expect(d.registrarMedido).not.toHaveBeenCalled()
    })
    it('o envio que FALHA: o rastro registra a falha e o prazo, e nada é desfeito (nenhuma outra chamada depois do envio)', async () => {
        const d = deps(gravado(true), { enviar: jest.fn(async (): Promise<{ ok: boolean; status: number | null; prazoEsgotado: boolean }> => ({ ok: false, status: null, prazoEsgotado: true })) })
        const r = await C.etapaDoPreco(T, ORC, d)
        expect(r.rastro).toMatch(/envio=falhou status=nenhum prazo=esgotado ms_envio=\d+ parou=envio$/)
        expect(d.precificar).toHaveBeenCalledTimes(1)
        expect(r.paraOVendedor).toBe(C.fraseDoEnvioQueFalhou(7, 'Geraldo Huck'))
    })
    it('o dono sem telefone: nada enviado, e o vendedor sabe por quê', async () => {
        const d = deps(gravado(true), { telefoneDoDono: jest.fn(async (): Promise<{ id: string; telefone: string } | null> => null) })
        const r = await C.etapaDoPreco(T, ORC, d)
        expect(d.enviar).not.toHaveBeenCalled()
        expect(r.paraOVendedor).toBe(C.fraseDoDonoSemTelefone(7, 'Geraldo Huck'))
        expect(r.rastro).toContain('envio=sem_telefone parou=envio')
    })
})

describe('o telefone do dono do levantamento', () => {
    beforeEach(() => {
        banco.ops = []
        banco.db = {
            orcamentista_orcamento: [{ tenant_id: T, id: ORC, levantamento_id: 'lev-1' }],
            orcamentista_levantamento: [{ tenant_id: T, id: 'lev-1', remetente_id: 'rem-dono' }],
            orcamentista_remetente_autorizado: [
                { tenant_id: T, id: 'rem-dono', telefone: ' 5551999990000 ' },
                { tenant_id: T, id: 'rem-outro', telefone: '5551888880000' },
                { tenant_id: 'outra', id: 'rem-dono', telefone: '5500000000000' },
            ],
        }
    })
    it('orçamento → levantamento → remetente que o abriu, aparado, e cada leitura com o tenant', async () => {
        expect(await C.telefoneDoDonoDoOrcamento(T, ORC)).toEqual({ id: 'rem-dono', telefone: '5551999990000' })
        expect(banco.ops.map((o) => o.tabela)).toEqual(['orcamentista_orcamento', 'orcamentista_levantamento', 'orcamentista_remetente_autorizado'])
        for (const o of banco.ops) expect(o.filtros).toContainEqual(['tenant_id', T])
    })
    it('o orçamento manual (sem levantamento), o levantamento de outra empresa e o telefone vazio: nulo', async () => {
        banco.db.orcamentista_orcamento[0].levantamento_id = null
        expect(await C.telefoneDoDonoDoOrcamento(T, ORC)).toBeNull()
        banco.db.orcamentista_orcamento[0].levantamento_id = 'lev-1'
        banco.db.orcamentista_levantamento[0].tenant_id = 'outra'
        expect(await C.telefoneDoDonoDoOrcamento(T, ORC)).toBeNull()
        banco.db.orcamentista_levantamento[0].tenant_id = T
        banco.db.orcamentista_remetente_autorizado[0].telefone = '  '
        expect(await C.telefoneDoDonoDoOrcamento(T, ORC)).toBeNull()
    })
})

describe('os números do WhatsApp para o dono', () => {
    it('o dono é quem está na conversa: o número EXATO do webhook, só ele', () => {
        expect(C.destinosDoWhatsApp('51999114290', '555199114290')).toEqual(['555199114290'])
    })
    it('o dono é OUTRO telefone: o gravado com o DDI, com e sem o nono — nunca o da conversa', () => {
        expect(C.destinosDoWhatsApp('51999114290', '5554988776655')).toEqual(['5551999114290', '555199114290'])
    })
    it('envia pelo primeiro que aceitar; com todos recusando, o resultado é o do último', async () => {
        const tentados: string[] = []
        const r = await C.enviarAoPrimeiroQueAceitar(['a', 'b', 'c'], async (t) => { tentados.push(t); return { ok: t === 'b', status: t === 'b' ? 200 : 400, prazoEsgotado: false } })
        expect(tentados).toEqual(['a', 'b'])
        expect(r).toEqual({ ok: true, status: 200, prazoEsgotado: false, destino: 'b' })
        const falha = await C.enviarAoPrimeiroQueAceitar(['a', 'b'], async (t) => ({ ok: false, status: t === 'b' ? 500 : 400, prazoEsgotado: false }))
        expect(falha).toEqual({ ok: false, status: 500, prazoEsgotado: false })
    })
})

// módulo, não script: as constantes deste arquivo não vazam para os outros testes (TS2451)
export {}
