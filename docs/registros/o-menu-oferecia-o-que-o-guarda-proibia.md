# O Menu Oferecia o Que o Guarda Proibia

> **Registro de 19/10/2026.** Não depende do Atendimentos I.A. nem da seção Clientes: vale para
> todo par de listas que decide, cada uma por si, quem pode ir aonde.

## O critério

**Uma decisão aplicada em metade do caminho.** O menu e o guarda de rota são duas listas de quem
pode ir aonde, e ninguém afirmava que as duas concordavam. Mudou-se uma; a outra ficou como
estava; e as duas continuaram verdes, cada uma no seu portão.

É `portao-que-nao-alcanca.md` em forma de interface: o menu oferece um destino que o guarda
proíbe, e nenhum dos dois instrumentos alcança o outro.

## O que aconteceu

O item **Clientes** aparecia no menu do super admin. O `AuthGuard` (`src/pages/_app.tsx`)
devolve o super admin para `ROUTES.SUPER_ADMIN_PANEL` em **qualquer** rota fora de
`/super-admin/*` e `/minha-conta`. O clique ia e voltava no mesmo instante.

| data | o que se fez | onde |
|---|---|---|
| 15/10/2026 (`e51145f`) | Clientes vira seção própria, **e o super admin passa a vê-la** — decisão de então: é a seção de consulta, e ele "é exatamente quem precisa dela" | `nav.component.tsx`, `sectionsToHideForSuperAdmin` |
| 15/10/2026 | **nada** | `_app.tsx`, `AuthGuard` — a regra do super admin continuou: só `/super-admin/*` e `/minha-conta` |
| 18/10/2026 (bloco 2A) | a seção Clientes deixa de ser recolhível | `nav.component.tsx` |
| 19/10/2026 | medido: o clique vai e volta. **Revertido** — o super admin não vê Clientes | este registro |

**Não é regressão do 2A.** O defeito existia desde 15/10; o que o escondia é que a seção nascia
fechada (`initialExpanded = sectionHasActiveItem`) e o item ficava embaixo de um título recolhido.
O 2A abriu a seção, e o item passou a estar à vista. São **4 dias** entre a decisão e a medição —
não um mês, como a primeira descrição desta rodada dizia: 15/10 a 19/10.

### A decisão de agora

Formulação do dono do produto, 19/10/2026: o super admin **NÃO** vê Clientes. Ele não tem
tenant — cliente pertence a uma conta, e ele não é dono de nenhuma. Liberar a rota só trocaria
"não vai" por "vai e mostra vazio".

A decisão de 15/10 **não é apagada**: ela está no comentário de `nav.component.tsx` e no bloco
(e) de `clientes-vira-secao-propria.test.ts`, com a data, a razão de então e a razão da reversão
(`decisao-sob-regra-da-epoca.md` — ela não era descuido; era uma decisão aplicada num lado só).

## Por que a distinção é difícil de ver

Porque **o sintoma não tem sintoma.** Clicar e não acontecer nada: não dá erro, não dá tela em
branco, não aparece no console, não deixa rastro em log. O usuário volta para onde estava, e a
leitura natural é "cliquei errado". Um defeito que se parece com um erro do usuário não chega a
ser relatado.

E cada lista, sozinha, está certa. O menu tem portão (`clientes-vira-secao-propria.test.ts`, bloco
e), e ele afirmava exatamente a decisão de 15/10. O guarda tem portão (`rotas-publicas.test.tsx`),
e ele afirma o guarda. Os dois verdes, ao mesmo tempo, sobre um par que não fecha.

## O portão que fecha o par

`src/utils/__tests__/o-super-admin-nao-ve-clientes.test.tsx` afirma **as duas pontas no mesmo
arquivo**, com o mesmo usuário e o mesmo destino:

| caso | o que afirma | antes da correção |
|---|---|---|
| (a) | o menu do super admin não traz o item Clientes | **vermelho** — `expect(received).toBeNull()`, recebendo `<a class="app-nav-item " href="/clientes" id="nav-clients">…Clientes</a>` |
| (b) | o `AuthGuard`, com o super admin em `/clientes`, chama `router.replace(SUPER_ADMIN_PANEL)` | verde — documenta o guarda que já existia |

Ele existe para que as duas pontas passem a ser afirmadas JUNTAS. Liberar a rota no guarda sem
rever o menu derruba o (b); devolver Clientes ao menu sem liberar a rota derruba o (a).

