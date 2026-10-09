/**
 * rotas-publicas.ts — QUEM NÃO PRECISA DE SESSÃO. A fonte única do guarda.
 *
 * Correção de defeito em produção, 09/10/2026.
 *
 * ══ O DEFEITO, E POR QUE ELE PASSOU POR TUDO ════════════════════════════════════════════
 *
 * `https://app.precificacerto.com/agendar/<token>` pedia LOGIN. A página é pública por
 * desenho — cliente de barbearia não tem conta e nunca vai ter — e o link estava LIGADO em
 * produção (`is_enabled = true`, medido pelo dono do produto no banco).
 *
 * A trava não era configuração: era o `AuthGuard` de `_app.tsx`, que redireciona para
 * `/login?redirect=…` todo `router.pathname` fora de `PUBLIC_ROUTES` — e `/agendar/[token]`
 * nunca entrou naquela lista. Três rodadas inteiras construíram a página, as oito rotas e
 * 4.138 casos de teste sem que ninguém abrisse a URL.
 *
 * >>> A LIÇÃO, E ELA É DA CLASSE `portao-que-nao-alcanca.md` <<<
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   O defeito passou porque TODOS os casos da página a renderizam SOZINHA, nunca através do
 *   guarda. O portão afirmava o componente, não a rota.
 *
 * `escolha-de-dia-e-hora.test.tsx` monta o componente direto. `agendamento-fase2b-rotas.test.ts`
 * chama os handlers direto. Nenhum dos 4.138 casos passava pelo `_app.tsx` — então o
 * instrumento não podia ver a única coisa que estava errada. É a pergunta 1 daquela regra:
 * *"se eu introduzir o defeito que este portão existe para barrar, ele fica vermelho?"* Para
 * "a página pública abre sem login", a resposta era **não**, em portão nenhum.
 *
 * Daí este arquivo existir: a decisão de quem é público passa a ser uma FUNÇÃO PURA, que o
 * portão exercita com caminhos — `/agendar/x`, `/agenda`, `/admin/agendar/x` — em vez de com
 * componentes.
 *
 * ══ DUAS LISTAS, E A DISTINÇÃO É OPERACIONAL ════════════════════════════════════════════
 *
 * | | o que é | e o que o `_app` faz com ela |
 * |---|---|---|
 * | `PREFIXOS_SEM_CONTA` | páginas que **nunca** exigem conta | renderiza FORA de todo provedor que lê sessão |
 * | `ROTAS_DE_AUTENTICACAO` | telas que um deslogado usa **para poder** se logar | mantém os provedores: `/login` precisa do `AuthProvider` para autenticar |
 *
 * As duas dispensam sessão, e por isso o guarda as soma. Mas só a primeira sai do envoltório:
 * tirar `/login` do `AuthProvider` quebraria o login. A distinção está aqui, nomeada, em vez
 * de virar um `if` com dois termos em `_app.tsx`.
 *
 * ══ O PREFIXO EXIGE A BARRA, E NÃO É `includes` ═════════════════════════════════════════
 *
 * `'/admin/agendar/x'.includes('/agendar')` é **verdadeiro** — e abriria uma rota do sistema.
 * `'/agendarX'.startsWith('/agendar')` também seria verdadeiro sem a barra. Por isso os
 * prefixos JÁ TRAZEM a barra final e a comparação é `startsWith`, nunca `includes`.
 *
 * As duas armadilhas têm caso próprio no portão, e as mutações M27 e M28 existem para provar
 * que esses casos distinguem.
 */
import { ROUTES } from '@/constants/routes'

/**
 * As páginas que **NUNCA** exigem conta. Prefixo exato, **com a barra final**.
 *
 * >>> EXATAMENTE DOIS, E ACRESCENTAR UM TERCEIRO É DECISÃO DE ALGUÉM <<<
 *
 * Há caso no portão afirmando que são dois. Rota do sistema aberta é pior que link que não
 * abre, então o terceiro prefixo não entra por descuido: entra quebrando um teste que obriga
 * alguém a olhar.
 *
 *   `/agendar/`     — a página do cliente da barbearia
 *   `/api/public/`  — as oito rotas que ela chama
 */
export const PREFIXOS_SEM_CONTA = ['/agendar/', '/api/public/'] as const

/**
 * As telas de autenticação: um deslogado precisa delas para PODER se logar.
 *
 * Elas já eram a `PUBLIC_ROUTES` de `_app.tsx` antes desta correção, com a mesma semântica de
 * comparação (igualdade exata ou prefixo com barra). A lista foi para cá inteira, sem
 * acréscimo nem remoção — mover o critério não é lugar de mudar quem está dentro.
 */
export const ROTAS_DE_AUTENTICACAO = [
  ROUTES.LOGIN,
  ROUTES.RESET_PASSWORD,
  ROUTES.SUPER_ADMIN_LOGIN,
  '/cadastro',
  '/criar-senha',
] as const

/**
 * A rota dispensa conta por completo? (só os dois prefixos)
 *
 * É esta que decide se o `_app.tsx` renderiza a página **fora** dos provedores — porque um
 * cliente de barbearia não pode montar o `AuthProvider`, que importa o cliente do Supabase e
 * consulta `users`, `tenants` e mais cinco tabelas ao montar.
 */
export function rotaSemConta(pathname: string): boolean {
  const p = String(pathname ?? '')
  // `startsWith` com a barra JÁ no prefixo. Nunca `includes` — ver o cabeçalho.
  return PREFIXOS_SEM_CONTA.some((prefixo) => p.startsWith(prefixo))
}

/**
 * A rota pode ser vista sem sessão? (os prefixos **mais** as telas de autenticação)
 *
 * É esta que o `AuthGuard` consulta para decidir se redireciona.
 */
export function rotaEhPublica(pathname: string): boolean {
  const p = String(pathname ?? '')
  if (rotaSemConta(p)) return true
  // A MESMA comparação que `_app.tsx` fazia antes: igualdade exata, ou prefixo com barra.
  // `'/loginX'` não é `/login`, e `'/login/esqueci'` é.
  return ROTAS_DE_AUTENTICACAO.some((rota) => p === rota || p.startsWith(`${rota}/`))
}
