/**
 * @jest-environment node
 *
 * A FOLHA DO LEVANTAMENTO (`folha-do-levantamento.ts`) — o arquivo A4 que o agente envia. Isolado do WhatsApp: os dados entram prontos, o PDF sai.
 * Especificação normativa do dono do produto, 06/11/2026 (no cabeçalho do módulo); o desenho, decidido em 06/11/2026: "Contorno + folhas da descrição",
 * os módulos "N"/"V" pelas variáveis respondidas, a bandeira e o peitoril na altura dita, e nada inventado.
 *
 * O exemplo renderizado mora em `docs/levantamento/` e é conferido aqui byte a byte. Para regravá-lo depois de uma mudança de propósito:
 *   ATUALIZAR_EXEMPLO_DA_FOLHA=1 npx jest src/utils/__tests__/folha-do-levantamento.test.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
    ALTURA_DA_FAIXA, COLUNAS, FOLHA, conferirFolha, dataCurta, desenhoDaTipologia, gerarFolhaDoLevantamento, linhaDasVariaveis, linhaDosAmbientes,
    nomeDoArquivo, paginar, percentual, planoDaFolha, rodape, tracosDoDesenho, variavelNaFolha,
    type AlturasDaFolha, type DadosDaFolha, type ItemDaFolha, type VariavelDita,
} from '@/lib/atendimentos-ia/folha-do-levantamento'
import { FOLHA_DE_EXEMPLO, ITENS_DE_EXEMPLO } from './fixtures/folha-de-exemplo'
import DESCRICOES from './fixtures/descricoes-do-motor-wolff.json'

const EXEMPLO = join(process.cwd(), 'docs/levantamento/exemplo-levantamento.pdf')
const BANDEIRA = 'ALTURA DA BANDEIRA'
const PEITORIL = 'ALTURA DO PEITORIL'
const dita = (variavel: string, descricao: string, valor: number, semPadrao = true): VariavelDita => ({ variavel, descricao, valor, semPadrao })
const descricaoDe = (t: string) => (DESCRICOES as Array<[string, string]>).find(([c]) => c === t)![1]
const item = (o: Partial<ItemDaFolha> = {}): ItemDaFolha => ({
    ordem: 1, tipologia: 'DP-02', descricao: descricaoDe('DP-02'), linha: 'PVC WOLFF EUROPA 42', quantidade: 1, largura_mm: 1500, altura_mm: 1200,
    variaveis: [], perfil: 'Cor do perfil: branco', acessorioEVidro: 'Vidro: 4 mm', ambientes: null, obs: null, ...o,
})
const dados = (o: Partial<DadosDaFolha> = {}): DadosDaFolha => ({ ...FOLHA_DE_EXEMPLO, ...o })
/** O texto do PDF (jsPDF sem compressão escreve o texto em Latin-1 nos fluxos de conteúdo). */
const textoDoPdf = (pdf: Uint8Array) => Buffer.from(pdf).toString('latin1')