## As aparições

| # | Onde | O que o menu oferecia | O que o guarda faz | Estado |
|---|---|---|---|---|
| 1 | menu desktop, seção Clientes, super admin | `/clientes` | devolve ao painel | **corrigido nesta rodada** |

### Nota da busca por precedentes — a varredura

Feita conforme `registro-de-classe.md`, e **medida**, não lida: o menu desktop, o drawer mobile
("Mais") e a barra inferior mobile foram montados para quatro papéis — super admin, admin de
conta, funcionário e representante — e cada destino oferecido foi passado pelo `AuthGuard` de
verdade, com o mesmo usuário. Resultado, depois da correção do desktop:

| papel | destinos oferecidos que o guarda recusa |
|---|---|
| admin de conta | **0** |
| funcionário | **0** |
| representante | **0** |
| **super admin** | **22** |

Os 22 do super admin:

- **menu desktop, 1:** o logo, que é um link para `/` (`ROUTES.DASHBOARD`);
- **barra inferior mobile, 3:** Orçamentos, Vendas, Agenda — ela não filtra nada por papel;
- **drawer mobile, 18:** Home, Caixa, Fluxo de Caixa, Custos Itens, Produtos, Serviços, Estoque,
  **Clientes**, Pedidos, Relatório de Vendas, Relatório de Comissões, Recorrência, Controle
  Financeiro, Análise Financeira, Comissão de Vendedor, RT Comissões, Relatório Agenda,
  Conectividade.

**O drawer mobile não tem a lista `sectionsToHideForSuperAdmin`.** Ele filtra item a item
(`superAdminOnly`, `hideForSuperAdmin`, `canView`), e `canView` devolve `true` para todo módulo
quando o usuário é super admin (`use-permissions.hook.ts`). No desktop é a lista de seções que
esconde as abas de tenant; no mobile nada as esconde.

**Elas NÃO entram na tabela de aparições.** Têm o mesmo sintoma — o menu oferece o que o guarda
proíbe —, mas não se mediu se são a mesma classe: o arquivo do drawer, o da barra e a lista do
desktop chegam juntos ao histórico do repositório (`c4a006f`, 29/08/2026), e não há como datar
qual decisão veio antes. "Decisão aplicada em metade do caminho" é uma afirmação sobre a origem,
e a origem destas não foi estabelecida. Ficam aqui como achado da varredura, **não corrigidas**
nesta rodada, por instrução do dono do produto.

## O corolário aplicável ANTES do defeito existir

**Antes de mudar quem vê um item de menu, pergunte quem tem acesso à rota — e vice-versa.**

Sinais, em ordem de força:

1. A mudança é sobre um PAPEL (super admin, representante, funcionário).
2. Existe mais de um lugar que decide por papel: menu desktop, drawer mobile, barra inferior,
   guarda de rota, a própria página.
3. O portão que cobre a mudança monta UM desses lugares.
4. O caminho de falha é um redirecionamento — que não deixa erro.

Quando o 2 e o 3 coincidem, a outra ponta não está sendo afirmada. O portão de par é o remédio:
um caso por ponta, no mesmo arquivo, com o mesmo usuário e o mesmo destino.

## As ressalvas — o que este registro NÃO diz

- **Não diz que o guarda está errado.** A regra do super admin no `AuthGuard` é a decisão que
  vale; foi o menu que divergiu dela.
- **Não corrige o mobile.** Os 18 itens do drawer e os 3 da barra inferior seguem oferecidos ao
  super admin, Clientes entre eles. A instrução desta rodada condicionava mexer no drawer a ele
  usar lista de seções, e ele não usa.
- **Não mede página.** A varredura mede o `AuthGuard`. Uma página que recuse por conta própria
  (por módulo, por exemplo) não entra nela.

## Relação com as outras regras

`portao-que-nao-alcanca.md` é a origem: cada portão verde sobre o seu lado, e nenhum alcança o
par. `decisao-sob-regra-da-epoca.md` é por que a decisão de 15/10 fica escrita em vez de
apagada. `copia-divergente.md` é a vizinha mais próxima — o mesmo mapeamento em dois lugares —,
com uma diferença: lá as duas cópias deviam ser iguais; aqui as duas listas dizem coisas
diferentes (quem vê o item, quem entra na rota) e o que se exige é que **concordem**, não que
coincidam. `registro-de-classe.md` decidiu a forma e o limite que manteve a tabela numa linha.
