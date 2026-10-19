/**
 * As seções do menu que o SUPER ADMIN não vê — a fonte única, lida pelo menu desktop
 * (`nav.component.tsx`) e pelo drawer mobile (`mobile-more-drawer.component.tsx`).
 *
 * São CHAVES de seção do menu desktop (`geral`, `cadastros`, …), não rótulos. O drawer agrupa
 * por rótulo (`'Início'`, `'Cadastros'`, …) e por isso cada item dele declara também a
 * `sectionKey` do desktop: é ela que se compara com esta lista.
 *
 * POR QUE UMA FONTE SÓ — 19/10/2026: a lista morava só no desktop, e o drawer filtrava o super
 * admin item a item. Com `canView` devolvendo `true` para todo módulo quando o usuário é super
 * admin (`use-permissions.hook.ts`), o drawer oferecia a ele 18 itens de tenant — e eles caem
 * todos no mesmo `router.replace` do `AuthGuard` (`src/pages/_app.tsx`), que só deixa o super
 * admin em `/super-admin/*` e `/minha-conta`. Não eram acesso, eram porta que não abre.
 * Registro: `docs/registros/o-menu-oferecia-o-que-o-guarda-proibia.md`.
 *
 * O QUE ESTÁ AQUI, e por quê:
 * - as seções de tenant — `geral`, `cadastros`, `comercial`, `financeiro`, `operacional` — são as
 *   "abas de usuário": o super admin não tem conta, e o guarda não o deixa entrar nelas;
 * - `agendamentos` entrou JUNTO com a criação da seção (05/10/2026): a lista é por SEÇÃO, e sem
 *   ela o super admin passaria a ver uma aba que nunca viu, porque os dois itens dela moravam em
 *   `operacional`;
 * - `clientes` ENTROU em 19/10/2026, revertendo 15/10/2026. Em 15/10, ao virar seção própria,
 *   decidiu-se que o super admin a via — "é exatamente quem precisa dela". A decisão foi aplicada
 *   no menu e não no guarda, e o clique ia e voltava. Decisão do dono do produto em 19/10: o
 *   super admin NÃO vê Clientes — ele não tem tenant, e cliente pertence a uma conta. Liberar a
 *   rota só trocaria "não vai" por "vai e mostra vazio".
 *
 * Fica de fora `superadmin`, que é a seção dele.
 *
 * Portões: `clientes-vira-secao-propria.test.ts`, bloco (e), afirma a lista seção por seção;
 * `o-super-admin-nao-ve-clientes.test.tsx` afirma menu, drawer e guarda juntos.
 */
export const SECOES_ESCONDIDAS_DO_SUPER_ADMIN: readonly string[] = [
  'geral',
  'cadastros',
  'clientes',
  'comercial',
  'financeiro',
  'agendamentos',
  'operacional',
]
