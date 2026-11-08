/**
 * @jest-environment node
 *
 * PORTÃO — os AVISOS DA COLUNA COR na importação do arquivo do motor (dono do produto, 08/11/2026): o espaço duplo ou múltiplo, as duas
 * grafias que só diferem pelo espaçamento, e as duas que só diferem pela caixa. AVISO, nunca recusa e nunca normalização: o texto é
 * gravado como o fornecedor mandou.
 *
 * O CASO: o `Motor_Wolf_PVC_rev2026-11-05 (2).xlsx` (md5 cbebc09bd0b91fb1909b6eb85e886391 — o mesmo objeto do Storage que o motor
 * fdff3386 importou) traz, na aba "Motor por barra", três textos com espaço duplo — escritos assim no XML da planilha, medido em
 * 08/11/2026. `fixtures/cor-do-motor-wolff.json` são as colunas Código, Código WVetro e Cor das 12.116 regras dele, lidas do XML sem
 * biblioteca, guardadas como os 549 trios distintos com a contagem de cada um (no ARQUIVO, o md5 das 12.116 linhas "código|WVetro|cor",
 * na ordem dele, é 21e8a003592db5d41165abf9329fd7b5; a fixture não o reproduz, porque não guarda a ordem). O teste remonta a
 * aba com elas e passa o arquivo pelo MESMO leitor da importação (`lerArquivoDoMotor`) — o de ponta a ponta, não só a função.
 */
import ExcelJS from 'exceljs'
import { ABAS_DA_IMPORTACAO, avisosDaCorDoMotor, lerArquivoDoMotor, type Aviso, type ResultadoDoMotor } from '@/utils/atendimentos-ia-importacao'
import { textoDoAviso } from '@/utils/atendimentos-ia-importacao-apresentacao'
import { abasDoSpec } from './fixtures/abas-do-motor-do-spec'

/* eslint-disable @typescript-eslint/no-require-imports */
const REAL = require('./fixtures/cor-do-motor-wolff.json') as { regras: Array<[string, string, string, number]> }
/* eslint-enable @typescript-eslint/no-require-imports */

type Celulas = Record<number, ExcelJS.CellValue>
type Regra = { codigo: string; codigo_wvetro: string; cor: string }

/** As regras do arquivo real, uma por linha, na ordem da fixture. */
const REGRAS_REAIS: Regra[] = REAL.regras.flatMap(([codigo, codigo_wvetro, cor, n]) => Array.from({ length: n }, () => ({ codigo, codigo_wvetro, cor })))

/** O arquivo do motor: a aba "Motor por barra" com estas regras (A código, D cor, E WVetro, N tipologias), a das fórmulas e as nove do spec. */
async function arquivo(regras: Regra[]): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const abas: Record<string, Celulas[]> = {
        [ABAS_DA_IMPORTACAO.motor]: [{ 1: 'CÓDIGO', 14: 'TIPOLOGIAS' }, ...regras.map((r) => ({ 1: r.codigo, ...(r.cor === '' ? {} : { 4: r.cor }), 5: r.codigo_wvetro, 14: 'JC2F' }))],
        [ABAS_DA_IMPORTACAO.formulasDaLinha]: [{ 1: 'LINHA', 2: 'VARIÁVEL' }, { 1: 'PVC EUROPA 42', 2: 'HFOL', 3: 'altura', 4: '(H-10)', 7: 0.5 }],
        ...abasDoSpec(),
    }
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        linhas.forEach((celulas, i) => { for (const [col, valor] of Object.entries(celulas)) ws.getRow(i + 1).getCell(Number(col)).value = valor })
    }
    return new Uint8Array(await wb.xlsx.writeBuffer())
}

type Lido = Extract<ResultadoDoMotor, { ok: true }>
async function ler(regras: Regra[]): Promise<Lido> {
    const r = await lerArquivoDoMotor({ nome: 'Motor_Wolf_PVC_rev2026-11-05 (2).xlsx', bytes: await arquivo(regras) })
    if (r.ok === false) throw new Error(`recusado: ${(r as { erro: string }).erro}`)
    return r as Lido
}
const daCor = (avisos: Aviso[]) => avisos.filter((a) => a.tipo.startsWith('cor_'))

