/**
 * @jest-environment node
 *
 * PORTÃO — o LEITOR da importação: os bytes da tabela e do motor viram as linhas prontas para
 * gravar, com as contagens e os avisos. Função pura sobre os bytes; nada de rota, nada de banco.
 *
 * O mapa das colunas é o medido pela sessão de verificação nos arquivos reais da Wolff
 * (20/10/2026). As planilhas daqui são MONTADAS no teste com o exceljs — a mesma biblioteca do
 * leitor —, porque os arquivos reais não estão no repositório. Cada caso usa valores que
 * DISTINGUEM o certo do errado (`teste-que-nao-exercita.md`, variante 2).
 *
 *   (1) CÉLULA COM FÓRMULA VIRA NÚMERO — o caso que não pode faltar. As colunas de valor da
 *       tabela são fórmulas; o exceljs devolve `{formula, result}`, e quem gravasse o objeto, ou
 *       NULL, passaria em qualquer teste que só olhasse se o campo "chegou".
 *   (2) o conversor único de célula: richText, error (NULL + aviso), Date, número, texto, vazio;
 *   (3) a aba de preço: o cabeçalho é PULADO, a seção é o TÍTULO acima dele, a alíquota sai dos
 *       rótulos das colunas 13 e 15, `vendido_por` sai da seção;
 *   (4) código repetido: fica a primeira, a segunda conta em `normalizados`, e o aviso diz as duas
 *       seções e se os valores batiam — EM VOZ ALTA quando não batem;
 *   (5) código com vírgula decimal: "1027,1" vira "10271", contado e avisado com antes e depois;
 *   (6) o motor: tipologias da coluna 14, a coluna 13 NÃO é lida, e o cruzamento com o preço;
 *  (6b) as VARIÁVEIS da tipologia saem da coluna 15 (condição) das regras dela: identificadores em
 *       maiúsculas de 1 a 4 letras, sem AND/OR/IIF, ordenados. Os casos são os três medidos pela
 *       sessão de verificação (DP-148, DP-02, DP-01). Lista vazia SÓ quando nenhuma regra da
 *       tipologia é condicional — e aí ela é medição, não suposição;
 * (6c) a coluna do banco `orcamentista_tabela_item.segmento`: a chave sai de UMA constante, e o
 *       item já sai com ela;
 *   (7) a família: o "PVC " sai do nome da linha, e `linha_original` guarda o que veio;
 *   (8) a aba "Sem uso no motor" é ignorada;
 *   (9) .csv, .pdf e .xls NÃO são importáveis — recusa com o nome, a extensão e o PORQUÊ dela;
 *  (10) aba que falta é recusa com o nome dela e as que existem.
 */
import ExcelJS from 'exceljs'

import {
    ABAS_DA_IMPORTACAO, COLUNA_DA_CATEGORIA_DO_FORNECEDOR, lerArquivosDaImportacao, valorDaCelula, variaveisDasCondicoes,
    type Aviso, type ResultadoDaLeitura,
} from '@/utils/atendimentos-ia-importacao'
import { EXTENSOES_IMPORTAVEIS, MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL, fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'

type Celulas = Record<number, ExcelJS.CellValue>

async function bytes(abas: Record<string, Array<Celulas | null>>): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        linhas.forEach((celulas, i) => {
            if (!celulas) return
            for (const [col, valor] of Object.entries(celulas)) ws.getRow(i + 1).getCell(Number(col)).value = valor
        })
    }
    return new Uint8Array(await wb.xlsx.writeBuffer())
}

/** Uma linha de item da aba de preço, pelo mapa medido. */
const item = (codigo: ExcelJS.CellValue, metroInterno: ExcelJS.CellValue = 10, extra: Celulas = {}): Celulas => ({
    2: codigo, 4: `perfil ${String(codigo)}`, 5: 6, 6: 'BR', 7: '7604.21.00', 8: 1.2, 9: 0, 10: '10', 11: 'PVC', 12: 50,
    13: metroInterno, 14: 9, 15: 60, 16: 54, ...extra,
})
/** O cabeçalho de uma seção: "CÓDIGO" na coluna 2, os rótulos de valor nas 13 a 16. */
const cabecalho = (r13: string, r15: string): Celulas => ({ 2: 'CÓDIGO', 4: 'DESCRIÇÃO', 13: r13, 14: 'VALOR METRO 12%', 15: r15, 16: 'VALOR BARRA 12%' })

