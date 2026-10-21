/**
 * PORTÃO 2 — CLIENTES SAI DE CADASTROS E VIRA SEÇÃO PRÓPRIA, NOS DOIS LADOS.
 *
 * E "nos dois lados" é a regra, não o acabamento: mover no MENU e esquecer o grupo de
 * Permissões de Acesso deixa o usuário sem achar, na tela que concede o acesso, a seção que
 * ele vê na barra lateral. `cascata-lucro-real.md`, Parte 4, chama essa paridade de
 * inviolável, e é ela que este portão exerce.
 *
 * O ponto que a varredura do rótulo "Itens" NÃO achou, porque não contém a palavra "Itens":
 * `funcionarios/index.tsx` agrupa `customers` dentro de `'Cadastros'`. Tirar Clientes de
 * CADASTROS no menu obriga a tirar daquele grupo NO MESMO COMMIT.
 *
 * ══ TRÊS VOCABULÁRIOS DE SEÇÃO, E POR ISSO A TABELA É EXPLÍCITA ══════════════════════════
 *
 * As três estruturas nomeiam seção de formas diferentes, e exigir string idêntica seria
 * afirmar uma uniformidade que não existe:
 *
 * | onde | como |
 * |---|---|
 * | `nav.component.tsx` | chave minúscula (`cadastros`) + rótulo à parte (`'Cadastros'`) |
 * | `mobile-more-drawer.component.tsx` | a string direto no item (`section: 'Cadastros'`) |
 * | `funcionarios/index.tsx` | `title` do grupo (`'Cadastros'`) |
 *
 * E elas já divergem de propósito num ponto: o nav tem `geral` com rótulo VAZIO, o drawer
 * chama de `'Início'`, e as permissões de `'Geral'`. A tabela `SECAO_DO_NAV_PARA_GRUPO`
 * registra a correspondência em vez de a inferir.
 *
 * ══ E O QUE O SUPER ADMIN VÊ, QUE ATÉ AGORA NÃO TINHA PORTÃO NENHUM ═════════════════════
 *
 * `sectionsToHideForSuperAdmin` esconde seções INTEIRAS de um perfil, e nada afirmava quais.
 * Uma seção podia sumir para o super admin e ninguém notaria. O último bloco deste arquivo
 * afirma, seção por seção, se ela é escondida ou não — e CLIENTES fica de fora da lista de
 * propósito: ver o bloco.
 */

import fs from 'fs'
import path from 'path'

import { MODULES } from '@/hooks/use-permissions.hook'
import { ROUTES } from '@/constants/routes'
import { MODULE_LABELS } from '@/constants/module-labels'
import { SECOES_ESCONDIDAS_DO_SUPER_ADMIN } from '@/constants/secoes-escondidas-do-super-admin'

const RAIZ = path.resolve(__dirname, '../../..')
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')

const NAV = 'src/components/layout/nav.component.tsx'
const DRAWER = 'src/components/layout/mobile-more-drawer.component.tsx'
const PERMISSOES = 'src/pages/funcionarios/index.tsx'

/**
 * A seção do nav → o `title` do grupo em Permissões. Correspondência DECLARADA.
 *
 * Desde 19/10/2026 ela serve SÓ à paridade com as Permissões. O drawer mobile passou a declarar
 * a chave do desktop em cada item (`sectionKey`), e a paridade desktop × drawer compara chave
 * com chave — o código declara o que este teste antes adivinhava pelo rótulo. Para as
 * Permissões a tabela continua: `funcionarios/index.tsx` agrupa por `title`, e não há chave lá.
 */
const SECAO_DO_NAV_PARA_GRUPO: Record<string, string> = {
  geral: 'Geral',
  cadastros: 'Cadastros',
  clientes: 'Clientes',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  agendamentos: 'Agendamentos',
  operacional: 'Operacional',
  // 21/10/2026: a seção ganhou o item do tenant, "Orçamentista", e o grupo nas permissões entrou
  // no MESMO commit. Os itens do super admin não têm `module`, e o leitor do menu os ignora.
  'atendimentos-ia': 'Atendimentos I.A.',
}

