/**
 * @jest-environment node
 *
 * PORTÃO — a IMAGEM e o PDF do vendedor (dono do produto, 18/11/2026): o leitor da mídia no evento do WUZAPI
 * (`midiaDaMensagem`, `payload-wuzapi.ts`), as leituras e recusas pelos LIMITES DA API (`midia-da-mensagem.ts`) e o download
 * pelo WUZAPI (`midia-do-wuzapi.ts`).
 *
 * Os limites são os da documentação da API, conferidos em 18/11/2026: imagem até 10 MB em base64 e 8000 x 8000 px (JPEG, PNG,
 * GIF, WebP); PDF sem senha, até 600 páginas, num pedido de até 128 MB. Cada recusa diz o número — nada é cortado em silêncio.
 *
 * O que NÃO alcança: o WUZAPI real e a API real (as páginas do PDF só ela conta).
 */
import { midiaDaMensagem, type MidiaDaMensagem } from '@/lib/atendimentos-ia/payload-wuzapi'
import {
    LADO_MAXIMO_DA_IMAGEM_PX, LIMITE_DA_IMAGEM_BYTES, LIMITE_DA_IMAGEM_EM_BASE64, LIMITE_DO_PDF_BYTES, LIMITE_DO_PDF_EM_BASE64,
    conferirMidiaBaixada, dimensoesDaImagem, duracaoPorExtenso, emMB, fraseDaMidiaRecusadaPelaIa, fraseDaRecusa, leituraDaMidia, marcadorDaMidia,
    marcaNoLog, textoDaEntradaComMidia, tipoPelosBytes,
} from '@/lib/atendimentos-ia/midia-da-mensagem'
import { baixarMidia, bytesDoDataUrl, caminhoDoDownload } from '@/lib/atendimentos-ia/midia-do-wuzapi'

const BYTES = { URL: 'https://mmg.whatsapp.net/x', directPath: '/x', mediaKey: 'a2V5', fileEncSHA256: 'ZW5j', fileSHA256: 'c2hh' }
const DOWNLOAD = { url: BYTES.URL, directPath: BYTES.directPath, mediaKey: BYTES.mediaKey, fileEncSHA256: BYTES.fileEncSHA256, fileSHA256: BYTES.fileSHA256 }

function midia(sobre: Partial<MidiaDaMensagem> = {}): MidiaDaMensagem {
    return { tipo: 'imagem', mimetype: 'image/jpeg', nome: null, legenda: null, tamanho: 1000, segundos: null, download: { ...DOWNLOAD, fileLength: 1000 }, ...sobre }
}
const pdf = (sobre: Partial<MidiaDaMensagem> = {}) => midia({ tipo: 'documento', mimetype: 'application/pdf', nome: 'Obra.pdf', ...sobre })

