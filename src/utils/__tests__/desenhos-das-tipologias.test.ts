/**
 * @jest-environment node
 *
 * PORTÃO — OS DESENHOS DAS TIPOLOGIAS NO STORAGE (dono do produto, 11/11/2026): o zip é explodido no navegador; o `indice.csv` não sobe; o
 * caminho é `tipologias/<grupo>/<arquivo>`; o lote tem retomada; o que falhou é nomeado ao fim; rodar duas vezes não duplica nem apaga.
 */
jest.mock('@/page-parts/atendimentos-ia/api', () => ({ chamarRota: jest.fn() }))
import JSZip from 'jszip'
import {
    COLUNAS_DO_INDICE, TAMANHO_DO_LOTE, caminhoDoDesenho, codigoDpNormalizado, codigosComAMesmaDescricao, codigosQueANormalizacaoJuntaria, conferirDesenhos, emLotes, grupoNoCaminho, lerCsv, lerIndice,
    lerPedidoDoLote, linhasParaImportar, planoDoZip, resumoDoEnvio, tipoDaImagem, type LinhaDoIndice, type ResultadoDoEnvio,
} from '@/lib/atendimentos-ia/desenhos-das-tipologias'

/** Uma linha do índice, com o que o teste não diz vazio — como o CSV grava o vazio. */
const L = (zip: string, caminho: string, grupo: string, extra: Partial<LinhaDoIndice> = {}): LinhaDoIndice =>
    ({ ...Object.fromEntries(COLUNAS_DO_INDICE.map((c) => [c, ''])), fonte: 'principal', zip, caminho_no_zip: caminho, grupo, ...extra }) as LinhaDoIndice
const ok = (r: ResultadoDoEnvio | { erro: string }): ResultadoDoEnvio => { if ('erro' in r) throw new Error(r.erro); return r }
import { DEPENDENCIAS_REAIS, enviarDesenhosDoZip, type DependenciasDoEnvio, type LoteAssinado } from '@/page-parts/atendimentos-ia/envio-dos-desenhos'

describe('o caminho e o nome', () => {
    it('o grupo vira pasta sem acento e sem espaço; o arquivo fica com o nome do zip, sem mudar uma letra', () => {
        expect(grupoNoCaminho('Portas revestidas')).toBe('portas-revestidas')
        expect(grupoNoCaminho('  Alumínio ')).toBe('aluminio')
        expect(caminhoDoDesenho('aluminio', 'ESQ_0123.jpg')).toEqual({ caminho: 'tipologias/aluminio/ESQ_0123.jpg' })
        expect(caminhoDoDesenho('aluminio', '00001__DP-02 (1).PNG')).toEqual({ caminho: 'tipologias/aluminio/00001__DP-02 (1).PNG' })
    })
    it('recusa nomeada: grupo fora da forma, nome com acento, caminho com "..", e o que não é imagem', () => {
        expect(caminhoDoDesenho('Alumínio', 'a.jpg')).toHaveProperty('recusa')
        expect(caminhoDoDesenho('aluminio', 'desenho_janela_três.jpg')).toEqual({ recusa: expect.stringContaining('caractere') })
        expect(caminhoDoDesenho('aluminio', '..jpg')).toHaveProperty('recusa')
        expect(caminhoDoDesenho('aluminio', 'a/b.jpg')).toHaveProperty('recusa')
        // o ponto duplo antes da extensão existe no índice real (01642__ESQ_386..jpg) e sobe; o .jfif é JPEG
        expect(caminhoDoDesenho('aluminio', '01642__ESQ_386..jpg')).toEqual({ caminho: 'tipologias/aluminio/01642__ESQ_386..jpg' })
        expect(caminhoDoDesenho('blindex-vidro-temperado', '00001__PRPATMODULAR.jfif')).toEqual({ caminho: 'tipologias/blindex-vidro-temperado/00001__PRPATMODULAR.jfif' })
        expect(tipoDaImagem('X.jfif')).toBe('image/jpeg')
        expect(caminhoDoDesenho('aluminio', 'leia-me.txt')).toEqual({ recusa: expect.stringContaining('não é uma imagem') })
        expect(tipoDaImagem('X.JPEG')).toBe('image/jpeg')
        expect(tipoDaImagem('X.png')).toBe('image/png')
    })
})

