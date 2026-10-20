# EPIC — Atendimentos I.A.

**Status:** em especificação. Bloco 1 entregue (PR #95). Bloco 2A neste branch. 2B e 2C a definir.
**Criado:** 18/10/2026 · **Revisto com o mockup:** 19/10/2026
**Fonte:** as instruções do dono do produto nas rodadas do bloco 1 e do bloco 2A, e o mockup
aprovado `docs/prd/atendimentos-ia-mockup.html`, **versão 21** — subida pelo dono do produto no
commit `2d666d9` (md5 `73a813d8bcf363cce9de73a0135afe78`), corrigida em 19/10/2026 em duas notas
obsoletas, por autorização dele (md5 `8ebb77c83243889fed72f1598f00b64d`), e atualizada no mesmo
dia com a decisão sobre Prestação de serviço (regra 3.2). **Versão vigente: md5
`c456f37d4d9bd969077d8141ebca071a`, 51.222 bytes, 752 linhas.** Ela chegou à `main` embrulhada num
envelope HTML; a branch guarda o arquivo cru — `docs/registros/o-envelope-do-mockup.md`.

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
| **motor** | é o **arquivo do motor** subido junto com a tabela, no mesmo modal. **Obrigatório em toda tabela** — regra 3.8. O mockup: *"Suba o arquivo do motor — sem ele a tabela não calcula"*. Texto da tela: *"O motor é quem faz as reduções de tipologia em cima dos perfis desta tabela. O conteúdo dos dois arquivos — código, dimensão, peso, referência, valor — é importado e fica por trás, sem aparecer aqui."* |

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
linha só o **exibe** ("motor: …"), sem seletor. A nota 3 do mockup, que dizia que modelo e nicho
determinavam o motor, era texto obsoleto — anterior a esta decisão — e foi corrigida no mockup em
19/10/2026: *"Modelo e nicho dizem qual catálogo a conta enxerga; o motor vem preso à tabela e
entra junto com ela, nunca escolhido à parte."* Registro:
`docs/registros/o-motor-vem-preso-a-tabela.md`.

### 3.2 Revenda e Prestação de serviço não usam fornecedor — só Fabricação usa

Declaração do dono do produto sobre Prestação de serviço:

> "Prestação de serviço vai considerar os produtos e os serviços salvos dentro do sistema."
>
> — PO, 19/10/2026

| modelo | base do motor | fornecedor → tabela → motor |
|---|---|---|
| **Fabricação** | as tabelas em uso da conta | **SIM — é o único modelo que usa** |
| **Revenda** | o cadastro do próprio cliente: **produtos** | não |
| **Prestação de serviço** | o cadastro do próprio cliente: **produtos E serviços** | não |

Mockup, nota 4: *"Revenda e Prestação de serviço não usam fornecedor — a base é o cadastro do
próprio cliente: produtos na revenda, produtos e serviços na prestação. Só Fabricação usa
fornecedor e tabela."* Na configuração, a seção "Base de cálculo do motor" diz, na revenda, *"A
I.A. monta o orçamento a partir dos produtos cadastrados no sistema do próprio cliente. Não usa
fornecedor nem tabela externa."*; na prestação, *"… a partir dos produtos e serviços cadastrados no
sistema do próprio cliente. Não usa fornecedor nem tabela externa."* E o nicho, nos dois: *"Aqui o
nicho não muda a base: ela é o próprio cadastro do cliente."*

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

### 3.8 O motor é obrigatório em toda tabela

Declaração do dono do produto:

> "quando for inserida uma nova tabela, tem que inserir o motor de aplicação"

Não existe tabela sem motor. O modal "Credenciar fornecedor" do mockup, que cria tabela só com
arquivo e vigência, é atalho do protótipo e não regra; o que vale é o modal da tabela, que recusa
salvar sem o arquivo do motor.

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
Telefone.** O resto da ficha de hoje não muda por causa do mockup — decisão 10.4.

### 5.3 Atendimentos I.A. — contas ligadas *(a fazer)*

Lista SÓ as contas com o Atendimentos I.A. ligado. Colunas: **Conta** · **Modelo · nicho** (com
o selo *"não definido"* quando falta o modelo) · **Tabelas em uso** (*"N tabela(s)"*; *"não se
aplica"* na revenda e na prestação de serviço; travessão quando nenhuma) · **Gasto no mês** (R$, e a porcentagem sobre a
projeção quando há projeção) · **Projeção** · **Configurar**. Lista vazia: *"Nenhuma conta ligada.
Ligue em Tenants → Atendimentos I.A."* Botão "Ir para Tenants".

### 5.4 Configuração de uma conta *(a fazer — bloco 2C)*

Quatro grupos, e "Salvar configuração" / "Cancelar":

1. **Modelo de atendimento** — o seletor da seção 2, com o texto de que não é a segmentação
   fiscal.
2. **Nicho** — seletor dos nichos do modelo escolhido; sem modelo, *"— escolha o modelo
   primeiro —"*. Nota da tela: na revenda e na prestação de serviço, *"Aqui o nicho não muda a
   base: ela é o próprio cadastro do cliente."*; na fabricação, *"O nicho decide quais
   fornecedores e quais tabelas o motor usa."*
3. **Base de cálculo** — na **revenda** e na **prestação de serviço**, o texto da regra 3.2 e um
   resumo do cadastro do cliente (no exemplo: *"1.284 produtos · 37 itens de custo · atualizado
   em 17/10/2026"* na revenda; *"1.284 produtos · 96 serviços · 37 itens de custo · atualizado em
   17/10/2026"* na prestação). Na **fabricação**, o grupo se chama **"Tabelas em uso"**: cada linha mostra fornecedor · arquivo e
   vigência da tabela · *"motor: <arquivo>"* · remover. **"+ Adicionar"** abre dois seletores — o
   fornecedor (do nicho da conta) e depois a tabela daquele fornecedor — e o botão "Adicionar".
   Texto: *"O mesmo fornecedor pode aparecer em várias linhas, uma por tabela. Para subir ou trocar
   arquivo, vá em Fornecedores e tabelas."* Linha cuja tabela sumiu mostra *"tabela removida"*.
4. **Projeção de gasto** — três caixas: **Projeção (R$/mês)** (vazia = *"não definida"*),
   **Consumido no mês**, **Sobre a projeção** (%); e uma barra de 0 até a projeção. A barra muda
   de cor a partir de 80% — mudança visual, sem aviso nem bloqueio (regra 3.5).

### 5.5 Fornecedores e tabelas *(bloco 2B.2 — ver seção 11)*

Título: *"Fornecedores e tabelas de preço"*. Colunas: **Fornecedor** · **Nicho** · **Contas
usando** · "Tabelas". Botão **"+ Credenciar fornecedor"**, que abre o modal: **nome**, **nicho**
(agrupado por modelo) e a lista **"Tabelas deste fornecedor"** (*"Pode salvar sem nenhuma e subir
depois"*), e "Salvar credenciamento". Esse modal cria tabela sem motor — **é atalho do protótipo,
não regra**: o motor é obrigatório em toda tabela (3.8).

### 5.6 As tabelas de um fornecedor *(bloco 2B.2 — ver seção 11)*

Colunas: **Arquivo** · **Motor** · **Vigência** · **Subido em** · **Contas usando** · Editar /
Excluir. Botões **"+ Nova tabela"** e **"Editar fornecedor"** (modal: nome, nicho e **"Excluir
fornecedor"**). O modal da tabela tem **arquivo da tabela** e **arquivo do motor** e **vigência**;
salvar exige os dois arquivos. Os formatos aceitos nos dois arquivos são a lista única
`EXTENSOES_ACEITAS`, em `src/utils/atendimentos-ia-catalogo.ts` — este EPIC a cita e não a repete.
O `.xlsm` entrou nela em 20/10/2026.

A validação de formato existe **duas vezes, e não é repetição** (dono do produto, 20/10/2026): o
`accept` do input é sugestão, não trava — quem escolhe "Todos os arquivos" passa. A **tela** recusa
ao escolher, para avisar cedo; a **rota** recusa para valer. E **toda recusa aparece dentro do
modal, com o arquivo e o motivo**: em 20/10/2026 a recusa da rota já existia e funcionava, e o
defeito era ela ser invisível — o modal não fechava e não explicava. Portão:
`atendimentos-ia-formato-do-arquivo.test.tsx`.

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
| 2B.1 | o catálogo no banco (nicho, fornecedor, tabela, tabela em uso) e o bucket `comprovantes` preso ao tenant | entregue, PR #98 |
| 2B.2 | a tela de Fornecedores e tabelas (5.5 e 5.6) e a seção Atendimentos I.A. no menu | este branch |
| 2C | a configuração por conta (5.4) | a definir |

As telas 5.3, 5.5 e 5.6 e a seção nova do menu ainda não estão atribuídas a um bloco.

## 8. Pendências nomeadas de antes

- **Duas fontes de "é super admin"** — a rota lê `users.is_super_admin`, a RLS lê
  `users.role = 'super_admin'`. Cabeçalho da migração do bloco 1.
- **`calc_type` com DEFAULT e dois fallbacks divergentes** — `segment-visibility.ts`,
  `auth.context.tsx`, `configuracoes/index.tsx`.
- **O teto que virou projeção** — `docs/registros/o-teto-que-virou-projecao.md`.

## 9. O que segue aberto — a definir

Cada item abaixo é uma pergunta para o dono do produto, não uma escolha feita aqui.

1. **Nicho sem fornecedor.** Quando o nicho da conta não tem fornecedor, o mockup oferece TODOS os
   fornecedores da plataforma em vez de nenhum. Não está dito se é a regra ou um atalho do
   protótipo.
2. **Fornecedor em nicho de revenda ou de serviço.** O modal de credenciamento oferece os nichos
   de Revenda e de Prestação de serviço, embora nenhum dos dois use fornecedor (3.2).
3. **De onde vem o "Gasto no mês" / "Consumido no mês".** Nenhuma fonte de consumo existe hoje.
4. **O resumo da base da revenda e da prestação de serviço.** O que conta como "itens de custo",
   e de onde vem a data de atualização.
5. **O que é importado dos arquivos.** O mockup diz que o conteúdo (*"código, dimensão, peso,
   referência, valor"*) é importado e fica por trás. Formato, validação e o que acontece com uma
   tabela que não importa — não decididos. O script do mockup ainda traz restos de uma versão
   com perfis editáveis (código, descrição, kg/m, R$/m) que nenhuma tela exibe.
6. **Vigência da tabela.** É texto livre no mockup. Se o sistema escolhe sozinho a tabela vigente
   de um fornecedor, ou se a linha da conta fica presa à tabela escolhida mesmo depois de vencer.
7. **Conta ligada e suspensa.** Se uma conta suspensa ou cancelada com o Atendimentos I.A. ligado
   aparece em "Contas ligadas".
8. **A seção Super Admin do menu.** O mockup lista quatro itens (Painel, Tenants, Usuários,
   Pagamentos); o menu de hoje tem oito (também Notificações, Convites, Cadastros e Planos
   Expirando). Não está dito se o mockup só abreviou ou se propõe tirar os outros quatro.
   E a seção nova "Atendimentos I.A." é uma seção à parte da "Super Admin": entrar no menu exige
   classificá-la em `clientes-vira-secao-propria.test.ts` (o que o super admin vê, seção por
   seção), e o mockup não diz se ela é só do super admin — os itens de hoje do Super Admin são
   `superAdminOnly`, sem módulo de permissão.

## 10. O que foi decidido em 19/10/2026

Pontos que a primeira revisão contra o mockup listava como abertos, e que o dono do produto
resolveu. Ficam aqui, com a razão, para que ninguém os reabra lendo só o mockup.

1. **O motor é atributo da tabela** — entra junto com ela e nunca é escolhido em separado (3.1).
   A nota 3 do mockup que dizia o contrário era texto obsoleto e foi corrigida no mockup.
2. **O motor é obrigatório em toda tabela** (3.8). O modal de credenciar fornecedor do mockup é
   atalho do protótipo, não regra.
3. **Não existe piso.** A nota 2 do mockup que o citava ("segmentação, fornecedores, piso e teto")
   era texto obsoleto e foi corrigida no mockup. O único número é a projeção (3.5).
4. **O mockup não governa rótulos de telas que o 2A não tocou.** A ficha da conta continua com o
   que tem, mais o Telefone; a lista de contas continua com "Criar tenant". Mudar esses rótulos é
   pedido próprio, não consequência do mockup.
5. **Vigência por `plan_status === 'TRIAL'`, como está no 2A.** O mockup escolhe "Trial até" pela
   PRESENÇA da data de trial, e esse critério é mais frágil: uma conta fora do trial com
   `trial_ends_at` preenchida apareceria como em trial. O `plan_status` diz em que estado a conta
   ESTÁ; a data diz só que ela teve um trial. Portão: `o-painel-de-contas-cabe-na-tela.test.tsx`,
   caso da Vigência, em que as contas têm as duas datas e só o `plan_status` decide.
6. **Prestação de serviço usa o cadastro do próprio cliente — produtos e serviços — e NÃO usa
   fornecedor nem tabela** (3.2). Declaração do dono do produto: *"Prestação de serviço vai
   considerar os produtos e os serviços salvos dentro do sistema."* Até esta decisão, o código do
   mockup levava Serviço ao caminho de fornecedor só porque escondia o fornecedor apenas na
   Revenda — consequência, não decisão. Revenda é o mesmo caminho, só com produtos. **Fabricação é
   o único modelo que usa fornecedor → tabela → motor.**

## 11. O bloco 2B.2 — Fornecedores e tabelas (19/10/2026)

**A trava que decide o desenho.** As quatro tabelas do catálogo têm `REVOKE ALL` de `anon` e
`authenticated`, sem GRANT. Pelo cliente do navegador elas não dão erro que se note: a lista chega
vazia e parece "nenhum fornecedor". Por isso NENHUMA tela lê ou escreve pelo cliente do Supabase —
tudo passa por rotas em `src/pages/api/super-admin/atendimentos-ia/`, com `service_role`, e o
único outro lugar que toca as quatro tabelas é `src/lib/atendimentos-ia/repositorio.ts`, que só
as rotas importam. Portão: `atendimentos-ia-a-tela-nao-fala-com-o-banco.test.ts`.

**Escolhas desta rodada, com a razão — cada uma é revisável pelo dono do produto:**

1. **"Contas ligadas" ficou FORA do menu.** A tela é de outro bloco; uma entrada que leva a um
   "em construção" é o menu oferecendo o que não existe — a mesma família de
   `docs/registros/o-menu-oferecia-o-que-o-guarda-proibia.md`. A seção tem um item só,
   "Fornecedores e tabelas", e por isso não recolhe (a mesma razão de Clientes). A contagem de
   fornecedores ao lado do item (seção 4) também não entrou.
2. **Os NICHOS ganharam onde ser criados**, num quadro dentro de "Fornecedores e tabelas". O
   mockup os traz prontos; o banco nasce sem nenhum (a `20261019000001` não semeia), e sem nicho
   não se credencia fornecedor. Onde o cadastro de nicho mora em definitivo é decisão aberta.
   **A semente** `20261019000003_nichos_iniciais.sql` (escrita, NÃO aplicada) traz doze nichos,
   quatro por modelo: o dono do produto nomeou Esquadrias, Móveis personalizados, Mecânicas e Salões
   de beleza; os outros oito são PROPOSTA do assistente, marcados assim no arquivo.
3. **O ARQUIVO não atravessa a rota.** A rota decide o caminho e assina UM envio para ele, com
   `service_role` (`tabelas/url-de-envio.ts`); o navegador manda os bytes para essa URL com
   `fetch`, sem o cliente do Supabase. A razão é o limite de corpo de requisição das funções da
   Vercel (4,5 MB pela documentação da plataforma, NÃO medido aqui): uma tabela de preço em
   `.xlsx` pode passar disso, e a rota recusaria um arquivo legítimo. Antes de gravar a linha, a
   rota confere que os dois objetos chegaram ao bucket.
4. **Excluir tabela: a LINHA primeiro, depois os objetos.** Se o Storage falhar, o arquivo fica
   órfão no bucket — desperdício, não erro de cálculo. A ordem contrária deixaria, numa falha do
   banco, uma tabela que a conta vê e que não calcula. A resposta avisa quando sobrou órfão.
5. **Excluir o que está em uso** — tabela, fornecedor com tabela, nicho com fornecedor ou
   escolhido por conta — o banco recusa (23503) e a rota responde com QUEM segura: as contas, as
   tabelas, os fornecedores. Nunca um "não foi possível" genérico.
6. **O nicho do credenciamento continua oferecendo os três modelos**, como o mockup. A regra de que
   só Fabricação usa fornecedor (3.2) NÃO é imposta nem pelo banco (decisão de 19/10) nem por esta
   tela — ela segue o mockup. O ponto 9.2 continua aberto, e é ele que decide se a tela passa a
   oferecer só os nichos de Fabricação.
7. **A data fica na borda direita**, nunca emendada no texto do arquivo — na lista do
   credenciamento e na coluna "Subido em" —, em `tabular-nums` (pedido do dono do produto,
   19/10/2026).

**O vocabulário da área: a palavra é MODELO — decisão do dono do produto, 20/10/2026.**

Dentro do Atendimentos I.A. a palavra é **modelo** (e **nicho**), em tela, em mensagem, em nome de
código e em documentação. A palavra do onboarding do cliente — a da segmentação fiscal que ele
escolhe no primeiro acesso — é vocabulário do sistema DELE, e não aparece aqui.

**A razão: separar o vocabulário é separar os dois mundos.** O modelo do Atendimentos I.A. não é a
escolha fiscal do cliente (3.4), e um texto que usasse a mesma palavra para os dois convidaria a
confundi-los.

- **A única forma permitida é "segmentação fiscal"**, e ela fica: existe exatamente para dizer que
  o modelo NÃO é o mundo do cliente — é o texto da tela da conta e da nota 3 do mockup. Apagá-la
  apagaria a separação.
- **A citação do dono do produto de 19/10/2026** — a cascata, dita antes desta decisão — fica como
  foi dita, com a data e a nota de que o vocabulário veio depois: citação é fato, não texto a
  manter.
- **Ficam fora**, porque falam do mundo do cliente: o harness do bloco 1, que usa a coluna real
  `tenants.segment`, e os comentários das migrações já aplicadas, que só se editam com o protocolo
  de hash.
- **Portão:** `src/utils/__tests__/atendimentos-ia-vocabulario.test.ts` — vermelho se a família da
  palavra aparecer em `src/` da área ou neste EPIC e no mockup, fora das exceções nominais, cada
  uma com a razão no cabeçalho do teste.

**Só Fabricação usa fornecedor → tabela → motor, no USO POR CONTA — decisão do dono do produto de
19/10/2026 (3.2), aplicada em 20/10/2026.**

Nas palavras dele: *"Prestação de serviço vai considerar os produtos e os serviços salvos dentro do
sistema"*; e, sobre Revenda, *"o motor dele vai considerar a base de conhecimento, que são os
produtos salvos no próprio sistema"*.

- **A tela da conta** só mostra "Tabelas em uso" quando o modelo SALVO da conta é Fabricação. Em
  Revenda e em Prestação de serviço o grupo some, e no lugar entra "Base de cálculo do motor", com
  o texto do mockup: produtos, na Revenda; produtos e serviços, na Prestação. A linha de números
  do mockup ("1.284 produtos · …") NÃO entrou: mostraria o tamanho do cadastro do cliente, que é
  conteúdo da conta.
- **A rota fecha a porta dos fundos**: incluir tabela em conta de Revenda ou de Prestação é 409,
  dizendo por quê — antes da conferência do nicho, para não mandar escolher um nicho que não
  adiantaria. A lista da conta também não oferece fornecedor nesses modelos.
- **O catálogo NÃO muda**: nicho, fornecedor e tabela continuam podendo existir nos três modelos
  (o item 6 acima continua valendo para o credenciamento). Só o uso por conta é restringido.
- **A regra mora num lugar só**: `MODELO_COM_FORNECEDOR` e `usaTabelaDeFornecedor`, em
  `src/utils/atendimentos-ia-catalogo.ts`, com a citação da decisão no ponto em que é declarada.
- **Portões**: a seção (7) de `atendimentos-ia-tabelas-em-uso.test.ts` e "a base do motor por
  modelo", em `atendimentos-ia-tabelas-em-uso-a-tela.test.tsx`, cada um com o contraste de
  Fabricação.
