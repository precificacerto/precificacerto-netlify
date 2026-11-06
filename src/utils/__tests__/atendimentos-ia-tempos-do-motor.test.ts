/**
 * @jest-environment node
 *
 * PORTÃO — o TEMPO DE FABRICAÇÃO NO ARQUIVO DO MOTOR (dono do produto, 05/11/2026; migração 20261106000001):
 * `src/utils/atendimentos-ia-tempos-do-motor.ts`, e o caminho dele pelo leitor do motor, pelo payload e pela conferência.
 *
 *   (1) as duas colunas da Detalhe pelo cabeçalho EXATO: minutos inteiros por unidade; vazio = sem linha (nunca 0); a origem como veio, ou IMPORTADO;
 *   (2) as recusas, nomeando a linha e a coluna: zero, negativo, decimal, texto, data, fórmula sem resultado, origem sem tempo, origem acima de 120
 *       (contada como o banco conta), tempo sem o Código, cabeçalho repetido;
 *   (3) o cabeçalho PARECIDO é recusado, nomeando o que achou e o que esperava — nunca lido como coluna ausente;
 *   (4) o arquivo SEM as colunas: nenhum tempo, nenhuma recusa (o motor de antes continua entrando);
 *   (5) o caminho pelo leitor do motor: as recusas dos tempos saem junto com as das abas; o payload leva `tempos`; a conferência exige a contagem
 *       (a função de antes da migração não a devolve: divergência, nunca sucesso); a tabela com motor colado recusa o arquivo com tempo;
 *   (6) o limite e o padrão são os da migração.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'

import {
    ABA_DOS_TEMPOS, CABECALHO_DA_ORIGEM, CABECALHO_DO_TEMPO, ORIGEM_DO_TEMPO_MAX, ORIGEM_PADRAO_DO_TEMPO, cabecalhoReduzido, fraseDosTempos, lerTemposDoDetalhe,
} from '@/utils/atendimentos-ia-tempos-do-motor'
import {
    ABAS_DA_IMPORTACAO, LISTAS_DO_MOTOR_DA_ETAPA, conferirGravacaoDoMotor, fraseDosTemposNaTabela, lerArquivoDoMotor, lerArquivosDaImportacao, montarPayloadDoMotor,
    type ResultadoDoMotor,
} from '@/utils/atendimentos-ia-importacao'
import { ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { abasDoSpec } from './fixtures/abas-do-motor-do-spec'

type Celulas = Record<number, ExcelJS.CellValue>
const MIGRACAO = readFileSync(join(__dirname, '../../../supabase/migrations/20261106000001_tempo_de_fabricacao_no_arquivo_do_motor.sql'), 'utf8')

/** A Detalhe como o arquivo real: os doze cabeçalhos do mapa, e depois de "Nº insumos" as duas colunas novas (13 e 14). */
const CAB_DETALHE = ABAS_DO_MOTOR[0].colunas.map((c) => c.cabecalho)
const detalhe = (extras: Record<number, string> = { 13: CABECALHO_DO_TEMPO, 14: CABECALHO_DA_ORIGEM }): Celulas =>
    ({ ...Object.fromEntries(CAB_DETALHE.map((c, i) => [i + 1, c])), ...extras })
/** Uma linha da Detalhe: Linha, Código, Descrição, Tipo, os limites, a fonte e as contagens; 13 = tempo, 14 = origem. */
const linha = (codigo: ExcelJS.CellValue, tempo?: ExcelJS.CellValue, origem?: ExcelJS.CellValue): Celulas => ({
    1: 'EUROPA 42', 2: codigo, 3: `Janela ${String(codigo)}`, 4: 'Correr', 5: 400, 6: 3000, 7: 400, 8: 2500, 9: 'Wolff', 10: 8, 11: 2, 12: 12,
    ...(tempo !== undefined ? { 13: tempo } : {}), ...(origem !== undefined ? { 14: origem } : {}),
})