describe('o índice canônico', () => {
    it('o CSV: vírgula, aspas dobradas dentro de aspas, vírgula dentro do campo, CRLF, e o vazio é vazio', () => {
        expect(lerCsv('a,b,c\r\n"PAINEL ""N"" | L",,x\r\n')).toEqual([['a', 'b', 'c'], ['PAINEL "N" | L', '', 'x']])
        expect(lerCsv('\ufeffa\n"1,5"\n')).toEqual([['a'], ['1,5']])
    })
    it('as colunas pelo NOME; a coluna que falta e a linha com outro número de campos são recusas nomeadas', () => {
        const cab = COLUNAS_DO_INDICE.join(',')
        const r = lerIndice(`${cab}\r\nprincipal,PVC,DP-02,,,Sim,,a.jpg,z.zip,imagens/a.jpg,http://x\r\n`)
        expect(r).toEqual({ linhas: [expect.objectContaining({ grupo: 'PVC', codigo: 'DP-02', codigo_dp: '', liberado: 'Sim', caminho_no_zip: 'imagens/a.jpg' })] })
        expect(lerIndice('fonte,grupo\r\n')).toEqual({ erro: expect.stringContaining('codigo, codigo_dp') })
        expect(lerIndice(`${cab}\r\na,b\r\n`)).toEqual({ erro: 'a linha 2 do índice tem 2 campos; o cabeçalho tem 11.' })
    })
    it('o código DP normalizado (caixa, espaço, zeros à esquerda); vazio é nulo', () => {
        expect([codigoDpNormalizado('DP-017'), codigoDpNormalizado(' dp-17 '), codigoDpNormalizado('DP-02'), codigoDpNormalizado('DP-120'), codigoDpNormalizado('')])
            .toEqual(['DP-17', 'DP-17', 'DP-2', 'DP-120', null])
    })
    it('NÃO FUNDE: DP-017 e DP-17 são códigos DIFERENTES que a normalização juntaria — nomeados, com os dois crus, nunca "colisão de grafia"', () => {
        expect(codigosQueANormalizacaoJuntaria(['DP-017', 'DP-17', 'DP-17', 'DP-02'])).toEqual([{ normalizado: 'DP-17', crus: ['DP-017', 'DP-17'], frase: 'DP-017 e DP-17 são códigos diferentes que a normalização juntaria (DP-17)' }])
        expect(codigosQueANormalizacaoJuntaria(['DP-02', 'DP-03'])).toEqual([])
    })
    it('a DUPLICATA REAL sai do dado: os códigos DP do principal com a MESMA descrição (DP-017 e DP-18, como no índice de 11/11/2026)', () => {
        const D = 'JANELA DE CORRER 03 FOLHAS MÓVEIS | 02 VIDROS - 01 TELA | PEITORIL FIXO | EUROPA 42'
        const ind = [L('z', 'a', 'PVC', { codigo: '*DP-017', descricao: D }), L('z', 'b', 'PVC', { codigo: '*DP-18', descricao: D }),
            L('z', 'c', 'PVC', { codigo: '*DP-17', descricao: 'JANELA DE CORRER 03 FOLHAS MÓVEIS COM PERSIANA | 02 VIDROS - 01 TELA | EUROPA 42' }),
            // a por_variavel e o código que não é DP não entram
            L('z', 'd', 'PVC', { codigo: 'DP-19', descricao: D, fonte: 'por_variavel' }), L('z', 'e', 'Alumínio', { codigo: '30-FIX-01', descricao: D })]
        expect(codigosComAMesmaDescricao(ind)).toEqual([`DP-017 e DP-18 têm a mesma descrição: "${D}"`])
    })
})

