/**
 * As nove abas por tipologia com o CABEÇALHO e a AMOSTRA do spec do arquivo do fornecedor
 * (`docs/fornecedor/motor_abas_spec.json`, medido no Motor_Wolf_PVC.xlsx de 3.126.092 bytes), na forma
 * `{ coluna: valor }` que os testes usam para montar a planilha do motor. É amostra, não o arquivo:
 * serve para o leitor ter as abas que exige, com dado real.
 */
import { ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SPEC = require('../../../../docs/fornecedor/motor_abas_spec.json') as { abas: Array<{ nome: string; cabecalho: unknown[]; amostra: unknown[][] }> }

export type CelulasDoSpec = Record<number, string | number | null>

const celulas = (valores: readonly unknown[]): CelulasDoSpec =>
    Object.fromEntries(valores.map((v, i) => [i + 1, v === '' || v === undefined ? null : (v as string | number | null)]))

/** As nove abas: o cabeçalho do spec na linha 1 e as linhas de amostra em seguida. */
export function abasDoSpec(): Record<string, CelulasDoSpec[]> {
    return Object.fromEntries(ABAS_DO_MOTOR.map((a) => {
        const s = SPEC.abas.find((x) => x.nome === a.nome)
        if (!s) throw new Error(`a aba "${a.nome}" não está no spec`)
        return [a.nome, [celulas(s.cabecalho), ...s.amostra.map(celulas)]]
    }))
}

/** A amostra de uma aba como linhas pelo nome do cabeçalho, com a ordem da planilha (linha 2 em diante). */
export function amostraDoSpec(nome: string): Array<{ ordem: number; valores: Record<string, unknown> }> {
    const s = SPEC.abas.find((x) => x.nome === nome)
    if (!s) throw new Error(`a aba "${nome}" não está no spec`)
    return s.amostra.map((linha, i) => ({ ordem: i + 2, valores: Object.fromEntries(s.cabecalho.map((c, j) => [String(c), linha[j] === '' ? null : linha[j]])) }))
}