const PRECO = ABAS_DA_IMPORTACAO.preco
const MOTOR = ABAS_DA_IMPORTACAO.motor
const FAMILIA = ABAS_DA_IMPORTACAO.familia

const regra = (codigo: ExcelJS.CellValue, tipologias: string, extra: Celulas = {}): Celulas => ({
    1: codigo, 2: 'corte', 3: 'PVC', 4: 'BRANCO', 5: 'W1', 6: 'EUROPA 42', 7: 'MARCO', 8: 'H', 9: '90', 10: 'L-10', 11: 'L', 12: '2',
    13: 999, 14: tipologias, ...extra,
})
const CAB_MOTOR: Celulas = { 1: 'CÓDIGO', 14: 'TIPOLOGIAS' }
const CAB_FAMILIA: Celulas = { 1: 'LINHA', 2: 'VARIÁVEL' }

async function motorPadrao(regras: Celulas[] = [regra('A1', 'JC2F, JC4F')], familia: Celulas[] = []) {
    return bytes({ [MOTOR]: [CAB_MOTOR, ...regras], [FAMILIA]: [CAB_FAMILIA, ...familia] })
}
// Com `strictNullChecks` desligado, `r.ok` não estreita a união — as guardas são explícitas.
type Recusa = Extract<ResultadoDaLeitura, { ok: false }>
const erroDe = (r: ResultadoDaLeitura) => (r.ok ? '' : (r as Recusa).erro)

async function ler(preco: Array<Celulas | null>, motor?: Uint8Array): Promise<Extract<ResultadoDaLeitura, { ok: true }>> {
    const r = await lerArquivosDaImportacao({
        tabela: { nome: 'Tabela Wolff.xlsm', bytes: await bytes({ [PRECO]: preco }) },
        motor: { nome: 'Motor.xlsx', bytes: motor ?? await motorPadrao() },
    })
    if (!r.ok) throw new Error(`recusada: ${erroDe(r)}`)
    return r as Extract<ResultadoDaLeitura, { ok: true }>
}
const avisosDo = <T extends Aviso['tipo']>(r: { avisos: Aviso[] }, tipo: T) =>
    r.avisos.filter((a): a is Extract<Aviso, { tipo: T }> => a.tipo === tipo)

describe('(1) CÉLULA COM FÓRMULA VIRA NÚMERO', () => {
    it('no conversor: `{formula, result}` devolve o result, e o result é número', () => {
        const v = valorDaCelula({ formula: 'L5*1.2', result: 83.52 }).valor
        expect(v).toBe(83.52)
        expect(typeof v).toBe('number')
    })

    it('de ponta a ponta: a coluna de valor feita de fórmula chega ao item como NÚMERO, não objeto nem nulo', async () => {
        const r = await ler([
            { 1: 'TABELA PERFIS LAMINADOS TOTAL — AMADEIRADO NOGUEIRA' },
            cabecalho('VALOR METRO 18%', 'VALOR BARRA 18%'),
            item('IL4237', { formula: 'L3*1.2', result: 83.52 }, { 15: { formula: 'M3*6', result: 501.12 }, 14: { formula: 'L3*1.05', result: 73.38 } }),
        ])
        expect(r.itens).toHaveLength(1)
        expect(r.itens[0].valor_metro_interno).toBe(83.52)
        expect(r.itens[0].valor_barra_interno).toBe(501.12)
        expect(r.itens[0].valor_metro_12).toBe(73.38)
        expect(typeof r.itens[0].valor_metro_interno).toBe('number')
    })
})