/** Um JPEG mínimo com o SOF0 dizendo a largura e a altura (precedido de um APP0, como a foto do celular). */
function jpeg(largura: number, altura: number, cauda = 0): Uint8Array {
    const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
    const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, altura >> 8, altura & 0xff, largura >> 8, largura & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
    return new Uint8Array([0xff, 0xd8, ...app0, ...sof, ...new Array(cauda).fill(0), 0xff, 0xd9])
}
function png(largura: number, altura: number): Uint8Array {
    const b = new Uint8Array(33)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    new DataView(b.buffer).setUint32(16, largura)
    new DataView(b.buffer).setUint32(20, altura)
    return b
}
const doPdf = (corpo: string) => new Uint8Array(Buffer.from(`%PDF-1.7\n${corpo}\n%%EOF`, 'latin1'))

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(1) midiaDaMensagem — os metadados como o webhook os entrega (medido em 18/11/2026: sem base64)', () => {
    it('a foto com legenda: tipo, mimetype, legenda, tamanho e o que o download exige', () => {
        // o fileName que o celular às vezes manda na imagem NÃO é nome: só o documento tem nome (o marcador da foto é "[imagem]")
        const m = midiaDaMensagem({ Message: { imageMessage: { ...BYTES, mimetype: 'image/jpeg', caption: '  porta 2,10 x 0,80  ', fileLength: 4242, fileName: 'IMG_0042.jpg' } } })
        expect(m).toEqual({ tipo: 'imagem', mimetype: 'image/jpeg', nome: null, legenda: 'porta 2,10 x 0,80', tamanho: 4242, segundos: null, download: { ...DOWNLOAD, fileLength: 4242 } })
    })
    it('o PDF com legenda vem dentro de documentWithCaptionMessage.message — o invólucro é aberto', () => {
        const m = midiaDaMensagem({ Message: { documentWithCaptionMessage: { message: { documentMessage: { ...BYTES, mimetype: 'application/pdf', fileName: 'Obra.pdf', caption: 'medidas' } } } } })
        expect(m).toEqual(expect.objectContaining({ tipo: 'documento', nome: 'Obra.pdf', legenda: 'medidas', tamanho: null }))
    })
    it.each([['ephemeralMessage'], ['viewOnceMessage'], ['viewOnceMessageV2']])('o invólucro %s também é aberto', (inv) => {
        expect(midiaDaMensagem({ Message: { [inv]: { message: { imageMessage: { ...BYTES, mimetype: 'image/png' } } } } })?.tipo).toBe('imagem')
    })
    it('a grafia com a inicial trocada (Url, DirectPath, MediaKey, FileLength em texto) também vale', () => {
        const m = midiaDaMensagem({ Message: { imageMessage: { Url: 'u', DirectPath: 'd', MediaKey: 'k', FileEncSHA256: 'e', FileSHA256: 's', Mimetype: 'image/jpeg', FileLength: '77' } } })
        expect(m).toEqual(expect.objectContaining({ mimetype: 'image/jpeg', tamanho: 77, download: { url: 'u', directPath: 'd', mediaKey: 'k', fileEncSHA256: 'e', fileSHA256: 's', fileLength: 77 } }))
    })
    it('áudio e vídeo são reconhecidos (para a resposta dizer o que fazer)', () => {
        expect(midiaDaMensagem({ Message: { audioMessage: { ...BYTES } } })?.tipo).toBe('audio')
        expect(midiaDaMensagem({ Message: { videoMessage: { ...BYTES, caption: 'olha' } } })).toEqual(expect.objectContaining({ tipo: 'video', legenda: 'olha' }))
    })
    it('faltando a chave da mídia: a mídia chegou, mas o download é NULL (nunca um download pela metade)', () => {
        const semChave: Record<string, unknown> = { ...BYTES }
        delete semChave.mediaKey
        expect(midiaDaMensagem({ Message: { imageMessage: { ...semChave, mimetype: 'image/jpeg' } } })).toEqual(expect.objectContaining({ tipo: 'imagem', download: null }))
    })
    it('fileLength ausente, zero ou não numérico é NULL — ausente não é zero', () => {
        for (const v of [undefined, 0, -3, 'abc', 1.5]) expect(midiaDaMensagem({ Message: { imageMessage: { ...BYTES, fileLength: v } } })?.tamanho).toBeNull()
    })
    it.each([
        ['texto', { Message: { conversation: 'oi' } }],
        ['figurinha', { Message: { stickerMessage: { ...BYTES } } }],
        ['reação', { Message: { reactionMessage: { text: 'ok' } } }],
        ['Message ausente', {}],
        ['event nulo', null],
    ])('%s → null', (_n, ev) => expect(midiaDaMensagem(ev)).toBeNull())
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(2) leituraDaMidia — o que se lê e o que se recusa, pelos metadados, ANTES de baixar', () => {
    it('O ÁUDIO (tarefa 0018, 18/11/2026): vai à transcrição; acima de 3 minutos DECLARADOS recusa sem baixar, dizendo a duração; sem os dados do download, recusa', () => {
        expect(leituraDaMidia(midia({ tipo: 'audio', mimetype: 'audio/ogg', segundos: 42 }))).toEqual({ lida: true, como: 'audio' })
        expect(leituraDaMidia(midia({ tipo: 'audio', mimetype: 'audio/ogg', segundos: null }))).toEqual({ lida: true, como: 'audio' })
        expect(leituraDaMidia(midia({ tipo: 'audio', mimetype: 'audio/ogg', segundos: 180 }))).toEqual({ lida: true, como: 'audio' })
        expect(leituraDaMidia(midia({ tipo: 'audio', mimetype: 'audio/ogg', segundos: 245 }))).toEqual({ lida: false, motivo: 'audio_longo',
            frase: 'Recebi o seu áudio, mas ele tem 4 minutos e 5 segundos e eu ouço áudio de até 3 minutos: mande em partes menores, ou me escreva o que precisa.' })
        expect(leituraDaMidia(midia({ tipo: 'audio', segundos: 10, download: null }))).toEqual(expect.objectContaining({ lida: false, motivo: 'sem_dados_do_download' }))
    })
    it('a duração por extenso', () => {
        expect([duracaoPorExtenso(40), duracaoPorExtenso(60), duracaoPorExtenso(61), duracaoPorExtenso(125.2), duracaoPorExtenso(181)]).toEqual(['40 segundos', '1 minuto', '1 minuto e 1 segundo', '2 minutos e 6 segundos', '3 minutos e 1 segundo'])
    })
    it('as frases do áudio dizem o que chegou e o que fazer', () => {
        const a = midia({ tipo: 'audio', mimetype: 'audio/ogg' })
        expect(fraseDaRecusa(a, 'audio_nao_transcrito')).toBe('Recebi o seu áudio, mas não consegui transcrever agora: mande de novo daqui a pouco, ou me escreva o que precisa.')
        expect(fraseDaRecusa(a, 'audio_nao_liberado')).toBe('Recebi o seu áudio, mas a transcrição de áudio não está liberada para a sua empresa: me escreva o que precisa, ou mande uma foto.')
        expect(fraseDaRecusa(a, 'audio_teto')).toBe('Recebi o seu áudio, mas a sua empresa já usou os minutos de áudio do mês: me escreva o que precisa, ou mande uma foto.')
        expect(fraseDaRecusa(a, 'audio_longo')).toBe('Recebi o seu áudio, mas ele tem mais do que eu ouço: áudio de até 3 minutos: mande em partes menores, ou me escreva o que precisa.')
    })
    it('o áudio do evento: a duração declarada (`seconds`) é lida; e o download é pelo endpoint do áudio', () => {
        const m = midiaDaMensagem({ Message: { audioMessage: { ...BYTES, mimetype: 'audio/ogg; codecs=opus', seconds: 37, ptt: true, fileLength: 9000 } } })
        expect(m).toEqual(expect.objectContaining({ tipo: 'audio', segundos: 37, tamanho: 9000 }))
        expect(caminhoDoDownload(m as MidiaDaMensagem)).toBe('/chat/downloadaudio')
        expect(midiaDaMensagem({ Message: { audioMessage: { ...BYTES, mimetype: 'audio/ogg' } } })).toEqual(expect.objectContaining({ tipo: 'audio', segundos: null }))
        expect(midiaDaMensagem({ Message: { imageMessage: { ...BYTES, mimetype: 'image/jpeg', seconds: 5 } } })).toEqual(expect.objectContaining({ segundos: null }))
    })
    it('foto JPEG e PDF são lidos', () => {
        expect(leituraDaMidia(midia())).toEqual({ lida: true, como: 'imagem' })
        expect(leituraDaMidia(pdf())).toEqual({ lida: true, como: 'pdf' })
    })
    it('o PDF sem mimetype mas com nome .pdf é lido; a imagem mandada como documento é lida como imagem', () => {
        expect(leituraDaMidia(pdf({ mimetype: null }))).toEqual({ lida: true, como: 'pdf' })
        expect(leituraDaMidia(midia({ tipo: 'documento', mimetype: 'image/png', nome: 'planta.png' }))).toEqual({ lida: true, como: 'imagem' })
    })
    it.each([
        ['vídeo', midia({ tipo: 'video', mimetype: 'video/mp4' }), 'video', 'Recebi o seu vídeo, mas ainda não consigo assistir vídeo: me mande uma foto ou um PDF, ou me escreva as medidas.'],
        ['planilha pelo mimetype', pdf({ mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nome: 'Obra.xlsx' }), 'planilha', 'Recebi a planilha “Obra.xlsx”, mas ainda não consigo ler planilha: me mande em PDF ou em foto, ou me escreva as medidas.'],
        ['planilha pela extensão (.csv)', pdf({ mimetype: 'application/octet-stream', nome: 'medidas.csv' }), 'planilha', 'Recebi a planilha “medidas.csv”, mas ainda não consigo ler planilha: me mande em PDF ou em foto, ou me escreva as medidas.'],
        ['documento do Word', pdf({ mimetype: 'application/msword', nome: 'Obra.doc' }), 'documento_nao_pdf', 'Recebi o documento “Obra.doc”, mas de documento eu só leio PDF: me mande em PDF ou em foto, ou me escreva as medidas.'],
        ['imagem HEIC', midia({ mimetype: 'image/heic' }), 'imagem_formato', 'Recebi a sua foto, mas não leio esse formato de imagem (leio JPEG, PNG, GIF e WebP): mande como foto comum, ou me escreva as medidas.'],
    ])('%s: recusa nomeada', (_n, m, motivo, frase) => {
        expect(leituraDaMidia(m)).toEqual({ lida: false, motivo, frase })
    })
    it('o tamanho DECLARADO acima do limite recusa sem baixar, dizendo os dois números', () => {
        expect(leituraDaMidia(midia({ tamanho: LIMITE_DA_IMAGEM_BYTES + 1 }))).toEqual({
            lida: false, motivo: 'imagem_grande', frase: 'Recebi a sua foto, mas ela tem 7,6 MB e eu leio imagem de até 7,5 MB: mande uma foto menor, ou me escreva as medidas.',
        })
        expect(leituraDaMidia(pdf({ tamanho: 95_000_000 }))).toEqual({
            lida: false, motivo: 'pdf_grande', frase: 'Recebi o PDF “Obra.pdf”, mas ele tem 95,0 MB e eu leio PDF de até 90,0 MB: mande só as páginas dos itens, ou me escreva as medidas.',
        })
    })
    it('exatamente no limite ainda é lido (a fronteira é ">")', () => {
        expect(leituraDaMidia(midia({ tamanho: LIMITE_DA_IMAGEM_BYTES }))).toEqual({ lida: true, como: 'imagem' })
        expect(leituraDaMidia(pdf({ tamanho: LIMITE_DO_PDF_BYTES }))).toEqual({ lida: true, como: 'pdf' })
    })
    it('sem os dados do download: recusa nomeada, sem tentar baixar', () => {
        expect(leituraDaMidia(midia({ download: null }))).toEqual(expect.objectContaining({ lida: false, motivo: 'sem_dados_do_download', frase: expect.stringContaining('não consegui baixar o arquivo do WhatsApp') }))
    })
    it('os limites são os da API: 10 MB em base64 por imagem, 128 MB por pedido (8 MB reservados ao resto)', () => {
        expect(LIMITE_DA_IMAGEM_EM_BASE64).toBe(10_000_000)
        expect(LIMITE_DA_IMAGEM_BYTES).toBe(7_500_000)
        expect(LIMITE_DO_PDF_EM_BASE64).toBe(128_000_000 - 8_000_000)
        expect(LIMITE_DO_PDF_BYTES).toBe(90_000_000)
        expect(LADO_MAXIMO_DA_IMAGEM_PX).toBe(8000)
    })
    it('emMB arredonda PARA CIMA: o número dito nunca é menor que o arquivo', () => {
        expect(emMB(7_500_001)).toBe('7,6 MB')
        expect(emMB(7_500_000)).toBe('7,5 MB')
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(3) os bytes: o tipo pela assinatura e as dimensões pelo cabeçalho', () => {
    it('JPEG, PNG, GIF, WebP e PDF pela assinatura; o resto é NULL', () => {
        expect(tipoPelosBytes(jpeg(10, 10))).toBe('image/jpeg')
        expect(tipoPelosBytes(png(10, 10))).toBe('image/png')
        expect(tipoPelosBytes(new Uint8Array(Buffer.from('GIF89a\x0a\x00\x05\x00', 'latin1')))).toBe('image/gif')
        expect(tipoPelosBytes(new Uint8Array(Buffer.from('RIFF\0\0\0\0WEBPVP8X', 'latin1')))).toBe('image/webp')
        expect(tipoPelosBytes(doPdf('x'))).toBe('application/pdf')
        expect(tipoPelosBytes(new Uint8Array(Buffer.from('\0\0\0\x18ftypheic', 'latin1')))).toBeNull()
    })
    it('as dimensões: JPEG pelo SOF (depois do APP0), PNG pelo IHDR, GIF pela tela lógica', () => {
        expect(dimensoesDaImagem(jpeg(4032, 3024), 'image/jpeg')).toEqual({ largura: 4032, altura: 3024 })
        expect(dimensoesDaImagem(png(9000, 100), 'image/png')).toEqual({ largura: 9000, altura: 100 })
        expect(dimensoesDaImagem(new Uint8Array(Buffer.from('GIF89a\x0a\x00\x05\x00', 'latin1')), 'image/gif')).toEqual({ largura: 10, altura: 5 })
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(4) conferirMidiaBaixada — o anexo para o modelo, ou a recusa nomeada', () => {
    it('a foto vira bloco image em base64, com o tipo DOS BYTES (não o declarado) e a instrução de não adivinhar número', () => {
        const bytes = png(800, 600)
        const r = conferirMidiaBaixada(midia({ mimetype: 'image/jpeg' }), 'imagem', bytes)
        expect(r).toEqual({ ok: true, anexo: expect.objectContaining({ como: 'imagem', bloco: { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(bytes).toString('base64') } } }) })
        if ('anexo' in r) expect(r.anexo.instrucao).toContain('Nunca complete, arredonde nem adivinhe um número')
    })
    it('o PDF vira bloco document em base64', () => {
        const bytes = doPdf('1 0 obj << >> endobj')
        expect(conferirMidiaBaixada(pdf(), 'pdf', bytes)).toEqual({ ok: true, anexo: expect.objectContaining({ como: 'pdf', bloco: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } } }) })
    })
    it('a imagem acima de 8000 px no maior lado recusa dizendo as dimensões', () => {
        expect(conferirMidiaBaixada(midia(), 'imagem', png(8001, 600))).toEqual({ ok: false, motivo: 'imagem_dimensao', frase: 'Recebi a sua foto, mas ela tem 8001 x 600 pixels e eu leio imagem de até 8000 pixels de lado: mande uma foto menor, ou me escreva as medidas.' })
        expect(conferirMidiaBaixada(midia(), 'imagem', png(8000, 8000))).toEqual(expect.objectContaining({ ok: true }))
    })
    it('a imagem cujo base64 passa de 10 MB recusa com o tamanho real (o declarado podia mentir)', () => {
        const grande = jpeg(100, 100, LIMITE_DA_IMAGEM_BYTES)
        expect(conferirMidiaBaixada(midia({ tamanho: 1000 }), 'imagem', grande)).toEqual(expect.objectContaining({ ok: false, motivo: 'imagem_grande', frase: expect.stringContaining('ela tem 7,6 MB e eu leio imagem de até 7,5 MB') }))
    })
    it('o PDF com senha (/Encrypt) recusa nomeado', () => {
        expect(conferirMidiaBaixada(pdf(), 'pdf', doPdf('trailer << /Encrypt 5 0 R >>'))).toEqual({ ok: false, motivo: 'pdf_com_senha', frase: 'Recebi o PDF “Obra.pdf”, mas ele está protegido por senha e eu não consigo abrir: mande o PDF sem senha, ou uma foto.' })
    })
    it('o que não é o que diz ser recusa: "PDF" que não é PDF, imagem que é PDF, imagem em formato não lido', () => {
        expect(conferirMidiaBaixada(pdf(), 'pdf', jpeg(10, 10))).toEqual(expect.objectContaining({ ok: false, motivo: 'arquivo_nao_confere', frase: expect.stringContaining('não abre como PDF') }))
        expect(conferirMidiaBaixada(midia(), 'imagem', doPdf('x'))).toEqual(expect.objectContaining({ ok: false, motivo: 'arquivo_nao_confere', frase: expect.stringContaining('não abre como imagem') }))
        expect(conferirMidiaBaixada(midia(), 'imagem', new Uint8Array(Buffer.from('\0\0\0\x18ftypheic', 'latin1')))).toEqual(expect.objectContaining({ ok: false, motivo: 'imagem_formato' }))
    })
    it('o arquivo vazio é falha ao baixar', () => {
        expect(conferirMidiaBaixada(midia(), 'imagem', new Uint8Array())).toEqual(expect.objectContaining({ ok: false, motivo: 'falhou_ao_baixar' }))
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(5) o que se grava e o que vai ao log: o MARCADOR, nunca o arquivo', () => {
    it('os marcadores', () => {
        expect(marcadorDaMidia(midia())).toBe('[imagem]')
        expect(marcadorDaMidia(pdf())).toBe('[documento: Obra.pdf]')
        expect(marcadorDaMidia(pdf({ nome: null }))).toBe('[documento]')
        expect(marcadorDaMidia(midia({ tipo: 'audio' }))).toBe('[áudio]')
        expect(marcadorDaMidia(midia({ tipo: 'video' }))).toBe('[vídeo]')
    })
    it('a entrada: o marcador e o texto (a legenda) depois dele', () => {
        expect(textoDaEntradaComMidia(midia(), 'janela 1,50 x 1,20')).toBe('[imagem] janela 1,50 x 1,20')
        expect(textoDaEntradaComMidia(pdf(), null)).toBe('[documento: Obra.pdf]')
    })
    it('a marca do log é só código: nem a legenda, nem o nome do arquivo', () => {
        const m = pdf({ legenda: 'segredo da legenda' })
        expect(marcaNoLog(m, 'lida', 'pdf')).toBe('pdf:lida')
        expect(marcaNoLog(m, 'pdf_com_senha')).toBe('documento:pdf_com_senha')
    })
    it('a recusa da API nomeia o limite de páginas no PDF, e a imagem pede outra foto', () => {
        expect(fraseDaMidiaRecusadaPelaIa(pdf())).toBe('Recebi o PDF “Obra.pdf”, mas o serviço de IA não conseguiu abrir o PDF (ele lê até 600 páginas, sem senha): mande só as páginas dos itens, ou uma foto.')
        expect(fraseDaMidiaRecusadaPelaIa(midia())).toBe('Recebi a sua foto, mas o serviço de IA não aceitou a imagem: mande outra foto, ou me escreva as medidas.')
    })
    it('toda frase de recusa diz o que chegou ("Recebi …")', () => {
        for (const motivo of ['audio', 'video', 'planilha', 'documento_nao_pdf', 'imagem_formato', 'imagem_grande', 'imagem_dimensao', 'pdf_grande', 'pdf_com_senha', 'arquivo_nao_confere', 'sem_dados_do_download', 'falhou_ao_baixar'] as const) {
            expect([motivo, fraseDaRecusa(pdf(), motivo, { bytes: 1, largura: 1, altura: 1 }).startsWith('Recebi o PDF “Obra.pdf”, mas ')]).toEqual([motivo, true])
        }
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(6) baixarMidia — POST /chat/downloadimage ou /chat/downloaddocument, com o token da conexão', () => {
    const TOKEN = 'orc_TOKEN_DA_CONEXAO_9f8e7d'
    let chamadas: Array<{ url: string; init: { headers: Record<string, string>; body: string } }>
    let resposta: { ok: boolean; status: number; json: () => Promise<unknown> } | 'lanca'
    beforeEach(() => {
        chamadas = []
        resposta = { ok: true, status: 200, json: async () => ({ code: 200, success: true, data: { Mimetype: 'image/jpeg', Data: `data:image/jpeg;base64,${Buffer.from('abc').toString('base64')}` } }) }
        ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
            chamadas.push({ url, init })
            if (resposta === 'lanca') throw new Error('fetch failed')
            return resposta
        })
    })

    it('a imagem: o endpoint da imagem, o token no header, o corpo com os campos do downloadImageStruct; devolve os bytes', async () => {
        const r = await baixarMidia(TOKEN, midia())
        expect(r).toEqual({ ok: true, bytes: new Uint8Array(Buffer.from('abc')) })
        expect(chamadas).toHaveLength(1)
        expect(chamadas[0].url).toMatch(/\/chat\/downloadimage$/)
        expect(chamadas[0].init.headers.token).toBe(TOKEN)
        expect(JSON.parse(chamadas[0].init.body)).toEqual({ Url: BYTES.URL, DirectPath: BYTES.directPath, MediaKey: BYTES.mediaKey, Mimetype: 'image/jpeg', FileEncSHA256: BYTES.fileEncSHA256, FileSHA256: BYTES.fileSHA256, FileLength: 1000 })
    })
    it('o documento (também a imagem mandada como documento) vai ao endpoint do documento', () => {
        expect(caminhoDoDownload(pdf())).toBe('/chat/downloaddocument')
        expect(caminhoDoDownload(midia({ tipo: 'documento', mimetype: 'image/png' }))).toBe('/chat/downloaddocument')
    })
    it('o WUZAPI que responde erro, o corpo sem arquivo e a exceção são falha nomeada — nunca lança', async () => {
        resposta = { ok: false, status: 500, json: async () => ({ error: 'failed to download image' }) }
        expect(await baixarMidia(TOKEN, midia())).toEqual({ ok: false, detalhe: 'status=500' })
        resposta = { ok: true, status: 200, json: async () => ({ data: { Data: 'sem prefixo' } }) }
        expect(await baixarMidia(TOKEN, midia())).toEqual({ ok: false, detalhe: 'corpo_sem_arquivo' })
        resposta = 'lanca'
        expect(await baixarMidia(TOKEN, midia())).toEqual({ ok: false, detalhe: 'excecao' })
    })
    it('sem os dados do download não chama o WUZAPI', async () => {
        expect(await baixarMidia(TOKEN, midia({ download: null }))).toEqual({ ok: false, detalhe: 'sem_dados' })
        expect(chamadas).toEqual([])
    })
    it('bytesDoDataUrl: só data URL em base64', () => {
        expect(bytesDoDataUrl('data:application/pdf;base64,JVBERg==')).toEqual(new Uint8Array(Buffer.from('%PDF')))
        for (const v of ['JVBERg==', 'data:text/plain,oi', 'data:x;base64,$$$', 42, null]) expect(bytesDoDataUrl(v)).toBeNull()
    })
})
