/**
 * PORTÃO 1 — UMA FONTE DE RÓTULOS DE MÓDULO, E "Itens" → "Custos Itens".
 *
 * Três telas exibiam o rótulo de cada módulo de permissão a partir de TRÊS mapas escritos à
 * mão. Medido em 14/10/2026, antes da correção:
 *
 * | mapa | arquivo | chaves |
 * |---|---|---|
 * | A | `pages/admin/usuarios.tsx` | **15** |
 * | B | `pages/funcionarios/[id]/permissoes.tsx` | 21 |
 * | C | `pages/funcionarios/index.tsx` | 21 |
 *
 * A **faltavam seis**: `commission`, `commissions_report`, `orders`, `recurrence`,
 * `rt_commission`, `sales_report` — a tela de permissões do admin caía no `|| m` e exibia a
 * CHAVE CRUA (`sales_report`) para seis módulos. E quatro chaves divergiam de rótulo:
 *
 * | chave | A | B | C | o menu diz |
 * |---|---|---|---|---|
 * | `home` | Home | **Início** | Home | Home |
 * | `dfc` | **DFC** | Análise Financeira | Análise Financeira | Análise Financeira |
 * | `reports` | **Relatórios** | Relatório Agenda | Relatório Agenda | Relatório Agenda |
 *
 * É `copia-divergente.md` consumada, e o remédio dela é o que esta rodada aplica: **apagar
 * duas**, não conferir as três.
 *
 * O `cash_flow` NÃO é divergência e o rótulo dele fica com a barra. `nav.component.tsx:124`
 * ("Fluxo de Caixa") e `:134` ("Controle Financeiro") são DOIS itens de menu no MESMO
 * `MODULES.CASH_FLOW`; o rótulo de permissão nomeia o que a permissão CONCEDE, e ela concede
 * as duas telas.
 *
 * ESTE PORTÃO É ESTÁTICO DE PROPÓSITO. Ele lê os quatro arquivos como TEXTO em vez de
 * importá-los, por duas razões:
 *
 *  1. importar uma página do Next arrasta a árvore inteira de componentes, e os dois mapas
 *     de hoje são `const` de módulo não exportadas — não há o que importar;
 *  2. uma suíte que não CARREGA não contribui caso nenhum, então `Tests: N passed` não muda
 *     e o vermelho não aparece onde se olha. É a aparição 6 de `portao-que-nao-alcanca.md`,
 *     e lendo texto o portão roda mesmo com a fonte única ainda inexistente.
 *
 * O que o faz FICAR VERMELHO: qualquer um dos três pontos voltar a declarar rótulo próprio
 * que divirja, a fonte única perder uma chave, o rótulo "Custos Itens" voltar a "Itens", ou
 * uma CHAVE mudar.
 */

import fs from 'fs'
import path from 'path'

import { MODULES, MODULOS_CONCEDIVEIS } from '@/hooks/use-permissions.hook'
import { ROUTES } from '@/constants/routes'
import { PAGE_TITLES } from '@/constants/page-titles'

const RAIZ = path.resolve(__dirname, '../../..')
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')
const existe = (rel: string) => fs.existsSync(path.join(RAIZ, rel))

const FONTE = 'src/constants/module-labels.ts'
const A = 'src/pages/admin/usuarios.tsx'
const B = 'src/pages/funcionarios/[id]/permissoes.tsx'
const C = 'src/pages/funcionarios/index.tsx'

/**
 * O corpo delimitado que segue a primeira ocorrência de `marcador`, por contagem de pares.
 *
 * `abre` é `{` para objeto e `[` para array — `PERMISSION_SECTIONS` é um ARRAY de seções, e
 * parar no primeiro `}` devolveria só a primeira seção.
 *
 * Ancorado no `=`, e não no marcador: a ANOTAÇÃO DE TIPO de `PERMISSION_SECTIONS` contém
 * `}[]`, e procurar o primeiro `[` depois do nome cairia nela em vez de no valor. Os dois
 * detalhes são defeitos que este mesmo portão teve e que custaram leitura errada —
 * `instrumento-que-nao-enxerga.md`.
 */
