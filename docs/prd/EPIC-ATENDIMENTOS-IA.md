# EPIC — Atendimentos I.A.

**Status:** em especificação. Bloco 1 entregue (PR #95). Bloco 2A neste branch. 2B e 2C a definir.
**Criado:** 18/10/2026 · **Revisto com o mockup:** 19/10/2026
**Fonte:** as instruções do dono do produto nas rodadas do bloco 1 e do bloco 2A, e o mockup
aprovado `docs/prd/atendimentos-ia-mockup.html`, **versão 21** (commit `2d666d9`, md5
`73a813d8bcf363cce9de73a0135afe78`, 745 linhas).

> **Como ler este documento.** O que está aqui foi LIDO do mockup ou declarado pelo dono do
> produto — cada seção diz qual das duas. Onde o mockup não decide, a seção diz **"a definir"** e
> o ponto entra na lista do fim (seção 9). O mockup é marcado por ele mesmo como **"dados de
> exemplo"**: os nomes de contas, fornecedores, nichos e arquivos dele ilustram a forma, não são
> cadastro a criar.

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

| entidade | o que o mockup mostra |
|---|---|
| **modelo de atendimento** | três valores: **Fabricação** (`FABRICACAO`), **Revenda** (`REVENDA`), **Prestação de serviço** (`SERVICO`), mais "— não definido —". É escolhido **por conta**, na configuração. Texto da tela: *"Como o motor da I.A. atende esta conta. É campo do Atendimentos I.A. — **não** encosta na segmentação fiscal que o cliente escolheu no primeiro acesso dele."* |
| **nicho** | pertence a UM modelo; a lista de nichos depende do modelo escolhido. Exemplos do mockup — Fabricação: Esquadrias, Móveis planejados, Metalurgia; Revenda: "Geral — produtos do próprio sistema", Loja de roupas, Materiais de construção; Serviço: Mecânica, Manutenção predial |
| **fornecedor** | **da plataforma**, não de uma conta: tem nome e **um** nicho. Credenciado uma vez, em "Fornecedores e tabelas", antes das contas, e reaproveitado por todas. Pode ser movido de nicho ("Fornecedor alterado e movido de nicho") |
| **tabela** | pertence a um fornecedor, que pode ter várias. Tem **arquivo da tabela**, **arquivo do motor**, **vigência** (texto, ex.: "desde 01/10/2026", "01/07 a 30/09/2026") e **data de subida** |
| **motor** | é o **arquivo do motor** subido junto com a tabela, no mesmo modal. Obrigatório: *"Suba o arquivo do motor — sem ele a tabela não calcula"*. Texto da tela: *"O motor é quem faz as reduções de tipologia em cima dos perfis desta tabela. O conteúdo dos dois arquivos — código, dimensão, peso, referência, valor — é importado e fica por trás, sem aparecer aqui."* |

E, por conta, a **configuração**: modelo, nicho, as **linhas de tabela em uso** (cada linha é um
par fornecedor + tabela; o mesmo fornecedor pode aparecer em várias linhas, uma por tabela) e a
**projeção de gasto**.

## 3. As regras

### 3.1 O motor vem preso à tabela, e nunca é escolhido à parte

Declaração do dono do produto:

> "eu vou buscar o fornecedor e selecionar a tabela daquele fornecedor. Só isso. E aí clicar em
> adicionar, confirmar. E automaticamente o motor já está atrelado, integrado àquela tabela."
>
> — PO, 18/10/2026

O motor NUNCA é escolhido em separado: ele é um atributo da tabela e entra junto com ela. O
mockup confirma na forma: o motor é um campo do modal da tabela, e na configuração da conta a
linha só o **exibe** ("motor: …"), sem seletor. Registro:
`docs/registros/o-motor-vem-preso-a-tabela.md`. **Há uma frase do mockup que diverge — ver 9.1.**

### 3.2 Revenda não usa fornecedor

Mockup, nota 4: *"Revenda não usa fornecedor — a base é o cadastro de produtos do próprio
cliente. Fabricação usa, e é aí que entram as tabelas."* Na configuração, com modelo Revenda, a
seção "Base de cálculo do motor" diz: *"A I.A. monta o orçamento a partir dos produtos cadastrados
no sistema do próprio cliente. Não usa fornecedor nem tabela externa."* E o nicho: *"Na revenda o
nicho não muda o motor: a base é o próprio cadastro de produtos do cliente."*

**Prestação de serviço não é decidida pela nota** — ver 9.2.

### 3.3 Nada que pertença a um cliente é subido no Atendimentos I.A.

Mockup, tela de fornecedores: *"Nada aqui pertence a um cliente — são tabelas do fornecedor."*
Nota 5: *"Fornecedor é da plataforma — cadastrado em Fornecedores e tabelas, antes das contas, e
reaproveitado por todas. Nenhum arquivo de cliente entra aí."*

### 3.4 "Modelo de atendimento" NÃO é `tenant_settings.calc_type`

Declarado pelo dono do produto e escrito na própria tela (seção 2). A nota 3 do mockup repete:
*"Nada disso é a segmentação fiscal do cliente."* Medido em 18/10/2026: 16 dos 21
`INDUSTRIALIZACAO` são o DEFAULT do onboarding incompleto, não escolha — usar o `calc_type` como
modelo de atendimento herdaria esse default como se fosse decisão. E o modelo nasce **"não
definido"**: a lista de contas ligadas marca *"não definido"* em vez de supor um.

### 3.5 Projeção, não teto

Mockup, nota 7: *"Projeção, não teto — saíram o valor adicional por mês e a ação ao atingir o
teto. Ficou um número só, de acompanhamento: nada bloqueia e nada avisa."* Na tela: *"É a projeção
acordada na contratação, não um limite. Nada é bloqueado e ninguém é avisado — serve para você
ver quanto a conta está consumindo do que foi previsto."* No banco, o número é
`orcamentista_config.teto_de_consumo_brl`, e as duas colunas que saíram ficam lá sem uso.
Registro: `docs/registros/o-teto-que-virou-projecao.md`.

### 3.6 Trocar o modelo ou o nicho limpa as tabelas em uso

No mockup, mudar o **modelo** zera o nicho e as linhas; mudar o **nicho** zera as linhas. Uma
tabela de um nicho não sobrevive à troca para outro.

### 3.7 Excluir só o que ninguém usa

Mockup: *"Excluir só é possível enquanto nenhuma conta estiver usando a tabela. Se alguma estiver,
a tela diz quais — tire a tabela da conta primeiro."* O mesmo vale para excluir fornecedor: em uso,
a tela recusa com *"Em uso por: <contas>"*.

## 4. O menu

Mockup, menu lateral do super admin:

| seção | itens |
|---|---|
| **Clientes** | Clientes — a seção é marcada *"sempre aberta"* (feito no 2A) |
| **Atendimentos I.A.** *(nova)* | **Contas ligadas** (com a contagem das contas ligadas) · **Fornecedores e tabelas** (com a contagem de fornecedores) |
| **Super Admin** | Painel Super Admin · Tenants · Usuários · Pagamentos |

## 5. As telas

### 5.1 Tenants — a lista de contas *(bloco 2A, feito)*

Título do card no mockup: **"Contas"**; busca por nome ou email; botão **"+ Criar conta"**. Sete
colunas: **Conta** (nome + email) · **Situação** (interruptor + selo: Ativo, Trial, Suspenso,
Cancelado) · **Vigência** · **Free** (interruptor) · **Atendimentos I.A.** (só o interruptor) ·
**Aprovado** (Sim / Pendente) · **Ações** (botão "Ver"). Ligar o Atendimentos I.A. faz a conta
aparecer em "Contas ligadas".

### 5.2 A ficha da conta *(bloco 2A, parcial)*

Aberta pelo "Ver". O mockup mostra: Email · **Telefone** (marcado *"VEIO DA LISTA"*) · Situação
(selo) · Free · Vigência · Aprovado, e o botão "← Voltar para a lista". **O 2A acrescentou só o
Telefone**; a ficha de hoje ainda mostra Status cru, Trial até e Plano até separados — ver 9.6.

### 5.3 Atendimentos I.A. — contas ligadas *(a fazer)*

Lista SÓ as contas com o Atendimentos I.A. ligado. Colunas: **Conta** · **Modelo · nicho** (com
o selo *"não definido"* quando falta o modelo) · **Tabelas em uso** (*"N tabela(s)"*; *"não se
aplica"* na revenda; travessão quando nenhuma) · **Gasto no mês** (R$, e a porcentagem sobre a
projeção quando há projeção) · **Projeção** · **Configurar**. Lista vazia: *"Nenhuma conta ligada.
Ligue em Tenants → Atendimentos I.A."* Botão "Ir para Tenants".

### 5.4 Configuração de uma conta *(a fazer — bloco 2C)*

Quatro grupos, e "Salvar configuração" / "Cancelar":

1. **Modelo de atendimento** — o seletor da seção 2, com o texto de que não é a segmentação
   fiscal.
2. **Nicho** — seletor dos nichos do modelo escolhido; sem modelo, *"— escolha o modelo
   primeiro —"*. Nota da tela: na revenda, *"o nicho não muda o motor"*; nos outros, *"O nicho
   decide quais fornecedores e quais tabelas o motor usa."*
3. **Base de cálculo** — na **revenda**, o texto da regra 3.2 e um resumo do cadastro do cliente
   (no exemplo: *"1.284 produtos · 37 itens de custo · atualizado em 17/10/2026"*). Fora da
   revenda, o grupo se chama **"Tabelas em uso"**: cada linha mostra fornecedor · arquivo e
   vigência da tabela · *"motor: <arquivo>"* · remover. **"+ Adicionar"** abre dois seletores — o
   fornecedor (do nicho da conta) e depois a tabela daquele fornecedor — e o botão "Adicionar".
   Texto: *"O mesmo fornecedor pode aparecer em várias linhas, uma por tabela. Para subir ou trocar
   arquivo, vá em Fornecedores e tabelas."* Linha cuja tabela sumiu mostra *"tabela removida"*.
4. **Projeção de gasto** — três caixas: **Projeção (R$/mês)** (vazia = *"não definida"*),
   **Consumido no mês**, **Sobre a projeção** (%); e uma barra de 0 até a projeção. A barra muda
   de cor a partir de 80% — mudança visual, sem aviso nem bloqueio (regra 3.5).

### 5.5 Fornecedores e tabelas *(a fazer)*

Título: *"Fornecedores e tabelas de preço"*. Colunas: **Fornecedor** · **Nicho** · **Contas
usando** · "Tabelas". Botão **"+ Credenciar fornecedor"**, que abre o modal: **nome**, **nicho**
(agrupado por modelo) e a lista **"Tabelas deste fornecedor"** (*"Pode salvar sem nenhuma e subir
depois"*), e "Salvar credenciamento".

### 5.6 As tabelas de um fornecedor *(a fazer)*

Colunas: **Arquivo** · **Motor** · **Vigência** · **Subido em** · **Contas usando** · Editar /
Excluir. Botões **"+ Nova tabela"** e **"Editar fornecedor"** (modal: nome, nicho e **"Excluir
fornecedor"**). O modal da tabela tem **arquivo da tabela** e **arquivo do motor** (os dois
aceitam `.xlsx`, `.xls`, `.csv`, `.pdf`) e **vigência**; salvar exige os dois arquivos.

### 5.7 Tela do tenant

Nenhuma no mockup. O tenant só LÊ a própria linha de `orcamentista_config`; não há item de menu
para ele.

## 6. O que já existe no banco (bloco 1)

`public.orcamentista_config`, uma linha por conta, aplicada e verificada em 18/10/2026:

- leitura: a própria conta ou o super admin; escrita: só a rota do super admin (`service_role`);
- `authenticated` com SELECT e nenhum outro privilégio;
- `ativado_por` e `atualizado_por` sem FK (o autor é fato histórico);
- `atualizado_em` gravado pela rota em toda gravação, sem trigger.

Detalhes e razões no cabeçalho de `supabase/migrations/20261018000001_orcamentista_bloco_1.sql`.
**Nada do resto do mockup tem tabela ainda**: modelo e nicho da conta, nicho, fornecedor, tabela,
motor, linhas em uso e consumo.

## 7. Os blocos

| bloco | conteúdo | estado |
|---|---|---|
| 1 | `orcamentista_config`, rotas, liga/desliga na lista de contas | entregue, PR #95 |
| 2A | Tenants em 7 colunas, telefone na ficha, Clientes não recolhe, rótulo "Atendimentos I.A." | este branch |
| 2B | a definir | — |
| 2C | a configuração por conta (5.4) | a definir |

As telas 5.3, 5.5 e 5.6 e a seção nova do menu ainda não estão atribuídas a um bloco.

## 8. Pendências nomeadas de antes

- **Duas fontes de "é super admin"** — a rota lê `users.is_super_admin`, a RLS lê
  `users.role = 'super_admin'`. Cabeçalho da migração do bloco 1.
- **`calc_type` com DEFAULT e dois fallbacks divergentes** — `segment-visibility.ts`,
  `auth.context.tsx`, `configuracoes/index.tsx`.
- **O teto que virou projeção** — `docs/registros/o-teto-que-virou-projecao.md`.

## 9. O que o mockup NÃO decide — a definir

Cada item abaixo é uma pergunta para o dono do produto, não uma escolha feita aqui.

1. **O motor vem do modelo e nicho, ou da tabela?** A nota 3 do mockup diz *"Modelo e nicho
   dizem qual motor; fornecedor e tabela dizem com que números ele calcula."* O resto do mockup e
   a declaração de 18/10/2026 põem o motor como arquivo DA TABELA. As duas leituras não são a
   mesma; a regra 3.1 segue a declaração e o modal.
2. **Prestação de serviço usa fornecedor?** A nota 4 decide Revenda (não) e Fabricação (sim). No
   comportamento do mockup, Serviço cai no caminho de fornecedor — mas nenhum fornecedor de
   exemplo é de nicho de serviço, e nenhuma nota diz.
3. **Nicho sem fornecedor.** Quando o nicho da conta não tem fornecedor, o mockup oferece TODOS os
   fornecedores da plataforma em vez de nenhum. Não está dito se é a regra ou um atalho do
   protótipo.
4. **Fornecedor em nicho de revenda.** O modal de credenciamento oferece os nichos de Revenda,
   embora Revenda não use fornecedor (3.2).
5. **Tabela sem motor no credenciamento.** O modal "Credenciar fornecedor" cria tabelas com só
   arquivo e vigência, sem motor; o modal de tabela recusa salvar sem motor. Qual vale.
6. **A ficha da conta.** O mockup mostra Situação (selo) e Vigência (uma linha); a de hoje mostra
   Status cru, Trial até e Plano até. Fora do escopo do 2A, que só pediu o Telefone.
7. **Vigência: o critério.** O mockup escolhe "Trial até" quando HÁ data de trial; o 2A
   implementou por `plan_status === 'TRIAL'`, como instruído. Só diferem numa conta não-TRIAL com
   data de trial preenchida.
8. **Rótulos da lista.** O mockup diz "Contas" e "+ Criar conta"; a tela de hoje diz "Criar
   tenant", e o 2A não mudou isso.
9. **"Piso".** A nota 2 diz que na seção ficam *"segmentação, fornecedores, piso e teto"*. Nenhuma
   tela do mockup tem piso, e a nota 7 diz que ficou "um número só". O que é o piso, se existe.
10. **De onde vem o "Gasto no mês" / "Consumido no mês".** Nenhuma fonte de consumo existe hoje.
11. **O resumo da base da revenda.** O que conta como "itens de custo", e de onde vem a data de
    atualização.
12. **O que é importado dos arquivos.** O mockup diz que o conteúdo (*"código, dimensão, peso,
    referência, valor"*) é importado e fica por trás. Formato, validação e o que acontece com uma
    tabela que não importa — não decididos. O script do mockup ainda traz restos de uma versão
    com perfis editáveis (código, descrição, kg/m, R$/m) que nenhuma tela exibe.
13. **Vigência da tabela.** É texto livre no mockup. Se o sistema escolhe sozinho a tabela vigente
    de um fornecedor, ou se a linha da conta fica presa à tabela escolhida mesmo depois de vencer.
14. **Conta ligada e suspensa.** Se uma conta suspensa ou cancelada com o Atendimentos I.A. ligado
    aparece em "Contas ligadas".
15. **A seção Super Admin do menu.** O mockup lista quatro itens (Painel, Tenants, Usuários,
    Pagamentos); o menu de hoje tem oito (também Notificações, Convites, Cadastros e Planos
    Expirando). Não está dito se o mockup só abreviou ou se propõe tirar os outros quatro.
    E a seção nova "Atendimentos I.A." é uma seção à parte da "Super Admin": entrar no menu exige
    classificá-la em `clientes-vira-secao-propria.test.ts` (o que o super admin vê, seção por
    seção), e o mockup não diz se ela é só do super admin — os itens de hoje do Super Admin são
    `superAdminOnly`, sem módulo de permissão.