function corpo(texto: string, marcador: string, abre: '{' | '[') {
  const fecha = abre === '{' ? '}' : ']'
  const i = texto.indexOf(marcador)
  if (i < 0) return ''
  const igual = texto.indexOf('=', i)
  const ini = texto.indexOf(abre, igual)
  if (ini < 0) return ''
  let d = 0
  for (let j = ini; j < texto.length; j++) {
    if (texto[j] === abre) d++
    else if (texto[j] === fecha) { d--; if (d === 0) return texto.slice(ini, j + 1) }
  }
  return ''
}

/** `MODULES.X` → seção, lido do arquivo do menu. Um módulo mora em UMA seção só. */
function secaoPorModuloDoNav(): Record<string, string> {
  const texto = ler(NAV)
  const bloco = texto.slice(texto.indexOf('const navigationItems'), texto.indexOf('const sections:'))
  const fora: Record<string, string> = {}
  for (const m of bloco.matchAll(/key:\s*'[^']+'/g)) {
    const trecho = bloco.slice(m.index ?? 0, (m.index ?? 0) + 500)
    const sec = /section:\s*'([^']+)'/.exec(trecho)
    const mod = /module:\s*MODULES\.([A-Z_]+)/.exec(trecho)
    if (!sec || !mod) continue
    const chave = (MODULES as Record<string, string>)[mod[1]]
    if (chave) fora[chave] = sec[1]
  }
  return fora
}

/** `MODULES.X` → seção, lido do drawer mobile, que usa a string direto. */
function secaoPorModuloDoDrawer(): Record<string, string> {
  const fora: Record<string, string> = {}
  for (const m of ler(DRAWER).matchAll(/key:\s*'[^']+'[^\n]*/g)) {
    const sec = /section:\s*'([^']+)'/.exec(m[0])
    const mod = /module:\s*MODULES\.([A-Z_]+)/.exec(m[0])
    if (!sec || !mod) continue
    const chave = (MODULES as Record<string, string>)[mod[1]]
    if (chave) fora[chave] = sec[1]
  }
  return fora
}

/** `title` do grupo → chaves, lido de `PERMISSION_SECTIONS`. */
function gruposDasPermissoes(): Record<string, string[]> {
  const bloco = corpo(ler(PERMISSOES), 'const PERMISSION_SECTIONS', '[')
  const fora: Record<string, string[]> = {}
  for (const m of bloco.matchAll(/title:\s*'([^']+)'\s*,\s*modules:\s*\[([^\]]*)\]/g)) {
    fora[m[1]] = [...m[2].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1])
  }
  return fora
}

function grupoPorModulo(): Record<string, string> {
  const fora: Record<string, string> = {}
  for (const [titulo, chaves] of Object.entries(gruposDasPermissoes())) {
    for (const c of chaves) fora[c] = titulo
  }
  return fora
}

/**
 * As seções escondidas do super admin — o VALOR da constante, importado.
 *
 * Até 19/10/2026 este leitor varria o código-fonte de `nav.component.tsx` atrás do `[` depois de
 * `const sectionsToHideForSuperAdmin =`. Ele afirmava a GRAFIA e o ENDEREÇO da constante, não o
 * valor dela: medido, com a lista movida para um módulo próprio ele devolveu LISTA VAZIA em vez de
 * falhar — `ausente-vs-falso.md` dentro do instrumento, e `instrumento-que-nao-enxerga.md` na
 * forma. A partir daqui ele lê o que o menu e o drawer leem.
 */
function escondidasDoSuperAdmin(): string[] {
  return [...SECOES_ESCONDIDAS_DO_SUPER_ADMIN]
}

/**
 * `MODULES.X` → a `sectionKey` declarada no drawer mobile (a CHAVE do desktop, desde 19/10/2026).
 * Lida do arquivo, com guarda de alcance no caso que a usa: o número de `sectionKey` lidas tem
 * de ser o número de itens.
 */