function corpoDepoisDe(texto: string, marcador: string, abre: '{' | '[' = '{'): string {
  const fecha = abre === '{' ? '}' : ']'
  const i = texto.indexOf(marcador)
  if (i < 0) return ''
  const igual = texto.indexOf('=', i)
  if (igual < 0) return ''
  const ini = texto.indexOf(abre, igual)
  if (ini < 0) return ''
  let d = 0
  for (let j = ini; j < texto.length; j++) {
    if (texto[j] === abre) d++
    else if (texto[j] === fecha) { d--; if (d === 0) return texto.slice(ini, j + 1) }
  }
  return ''
}

/** Pares `chave: 'Rótulo'` de um corpo de objeto literal. */
function paresLiterais(corpo: string): Record<string, string> {
  const fora: Record<string, string> = {}
  for (const m of corpo.matchAll(/(?:^|\n)\s*([a-z_][a-z_0-9]*)\s*:\s*'([^']*)'/g)) {
    fora[m[1]] = m[2]
  }
  return fora
}

/** A fonte única, lida como texto. `{}` quando ela ainda não existe. */
function rotulosDaFonte(): Record<string, string> {
  if (!existe(FONTE)) return {}
  return paresLiterais(corpoDepoisDe(ler(FONTE), 'const ROTULOS'))
}

/**
 * A tela declara mapa PRÓPRIO?
 *
 * Estrutural de propósito, e por um furo medido: decidir isso por `paresLiterais` exigiria o
 * par no COMEÇO DA LINHA, e um literal escrito em UMA linha —
 * `const MODULE_LABELS = { home: 'Início' }` — não casaria, a função cairia na fonte única, e
 * o portão ficaria VERDE com a divergência reintroduzida. A presença da DECLARAÇÃO não
 * depende de formatação.
 */
function declaraMapaProprio(rel: 'A' | 'B' | 'C'): boolean {
  const texto = ler(rel === 'A' ? A : rel === 'B' ? B : C)
  if (rel === 'C') return /label:\s*'/.test(corpoDepoisDe(texto, 'const PERMISSION_SECTIONS', '['))
  return /const\s+MODULE_LABELS\b/.test(texto)
}

/**
 * O MAPA EFETIVO de um ponto de exibição.
 *
 * Se o arquivo ainda declara rótulo próprio, é esse que vale — é o que o usuário vê. Só
 * quando ele não declara nenhum é que se resolve pela fonte única.
 */
function mapaEfetivo(rel: 'A' | 'B' | 'C'): Record<string, string> {
  const fonte = rotulosDaFonte()

  if (rel === 'C') {
    const corpo = corpoDepoisDe(ler(C), 'const PERMISSION_SECTIONS', '[')
    const comLabel = [...corpo.matchAll(/key:\s*'([a-z_0-9]+)'\s*,\s*label:\s*'([^']*)'/g)]
    if (comLabel.length > 0) return Object.fromEntries(comLabel.map((m) => [m[1], m[2]]))
    // Sem `label:` inline: C guarda só o AGRUPAMENTO, e o rótulo vem da fonte.
    const chaves = [...corpo.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1])
    return Object.fromEntries(chaves.map((k) => [k, fonte[k]]))
  }

  const corpo = corpoDepoisDe(ler(rel === 'A' ? A : B), 'const MODULE_LABELS')
  const literais = paresLiterais(corpo)
  if (Object.keys(literais).length > 0) return literais
  return fonte
}

/** As 22 chaves rotuláveis: todo módulo MENOS `users_management`, que nunca foi concedível. */
const CHAVES_ROTULAVEIS = (Object.values(MODULES) as string[])
  .filter((m) => m !== MODULES.USERS_MANAGEMENT)
  .sort()

