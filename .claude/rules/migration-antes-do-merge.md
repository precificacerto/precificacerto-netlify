# A Migração Antes do Merge

> **Esta regra é independente da rodada que a originou.** Foi pedida em 25/10/2026, depois do #158,
> mas **não depende dele**: vale para todo PR cujo código pressupõe coluna, tabela, função, tipo ou
> política que ainda não existe no banco de produção.

## O critério

Formulação do dono do produto, registrada como está:

> Há uma classe recorrente aqui: PR de aplicação margeado antes da migration que ele pressupõe,
> quebrando produção. Quando um PR depende de coluna/tabela/função nova, a migration é aplicada e
> **VERIFICADA em produção primeiro**, e só então o PR é margeado; **o PR deve nomear no corpo qual
> migration ele pressupõe.**

São três obrigações, e cada uma fecha um buraco diferente:

| obrigação | o que ela impede |
|---|---|
| **aplicar ANTES do merge** | a janela em que o código novo já está em produção e o banco ainda não tem o que ele lê |
| **VERIFICAR por consulta ao banco, antes do merge** | tomar o retorno do comando de aplicação por prova — e, quando a aplicação vai por payload transformado, tomar o arquivo por prova (`transformacao-quebra-a-cadeia-de-hash.md`) |
| **o PR NOMEIA a migração** — caminho, md5 e o que quebra sem ela | que quem mergeia descubra a dependência lendo o diff, ou não descubra |

## Por que a distinção é difícil de ver

Porque **nenhum instrumento do repositório enxerga o banco**. `test:ci`, `tsc`, `build` e lint leem
código; o mock do supabase devolve o que o teste pôs nele, com ou sem a coluna existir em produção.
O PR fica verde com a migração pendente — e ficou, nas sete aparições abaixo. É
`portao-que-nao-alcanca.md` no eixo do tempo: o portão não tem como ficar vermelho no caso que a
regra quer barrar.

E os dois atos parecem um só. O PR traz o `.sql` e o código no mesmo diff, e a leitura natural é que
mergear o PR entrega os dois. Não entrega: o merge publica o código, e o `.sql` continua sendo
intenção até alguém aplicá-lo (`migration-delivery.md`: *merge não é entrega*). Os dois atos têm
donos e horários diferentes, e nada no fluxo os sincroniza.

O defeito também não tem sintoma no merge. Ele aparece no primeiro uso do caminho que lê o que falta
— e, se o caminho é pouco usado, pode não aparecer na janela inteira, que é o que torna a inversão
fácil de repetir: a maioria delas **não deixou erro que alguém visse**.

## As aparições — MEDIDAS em 25/10/2026

**Método.** `supabase_migrations.schema_migrations.version` é o instante da aplicação em UTC quando
a migração foi aplicada pelo conector ou pelo CLI — conferido: a `version` `20261024132054` da
`20261024000001` bate com o `postgres_logs` de `2026-10-24T13:20:54.255Z`. O horário do merge vem do
GitHub (`merged_at`). Quais migrações cada PR trazia vem da lista de arquivos do próprio PR. Versões
iguais ao prefixo do arquivo (as de `20261019000001` a `20261023000001`) **não são horário**, e por
isso não entram.

| # | PR | a migração | merge (UTC) | aplicação (UTC) | ordem | efeito medido |
|---|---|---|---|---|---|---|
| 1 | #18 | `add_commission_profit_amount_to_orders` | 31/08 20:22:09 | 01/09 22:01:48 | **25 h 39 min DEPOIS** | ficou armada; achada na auditoria de 01/09 (`migration-delivery.md`) |
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

### De quem são

As migrações das seis inversões foram escritas pelo assistente, e os merges e as aplicações são do
dono do produto. Está escrito assim porque a regra tem duas metades e cada lado tem a sua: quem
escreve o PR é quem sabe o que o código pressupõe, e só ele pode nomeá-lo; quem mergeia e aplica é
quem controla a ordem. Até o #29 versionar `migration-delivery.md`, em 01/09, nenhuma das duas
metades estava escrita — e as #3 a #6 vieram **depois** dela, com o aviso no corpo do PR, o que
mostra que estar escrita não bastou: a ordem para COLUNA dizia *"antes ou junto"*, *junto* não tem
instrumento, e nenhuma das duas páginas exigia a consulta ao banco **antes** do merge.

### Nota da busca por precedentes

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

## O corolário aplicável ANTES do defeito existir

**Antes de abrir um PR, pergunte o que o código novo lê ou chama que o banco de produção ainda não
tem — e consulte o banco para saber, em vez de deduzir pela pasta de migrações.**

Quando houver alguma coisa, o corpo do PR **começa** por ela, nesta forma:

```
## ⚠️ Aplicar a migração ANTES do merge
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

### A defesa que não depende da ordem

Quando o código **pode** funcionar sem a estrutura nova, ele deve recusar com frase nomeada em vez de
quebrar — foi o desenho do levantamento enquanto `orcamentista_motor_tipologia_detalhe` não existia
(`faltou-dado-recusa-nomeada.md`). Isso **não substitui** a ordem: reduz o estrago de uma inversão
de *quebra* para *recusa*. Onde o código não tem o que recusar — um select que precisa da coluna para
ler a linha inteira, como o do #158 —, só a ordem protege.

## As ressalvas de método — o que a medição NÃO diz

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

## Relação com as outras regras

`migration-delivery.md` é a mãe desta: lá está *merge não é entrega*, o protocolo de aplicação e a
tabela "a ordem depende do que a migração cria". Esta página **aperta** aquela tabela — para coluna,
tabela, função ou política que o código novo usa, a ordem é ANTES e VERIFICADA, nunca *junto* — e
acrescenta a obrigação de o PR nomear a dependência. `estado-relatado-vs-real.md` é a razão de a
verificação ser por consulta, e não pelo relato de quem aplicou. `transformacao-quebra-a-cadeia-de-hash.md`
cobre o payload enxuto da #158. `portao-que-nao-alcanca.md` explica por que o PR verde não diz nada
sobre o banco. `faltou-dado-recusa-nomeada.md` é a defesa que reduz o estrago quando a ordem falha.
`registro-de-classe.md` decidiu a forma desta página.