describe('(I) o desenho da tipologia — contorno + folhas da descrição, módulos e faixas pelas variáveis respondidas, nada inventado', () => {
    it('DP-02 (02 folhas, n_vidros = 1 no motor): duas colunas, sem faixa — as folhas vêm da descrição, nunca do n_vidros', () => {
        expect(desenhoDaTipologia(item())).toEqual({ largura_mm: 1500, altura_mm: 1200, colunas: 2, linhas: null, bandeira_mm: null, peitoril_mm: null })
    })

    it('DP-04 com a AF respondida: a faixa da bandeira na altura dita; sem a AF, nenhuma faixa (a descrição diz QUE existe, a variável diz QUANTO)', () => {
        const dp04 = { descricao: descricaoDe('DP-04'), largura_mm: 2000, altura_mm: 1600 }
        expect(desenhoDaTipologia({ ...dp04, variaveis: [dita('AF', BANDEIRA, 400)] })).toMatchObject({ colunas: 2, bandeira_mm: 400, peitoril_mm: null })
        expect(desenhoDaTipologia({ ...dp04, variaveis: [] })).toMatchObject({ colunas: 2, bandeira_mm: null, peitoril_mm: null })
    })

    it('DP-129 ("N" módulos) com N respondida: N colunas e a bandeira; sem N, só o contorno e a bandeira — nunca um número chutado', () => {
        const dp129 = { descricao: descricaoDe('DP-129'), largura_mm: 1800, altura_mm: 900 }
        expect(desenhoDaTipologia({ ...dp129, variaveis: [dita('N', 'QUANTIDADE DE MÓDULOS HORIZONTAIS', 3, false), dita('AF', BANDEIRA, 300)] }))
            .toEqual({ largura_mm: 1800, altura_mm: 900, colunas: 3, linhas: null, bandeira_mm: 300, peitoril_mm: null })
        expect(desenhoDaTipologia({ ...dp129, variaveis: [dita('AF', BANDEIRA, 300)] })).toMatchObject({ colunas: null, linhas: null, bandeira_mm: 300 })
        // zero não é resposta: só o contorno
        expect(desenhoDaTipologia({ ...dp129, variaveis: [dita('N', 'QUANTIDADE DE MÓDULOS HORIZONTAIS', 0, false), dita('AF', BANDEIRA, 300)] })).toMatchObject({ colunas: null })
    })

    it('o número fixo da descrição vale como está; a letra entre aspas é o código da variável ("V" → V)', () => {
        const dp133 = { descricao: descricaoDe('DP-133'), largura_mm: 900, altura_mm: 1800 }
        expect(desenhoDaTipologia({ ...dp133, variaveis: [dita('V', 'QUANTIDADE DE MÓDULOS VERTICAIS', 3, false)] })).toMatchObject({ colunas: 1, linhas: 3 })
        expect(desenhoDaTipologia({ ...dp133, variaveis: [dita('N', 'QUANTIDADE DE MÓDULOS HORIZONTAIS', 3, false)] })).toMatchObject({ colunas: 1, linhas: null })
        const dp138 = { descricao: descricaoDe('DP-138'), largura_mm: 1800, altura_mm: 1800 }
        expect(desenhoDaTipologia({ ...dp138, variaveis: [] })).toMatchObject({ colunas: null, linhas: 3 })
        const dp146 = { descricao: descricaoDe('DP-146'), largura_mm: 1800, altura_mm: 1800 }
        expect(desenhoDaTipologia({ ...dp146, variaveis: [dita('N', 'QUANTIDADE DE MÓDULOS HZ', 2, false)] })).toMatchObject({ colunas: 2, linhas: 2 })
    })

    it('uma descrição sem folhas nem módulos, e sem variável que os dê: só o contorno proporcional, nenhuma divisão', () => {
        const d = desenhoDaTipologia({ descricao: 'VITRÔ BASCULANTE | LINHA X', largura_mm: 600, altura_mm: 400, variaveis: [dita('N', 'QUANTIDADE', 3, false)] })
        expect(d).toEqual({ largura_mm: 600, altura_mm: 400, colunas: null, linhas: null, bandeira_mm: null, peitoril_mm: null })
        expect(tracosDoDesenho(d, { x: 0, y: 0, w: 28, h: 24 }).divisoes).toEqual([])
    })

    it('a mesma sigla muda de sentido: a AF "altura do peitoril" da DP-05 é peitoril, e a variável de bandeira sem BANDEIRA na descrição não desenha', () => {
        expect(desenhoDaTipologia({ descricao: descricaoDe('DP-05'), largura_mm: 1200, altura_mm: 1500, variaveis: [dita('AF', PEITORIL, 500)] }))
            .toMatchObject({ bandeira_mm: null, peitoril_mm: 500 })
        expect(desenhoDaTipologia({ descricao: descricaoDe('DP-02'), largura_mm: 1200, altura_mm: 1500, variaveis: [dita('AF', BANDEIRA, 500)] }))
            .toMatchObject({ bandeira_mm: null, peitoril_mm: null })
        expect(desenhoDaTipologia({ descricao: descricaoDe('DP-06'), largura_mm: 1200, altura_mm: 2000, variaveis: [dita('B', BANDEIRA, 300), dita('P', PEITORIL, 600)] }))
            .toMatchObject({ bandeira_mm: 300, peitoril_mm: 600 })
    })

    it('a medição do dono do produto sobre as 164 descrições do motor: 141 com folhas, 26 com BANDEIRA, 19 com PEITORIL, 15 com número de módulos e 8 só com "N"/"V"', () => {
        const ds = (DESCRICOES as Array<[string, string]>).map(([, d]) => d)
        expect(ds).toHaveLength(164)
        const comFolhas = ds.filter((d) => desenhoDaTipologia({ descricao: d, largura_mm: 1000, altura_mm: 1000, variaveis: [] }).colunas !== null && /FOLHA/.test(d))
        expect(comFolhas).toHaveLength(141)
        expect(ds.filter((d) => /\bBANDEIRA\b/.test(d))).toHaveLength(26)
        expect(ds.filter((d) => /\bPEITORIL\b/.test(d))).toHaveLength(19)
        const modulos = ds.filter((d) => !/FOLHA/.test(d))
        const fixo = (d: string) => { const x = desenhoDaTipologia({ descricao: d, largura_mm: 1000, altura_mm: 1000, variaveis: [] }); return x.colunas !== null || x.linhas !== null }
        expect(modulos.filter(fixo)).toHaveLength(15)
        expect(modulos.filter((d) => !fixo(d))).toHaveLength(8)
        // as 8: nenhuma divisão sem a variável respondida, e todas as divisões com N e V respondidos
        const nv = [dita('N', 'N', 2, false), dita('V', 'V', 2, false)]
        for (const d of modulos.filter((x) => !fixo(x))) {
            const x = desenhoDaTipologia({ descricao: d, largura_mm: 1000, altura_mm: 1000, variaveis: nv })
            expect(x.colunas === 2 || x.linhas === 2).toBe(true)
        }
    })

    it('a proporção é a real: a porta é estreita e alta, o maxim-ar é deitado, e a faixa da bandeira fica na altura proporcional à dita', () => {
        const caixa = { x: 10, y: 20, w: 28, h: 24 }
        const porta = tracosDoDesenho(desenhoDaTipologia({ descricao: descricaoDe('DP-165'), largura_mm: 900, altura_mm: 2100, variaveis: [] }), caixa)
        expect(porta.contorno.w / porta.contorno.h).toBeCloseTo(900 / 2100, 6)
        expect(porta.contorno.h).toBeCloseTo(24, 6)
        const maxim = tracosDoDesenho(desenhoDaTipologia({ descricao: descricaoDe('DP-129'), largura_mm: 1800, altura_mm: 900, variaveis: [dita('N', 'N', 3, false), dita('AF', BANDEIRA, 300)] }), caixa)
        expect(maxim.contorno.w / maxim.contorno.h).toBeCloseTo(2, 6)
        expect(maxim.contorno.w).toBeCloseTo(28, 6)
        const [bandeira, ...verticais] = maxim.divisoes
        expect(bandeira[1] - maxim.contorno.y).toBeCloseTo(maxim.contorno.h * (300 / 900), 6)
        expect(verticais).toHaveLength(2)
        // as folhas dividem só o que fica abaixo da bandeira
        for (const [x1, y1, x2, y2] of verticais) { expect(x1).toBeCloseTo(x2, 6); expect(y1).toBeCloseTo(bandeira[1], 6); expect(y2).toBeCloseTo(maxim.contorno.y + maxim.contorno.h, 6) }
        expect(verticais.map(([x]) => x - maxim.contorno.x)).toEqual([maxim.contorno.w / 3, (2 * maxim.contorno.w) / 3].map((v) => expect.closeTo(v, 6)))
    })
})