describe('o plano de um zip: a pasta sai do GRUPO do índice, nunca do nome do zip', () => {
    const ZIP = 'Desenhos_Aluminio.zip'
    const indice = [
        L(ZIP, 'imagens/ESQ_1.jpg', 'Alumínio'),
        // o mesmo arquivo em DOIS grupos: sobe para as duas pastas
        L(ZIP, 'imagens/ESQ_2.jpg', 'Alumínio'), L(ZIP, 'imagens/ESQ_2.jpg', 'Portas revestidas (ACM/lambri)'),
        // o arquivo do zip só no grupo de outro nome: a pasta é a do grupo
        L(ZIP, 'imagens/PG1.jpg', 'Portas revestidas (ACM/lambri)'),
        // citado pelo índice e ausente do zip
        L(ZIP, 'imagens/SUMIU.jpg', 'Alumínio'),
        // linha sem caminho (não achada nos zips) e de outro zip: não contam aqui
        L('', '', 'PVC'), L('Desenhos_PVC.zip', 'imagens/ESQ_1.jpg', 'PVC'),
    ]
    const entradas = [
        { caminho: 'imagens/', pasta: true },
        { caminho: 'indice.csv', pasta: false },
        { caminho: '__MACOSX/imagens/._ESQ_1.jpg', pasta: false },
        { caminho: 'imagens/ESQ_1.jpg', pasta: false },
        { caminho: 'imagens/ESQ_2.jpg', pasta: false },
        { caminho: 'imagens/PG1.jpg', pasta: false },
        { caminho: 'imagens/FORA.jpg', pasta: false },
    ]
    const p = planoDoZip(entradas, indice, ZIP) as Exclude<ReturnType<typeof planoDoZip>, { erro: string }>
    it('cada arquivo vai para a pasta de CADA grupo que o índice lhe dá', () => {
        expect(p.desenhos).toEqual([
            { grupo: 'aluminio', arquivo: 'ESQ_1.jpg', caminhoNoZip: 'imagens/ESQ_1.jpg' },
            { grupo: 'aluminio', arquivo: 'ESQ_2.jpg', caminhoNoZip: 'imagens/ESQ_2.jpg' },
            { grupo: 'portas-revestidas-acm-lambri', arquivo: 'ESQ_2.jpg', caminhoNoZip: 'imagens/ESQ_2.jpg' },
            { grupo: 'portas-revestidas-acm-lambri', arquivo: 'PG1.jpg', caminhoNoZip: 'imagens/PG1.jpg' },
        ])
    })
    it('NOMEADOS: o índice de dentro e o lixo (ignorados); o arquivo sem grupo (recusado); o citado e ausente (faltamNoZip)', () => {
        expect(p.ignorados.map((x) => x.arquivo)).toEqual(['indice.csv', '__MACOSX/imagens/._ESQ_1.jpg'])
        expect(p.recusados).toEqual([{ arquivo: 'imagens/FORA.jpg', motivo: 'o índice não cita este arquivo: sem grupo, não sobe' }])
        expect(p.faltamNoZip).toEqual([{ arquivo: 'imagens/SUMIU.jpg', motivo: 'o índice cita e o zip não tem' }])
    })
    it('o zip que o índice não cita é recusado inteiro, com a frase', () => {
        expect(planoDoZip(entradas, indice, 'outro.zip')).toEqual({ erro: expect.stringContaining('não cita o zip "outro.zip"') })
    })
    it('dois arquivos do zip que cairiam no mesmo tipologias/<grupo>/<nome>: nenhum sobe, os dois nomeados', () => {
        const q = planoDoZip([{ caminho: 'a/X.jpg', pasta: false }, { caminho: 'b/X.jpg', pasta: false }], [L(ZIP, 'a/X.jpg', 'PVC'), L(ZIP, 'b/X.jpg', 'PVC')], ZIP)
        expect(q).toEqual(expect.objectContaining({ desenhos: [], recusados: [
            { arquivo: 'a/X.jpg', motivo: '2 arquivos do zip cairiam em tipologias/pvc/X.jpg; nenhum sobe' },
            { arquivo: 'b/X.jpg', motivo: '2 arquivos do zip cairiam em tipologias/pvc/X.jpg; nenhum sobe' },
        ] }))
    })
    it('ENTRE ZIPS: o nome que o índice põe na mesma pasta vindo de OUTRO zip não sobe — nunca "já existia" sendo outro desenho', () => {
        const q = planoDoZip([{ caminho: 'imagens/X.jpg', pasta: false }], [L('Desenhos_PVC.zip', 'imagens/X.jpg', 'PVC'), L('Desenhos_PVC_DP_fotos_por_variavel.zip', 'fotos/X.jpg', 'PVC')], 'Desenhos_PVC.zip')
        expect(q).toEqual(expect.objectContaining({ desenhos: [], recusados: [{ arquivo: 'imagens/X.jpg', motivo: 'o índice também põe um arquivo do zip "Desenhos_PVC_DP_fotos_por_variavel.zip" em tipologias/pvc/X.jpg; nenhum dos dois sobe por este zip' }] }))
        // o mesmo nome em OUTRA pasta (outro grupo) não é colisão
        const r = planoDoZip([{ caminho: 'imagens/X.jpg', pasta: false }], [L('Desenhos_PVC.zip', 'imagens/X.jpg', 'PVC'), L('Desenhos_Aluminio.zip', 'imagens/X.jpg', 'Alumínio')], 'Desenhos_PVC.zip')
        expect(r).toEqual(expect.objectContaining({ recusados: [], desenhos: [{ grupo: 'pvc', arquivo: 'X.jpg', caminhoNoZip: 'imagens/X.jpg' }] }))
    })
    it('o grupo vira pasta: os cinco grupos do índice real', () => {
        expect(['Alumínio', 'PVC', 'Blindex / vidro temperado', 'Portas revestidas (ACM/lambri)', 'Portões / gradis'].map(grupoNoCaminho))
            .toEqual(['aluminio', 'pvc', 'blindex-vidro-temperado', 'portas-revestidas-acm-lambri', 'portoes-gradis'])
    })
})