describe('(1) o arquivo real da Wolff: os três textos de espaço duplo e o par de grafias aparecem no aviso', () => {
    let lido: Lido
    beforeAll(async () => { lido = await ler(REGRAS_REAIS) }, 60_000)

    it('as 12.116 regras são lidas, e NENHUM texto é normalizado: as cores com espaço duplo são gravadas como vieram', () => {
        expect(lido.regras).toHaveLength(12116)
        const contagem = (cor: string) => lido.regras.filter((r) => r.cor === cor).length
        expect([contagem('LAMINADO  PRETO LISO'), contagem('LAM EXTERNO  GOLDEN OAK'), contagem('SF106  AÇO GALVANIZADO (Z275) (PE630-1)'), contagem('LAMINADO PRETO LISO')])
            .toEqual([16, 6, 16, 699])
    })

    it('ESPAÇO MÚLTIPLO: um aviso por texto, com o texto, as regras e os perfis — SF66 (96836), KT16 (KT6519) e o SF106', () => {
        const multiplos = lido.avisos.filter((a): a is Extract<Aviso, { tipo: 'cor_com_espaco_multiplo' }> => a.tipo === 'cor_com_espaco_multiplo')
        expect(multiplos.map((a) => a.grafia)).toEqual([
            { texto: 'LAM EXTERNO  GOLDEN OAK', regras: 6, perfis: ['KT16/WOLFF (KT6519)'] },
            { texto: 'LAMINADO  PRETO LISO', regras: 16, perfis: ['SF66/WOLFF (96836)'] },
            { texto: 'SF106  AÇO GALVANIZADO (Z275) (PE630-1)', regras: 16, perfis: expect.any(Array) },
        ])
        expect(multiplos[1].mensagem).toBe('A cor "LAMINADO  PRETO LISO" tem 2 espaços depois de "LAMINADO", em 16 regra(s), dos perfis SF66/WOLFF (96836). O texto foi gravado como veio; se for erro de digitação, corrija no arquivo e suba de novo.')
        expect(multiplos[0].mensagem).toContain('tem 2 espaços depois de "EXTERNO", em 6 regra(s), dos perfis KT16/WOLFF (KT6519).')
        expect(multiplos[2].mensagem).toContain('tem 2 espaços depois de "SF106", em 16 regra(s)')
        expect(multiplos[2].grafia.perfis.length).toBeGreaterThan(0)
    })

    it('GRAFIAS DE ESPAÇAMENTO: "LAMINADO PRETO LISO" (699) ao lado de "LAMINADO  PRETO LISO" (16) — um aviso, as duas grafias', () => {
        const pares = lido.avisos.filter((a): a is Extract<Aviso, { tipo: 'cor_em_grafias_de_espacamento' }> => a.tipo === 'cor_em_grafias_de_espacamento')
        expect(pares.map((a) => a.grafias.map((g) => [g.texto, g.regras]))).toEqual([[['LAMINADO  PRETO LISO', 16], ['LAMINADO PRETO LISO', 699]]])
        expect(pares[0].grafias[1].perfis).toHaveLength(25)
        // 25 perfis: dez nomeados e o resto contado, nunca calado
        expect(pares[0].mensagem).toContain('e mais 15')
        expect(pares[0].mensagem).toContain('"LAMINADO  PRETO LISO" (2 espaços depois de "LAMINADO"): 16 regra(s), perfis SF66/WOLFF (96836)')
    })

    it('GRAFIAS DE CAIXA: nenhuma no arquivo real (todas as cores em maiúscula) — e são só esses 4 avisos de cor', () => {
        expect(daCor(lido.avisos).map((a) => a.tipo)).toEqual(['cor_com_espaco_multiplo', 'cor_com_espaco_multiplo', 'cor_com_espaco_multiplo', 'cor_em_grafias_de_espacamento'])
    })
})

describe('(2) o arquivo limpo não gera aviso nenhum', () => {
    it('o arquivo real com os três textos corrigidos perde EXATAMENTE os 4 avisos de cor — e os outros (o código "1027,1", de antes) ficam iguais', async () => {
        const sujo = await ler(REGRAS_REAIS)
        const corrigido = await ler(REGRAS_REAIS.map((r) => ({ ...r, cor: r.cor.replace(/\s{2,}/g, ' ') })))
        expect(daCor(corrigido.avisos)).toEqual([])
        expect(daCor(sujo.avisos)).toHaveLength(4)
        expect(corrigido.avisos).toEqual(sujo.avisos.filter((a) => !a.tipo.startsWith('cor_')))
        expect(corrigido.regras.filter((r) => r.cor === 'LAMINADO PRETO LISO')).toHaveLength(715)
    }, 60_000)

    it('um arquivo limpo, com várias cores e perfis, não gera aviso nenhum', async () => {
        const lido = await ler([
            { codigo: '9641', codigo_wvetro: 'HF88/WOLFF', cor: 'BRANCO' }, { codigo: '96436', codigo_wvetro: 'HF88/WOLFF', cor: 'LAMINADO PRETO LISO' },
            { codigo: '9691', codigo_wvetro: 'SF92/WOLFF', cor: 'BRANCO' }, { codigo: '96920', codigo_wvetro: 'SF92/WOLFF', cor: 'LAMINADO PRETO TEXTURADO' },
            { codigo: '1023', codigo_wvetro: '1023/WOLFF', cor: '' },
        ])
        expect(lido.avisos).toEqual([])
    })
})