async function planilha(abas: Record<string, Array<Celulas | null>>): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook()
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        linhas.forEach((celulas, i) => { if (celulas) for (const [c, v] of Object.entries(celulas)) ws.getRow(i + 1).getCell(Number(c)).value = v })
    }
    // ida e volta pelos bytes: é o caminho da importação de verdade
    const lido = new ExcelJS.Workbook()
    await lido.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    return lido
}
const ler = async (linhas: Array<Celulas | null>, cab: Celulas = detalhe()) => lerTemposDoDetalhe(await planilha({ [ABA_DOS_TEMPOS]: [cab, ...linhas] }))
const tempos = (r: ReturnType<typeof lerTemposDoDetalhe>) => ('tempos' in r ? r.tempos : null)
const erros = (r: ReturnType<typeof lerTemposDoDetalhe>) => ('erros' in r ? r.erros : [])
const onde = (r: number, cab: string) => `Aba "${ABA_DOS_TEMPOS}", linha ${r}, coluna "${cab}"`

describe('(1) as duas colunas da Detalhe, pelo cabeçalho exato', () => {
    it('minutos inteiros por unidade; a origem como veio (aparada, como toda célula); vazia vira IMPORTADO', async () => {
        const r = await ler([linha('DP-01', 60, '  cronometrado em fábrica '), linha('DP-02', 35), linha('DP-03', 161, null)])
        expect(erros(r)).toEqual([])
        expect(tempos(r)).toEqual([
            { tipologia: 'DP-01', tempo_fabricacao_min: 60, tempo_origem: 'cronometrado em fábrica' },
            { tipologia: 'DP-02', tempo_fabricacao_min: 35, tempo_origem: ORIGEM_PADRAO_DO_TEMPO },
            { tipologia: 'DP-03', tempo_fabricacao_min: 161, tempo_origem: ORIGEM_PADRAO_DO_TEMPO },
        ])
        expect(ORIGEM_PADRAO_DO_TEMPO).toBe('IMPORTADO')
    })

    it('VAZIO = NÃO INFORMADO: a tipologia sem tempo não gera linha, nunca 0 (a célula vazia e a só de espaços)', async () => {
        const r = await ler([linha('DP-01', 60), linha('DP-02'), linha('DP-03', '   ')])
        expect(erros(r)).toEqual([])
        expect(tempos(r)?.map((t) => t.tipologia)).toEqual(['DP-01'])
        expect(tempos(r)?.some((t) => t.tempo_fabricacao_min === 0)).toBe(false)
    })

    it('a fórmula com resultado numérico vale o resultado (as colunas da Wolff podem ser fórmulas)', async () => {
        const r = await ler([linha('DP-01', { formula: '30*2', result: 60 } as ExcelJS.CellValue)])
        expect(tempos(r)).toEqual([{ tipologia: 'DP-01', tempo_fabricacao_min: 60, tempo_origem: 'IMPORTADO' }])
    })

    it('as colunas valem pelo NOME, em qualquer posição — também antes de "Nº insumos"', async () => {
        const cab = detalhe({ 13: CABECALHO_DA_ORIGEM, 14: CABECALHO_DO_TEMPO })
        const r = await ler([{ ...linha('DP-01'), 13: 'medido', 14: 45 }], cab)
        expect(tempos(r)).toEqual([{ tipologia: 'DP-01', tempo_fabricacao_min: 45, tempo_origem: 'medido' }])
    })

    it('só a coluna do tempo, sem a da origem: todas IMPORTADO', async () => {
        const r = await ler([linha('DP-01', 60)], detalhe({ 13: CABECALHO_DO_TEMPO }))
        expect(tempos(r)).toEqual([{ tipologia: 'DP-01', tempo_fabricacao_min: 60, tempo_origem: 'IMPORTADO' }])
    })

    it('a linha inteira vazia no meio é pulada; o Código número vira texto (como na Detalhe)', async () => {
        const r = await ler([linha('DP-01', 60), null, linha(7, 40)])
        expect(erros(r)).toEqual([])
        expect(tempos(r)?.map((t) => [t.tipologia, t.tempo_fabricacao_min])).toEqual([['DP-01', 60], ['7', 40]])
    })
})