describe('o lote', () => {
    it('em lotes do tamanho dado, na ordem, o último menor', () => {
        expect(emLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
        expect(emLotes(Array.from({ length: TAMANHO_DO_LOTE + 1 }, (_, i) => i)).map((l) => l.length)).toEqual([TAMANHO_DO_LOTE, 1])
    })
    it('o pedido do lote: grupo na forma, de 1 a TAMANHO_DO_LOTE nomes, sem repetição', () => {
        expect(lerPedidoDoLote({ grupo: 'aluminio', arquivos: ['a.jpg'] })).toEqual({ grupo: 'aluminio', arquivos: ['a.jpg'] })
        expect(lerPedidoDoLote({ grupo: 'Alumínio', arquivos: ['a.jpg'] })).toHaveProperty('erro')
        expect(lerPedidoDoLote({ grupo: 'aluminio', arquivos: [] })).toHaveProperty('erro')
        expect(lerPedidoDoLote({ grupo: 'aluminio', arquivos: Array.from({ length: TAMANHO_DO_LOTE + 1 }, (_, i) => `${i}.jpg`) })).toHaveProperty('erro')
        expect(lerPedidoDoLote({ grupo: 'aluminio', arquivos: ['a.jpg', 'a.jpg'] })).toHaveProperty('erro')
        expect(lerPedidoDoLote({ grupo: 'aluminio', arquivos: [1] })).toHaveProperty('erro')
    })
})

describe('o envio — retomada, falha nomeada, e rodar duas vezes não duplica nem apaga', () => {
    /** Um bucket de mentira: o que já existe não é assinado; o envio sem sobrescrita responde "Duplicate" se o objeto já está lá. */
    function bucket(nomes: string[], { falhaNoLote = -1, falhaNoEnvio = '' } = {}) {
        const objetos = new Map<string, number>()
        let lote = -1
        const envios: string[] = []
        const deps: DependenciasDoEnvio = {
            async lerZip() {
                return { entradas: [...nomes.map((n) => ({ caminho: `G/${n}`, pasta: false })), { caminho: 'G/indice.csv', pasta: false }],
                    bytes: async (c: string) => new TextEncoder().encode(c) }
            },
            async assinarLote(_grupo, arquivos): Promise<LoteAssinado> {
                lote += 1
                if (lote === falhaNoLote) throw new Error('rede caiu')
                return { existentes: arquivos.filter((a) => objetos.has(a)), recusados: [],
                    assinados: arquivos.filter((a) => !objetos.has(a)).map((a) => ({ arquivo: a, path: `tipologias/g/${a}`, signedUrl: `url:${a}` })) }
            },
            async enviar(url) {
                const nome = url.slice(4)
                envios.push(nome)
                if (nome === falhaNoEnvio) return { ok: false, status: 500, corpo: 'erro interno' }
                if (objetos.has(nome)) return { ok: false, status: 400, corpo: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' }
                objetos.set(nome, 1)
                return { ok: true, status: 200, corpo: '' }
            },
        }
        return { deps, objetos, envios }
    }
    const NOMES = Array.from({ length: 30 }, (_, i) => `ESQ_${String(i).padStart(2, '0')}.jpg`)
    const indiceDe = (nomes: string[]) => nomes.map((n) => L('z.zip', `G/${n}`, 'G'))
    const enviar = (b: ReturnType<typeof bucket>, nomes = NOMES) => enviarDesenhosDoZip(new Blob([]), 'z.zip', indiceDe(nomes), b.deps).then(ok)

    it('tudo sobe; o índice não; o resumo diz cada número', async () => {
        const b = bucket(NOMES)
        const r = await enviar(b)
        expect(r.enviados).toHaveLength(30)
        expect(b.objetos.size).toBe(30)
        expect(r.ignorados).toEqual([{ arquivo: 'G/indice.csv', motivo: 'o índice de dentro do zip não sobe' }])
        expect(resumoDoEnvio(r)).toBe('z.zip: 30 enviados, 0 já existiam, 0 falharam, 0 recusados, 1 ignorados, 0 citados no índice e ausentes do zip.')
    })
    it('RODAR DUAS VEZES: a segunda não envia nada, não duplica e não apaga — tudo "já existia"', async () => {
        const b = bucket(NOMES)
        await enviar(b)
        const enviosAntes = b.envios.length
        const r2 = await enviar(b)
        expect(r2.enviados).toEqual([])
        expect(r2.jaExistiam).toHaveLength(30)
        expect(b.envios.length).toBe(enviosAntes)
        expect(b.objetos.size).toBe(30)
    })
    it('o lote cuja assinatura falha: os 25 dele são FALHAS nomeadas, o próximo lote segue; rodar de novo completa só o que faltou', async () => {
        const b = bucket(NOMES, { falhaNoLote: 0 })
        const r = await enviar(b)
        expect(r.falhas).toHaveLength(TAMANHO_DO_LOTE)
        expect(r.falhas[0]).toEqual({ arquivo: 'g/ESQ_00.jpg', motivo: 'a assinatura do lote falhou: rede caiu' })
        expect(r.enviados).toHaveLength(30 - TAMANHO_DO_LOTE)
        const r2 = await enviar(b)
        expect(r2.enviados).toHaveLength(TAMANHO_DO_LOTE)
        expect(r2.jaExistiam).toHaveLength(30 - TAMANHO_DO_LOTE)
        expect(r2.falhas).toEqual([])
    })
    it('o envio que falha é nomeado com o status; o "já existe" de uma corrida conta como já existia, não como falha', async () => {
        const b = bucket(NOMES, { falhaNoEnvio: 'ESQ_03.jpg' })
        b.objetos.set('ESQ_04.jpg', 1)
        // a lista de existentes da rota NÃO vê o ESQ_04 (ele chega entre a lista e o envio)
        const assinar = b.deps.assinarLote
        b.deps.assinarLote = async (g, a) => {
            const r = await assinar(g, a)
            return { ...r, existentes: r.existentes.filter((x) => x !== 'ESQ_04.jpg'), assinados: a.includes('ESQ_04.jpg') ? [...r.assinados, { arquivo: 'ESQ_04.jpg', path: 'p', signedUrl: 'url:ESQ_04.jpg' }] : r.assinados }
        }
        const r = await enviar(b)
        expect(r.falhas).toEqual([{ arquivo: 'g/ESQ_03.jpg', motivo: 'o envio falhou (500)' }])
        expect(r.jaExistiam).toEqual(['g/ESQ_04.jpg'])
    })
    it('o arquivo sobre o qual a rota não respondeu não some: vira falha nomeada', async () => {
        const b = bucket(['A.jpg', 'B.jpg'])
        b.deps.assinarLote = async () => ({ existentes: [], recusados: [], assinados: [{ arquivo: 'A.jpg', path: 'p', signedUrl: 'url:A.jpg' }] })
        const r = await enviar(b, ['A.jpg', 'B.jpg'])
        expect(r.falhas).toEqual([{ arquivo: 'g/B.jpg', motivo: 'a rota não respondeu sobre este arquivo' }])
    })
})

describe('o zip de verdade (jszip)', () => {
    it('lê as entradas e os bytes; a pasta é pasta', async () => {
        const z = new JSZip()
        z.file('Aluminio/ESQ_1.jpg', new Uint8Array([1, 2, 3]))
        z.file('Aluminio/indice.csv', 'a;b')
        const bytes = await z.generateAsync({ type: 'uint8array' })
        const lido = await DEPENDENCIAS_REAIS.lerZip(bytes as unknown as Blob)
        expect(lido.entradas).toEqual(expect.arrayContaining([{ caminho: 'Aluminio/', pasta: true }, { caminho: 'Aluminio/ESQ_1.jpg', pasta: false }, { caminho: 'Aluminio/indice.csv', pasta: false }]))
        expect([...(await lido.bytes('Aluminio/ESQ_1.jpg'))]).toEqual([1, 2, 3])
        await expect(lido.bytes('nao/existe.jpg')).rejects.toThrow('"nao/existe.jpg" não está no zip')
    })
})

describe('O SLUG DO GRUPO NUM LUGAR SÓ (dono do produto, 11/11/2026): o envio e a importação gravam o MESMO caminho', () => {
    // os cinco grupos do índice real, com o slug LITERAL de cada um — preso aqui, não a regra
    const SLUG: Array<[string, string]> = [
        ['Alumínio', 'aluminio'],
        ['PVC', 'pvc'],
        ['Blindex / vidro temperado', 'blindex-vidro-temperado'],
        ['Portas revestidas (ACM/lambri)', 'portas-revestidas-acm-lambri'],
        ['Portões / gradis', 'portoes-gradis'],
    ]
    it.each(SLUG)('"%s" → tipologias/%s/', (grupo, slug) => {
        expect(grupoNoCaminho(grupo)).toBe(slug)
        // a importação grava o caminho com esse slug, literal
        const r = linhasParaImportar([L('z.zip', 'imagens/00001__X.jpg', grupo)])
        if ('recusas' in r) throw new Error(r.recusas.join(' | '))
        expect(r.linhas[0].caminho_no_storage).toBe(`tipologias/${slug}/00001__X.jpg`)
    })
    it('os DOIS LADOS, com os cinco grupos e um arquivo em dois grupos: o conjunto de caminhos da importação é o conjunto de destinos do envio', () => {
        const ZIP = 'z.zip'
        const indice = [...SLUG.map(([g], k) => L(ZIP, `imagens/A${k}.jpg`, g)), L(ZIP, 'imagens/A0.jpg', 'Portas revestidas (ACM/lambri)')]
        const plano = planoDoZip([...new Set(indice.map((l) => l.caminho_no_zip))].map((c) => ({ caminho: c, pasta: false })), indice, ZIP)
        if ('erro' in plano) throw new Error(plano.erro)
        const destinos = plano.desenhos.map((d) => `tipologias/${d.grupo}/${d.arquivo}`)
        const imp = linhasParaImportar(indice)
        if ('recusas' in imp) throw new Error(imp.recusas.join(' | '))
        const c = conferirDesenhos(imp.linhas.map((l) => l.caminho_no_storage!), destinos)
        expect(c).toEqual({ semObjeto: [], semLinha: [], caminhos: 6, objetos: 6 })
    })
})

describe('as linhas da importação', () => {
    const cab = (extra: Partial<LinhaDoIndice>) => L('z.zip', 'imagens/A.jpg', 'PVC', extra)
    it('o vazio vira NULO; liberado Sim/Não/vazio; o código CRU como veio e o codigo_dp normalizado ao lado', () => {
        const r = linhasParaImportar([
            cab({ fonte: 'por_variavel', codigo: 'DP-017', codigo_dp: 'DP-017', descricao: '', condicao: '(N=1)', liberado: '' }),
            cab({ fonte: 'principal', codigo: ' 30-FIX-01 ', codigo_dp: '', descricao: 'PAINEL', liberado: 'Não' }),
            cab({ fonte: 'principal', codigo: 'DP-17', liberado: 'Sim' }),
        ])
        if ('recusas' in r) throw new Error(r.recusas.join(' | '))
        expect(r.linhas[0]).toEqual({ fonte: 'por_variavel', grupo: 'PVC', codigo: 'DP-017', codigo_dp: 'DP-17', descricao: null, liberado_para_venda: null, condicao: '(N=1)', caminho_no_storage: 'tipologias/pvc/A.jpg' })
        expect(r.linhas[1]).toEqual(expect.objectContaining({ codigo: ' 30-FIX-01 ', codigo_dp: null, descricao: 'PAINEL', liberado_para_venda: false, condicao: null }))
        expect(r.linhas[2].liberado_para_venda).toBe(true)
        expect(r.juntadosPelaNormalizacao).toEqual(['DP-017 e DP-17 são códigos diferentes que a normalização juntaria (DP-17)'])
        expect(r.mesmaDescricao).toEqual([])
    })
    it('a linha sem arquivo nos zips: caminho NULO, e NOMEADA na lista — nunca pulada', () => {
        const r = linhasParaImportar([cab({ codigo: 'DP-99', caminho_no_zip: '', arquivo_indice: '00001__Y.png', condicao: '(N=2)' })])
        if ('recusas' in r) throw new Error(r.recusas.join(' | '))
        expect(r.linhas).toHaveLength(1)
        expect(r.linhas[0].caminho_no_storage).toBeNull()
        expect(r.semArquivo).toEqual(['linha 2: DP-99 (N=2) (00001__Y.png)'])
    })
    it('RECUSA a importação inteira, nomeando cada linha: fonte, liberado, codigo_dp, caminho que o bucket não aceita', () => {
        const r = linhasParaImportar([
            cab({ fonte: 'outra' }),
            cab({ liberado: 'Talvez' }),
            cab({ codigo_dp: 'XX-1' }),
            cab({ caminho_no_zip: 'imagens/três.jpg' }),
            cab({}),
        ])
        expect(r).toEqual({ recusas: [
            'linha 2: fonte "outra" não é principal nem por_variavel',
            'linha 3: liberado "Talvez" não é Sim, Não nem vazio',
            'linha 4: codigo_dp "XX-1" não é um código DP',
            expect.stringMatching(/^linha 5: o nome tem caractere/),
        ] })
    })
})

describe('a conferência índice × Storage', () => {
    it('os dois lados, nomeados e em ordem; zero dos dois quando casam', () => {
        expect(conferirDesenhos(['tipologias/pvc/A.jpg', 'tipologias/pvc/B.jpg', 'tipologias/pvc/B.jpg'], ['tipologias/pvc/B.jpg', 'tipologias/pvc/Z.jpg']))
            .toEqual({ semObjeto: ['tipologias/pvc/A.jpg'], semLinha: ['tipologias/pvc/Z.jpg'], caminhos: 2, objetos: 2 })
        expect(conferirDesenhos(['a', 'b'], ['b', 'a'])).toEqual({ semObjeto: [], semLinha: [], caminhos: 2, objetos: 2 })
    })
})