describe('(II) a conferência antes de produzir — recusa nomeada, nunca uma folha aproximada', () => {
    it('o exemplo passa sem recusa', () => {
        expect(conferirFolha(FOLHA_DE_EXEMPLO)).toEqual([])
    })

    it('a soma dos ambientes não fecha com a quantidade do item: recusa nomeando o item, os ambientes, a soma e a quantidade', () => {
        const d = dados({ itens: [item({ quantidade: 4, ambientes: [{ ambiente: 'Cozinha', quantidade: 1 }, { ambiente: 'Sala', quantidade: 2 }] })] })
        expect(conferirFolha(d)).toEqual(['Item 1 (DP-02): a soma dos ambientes (Cozinha 1 · Sala 2 = 3) não fecha com a quantidade do item (4). Corrija os ambientes ou a quantidade.'])
        const r = gerarFolhaDoLevantamento(d)
        expect(r.ok).toBe(false)
        const fecha = dados({ itens: [item({ quantidade: 3, ambientes: [{ ambiente: 'Cozinha', quantidade: 1 }, { ambiente: 'Sala', quantidade: 2 }] })] })
        expect(conferirFolha(fecha)).toEqual([])
    })

    it('ambientes não informados não são recusa: a linha sai em branco (nunca um ambiente padrão)', () => {
        expect(conferirFolha(dados({ itens: [item({ ambientes: null })] }))).toEqual([])
        expect(linhaDosAmbientes(item({ ambientes: null }))).toBe('')
        expect(conferirFolha(dados({ itens: [item({ quantidade: 2, ambientes: [{ ambiente: 'Sala', quantidade: 0 }, { ambiente: 'Sala 2', quantidade: 2 }] })] })))
            .toEqual(['Item 1 (DP-02): todo ambiente precisa de nome e de quantidade inteira maior que zero.'])
    })

    it('os percentuais e o modo faltando são recusa que os nomeia; o responsável pela RT em branco NÃO é recusa', () => {
        const d = dados({ condicoes: { vendedor: 'V', comissaoPercentual: null, comissaoModo: null, rtResponsavel: null, rtPercentual: null, lucroPercentual: null } })
        expect(conferirFolha(d)).toEqual(['Faltam, nas condições comerciais: a comissão (%), o modo da comissão, a reserva técnica (%), o lucro projetado (%).'])
        expect(conferirFolha(dados({ condicoes: { ...FOLHA_DE_EXEMPLO.condicoes, rtResponsavel: null } }))).toEqual([])
        expect(conferirFolha(dados({ condicoes: { ...FOLHA_DE_EXEMPLO.condicoes, comissaoPercentual: 0, rtPercentual: 0, lucroPercentual: 0 } }))).toEqual([])
        expect(conferirFolha(dados({ condicoes: { ...FOLHA_DE_EXEMPLO.condicoes, lucroPercentual: 100.5 } }))).toEqual(['Faltam, nas condições comerciais: o lucro projetado (%).'])
        expect(conferirFolha(dados({ condicoes: { ...FOLHA_DE_EXEMPLO.condicoes, rtPercentual: -1 } }))).toEqual(['Faltam, nas condições comerciais: a reserva técnica (%).'])
        expect(conferirFolha(dados({ condicoes: { ...FOLHA_DE_EXEMPLO.condicoes, comissaoPercentual: 100 } }))).toEqual([])
        expect(conferirFolha(dados({ condicoes: { ...FOLHA_DE_EXEMPLO.condicoes, vendedor: null } }))).toEqual(['Falta o vendedor do levantamento.'])
    })

    it('valor em reais nunca entra: o símbolo em qualquer texto é recusa nomeando onde; "Av. Real" e "mil" não são dinheiro', () => {
        expect(conferirFolha(dados({ itens: [item({ obs: 'cliente pagou R$ 500 de sinal' })] })))
            .toEqual(['Item 1 (DP-02), a obs traz valor em dinheiro ("cliente pagou R$ 500 de sinal"), e o levantamento nunca traz valor em reais.'])
        expect(conferirFolha(dados({ cliente: { ...FOLHA_DE_EXEMPLO.cliente, endereco: 'Av. Real, mil e cem' } }))).toEqual([])
        expect(conferirFolha(dados({ preDefinicoes: [{ rotulo: 'Vedação', valor: 'r$ 10' }] }))).toHaveLength(1)
    })

    it('a bandeira e o peitoril que não cabem na altura do item são recusa (o desenho nunca sai errado)', () => {
        const d = dados({ itens: [item({ tipologia: 'DP-06', descricao: descricaoDe('DP-06'), altura_mm: 900, variaveis: [dita('B', BANDEIRA, 400), dita('P', PEITORIL, 500)] })] })
        expect(conferirFolha(d)).toEqual(['Item 1 (DP-06): a bandeira (400 mm) e o peitoril (500 mm) não cabem na altura do item (900 mm).'])
        const so = dados({ itens: [item({ tipologia: 'DP-04', descricao: descricaoDe('DP-04'), altura_mm: 400, variaveis: [dita('AF', BANDEIRA, 400)] })] })
        expect(conferirFolha(so)).toEqual(['Item 1 (DP-04): a bandeira (400 mm) não cabe na altura do item (400 mm).'])
    })

    it('o item sem medida, sem quantidade ou sem tipologia, e o levantamento sem item, são recusas', () => {
        expect(conferirFolha(dados({ itens: [item({ largura_mm: 0, quantidade: 1.5 })] }))).toEqual(['Item 1 (DP-02): falta a quantidade, a largura.'])
        expect(conferirFolha(dados({ itens: [] }))).toEqual(['O levantamento não tem nenhum item.'])
        expect(conferirFolha(dados({ numero: 0 }))).toEqual(['Falta o número do levantamento.'])
        expect(conferirFolha(dados({ cliente: { ...FOLHA_DE_EXEMPLO.cliente, dataEntrega: '2027-02-31' } }))).toEqual(['A data de entrega "2027-02-31" não é uma data.'])
    })
})