/**
 * 18/10/2026 — O PORTÃO DAS 21 CHAVES VIROU 22, e o que as TELAS mostram deixou de ser o mesmo
 * conjunto que a FONTE rotula. Entrou `orcamentista` (Orçamentista, bloco 1). Decisão do dono do
 * produto: a chave fica NA FONTE ÚNICA, com rótulo, e FORA das telas de permissão até o bloco 2,
 * pelo mesmo mecanismo de `users_management` (`MODULOS_NAO_CONCEDIVEIS`). O bloco 2 traz a aba
 * e a permissão juntas, e a paridade menu ↔ permissões se cumpre por construção.
 *
 * Então são DOIS conjuntos, e cada caso afirma o seu: a FONTE rotula os 22; as TRÊS TELAS
 * mostram os CONCEDÍVEIS (21) e os mostram com a MESMA string. Quando o bloco 2 tirar
 * `orcamentista` da lista de não concedíveis, os dois conjuntos voltam a coincidir sem que este
 * arquivo mude.
 */
const CHAVES_CONCEDIVEIS = [...MODULOS_CONCEDIVEIS].sort()

function listarArquivos(dir: string): string[] {
  const fora: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) fora.push(...listarArquivos(p))
    else fora.push(p)
  }
  return fora
}

describe('PORTÃO 1 (a) — as CHAVES não mudam', () => {
  it("MODULES.ITEMS continua 'items' — está gravado em user_module_permissions.module", () => {
    // 3 linhas em produção com module='items', medidas em 13/10/2026. Trocar a chave invalida
    // permissão já concedida; o rótulo é que muda.
    expect(MODULES.ITEMS).toBe('items')
  })

  it("ROUTES.ITEMS continua '/itens' — é rota, não rótulo", () => {
    expect(ROUTES.ITEMS).toBe('/itens')
  })

  it("os menus continuam usando key 'items'", () => {
    expect(ler('src/components/layout/nav.component.tsx')).toContain("key: 'items'")
    expect(ler('src/components/layout/mobile-more-drawer.component.tsx')).toContain("key: 'items'")
  })
})

describe('PORTÃO 1 (b) — a fonte rotula 22; as três telas mostram as MESMAS concedíveis', () => {
  it('a fonte única cobre exatamente os 22 módulos rotuláveis', () => {
    expect(Object.keys(rotulosDaFonte()).sort()).toEqual(CHAVES_ROTULAVEIS)
    expect(CHAVES_ROTULAVEIS).toHaveLength(22)
  })

  it.each(['A', 'B', 'C'] as const)('o mapa efetivo de %s cobre todas as concedíveis', (qual) => {
    const chaves = Object.keys(mapaEfetivo(qual))
    expect(CHAVES_CONCEDIVEIS.filter((k) => !chaves.includes(k))).toEqual([])
  })

  it('C — a única que guarda o AGRUPAMENTO — mostra exatamente as concedíveis, e nada além', () => {
    expect(Object.keys(mapaEfetivo('C')).sort()).toEqual(CHAVES_CONCEDIVEIS)
  })

  it('orcamentista está na fonte, com rótulo, e FORA das concedíveis até o bloco 2', () => {
    expect(rotulosDaFonte()[MODULES.ORCAMENTISTA]).toBe('Orçamentista')
    expect(CHAVES_CONCEDIVEIS).not.toContain(MODULES.ORCAMENTISTA)
    expect(CHAVES_ROTULAVEIS).toContain(MODULES.ORCAMENTISTA)
  })

  it('A deixou de ser subconjunto — as seis que faltavam estão lá', () => {
    // Sem elas, `MODULE_LABELS[m] || m` exibia a chave crua na tela do admin.
    const a = mapaEfetivo('A')
    for (const k of ['commission', 'commissions_report', 'orders', 'recurrence', 'rt_commission', 'sales_report']) {
      expect(Object.keys(a)).toContain(k)
    }
  })
})

describe('PORTÃO 1 (b2) — nenhuma das três declara rótulo PRÓPRIO, e as duas telas importam', () => {
  it.each(['A', 'B', 'C'] as const)('%s não tem mapa de rótulos próprio', (qual) => {
    // Independe de formatação: o que se proíbe é a DECLARAÇÃO, não um jeito de escrevê-la.
    expect(declaraMapaProprio(qual)).toBe(false)
  })

  it.each([A, B] as const)('%s importa a fonte única', (arquivo) => {
    expect(ler(arquivo)).toContain("from '@/constants/module-labels'")
  })

  it('C importa a fonte e guarda só o AGRUPAMENTO', () => {
    const c = ler(C)
    expect(c).toContain("from '@/constants/module-labels'")
    expect(c).toContain('rotuloDoModulo')
    // As seções continuam aqui — é o que C tem de próprio.
    expect(c).toContain("title: 'Cadastros'")
  })
})