function chavePorModuloDoDrawer(): Record<string, string> {
  const fora: Record<string, string> = {}
  for (const m of ler(DRAWER).matchAll(/key:\s*'[^']+'[^\n]*/g)) {
    const sec = /sectionKey:\s*'([^']+)'/.exec(m[0])
    const mod = /module:\s*MODULES\.([A-Z_]+)/.exec(m[0])
    if (!sec || !mod) continue
    const chave = (MODULES as Record<string, string>)[mod[1]]
    if (chave) fora[chave] = sec[1]
  }
  return fora
}

/** As seções declaradas, na ordem em que o menu as renderiza. */
function secoesDoNav(): { key: string; label: string }[] {
  const b = corpo(ler(NAV), 'const sections:', '[')
  // `[a-z-]+`, com o HÍFEN, desde 19/10/2026 (bloco 2B.2): com `[a-z]+` a seção `atendimentos-ia`
  // não era lida, e o caso "toda seção declarada está classificada" passava VERDE sem tê-la
  // classificado — o leitor não enxergava justamente a seção nova (`instrumento-que-nao-enxerga.md`).
  return [...b.matchAll(/key:\s*'([a-z-]+)'\s*,\s*label:\s*'([^']*)'/g)].map((m) => ({ key: m[1], label: m[2] }))
}

describe('PORTÃO 2 (a) — a leitura alcança as três estruturas', () => {
  // Sem esta guarda, um padrão que deixasse de casar devolveria mapas vazios e toda a
  // paridade abaixo passaria VERDE sem ter comparado nada.
  it('o menu desktop entrega mais de 15 módulos com seção', () => {
    expect(Object.keys(secaoPorModuloDoNav()).length).toBeGreaterThan(15)
  })
  it('o drawer mobile entrega mais de 15 módulos com seção', () => {
    expect(Object.keys(secaoPorModuloDoDrawer()).length).toBeGreaterThan(15)
  })
  it('as permissões entregam mais de 15 módulos com grupo', () => {
    expect(Object.keys(grupoPorModulo()).length).toBeGreaterThan(15)
  })
})

describe('PORTÃO 2 (b) — Clientes tem seção PRÓPRIA no menu', () => {
  it('no desktop, customers saiu de cadastros', () => {
    expect(secaoPorModuloDoNav()[MODULES.CUSTOMERS]).toBe('clientes')
  })

  it('a seção existe na lista de seções, com rótulo', () => {
    expect(secoesDoNav()).toContainEqual({ key: 'clientes', label: 'Clientes' })
  })

  it('no drawer mobile, customers saiu de Cadastros', () => {
    expect(secaoPorModuloDoDrawer()[MODULES.CUSTOMERS]).toBe('Clientes')
  })

  it('nenhum outro módulo foi arrastado para a seção nova', () => {
    const doNav = Object.entries(secaoPorModuloDoNav()).filter(([, s]) => s === 'clientes')
    expect(doNav.map(([m]) => m)).toEqual([MODULES.CUSTOMERS])
  })
})

describe('PORTÃO 2 (c) — e o grupo de Permissões acompanhou, no MESMO commit', () => {
  it('existe um grupo só de Clientes', () => {
    expect(gruposDasPermissoes()['Clientes']).toEqual(['customers'])
  })

  it("'Cadastros' não tem mais customers", () => {
    expect(gruposDasPermissoes()['Cadastros']).not.toContain('customers')
  })

  it('e Cadastros continua com os outros cinco, na ordem', () => {
    // O que NÃO muda importa tanto quanto o que muda: mover um só é o defeito.
    expect(gruposDasPermissoes()['Cadastros']).toEqual([
      'items', 'products', 'services', 'stock', 'employees',
    ])
  })
})