describe('(III) a paginação — a folha enche antes de virar, o item não se parte, o fecho sai inteiro na última', () => {
    const base: AlturasDaFolha = { util: 100, cliente: 20, cabecalhoDasColunas: 5, itens: [], fecho: 30 }

    it('enche antes de virar: em cada virada, o próximo item não cabia no que sobrava', () => {
        const a = { ...base, itens: [30, 30, 30, 30, 30, 30] }
        const r = paginar(a)
        if ('recusa' in r) throw new Error(r.recusa)
        expect(r.paginas.map((p) => p.itens)).toEqual([[0, 1], [2, 3, 4], [5]])
        // a sobra da 1ª era 100 − 20 − 5 − 60 = 15 < 30; a da 2ª, 100 − 5 − 90 = 5 < 30
        let livre = a.util - a.cliente
        for (const p of r.paginas) {
            const usado = p.itens.reduce((s, i) => s + a.itens[i], 0) + (p.itens.length ? a.cabecalhoDasColunas : 0)
            livre -= usado
            const proximo = p.itens.length ? p.itens[p.itens.length - 1] + 1 : null
            if (proximo !== null && proximo < a.itens.length && p !== r.paginas[r.paginas.length - 1]) expect(livre).toBeLessThan(a.itens[proximo])
            livre = a.util
        }
    })

    it('um item nunca começa numa folha e termina na outra: cada item numa folha só, na ordem', () => {
        const r = paginar({ ...base, itens: [40, 55, 10, 70, 25, 25, 25] })
        if ('recusa' in r) throw new Error(r.recusa)
        const todos = r.paginas.flatMap((p) => p.itens)
        expect(todos).toEqual([0, 1, 2, 3, 4, 5, 6])
    })

    it('o fecho sai inteiro na ÚLTIMA folha: na corrente se cabe; senão, numa folha só dele — e uma vez só', () => {
        const cabe = paginar({ ...base, itens: [20], fecho: 30 })
        if ('recusa' in cabe) throw new Error(cabe.recusa)
        expect(cabe.paginas).toEqual([{ cliente: true, itens: [0], fecho: true }])
        const naoCabe = paginar({ ...base, itens: [20, 20], fecho: 31 })
        if ('recusa' in naoCabe) throw new Error(naoCabe.recusa)
        // 100 − 20 − 5 − 40 = 35 ≥ 31 → cabe; com fecho 36 não cabe
        expect(naoCabe.paginas.map((p) => p.fecho)).toEqual([true])
        const vira = paginar({ ...base, itens: [20, 20], fecho: 36 })
        if ('recusa' in vira) throw new Error(vira.recusa)
        expect(vira.paginas).toEqual([{ cliente: true, itens: [0, 1], fecho: false }, { cliente: false, itens: [], fecho: true }])
    })

    it('o cliente só na primeira folha; o cabeçalho das colunas conta em toda folha que tem item', () => {
        const r = paginar({ ...base, itens: [70, 70], fecho: 10 })
        if ('recusa' in r) throw new Error(r.recusa)
        // 1ª: 100 − 20 = 80 ≥ 70 + 5; 2ª: o segundo item; sobra 100 − 75 = 25 ≥ 10
        expect(r.paginas).toEqual([{ cliente: true, itens: [0], fecho: false }, { cliente: false, itens: [1], fecho: true }])
        // sem contar o cabeçalho, 76 caberia em 80; com ele (81), não
        const justo = paginar({ ...base, itens: [76], fecho: 10 })
        if ('recusa' in justo) throw new Error(justo.recusa)
        expect(justo.paginas[0].itens).toEqual([])
        expect(justo.paginas[1].itens).toEqual([0])
    })

    it('o que não cabe numa folha inteira é recusa, nunca partido', () => {
        expect(paginar({ ...base, itens: [96] })).toEqual({ recusa: 'O item 1 não cabe numa folha inteira.' })
        expect(paginar({ ...base, itens: [10], fecho: 101 })).toEqual({ recusa: 'O fecho não cabe numa folha inteira.' })
    })

    it('com as medidas reais do desenho: 40 itens dão várias folhas, o fecho só na última, e nenhuma folha passa do espaço útil', () => {
        const muitos = Array.from({ length: 40 }, (_, k) => ({ ...ITENS_DE_EXEMPLO[k % ITENS_DE_EXEMPLO.length], ordem: k + 1 }))
        const p = planoDaFolha(dados({ itens: muitos }))
        if ('recusa' in p) throw new Error(p.recusa)
        expect(p.paginas.length).toBeGreaterThan(3)
        expect(p.paginas.filter((x) => x.fecho)).toHaveLength(1)
        expect(p.paginas[p.paginas.length - 1].fecho).toBe(true)
        expect(p.paginas.filter((x) => x.cliente)).toHaveLength(1)
        for (const [k, pg] of p.paginas.entries()) {
            const usado = (pg.cliente ? p.alturas.cliente : 0) + (pg.itens.length ? p.alturas.cabecalhoDasColunas : 0)
                + pg.itens.reduce((s, i) => s + p.alturas.itens[i], 0) + (pg.fecho ? p.alturas.fecho : 0)
            expect(usado).toBeLessThanOrEqual(p.alturas.util + 1e-9)
            // enche antes de virar: o primeiro item da folha seguinte não cabia nesta
            const seguinte = p.paginas[k + 1]
            if (seguinte && seguinte.itens.length) expect(usado + p.alturas.itens[seguinte.itens[0]] + (pg.itens.length ? 0 : p.alturas.cabecalhoDasColunas)).toBeGreaterThan(p.alturas.util)
        }
        // toda faixa de item tem a mesma altura, qualquer que seja a tipologia: a diferença entre os itens é só das linhas de baixo
        expect(ALTURA_DA_FAIXA).toBe(30)
        expect(Object.values(COLUNAS).reduce((s, w) => s + w, 0)).toBe(FOLHA.largura - 2 * FOLHA.margem)
    })
})

