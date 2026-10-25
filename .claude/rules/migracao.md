---
paths:
  - "supabase/migrations/**"
  - "supabase/**/*.sql"
---

# Migração — a ordem, a entrega e a autorização por hash

> **Fusão de três páginas, 25/10/2026, por decisão do dono do produto.** As originais estão em
> `docs/regras/arquivo/` (`migration-antes-do-merge.md`, `migration-delivery.md`,
> `transformacao-quebra-a-cadeia-de-hash.md`), sem alteração. Aqui o texto de cada uma está
> inteiro, uma por Parte.
>
> **A Parte I PREVALECE sobre a Parte II.** Onde a Parte II diz *"antes ou junto"* (a tabela "A ORDEM
> depende do que a migração CRIA"), vale a Parte I: aplicar e VERIFICAR por consulta ANTES do
> merge, e o PR nomeia a migração que pressupõe. A célula da tabela foi reescrita para dizer isso,
> com a redação antiga datada ao lado.

## Parte I — A Migração Antes do Merge

> **Esta regra é independente da rodada que a originou.** Foi pedida em 25/10/2026, depois do #158,
> mas **não depende dele**: vale para todo PR cujo código pressupõe coluna, tabela, função, tipo ou
> política que ainda não existe no banco de produção.

### O critério

Formulação do dono do produto, registrada como está:

> Há uma classe recorrente aqui: PR de aplicação margeado antes da migration que ele pressupõe,
> quebrando produção. Quando um PR depende de coluna/tabela/função nova, a migration é aplicada e
> **VERIFICADA em produção primeiro**, e só então o PR é margeado; **o PR deve nomear no corpo qual
> migration ele pressupõe.**

São três obrigações, e cada uma fecha um buraco diferente:

| obrigação | o que ela impede |
|---|---|
| **aplicar ANTES do merge** | a janela em que o código novo já está em produção e o banco ainda não tem o que ele lê |
| **VERIFICAR por consulta ao banco, antes do merge** | tomar o retorno do comando de aplicação por prova — e, quando a aplicação vai por payload transformado, tomar o arquivo por prova (a Parte III) |
| **o PR NOMEIA a migração** — caminho, md5 e o que quebra sem ela | que quem mergeia descubra a dependência lendo o diff, ou não descubra |

### Por que a distinção é difícil de ver

Porque **nenhum instrumento do repositório enxerga o banco**. `test:ci`, `tsc`, `build` e lint leem
código; o mock do supabase devolve o que o teste pôs nele, com ou sem a coluna existir em produção.
O PR fica verde com a migração pendente — e ficou, nas sete aparições abaixo. É
`portao-que-nao-alcanca.md` no eixo do tempo: o portão não tem como ficar vermelho no caso que a
regra quer barrar.

E os dois atos parecem um só. O PR traz o `.sql` e o código no mesmo diff, e a leitura natural é que
mergear o PR entrega os dois. Não entrega: o merge publica o código, e o `.sql` continua sendo
intenção até alguém aplicá-lo (a Parte II: *merge não é entrega*). Os dois atos têm
donos e horários diferentes, e nada no fluxo os sincroniza.

O defeito também não tem sintoma no merge. Ele aparece no primeiro uso do caminho que lê o que falta
— e, se o caminho é pouco usado, pode não aparecer na janela inteira, que é o que torna a inversão
fácil de repetir: a maioria delas **não deixou erro que alguém visse**.

### As aparições — MEDIDAS em 25/10/2026

**Método.** `supabase_migrations.schema_migrations.version` é o instante da aplicação em UTC quando
a migração foi aplicada pelo conector ou pelo CLI — conferido: a `version` `20261024132054` da
`20261024000001` bate com o `postgres_logs` de `2026-10-24T13:20:54.255Z`. O horário do merge vem do
GitHub (`merged_at`). Quais migrações cada PR trazia vem da lista de arquivos do próprio PR. Versões
iguais ao prefixo do arquivo (as de `20261019000001` a `20261023000001`) **não são horário**, e por
isso não entram.

| # | PR | a migração | merge (UTC) | aplicação (UTC) | ordem | efeito medido |
|---|---|---|---|---|---|---|
| 1 | #18 | `add_commission_profit_amount_to_orders` | 31/08 20:22:09 | 01/09 22:01:48 | **25 h 39 min DEPOIS** | ficou armada; achada na auditoria de 01/09 (a Parte II) |
| 2 | #26 | `add_expense_snapshot_to_services` | 01/09 17:19:27 | 01/09 22:05:51 | **4 h 46 min DEPOIS** | **produção quebrou** ao salvar serviço: `Could not find the 'expense_snapshot' column of 'services' in the schema cache` |
| 3 | #52 | `delete_sale_cascade` (função) | 08/09 15:57:31 | 08/09 16:11:03 | **13 min 32 s DEPOIS** | não medido — o log daquela janela não existe mais |
| 4 | #72 | `entrada_de_imposto_por_linha` | 23/09 16:13:51 | 23/09 19:38:23 | **3 h 24 min DEPOIS** | não medido |
| 5 | #73 | `bloco_de_custo_na_nota_e_no_item` e `serie_de_parcelas_e_estorno` | 23/09 18:35:20 | 23/09 19:38:36 e 19:38:50 | **1 h 03 min DEPOIS** | não medido |
| 6 | #74 | `descascamento_da_nota` | 23/09 23:17:05 | 24/09 01:20:24 | **2 h 03 min DEPOIS** | não medido |
| 7 | **#158** | `20261025000001_escolhas_na_pre_definicao` | **25/10 02:43:31** | **25/10 02:38:06** (log) | **5 min 24 s ANTES** | nenhum: a coluna existia quando o código chegou |

**A #158 é a aparição medida em que a ordem foi CUMPRIDA**, e é por isso que ela está aqui. O PR
nomeava a migração no topo do corpo — caminho, md5 e *"Sem a coluna, a leitura da pré-definição
falha e a conversa para"* —, e o código lê `escolhas` em todo select da pré-definição: mergeado sem
a coluna, a conversa inteira do WhatsApp pararia na primeira mensagem. A aplicação foi pelo conector,
num payload de 2.273 caracteres sem `BEGIN`, **com o bloco `$verifica$` e o `NOTIFY` dentro** — a
verificação rodou na mesma transação e não abortou. Conferido depois, por consulta: a coluna é
`jsonb`, nulável, sem default, a CHECK de objeto está lá, e o md5 do COMMENT gravado é o do texto do
arquivo (`80d1dc5577b8210fb0dbf7fd07b90a80`).

O que as sete dizem juntas, e desmente a leitura fácil: **nomear não bastou.** O #52, o #72, o #73 e o #74
estão entre os quinze PRs que a busca por "ANTES do merge" encontra (a busca do GitHub olha título,
corpo e comentários) — e os quatro foram mergeados antes da aplicação. O aviso estava lá, e a ordem se inverteu
assim mesmo. É por isso que a regra tem **três** obrigações, e a do meio é a que fecha: o merge só
acontece depois de uma **consulta ao banco** que mostre a estrutura lá. Um aviso no corpo pede a
ordem; a consulta é o que a confirma antes do ato.

#### De quem são

As migrações das seis inversões foram escritas pelo assistente, e os merges e as aplicações são do
dono do produto. Está escrito assim porque a regra tem duas metades e cada lado tem a sua: quem
escreve o PR é quem sabe o que o código pressupõe, e só ele pode nomeá-lo; quem mergeia e aplica é
quem controla a ordem. Até o #29 versionar a Parte II, em 01/09, nenhuma das duas
metades estava escrita — e as #3 a #6 vieram **depois** dela, com o aviso no corpo do PR, o que
mostra que estar escrita não bastou: a ordem para COLUNA dizia *"antes ou junto"*, *junto* não tem
instrumento, e nenhuma das duas páginas exigia a consulta ao banco **antes** do merge.

#### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, em 25/10/2026: os PRs mergeados com "ANTES do merge" no corpo
(15) e com `expense_snapshot`, `commission_amount` ou "entrada de imposto" (13), cruzados com
`schema_migrations` desde 01/09. **Sete aparições com ordem medida. Nenhuma foi forçada.**

**Examinadas e NÃO contadas, com a razão:**

| o quê | por que não entra |
|---|---|
| #126, #132, #135, #136 e as migrações de 19 a 23/10 | a `version` gravada é o prefixo do arquivo, não o instante da aplicação: a ordem **não é mensurável** |
| `orcamentista_motor_tipologia_tempo` (`20261024000003`) | não aplicada até hoje, e o código que está em produção lê a coluna antiga — não há PR mergeado que a pressuponha |
| `orcamentista_motor_tipologia_detalhe` | o código foi escrito para **recusar com frase nomeada** enquanto a tabela não existisse, e a tabela foi criada em 25/10 às 00:31:06 por `execute_sql`, sem arquivo no repositório. É a defesa da seção seguinte — e é também uma dívida: a estrutura em produção não tem arquivo que a descreva |
| #59, #61, #69, #70 | as versões ficam **antes** dos merges, mas as listas de arquivos desses PRs não foram conferidas: não entram como medidas |

### O corolário aplicável ANTES do defeito existir

**Antes de abrir um PR, pergunte o que o código novo lê ou chama que o banco de produção ainda não
tem — e consulte o banco para saber, em vez de deduzir pela pasta de migrações.**

Quando houver alguma coisa, o corpo do PR **começa** por ela, nesta forma:

```
### ⚠️ Aplicar a migração ANTES do merge
<caminho do .sql>, md5 <hash>, <linhas> linhas, <bytes> bytes
O que quebra sem ela: <o caminho do código e o erro que aparece>
Estado em produção hoje: <a consulta feita e o que ela devolveu>
Pelo conector: <o payload transformado e o segundo hash, se houver>
```

E o arquivo traz a verificação que **aborta** dentro da mesma transação — porque é ela que viaja
junto com qualquer payload, enxugado ou não. Foi o que tornou a #158 verificável pelo log.

Sinais de que o PR pressupõe algo que o banco não tem, em ordem de força:

1. O diff traz um `.sql` em `supabase/migrations/` **e** código que o usa.
2. Um `select` passa a pedir uma coluna nova, ou um `.rpc(...)` chama uma função nova.
3. O mock do supabase nos testes devolve a linha inteira, sem projetar o select — e então o teste
   fica verde com a coluna ausente (`teste-que-nao-exercita.md`; foi a mutação E13 do #158).
4. A migração foi escrita na mesma rodada do código, e ninguém consultou o `information_schema`.

#### A defesa que não depende da ordem

Quando o código **pode** funcionar sem a estrutura nova, ele deve recusar com frase nomeada em vez de
quebrar — foi o desenho do levantamento enquanto `orcamentista_motor_tipologia_detalhe` não existia
(`faltou-dado-recusa-nomeada.md`). Isso **não substitui** a ordem: reduz o estrago de uma inversão
de *quebra* para *recusa*. Onde o código não tem o que recusar — um select que precisa da coluna para
ler a linha inteira, como o do #158 —, só a ordem protege.

### As ressalvas de método — o que a medição NÃO diz

- **Não mede dano nas aparições 3 a 6.** O log de postgres e de edge daquelas janelas não existe
  mais (o conector lê no máximo 24 horas). Que nenhum erro tenha sido relatado não é medição.
- **A `version` só é horário quando foi gerada na aplicação.** Para as aplicadas com a versão igual
  ao prefixo do arquivo, a ordem é desconhecida — não boa nem má.
- **A medição do #158 é de uma aplicação feita pelo conector**, com o payload enxuto. O md5 do
  payload não foi publicado antes da aplicação; a coerência foi conferida depois, pelo catálogo.
- **Não há portão.** Nada no CI compara o que o código lê com o que o banco tem. A regra é
  procedimento, e o ato que a cumpre — aplicar, consultar, só então mergear — é do dono do produto.
  Um portão possível, **não implementado**: um check de pré-merge que leia os `.sql` novos do diff e
  consulte o `information_schema` de produção. Exige credencial de leitura no CI e escopo próprio.

### Relação com as outras regras

a Parte II é a mãe desta: lá está *merge não é entrega*, o protocolo de aplicação e a
tabela "a ordem depende do que a migração cria". Esta página **aperta** aquela tabela — para coluna,
tabela, função ou política que o código novo usa, a ordem é ANTES e VERIFICADA, nunca *junto* — e
acrescenta a obrigação de o PR nomear a dependência. `estado-relatado-vs-real.md` é a razão de a
verificação ser por consulta, e não pelo relato de quem aplicou. a Parte III
cobre o payload enxuto da #158. `portao-que-nao-alcanca.md` explica por que o PR verde não diz nada
sobre o banco. `faltou-dado-recusa-nomeada.md` é a defesa que reduz o estrago quando a ordem falha.
`registro-de-classe.md` decidiu a forma desta página.

## Parte II — Entrega de Migração

### A regra

**PR que adiciona migração só está entregue quando a migração estiver APLICADA e VERIFICADA no
banco.** Merge não é entrega. O arquivo `.sql` no repositório é a intenção; a coluna existindo
na tabela é o fato.

**Build verde não prova schema aplicado.** `npm run build`, `tsc`, `jest` e `next lint` leem
código, não o banco. Todos os quatro passam com a migração pendente — e passaram.

### O que aconteceu (01/09/2026)

Produção quebrou ao salvar serviço:

```
Could not find the 'expense_snapshot' column of 'services' in the schema cache
```

O PR que criava a coluna estava mergeado havia horas. A migração nunca tinha sido aplicada.
Auditando a rodada inteira, **DUAS migrações estavam pendentes**, não uma:

| PR | Migração | Estado no merge |
|----|----------|-----------------|
| #18 | `20260831000001_add_commission_profit_amount_to_orders.sql` | pendente — não detectada |
| #26 | `20260902000001_add_expense_snapshot_to_services.sql` | pendente — quebrou produção |

A do #18 estava pendente desde antes e ainda não tinha aparecido: `orders.commission_amount`
e `orders.profit_amount` são `NOT NULL DEFAULT 0`, e o caminho que grava esses campos é menos
percorrido que o de salvar serviço. Ficou armada, esperando.

**Nenhum gate pegou.** Não é que um gate falhou — não existe gate. Ver a seção seguinte.

### Por que não existe gate hoje

O controle de migrações do banco e os arquivos do repositório **não têm relação nenhuma**.
A pasta `supabase/migrations/` é **documentação da intenção, não fonte de verdade do schema**.

#### Medição de 15/09/2026 — o quadro atual

| | |
|---|---|
| Arquivos `.sql` em `supabase/migrations/` | **151** (149 migrações + 2 `rollback_*.sql` sem versão) |
| Versões distintas nos nomes dos arquivos | **146** |
| Versões em `supabase_migrations.schema_migrations` | **137** |
| **Versões em comum** | **4** |
| Arquivos locais sem correspondente remoto | **142** |
| Versões remotas sem arquivo local | **133** |

**Método**, para quem for refazer: extrair o prefixo de 14 dígitos de cada nome de arquivo
(`ls supabase/migrations/*.sql`, `sed -E 's#^([0-9]{14}).*#\1#'`), listar as versões remotas
pelo conector (`list_migrations`, que lê `supabase_migrations.schema_migrations`), e intersectar
os dois CONJUNTOS. Comparar contagens não serve: 146 e 137 são números próximos e a
intersecção é 4.

As quatro em comum são todas de 28/02/2026 — `20260228001435`, `001447`, `001647` e `001719`,
as do enum de papéis. Nelas o `name` remoto é idêntico ao do arquivo, então foram aplicadas
pelo caminho que o CLI pressupõe. São as únicas.

**Correção de uma medição anterior, registrada aqui em vez de apagada.** A medição de
01/09/2026 nesta mesma página dizia **146 arquivos, 130 versões remotas e ZERO em comum**. O
zero estava errado: as quatro de fevereiro já existiam dos dois lados. O diagnóstico não muda
— quatro em 146 é a mesma conclusão que zero em 146 — mas o número, sim, e um número errado
numa página de regra é o tipo de coisa que alguém cita depois.

#### Caso concreto: a constraint que esta rodada substituiu nunca esteve no histórico

`20260628000001_iva_dual_reduction_factor_check.sql` existe no repositório, está aplicada no
banco desde junho, e **não aparece em `schema_migrations`**. O mesmo vale para
`20260414000001_add_iva_dual_fields` e `20260629000001_add_iva_dual_reference_per_item`.

Ou seja: o arquivo existir e o efeito dele estar no banco são fatos independentes, e o
histórico de migrações não liga um ao outro. Foi assim que a rodada do fator de redução
descobriu a constraint — consultando `pg_constraint`, não lendo a pasta.

#### O `config.toml` aponta para lugar nenhum

`supabase/config.toml` traz `project_id = "web-app"`. Não é o ref do projeto de produção
(`jvthwpkwzpangnwhuyvj`) — é o placeholder que o `supabase init` grava com o nome do diretório.
Qualquer comando de CLI que dependa desse arquivo para saber contra quem falar não está
apontando para a produção.

#### A consequência, e por que ela precisa estar escrita ANTES

**`supabase db push` não reconcilia nada.** Rodado hoje, ele consideraria **142 arquivos
pendentes** — quase todos já aplicados no banco por outro caminho. Não é um comando de
sincronização esperando para ser descoberto; é um comando que trataria seis meses de schema
já existente como trabalho a fazer.

Está escrito aqui porque a leitura natural de uma pasta chamada `migrations` com 149 arquivos é
que ela seja a fonte de verdade, e a leitura natural de `db push` é que ele sincronize. As duas
são falsas neste repositório, e quem descobrir isso rodando o comando descobre tarde.

**Não há proposta de reconciliação nesta página.** Alinhar os 142 é decisão de risco com escopo
próprio, e não sai de uma correção de defeito — é o mesmo item de INFRAESTRUTURA já registrado
na seção seguinte.

#### Efeito colateral: três timestamps duplicados entre arquivos

149 arquivos de migração carregam 146 versões distintas. Três pares compartilham timestamp:

| Versão | Arquivos |
|---|---|
| `20260310000003` | `soft_delete_is_active`, `split_labor_expense_group` |
| `20260327000001` | `add_commission_tables`, `extend_expense_group_constraint` |
| `20260419000002` | `epic22_customer_attachments`, `epic22_products_items_soft_delete` |

Hoje é inofensivo, porque nada consome a pasta como sequência. Passaria a importar no dia em
que alguém adotasse o CLI de verdade: a versão é a chave em `schema_migrations`, e duas
migrações com a mesma chave não cabem lá.

Enquanto isso for verdade, **a verificação é manual e é obrigatória**.

### A CONVENÇÃO DE NOME — o que dá rastreabilidade arquivo ↔ aplicação

Quando a aplicação é feita fora do CLI, o banco gera a versão na hora e ela **nunca** vai bater
com o nome do arquivo. O que ainda dá para preservar é a ligação, e há precedente de ter sido
preservada:

| Versão remota | `name` registrado | Dá para achar o arquivo? |
|---|---|---|
| `20260910193636` | `20260909000001_delete_sale_cascade_sem_precondicao` | **sim** — o nome do arquivo está inteiro no campo |
| `20260915151847` | `iva_dual_reduction_factor_range` | **não** — o prefixo `20260915000001` se perdeu |

As duas foram aplicadas pelo conector, com dias de diferença. A primeira deixa rastro; a
segunda obriga a adivinhar por semelhança de nome.

**Convenção, daqui em diante:** ao aplicar por fora do CLI, o `name` da migração é o **nome
completo do arquivo do repositório**, com o prefixo de timestamp, sem a extensão. Custa nada no
momento da aplicação e é a única coisa que liga as duas metades enquanto o gate não existir.

A perda de hoje fica registrada como perda, não corrigida: reescrever o `name` de uma migração
já aplicada é mexer em histórico, e não vale o risco por um registro.

#### A convenção FUNCIONOU — primeira aplicação sob ela, 16/09/2026

As três migrações do cClassTrib foram aplicadas por fora do CLI (a primeira pelo SQL Editor,
as outras duas pelo conector) e o `name` carrega o nome completo do arquivo:

| versão gerada pelo banco | `name` registrado |
|---|---|
| `20260916190412` | `20260916000001_cst_ibs_cbs_e_cclass_trib` |
| `20260916193058` | `20260916000002_classificacao_fiscal_em_products` |
| `20260916193508` | `20260916000003_reducao_por_tributo_backfill` |

**A versão continua não batendo, e isso é o esperado** — o banco a gera na hora, e a regra
acima já dizia que ela nunca vai coincidir com o prefixo do arquivo. O que a convenção
preserva é a LIGAÇÃO, e ela está preservada: dá para achar o arquivo a partir da linha do
`schema_migrations` sem adivinhar por semelhança de nome, que era exatamente o que se perdeu
em `iva_dual_reduction_factor_range`.

Fica registrado como precedente de que a convenção é praticável, não só desejável.

#### Duas coisas que a aplicação de hoje ensinou, e que não estavam escritas

**1. `BEGIN`/`COMMIT` no arquivo brigam com o conector.** O conector do Supabase abre
transação própria; o `BEGIN` do arquivo produz `WARNING: there is already a transaction in
progress` e o `COMMIT` fecha a transação DELE. As duas migrações aplicadas por esse caminho
tiveram os dois removidos na hora. O SQL Editor, ao contrário, aceita o arquivo como está.

Consequência para quem escrever a próxima: **o `BEGIN`/`COMMIT` é do arquivo, e quem aplica
decide se tira.** Escrever sem eles seria pior — aplicar por psql ou pelo Editor deixaria cada
comando em autocommit, e uma falha no meio não teria rollback.

**2. O `NOTIFY pgrst` não vem junto com o `COMMIT`.** É passo separado, e foi rodado nas três.
A regra acima já dizia por quê; aqui fica o registro de que foi feito, porque "esqueci o
NOTIFY" é indistinguível de "a coluna não existe" pela mensagem de erro que o usuário vê.

### PENDENTE POR PADRÃO

Formulação do dono do produto, registrada como está:

> Não é bug de código, é **ausência de gate**. Enquanto o repositório e o banco não estiverem
> ligados, **toda migração fica PENDENTE POR PADRÃO** — a verificação manual não é contorno
> temporário, é o **único mecanismo existente**.

O que isso quer dizer na prática, e é a razão de estar escrito aqui:

**Migração mergeada NÃO está aplicada.** Ninguém deve presumir o contrário — nem por o PR
estar verde, nem por ele estar em `main`, nem por o arquivo existir em `supabase/migrations/`,
nem por outra migração da mesma leva ter funcionado. O estado de qualquer migração é
**pendente** até que alguém consulte o schema e veja a coluna lá.

O default é pendente, não aplicado. Quem quiser afirmar o contrário precisa da consulta.

Foi exatamente essa presunção que quebrou produção em 01/09/2026: o PR #26 estava mergeado, o
build estava verde, e a coluna não existia. E a do PR #18 já estava pendente havia dias sem
ninguém notar, porque nada olhou.

#### Item de INFRAESTRUTURA — rodada futura, não agora

Ligar o repositório ao banco (um gate que compare os arquivos declarados com o schema real, ou
adotar de fato o caminho que a tabela `schema_migrations` pressupõe) é trabalho de
infraestrutura, com escopo e rodada próprios. Não faz parte de nenhuma correção de defeito e
não deve ser puxado no meio de uma.

Até lá, a regra desta página é o mecanismo — não um paliativo à espera dele.

### A ORDEM depende do que a migração CRIA

O default continua sendo **pendente** nos dois casos abaixo — merge não aplica nada. O que
muda é que **"aplicar depois" NÃO é sempre seguro**.

| a migração cria | ordem correta | o que quebra na ordem errada |
|---|---|---|
| **COLUNA ou TIPO** que o código novo GRAVA | aplicar **ANTES DO MERGE, e VERIFICADA por consulta** (Parte I). A redação de 01/09/2026 dizia *"antes ou junto"*; foi superada em 25/10/2026 | mergear antes deixa o código gravando em coluna inexistente |
| **FUNÇÃO** que o código novo CHAMA | aplicar **ANTES DO MERGE** | mergear antes deixa o botão chamando função inexistente |

**Caso real do primeiro:** `expense_snapshot`. O PR foi mergeado, a coluna não existia, e o
salvar de serviço quebrou em produção em 01/09/2026 — `Could not find the 'expense_snapshot'
column of 'services' in the schema cache`.

**Caso real do segundo:** `delete_sale_cascade`. Mergear sem aplicar deixaria o botão
"Excluir" na tela de Vendas chamando uma função que o banco não tem: o clique falha com
`function public.delete_sale_cascade does not exist`.

**É a mesma classe com a ordem invertida** — lá faltou aplicar DEPOIS do merge, aqui faltaria
aplicar ANTES. Para função, depois já é tarde.

> **APERTADO em 25/10/2026 — ver a Parte I.** O *"antes ou junto"* da coluna
> não tem instrumento: medido, seis PRs (#18, #26, #52, #72, #73, #74) foram mergeados de 13 minutos
> a 25 horas ANTES da aplicação, quatro deles com o aviso no corpo. A regra de lá: para o que o
> código novo lê ou chama, a migração é aplicada e VERIFICADA por consulta antes do merge, e o PR a
> nomeia no topo do corpo.

#### Função exige verificar TAMBÉM as dependências dela

**`plpgsql` NÃO valida referências na criação.** A função é criada COM SUCESSO mesmo que
chame algo que não existe, e falha só no PRIMEIRO USO. Consequência direta:

> Verificar que a função existe **NÃO BASTA**.

Consultar `pg_proc` e achar a função é uma verificação que **passa verde sem exercitar nada**
— a mesma família dos casos de `teste-que-nao-exercita.md`. Ela prova que o `CREATE` rodou,
não que a função funciona.

O protocolo, então, tem três consultas e não uma:

1. **ANTES**: as dependências existem, com a assinatura certa?
2. **ANTES**: a função nova ainda NÃO existe? (estado inicial correto — se já existir, o que
   se está aplicando é uma substituição, e isso muda o que a verificação depois significa)
3. **DEPOIS**: a função existe, com a assinatura esperada?

```sql
-- (1) dependências, pelo nome E pela assinatura
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('<dependência_1>', '<dependência_2>');
```

Caso real, na aplicação de `delete_sale_cascade`: conferidas antes
`_sale_has_paid_receivable(p_sale_id uuid)` e
`_reverse_stock_for_sale(p_sale_id uuid, p_tenant_id uuid)`, e confirmado que
`delete_sale_cascade` ainda não existia. **É parte do protocolo, não cuidado opcional.**

#### Ressalva de método: o `raw` NÃO fecha a cadeia byte a byte

Ler o arquivo em `raw.githubusercontent.com` protege contra a corrupção por tradução — foi o
que o #26 ensinou, e continua valendo. Mas há um limite que precisa estar dito por extenso:

**A leitura via `raw` NORMALIZA A INDENTAÇÃO.** A aplicação acaba sendo **token a token**, não
byte a byte, e por isso **o `md5` do arquivo NÃO é reproduzível por esse caminho**. Conferir o
`md5` depois de aplicar assim vai divergir, e a divergência não significa corrupção.

> **ESTA RESSALVA É TAMBÉM UMA QUESTÃO DE AUTORIZAÇÃO, não só de medição — ver
> a Parte III.** Ela foi escrita aqui como limite do que o
> `md5` prova *depois* de aplicar. O que ela não dizia é o efeito *antes*: se o conteúdo
> executado não é o arquivo inteiro, o hash que o dono do produto autorizou **não cobre o
> que vai rodar**. Em 16/10/2026 isso deixou de ser teoria — a tela de aprovação mostrou um
> número que ninguém tinha explicado, e por trás dele havia 210 linhas removidas onde duas
> foram prescritas. A regra nova exige os DOIS hashes, a transformação nomeada entre eles e
> a prova por diff e por bytes, antes de a tela aparecer. Esta página guardou o conhecimento
> certo no lugar onde ele não é lido no momento de autorizar; o ponteiro é o que o alcança.

O que o `md5` prova e o que não prova:

| | |
|---|---|
| **prova** | que o CONTEÚDO revisado é o mesmo que está versionado — revisão ANTES de aplicar |
| **NÃO prova** | que o que chegou ao banco é byte a byte aquele arquivo |

Sem o `md5`, a integridade da aplicação se confirma por **dois sinais indiretos**:

1. **ausência de sinais de corrupção** — nenhuma palavra-chave SQL traduzida, acentos do
   português preservados;
2. **verificação estrutural no catálogo** — `pg_proc` / `pg_enum` / `information_schema`
   mostrando o objeto com a forma esperada.

**Para fechar a cadeia byte a byte, o caminho é a própria sessão aplicar via CLI**, com o
arquivo do disco. Enquanto a aplicação for manual por cópia, os dois sinais acima são o que
existe — e é melhor dizer isso do que chamar de "verificado byte a byte" o que não é.

#### Onde a ordem tem de estar escrita

Formulação do dono do produto, registrada como está:

> Corpo de PR protege ESTE merge; a regra versionada protege os FUTUROS.

Escrever a ordem no corpo do PR é necessário — é lá que quem mergeia lê, e por isso ela vai no
corpo, com destaque, em todo PR com migração. Mas não é suficiente: corpo de PR mergeado fica
soterrado, que é o diagnóstico já registrado em `registro-de-classe.md`. A diferença é que ali
o que se perdia era CONHECIMENTO, e aqui é **instrução de OPERAÇÃO** — o custo de perdê-la não
é repetir uma análise, é derrubar produção.

Por isso os dois: **corpo do PR** para o merge de agora, **esta página** para os próximos.

### Como verificar

Depois de aplicar, consultar o schema — não confiar no retorno do comando de aplicação:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = '<tabela>'
  and column_name  = '<coluna>';
```

Zero linhas = não está aplicada, independentemente do que o merge diga.

#### E recarregar o schema cache

```sql
NOTIFY pgrst, 'reload schema';
```

A mensagem de erro que quebrou produção vem do **PostgREST**, não do Postgres: a coluna pode
já existir na tabela e o PostgREST continuar servindo o cache antigo. Verificar `information_
schema` prova o Postgres; o `NOTIFY` cobre a camada que de fato produziu o erro.

### Cuidado ao ler SQL para revisão

Página traduzida automaticamente pelo navegador corrompe SQL de forma convincente: nesta
mesma ocorrência, um revisor leu `ADICIONAR` no lugar de `ADD` e `despesa_snapshot` no lugar
de `expense_snapshot`, e o `COMMENT ON COLUMN` passou a parecer citar uma coluna que a linha
anterior não criava — três sintomas coerentes entre si, todos falsos.

Para revisar SQL com segurança: abrir em **raw** (`/raw/` no GitHub), ou transportar o
conteúdo em **base64**, que não é traduzido, junto com o `md5sum` do arquivo. Texto puro serve
para leitura humana, nunca como fonte de verdade na conferência.

### Relação com as outras regras

`baseline-measurement.md` cobre como medir o efeito de um PR **no código**. Esta cobre o
efeito **no banco**. As duas falham do mesmo jeito quando se confia num sinal indireto: lá,
uma contagem de erros medida na árvore errada; aqui, um build verde que nunca olhou o schema.

## Parte III — Transformação no Meio Quebra a Cadeia de Hash

> **Esta regra é independente da migração que a originou.** Nasceu em 16/10/2026, na aplicação
> das políticas de visibilidade, porque foi ali que a tela de aprovação mostrou um número que
> ninguém tinha explicado — mas **não depende daquela migração**. Vale para todo conteúdo que
> é autorizado por hash e transformado antes de ser executado: SQL, script, payload de API,
> arquivo de configuração. Reverter aquelas políticas não deve levar esta página junto.

### O critério

Formulação do dono do produto, registrada como está:

> Um hash autoriza **UM CONTEÚDO**, não um nome de arquivo. Quando o que vai ser aplicado não
> é o conteúdo autorizado — porque alguém prescreveu uma transformação, mesmo trivial —, a
> autorização deixa de cobrir o que será executado, e o aprovador é posto a decidir sobre um
> número que ninguém lhe explicou.

E a atribuição, que é a parte que impede o remédio errado:

> **O FURO É DE QUEM PRESCREVE.** Eu escrevi "remova o `BEGIN`/`COMMIT`" sem dizer o que isso
> faz com o hash, e o protocolo não tinha onde acusar que a remoção foi de 210 linhas.

### Por que a distinção é difícil de ver

Porque a transformação **é correta e necessária**. Remover `BEGIN`/`COMMIT` ao aplicar por um
conector que abre transação própria não é descuido: é o certo, e está escrito no próprio
arquivo. O que falha não é o gesto — é que **ninguém disse o que o gesto faz com o número**.

E a assimetria de atenção favorece o erro. Quem autoriza olha o hash **do que revisou**. Quem
aplica calcula o hash **do que envia**. Os dois são diligentes, os dois conferem um número, e
os dois conferem números diferentes — sem que nada no protocolo os obrigue a notar.

O sintoma também não aparece na hora. Uma transformação que remove comentários produz um
payload que **executa exatamente igual**. Não há erro, não há aviso, e o diff que alguém
faria depois mostra o banco certo. O que se perdeu é a prova de que o que rodou é o que foi
lido — e isso só importa no dia em que não for.

### As aparições

| # | Onde | A transformação | O que ela faz com a cadeia |
|---|---|---|---|
| 1 | a Parte II, ressalva de método da aplicação manual | ler o SQL por `raw.githubusercontent.com` **NORMALIZA A INDENTAÇÃO** | o `md5` do arquivo **deixa de ser reproduzível** pelo caminho da aplicação. Está escrito lá que "conferir o `md5` depois de aplicar assim vai divergir, e a divergência não significa corrupção" |
| 2 | 16/10/2026, aplicação de `20261016000002_politicas_de_visibilidade.sql` | "remova o `BEGIN`/`COMMIT`", prescrito para o conector | a tela de aprovação mostrou `e04c8ddf…` onde a autorização dizia `26de1d1a…`. O dono do produto **negou**, e estava certo |

#### A aparição 1 já estava escrita, e não virou regra

> **Ponteiro de volta:** o trecho está em a Parte II, seção *"Ressalva de método:
> o `raw` NÃO fecha a cadeia byte a byte"*, e desde 16/10/2026 ele aponta para cá. Os dois
> sentidos existem de propósito: quem chega pelo protocolo de aplicação encontra a questão de
> autorização, e quem chega pela autorização encontra o protocolo.

É o diagnóstico de `registro-de-classe.md` acontecendo de novo: o conhecimento existia, estava
correto, e estava **no lugar em que não se lê no momento em que importa**. a Parte II
registrou que a transformação quebra a reprodutibilidade do `md5` — e tratou isso como uma
RESSALVA DE MEDIÇÃO ("o que o `md5` prova e o que não prova"), não como uma questão de
**autorização**. A diferença é a que esta página existe para fixar: lá o hash divergente era um
inconveniente de conferência; aqui ele é a única coisa entre o aprovador e um conteúdo que ele
não aprovou.

#### O caso da aparição 2, com os números

O que foi autorizado, o que foi para a tela, e o que havia entre os dois:

| | |
|---|---:|
| arquivo autorizado, `md5` | `26de1d1af7780d4310c5d13ff7fa248c` |
| linhas do arquivo | **295** |
| payload que foi para a tela, `md5` | `e04c8ddf9873fb8d8cdaa0af7f6723cb` |
| linhas do payload | **85** |
| **linhas removidas** | **210** |
| **linhas que a transformação prescrevia remover** | **2** |

A prescrição era remover duas linhas. O que o assistente removeu foram **210**: ele cortou o
texto *entre* `BEGIN;` e `COMMIT;` e descartou o cabeçalho inteiro e a seção VERIFICAÇÃO
inteira. **As 210 eram todas comentário, e nenhuma executava — isso é SORTE, NÃO MÉTODO.** Com
uma única linha executável fora daquele intervalo, a aplicação teria sido parcial e ninguém
teria como saber pelo número.

Reconhecimento do dono do produto, registrado como está:

> O que me interessa é que o número foi a **ÚNICA** coisa que denunciou — se ele batesse,
> 210 linhas teriam ido embora sem ninguém ver.

A hipótese dele ao negar — *"quase certamente é o arquivo menos o `BEGIN`/`COMMIT`"* — estava
**errada para o lado seguro**: a transformação era mais larga do que ele supôs, e a recusa
pegou isso sem que nenhuma das duas partes soubesse na hora.

#### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, sobre os pontos do repositório em que conteúdo é
conferido por hash. **Duas aparições, e nenhuma terceira foi forçada.**

O que a busca **examinou e rejeitou**: o `md5` **inventado** que o assistente escreveu numa
mensagem de commit em 16/10/2026, corrigido por `amend` antes de sair do container. O dono do
produto o nomeou como classe — *"um hash fabricado TEM A FORMA DE UM FATO MEDIDO, e é o que
alguém cita depois sem reconferir"* —, e ele é **vizinho, não o mesmo**: lá o número não
corresponde a conteúdo nenhum; aqui ele corresponde exatamente a um conteúdo, só que **não ao
que foi autorizado**. Fabricação e transposição falham por mecanismos diferentes e se acham de
jeitos diferentes. Fica registrado aqui para quem procurar a terceira saber que esta foi
olhada.

### O remédio

**Quando o conteúdo enviado não for o arquivo inteiro, o relatório publica OS DOIS HASHES
DESDE O COMEÇO** — o do arquivo e o do payload —, **com a transformação NOMEADA entre eles**, e
a prova **POR DIFF E POR CONTAGEM DE BYTES**, antes de a tela de aprovação aparecer.

A forma, e as partes são obrigatórias:

```
arquivo       <caminho>                                md5 <hash-do-arquivo>
transformação <descrição literal do que foi removido/alterado, em uma frase>
payload       <o que de fato vai ser enviado>          md5 <hash-do-payload>

prova 1 — diff cru arquivo -> payload, sem resumo (ou a classificação de cada linha removida)
prova 2 — contagem de bytes, com a aritmética fechando
prova 3 — IGUALDADE DE ÁRVORE SINTÁTICA do executável, nó por nó
```

**A prova por bytes não é redundante com o diff, e é ela que fecha.** O diff por linha mostra
como iguais duas linhas que diferem num espaço à direita, e não mostra quebra de linha final.
A aritmética dos bytes mostra. No caso da aparição 2:

```
arquivo 19.027 − payload 19.012 = 15
len("BEGIN;") + len("COMMIT;") + 2 quebras = 6 + 7 + 2 = 15
```

Fechando a conta, **não há terceira diferença a procurar**. Não fechando, há — e o número diz
de quantos bytes ela é antes de alguém saber onde.

#### A terceira prova: a árvore sintática

Formulação do dono do produto, registrada como está:

> **Diff e bytes provam que o TEXTO mudou pouco; a árvore prova que o QUE EXECUTA não mudou
> nada.** Quando a transformação mexer em mais que comentário, a árvore é a única das três que
> afirma o que importa.

O parser do PostgreSQL descarta comentário e espaço ao montar a árvore. Comparar a árvore do
executável do arquivo com a do payload — sem as posições de texto, que mudam por construção —
responde à pergunta que diff e bytes não alcançam: **o SQL que roda é o mesmo?** Duas árvores
iguais nó por nó significam que nenhum statement, nenhum predicado e nenhum literal mudou, por
mais que o texto em volta tenha encolhido.

Nas duas primeiras provas a transformação é descrita; na terceira ela é **irrelevante**: o que
se compara já é o que vai executar. Por isso ela é a única que continua valendo quando a
transformação mexe em mais que comentário — uma reindentação, uma troca de aspas, um
`IF EXISTS` acrescentado (este último ela **acusa**, e é para isso que serve).

**E ela foi o que tornou SEGURA a aplicação da aparição 2.** O payload que coube na tela de
aprovação foi o executável sem comentário nenhum — 652 bytes, 18 linhas, de um arquivo de 295
linhas. Classificação e bytes mostravam o que saiu; a árvore mostrou que o que fica executa
igual: 4 statements, 10 + 10 + 10 + 103 nós, idênticos.

#### Por que o payload enxuto, e não o arquivo inteiro — a razão é de segurança

A tela de aprovação do conector **só habilita o botão depois de o humano rolar o conteúdo
inteiro**. Com 19 KB de comentário, o botão não acendia dentro dos 60 segundos do conector, e
cada tentativa morreu por timeout. Do outro lado, o assistente diagnosticou errado três vezes
(lock, tamanho, palavra-chave) antes de chegar à tela.

O que isso ensina é de segurança, não de conveniência: **um payload que o humano não consegue
rolar é um payload que ele aprova sem ver, ou não aprova.** O enxuto não é atalho — é o que
torna a aprovação um ato de leitura. E é a prova 3 que o torna autorizável sem perda.

### Quando o statement GUARDA O PRÓPRIO TEXTO, a transformação é sobre o ARTEFATO

Formulação do dono do produto, registrada como está, e a autoria é dele:

> Para `DROP POLICY` ou `CREATE TABLE`, enxugar comentário é **COSMÉTICO** — o catálogo não
> guarda o texto. Para `CREATE FUNCTION`, **O CORPO É O ARTEFATO**: o que eu cortei virou o
> conteúdo permanente de `prosrc`. Eu tratei os dois casos como iguais, e não são.

Tudo o que esta página dizia até aqui trata a transformação como questão de **transporte**:
o texto muda no caminho, o que executa não, e a árvore prova isso. Isso vale enquanto o banco
guarda a ÁRVORE do statement e joga o texto fora. Quando o banco guarda o TEXTO, o que o
transporte cortou passa a ser o objeto que fica — e a pergunta deixa de ser "o que rodou é o
que foi revisado?" e passa a ser "**o que ficou é o que foi revisado?**".

#### O caso, 17/10/2026 — a `20261016000001`

O PO aplicou pelo SQL Editor uma versão enxuta, com os comentários de dentro de `$function$`
reescritos e encurtados, e o COMMENT ON FUNCTION sem o acento de "Resíduo". A árvore do texto
recebido pelo servidor, tirada do `postgres_logs`, contra a do arquivo:

| | resultado |
|---|---|
| 15 dos 17 statements | idênticos, fora posições |
| `COMMENT ON FUNCTION` | **diferente** — "Resíduo" virou "Residuo", posição 484 de 586 |
| `CREATE FUNCTION`, fora do corpo | idêntico — assinatura, seis parâmetros, `SECURITY DEFINER`, `search_path` |
| `CREATE FUNCTION`, o corpo | **diferente** — 12.353 caracteres no arquivo, **8.474** no `prosrc` |
| **árvore PL/pgSQL do corpo** | **idêntica — 2.252 nós**, cada query interna comparada pela sua árvore SQL |
| linhas de código do corpo, sem comentário nem branco | **188 e 188, iguais** |

Dos 8.474 caracteres do `prosrc`, **230 são `\r`** que o Editor transportou como CRLF. Isso
também é artefato: nem o arquivo inteiro, colado pelo Editor, deixaria o `prosrc` igual ao
arquivo byte a byte.

O que ficou no catálogo foi aceito pelo dono do produto, registrado no cabeçalho da migração
com os hashes dos textos, e **não foi reaplicado**: a lógica é a mesma, e quem comparar o texto
da função no banco com o arquivo vai ver uma diferença que é de comentário.

#### A prova muda de instrumento

**A árvore do statement vê o corpo como LITERAL OPACO.** Para o parser SQL, tudo entre
`$function$` e `$function$` é uma string. Ela acusa que a string mudou — e acusou —, mas acusa
igual quando muda um comentário e quando muda um `<=` para `<`. Ela não distingue os dois.

Nesses casos a prova é a **ÁRVORE PL/pgSQL do corpo** (`pglast.parser.parse_plpgsql_json`),
com as posições (`lineno`, `location`) excluídas e **cada `query` interna trocada pela sua
árvore SQL** — porque o PL/pgSQL guarda o texto das expressões embutidas, e um comentário no
meio de um `jsonb_build_object(...)` muda esse texto sem mudar nada que execute. Foi
exatamente o que aconteceu: uma única query interna diferia em texto, e era o `RETURN`, que
perdeu três linhas de comentário.

#### Quais statements guardam o texto — MEDIDO, não suposto

A primeira formulação incluía view e expressão de política. Medido em 17/10/2026 num
PostgreSQL 16 local, um objeto de cada com um comentário dentro:

| objeto | o catálogo guarda o comentário? |
|---|---|
| corpo `LANGUAGE plpgsql` (`prosrc`) | **SIM** |
| corpo `LANGUAGE sql` entre `$$` (`prosrc`) | **SIM** |
| função SQL com `BEGIN ATOMIC` | não — é guardada como árvore |
| `CREATE VIEW` (`pg_get_viewdef`) | não — `pg_rewrite` guarda a árvore |
| expressão de `CREATE POLICY` (`polqual`) | não — guarda a árvore |
| `COMMENT ON ...` | **SIM** — é o próprio texto, e a árvore do statement já o compara |

Para view e política, então, a regra antiga basta: a árvore do statement É o que o catálogo
guarda. O cuidado novo vale para **corpos de função entre `$$`** e para **literais de texto
guardados como texto**. Nos literais, a árvore do statement já é suficiente, porque o literal é
a folha e a comparação o vê inteiro — foi o que pegou o acento.

#### O corolário, para quem prescreve e para quem aplica

1. **Antes de enxugar, pergunte se o catálogo guarda aquele texto.** Se guarda, o enxugado vira
   o artefato. Enxugar comentário de `CREATE TABLE` é transporte; enxugar comentário de
   `$function$` é editar a função.
2. **Para corpo de função, a prova é a árvore PL/pgSQL, não a do statement.** A do statement
   acusa e não classifica.
3. **Acento, cedilha e qualquer caractere em literal guardado contam.** Quem transcreve para
   reduzir superfície tende a normalizar para ASCII. Num `COMMENT`, isso fica gravado.
4. **Se o enxugado ficar, o arquivo precisa dizer.** Sem isso, a próxima pessoa compara o
   `prosrc` com o arquivo, vê a diferença e a lê como defeito — é `estado-relatado-vs-real.md`
   esperando acontecer, com o arquivo no papel de relato.

### O corolário

**A autorização do dono do produto nomeia o hash do PAYLOAD**, que é o que a tela mostra e o
que vai executar. **O hash do ARQUIVO continua valendo para o que foi revisado** — são dois
fatos distintos sobre dois objetos distintos, e a cadeia entre eles é a transformação nomeada.

Um hash só, numa cadeia com transformação no meio, **não prova o que parece provar**.

### O corolário aplicável ANTES do defeito existir

**Antes de prescrever uma transformação sobre conteúdo autorizado, diga o que ela faz com o
hash.** E, do lado de quem aplica: **antes de abrir a tela de aprovação, publique os dois
números.**

Sinais de que a cadeia está prestes a quebrar, em ordem de força:

1. A instrução contém um verbo de transformação — "remova", "troque", "ajuste", "cole sem",
   "adapte" — sobre um conteúdo que foi autorizado por hash.
2. A transformação parece **trivial demais para merecer menção**. Quanto mais trivial, menos
   provável que alguém calcule o hash do resultado.
3. O caminho de aplicação **não aceita o arquivo**, só texto colado — conector, editor web,
   campo de formulário.
4. O relatório publicou **um** hash.

Quando o 2 e o 4 coincidem, a tela de aprovação vai mostrar um número que ninguém explicou, e
o aprovador terá de escolher entre negar sem saber por quê e aprovar sem saber o quê.

### As ressalvas de método — o que esta página NÃO diz

- **Não diz que a transformação é errada.** Remover `BEGIN`/`COMMIT` para o conector é o
  certo, e está prescrito no próprio arquivo de migração. O que falta é dizer o efeito.
- **Não proíbe transformação.** Ela exige que seja nomeada e provada. A recusa de um payload
  enxuto "pela regra" foi feita e RETIRADA na mesma rodada pelo dono do produto: a regra
  nunca disse isso, e a razão prática apontava para o lado oposto.
- **Não diz que comentário é inofensivo.** Nesta aparição as 210 linhas perdidas eram todas
  comentário, e foi acaso: o recorte foi por delimitador de transação, não por natureza do
  conteúdo. O mesmo recorte sobre um arquivo com DDL fora do `BEGIN`/`COMMIT` teria aplicado
  metade.
- **Não propõe automatizar.** Publicar dois hashes e um diff é trabalho de um comando; um
  portão que os compare precisaria conhecer a transformação de cada caso, e não há caso
  suficiente para desenhá-lo. Duas aparições é critério para a regra, não para a ferramenta.
- **Não mede quantas aplicações passaram com hash único.** Esta é a primeira em que alguém
  olhou. O que a página afirma é que a divergência foi o único sinal, não que ela seja rara.

### Relação com as outras regras

a Parte II guarda a aparição 1 e o protocolo de aplicação em que esta regra se
encaixa — é lá que está o `md5sum` antes de revisar, e é de lá que vem a ressalva de que o
caminho `raw` normaliza. `registro-de-classe.md` decidiu a forma desta página e é o
diagnóstico de por que a aparição 1 não bastou: conhecimento certo, no lugar em que não se lê.
`estado-relatado-vs-real.md` é a vizinha mais próxima no método — lá a premissa é um estado
externo não consultado, aqui é a identidade entre dois conteúdos não provada. E
`ausente-vs-falso.md` explica por que um hash só é pior que nenhum neste caso: ele **afirma**
uma correspondência que não foi estabelecida, em vez de calar sobre ela.
