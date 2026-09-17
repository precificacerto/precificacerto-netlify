/**
 * Correção 8 — renomeação Cascata → Decomposição, com paridade menu-permissões.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md`, seção "Renomeação". Relatório "Motor RRO —
 * Lucro Real", seção 6.5: "Renomear o item de menu exige renomear a seção em Permissões de
 * Acesso NO MESMO COMMIT — paridade menu-permissões é inviolável."
 *
 * >>> POR QUE UMA PARTE DESTE ARQUIVO AFIRMA ESTRUTURA, E NÃO EFEITO <<<
 * `teste-que-nao-exercita.md` proíbe afirmar caminho QUANDO EXISTE EFEITO MENSURÁVEL e ele
 * foi deixado de fora — e admite o caso-limite oposto: "o defeito era exatamente a ausência
 * num dos dois e não há efeito numérico a medir". A paridade menu-permissões é esse caso: o
 * defeito é um item existir de um lado e não do outro, e não há número a conferir.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

import {
  DECOMPOSITION_PDF_FILE_PREFIX,
  DECOMPOSITION_PDF_FOOTER,
  DECOMPOSITION_PDF_TITLE,
} from '@/lib/create-cascade-pdf'
import { DECOMPOSITION_LABEL } from '@/constants/decomposition-label'
import { MODULES } from '@/hooks/use-permissions.hook'

const raiz = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

const NAV = 'src/components/layout/nav.component.tsx'
const PERMISSOES_FUNCIONARIO = 'src/pages/funcionarios/[id]/permissoes.tsx'
const PERMISSOES_ADMIN = 'src/pages/admin/usuarios.tsx'

/** Os módulos que o MENU referencia, lidos do próprio arquivo do menu. */
function modulosDoMenu(): string[] {
  const src = ler(NAV)
  const chaves = [...src.matchAll(/module:\s*MODULES\.([A-Z_]+)/g)].map((m) => m[1])
  const valores = chaves.map((k) => (MODULES as Record<string, string>)[k])
  expect(valores.every((v) => typeof v === 'string')).toBe(true)
  return [...new Set(valores)]
}

