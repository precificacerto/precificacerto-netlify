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

## O defeito do DDI: ARMADO E NÃO MATERIALIZADO — zero registros

O texto de ajuda do cadastro pedia "DDI + DDD + Número (ex: 5551999990000)" e contradizia a
máscara, que corta em 11 dígitos. **Verificado nos 24 `whatsapp_phone` preenchidos: NENHUM
começa com `55`, e nenhum tem 12 ou 13 dígitos.** Ninguém chegou a digitar o DDI, e o envio,
que acrescenta o `55` sozinho, funciona para os 11 números reais.

O texto foi corrigido, mas **não houve dado a consertar** — o risco existia e não se
materializou. Fica o número: **zero**.

## Achado adjacente: 14 dos 24 `whatsapp_phone` NÃO SÃO TELEFONE

Dos 24 preenchidos:

| | |
|---|---:|
| **nove dígitos, todos o placeholder `999999999`** | **13** |
| `51000000000` — outro placeholder, no cliente "Todos" | 1 |
| onze dígitos plausíveis (DDD + nove) | **10** |

Os treze do `999999999`: `[TESTE] Cliente Diagnostico`, `Alex Sandro F`, `Alexandre Poa`,
`Carmo`, `Feriado`, `Inova casa`, `Marcelo Marcan`, `Marco Antonio`, `Matheus`, `Mellody`,
`Nei Schineider`, `Paulo Arq Thiana`, `Sobrados teste`.
Os plausíveis: `Daniel Gehln 51995730813`, `Felipe Klein 51999114290`,
`Julio Cadilac 51998569384`, `Mateus T 48984529779`, `Mayder 51998864066`,
`Michele 51999114290`, `Patrick Bitelo 51996515449`, `Suelen Botelho 51986100304`,
`Wfjnrjn 51999114290`.

**É mais um caso de DADO FALSO OCUPANDO O LUGAR DE DADO AUSENTE**, e o mais literal deles:
`999999999` **afirma um telefone que não existe**, enquanto `NULL` não afirmaria nada. O campo
era obrigatório e sem validação — a saída mais barata para o usuário era inventar um número, e
foi o que aconteceu em 14 de 24 casos. `.claude/rules/ausente-vs-falso.md`.

Isso reforça as duas decisões da rodada: a máscara (que agora recusa nove dígitos) e a coluna
canônica.

## O que este registro NÃO cobre

O `customers.status`, que está `ACTIVE` em **todos os 89** registros e nunca foi usado para
nada. Fica registrado aqui de passagem: em `customers` o marcador vivo é `is_active`, e o
`status` é campo morto. É item próprio, não pertence a esta migração.
