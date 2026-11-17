/**
 * A TARJA W.VETRO SAI DAS FIGURAS (dono do produto, 16/11/2026). As imagens daqui são SINTÉTICAS, com a forma medida na figura do item 3 do
 * orçamento 8: a faixa de 98 linhas no alto (12,25%), o meio no azul do degradê (128, 202, 255), a direita no azul da marca (13, 153, 255) e o
 * LOGO à esquerda (escuro) — foi o logo que derrubou a primeira versão, que lia o canto esquerdo como branco.
 */
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
import sharp from 'sharp'
import { alturaDaTarja, type Pixel } from '@/lib/atendimentos-ia/tarja-do-desenho'
import { semATarja } from '@/lib/atendimentos-ia/desenho-do-catalogo-servidor'

const MARCA: Pixel = [13, 153, 255, 255]
const DEGRADE: Pixel = [128, 202, 255, 255]
const BRANCO: Pixel = [252, 254, 255, 255]
const LOGO: Pixel = [20, 60, 110, 255]
const VIDRO: Pixel = [10, 140, 250, 255]
const TRANSPARENTE: Pixel = [0, 0, 0, 0]

/** Uma figura W × H: as `faixa` linhas do alto com a tarja (logo à esquerda nas linhas do meio da faixa); embaixo, o desenho. */
function figura(w: number, h: number, faixa: number) {
    return (x: number, y: number): Pixel => {
        if (y < faixa) {
            if (x < w * 0.25) return y > faixa * 0.2 && y < faixa * 0.7 ? LOGO : BRANCO
            return x >= w * 0.9 ? MARCA : DEGRADE
        }
        // o desenho: a moldura transparente e o vidro azul no meio (um azul que NÃO pode ser lido como tarja)
        return x > w * 0.1 && x < w * 0.9 ? VIDRO : TRANSPARENTE
    }
}

describe('alturaDaTarja', () => {
    it('a faixa medida no orçamento 8: 98 linhas de 800, mesmo com o LOGO no canto esquerdo', () => {
        expect(alturaDaTarja(800, 800, figura(800, 800, 98))).toBe(98)
    })
    it('sem faixa: zero (o desenho azul no topo não é tarja)', () => {
        expect(alturaDaTarja(800, 800, figura(800, 800, 0))).toBe(0)
        expect(alturaDaTarja(520, 468, () => VIDRO)).toBe(0)
    })
    it('fora dos limites, nada se corta: faixa de 2% (um traço) e de 30% (cortaria o desenho)', () => {
        expect(alturaDaTarja(800, 800, figura(800, 800, 16))).toBe(0)
        expect(alturaDaTarja(800, 800, figura(800, 800, 240))).toBe(0)
        expect(alturaDaTarja(800, 800, figura(800, 800, 32))).toBe(32)
        expect(alturaDaTarja(800, 800, figura(800, 800, 200))).toBe(200)
    })
    it('a faixa transparente (alfa baixo) não conta', () => {
        expect(alturaDaTarja(800, 800, (x, y) => { const p = figura(800, 800, 98)(x, y); return [p[0], p[1], p[2], y < 98 ? 100 : p[3]] })).toBe(0)
    })
    it('a BORDA: até 3 linhas azuladas logo abaixo da faixa saem junto; a 4ª não, e o desenho não é comido', () => {
        const comBorda = (n: number) => (x: number, y: number): Pixel => (y >= 98 && y < 98 + n && x >= 720 ? [120, 190, 255, 255] : figura(800, 800, 98)(x, y))
        expect(alturaDaTarja(800, 800, comBorda(1))).toBe(99)
        expect(alturaDaTarja(800, 800, comBorda(3))).toBe(101)
        expect(alturaDaTarja(800, 800, comBorda(6))).toBe(101)
    })
    it('sem dimensão, zero', () => {
        expect(alturaDaTarja(0, 800, figura(800, 800, 98))).toBe(0)
    })
})

async function imagem(w: number, h: number, faixa: number, formato: 'PNG' | 'JPEG'): Promise<Buffer> {
    const px = figura(w, h, faixa)
    const raw = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(px(x, y), (y * w + x) * 4)
    const s = sharp(raw, { raw: { width: w, height: h, channels: 4 } })
    return formato === 'PNG' ? s.png().toBuffer() : s.flatten({ background: '#ffffff' }).jpeg({ quality: 95 }).toBuffer()
}

describe('semATarja (no download da figura)', () => {
    it('a PNG com a faixa sai sem ela: 800 × 800 vira 800 × 702, no mesmo formato, e o topo agora é o desenho', async () => {
        const r = await semATarja(await imagem(800, 800, 98, 'PNG'), 'PNG')
        const m = await sharp(r).metadata()
        expect([m.format, m.width, m.height]).toEqual(['png', 800, 702])
        // a imagem cortada, lida de novo: a faixa não está mais lá, e a primeira linha é a do desenho (o vidro no meio)
        const { data, info } = await sharp(r).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        const px = (x: number, y: number): Pixel => { const i = (y * info.width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]] }
        expect(alturaDaTarja(info.width, info.height, px)).toBe(0)
        expect(px(400, 0)).toEqual(VIDRO)
    })
    it('a JPEG com a faixa também (o corte não depende do formato)', async () => {
        const r = await semATarja(await imagem(400, 400, 49, 'JPEG'), 'JPEG')
        const m = await sharp(r).metadata()
        expect([m.format, m.width, m.height]).toEqual(['jpeg', 400, 351])
    })
    it('sem a faixa, os BYTES voltam intactos (nada é reencodado)', async () => {
        const sem = await imagem(520, 468, 0, 'JPEG')
        expect(await semATarja(sem, 'JPEG')).toBe(sem)
    })
    it('a imagem que não se lê volta intacta: a falta de leitura não tira a figura do item', async () => {
        const lixo = Buffer.from('isto não é imagem')
        const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {})
        expect(await semATarja(lixo, 'PNG')).toBe(lixo)
        aviso.mockRestore()
    })
})