describe('(2) as recusas nomeiam a linha e a coluna', () => {
    it.each([
        ['zero', 0, 'o tempo de fabricação tem de ser maior que zero, e veio 0.'],
        ['negativo', -5, 'o tempo de fabricação tem de ser maior que zero, e veio -5.'],
        ['decimal', 12.5, 'o tempo de fabricação tem de ser em minutos inteiros, e veio 12.5.'],
        ['texto', '60 min', 'o tempo de fabricação tem de ser um número inteiro de minutos, e veio "60 min".'],
        ['texto de número', '60', 'o tempo de fabricação tem de ser um número inteiro de minutos, e veio "60".'],
        ['acima do integer do banco', 2147483648, '2147483648 minutos não cabe no banco.'],
    ])('tempo %s', async (_n, valor, motivo) => {
        const r = await ler([linha('DP-01', 60), linha('DP-02', valor as ExcelJS.CellValue)])
        expect(tempos(r)).toBeNull()
        expect(erros(r)).toEqual([`${onde(3, CABECALHO_DO_TEMPO)}: ${motivo}`])
    })

    it('o maior integer do banco passa', async () => {
        expect(tempos(await ler([linha('DP-01', 2147483647)]))?.[0].tempo_fabricacao_min).toBe(2147483647)
    })

    it('data na coluna do tempo é recusa, dita como data', async () => {
        const r = await ler([linha('DP-01', new Date('2026-11-05T00:00:00Z'))])
        expect(erros(r)).toEqual([`${onde(2, CABECALHO_DO_TEMPO)}: o tempo de fabricação tem de ser um número inteiro de minutos, e veio "2026-11-05".`])
    })

    it('fórmula sem resultado gravado e erro do Excel: recusa com o motivo da célula', async () => {
        const r = await ler([linha('DP-01', { formula: 'A1*2' } as ExcelJS.CellValue), linha('DP-02', { error: '#N/A' } as unknown as ExcelJS.CellValue)])
        expect(erros(r)).toEqual([
            `${onde(2, CABECALHO_DO_TEMPO)}: fórmula sem resultado gravado no arquivo.`,
            `${onde(3, CABECALHO_DO_TEMPO)}: erro na planilha: #N/A.`,
        ])
    })

    it('a origem preenchida sem tempo é recusa (origem de tempo nenhum não diz nada)', async () => {
        const r = await ler([linha('DP-01', undefined, 'medido')])
        expect(erros(r)).toEqual([`${onde(2, CABECALHO_DA_ORIGEM)}: a origem está preenchida e o tempo de fabricação está vazio.`])
    })

    it('a origem acima de 120 caracteres é recusa; 120 passam — contados como o banco conta (por caractere, não por unidade UTF-16)', async () => {
        const de120 = '🛠'.repeat(ORIGEM_DO_TEMPO_MAX)
        expect(de120.length).toBe(240) // UTF-16: o .length contaria o dobro
        expect(tempos(await ler([linha('DP-01', 60, de120)]))?.[0].tempo_origem).toBe(de120)
        const r = await ler([linha('DP-01', 60, `${de120}x`)])
        expect(erros(r)).toEqual([`${onde(2, CABECALHO_DA_ORIGEM)}: a origem tem 121 caracteres, e o limite é 120.`])
    })

    it('a origem real mais longa do arquivo (85 caracteres) passa como veio', async () => {
        const o = 'estimado por nº perfis, nº insumos, abertura correr + veneziana + bandeira e semelhante'.slice(0, 85)
        expect([...o].length).toBe(85)
        expect(tempos(await ler([linha('DP-01', 60, o)]))?.[0].tempo_origem).toBe(o)
    })

    it('o tempo numa linha sem o Código é recusa (não há a que tipologia ele pertence)', async () => {
        const r = await ler([linha('DP-01', 60), { 13: 45 }])
        expect(erros(r)).toEqual([`Aba "${ABA_DOS_TEMPOS}", linha 3: a linha tem tempo de fabricação e não tem o "Código" da tipologia.`])
    })

    it('o cabeçalho exato repetido é recusa: não sei qual ler', async () => {
        const r = await ler([linha('DP-01', 60)], detalhe({ 13: CABECALHO_DO_TEMPO, 14: CABECALHO_DA_ORIGEM, 15: CABECALHO_DO_TEMPO }))
        expect(erros(r)).toEqual([`A aba "${ABA_DOS_TEMPOS}" tem o cabeçalho "${CABECALHO_DO_TEMPO}" duas vezes: não sei qual ler.`])
    })

    it('todas as recusas saem de uma vez, na ordem das linhas', async () => {
        const r = await ler([linha('DP-01', 0), linha('DP-02', 60), linha('DP-03', 'x', 'medido'), linha('DP-04', undefined, 'y')])
        expect(erros(r).map((e) => e.split(':')[0])).toEqual([
            `Aba "${ABA_DOS_TEMPOS}", linha 2, coluna "${CABECALHO_DO_TEMPO}"`,
            `Aba "${ABA_DOS_TEMPOS}", linha 4, coluna "${CABECALHO_DO_TEMPO}"`,
            `Aba "${ABA_DOS_TEMPOS}", linha 5, coluna "${CABECALHO_DA_ORIGEM}"`,
        ])
    })
})

