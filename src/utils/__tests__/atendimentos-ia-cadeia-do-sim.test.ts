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
jest.mock('@/lib/atendimentos-ia/orcamento-precificado', () => ({ regerarOArquivo: jest.fn() }))

/* eslint-disable @typescript-eslint/no-require-imports */
const C = require('@/lib/atendimentos-ia/cadeia-do-sim') as typeof import('@/lib/atendimentos-ia/cadeia-do-sim')
const { VERSAO_DO_ARQUIVO } = require('@/lib/atendimentos-ia/arquivo-do-orcamento') as typeof import('@/lib/atendimentos-ia/arquivo-do-orcamento')
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
        // por padrão, o arquivo guardado É o do desenho de hoje: o reenvio manda ele mesmo, sem regerar
        lerArquivo: jest.fn(async (): Promise<{ pdf: Uint8Array; versao?: string | null } | null> => ({ pdf: PDF, versao: VERSAO_DO_ARQUIVO })),
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
        expect(r.paraOVendedor).toBe(C.fraseDoArquivoQueNaoSaiu(7, 'Geraldo Huck', ['o rateio não fecha']))
        expect(r.rastro).toContain('precificacao=ok venda=8765.43 interna=8765.43')
        expect(r.rastro).toContain('arquivo=recusou parou=arquivo')
    })
    it('com preço e arquivo: envia ao DONO do levantamento o arquivo gerado, com o nome do arquivo, e o texto diz que foi enviado', async () => {
        const d = deps(gravado(true))
        const r = await C.etapaDoPreco(T, ORC, d)
        expect(d.telefoneDoDono).toHaveBeenCalledWith(T, ORC)
        expect(d.enviar).toHaveBeenCalledWith('5551999990000', 'Orcamento 7 - Geraldo Huck.pdf', PDF)
        expect(r.paraOVendedor).toBe(C.fraseDoOrcamentoEnviado(7, 'Geraldo Huck'))
        expect(r.rastro).toMatch(/arquivo=ok ms_leitura=\d+ envio=ok ms_envio=\d+$/)
        // 4.3 (12/11/2026): o número que recebeu o arquivo — a conversa cala quando foi quem disse "sim"
        expect(r.enviadoPara).toBe('5551999990000')
    })
    it('o NÚMERO EXIBIDO (23/11/2026): o texto ao vendedor diz o número exibido; a leitura que falha cai no número próprio', async () => {
        const d = deps(gravado(true), { numeroExibido: jest.fn(async () => '27-PVC') })
        expect((await C.etapaDoPreco(T, ORC, d)).paraOVendedor).toBe(C.fraseDoOrcamentoEnviado('27-PVC', 'Geraldo Huck'))
        expect(d.numeroExibido).toHaveBeenCalledWith(T, ORC)
        const f = deps({ faltas: ['x'], orcamento: { numero: 7, nome: 'Geraldo Huck' } }, { numeroExibido: jest.fn(async () => '27-PVC') })
        expect((await C.etapaDoPreco(T, ORC, f)).paraOVendedor).toBe(C.fraseDoPrecoQueNaoSaiu('27-PVC', 'Geraldo Huck', ['x']))
        const caiu = deps(gravado(true), { numeroExibido: jest.fn(async () => { throw new Error('o banco caiu') }) })
        expect((await C.etapaDoPreco(T, ORC, caiu)).paraOVendedor).toBe(C.fraseDoOrcamentoEnviado(7, 'Geraldo Huck'))
        // o reenvio: o texto e o NOME DO ARQUIVO com o número exibido
        const re = deps(gravado(true), { numeroExibido: jest.fn(async () => '27-PVC') })
        const r = await C.reenviarOArquivo(T, { id: ORC, numero: 7, nome: 'Geraldo Huck' }, re)
        expect(re.enviar).toHaveBeenCalledWith('5551999990000', 'Orcamento 27-PVC - Geraldo Huck.pdf', PDF)
        expect(r.paraOVendedor).toBe(C.fraseDoOrcamentoEnviado('27-PVC', 'Geraldo Huck'))
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
    it('PERGUNTA É TEXTO; RESULTADO É ARQUIVO (13/11/2026): o texto ao vendedor diz que o arquivo não chegou e por quê — nunca o preço', async () => {
        // o preço gravado é 8765,43: ele está no arquivo, e o texto de NENHUM caminho o traz
        const venda = (8765.43).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        const textos = [
            (await C.etapaDoPreco(T, ORC, deps(gravado(false, ['o rateio não fecha'])))).paraOVendedor,
            (await C.etapaDoPreco(T, ORC, deps(gravado(true)))).paraOVendedor,
            (await C.etapaDoPreco(T, ORC, deps(gravado(true), { enviar: jest.fn(async (): Promise<{ ok: boolean; status: number | null; prazoEsgotado: boolean }> => ({ ok: false, status: 500, prazoEsgotado: false })) }))).paraOVendedor,
            (await C.etapaDoPreco(T, ORC, deps(gravado(true), { telefoneDoDono: jest.fn(async (): Promise<{ id: string; telefone: string } | null> => null) }))).paraOVendedor,
        ]
        for (const t of textos) {
            expect(t).toMatch(/^O arquivo do orçamento 7 \(Geraldo Huck\) não chegou a você: /)
            expect(t).not.toContain(venda)
            expect(t).not.toMatch(/R\$/)
            // e diz O QUE O VENDEDOR FAZ AGORA (13/11/2026): onde o arquivo está, ou o botão que retoma — nunca "não chegou" sozinho
            expect(t).toContain('seção Orçamentos I.A.')
        }
        expect(textos[0]).toContain('use Precificar para gerar o arquivo de novo')
        // o preço que não se formou: o que falta, e o botão que retoma depois de cadastrado
        const semPreco = (await C.etapaDoPreco(T, ORC, deps({ faltas: ['o preço formado'], orcamento: { numero: 7, nome: 'Geraldo Huck' } }))).paraOVendedor
        expect(semPreco).toContain('Falta: o preço formado. Com isso cadastrado, abra o orçamento 7 na seção Orçamentos I.A. e use Precificar')
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

describe('o "sim" SEM MUDANÇA: o arquivo que JÁ existe vai de novo (dono do produto, 13/11/2026)', () => {
    const ORCAMENTO = { id: ORC, numero: 7, nome: 'Geraldo Huck' }
    it('manda o ÚLTIMO arquivo ao dono, com o nome do arquivo — nada precificado, nada gerado', async () => {
        const d = deps(gravado(true))
        const r = await C.reenviarOArquivo(T, ORCAMENTO, d)
        expect(d.precificar).not.toHaveBeenCalled()
        expect(d.lerArquivo).toHaveBeenCalledWith(T, ORC)
        expect(d.enviar).toHaveBeenCalledWith('5551999990000', 'Orcamento 7 - Geraldo Huck.pdf', PDF)
        expect(r).toEqual({ rastro: expect.stringMatching(/^reenvio=ok reenvio_versao=igual ms_envio=\d+$/), paraOVendedor: C.fraseDoOrcamentoEnviado(7, 'Geraldo Huck'), enviadoPara: '5551999990000', idDoEnvio: null })
    })
    it('sem arquivo: nada é enviado, e quem chama roda a atualização inteira', async () => {
        const d = deps(gravado(true), { lerArquivo: jest.fn(async (): Promise<{ pdf: Uint8Array; versao?: string | null } | null> => null) })
        expect(await C.reenviarOArquivo(T, ORCAMENTO, d)).toEqual({ rastro: 'reenvio=sem_arquivo', paraOVendedor: null, semArquivo: true })
        expect(d.enviar).not.toHaveBeenCalled()
    })
    it('o dono sem telefone e o envio que falha: a falta nomeada, sem `enviadoPara`', async () => {
        const semTelefone = await C.reenviarOArquivo(T, ORCAMENTO, deps(gravado(true), { telefoneDoDono: jest.fn(async (): Promise<{ id: string; telefone: string } | null> => null) }))
        expect(semTelefone).toEqual({ rastro: 'reenvio=sem_telefone parou=envio', paraOVendedor: C.fraseDoDonoSemTelefone(7, 'Geraldo Huck') })
        const falhou = await C.reenviarOArquivo(T, ORCAMENTO, deps(gravado(true), { enviar: jest.fn(async (): Promise<{ ok: boolean; status: number | null; prazoEsgotado: boolean }> => ({ ok: false, status: 500, prazoEsgotado: false })) }))
        expect(falhou.paraOVendedor).toBe(C.fraseDoEnvioQueFalhou(7, 'Geraldo Huck'))
        expect('enviadoPara' in falhou).toBe(false)
    })
})

// ══ O ARQUIVO GUARDADO DE OUTRO DESENHO (dono do produto, 16/11/2026) ══
// O caso real: o PDF do orçamento 6 era das 14:05 UTC, os desenhos foram ao ar às 16:33 e as observações às 17:52, e
// às 18:01 o reenvio mandou o de 14:05 — sem figuras e sem observações. A versão é o que faz o reenvio perceber.
describe('o reenvio REGERA quando o arquivo guardado é de outra versão de desenho', () => {
    const ORCAMENTO = { id: ORC, numero: 7, nome: 'Geraldo Huck' }
    const NOVO = new Uint8Array([37, 80, 68, 70, 45, 110, 111, 118, 111])
    /** O arquivo guardado é de antes (versão nula, como as 7 linhas de produção), e o regerado é o de hoje. */
    const deAntes = () => {
        let regerado = false
        return {
            lerArquivo: jest.fn(async (): Promise<{ pdf: Uint8Array; versao?: string | null } | null> =>
                (regerado ? { pdf: NOVO, versao: VERSAO_DO_ARQUIVO } : { pdf: PDF, versao: null })),
            regerarArquivo: jest.fn(async (): Promise<{ ok: true } | { recusas: string[] }> => { regerado = true; return { ok: true } }),
        }
    }

    it('rege, RELÊ e manda o arquivo NOVO — nunca o guardado', async () => {
        const d = deps(gravado(true), deAntes())
        const r = await C.reenviarOArquivo(T, ORCAMENTO, d)
        expect(d.regerarArquivo).toHaveBeenCalledWith(T, ORC)
        expect(d.lerArquivo).toHaveBeenCalledTimes(2)
        expect(d.enviar).toHaveBeenCalledWith('5551999990000', 'Orcamento 7 - Geraldo Huck.pdf', NOVO)
        expect(r.rastro).toContain('reenvio_versao=outra regerou=ok')
        // e nada é precificado: a regeneração usa os números já gravados
        expect(d.precificar).not.toHaveBeenCalled()
    })
    it('a versão IGUAL não rege nem relê: o arquivo guardado vai como está', async () => {
        const d = deps(gravado(true), { regerarArquivo: jest.fn(async (): Promise<{ ok: true }> => ({ ok: true })) })
        const r = await C.reenviarOArquivo(T, ORCAMENTO, d)
        expect(d.regerarArquivo).not.toHaveBeenCalled()
        expect(d.lerArquivo).toHaveBeenCalledTimes(1)
        expect(d.enviar).toHaveBeenCalledWith('5551999990000', 'Orcamento 7 - Geraldo Huck.pdf', PDF)
        expect(r.rastro).toContain('reenvio_versao=igual')
    })
    it('a regeneração que RECUSA não deixa o vendedor sem nada: vai o que existe, e o rastro diz o motivo', async () => {
        const d = deps(gravado(true), {
            lerArquivo: jest.fn(async (): Promise<{ pdf: Uint8Array; versao?: string | null } | null> => ({ pdf: PDF, versao: 'de-ontem' })),
            regerarArquivo: jest.fn(async (): Promise<{ recusas: string[] }> => ({ recusas: ['o rateio não fecha com a interna'] })),
        })
        const r = await C.reenviarOArquivo(T, ORCAMENTO, d)
        expect(d.enviar).toHaveBeenCalledWith('5551999990000', 'Orcamento 7 - Geraldo Huck.pdf', PDF)
        expect(r.rastro).toContain('regerou=recusou')
        expect(r.rastro).toContain('o rateio não fecha com a interna')
        expect(r.enviadoPara).toBe('5551999990000')
    })
    it('SEM regerador (a dependência ausente), o arquivo que existe vai, e o rastro o diz — nunca em silêncio', async () => {
        const d = deps(gravado(true), { lerArquivo: jest.fn(async (): Promise<{ pdf: Uint8Array; versao?: string | null } | null> => ({ pdf: PDF, versao: null })) })
        delete (d as { regerarArquivo?: unknown }).regerarArquivo
        const r = await C.reenviarOArquivo(T, ORCAMENTO, d)
        expect(d.enviar).toHaveBeenCalledWith('5551999990000', 'Orcamento 7 - Geraldo Huck.pdf', PDF)
        expect(r.rastro).toContain('reenvio_versao=outra sem_regerador')
    })
})
