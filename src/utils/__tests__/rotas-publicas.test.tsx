/**
 * QUEM É PÚBLICO — o portão do GUARDA, não da página.
 *
 * Correção de defeito em produção, 09/10/2026.
 *
 * ══ ESTE ARQUIVO EXISTE POR CAUSA DO DEFEITO QUE OS OUTROS 4.138 CASOS NÃO VIRAM ════════
 *
 * `https://app.precificacerto.com/agendar/<token>` pedia LOGIN, com o link LIGADO em
 * produção. Formulação do dono do produto, registrada como está:
 *
 *   O defeito passou porque TODOS os casos da página a renderizam SOZINHA, nunca através do
 *   guarda. O portão afirmava o componente, não a rota.
 *
 * Três rodadas construíram a página, oito rotas e três portões. `escolha-de-dia-e-hora.test.tsx`
 * monta o componente direto; `agendamento-fase2b-rotas.test.ts` chama os handlers direto;
 * `agendamento-publico-isolamento.test.ts` chama o handler da índice direto. **Nenhum deles
 * passa pelo `_app.tsx`** — então, para o defeito "a rota pública redireciona para o login",
 * nenhum instrumento do repositório podia ficar vermelho.
 *
 * É `portao-que-nao-alcanca.md`, pergunta 1: *"se eu introduzir o defeito que este portão
 * existe para barrar, ele fica vermelho?"* A resposta era **não**, em portão nenhum.
 *
 * Então este portão tem DOIS níveis, e os dois exercitam CAMINHOS:
 *
 *   A. a FUNÇÃO PURA que decide — `rotaEhPublica` / `rotaSemConta`
 *   B. o GUARDA DE VERDADE — `AuthGuard` renderizado, com `currentUser = null`, afirmando se
 *      `router.replace` foi chamado
 *
 * O nível B é o que alcança o defeito. Sem ele o A ficaria verde com um `_app.tsx` que
 * ignorasse a função.
 *
 * >>> O QUE ELE NÃO ALCANÇA <<<
 * O `middleware.ts` (que não redireciona — só põe o cabeçalho `x-pc-device`), o `vercel.json`
 * (que não tem `redirects`) e o `next.config.js` (que só tem `headers`). Os três foram lidos
 * na medição desta rodada e nenhum intercepta; se alguém acrescentar um `redirect` lá, este
 * portão não vê.
 */

import React, { type ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  PREFIXOS_SEM_CONTA, ROTAS_DE_AUTENTICACAO, rotaEhPublica, rotaSemConta,
} from '@/constants/rotas-publicas'

// ── o jsdom que o antd exige: o `AuthGuard` renderiza `<Spin>` no ramo não autorizado ──────
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    // `onchange: null` sem anotação infere `any` com `strictNullChecks: false` e sobe o
    // baseline do `tsc` em 1 — `TS7018`, a MESMA classe que já apareceu quatro vezes nesta
    // campanha. Medido: 364 contra 363. O tipo nomeia o que o valor é.
    onchange: null as ((e: any) => void) | null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// NÍVEL A — A FUNÇÃO PURA
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('NÍVEL A — `rotaEhPublica`: os seis caminhos que o comando listou', () => {
  it('>>> `/agendar/<token>` é PÚBLICA — é o defeito desta rodada <<<', () => {
    // `router.pathname` da rota dinâmica é `/agendar/[token]`, não a URL. Os dois entram.
    expect(rotaEhPublica('/agendar/[token]')).toBe(true)
    expect(rotaEhPublica('/agendar/qXIgt6acmQTMofuq1RR4EQ')).toBe(true)
  })

  it('>>> `/api/public/agenda/<token>` é PÚBLICA <<<', () => {
    expect(rotaEhPublica('/api/public/agenda/[token]')).toBe(true)
    expect(rotaEhPublica('/api/public/agenda/qXIgt6acmQTMofuq1RR4EQ')).toBe(true)
    // e as oito rotas da superfície pública, uma por uma
    for (const r of ['', '/servicos', '/horarios', '/agendar', '/codigo-solicitar',
      '/codigo-validar', '/cancelar', '/remarcar']) {
      expect(rotaEhPublica(`/api/public/agenda/[token]${r}`)).toBe(true)
    }
  })

  it('`/agenda` NÃO é pública — continua protegida', () => {
    // >>> O CASO QUE A MUTAÇÃO M28 MATA <<<
    // `/agenda` é a agenda INTERNA da barbearia. Ela e `/agendar/` são vizinhas no alfabeto e
    // opostas na proteção — é o par mais fácil de confundir desta correção.
    expect(rotaEhPublica('/agenda')).toBe(false)
    expect(rotaSemConta('/agenda')).toBe(false)
  })

  it('`/produtos` NÃO é pública', () => {
    expect(rotaEhPublica('/produtos')).toBe(false)
  })

  it('>>> `/admin/agendar/x` NÃO é pública — prova que NÃO é `includes` <<<', () => {
    // >>> O CASO QUE A MUTAÇÃO M27 MATA <<<
    // `'/admin/agendar/x'.includes('/agendar/')` é VERDADEIRO. Com `includes`, uma rota de
    // administração ficaria aberta — e rota do sistema aberta é pior que link que não abre.
    expect(rotaEhPublica('/admin/agendar/x')).toBe(false)
    expect(rotaSemConta('/admin/agendar/x')).toBe(false)
    // e o espelho, que prova que o caso acima mede o `startsWith` e não um acidente
    expect('/admin/agendar/x'.includes('/agendar/')).toBe(true)
  })

  it('>>> `/agendarX` NÃO é pública — prova que o prefixo exige a BARRA <<<', () => {
    // Sem a barra no prefixo, `'/agendarX'.startsWith('/agendar')` seria verdadeiro.
    expect(rotaEhPublica('/agendarX')).toBe(false)
    expect(rotaEhPublica('/agendar')).toBe(false)
    expect(rotaEhPublica('/agendario/x')).toBe(false)
    // idem do outro lado
    expect(rotaEhPublica('/api/publicX/y')).toBe(false)
    expect(rotaEhPublica('/api/publico/agenda')).toBe(false)
  })
})

