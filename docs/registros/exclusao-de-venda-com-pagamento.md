# Exclusão de venda com pagamento — três achados registrados sem correção

A rodada de 09/09/2026 removeu a pré-condição de parcela paga. Estes três achados foram
destapados por ela e **não pertencem a essa entrega**. Cada um é registro separado de propósito.

---

## (1) A VD‑9171FE **já era excluível hoje** — o defeito de aviso é ANTERIOR a esta entrega

**Esta frase precisa ficar assim, com estas palavras, senão alguém lerá a mudança como a causa.**

Antes de 09/09/2026, o bloqueio existia dos dois lados — e os dois usavam **`status = 'PAID'`**:

| onde | critério |
|---|---|
| tela (`vendas/index.tsx`) | `.eq('status','PAID').eq('is_active',true)` |
| banco (`_sale_has_paid_receivable`) | `WHERE is_active = true AND status = 'PAID'` |

**Nenhum dos dois olhava `amount_paid`.** A VD‑9171FE (Adão, Esquadrias De Paula) tem
`status = 'PENDING'` com **`amount_paid = R$ 50.000,00`**. Ela **nunca foi bloqueada**: era
excluível antes desta mudança, e a exclusão levaria os R$ 50.000 registrados **sem aviso nenhum**.

O defeito não é "a pré-condição saiu". É que a pré-condição **nunca cobriu o pagamento parcial**
— ela olhava o rótulo (`status`) e não o dinheiro (`amount_paid`).

A entrega de 09/09 **corrige o aviso** (a confirmação passa a informar os R$ 50.000 pela segunda
linha) sem ter causado o buraco.

---

## (2) R$ 50.000 de `amount_paid` com ZERO `cash_entries` — **o saldo do caixa já está errado**

Registro **separado** do anterior de propósito: aquele é sobre o **aviso**, este é sobre o
**saldo**.

A mesma VD‑9171FE tem R$ 50.000,00 registrados como recebidos em `pending_receivables` e
**nenhum lançamento de caixa ativo**. O dinheiro está num lugar e não no outro.

**A exclusão NÃO É A CAUSA.** O saldo já está errado hoje, com a venda ativa. Excluí‑la tiraria
R$ 0,00 do caixa — porque os R$ 50.000 nunca entraram nele.

O que falta apurar, e é rodada própria: **como um pagamento parcial é registrado sem gerar
lançamento**. Ou o caminho que grava `amount_paid` não cria a `cash_entry`, ou ela foi criada e
desativada depois. Não foi investigado aqui.

---

## (3) `cashier_months`: tabela semi‑morta e **nome de coluna que mente**

| coluna | o que o nome diz | o que guarda |
|---|---|---|
| `balance` | saldo | **a META do mês** — gravada por *"Atualizada meta com sucesso!"* |
| `total_in` | total de entradas | **zero nas 6 linhas** |
| `total_out` | total de saídas | **zero nas 6 linhas** |

Só **46 de 1.588** `cash_entries` têm `cashier_month_id`. **Zero triggers** em `cash_entries` ou
`cashier_months`.

**Consequência boa para a entrega de 09/09:** não há saldo consolidado derivado que fique errado
depois da exclusão. O saldo do Fluxo de Caixa e do Caixa é `useMemo`/`reduce` sobre os
lançamentos ativos — desativar o lançamento tira ele da soma. O `PREV_MONTH_BALANCE` é *"valor
fixo inserido pelo usuário"*, digitado à mão (1 linha na base inteira).

### A nota que vale registrar: **terceira aparição da mesma forma**

`balance` que guarda meta é o mesmo defeito de:

| | o nome afirmava | a coisa era |
|---|---|---|
| **"Desativar"** (#56) | ação reversível | exclusão irreversível |
| **"Excluído em 08/09"** (#54) | data da exclusão | `updated_at`, última alteração qualquer |
| **`balance`** (aqui) | saldo | meta |

**Três vezes o nome afirma o que a coisa não é** — e nas três a correção foi trocar o nome, não
o comportamento. Nas duas primeiras isso já foi feito; nesta, não. Fica registrado como forma
recorrente no vocabulário do sistema, ainda sem tabela própria: é o mesmo limite de
`.claude/rules/registro-de-classe.md` que manteve a assimetria desktop×mobile em três
ocorrências. **Não se forçou uma quarta.**

---

## O item que ficou FORA do PR, com a razão

**O histórico do cliente mostrar que houve pagamento removido.** Hoje a venda excluída aparece
esmaecida (#54), mas o bloco de parcelamento é **omitido** quando não há `cash_entries` ativas —
e a cascata desativa todas.

Para o rastro mostrar o pagamento removido, a consulta precisa **deixar de filtrar
`is_active = true`** nas `cash_entries` daquela venda. **Isso é mudança de critério de leitura,
do mesmo tipo que o #54 fez com o status** — construção nova, não ajuste de texto. Rodada
própria.
