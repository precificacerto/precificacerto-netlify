/**
 * Paridade entre `.claude/rules/` e o índice do `CLAUDE.md`.
 *
 * >>> POR QUE ISTO É TESTE, E NÃO UM CUIDADO <<<
 * `registro-de-classe.md` diz que conhecimento no lugar em que não se lê é conhecimento
 * perdido: "corpo de PR mergeado fica soterrado". Uma regra que existe no diretório e some do
 * índice está exatamente nesse estado — versionada, correta, e invisível para quem procura.
 *
 * Quando este arquivo foi escrito, 12 das 26 regras estavam fora do índice. Metade. Ninguém
 * errou de uma vez: cada rodada acrescentou a sua página e ninguém tocou na tabela, porque
 * nada quebrava. É a mesma forma do `portao-que-nao-alcanca.md` — o sinal não existia.
 *
 * A asserção é ESTRUTURAL de propósito, e é o caso-limite que `teste-que-nao-exercita.md`
 * admite: "o defeito era exatamente a ausência num dos dois e não há efeito numérico a medir".
 */

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const raiz = join(__dirname, '..', '..', '..')

/** Os arquivos de regra que EXISTEM no diretório. */
function regrasNoDiretorio(): string[] {
  return readdirSync(join(raiz, '.claude', 'rules'))
    .filter((f) => f.endsWith('.md'))
    .sort()
}

/** As regras LISTADAS na tabela do índice do CLAUDE.md. */
function regrasNoIndice(): string[] {
  const src = readFileSync(join(raiz, '.claude', 'CLAUDE.md'), 'utf-8')
  const linhas = [...src.matchAll(/^\|\s*`([a-z0-9-]+\.md)`\s*\|\s*(.+?)\s*\|\s*$/gm)]
  return linhas.map((m) => m[1]).sort()
}

describe('paridade `.claude/rules/` ↔ índice do CLAUDE.md', () => {
  const noDiretorio = regrasNoDiretorio()
  const noIndice = regrasNoIndice()

  it('a leitura encontrou as duas listas — senão a paridade passaria vazia', () => {
    // Sem esta guarda, um regex que deixasse de casar devolveria duas listas vazias e os
    // casos abaixo passariam VERDE sem ter comparado nada. É o verde decorativo que a regra
    // do portão descreve, e a guarda é o que o impede.
    expect(noDiretorio.length).toBeGreaterThan(20)
    expect(noIndice.length).toBeGreaterThan(20)
  })

  it('TODA regra do diretório está no índice — uma regra fora dele não é lida', () => {
    const foraDoIndice = noDiretorio.filter((f) => !noIndice.includes(f))
    expect(foraDoIndice).toEqual([])
  })

  it('TODA regra do índice existe no diretório — índice apontando para nada é pior que vazio', () => {
    const orfas = noIndice.filter((f) => !noDiretorio.includes(f))
    expect(orfas).toEqual([])
  })

  it('cada linha do índice tem descrição não vazia', () => {
    const src = readFileSync(join(raiz, '.claude', 'CLAUDE.md'), 'utf-8')
    const semDescricao = [...src.matchAll(/^\|\s*`([a-z0-9-]+\.md)`\s*\|\s*(.*?)\s*\|\s*$/gm)]
      .filter((m) => m[2].trim().length < 10)
      .map((m) => m[1])
    // Uma linha sem descrição cumpre a paridade e não ajuda ninguém a decidir se abre o
    // arquivo — é presença sem informação.
    expect(semDescricao).toEqual([])
  })
})
