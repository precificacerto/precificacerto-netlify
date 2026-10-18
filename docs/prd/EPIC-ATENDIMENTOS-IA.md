# EPIC — Atendimentos I.A.

**Status:** em especificação. Bloco 1 entregue (PR #95). Bloco 2A neste branch. 2B e 2C a definir.
**Criado:** 18/10/2026
**Fonte:** as instruções do dono do produto nas rodadas do bloco 1 e do bloco 2A, e o mockup
`docs/prd/atendimentos-ia-mockup.html`.

> **O QUE ESTE DOCUMENTO NÃO TEM, e por quê.** Ele foi escrito com o que o dono do produto
> declarou por escrito até 18/10/2026. O mockup, que é a fonte das telas, **não estava na pasta**
> quando este arquivo foi escrito. Por isso, onde a especificação de uma tela depende dele, a
> seção diz **"a definir pelo mockup"** em vez de deduzir o conteúdo. Lacuna declarada não é
> lacuna escondida (`ausente-vs-falso.md`), e preencher com o mais provável seria
> `regime-e-segmento-determinam-a-construcao.md` aplicado a um documento: um texto que fecha
> consigo mesmo e que ninguém decidiu.

---

## 1. O nome

O produto se chama **Atendimentos I.A.** na tela. No código, no banco e nas rotas o nome antigo
continua: o módulo é `orcamentista`, a rota é `/api/super-admin/orcamentista`, a tabela é
`orcamentista_config`. **Só o rótulo de tela mudou** (bloco 2A). Renomear chave, rota ou tabela é
decisão própria e não foi tomada.

## 2. As entidades

A cadeia, nesta ordem:

```
modelo de atendimento → nicho → fornecedor → tabela → motor
```

| entidade | o que é | o que está decidido |
|---|---|---|
| **modelo de atendimento** | o primeiro eixo da cadeia | **NÃO é `tenant_settings.calc_type`.** O `calc_type` (INDUSTRIALIZACAO / REVENDA / SERVICO) é a segmentação da formação de preço; o modelo de atendimento é outro eixo, e confundir os dois é ler um campo no lugar de outro |
| **nicho** | o recorte dentro do modelo | — |
| **fornecedor** | de quem vem a tabela | **revenda não usa fornecedor** — ver regra 3.2 |
| **tabela** | o conteúdo de que o atendimento parte | o motor vem PRESO a ela — ver regra 3.1 |
| **motor** | o que processa a tabela | **nunca é escolhido à parte** |

As definições de "o que é" de nicho, fornecedor e tabela, os campos de cada um e a cardinalidade
entre eles **estão a definir pelo mockup**.

## 3. As regras

### 3.1 O motor vem preso à tabela, e nunca é escolhido à parte

Não existe um seletor de motor. Quem escolhe a tabela escolheu o motor. Registro:
`docs/registros/o-motor-vem-preso-a-tabela.md`.

### 3.2 Revenda não usa fornecedor

No modelo de revenda, a fonte é o **cadastro de produtos do próprio cliente**, e não uma tabela
de fornecedor. Não há fornecedor a escolher nesse caminho.

### 3.3 Nada que pertença a um cliente é subido no Atendimentos I.A.

Regra do dono do produto, como declarada. A consequência que já está escrita é a da 3.2: na
revenda, o cadastro de produtos do cliente é LIDO de onde já está, e não subido de novo. Quem pode
subir o quê, e para onde, **está a definir pelo mockup**.

### 3.4 "Modelo de atendimento" NÃO é `tenant_settings.calc_type`

Repetida como regra, e não só na tabela de entidades, porque é a confusão mais barata de cometer:
os dois falam de "segmento", e o `calc_type` já existe e já é lido. Medido em 18/10/2026: 16 dos
21 `INDUSTRIALIZACAO` são o DEFAULT do onboarding incompleto, não escolha — usar o `calc_type`
como modelo de atendimento herdaria esse default como se fosse decisão.

### 3.5 O teto de consumo é PROJEÇÃO

`orcamentista_config.teto_de_consumo_brl` passou a significar **projeção de gasto**: nada bloqueia
e nada avisa. `valor_adicional_brl` e `acao_ao_atingir_teto` ficam no banco sem uso no produto,
por decisão do dono do produto. Registro: `docs/registros/o-teto-que-virou-projecao.md`.

## 4. As telas

| tela | onde | o que faz | bloco |
|---|---|---|---|
| **Lista de contas do super admin** | `src/pages/super-admin/tenants/index.tsx` | a coluna "Atendimentos I.A." liga e desliga o produto por conta — **só o interruptor** | 1 (criada), 2A (enxugada) |
| **Ficha da conta** | `src/pages/super-admin/tenants/[id].tsx` | mostra os dados da conta, telefone incluído; nada do Atendimentos I.A. por enquanto | 2A (telefone) |
| **Seção própria do Atendimentos I.A.** | a definir | a configuração por conta, que saiu da lista de contas | 2C — **a definir pelo mockup** |
| **Telas de modelo, nicho, fornecedor e tabela** | a definir | o cadastro da cadeia da seção 2 | **a definir pelo mockup** |
| **Tela do tenant** | nenhuma ainda | o tenant só LÊ a própria linha de `orcamentista_config`; não há item de menu | — |

## 5. O que já existe no banco (bloco 1)

`public.orcamentista_config`, uma linha por conta, aplicada e verificada em 18/10/2026:

- leitura: a própria conta ou o super admin; escrita: só a rota do super admin (`service_role`);
- `authenticated` com SELECT e nenhum outro privilégio;
- `ativado_por` e `atualizado_por` sem FK (o autor é fato histórico);
- `atualizado_em` gravado pela rota em toda gravação, sem trigger.

Detalhes e razões no cabeçalho de `supabase/migrations/20261018000001_orcamentista_bloco_1.sql`.

## 6. Os blocos

| bloco | conteúdo | estado |
|---|---|---|
| 1 | `orcamentista_config`, rotas, liga/desliga na lista de contas | entregue, PR #95 |
| 2A | ajustes de tela: lista de contas em 7 colunas, telefone na ficha, Clientes não recolhe, rótulo "Atendimentos I.A." | este branch |
| 2B | a definir | — |
| 2C | a seção própria do Atendimentos I.A., com a configuração por conta | a definir |

## 7. Pendências nomeadas

- **Duas fontes de "é super admin"** — a rota lê `users.is_super_admin`, a RLS lê
  `users.role = 'super_admin'`. Cabeçalho da migração do bloco 1.
- **`calc_type` com DEFAULT e dois fallbacks divergentes** — `segment-visibility.ts`,
  `auth.context.tsx`, `configuracoes/index.tsx`.
- **O teto que virou projeção** — `docs/registros/o-teto-que-virou-projecao.md`.
