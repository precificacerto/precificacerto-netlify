/**
 * @jest-environment node
 *
 * PORTÃO — OS DESENHOS DAS TIPOLOGIAS NO STORAGE (dono do produto, 11/11/2026): o zip é explodido no navegador; o `indice.csv` não sobe; o
 * caminho é `tipologias/<grupo>/<arquivo>`; o lote tem retomada; o que falhou é nomeado ao fim; rodar duas vezes não duplica nem apaga.
 */
jest.mock('@/page-parts/atendimentos-ia/api', () => ({ chamarRota: jest.fn() }))
import JSZip from 'jszip'
import {
    TAMANHO_DO_LOTE, caminhoDoDesenho, desenhosDoZip, emLotes, grupoNoCaminho, lerPedidoDoLote, resumoDoEnvio, tipoDaImagem,
} from '@/lib/atendimentos-ia/desenhos-das-tipologias'
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
        expect(caminhoDoDesenho('aluminio', 'leia-me.txt')).toEqual({ recusa: expect.stringContaining('não é uma imagem') })
        expect(tipoDaImagem('X.JPEG')).toBe('image/jpeg')
        expect(tipoDaImagem('X.png')).toBe('image/png')
    })
})

describe('o que do zip sobe', () => {
    const entradas = [
        { caminho: 'Aluminio/', pasta: true },
        { caminho: 'Aluminio/indice.csv', pasta: false },
        { caminho: 'Indice.CSV', pasta: false },
        { caminho: '__MACOSX/Aluminio/._ESQ_1.jpg', pasta: false },
        { caminho: 'Aluminio/.DS_Store', pasta: false },
        { caminho: 'Aluminio/ESQ_2.jpg', pasta: false },
        { caminho: 'Aluminio/ESQ_1.jpg', pasta: false },
        { caminho: 'Aluminio/leia-me.txt', pasta: false },
        { caminho: 'a/ESQ_9.jpg', pasta: false },
        { caminho: 'b/ESQ_9.jpg', pasta: false },
    ]
    const r = desenhosDoZip(entradas, 'aluminio')
    it('sobem só as imagens, em ordem, cada uma com o seu caminho no zip', () => {
        expect(r.desenhos).toEqual([{ arquivo: 'ESQ_1.jpg', caminhoNoZip: 'Aluminio/ESQ_1.jpg' }, { arquivo: 'ESQ_2.jpg', caminhoNoZip: 'Aluminio/ESQ_2.jpg' }])
    })
    it('o indice.csv (em qualquer pasta e caixa) e o lixo de sistema ficam de fora, NOMEADOS', () => {
        expect(r.ignorados.map((x) => x.arquivo)).toEqual(['Aluminio/indice.csv', 'Indice.CSV', '__MACOSX/Aluminio/._ESQ_1.jpg', 'Aluminio/.DS_Store'])
        expect(r.ignorados[0].motivo).toBe('o índice de dentro do zip não sobe')
    })
    it('o que não é imagem e o nome em duas pastas do mesmo zip são RECUSADOS e nomeados — nenhum dos dois sobe', () => {
        expect(r.recusados).toEqual([
            { arquivo: 'Aluminio/leia-me.txt', motivo: expect.stringContaining('não é uma imagem') },
            { arquivo: 'a/ESQ_9.jpg', motivo: expect.stringContaining('2 pastas') },
            { arquivo: 'b/ESQ_9.jpg', motivo: expect.stringContaining('2 pastas') },
        ])
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

    it('tudo sobe; o índice não; o resumo diz cada número', async () => {
        const b = bucket(NOMES)
        const r = await enviarDesenhosDoZip(new Blob([]), 'g', b.deps)
        expect(r.enviados).toHaveLength(30)
        expect(b.objetos.size).toBe(30)
        expect(r.ignorados).toEqual([{ arquivo: 'G/indice.csv', motivo: 'o índice de dentro do zip não sobe' }])
        expect(resumoDoEnvio(r)).toBe('Grupo g: 30 enviados, 0 já existiam, 0 falharam, 0 recusados, 1 ignorados.')
    })
    it('RODAR DUAS VEZES: a segunda não envia nada, não duplica e não apaga — tudo "já existia"', async () => {
        const b = bucket(NOMES)
        await enviarDesenhosDoZip(new Blob([]), 'g', b.deps)
        const enviosAntes = b.envios.length
        const r2 = await enviarDesenhosDoZip(new Blob([]), 'g', b.deps)
        expect(r2.enviados).toEqual([])
        expect(r2.jaExistiam).toHaveLength(30)
        expect(b.envios.length).toBe(enviosAntes)
        expect(b.objetos.size).toBe(30)
    })
    it('o lote cuja assinatura falha: os 25 dele são FALHAS nomeadas, o próximo lote segue; rodar de novo completa só o que faltou', async () => {
        const b = bucket(NOMES, { falhaNoLote: 0 })
        const r = await enviarDesenhosDoZip(new Blob([]), 'g', b.deps)
        expect(r.falhas).toHaveLength(TAMANHO_DO_LOTE)
        expect(r.falhas[0]).toEqual({ arquivo: 'ESQ_00.jpg', motivo: 'a assinatura do lote falhou: rede caiu' })
        expect(r.enviados).toHaveLength(30 - TAMANHO_DO_LOTE)
        const r2 = await enviarDesenhosDoZip(new Blob([]), 'g', b.deps)
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
        const r = await enviarDesenhosDoZip(new Blob([]), 'g', b.deps)
        expect(r.falhas).toEqual([{ arquivo: 'ESQ_03.jpg', motivo: 'o envio falhou (500)' }])
        expect(r.jaExistiam).toEqual(['ESQ_04.jpg'])
    })
    it('o arquivo sobre o qual a rota não respondeu não some: vira falha nomeada', async () => {
        const b = bucket(['A.jpg', 'B.jpg'])
        b.deps.assinarLote = async () => ({ existentes: [], recusados: [], assinados: [{ arquivo: 'A.jpg', path: 'p', signedUrl: 'url:A.jpg' }] })
        const r = await enviarDesenhosDoZip(new Blob([]), 'g', b.deps)
        expect(r.falhas).toEqual([{ arquivo: 'B.jpg', motivo: 'a rota não respondeu sobre este arquivo' }])
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