/** As chaves rotuladas na tela de Permissões de Acesso indicada. */
function modulosRotulados(arquivo: string): string[] {
  const src = ler(arquivo)
  const bloco = src.slice(src.indexOf('MODULE_LABELS'), src.indexOf('}', src.indexOf('MODULE_LABELS')))
  return [...new Set([...bloco.matchAll(/^\s{2}([a-z_]+):\s*'/gm)].map((m) => m[1]))]
}

describe('correção 8 — renomeação e paridade menu-permissões', () => {
  describe('1. RENOMEAÇÃO — o nome que o usuário lê', () => {
    it('o rótulo é "Decomposição", e sai de UMA fonte', () => {
      expect(DECOMPOSITION_LABEL).toBe('Decomposição')
      // O bloco NÃO traz o nome antigo nem um literal próprio: ele consome a constante. Um
      // literal aqui é o que faz a próxima renomeação pegar dois dos três lugares.
      const bloco = ler('src/page-parts/shared/consolidated-dre-block.component.tsx')
      expect(bloco).toContain('DECOMPOSITION_LABEL')
      expect(bloco).not.toMatch(/📋 Memória cascata/)
    })

    it('o PDF foi renomeado nos TRÊS lugares — título, rodapé e nome do arquivo', () => {
      // Três, porque era em três literais espalhados que a renomeação pegaria só dois.
      expect(DECOMPOSITION_PDF_TITLE).toBe('Decomposição — Motor RRO')
      expect(DECOMPOSITION_PDF_FOOTER).toContain('Decomposição')
      expect(DECOMPOSITION_PDF_FILE_PREFIX).toBe('Decomposicao')
      expect(DECOMPOSITION_PDF_TITLE).not.toMatch(/Cascata/i)
      expect(DECOMPOSITION_PDF_FOOTER).not.toMatch(/Cascata/i)
      expect(DECOMPOSITION_PDF_FILE_PREFIX).not.toMatch(/Cascata/i)
    })

    it('nenhum texto VISÍVEL ainda diz "Memória Cascata" nas telas renomeadas', () => {
      for (const arquivo of [
        'src/page-parts/shared/consolidated-dre-block.component.tsx',
        'src/lib/create-cascade-pdf.ts',
      ]) {
        const src = ler(arquivo)
        // `aria-label` é texto que o usuário lê — com leitor de tela, mas lê.
        const ariaLabels = [...src.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1])
        for (const a of ariaLabels) expect(a).not.toMatch(/cascata/i)
      }
    })

    it('os IDENTIFICADORES INTERNOS continuam como estavam — e isso é deliberado', () => {
      // O contraste é a asserção. Renomear `cascade_trace` e `CascadeStep` é refatoração de
      // outra natureza: o dado já gravado carrega o nome antigo, e misturar as duas faria o
      // diff da renomeação deixar de ser legível. Se alguém os renomear achando que faltou,
      // este caso vermelho manda ler o motivo antes.
      const pdf = ler('src/lib/create-cascade-pdf.ts')
      expect(pdf).toContain('CascadeStep')
      expect(pdf).toContain('buildCascadeDoc')
    })
  })

  describe('2. PARIDADE MENU ↔ PERMISSÕES — inviolável', () => {
    const doMenu = modulosDoMenu()
    const noFuncionario = modulosRotulados(PERMISSOES_FUNCIONARIO)

    it('a leitura dos arquivos encontrou o que devia — senão a paridade passaria vazia', () => {
      // Sem esta guarda, um regex que deixasse de casar devolveria duas listas vazias e a
      // paridade abaixo passaria VERDE sem ter comparado nada. É `portao-que-nao-alcanca` em
      // forma de teste, e a guarda é o que impede.
      expect(doMenu.length).toBeGreaterThan(15)
      expect(noFuncionario.length).toBeGreaterThan(15)
    })

    it('TODO módulo do menu tem rótulo em Permissões de Acesso do funcionário', () => {
      const semRotulo = doMenu.filter((m) => !noFuncionario.includes(m))
      expect(semRotulo).toEqual([])
    })

    it('TODO módulo rotulado em Permissões existe no enum MODULES', () => {
      const valores = Object.values(MODULES) as string[]
      const orfaos = noFuncionario.filter((m) => !valores.includes(m))
      expect(orfaos).toEqual([])
    })

    it('a tela de Permissões do ADMIN não rotula módulo que o enum não tem', () => {
      const valores = Object.values(MODULES) as string[]
      const orfaos = modulosRotulados(PERMISSOES_ADMIN).filter((m) => !valores.includes(m))
      expect(orfaos).toEqual([])
    })
  })

  describe('3. O QUE A BUSCA ENCONTROU, e é preciso estar registrado', () => {
    it('NÃO existe item de menu nem módulo de permissão chamado "Cascata"', () => {
      // A seção 6.5 manda renomear o item de menu E a seção de Permissões no mesmo commit.
      // Consultadas as três fontes primárias — o enum `MODULES`, as duas telas de Permissões
      // e o arquivo do menu —, "Cascata" não aparece em nenhuma: ela é um BLOCO dentro do
      // orçamento, do pedido e da venda, nunca um item de menu.
      //
      // Não há, portanto, o que parear neste caso. Criar um módulo "Decomposição" para
      // "cumprir a paridade" seria inventar escopo. O que fica é a paridade GERAL, afirmada
      // acima, que protege a próxima renomeação — inclusive a de um menu que ainda não existe.
      const valores = Object.values(MODULES) as string[]
      expect(valores.some((v) => /cascat|decompos/i.test(v))).toBe(false)

      const nav = ler(NAV)
      const rotulosDeMenu = [...nav.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1])
      expect(rotulosDeMenu.length).toBeGreaterThan(15)
      expect(rotulosDeMenu.some((l) => /cascat/i.test(l))).toBe(false)
    })
  })
})
