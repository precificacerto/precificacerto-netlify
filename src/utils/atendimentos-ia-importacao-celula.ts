/**
 * O conversor ÚNICO de célula do exceljs, usado pelo leitor da importação e pelo das abas do motor
 * (`atendimentos-ia-abas-do-motor.ts`). Mora em arquivo próprio para os dois o importarem sem
 * importar um ao outro. Portão: `atendimentos-ia-importacao-leitor.test.ts`.
 */
import type ExcelJS from 'exceljs'

export type ValorLido = string | number | Date | null

/**
 * O valor de UMA célula do exceljs, em todas as formas que ela chega:
 *   - fórmula (`{formula, result}` ou `{sharedFormula, result}`) → o `result`, convertido de novo.
 *     As colunas de valor da tabela da Wolff SÃO fórmulas; gravar o objeto, ou NULL, seria
 *     perder o preço. Fórmula sem resultado gravado → NULL + erro, nunca o texto da fórmula;
 *   - `richText` → o texto juntado; hyperlink → o texto;
 *   - `error` (`#N/A`, `#REF!`…) → NULL + erro, que vira aviso;
 *   - Date, número → como vieram; texto → aparado, e vazio vira NULL; booleano → texto.
 */
export function valorDaCelula(celula: ExcelJS.CellValue | undefined): { valor: ValorLido; erro?: string } {
    if (celula === null || celula === undefined) return { valor: null }
    if (typeof celula === 'number') return Number.isFinite(celula) ? { valor: celula } : { valor: null, erro: `número inválido (${celula})` }
    if (typeof celula === 'string') { const t = celula.trim(); return { valor: t === '' ? null : t } }
    if (typeof celula === 'boolean') return { valor: celula ? 'VERDADEIRO' : 'FALSO' }
    if (celula instanceof Date) return { valor: celula }
    const o = celula as unknown as Record<string, unknown>
    if ('error' in o) return { valor: null, erro: `erro na planilha: ${String(o.error)}` }
    if ('formula' in o || 'sharedFormula' in o) {
        if (!('result' in o) || o.result === undefined) return { valor: null, erro: 'fórmula sem resultado gravado no arquivo' }
        return valorDaCelula(o.result as ExcelJS.CellValue)
    }
    if (Array.isArray(o.richText)) return valorDaCelula((o.richText as Array<{ text?: string }>).map((p) => p.text ?? '').join(''))
    if ('text' in o) return valorDaCelula(o.text as ExcelJS.CellValue)
    return { valor: null, erro: 'célula de tipo desconhecido' }
}