describe('(2) o conversor único de célula', () => {
    it.each([
        ['richText vira o texto juntado', { richText: [{ text: 'PERFIL ' }, { text: 'EUROPA' }] }, 'PERFIL EUROPA'],
        ['texto é aparado', '  IL4237  ', 'IL4237'],
        ['texto vazio é NULL', '   ', null],
        ['vazio é NULL', null, null],
        ['número fica número', 6, 6],
        ['fórmula compartilhada devolve o result', { sharedFormula: 'A1', result: 12.5 }, 12.5],
        ['hyperlink vira o texto', { text: 'site', hyperlink: 'https://x' }, 'site'],
    ] as Array<[string, ExcelJS.CellValue, unknown]>)('%s', (_, celula, esperado) => {
        expect(valorDaCelula(celula).valor).toEqual(esperado)
    })

    it('Date fica Date', () => {
        const d = new Date('2026-10-20T00:00:00Z')
        expect(valorDaCelula(d).valor).toEqual(d)
    })

    it('erro da planilha vira NULL e vira aviso — direto e dentro do result de uma fórmula', () => {
        for (const celula of [{ error: '#N/A' }, { formula: 'X1', result: { error: '#REF!' } }] as ExcelJS.CellValue[]) {
            const v = valorDaCelula(celula)
            expect(v.valor).toBeNull()
            expect(v.erro).toMatch(/#(N\/A|REF!)/)
        }
    })

    it('fórmula sem resultado gravado vira NULL e vira aviso, nunca o texto da fórmula', () => {
        const v = valorDaCelula({ formula: 'L5*1.2' } as ExcelJS.CellValue)
        expect(v.valor).toBeNull()
        expect(v.erro).toBeTruthy()
    })

    it('erro numa célula de valor chega ao item como NULL e aparece em `avisos`, com a linha', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('X1', { error: '#N/A' })])
        expect(r.itens[0].valor_metro_interno).toBeNull()
        expect(avisosDo(r, 'celula_com_erro')).toEqual([expect.objectContaining({ aba: PRECO, linha: 2, coluna: 13 })])
    })
})

describe('(3) a aba de preço: cabeçalho pulado, seção, alíquota e vendido_por', () => {
    const PLANILHA: Array<Celulas | null> = [
        item('SOLTO'),                                                    // 1: antes de qualquer seção
        null,                                                             // 2
        { 1: 'TABELA PERFIS LAMINADOS TOTAL — AMADEIRADO NOGUEIRA' },     // 3: título
        cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'),                  // 4: cabeçalho
        item('A17'),                                                      // 5
        { 2: 'TABELA PERFIS LINHA SUPREMA' },                             // 6: título NA COLUNA 2
        cabecalho('VALOR METRO 18%', 'VALOR BARRA 18%'),                  // 7
        item('B18'),                                                      // 8
        { 1: 'ACESSÓRIOS' },                                              // 9
        cabecalho('VALOR UNIT 18%', 'VALOR TOTAL 18%'),                   // 10
        item('C-UN'),                                                     // 11
        { 1: 'SEM RÓTULO' },                                              // 12
        cabecalho('PREÇO', 'PREÇO'),                                      // 13: não diz barra nem unidade
        item('D-NADA'),                                                   // 14
    ]

    it('a linha "CÓDIGO" não vira item, nem o título acima dela', async () => {
        const r = await ler(PLANILHA)
        expect(r.itens.map((i) => i.codigo)).toEqual(['SOLTO', 'A17', 'B18', 'C-UN', 'D-NADA'])
        expect(r.contagens.itens).toBe(5)
    })

    it('a seção é o TÍTULO acima do cabeçalho — também quando ele está na coluna 2', async () => {
        const r = await ler(PLANILHA)
        const secao = Object.fromEntries(r.itens.map((i) => [i.codigo, i.secao]))
        expect(secao).toEqual({
            SOLTO: null,
            A17: 'TABELA PERFIS LAMINADOS TOTAL — AMADEIRADO NOGUEIRA',
            B18: 'TABELA PERFIS LINHA SUPREMA',
            'C-UN': 'ACESSÓRIOS',
            'D-NADA': 'SEM RÓTULO',
        })
    })

    it('a alíquota sai dos rótulos das colunas 13 e 15, por seção — 17 e 18 no mesmo arquivo', async () => {
        const r = await ler(PLANILHA)
        const aliq = Object.fromEntries(r.itens.map((i) => [i.codigo, i.aliquota_interna_pct]))
        expect(aliq).toEqual({ SOLTO: null, A17: 17, B18: 18, 'C-UN': 18, 'D-NADA': null })
    })

    it('vendido_por: unidade em VALOR UNIT / VALOR TOTAL, barra nas demais, NULL quando a seção não diz', async () => {
        const r = await ler(PLANILHA)
        const vp = Object.fromEntries(r.itens.map((i) => [i.codigo, i.vendido_por]))
        expect(vp).toEqual({ SOLTO: null, A17: 'barra', B18: 'barra', 'C-UN': 'unidade', 'D-NADA': null })
    })

    it('as colunas do mapa caem nos campos certos — e a coluna 11 do arquivo vai para a chave da constante', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('Z9', 11, { 11: 'ALUMÍNIO', 12: 77, 14: 8, 16: 48, 5: 6.5 })])
        expect(r.itens[0]).toEqual(expect.objectContaining({
            codigo: 'Z9', descricao: 'perfil Z9', medida_barra_m: 6.5, unidade: 'BR', ncm: '7604.21.00', peso: 1.2, ipi: 0,
            pacote: '10', [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'ALUMÍNIO', custo: 77, valor_metro_interno: 11, valor_metro_12: 8,
            valor_barra_interno: 60, valor_barra_12: 48,
        }))
    })
})