describe('NÍVEL A — o que NÃO foi liberado junto', () => {
  it('nenhuma outra rota do sistema virou pública', () => {
    // Requisito 4: *"Se a sua correcao liberar qualquer outra rota, PARE."* A lista é longa de
    // propósito — é a asserção que pega um prefixo largo demais.
    const protegidas = [
      '/', '/agenda', '/produtos', '/produtos/criar', '/itens', '/categorias', '/caixa',
      '/dre', '/orcamentos', '/vendas', '/pedidos', '/clientes', '/servicos', '/funcionarios',
      '/admin/usuarios', '/admin/agendar/x', '/configuracoes', '/assinar', '/planos',
      '/onboarding', '/minha-conta', '/acesso-bloqueado', '/super-admin',
      '/super-admin/tenants', '/api/agenda', '/api/orcamentos', '/api/whatsapp/send-reminder',
      '/api/cron/whatsapp-reminders', '/api/publicar', '/apipublic/x',
    ]
    for (const r of protegidas) {
      expect(rotaEhPublica(r)).toBe(false)
    }
  })

  it('as TELAS DE AUTENTICAÇÃO seguem públicas — nenhuma saiu na mudança', () => {
    // Mover a lista de lugar não é lugar de mudar quem está dentro. Os cinco membros são os
    // mesmos que `PUBLIC_ROUTES` tinha em `_app.tsx`.
    expect([...ROTAS_DE_AUTENTICACAO]).toEqual([
      '/login', '/reset-password', '/super-admin/login', '/cadastro', '/criar-senha',
    ])
    for (const r of ROTAS_DE_AUTENTICACAO) expect(rotaEhPublica(r)).toBe(true)
    // a semântica antiga preservada: prefixo COM barra entra, sem barra não
    expect(rotaEhPublica('/login/esqueci')).toBe(true)
    expect(rotaEhPublica('/loginX')).toBe(false)
  })

  it('>>> MAS ELAS NÃO SÃO "SEM CONTA": `/login` PRECISA do `AuthProvider` <<<', () => {
    // A distinção que o módulo nomeia, afirmada. Se `rotaSemConta('/login')` fosse `true`, o
    // `_app.tsx` renderizaria o login FORA do `AuthProvider` — e o login pararia de logar.
    for (const r of ROTAS_DE_AUTENTICACAO) {
      expect(rotaSemConta(r)).toBe(false)
    }
    expect(rotaSemConta('/agendar/x')).toBe(true)
    expect(rotaSemConta('/api/public/agenda/x')).toBe(true)
  })

  it('>>> O CONJUNTO SEM CONTA TEM EXATAMENTE DOIS PREFIXOS <<<', () => {
    // Exigência do comando: *"se alguem acrescentar um terceiro, alguem tem que decidir."*
    // Um terceiro prefixo quebra este caso, e aí a decisão passa por uma pessoa.
    expect([...PREFIXOS_SEM_CONTA]).toEqual(['/agendar/', '/api/public/'])
    expect(PREFIXOS_SEM_CONTA).toHaveLength(2)
    // e os dois terminam em barra — é o que impede `/agendarX`
    for (const p of PREFIXOS_SEM_CONTA) expect(p.endsWith('/')).toBe(true)
  })

  it('entrada vazia, nula ou lixo NÃO é pública', () => {
    // Fechado por padrão: o que não se reconhece é protegido.
    for (const r of ['', null as any, undefined as any, 'agendar/x', '//agendar/x']) {
      expect(rotaEhPublica(r)).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// NÍVEL B — O GUARDA DE VERDADE
//
// >>> É ESTE NÍVEL QUE ALCANÇA O DEFEITO <<<
//
// O `AuthGuard` foi EXPORTADO de `_app.tsx` nesta rodada para que ele exista. Com
// `currentUser = null` e `loading = false` — o estado de quem chega pelo link do WhatsApp —
// cada caminho é renderizado e se afirma se `router.replace` foi chamado.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** O que o `useRouter` de mentira registrou. */
const replaces: string[] = []
let caminhoAtual = '/'

jest.mock('next/router', () => ({
  useRouter: () => ({
    pathname: caminhoAtual,
    asPath: caminhoAtual,
    replace: (url: string) => { replaces.push(url) },
    push: () => {},
    events: { on: () => {}, off: () => {} },
  }),
}))

/** O usuário de mentira: ninguém logado, carregamento terminado. */
let usuario: any = null
jest.mock('@/hooks/use-auth.hook', () => ({
  useAuth: () => ({ currentUser: usuario, loading: false }),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthGuard } = require('@/pages/_app') as { AuthGuard: (p: { children: ReactNode }) => any }

let host: HTMLDivElement | null = null
let root: Root | null = null

function renderizarGuarda(caminho: string) {
  caminhoAtual = caminho
  replaces.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(<AuthGuard><div data-conteudo="sim">conteúdo da página</div></AuthGuard>) })
}

afterEach(() => {
  if (root) act(() => { root!.unmount() })
  if (host && host.parentNode) host.parentNode.removeChild(host)
  root = null; host = null
  usuario = null
})

describe('NÍVEL B — o `AuthGuard` com NINGUÉM logado', () => {
  it('>>> `/agendar/[token]`: NÃO redireciona, e o conteúdo é renderizado <<<', () => {
    // >>> O CASO DO DEFEITO EM PRODUÇÃO <<<
    // Antes desta correção este caso ficava vermelho: `replaces` trazia
    // `/login?redirect=%2Fagendar%2F%5Btoken%5D`.
    renderizarGuarda('/agendar/[token]')
    expect(replaces).toEqual([])
    // e o EFEITO, não só a ausência de redirect: a página de fato aparece
    expect(document.body.querySelector('[data-conteudo="sim"]')).not.toBeNull()
  })

  it('>>> `/api/public/agenda/[token]`: NÃO redireciona <<<', () => {
    // Ressalva honesta: o `_app.tsx` NÃO roda para rota de API — o Next não monta o App para
    // elas, e o `matcher` do `middleware.ts` exclui `api`. Então esta rota já não era
    // interceptada antes da correção, e **não era ela o defeito**.
    //
    // O caso entra porque o comando o pede e porque ele afirma o CRITÉRIO: se alguém puser um
    // guarda de API amanhã, lendo a mesma função, o prefixo já está declarado público.
    renderizarGuarda('/api/public/agenda/[token]')
    expect(replaces).toEqual([])
  })

  it('>>> `/agenda`: REDIRECIONA — continua protegida <<<', () => {
    // O caso que a mutação M28 mata.
    renderizarGuarda('/agenda')
    expect(replaces).toHaveLength(1)
    expect(replaces[0]).toContain('/login?redirect=')
    // e o conteúdo NÃO é renderizado: o guarda mostra o `Spin`
    expect(document.body.querySelector('[data-conteudo="sim"]')).toBeNull()
  })

  it('>>> `/produtos`: REDIRECIONA <<<', () => {
    renderizarGuarda('/produtos')
    expect(replaces).toHaveLength(1)
    expect(replaces[0]).toContain('/login?redirect=')
    expect(document.body.querySelector('[data-conteudo="sim"]')).toBeNull()
  })

  it('>>> `/admin/agendar/x`: REDIRECIONA — prova que não é `includes` <<<', () => {
    // O caso que a mutação M27 mata, no nível do guarda.
    renderizarGuarda('/admin/agendar/x')
    expect(replaces).toHaveLength(1)
    expect(replaces[0]).toContain('/login?redirect=')
  })

  it('>>> `/agendarX`: REDIRECIONA — prova que o prefixo exige a barra <<<', () => {
    renderizarGuarda('/agendarX')
    expect(replaces).toHaveLength(1)
    expect(replaces[0]).toContain('/login?redirect=')
  })

  it('`/login` NÃO redireciona — as telas de autenticação seguem alcançáveis', () => {
    // O par obrigatório: sem ele, "não redireciona" ficaria verde num guarda que nunca
    // redirecionasse.
    renderizarGuarda('/login')
    expect(replaces).toEqual([])
    expect(document.body.querySelector('[data-conteudo="sim"]')).not.toBeNull()
  })

  it('o `redirect` da URL carrega o caminho de onde a pessoa veio', () => {
    // Afirma que o ramo de redirect é o MESMO de antes — a correção não mexeu nele.
    renderizarGuarda('/produtos')
    expect(replaces[0]).toBe(`/login?redirect=${encodeURIComponent('/produtos')}`)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// O `_app.tsx` LIDO COMO TEXTO — a parte que nenhum render alcança
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('o `_app.tsx` tem UMA fonte de verdade, e a página sem conta sai do envoltório', () => {
  const fs = require('fs')
  const path = require('path')
  const fonte = fs.readFileSync(
    path.resolve(__dirname, '../../pages/_app.tsx'), 'utf8',
  ) as string
  const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('>>> NÃO HÁ SEGUNDA LISTA: a antiga `PUBLIC_ROUTES` não existe mais <<<', () => {
    // Requisito 1: *"Nao espalhe condicao em dois lugares - duas listas divergem."* A medição
    // é do PROGRAMA sem comentários, porque o nome sobrevive no comentário que registra a
    // mudança — e ele deve sobreviver.
    expect(programa).not.toContain('PUBLIC_ROUTES')
    expect(programa).toContain('rotaEhPublica(router.pathname)')
    expect(programa).toContain("from '@/constants/rotas-publicas'")
    // e nenhum caminho público escrito à mão aqui
    expect(programa).not.toContain("'/agendar")
    expect(programa).not.toContain("'/api/public")
    // o comentário, sim, guarda o registro
    expect(fonte).toContain('PUBLIC_ROUTES')
  })

  it('>>> A PÁGINA SEM CONTA NÃO ENTRA NO `AuthProvider` <<<', () => {
    // Requisito 3: nem menu, nem barra lateral, nem nada que leia sessão. O `AuthProvider`
    // importa o cliente do Supabase e consulta sete tabelas ao montar.
    //
    // A asserção é de ORDEM no programa: o `return` do ramo sem conta vem ANTES do `return`
    // que monta os provedores.
    expect(programa).toContain('rotaSemConta(router.pathname)')
    const iRamo = programa.indexOf('rotaSemConta(router.pathname)')
    const iProvedor = programa.indexOf('<AuthProvider>')
    expect(iRamo).toBeGreaterThan(-1)
    expect(iProvedor).toBeGreaterThan(-1)
    expect(iRamo).toBeLessThan(iProvedor)

    // >>> A PRIMEIRA VERSÃO DESTE RECORTE ESTAVA ERRADA, E FICOU VERMELHA <<<
    // Ela cortava de `iRamo` até `iProvedor`, e esse intervalo inclui o `<SWRConfig>` e o
    // `<DeviceProvider>` que ABREM o ramo protegido — então a asserção falhava sobre código
    // que não é do ramo que ela mede. A fronteira saiu da minha ideia da forma do arquivo, não
    // do arquivo: `instrumento-que-nao-enxerga.md` outra vez, agora num `slice`.
    //
    // O corte certo termina no `return (` do ramo protegido, que é o que fecha o `if`.
    const iFimDoRamo = programa.indexOf('return (', programa.indexOf('}', iRamo))
    expect(iFimDoRamo).toBeGreaterThan(iRamo)
    expect(iFimDoRamo).toBeLessThan(iProvedor)
    // e o ramo devolve o `Component` cru, sem `AuthGuard` nem `AppShell`
    const ramo = programa.slice(iRamo, iFimDoRamo)
    expect(ramo).toContain('<Component {...pageProps} />')
    expect(ramo).not.toContain('AuthGuard')
    expect(ramo).not.toContain('AppShell')
    expect(ramo).not.toContain('ConfigProvider')
    expect(ramo).not.toContain('SWRConfig')
  })

  it('e a PÁGINA pública não importa layout nenhum — nem menu, nem barra lateral', () => {
    const pagina = fs.readFileSync(
      path.resolve(__dirname, '../../pages/agendar/[token].tsx'), 'utf8',
    ) as string
    const prog = pagina.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(prog).not.toContain('@/components/layout')
    expect(prog).not.toContain('<Layout')
    expect(prog).not.toContain('useAuth')
    expect(prog).not.toMatch(/useDevice|AuthProvider/)
  })

  it('o `middleware.ts` NÃO redireciona — lido na medição, afirmado aqui', () => {
    // Ele põe o cabeçalho `x-pc-device` e segue. Se alguém puser um `NextResponse.redirect`
    // lá, este caso fica vermelho e a pessoa decide — hoje ele é o único interceptador de
    // request do repositório, e a página pública depende de ele não mexer.
    const mw = fs.readFileSync(path.resolve(__dirname, '../../middleware.ts'), 'utf8') as string
    const prog = mw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(prog).not.toContain('redirect')
    expect(prog).not.toContain('rewrite')
    expect(prog).toContain('NextResponse.next()')
  })
})