describe('(3) a regra, caso a caso', () => {
    const r = (codigo: string, codigo_wvetro: string, cor: string | null) => ({ codigo, codigo_wvetro, cor })

    it('GRAFIAS DE CAIXA: BRANCO e Branco na mesma coluna — um aviso, nomeando as duas e o que o levantamento faz com elas', () => {
        const avisos = avisosDaCorDoMotor([r('X1', 'X/WOLFF', 'BRANCO'), r('X2', 'X/WOLFF', 'Branco'), r('Y1', 'Y/WOLFF', 'BRANCO'), r('Z1', 'Z/WOLFF', 'PRETO')])
        expect(avisos).toEqual([{
            tipo: 'cor_em_grafias_de_caixa', aba: ABAS_DA_IMPORTACAO.motor,
            grafias: [{ texto: 'BRANCO', regras: 2, perfis: ['X/WOLFF (X1)', 'Y/WOLFF (Y1)'] }, { texto: 'Branco', regras: 1, perfis: ['X/WOLFF (X2)'] }],
            mensagem: 'A coluna Cor tem a mesma cor escrita com maiúsculas e minúsculas diferentes — "BRANCO": 2 regra(s), perfis X/WOLFF (X1), Y/WOLFF (Y1); "Branco": 1 regra(s), perfis X/WOLFF (X2). O levantamento compara a cor sem caixa e RECUSA o perfil que tiver as duas, sem escolher uma. Os textos foram gravados como vieram; corrija no arquivo e suba de novo.',
        }])
    })

    it('ESPAÇO MÚLTIPLO de três ou mais, e em dois lugares: cada sequência é nomeada', () => {
        const [a] = avisosDaCorDoMotor([r('A', 'A/W', 'LAM   EXTERNO  NOGUEIRA')])
        expect(a.mensagem).toContain('tem 3 espaços depois de "LAM" e 2 espaços depois de "EXTERNO"')
    })

    it('a tabulação e o espaço não separável contam como espaçamento: "PRETO\\tLISO" e "PRETO\\u00a0LISO" ao lado de "PRETO LISO"', () => {
        const avisos = avisosDaCorDoMotor([r('A', 'A/W', 'PRETO LISO'), r('B', 'B/W', 'PRETO\tLISO'), r('C', 'C/W', 'PRETO\u00a0LISO')])
        expect(avisos.map((x) => x.tipo)).toEqual(['cor_em_grafias_de_espacamento'])
        expect((avisos[0] as Extract<Aviso, { tipo: 'cor_em_grafias_de_espacamento' }>).grafias.map((g) => g.texto)).toEqual(['PRETO\tLISO', 'PRETO LISO', 'PRETO\u00a0LISO'])
    })

    it('NÃO é aviso: cores diferentes de verdade, um espaço só, a cor vazia, e "PRETO" ao lado de "PRETO LISO"', () => {
        expect(avisosDaCorDoMotor([r('A', 'A/W', 'PRETO'), r('B', 'B/W', 'PRETO LISO'), r('C', 'C/W', null), r('D', 'D/W', 'LAMINADO PRETO LISO'), r('E', 'E/W', 'BRANCO')])).toEqual([])
    })

    it('o mesmo código em várias regras conta as regras, mas aparece uma vez no perfil', () => {
        const [a] = avisosDaCorDoMotor([r('96836', 'SF66/WOLFF', 'LAMINADO  PRETO LISO'), r('96836', 'SF66/WOLFF', 'LAMINADO  PRETO LISO'), r('96837', 'SF66/WOLFF', 'LAMINADO  PRETO LISO')])
        expect(a.tipo === 'cor_com_espaco_multiplo' && a.grafia).toEqual({ texto: 'LAMINADO  PRETO LISO', regras: 3, perfis: ['SF66/WOLFF (96836, 96837)'] })
    })

    it('na tela: o título em língua de gente, e o texto é a mensagem — o tipo interno nunca aparece', () => {
        const avisos = avisosDaCorDoMotor([r('A', 'A/W', 'X  Y'), r('B', 'B/W', 'X Y'), r('C', 'C/W', 'x y')])
        expect(avisos.map((a) => textoDoAviso(a).titulo)).toEqual(['Cor com espaço duplo', 'A mesma cor com espaçamentos diferentes', 'A mesma cor com maiúsculas e minúsculas diferentes'])
        for (const a of avisos) {
            expect(textoDoAviso(a).texto).toBe(a.mensagem)
            expect(textoDoAviso(a).texto).not.toContain(a.tipo)
        }
    })
})