describe('(4) código repetido: fica a primeira, e o aviso diz se os valores batiam', () => {
    const duas = (segundoValor: number) => [
        { 1: 'LAMINADOS TOTAL — AMADEIRADO NOGUEIRA' }, cabecalho('VALOR METRO 18%', 'VALOR BARRA 18%'), item('IL4237', 83.52, { 14: 73.38 }),
        { 1: 'LAMINADOS PARTE EXTERNA — AMADEIRADO NOGUEIRA' }, cabecalho('VALOR METRO 18%', 'VALOR BARRA 18%'), item('IL4237', segundoValor, { 14: 73.38 }),
    ]

    it('valores iguais: um item só, a primeira seção, normalizados +1, aviso com as duas seções e "batem"', async () => {
        const r = await ler(duas(83.52))
        expect(r.itens).toHaveLength(1)
        expect(r.itens[0].secao).toBe('LAMINADOS TOTAL — AMADEIRADO NOGUEIRA')
        expect(r.contagens.normalizados).toBe(1)
        expect(avisosDo(r, 'codigo_repetido')).toEqual([expect.objectContaining({
            codigo: 'IL4237',
            secoes: ['LAMINADOS TOTAL — AMADEIRADO NOGUEIRA', 'LAMINADOS PARTE EXTERNA — AMADEIRADO NOGUEIRA'],
            valores_batem: true,
        })])
    })

    it('valores DIFERENTES: fica a primeira, e o aviso diz isso EM VOZ ALTA — a decisão volta ao dono do produto', async () => {
        const r = await ler(duas(90))
        expect(r.itens[0].valor_metro_interno).toBe(83.52)
        const [a] = avisosDo(r, 'codigo_repetido')
        expect(a.valores_batem).toBe(false)
        expect(a.mensagem).toMatch(/VALORES DIFERENTES/)
        expect(a.mensagem).toMatch(/dono do produto/)
    })
})

describe('(5) código com vírgula decimal', () => {
    it('"1027,1" (texto) e 1027.1 (número) viram "10271", contados e avisados com antes e depois', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('1027,1'), item(3001.5), item(4237)])
        expect(r.itens.map((i) => i.codigo)).toEqual(['10271', '30015', '4237'])
        expect(r.contagens.normalizados).toBe(2)
        expect(avisosDo(r, 'codigo_normalizado').map((a) => [a.antes, a.depois])).toEqual([['1027,1', '10271'], ['3001.5', '30015']])
    })

    it('o código do MOTOR passa pela mesma normalização — e é ela que faz os dois cruzarem', async () => {
        const r = await ler(
            [cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('1027,1')],
            await motorPadrao([regra('1027,1', 'JC2F')]),
        )
        expect(r.regras[0].codigo).toBe('10271')
        expect(r.contagens.cruzam).toBe(1)
        expect(r.contagens.nao_cruzam).toBe(0)
    })
})