describe('(3) o cabeçalho PARECIDO é recusado, nomeando o que achou e o que esperava', () => {
    it.each([
        ['sem acento', 'Tempo fabricacao (min)', CABECALHO_DO_TEMPO],
        ['outra caixa', 'TEMPO FABRICAÇÃO (MIN)', CABECALHO_DO_TEMPO],
        ['espaço a mais', 'Tempo  fabricação (min)', CABECALHO_DO_TEMPO],
        ['a origem sem caixa', 'origem do tempo', CABECALHO_DA_ORIGEM],
    ])('%s: "%s"', async (_n, achado, esperado) => {
        const r = await ler([linha('DP-01', 60)], detalhe({ 13: achado }))
        expect(tempos(r)).toBeNull()
        expect(erros(r)).toEqual([`A aba "${ABA_DOS_TEMPOS}" tem o cabeçalho "${achado}", parecido com "${esperado}": escreva exatamente "${esperado}".`])
    })

    it('o parecido ao lado do exato também é recusa (seriam duas colunas para a mesma coisa)', async () => {
        const r = await ler([linha('DP-01', 60)], detalhe({ 13: CABECALHO_DO_TEMPO, 14: 'tempo fabricação (min)' }))
        expect(erros(r)).toHaveLength(1)
        expect(erros(r)[0]).toContain('"tempo fabricação (min)", parecido com')
    })

    it('o cabeçalho que só começa igual NÃO é parecido: é outra coluna, ignorada como as extras', async () => {
        const r = await ler([{ ...linha('DP-01', 60), 15: 'x' }], detalhe({ 13: CABECALHO_DO_TEMPO, 14: CABECALHO_DA_ORIGEM, 15: 'Tempo fabricação (min) antigo' }))
        expect(erros(r)).toEqual([])
        expect(tempos(r)).toHaveLength(1)
    })

    it('a redução tira acento, caixa e espaço sobrando — e só serve para ACHAR', () => {
        expect(cabecalhoReduzido('  TEMPO   FABRICAÇÃO (min) ')).toBe('tempo fabricacao (min)')
        expect(cabecalhoReduzido(CABECALHO_DO_TEMPO)).toBe('tempo fabricacao (min)')
    })
})

describe('(4) o arquivo sem as colunas', () => {
    it('nenhum tempo e nenhuma recusa: o motor de antes continua entrando', async () => {
        const r = await ler([linha('DP-01'), linha('DP-02')], detalhe({}))
        expect(r).toEqual({ ok: true, tempos: [] })
    })

    it('sem a aba Detalhe, nada a ler e nada a dizer (a recusa da aba ausente é de lerAbasDoMotor)', async () => {
        expect(lerTemposDoDetalhe(await planilha({ Outra: [{ 1: 'x' }] }))).toEqual({ ok: true, tempos: [] })
    })
})

