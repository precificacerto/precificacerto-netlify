/**
 * Atendimentos I.A. — O TEMPO DE FABRICAÇÃO NO ARQUIVO DO MOTOR (dono do produto, 05/11/2026; migração 20261106000001).
 *
 * "O tempo de fabricação de cada tipologia virá na tabela das tipologias [...] tudo dentro do motor, em uma coluna específica" — a dívida
 * registrada em 27/10/2026 (`.claude/rules/tabela-de-preco-por-categoria.md`). As duas colunas moram na aba "Detalhe Tipologias", depois de
 * "Nº insumos", e vão para `orcamentista_motor_tipologia_tempo` (não para a Detalhe: o tempo tem tabela própria desde a 20261024000003).
 *
 * AS DECISÕES DO DONO DO PRODUTO, como foram dadas:
 *   - cabeçalho exato "Tempo fabricação (min)": minutos INTEIROS, por unidade de esquadria;
 *   - vazio = NÃO INFORMADO: a tipologia fica sem linha de tempo, e a mão de obra "não sai", nomeada. Vazio NUNCA vira 0 (`ausente-vs-falso.md`);
 *   - zero, negativo ou texto: recusa nomeando a linha e a coluna (o decimal também: "minutos inteiros");
 *   - "Origem do tempo", opcional: preenchida, vai para `tempo_origem` como a empresa escreveu (texto livre de 1 a 120 caracteres, sem espaço nas
 *     pontas — o leitor apara, como toda célula); vazia, `IMPORTADO`. Serve para distinguir o medido do estimado;
 *   - cabeçalho PARECIDO (sem acento, outra caixa, outro espaçamento) é recusado nomeando o que achou e o que esperava: lido como coluna ausente,
 *     ele faria o motor entrar sem tempo nenhum, em silêncio.
 *
 * O que é leitura do assistente, dita ao dono do produto no PR: a origem preenchida numa linha SEM tempo é recusa (origem de tempo nenhum não
 * diz nada, e a célula vazia ao lado é provavelmente esquecimento); a linha com tempo e sem o "Código" é recusa (não há a que tipologia ele
 * pertence); um tempo que não cabe num `integer` do banco é recusa, com a frase, em vez do erro do banco.
 *
 * O PADRÃO `IMPORTADO` MORA AQUI E SÓ AQUI: a função do banco exige a origem preenchida (`copia-divergente.md`).
 */
import type ExcelJS from 'exceljs'

import { ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
import { valorDaCelula } from '@/utils/atendimentos-ia-importacao-celula'

export const ABA_DOS_TEMPOS = ABAS_DO_MOTOR[0].nome
export const CABECALHO_DO_TEMPO = 'Tempo fabricação (min)'
export const CABECALHO_DA_ORIGEM = 'Origem do tempo'
export const ORIGEM_PADRAO_DO_TEMPO = 'IMPORTADO'
/** O limite da origem (dono do produto, 05/11/2026: "a maior tem 85 caracteres [...] Use 120, não 60"). É o mesmo da CHECK da 20261106000001. */
export const ORIGEM_DO_TEMPO_MAX = 120
/** O maior `integer` do Postgres: acima dele o INSERT cairia com o erro do banco, sem dizer a linha. */
const MAIOR_INTEIRO_DO_BANCO = 2147483647
const CABECALHO_DO_CODIGO = 'Código'

/** Uma linha de `orcamentista_motor_tipologia_tempo`, como o leitor a entrega à função (o motor e o autor vêm dela). */
export type TempoLido = { tipologia: string; tempo_fabricacao_min: number; tempo_origem: string }
export type TemposLidos = { ok: true; tempos: TempoLido[] } | { ok: false; erros: string[] }

/** O cabeçalho reduzido: sem acento, sem caixa e com os espaços colapsados — só para ACHAR o parecido, nunca para aceitá-lo. */
export const cabecalhoReduzido = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Caracteres como o banco os conta (`char_length`): por ponto de código, não por unidade UTF-16. */
const caracteres = (s: string) => [...s].length

/**
 * Lê os tempos da aba "Detalhe Tipologias". A aba e o "Código" são conferidos por `lerAbasDoMotor`; aqui, sem a aba, não há tempo a ler e
 * nenhuma frase a dar (a recusa da aba ausente sai de lá). Todas as recusas saem de uma vez.
 */
export function lerTemposDoDetalhe(wb: ExcelJS.Workbook): TemposLidos {
    const ws = wb.getWorksheet(ABA_DOS_TEMPOS)
    if (!ws) return { ok: true, tempos: [] }
    const erros: string[] = []
    const colunas = new Map<string, number>()
    ws.getRow(1).eachCell({ includeEmpty: false }, (cel, col) => {
        const v = valorDaCelula(cel.value).valor
        if (typeof v !== 'string') return
        if (v === CABECALHO_DO_TEMPO || v === CABECALHO_DA_ORIGEM || v === CABECALHO_DO_CODIGO) {
            if (colunas.has(v)) erros.push(`A aba "${ABA_DOS_TEMPOS}" tem o cabeçalho "${v}" duas vezes: não sei qual ler.`)
            else colunas.set(v, col)
            return
        }
        for (const esperado of [CABECALHO_DO_TEMPO, CABECALHO_DA_ORIGEM]) {
            if (cabecalhoReduzido(v) === cabecalhoReduzido(esperado)) {
                erros.push(`A aba "${ABA_DOS_TEMPOS}" tem o cabeçalho "${v}", parecido com "${esperado}": escreva exatamente "${esperado}".`)
            }
        }
    })
    const colTempo = colunas.get(CABECALHO_DO_TEMPO)
    const colOrigem = colunas.get(CABECALHO_DA_ORIGEM)
    const colCodigo = colunas.get(CABECALHO_DO_CODIGO)
    if (erros.length) return { ok: false, erros }
    if (colTempo === undefined && colOrigem === undefined) return { ok: true, tempos: [] }

    const tempos: TempoLido[] = []
    const onde = (r: number, cab: string) => `Aba "${ABA_DOS_TEMPOS}", linha ${r}, coluna "${cab}"`
    for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const tempo = colTempo === undefined ? { valor: null } : valorDaCelula(row.getCell(colTempo).value)
        const origem = colOrigem === undefined ? { valor: null } : valorDaCelula(row.getCell(colOrigem).value)
        if (tempo.erro) erros.push(`${onde(r, CABECALHO_DO_TEMPO)}: ${tempo.erro}.`)
        if (origem.erro) erros.push(`${onde(r, CABECALHO_DA_ORIGEM)}: ${origem.erro}.`)
        if (tempo.erro || origem.erro) continue
        if (tempo.valor === null) {
            if (origem.valor !== null) erros.push(`${onde(r, CABECALHO_DA_ORIGEM)}: a origem está preenchida e o tempo de fabricação está vazio.`)
            continue // vazio = não informado: sem linha de tempo, nunca 0
        }
        const v = tempo.valor
        if (typeof v !== 'number') {
            erros.push(`${onde(r, CABECALHO_DO_TEMPO)}: o tempo de fabricação tem de ser um número inteiro de minutos, e veio ${JSON.stringify(v instanceof Date ? v.toISOString().slice(0, 10) : v)}.`)
            continue
        }
        if (!Number.isInteger(v)) { erros.push(`${onde(r, CABECALHO_DO_TEMPO)}: o tempo de fabricação tem de ser em minutos inteiros, e veio ${v}.`); continue }
        if (v <= 0) { erros.push(`${onde(r, CABECALHO_DO_TEMPO)}: o tempo de fabricação tem de ser maior que zero, e veio ${v}.`); continue }
        if (v > MAIOR_INTEIRO_DO_BANCO) { erros.push(`${onde(r, CABECALHO_DO_TEMPO)}: ${v} minutos não cabe no banco.`); continue }

        let textoDaOrigem = ORIGEM_PADRAO_DO_TEMPO
        if (origem.valor !== null) {
            textoDaOrigem = origem.valor instanceof Date ? origem.valor.toISOString().slice(0, 10) : String(origem.valor)
            const n = caracteres(textoDaOrigem)
            if (n > ORIGEM_DO_TEMPO_MAX) { erros.push(`${onde(r, CABECALHO_DA_ORIGEM)}: a origem tem ${n} caracteres, e o limite é ${ORIGEM_DO_TEMPO_MAX}.`); continue }
        }
        const codigo = colCodigo === undefined ? { valor: null } : valorDaCelula(row.getCell(colCodigo).value)
        if (codigo.valor === null || codigo.erro) {
            erros.push(`Aba "${ABA_DOS_TEMPOS}", linha ${r}: a linha tem tempo de fabricação e não tem o "${CABECALHO_DO_CODIGO}" da tipologia.`)
            continue
        }
        tempos.push({ tipologia: String(codigo.valor), tempo_fabricacao_min: v, tempo_origem: textoDaOrigem })
    }
    return erros.length ? { ok: false, erros } : { ok: true, tempos }
}

/** Quantas tipologias do motor entram com tempo, e quantas sem — o que a tela diz ao criar ou trocar o arquivo. */
export function fraseDosTempos(tempos: number, tipologias: number): string {
    if (tempos === 0) return 'Nenhuma tipologia veio com tempo de fabricação: a mão de obra delas não sai até o arquivo trazer a coluna "Tempo fabricação (min)".'
    const sem = tipologias - tempos
    return `${tempos} ${tempos === 1 ? 'tipologia veio' : 'tipologias vieram'} com tempo de fabricação`
        + (sem > 0 ? `; ${sem} sem tempo (a mão de obra delas não sai).` : '.')
}