describe('PORTÃO 1 (c) — para cada concedível, os três devolvem a MESMA string', () => {
  // É ESTE o caso que impede a divergência voltar, e é ele que falha hoje.
  it.each(CHAVES_CONCEDIVEIS)('%s tem um rótulo só', (chave) => {
    const a = mapaEfetivo('A')[chave]
    const b = mapaEfetivo('B')[chave]
    const c = mapaEfetivo('C')[chave]
    expect({ A: a, B: b, C: c }).toEqual({ A: a, B: a, C: a })
    expect(typeof a).toBe('string')
    expect(a).not.toBe('')
  })

  it('os três rótulos que divergiam ficam com o do MENU, porque é o que o usuário lê', () => {
    const f = rotulosDaFonte()
    expect(f.home).toBe('Home')
    expect(f.dfc).toBe('Análise Financeira')
    expect(f.reports).toBe('Relatório Agenda')
  })

  it('cash_flow nomeia as DUAS telas que a permissão concede — não é divergência', () => {
    expect(rotulosDaFonte().cash_flow).toBe('Fluxo de Caixa / Controle Financeiro')
  })
})

describe('PORTÃO 1 (d) — "Itens" virou "Custos Itens" em todo ponto de RÓTULO', () => {
  it('a fonte única', () => {
    expect(rotulosDaFonte().items).toBe('Custos Itens')
  })

  it('o menu desktop e o drawer mobile', () => {
    expect(ler('src/components/layout/nav.component.tsx')).toContain("label: 'Custos Itens'")
    expect(ler('src/components/layout/mobile-more-drawer.component.tsx')).toContain("label: 'Custos Itens'")
  })

  it('o título da página', () => {
    expect(PAGE_TITLES.ITEMS).toBe('Custos Itens')
  })

  it('as duas mensagens do estoque que citam a aba', () => {
    const estoque = ler('src/pages/estoque/index.tsx')
    const citacoes = [...estoque.matchAll(/aba "([^"]+)"/g)].map((m) => m[1])
    expect(citacoes.length).toBe(2)
    expect(citacoes).toEqual(['Custos Itens', 'Custos Itens'])
  })

  it('nenhum ponto de rótulo ficou com "Itens" sozinho', () => {
    for (const rel of [
      'src/components/layout/nav.component.tsx',
      'src/components/layout/mobile-more-drawer.component.tsx',
      'src/constants/page-titles.ts',
      FONTE,
    ]) {
      if (!existe(rel)) continue
      expect(ler(rel)).not.toMatch(/label:\s*'Itens'|ITEMS\s*=\s*'Itens'|items:\s*'Itens'/)
    }
  })
})

describe('PORTÃO 1 (e) — a quarta lista de menu, morta e com o rótulo velho, saiu', () => {
  it('design-tokens não exporta mais navigationItems', () => {
    // Não era importada por ninguém e guardava `label: 'Itens'` com rotas defasadas
    // (`/orcamentos-vendas`) e sem Clientes. Código morto com rótulo velho é a próxima
    // divergência — `copia-divergente.md`.
    expect(ler('src/styles/design-tokens.ts')).not.toContain('navigationItems')
  })

  it('e ninguém a importava, então a remoção não tem consumidor a quebrar', () => {
    // `__tests__` sai da varredura: este arquivo cita o nome para poder proibi-lo, e
    // incluí-lo faria o portão acusar a si mesmo.
    const importadores = listarArquivos(path.join(RAIZ, 'src'))
      .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
      .filter((f) => /import[\s\S]{0,200}navigationItems[\s\S]{0,80}from/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(RAIZ, f))
    // `nav.component.tsx` declara uma LOCAL com o mesmo nome; o que não pode existir é IMPORT.
    expect(importadores).toEqual([])
  })
})
