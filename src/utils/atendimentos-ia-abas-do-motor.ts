/**
 * Atendimentos I.A. — AS ABAS DO MOTOR POR TIPOLOGIA: o mapa ÚNICO entre o cabeçalho de cada aba do
 * arquivo do fornecedor e a coluna da tabela do banco que a guarda.
 *
 * ══ POR QUE UM MAPA SÓ ══
 * O mesmo mapeamento é usado nos DOIS sentidos:
 *   - na IMPORTAÇÃO, planilha → linha do banco (`lerAbasDoMotor`, chamado pelo leitor da importação);
 *   - no CÁLCULO, linha do banco → aba com cabeçalho (`abasDoBanco`), que é a forma que o avaliador de
 *     fórmulas já lê (`lerTipologia`, pelo NOME da coluna).
 * Escrito duas vezes, um dos lados esqueceria uma coluna e nada falharia (`copia-divergente.md`).
 *
 * ══ AS DECISÕES DO DONO DO PRODUTO (25/10/2026) ══
 *   - FÓRMULA E CONDIÇÃO entram como TEXTO LITERAL, nunca parseadas na gravação. Toda coluna é texto,
 *     menos os limites e as contagens do Detalhe, que já são `integer` em produção. O texto é o da
 *     célula como o leitor da importação o lê (`valorDaCelula`: sem os espaços das pontas); célula vazia
 *     é NULL, nunca '' (`ausente-vs-falso.md`). Número numa coluna de texto vira o texto do número.
 *   - SEM tenant_id: o catálogo do fornecedor é global e chega às contas pelos fornecedores que a base de conhecimento de cada uma vincula (`tabelas-da-conta.ts`).
 *   - UNICIDADE: `ordem` é o número da linha na aba, e (tabela_id, tipologia, ordem) é única em todas as
 *     abas por tipologia. Fórmulas e Variáveis têm ALÉM DISSO a chave natural (tabela_id, tipologia,
 *     variavel) — medida limpa no arquivo de 3.126.092 bytes (4.468 e 3.573 pares, zero duplicata). A
 *     duplicata é RECUSADA AQUI, nomeando o par, antes de o banco recusar sem dizer onde.
 *   - A OTIMIZAÇÃO DE BARRAS é parâmetro do FORNECEDOR, não da tipologia: chave (tabela_id, parametro),
 *     o valor como texto literal ("6000", "IL50/WOLFF 5.500 mm; KT16 5.800 mm …").
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-abas-do-motor.test.ts`.
 */
import type ExcelJS from 'exceljs'

import { valorDaCelula } from '@/utils/atendimentos-ia-importacao-celula'

export type TipoDaColuna = 'texto' | 'inteiro'
export type ColunaDaAba = { cabecalho: string; coluna: string; tipo: TipoDaColuna }

export type AbaDeclarada = {
    /** O nome da aba no arquivo do fornecedor. */
    nome: string
    /** A tabela do banco que guarda a aba. */
    tabela: string
    /** A chave da lista no payload de `importar_conteudo_da_tabela`. */
    payload: string
    /** Tem a coluna 'Código' (a tipologia). A Otimização não tem. */
    porTipologia: boolean
    colunas: readonly ColunaDaAba[]
    /** A chave natural, além da posição: coluna do banco cujo valor não se repete (por tipologia, quando há). */
    unica?: string
}

const texto = (cabecalho: string, coluna: string): ColunaDaAba => ({ cabecalho, coluna, tipo: 'texto' })
const inteiro = (cabecalho: string, coluna: string): ColunaDaAba => ({ cabecalho, coluna, tipo: 'inteiro' })
const LINHA = texto('Linha', 'linha')
const CODIGO = texto('Código', 'tipologia')

