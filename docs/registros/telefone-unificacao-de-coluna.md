# Unificação da coluna de telefone em `customers` — MIGRAÇÃO PENDENTE

**Status: NÃO FEITA.** O PR que elegeu a coluna canônica mexeu SÓ NO CÓDIGO. Os 89 registros
com telefone espalhado nas duas colunas **ficam como estão** — daqui pra frente grava certo, o
histórico continua torto.

Este arquivo existe porque corpo de PR mergeado fica soterrado
(`.claude/rules/registro-de-classe.md`), e porque quem for fazer a migração precisa dos números
que decidiram a escolha, não de refazê-los.

## A decisão

**A coluna canônica é `whatsapp_phone`.** Razões, nesta ordem:

1. é a que a tela de Clientes **já lê** (`clientes/index.tsx`, coluna "WhatsApp");
2. tem o dado **mais limpo** — zero caracteres não numéricos, 9 a 11 de comprimento;
3. `phone` está em 79 de 89 registros, mas com **63 inválidos**.

As quatro rotas que criam cliente passaram a gravar nela: cadastro de Clientes (já gravava),
Novo Orçamento **criar**, Novo Orçamento **editar**, e Agenda com cliente manual.

## O censo que decidiu, medido em 08/09/2026

| | |
|---|---:|
| clientes | 89 |
| só `phone` | 65 |
| só `whatsapp_phone` | 10 |
| as duas preenchidas | 14 |
| sem telefone nenhum | 0 |
| `phone` com menos de 10 dígitos | **63 de 79** |
| `phone` com caracteres não numéricos | 11 |
| `whatsapp_phone` = `999999999` (placeholder) | **13 de 24** |
| maior `phone` | **23 caracteres** (GERONIMO) |
| maior `whatsapp_phone` | 11 |

## A leitura que foi corrigida, e ela vale mais que o número

A primeira leitura dos 14 com as duas colunas foi: *"os valores são diferentes entre si, nenhum
caso de cópia — logo há DOIS TELEFONES REAIS, fixo e WhatsApp"*. **Estava errado, e o erro foi
de método:**

> "Os valores são **DIFERENTES**" não prova "são dois dados **REAIS**" — prova só que são
> diferentes. **Dois lixos também diferem entre si.**

Olhando os 14 um a um: **doze têm `whatsapp_phone = 999999999`**, o mesmo placeholder repetido,
com `phone` de 4 a 9 dígitos (`54194`, `5555`, `35465`). É lixo dos dois lados. Só **dois** têm
valores plausíveis, e num deles (Mayder) o `phone` é `5555`.

Comparou-se a propriedade **fácil** (diferem?) em vez da propriedade que **decide** (são
válidos?). É a mesma armadilha de `.claude/rules/teste-que-nao-exercita.md`, aplicada a uma
medição em vez de a um teste.

## O que a migração tem de fazer

1. **Copiar** para `whatsapp_phone` o `phone` dos 65 registros que só têm `phone`, **apenas
   quando o `phone` for válido** (10 ou 11 dígitos) — são poucos: 14 `phone` plausíveis na base
   inteira. O resto é lixo e não deve ser promovido a canônico.
2. **Decidir o único caso real de dois números**: **Wfjnrjn**, `phone = 51999999999` e
   `whatsapp_phone = 51999114290`. Decisão já tomada: **fica com o `whatsapp_phone`**.
3. **Não apagar `phone`** na mesma migração. A coluna some numa rodada posterior, depois de a
   cópia ser verificada — `ALTER TABLE ... DROP COLUMN` é irreversível e não convive com
   verificação no mesmo commit.

## O protocolo, quando for feita

`.claude/rules/migration-delivery.md`, sem atalho:

- SQL entregue em **raw** e em **base64**, com **`md5`**, ANTES de aplicar;
- migração é **PENDENTE POR PADRÃO** — merge não é entrega;
- verificação por **consulta ao banco** depois de aplicar, não pelo retorno do comando;
- `NOTIFY pgrst, 'reload schema';` ao final;
- a ressalva do `raw`: ele **normaliza a indentação**, então o `md5` não é reproduzível por esse
  caminho — ele prova o CONTEÚDO revisado, não a aplicação.

## O que este registro NÃO cobre

O `customers.status`, que está `ACTIVE` em **todos os 89** registros e nunca foi usado para
nada. Fica registrado aqui de passagem: em `customers` o marcador vivo é `is_active`, e o
`status` é campo morto. É item próprio, não pertence a esta migração.