// ── (5) pelo leitor do motor ─────────────────────────────────────────────────────────────
const regra = (codigo: string, tipologias: string): Celulas => ({
    1: codigo, 2: 'corte', 3: 'PVC', 4: 'BRANCO', 5: 'W1', 6: 'EUROPA 42', 7: 'MARCO', 8: 'H', 9: '90', 10: 'L-10', 11: 'L', 12: '2', 13: 999, 14: tipologias,
})
/** O arquivo do motor: as regras, as fórmulas da linha e as nove abas do spec, com a Detalhe trocada pela dada. */
async function arquivoDoMotor(detalheComTempos: Array<Celulas | null>): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const abas: Record<string, Array<Celulas | null>> = {
        [ABAS_DA_IMPORTACAO.motor]: [{ 1: 'CÓDIGO', 14: 'TIPOLOGIAS' }, regra('A1', 'DP-01, DP-02')],
        [ABAS_DA_IMPORTACAO.formulasDaLinha]: [{ 1: 'LINHA', 2: 'VARIÁVEL' }, { 1: 'PVC EUROPA 42', 2: 'HFOL', 3: 'altura', 4: '(H-10)', 7: 0.5 }],
        ...abasDoSpec(),
        [ABA_DOS_TEMPOS]: detalheComTempos,
    }
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        linhas.forEach((celulas, i) => { if (celulas) for (const [c, v] of Object.entries(celulas)) ws.getRow(i + 1).getCell(Number(c)).value = v })
    }
    return new Uint8Array(await wb.xlsx.writeBuffer())
}
type Lido = Extract<ResultadoDoMotor, { ok: true }>
const erroDe = (r: { ok: boolean }) => (r.ok === false ? (r as { erro: string }).erro : '')

describe('(5) pelo leitor do motor, pelo payload e pela conferência', () => {
    it('o leitor do motor devolve os tempos, e o payload os leva em `tempos`', async () => {
        const r = await lerArquivoDoMotor({ nome: 'Motor.xlsx', bytes: await arquivoDoMotor([detalhe(), linha('DP-01', 60, 'medido'), linha('DP-02')]) })
        expect(erroDe(r)).toBe('')
        const lido = r as Lido
        expect(lido.tempos).toEqual([{ tipologia: 'DP-01', tempo_fabricacao_min: 60, tempo_origem: 'medido' }])
        expect(montarPayloadDoMotor(lido).tempos).toEqual(lido.tempos)
        expect(lido.abas.detalhes.map((d) => d.tipologia)).toEqual(['DP-01', 'DP-02'])
        // o tempo NÃO entra na linha da Detalhe (a tabela dela não tem a coluna; o tempo mora na tabela própria)
        expect(Object.keys(lido.abas.detalhes[0])).not.toContain('tempo_fabricacao_min')
    })

    it('a recusa dos tempos sai pelo leitor do motor, com o nome do arquivo, junto com a das abas', async () => {
        const b = await arquivoDoMotor([detalhe(), { ...linha('DP-01', 0), 5: 'x' }])
        const e = erroDe(await lerArquivoDoMotor({ nome: 'Motor.xlsx', bytes: b }))
        expect(e).toContain('Arquivo "Motor.xlsx":')
        expect(e).toContain(`${onde(2, CABECALHO_DO_TEMPO)}: o tempo de fabricação tem de ser maior que zero, e veio 0.`)
        expect(e).toContain('"Larg. mín (mm)" não é número inteiro')
    })

    it('a conferência EXIGE a contagem dos tempos: a função de antes da migração não a devolve — divergência, nunca sucesso; com ela, confere', async () => {
        const lido = (await lerArquivoDoMotor({ nome: 'Motor.xlsx', bytes: await arquivoDoMotor([detalhe(), linha('DP-01', 60), linha('DP-02', 35)]) })) as Lido
        const p = montarPayloadDoMotor(lido)
        const gravado = Object.fromEntries(LISTAS_DO_MOTOR_DA_ETAPA.map((k) => [k, (p as unknown as Record<string, unknown[]>)[k].length]))
        expect(conferirGravacaoDoMotor(p, gravado)).toBeNull()
        const semTempos: Record<string, unknown> = { ...gravado }
        delete semTempos.tempos
        expect(conferirGravacaoDoMotor(p, semTempos)).toEqual({ enviado: expect.objectContaining({ tempos: 2 }), gravado: expect.objectContaining({ tempos: null }) })
        expect(conferirGravacaoDoMotor(p, { ...gravado, tempos: 1 })).not.toBeNull()
        // e com ZERO tempos enviados a contagem ausente também diverge: a função de antes nunca diz sucesso
        const semColuna = montarPayloadDoMotor((await lerArquivoDoMotor({ nome: 'M.xlsx', bytes: await arquivoDoMotor([detalhe({}), linha('DP-01')]) })) as Lido)
        const g0 = Object.fromEntries(LISTAS_DO_MOTOR_DA_ETAPA.map((k) => [k, (semColuna as unknown as Record<string, unknown[]>)[k].length]))
        delete (g0 as Record<string, unknown>).tempos
        expect(conferirGravacaoDoMotor(semColuna, g0)).not.toBeNull()
    })

    it('a tabela com motor colado (legado) recusa o arquivo COM tempo — a importação da tabela não o grava; sem tempo, segue', async () => {
        const preco = new ExcelJS.Workbook()
        preco.addWorksheet(ABAS_DA_IMPORTACAO.preco).getRow(1).getCell(2).value = 'CÓDIGO'
        const tabela = { nome: 'Tabela.xlsm', bytes: new Uint8Array(await preco.xlsx.writeBuffer()) }
        const com = await lerArquivosDaImportacao({ tabela, motor: { nome: 'Motor.xlsx', bytes: await arquivoDoMotor([detalhe(), linha('DP-01', 60)]) } })
        expect(erroDe(com)).toBe(`Arquivo "Motor.xlsx": ${fraseDosTemposNaTabela(1)}`)
        expect(fraseDosTemposNaTabela(1)).toContain('traz 1 tempo de fabricação')
        expect(fraseDosTemposNaTabela(2)).toContain('traz 2 tempos de fabricação')
        const sem = await lerArquivosDaImportacao({ tabela, motor: { nome: 'Motor.xlsx', bytes: await arquivoDoMotor([detalhe({}), linha('DP-01')]) } })
        expect(erroDe(sem)).toBe('')
    })
})

