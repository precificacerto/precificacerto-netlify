/**
 * O número que um comentário de migração declara tem de ser o número que a migração produz.
 *
 * O rodapé da `20260915000005` dizia "esperado: 7" e são 9: os três `LIKE` da consulta também
 * casam com as duas constraints que a `20260915000004` criou em `budgets`. O erro foi meu, e
 * passou porque um comentário não é executado — nada o confere.
 *
 * É a forma de `portao-que-nao-alcanca.md` no material mais barato que existe: o texto que
 * orienta a verificação estava errado, e quem seguisse o rodapé concluiria que a migração
 * falhou quando ela funcionou. Este arquivo é o portão que faltava.
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const ler = (f: string) => readFileSync(join(dir, f), 'utf-8')

/** Remove os comentários de linha, para não contar o que está escrito NELES. */
const semComentarios = (sql: string) => sql.replace(/--.*$/gm, '')

/**
 * Os nomes de constraint que uma migração CRIA, incluindo os montados dinamicamente por
 * `format(...)` dentro de um `FOREACH t IN ARRAY ARRAY[...]`.
 */
function constraintsCriadas(sql: string): string[] {
  const corpo = semComentarios(sql)
  const nomes: string[] = []

  // Forma estática: ADD CONSTRAINT nome_literal
  for (const m of corpo.matchAll(/ADD CONSTRAINT\s+([a-z0-9_]+)/g)) nomes.push(m[1])

  // Forma dinâmica: cada bloco FOREACH multiplica os sufixos pelas tabelas do seu ARRAY.
  for (const bloco of corpo.matchAll(/FOREACH\s+t\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\]([\s\S]*?)END LOOP/g)) {
    const tabelas = [...bloco[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    const sufixos = new Set([...bloco[2].matchAll(/t\s*\|\|\s*'(_[a-z_]+)'/g)].map((x) => x[1]))
    for (const t of tabelas) for (const suf of sufixos) nomes.push(t + suf)
  }
  return [...new Set(nomes)]
}

describe('a contagem declarada no rodapé bate com o que a migração faz', () => {
  const ARQUIVO = '20260915000005_travessia_dos_acrescimos_ate_a_venda.sql'

  it('o parser encontrou constraints — senão os casos abaixo passariam vazios', () => {
    expect(constraintsCriadas(ler(ARQUIVO)).length).toBeGreaterThan(5)
  })

  it('a `20260915000005` cria exatamente 7 constraints', () => {
    expect(constraintsCriadas(ler(ARQUIVO)).sort()).toEqual([
      'budgets_freight_allocation_base_check',
      'orders_accessory_values_non_negative_check',
      'orders_freight_allocation_base_check',
      'orders_freight_allocation_criteria_check',
      'sales_accessory_values_non_negative_check',
      'sales_freight_allocation_base_check',
      'sales_freight_allocation_criteria_check',
    ])
  })

  it('a consulta do rodapé devolve 9 — as 7 desta mais as 2 de `budgets` da 0004', () => {
    // Reproduz os três LIKE da consulta sobre TODAS as constraints das duas migrações. É a
    // conta que o comentário errado não fez: ele contou o que a migração cria, e a consulta
    // devolve o que EXISTE.
    const todas = [
      ...constraintsCriadas(ler(ARQUIVO)),
      ...constraintsCriadas(ler('20260915000004_acrescimos_no_orcamento_com_rateio.sql')),
    ]
    const casam = todas.filter((c) =>
      c.endsWith('_freight_allocation_criteria_check') ||
      c.endsWith('_accessory_values_non_negative_check') ||
      c.endsWith('_freight_allocation_base_check'),
    )
    expect(casam).toHaveLength(9)
    // E é o número que o rodapé declara.
    expect(ler(ARQUIVO)).toMatch(/esperado:\s*9\b/)
    expect(ler(ARQUIVO)).not.toMatch(/esperado:\s*7\b/)
  })

  it('as contagens de COLUNA declaradas nos três rodapés batem com os `ADD COLUMN`', () => {
    // A mesma classe, no outro número de cada rodapé.
    const esperado: Record<string, number> = {
      '20260915000005_travessia_dos_acrescimos_ate_a_venda.sql': 13,
    }
    for (const [arquivo, n] of Object.entries(esperado)) {
      const sql = semComentarios(ler(arquivo))
      expect([...sql.matchAll(/ADD COLUMN IF NOT EXISTS/g)]).toHaveLength(n)
      expect(ler(arquivo)).toMatch(new RegExp(`esperado:\\s*${n} linhas`))
    }
  })
})