/** As nove abas, na ordem em que a importação as grava. Os cabeçalhos são os do arquivo, letra por letra. */
export const ABAS_DO_MOTOR: readonly AbaDeclarada[] = [
    {
        nome: 'Detalhe Tipologias', tabela: 'orcamentista_motor_tipologia_detalhe', payload: 'detalhes', porTipologia: true, unica: 'tipologia',
        colunas: [
            LINHA, CODIGO, texto('Descrição', 'descricao'), texto('Tipo', 'tipo'),
            inteiro('Larg. mín (mm)', 'larg_min_mm'), inteiro('Larg. máx (mm)', 'larg_max_mm'),
            inteiro('Alt. mín (mm)', 'alt_min_mm'), inteiro('Alt. máx (mm)', 'alt_max_mm'),
            texto('Fonte limite', 'fonte_limite'),
            inteiro('Nº perfis', 'n_perfis'), inteiro('Nº vidros', 'n_vidros'), inteiro('Nº insumos', 'n_insumos'),
        ],
    },
    {
        nome: 'Fórmulas', tabela: 'orcamentista_motor_formula', payload: 'formulas_da_tipologia', porTipologia: true, unica: 'variavel',
        colunas: [LINHA, CODIGO, texto('Variável', 'variavel'), texto('Descrição', 'descricao'), texto('Fórmula', 'formula')],
    },
    {
        nome: 'Perfis', tabela: 'orcamentista_motor_perfil', payload: 'perfis', porTipologia: true,
        colunas: [
            LINHA, CODIGO, texto('Perfil', 'perfil'), texto('Descrição', 'descricao'), texto('Corte', 'corte'), texto('Qtd', 'qtd'),
            texto('Medida', 'medida'), texto('Posição', 'posicao'), texto('Esp. vidro', 'esp_vidro'), texto('Condição', 'condicao'), texto('Obs.', 'obs'),
        ],
    },
    {
        nome: 'Vidros', tabela: 'orcamentista_motor_vidro', payload: 'vidros', porTipologia: true,
        colunas: [
            LINHA, CODIGO, texto('Vidro', 'vidro'), texto('Largura', 'largura'), texto('Altura', 'altura'), texto('Qtd', 'qtd'),
            texto('Fixação', 'fixacao'), texto('Condição', 'condicao'),
        ],
    },
    {
        nome: 'Baguete x Vidro', tabela: 'orcamentista_motor_baguete', payload: 'baguetes', porTipologia: true,
        colunas: [
            LINHA, CODIGO, texto('Baguete', 'baguete'), texto('Descrição', 'descricao'),
            texto('Espessuras de vidro (mm)', 'espessuras_vidro'), texto('Qtd × medida (condição)', 'qtd_medida_condicao'),
        ],
    },
    {
        nome: 'Insumos', tabela: 'orcamentista_motor_insumo', payload: 'insumos', porTipologia: true,
        colunas: [
            LINHA, CODIGO, texto('Insumo', 'insumo'), texto('Descrição', 'descricao'), texto('Qtd (fórmula)', 'qtd'),
            texto('Condição', 'condicao'), texto('Obs.', 'obs'),
        ],
    },
    {
        nome: 'Variáveis', tabela: 'orcamentista_motor_variavel', payload: 'variaveis_da_tipologia', porTipologia: true, unica: 'variavel',
        colunas: [
            LINHA, CODIGO, texto('Var.', 'variavel'), texto('Descrição', 'descricao'), texto('Padrão', 'padrao'),
            texto('Mín–Máx', 'min_max'), texto('Condição', 'condicao'), texto('Opções', 'opcoes'),
        ],
    },
    {
        nome: 'Validações', tabela: 'orcamentista_motor_validacao', payload: 'validacoes', porTipologia: true,
        colunas: [LINHA, CODIGO, texto('Condição válida', 'condicao_valida'), texto('Mensagem', 'mensagem')],
    },
    {
        nome: 'Otimização de barras', tabela: 'orcamentista_motor_otimizacao', payload: 'otimizacao', porTipologia: false, unica: 'parametro',
        colunas: [texto('Parâmetro', 'parametro'), texto('Valor', 'valor')],
    },
]

export const abaDeclarada = (nome: string): AbaDeclarada => {
    const a = ABAS_DO_MOTOR.find((x) => x.nome === nome)
    if (!a) throw new Error(`aba não declarada: ${nome}`)
    return a
}

/** Uma linha pronta para o banco: as colunas declaradas mais `ordem`, sem `id` e sem `tabela_id`. */
export type LinhaDoBanco = Record<string, string | number | null>

// ── Planilha → banco ──────────────────────────────────────────────────────────────────────
function valorDaColuna(c: ColunaDaAba, bruto: unknown): { valor: string | number | null } | { erro: string } {
    if (bruto === null || bruto === undefined || bruto === '') return { valor: null }
    if (c.tipo === 'inteiro') {
        if (typeof bruto === 'number' && Number.isInteger(bruto)) return { valor: bruto }
        return { erro: `"${c.cabecalho}" não é número inteiro: ${JSON.stringify(bruto)}` }
    }
    if (bruto instanceof Date) return { valor: bruto.toISOString().slice(0, 10) }
    return { valor: String(bruto) }
}

/**
 * Converte UMA linha da aba (os valores pelo nome do cabeçalho) na linha do banco. `ordem` é o número
 * da linha na aba. Recusa, dizendo a aba, a linha e a coluna: inteiro que não é inteiro, e linha de aba
 * por tipologia sem o 'Código' (sem ele não há a que tipologia a linha pertence).
 */