describe('(6) o limite e o padrão são os da migração', () => {
    it('a CHECK e a função conferem 1 a 120 caracteres, sem espaço nas pontas — o mesmo limite do leitor', () => {
        expect(MIGRACAO).toContain(`CHECK (tempo_origem = btrim(tempo_origem) AND char_length(tempo_origem) BETWEEN 1 AND ${ORIGEM_DO_TEMPO_MAX});`)
        expect(MIGRACAO).toContain(`char_length(t.e->>'tempo_origem') NOT BETWEEN 1 AND ${ORIGEM_DO_TEMPO_MAX}`)
        expect(ORIGEM_DO_TEMPO_MAX).toBe(120)
    })

    it('o padrão IMPORTADO mora só no leitor: a função exige a origem preenchida (não completa a vazia)', () => {
        const criar = MIGRACAO.slice(MIGRACAO.indexOf('CREATE OR REPLACE FUNCTION public.superadmin_criar_motor('))
        const corpo = criar.slice(0, criar.indexOf('$fn$;'))
        expect(corpo).not.toContain(`'${ORIGEM_PADRAO_DO_TEMPO}'`)
        expect(corpo).toContain("WHEN jsonb_typeof(t.e->'tempo_origem') IS DISTINCT FROM 'string' THEN true")
    })

    it('a frase dos tempos: todos, alguns e nenhum', () => {
        expect(fraseDosTempos(164, 164)).toBe('164 tipologias vieram com tempo de fabricação.')
        expect(fraseDosTempos(1, 3)).toBe('1 tipologia veio com tempo de fabricação; 2 sem tempo (a mão de obra delas não sai).')
        expect(fraseDosTempos(0, 3)).toContain('Nenhuma tipologia veio com tempo de fabricação')
    })
})