describe('(IV) o que a folha escreve', () => {
    it('a linha VARIÁVEIS: só as sem padrão respondidas, "descrição + valor" separados por " · ", "mm" só na medida; sem nenhuma, a linha não existe', () => {
        expect(linhaDasVariaveis({ variaveis: [dita('AF', BANDEIRA, 400), dita('MB', 'MÓDULOS DA BANDEIRA', 1), dita('N', 'QUANTIDADE DE MÓDULOS HORIZONTAIS', 3, false)] }))
            .toBe('Altura da bandeira 400 mm · Módulos da bandeira 1')
        expect(linhaDasVariaveis({ variaveis: [dita('N', 'QUANTIDADE DE MÓDULOS HORIZONTAIS', 3, false)] })).toBeNull()
        expect(linhaDasVariaveis({ variaveis: [] })).toBeNull()
        expect(variavelNaFolha({ descricao: 'ALTURA DO PEITORIL', valor: 1200 })).toBe('Altura do peitoril 1.200 mm')
    })

    it('o rodapé: "Levantamento N · X itens · Y peças · gerado em dd/mm/aaaa às hh:mm", no fuso de São Paulo, com singular', () => {
        expect(rodape(FOLHA_DE_EXEMPLO)).toBe('Levantamento 6 · 7 itens · 10 peças · gerado em 06/11/2026 às 14:30')
        expect(rodape({ numero: 1, itens: [item()], geradoEm: new Date(Date.UTC(2026, 0, 1, 2, 5)) })).toBe('Levantamento 1 · 1 item · 1 peça · gerado em 31/12/2025 às 23:05')
    })

    it('a data de entrega dd/mm/aa, o percentual com vírgula, o nome do arquivo sem caractere proibido', () => {
        expect(dataCurta('2026-11-27')).toBe('27/11/26')
        expect(dataCurta('2027-02-04')).toBe('04/02/27')
        expect(dataCurta('27/11/26')).toBeNull()
        expect(percentual(5)).toBe('5%')
        expect(percentual(1.5)).toBe('1,5%')
        expect(nomeDoArquivo({ numero: 6, cliente: { ...FOLHA_DE_EXEMPLO.cliente, nome: 'Ana / Obra: "Centro"' } })).toBe('Levantamento 6 - Ana Obra Centro.pdf')
    })

    it('o PDF: A4 retrato, as folhas do plano, o cabeçalho com "Página X de Y" e o número em toda folha, o cliente e o fecho uma vez', () => {
        const muitos = Array.from({ length: 12 }, (_, k) => ({ ...ITENS_DE_EXEMPLO[k % ITENS_DE_EXEMPLO.length], ordem: k + 1 }))
        const d = dados({ itens: muitos })
        const r = gerarFolhaDoLevantamento(d)
        if (!r.ok) throw new Error(r.recusas.join(' | '))
        const plano = planoDaFolha(d)
        if ('recusa' in plano) throw new Error(plano.recusa)
        expect(r.paginas).toBe(plano.paginas.length)
        expect(r.paginas).toBeGreaterThan(1)
        const t = textoDoPdf(r.pdf)
        expect(t.match(/\/MediaBox \[0 0 595\.2799\d* 841\.8899\d*\]/g)?.length).toBe(r.paginas)
        for (let k = 1; k <= r.paginas; k++) expect(t).toContain(`(Página ${k} de ${r.paginas})`)
        expect(t.match(/\(Nº 6\)/g)?.length).toBe(r.paginas)
        expect(t.match(/\(Esquadrias Exemplo Ltda\)/g)?.length).toBe(r.paginas)
        expect(t.match(/\(CLIENTE\)/g)?.length).toBe(1)
        expect(t.match(/\(CONDIÇÕES COMERCIAIS\)/g)?.length).toBe(1)
        expect(t.match(/\(Levantamento 6 · 12 itens · 18 peças · gerado em 06\/11\/2026 às 14:30\)/g)?.length).toBe(r.paginas)
        expect(r.nomeDoArquivo).toBe('Levantamento 6 - Ana Exemplo.pdf')
    })

    it('o "mm" vai no rótulo da coluna, nunca ao lado do valor; nenhum valor em reais; as linhas do item na ordem da especificação', () => {
        const r = gerarFolhaDoLevantamento(FOLHA_DE_EXEMPLO)
        if (!r.ok) throw new Error(r.recusas.join(' | '))
        const t = textoDoPdf(r.pdf)
        expect(t).toContain('( mm)')
        expect(t).toContain('(1.500)')
        expect(t).not.toMatch(/\(1\.500 ?mm\)/)
        expect(t).not.toMatch(/R\$/)
        expect(t).toContain('(Altura da bandeira 400 mm)')
        expect(t).toContain('(5%)')
        expect(t).toContain('(Modo: proporcional)')
        expect(t).toContain('(Arq. Paula Exemplo)')
        expect(t).toContain('(27/11/26)')
        // as linhas do item 2: VARIÁVEIS → PERFIL / ACESSÓRIO + VIDRO → AMBIENTES → OBS
        const i2 = t.indexOf('(Item 2 · DP-04)')
        const ordem = ['(VARIÁVEIS)', '(PERFIL)', '(ACESSÓRIO + VIDRO)', '(AMBIENTES)', '(OBS)'].map((r2) => t.indexOf(r2, i2))
        expect(ordem.every((p) => p > i2)).toBe(true)
        expect([...ordem].sort((a, b) => a - b)).toEqual(ordem)
        // o item 1 (DP-02) não tem variável sem padrão: entre ele e o item 2 não há VARIÁVEIS
        const i1 = t.indexOf('(Item 1 · DP-02)')
        expect(t.slice(i1, i2)).not.toContain('(VARIÁVEIS)')
    })

    it('os itens saem na ordem do levantamento, qualquer que seja a ordem em que chegam; os ambientes com a quantidade de cada um', () => {
        const [a, b] = ITENS_DE_EXEMPLO
        const r = gerarFolhaDoLevantamento(dados({ itens: [b, a] }))
        if (!r.ok) throw new Error(r.recusas.join(' | '))
        const t = textoDoPdf(r.pdf)
        expect(t.indexOf('(Item 1 · DP-02)')).toBeGreaterThan(-1)
        expect(t.indexOf('(Item 1 · DP-02)')).toBeLessThan(t.indexOf('(Item 2 · DP-04)'))
        expect(linhaDosAmbientes(a)).toBe('Quarto 1 (1) · Quarto 2 (1) · Escritório (1)')
    })

    it('a mesma folha gerada duas vezes dá os mesmos bytes', () => {
        const a = gerarFolhaDoLevantamento(FOLHA_DE_EXEMPLO)
        const b = gerarFolhaDoLevantamento(FOLHA_DE_EXEMPLO)
        if (!a.ok || !b.ok) throw new Error('recusou')
        expect(Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(true)
    })

    it('o exemplo em docs/levantamento/ é o que o gerador produz hoje (regravar: ATUALIZAR_EXEMPLO_DA_FOLHA=1)', () => {
        const r = gerarFolhaDoLevantamento(FOLHA_DE_EXEMPLO)
        if (!r.ok) throw new Error(r.recusas.join(' | '))
        if (process.env.ATUALIZAR_EXEMPLO_DA_FOLHA === '1') writeFileSync(EXEMPLO, Buffer.from(r.pdf))
        expect(Buffer.from(r.pdf).equals(readFileSync(EXEMPLO))).toBe(true)
    })
})
