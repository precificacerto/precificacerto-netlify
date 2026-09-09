# Ação destrutiva com garantias diferentes no desktop e no mobile

> **LEVANTAMENTO, NÃO CORREÇÃO.** Os dois pontos abertos abaixo continuam abertos. Este arquivo
> registra o que foi medido e onde, para a correção ser uma decisão e não uma descoberta.

## O que se procurou

O #56 corrigiu um caso na tela de Clientes, e o Cristiano o formulou assim:

> **O cartão mobile não tinha confirmação nenhuma — a exclusão irreversível EXECUTAVA DIRETO NO
> CLIQUE, enquanto o desktop PERGUNTAVA. Mesma ação destrutiva, duas garantias diferentes,
> dependendo do tamanho da tela.**

A pergunta que gerou este levantamento: **outras ações destrutivas têm a mesma assimetria?**

## O método

As **doze** páginas com cartão mobile (`pc-row-compact`) foram varridas: para cada ação
destrutiva do menu `⋮`, comparou-se o `onClick` do mobile com o que o desktop faz na mesma ação.
O discriminante é se a ação **executa direto** ou passa por `Popconfirm` / `Modal.confirm` /
formulário.

## O resultado — TRÊS ocorrências, uma já corrigida

| tela | desktop | mobile | estado |
|---|---|---|---|
| **Clientes** | `Popconfirm` | executava direto | **corrigido no #56** |
| **Funcionários** | `Popconfirm title="Desativar funcionário?"` (linha 315) | `onClick: () => handleDelete(record.id)` (574‑579) — **direto** | **ABERTO** |
| **Estoque** | `Popconfirm` com título e descrição, nas **duas** abas (554 e 637) | `onSoftDelete(r)` → `handleSoftDeleteStockRow` (702) — **direto** | **ABERTO** |

**Dois pontos abertos.** O do Estoque conta como um, embora o desktop tenha dois `Popconfirm`
(aba de serviços e aba de produtos): o mobile é um único menu que serve as duas.

## Os que estão SIMÉTRICOS — e é a maioria

Registrados para ninguém refazer a varredura:

| tela | como confirma nos dois lados |
|---|---|
| Vendas — Cancelar e Excluir | `confirmCancelSale` / `confirmDeleteSale` (`Modal.confirm`), as mesmas funções nos dois |
| Pedidos — Cancelar | `confirmDeleteOrder`, a mesma função nos dois |
| Orçamentos — Excluir | `confirmDeleteBudget`, a mesma função nos dois |
| Produtos — Excluir produto | `setConfirmDeleteId` → `<Modal>` controlado |
| Serviços — Excluir serviço | `setConfirmDeleteSvcId` → `<Modal>` controlado |
| Itens — Excluir item | `handleDeleteItem` → `setDeleteConfirmItem` → `<Modal>` |
| "Excluir quantidade do estoque" | abre drawer com formulário, nos dois |
| Fluxo de Caixa | só `Popconfirm` no modal; não há cartão mobile equivalente |

**O padrão que funciona é evidente e vale como corolário:** quando a confirmação está numa
**função nomeada** (`confirmDeleteX`) ou num **estado** (`setConfirmDeleteId`) que as duas
telas chamam, a simetria vem de graça. Ela se perde quando o desktop usa `Popconfirm`
**inline no JSX** — porque o `Popconfirm` é um componente que envolve o botão, e o menu do
mobile não tem botão para envolver. **A assimetria não é descuido: é o que o `Popconfirm`
inline produz quando a mesma ação precisa existir num `Dropdown`.**

Isso dá o sinal de busca para a próxima: **`Popconfirm` inline no desktop + item de menu no
mobile = suspeito.** Os três achados têm exatamente essa forma.

## O que NÃO é esta classe, e foi verificado

`handleRemoveItem` (orçamentos, linha 626) e `removeRow` (pedidos, 177) removem a linha do item
**sem confirmação em nenhum dos dois lados**. É simétrico, e é edição de rascunho em memória
(`setBudgetItems`) que só persiste no salvar — não é ação destrutiva sobre dado gravado. Fica
registrado como verificado e descartado, para não voltar como falso positivo.

## Por que isto NÃO virou regra em `.claude/rules/`

Pelo limite de `.claude/rules/registro-de-classe.md`:

> Uma ocorrência é anedota, quatro com o mesmo padrão é critério. **Se a busca por precedentes
> não encontrar nada, registre a ocorrência isolada como caso único. Não force duas ocorrências
> diferentes a caber num padrão — anedota honesta é melhor que padrão inventado.**

São **três**, e a busca foi sistemática sobre as doze páginas. Três é mais que anedota e menos
que os quatro que o método pede para chamar de critério. **Não se forçou uma quarta.** Se
aparecer, esta página tem a tabela pronta e vira regra.

## A relação com a classe vizinha

É parente de *"proteção de tela não é proteção de código"*, já levantada no `handleUpdate` do
orçamento sem guarda de status. A diferença importa:

| | |
|---|---|
| **proteção de tela × código** | a UI protege, o handler não — quem chamar por fora passa |
| **esta** | **duas TELAS da mesma ação**, com garantias diferentes — quem usa o celular passa |

Na vizinha o buraco é para quem contorna a interface. Aqui **o buraco é a própria interface**,
para metade dos usuários.