describe('(6) o motor', () => {
    it('tipologias saem da coluna 14 separadas por vírgula; a coluna 13 ("nº tipologias") NÃO é lida', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1')], await motorPadrao([
            regra('A1', ' JC2F ,JC4F,, PV1 ', { 13: 999, 15: 'L > 1000', 16: 'obs 1' }),
        ]))
        expect(r.regras).toHaveLength(1)
        expect(r.regras[0].tipologias).toEqual(['JC2F', 'JC4F', 'PV1'])
        expect(r.regras[0]).not.toHaveProperty('n_tipologias')
        expect(Object.values(r.regras[0])).not.toContain(999)
        expect(r.regras[0]).toEqual(expect.objectContaining({
            codigo: 'A1', descricao: 'corte', [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'PVC', cor: 'BRANCO', codigo_wvetro: 'W1', linha: 'EUROPA 42',
            tipo: 'MARCO', eixo: 'H', corte: '90', formula_medida: 'L-10', formula_em_lh: 'L', formula_qtde: '2',
            condicao: 'L > 1000', obs: 'obs 1',
        }))
    })

    it('cruzam / não cruzam contam CÓDIGOS distintos do motor contra o preço, e os que não cruzam vão para avisos', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1'), item('B2')], await motorPadrao([
            regra('A1', 'JC2F'), regra('A1', 'JC4F'), regra('B2', 'JC2F'), regra('Z9', 'JC2F'),
        ]))
        expect(r.contagens.regras).toBe(4)
        expect(r.contagens.cruzam).toBe(2)
        expect(r.contagens.nao_cruzam).toBe(1)
        expect(avisosDo(r, 'codigo_do_motor_sem_preco')).toEqual([expect.objectContaining({ codigos: ['Z9'] })])
    })

    it('o resumo por tipologia: regras e condicionais contados', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1')], await motorPadrao([
            regra('A1', 'JC2F, JC4F', { 15: 'L > 1000' }), regra('A1', 'JC2F'),
        ]))
        const t = Object.fromEntries(r.tipologias.map((x) => [x.tipologia, x]))
        expect(r.contagens.tipologias).toBe(2)
        expect(t.JC2F).toEqual(expect.objectContaining({ n_regras: 2, n_condicionais: 1, linha: 'EUROPA 42' }))
        expect(t.JC4F).toEqual(expect.objectContaining({ n_regras: 1, n_condicionais: 1 }))
    })
})