describe('PORTÃO 2 (d) — PARIDADE: mover num lado e esquecer o outro fica VERMELHO', () => {
  it('todo módulo do menu tem rótulo na fonte única', () => {
    const semRotulo = Object.keys(secaoPorModuloDoNav()).filter((m) => !MODULE_LABELS[m])
    expect(semRotulo).toEqual([])
  })

  it('todo módulo do menu está em algum grupo de Permissões', () => {
    const grupos = grupoPorModulo()
    expect(Object.keys(secaoPorModuloDoNav()).filter((m) => !grupos[m])).toEqual([])
  })

  it('nenhum grupo de Permissões tem módulo que o menu não tenha', () => {
    const doNav = Object.keys(secaoPorModuloDoNav())
    expect(Object.keys(grupoPorModulo()).filter((m) => !doNav.includes(m))).toEqual([])
  })

  it('>>> a SEÇÃO do menu corresponde ao GRUPO das permissões, módulo a módulo <<<', () => {
    const doNav = secaoPorModuloDoNav()
    const grupos = grupoPorModulo()
    const divergentes: { modulo: string; secaoDoMenu: string; grupoEsperado: string; grupoReal: string }[] = []
    for (const [modulo, secao] of Object.entries(doNav)) {
      const esperado = SECAO_DO_NAV_PARA_GRUPO[secao]
      if (!esperado) continue // seção sem correspondente declarado (superadmin) fica fora
      if (grupos[modulo] !== esperado) {
        divergentes.push({ modulo, secaoDoMenu: secao, grupoEsperado: esperado, grupoReal: grupos[modulo] })
      }
    }
    expect(divergentes).toEqual([])
  })

  // Desde 19/10/2026 a comparação é CHAVE com CHAVE: o drawer declara a `sectionKey` do desktop,
  // e a tabela `SECAO_DO_NAV_PARA_GRUPO` saiu deste caso.
  it('e o drawer mobile concorda com o desktop, seção por seção', () => {
    const desk = secaoPorModuloDoNav()
    const mob = chavePorModuloDoDrawer()
    expect(Object.keys(mob).length).toBeGreaterThan(15)
    const divergentes: { modulo: string; desktop: string; mobile: string }[] = []
    for (const [modulo, secao] of Object.entries(desk)) {
      if (!(modulo in mob)) continue
      // `Início` (`geral`) no drawer é a faixa de ATALHOS do topo (Home, Caixa, Fluxo de Caixa),
      // não uma seção de módulo: Caixa e Fluxo de Caixa moram em `financeiro` no desktop. Por
      // isso os atalhos não entram na correspondência.
      if (mob[modulo] === 'geral') continue
      if (mob[modulo] !== secao) divergentes.push({ modulo, desktop: secao, mobile: mob[modulo] })
    }
    expect(divergentes).toEqual([])
  })

  // O que substitui a tabela, para o drawer: toda chave que ele declara existe no desktop. A
  // única exceção é `conta` — no desktop, Minha Conta, Configurações, Planos, Suporte e Sair
  // moram no RODAPÉ, não numa seção; por isso ela é declarada aqui, e não inferida.
  it('toda `sectionKey` do drawer existe entre as chaves de seção do desktop (exceto `conta`)', () => {
    const texto = ler(DRAWER)
    const declaradas = [...texto.matchAll(/sectionKey:\s*'([^']+)'/g)].map((m) => m[1])
    // Alcance: uma `sectionKey` por item. Se o leitor deixar de casar, a contagem acusa.
    expect(declaradas.length).toBe([...texto.matchAll(/\{ key:\s*'[^']+'/g)].length)
    const doDesktop = secoesDoNav().map((s) => s.key)
    expect([...new Set(declaradas)].filter((k) => k !== 'conta' && !doDesktop.includes(k))).toEqual([])
  })
})

describe('PORTÃO 2 (e) — o que o SUPER ADMIN vê, seção por seção', () => {
  /*
    ATÉ AQUI ESTE COMPORTAMENTO NÃO TINHA PORTÃO NENHUM. `sectionsToHideForSuperAdmin`
    (`nav.component.tsx`) remove do menu, por SEÇÃO, todo item cujo `section` esteja na
    lista — e nada afirmava quais estavam. Uma seção podia sumir para um perfil e ninguém
    notaria, que é `ausente-vs-falso.md` na visibilidade: a ausência não reclama.

    O comentário do próprio arquivo diz a razão da lista: são as "abas de usuário", as seções
    de tenant. `superadmin` é a única seção fora dela, e é a dele.
  */
  const ESPERADO: Record<string, boolean> = {
    geral: true,
    cadastros: true,
    // >>> CLIENTES É ESCONDIDA — AFIRMAÇÃO INVERTIDA EM 19/10/2026, por decisão do dono do
    // produto <<<
    // Em 15/10/2026 este caso afirmava o CONTRÁRIO (`clientes: false`): Clientes era a seção
    // de consulta, e o super admin, "exatamente quem precisa dela". Mudou porque o `AuthGuard`
    // (`_app.tsx`) devolve o super admin ao painel em toda rota fora de `/super-admin/*` e
    // `/minha-conta` — o menu oferecia um destino que o guarda proibia, e o clique ia e
    // voltava. O super admin não tem tenant: cliente pertence a uma conta, e ele não é dono de
    // nenhuma. As duas pontas, menu e guarda, são afirmadas juntas em
    // `o-super-admin-nao-ve-clientes.test.tsx`.
    clientes: true,
    comercial: true,
    financeiro: true,
    agendamentos: true,
    operacional: true,
    // Atendimentos I.A. (bloco 2B.2, 19/10/2026): é DO super admin — os itens são `superAdminOnly`
    // e moram sob `/super-admin/`, que o `AuthGuard` deixa ele abrir.
    'atendimentos-ia': false,
    superadmin: false,
  }

  // A GUARDA, agora com sentido: ela não mede se o leitor alcança o arquivo — ele lê o valor —,
  // mede se a lista existe. Se alguém esvaziar a lista, ou tirar Clientes dela, o caso cai.
  it('a lista importada tem mais de 3 seções e contém clientes', () => {
    expect(escondidasDoSuperAdmin().length).toBeGreaterThan(3)
    expect(escondidasDoSuperAdmin()).toContain('clientes')
  })

  it('toda seção declarada está classificada aqui, e vice-versa', () => {
    // Impede que uma seção nova entre no menu sem que alguém decida se o super admin a vê.
    expect(secoesDoNav().map((s) => s.key).sort()).toEqual(Object.keys(ESPERADO).sort())
  })

  it.each(Object.entries(ESPERADO))('a seção %s é escondida do super admin? %s', (secao, escondida) => {
    expect(escondidasDoSuperAdmin().includes(secao)).toBe(escondida)
  })

  it('o filtro é por SEÇÃO, e é assim que ele esconde', () => {
    // A linha que aplica a lista. Se alguém trocar por um filtro por ITEM, os casos acima
    // continuariam verdes afirmando uma lista que não governa mais nada.
    expect(ler(NAV)).toContain('isSuperAdmin && item.section && sectionsToHideForSuperAdmin.includes(item.section)')
  })
})

describe('PORTÃO 2 (f) — o que NÃO muda', () => {
  it('a rota de Clientes continua a mesma', () => {
    expect(ROUTES.CLIENTS).toBe('/clientes')
  })

  it("MODULES.CUSTOMERS continua 'customers' — está gravado em user_module_permissions", () => {
    // 3 linhas com module='customers' medidas em produção em 13/10/2026.
    expect(MODULES.CUSTOMERS).toBe('customers')
  })

  it('o rótulo do item de menu continua "Clientes" — a SEÇÃO é que é nova', () => {
    expect(ler(NAV)).toMatch(/key:\s*'clients',\s*label:\s*'Clientes'/)
    expect(MODULE_LABELS.customers).toBe('Clientes')
  })
})