export function linhaDoBanco(aba: AbaDeclarada, valores: Readonly<Record<string, unknown>>, ordem: number): { linha: LinhaDoBanco } | { erros: string[] } {
    const linha: LinhaDoBanco = { ordem }
    const erros: string[] = []
    for (const c of aba.colunas) {
        const v = valorDaColuna(c, valores[c.cabecalho])
        if ('erro' in v) erros.push(`Aba "${aba.nome}", linha ${ordem}: ${v.erro}.`)
        else linha[c.coluna] = v.valor
    }
    if (aba.porTipologia && linha.tipologia === null) erros.push(`Aba "${aba.nome}", linha ${ordem}: a linha tem conteúdo e não tem o "Código" da tipologia.`)
    if (aba.unica && aba.unica !== 'tipologia' && linha[aba.unica] === null) {
        const cab = aba.colunas.find((c) => c.coluna === aba.unica)?.cabecalho
        erros.push(`Aba "${aba.nome}", linha ${ordem}: a linha não tem "${cab}".`)
    }
    return erros.length ? { erros } : { linha }
}

/** A chave natural repetida dentro da aba: recusa nomeando o par e as duas linhas. */
export function duplicatasDaChave(aba: AbaDeclarada, linhas: readonly LinhaDoBanco[]): string[] {
    if (!aba.unica) return []
    const vistas = new Map<string, number>()
    const erros: string[] = []
    for (const l of linhas) {
        const chave = aba.porTipologia && aba.unica !== 'tipologia' ? JSON.stringify([l.tipologia, l[aba.unica]]) : JSON.stringify([l[aba.unica]])
        const antes = vistas.get(chave)
        if (antes === undefined) { vistas.set(chave, l.ordem as number); continue }
        const par = aba.porTipologia && aba.unica !== 'tipologia' ? `${l.tipologia} / ${l[aba.unica]}` : String(l[aba.unica])
        erros.push(`Aba "${aba.nome}": "${par}" aparece duas vezes, nas linhas ${antes} e ${l.ordem}.`)
    }
    return erros
}

export type AbasLidas = { ok: true; linhas: Record<string, LinhaDoBanco[]> } | { ok: false; erros: string[] }

/**
 * Lê as nove abas do arquivo do motor, pelo NOME do cabeçalho (a primeira linha da aba). Todas as
 * recusas saem de uma vez: aba ausente, coluna ausente no cabeçalho, valor inválido, chave repetida.
 */
export function lerAbasDoMotor(wb: ExcelJS.Workbook): AbasLidas {
    const erros: string[] = []
    const linhas: Record<string, LinhaDoBanco[]> = {}
    for (const aba of ABAS_DO_MOTOR) {
        const ws = wb.getWorksheet(aba.nome)
        if (!ws) { erros.push(`O arquivo do motor não tem a aba "${aba.nome}".`); continue }
        const cabecalho = new Map<string, number>()
        ws.getRow(1).eachCell({ includeEmpty: false }, (cel, col) => {
            const v = valorDaCelula(cel.value).valor
            if (typeof v === 'string') cabecalho.set(v, col)
        })
        const faltam = aba.colunas.filter((c) => !cabecalho.has(c.cabecalho)).map((c) => `"${c.cabecalho}"`)
        if (faltam.length) { erros.push(`A aba "${aba.nome}" não tem no cabeçalho: ${faltam.join(', ')}.`); continue }
        const daAba: LinhaDoBanco[] = []
        for (let r = 2; r <= ws.rowCount; r++) {
            const row = ws.getRow(r)
            const valores: Record<string, unknown> = {}
            let vazia = true
            for (const c of aba.colunas) {
                const { valor, erro } = valorDaCelula(row.getCell(cabecalho.get(c.cabecalho) as number).value)
                if (erro) erros.push(`Aba "${aba.nome}", linha ${r}, coluna "${c.cabecalho}": ${erro}.`)
                valores[c.cabecalho] = valor
                if (valor !== null) vazia = false
            }
            if (vazia) continue
            const l = linhaDoBanco(aba, valores, r)
            if ('erros' in l) erros.push(...l.erros)
            else daAba.push(l.linha)
        }
        erros.push(...duplicatasDaChave(aba, daAba))
        linhas[aba.payload] = daAba
    }
    return erros.length ? { ok: false, erros } : { ok: true, linhas }
}

// ── Banco → aba com cabeçalho (a forma que o avaliador lê) ────────────────────────────────
export type AbaComCabecalho = { cabecalho: string[]; linhas: Array<Record<string, unknown>> }

/** As linhas do banco de UMA aba, de volta à forma da planilha: cabeçalho e valores pelo nome dele, na ordem da aba. */
export function abaDoBanco(aba: AbaDeclarada, linhas: readonly Readonly<Record<string, unknown>>[]): AbaComCabecalho {
    const ordenadas = [...linhas].sort((a, b) => Number(a.ordem) - Number(b.ordem))
    return {
        cabecalho: aba.colunas.map((c) => c.cabecalho),
        linhas: ordenadas.map((l) => Object.fromEntries(aba.colunas.map((c) => [c.cabecalho, l[c.coluna] ?? null]))),
    }
}