describe('(6b) as variáveis da tipologia saem da condição das regras dela', () => {
    // Condições montadas para dar EXATAMENTE as listas medidas, e com o que tem de ficar de fora
    // misturado: AND, OR, IIF, palavra de 5 letras (LARGO), minúscula (x) e número.
    const MOTOR_DAS_TRES = () => motorPadrao([
        regra('A1', 'DP-148', { 15: 'IIF(AQ > 0 AND CA < 10, FV, M) OR N = 1' }),
        regra('A1', 'DP-148', { 15: 'PM >= 2 AND PT <> x OR FV > LARGO' }),
        regra('A1', 'DP-148, DP-01', { 15: 'CA AND FV' }),
        regra('A1', 'DP-148'),
        regra('A1', 'DP-02', { 15: 'IIF(ARE > ARI, CA, FV) AND HFOL > 0' }),
        regra('A1', 'DP-02', { 15: 'INT = 1 OR MFI < MTE' }),
        regra('A1', 'DP-02, DP-01', { 15: 'MAE > MAI' }),
        regra('A1', 'DP-01', { 15: 'IIF(ARE > 0, ARI, CA) OR MTE = 2' }),
        regra('A1', 'SEM-COND'), regra('A1', 'SEM-COND, DP-148'),
    ])

    it('DP-148, DP-02 e DP-01 dão as listas medidas pela sessão de verificação', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1')], await MOTOR_DAS_TRES())
        const v = Object.fromEntries(r.tipologias.map((x) => [x.tipologia, x.variaveis]))
        expect(v['DP-148']).toEqual(['AQ', 'CA', 'FV', 'M', 'N', 'PM', 'PT'])
        expect(v['DP-02']).toEqual(['ARE', 'ARI', 'CA', 'FV', 'HFOL', 'INT', 'MAE', 'MAI', 'MFI', 'MTE'])
        // A DP-01 só fecha a lista medida com as regras que ela DIVIDE com DP-148 (CA, FV) e com
        // DP-02 (MAE, MAI): é a UNIÃO das condições de todas as regras da tipologia.
        expect(v['DP-01']).toEqual(['ARE', 'ARI', 'CA', 'FV', 'MAE', 'MAI', 'MTE'])
    })

    it('tipologia SEM nenhuma regra condicional grava o vetor VAZIO — e ele é medição, não ausência', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1')], await MOTOR_DAS_TRES())
        const t = r.tipologias.find((x) => x.tipologia === 'SEM-COND')!
        expect(t.n_condicionais).toBe(0)
        expect(t.variaveis).toEqual([])
    })

    it('lado a lado: SEM condição é vazio SEM aviso; condição ILEGÍVEL é vazio COM aviso', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1')], await motorPadrao([
            regra('A1', 'SEM-COND'),
            regra('A1', 'ILEGIVEL', { 15: 'x > 1000 and largo' }),
            regra('A1', 'ILEGIVEL', { 15: '(10 + 20) / 2' }),
            regra('A1', 'LEGIVEL', { 15: 'L > 1000' }),
        ]))
        const t = Object.fromEntries(r.tipologias.map((x) => [x.tipologia, x]))
        expect(t['SEM-COND'].variaveis).toEqual([])
        expect(t.ILEGIVEL.variaveis).toEqual([])
        expect(t.LEGIVEL.variaveis).toEqual(['L'])
        expect(avisosDo(r, 'tipologia_condicional_sem_variavel')).toEqual([expect.objectContaining({
            tipologia: 'ILEGIVEL', n_condicionais: 2, exemplo: 'x > 1000 and largo',
        })])
    })

    it('AND, OR e IIF nunca entram; nem palavra de 5 letras, nem minúscula, nem número', () => {
        expect(variaveisDasCondicoes(['IIF(A AND B, C OR D, LARGO) and x > 10 OR IIF'])).toEqual(['A', 'B', 'C', 'D'])
        // O contraste: sem as exclusões, as mesmas condições dariam AND, OR e IIF.
        expect(variaveisDasCondicoes(['AND OR IIF'])).toEqual([])
    })

    it('a lista é ordenada e sem repetição', () => {
        expect(variaveisDasCondicoes(['PT > M', 'M < AQ', 'PT = CA'])).toEqual(['AQ', 'CA', 'M', 'PT'])
    })
})

describe('(6c) a coluna do arquivo do fornecedor sai de UMA constante', () => {
    it('o item e a regra saem com a chave da constante — e sem o nome interno `categoria_do_arquivo`', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1', 10, { 11: 'ALUMÍNIO' })])
        expect(r.itens[0][COLUNA_DA_CATEGORIA_DO_FORNECEDOR]).toBe('ALUMÍNIO')
        expect(r.regras[0][COLUNA_DA_CATEGORIA_DO_FORNECEDOR]).toBe('PVC')
        expect(Object.keys(r.itens[0])).not.toContain('categoria_do_arquivo')
        expect(Object.keys(r.regras[0])).not.toContain('categoria_do_arquivo')
    })
})

describe('(7) a família', () => {
    it('"PVC EUROPA 42" vira "EUROPA 42" em `linha`, e `linha_original` guarda o que veio', async () => {
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1')], await motorPadrao(undefined, [
            { 1: 'PVC EUROPA 42', 2: 'L', 3: 'largura', 4: 'L-20', 5: 'L', 7: 0.5 },
            { 1: 'SUPREMA', 2: 'H', 3: 'altura', 4: 'H-10', 5: 'H', 7: { formula: 'A1', result: 1 } },
        ]))
        expect(r.formulas).toEqual([
            { linha: 'EUROPA 42', linha_original: 'PVC EUROPA 42', variavel: 'L', descricao: 'largura', formula: 'L-20', formula_em_lh: 'L', pct_padrao: 0.5 },
            { linha: 'SUPREMA', linha_original: 'SUPREMA', variavel: 'H', descricao: 'altura', formula: 'H-10', formula_em_lh: 'H', pct_padrao: 1 },
        ])
        // E é isso que faz a família cruzar com a regra, que diz "EUROPA 42".
        expect(r.formulas[0].linha).toBe(r.regras[0].linha)
    })
})

describe('(8) a aba "Sem uso no motor"', () => {
    it('é ignorada: nada dela entra em regra, item ou contagem', async () => {
        const motor = await bytes({
            [MOTOR]: [CAB_MOTOR, regra('A1', 'JC2F')],
            [FAMILIA]: [CAB_FAMILIA],
            'Sem uso no motor': [{ 1: 'CÓDIGO' }, { 1: 'X1' }, { 1: 'X2' }],
        })
        const r = await ler([cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1')], motor)
        expect(r.regras.map((x) => x.codigo)).toEqual(['A1'])
        expect(r.contagens.regras).toBe(1)
    })
})

describe('(9) .csv, .pdf e .xls não são importáveis — e a recusa diz o arquivo e a extensão', () => {
    it.each([['tabela.csv', '.csv'], ['motor.pdf', '.pdf'], ['antiga.xls', '.xls']])('%s', async (nome, ext) => {
        const ok = await bytes({ [PRECO]: [cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1')] })
        const r = await lerArquivosDaImportacao({
            tabela: { nome: nome.startsWith('motor') ? 'Tabela.xlsm' : nome, bytes: ok },
            motor: { nome: nome.startsWith('motor') ? nome : 'Motor.xlsx', bytes: await motorPadrao() },
        })
        expect(r.ok).toBe(false)
        const erro = erroDe(r)
        expect(erro).toBe(fraseDoArquivoNaoImportavel(nome))
        expect(erro).toContain(nome)
        expect(erro).toContain(ext)
        expect(erro).toContain(MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL[ext])
    })

    it('o PORQUÊ do .xls é outro: é o formato antigo do Excel, que o leitor não abre', () => {
        expect(MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL['.xls']).not.toBe(MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL['.csv'])
        expect(MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL['.xls']).toMatch(/formato antigo/)
    })

    it('o contraste: .xlsm e .xlsx são importáveis', async () => {
        expect(EXTENSOES_IMPORTAVEIS).toEqual(['.xlsx', '.xlsm'])
        const r = await lerArquivosDaImportacao({
            tabela: { nome: 'Tabela.XLSM', bytes: await bytes({ [PRECO]: [cabecalho('VALOR METRO 17%', 'VALOR BARRA 17%'), item('A1')] }) },
            motor: { nome: 'Motor.xlsx', bytes: await motorPadrao() },
        })
        expect(r.ok).toBe(true)
    })
})

describe('(10) aba que falta', () => {
    it('é recusa com o nome da aba esperada e as abas que o arquivo tem', async () => {
        const r = await lerArquivosDaImportacao({
            tabela: { nome: 'Tabela.xlsm', bytes: await bytes({ Planilha1: [item('A1')] }) },
            motor: { nome: 'Motor.xlsx', bytes: await motorPadrao() },
        })
        expect(r.ok).toBe(false)
        const erro = erroDe(r)
        expect(erro).toContain(PRECO)
        expect(erro).toContain('Planilha1')
        expect(erro).toContain('Tabela.xlsm')
    })
})
