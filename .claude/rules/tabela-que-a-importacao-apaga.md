---
paths:
  - "src/lib/atendimentos-ia/**"
  - "src/pages/api/atendimentos-ia/**"
  - "src/pages/orcamentos/**"
  - "supabase/migrations/**"
---

# A Tabela Que a Importação Apaga

> **Esta regra é independente da rodada que a originou.** Nasceu em 24/10/2026, na importação das
> tabelas do fornecedor, porque foi ali que 164 tempos de fabricação quase se perderam. **Não
> depende da importação**: vale para todo processo que apaga e regrava uma tabela, em qualquer
> tela, rota ou função do banco. O nome é o da aparição que a originou; o alcance é maior que ele.

## O critério

Formulação do dono do produto, registrada como está:

> Uma tabela que algum processo **APAGA E REGRAVA** só pode ter colunas que esse processo saiba
> reescrever. A importação é a aparição de hoje; **o defeito mora em todo apagar-e-regravar.**

"Saber reescrever" tem duas metades, e as duas aparições abaixo falham uma cada:

| a metade | o que exige | quando falha |
|---|---|---|
| **a coluna está na regravação** | o INSERT a preenche | a coluna volta com o default — NULL, zero, `now()` |
| **o valor regravado é o que estava** | o processo reproduz o valor, não o recalcula | a coluna volta preenchida, com OUTRO número |

A segunda é a pior das duas: a linha regravada parece íntegra, e nenhum NULL denuncia a troca.

## Por que a distinção é difícil de ver

Porque apagar-e-regravar é **correto no dia em que é escrito**. Quem escreve o processo conhece
todas as colunas da tabela, e o INSERT cobre todas. O defeito nasce depois, num PR que acrescenta
uma coluna à tabela **por outro motivo** e não sabe que existe alguém que a apaga inteira. A
migração do tempo de fabricação (`20261024000001`) não tocou na importação, e não tinha por quê.

E o gesto que produz o defeito é invisível no lugar em que ele acontece. O DELETE não nomeia
colunas: `DELETE FROM t WHERE tabela_id = …` apaga a coluna nova tão bem quanto as antigas, e lê
igual antes e depois de ela existir. Quem relê o processo não vê o que ele passou a apagar.

O sintoma também não aparece na hora. O processo roda, a contagem de linhas bate — a importação
até **confere** a contagem gravada contra a enviada — e o dado perdido só faz falta quando alguém o
procura. Conferir LINHAS não alcança COLUNAS (`portao-que-nao-alcanca.md`).

## As aparições

| # | Quando | O processo | O que ele não sabia reescrever | Estado |
|---|---|---|---|---|
| 1 | 24/10/2026 | `importar_conteudo_da_tabela` (`20261020000002`) apaga e regrava `orcamentista_motor_tipologia` | `tempo_fabricacao_min` e `tempo_origem`, acrescentadas pela `20261024000001` — a regravação não as preenche. Importar a tabela da Wolff apagaria **164 tempos ESTIMADO**, mesmo com o arquivo idêntico | **RESOLVIDO** em 25/10/2026: o tempo mora em `orcamentista_motor_tipologia_tempo` (20261024000003), que a importação não alcança; o leitor (`tempoDeFabricacao`) lê a tabela nova e a trava do #147 saiu. Prova: harness `tempo-em-tabela-propria`, caso 8 (164 tempos, reimportação completa, os 164 ficam). As colunas antigas saem numa migração posterior |
| 2 | 02/09/2026, #34 | a edição do orçamento apaga e regrava `budget_items` (`orcamentos/index.tsx:1867`) | `commission_pct` e `profit_pct` — a regravação os PREENCHE, com o que a reabertura leu do **cadastro vivo** (`it.products?.commission_percent`, `orcamentos/index.tsx:1992`). É a segunda metade do critério: reabrir e salvar um orçamento antigo troca os percentuais congelados pelos de hoje | **ABERTO** — registrado no #34 como "armado, não materializado"; **re-medido em 24/10/2026: a leitura do cadastro vivo continua lá** |

**De quem são.** A 1 é do desenho: a importação foi escrita certa em 20/10, e a coluna chegou em
24/10 por outra porta. Quem viu foi o dono do produto, ao pedir a medição antes de importar o
arquivo novo. A 2 foi registrada pelo assistente no #34 como defeito próprio e ficou na fila.

A aparição 2 é também de `fato-vs-referencia.md`: o percentual congelado é relido do cadastro. As
duas classes se cruzam ali, e a distinção é o eixo: aquela pergunta **de onde** o valor é lido,
esta pergunta **se o processo que apaga sabe pôr de volta** o que apagou.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, em 24/10/2026. **Duas aparições, e nenhuma terceira foi
forçada.**

O método: procurar em `src/` todo arquivo com `.delete()` e `.insert(`/`.upsert(` sobre a MESMA
tabela, e nas migrações toda função com `DELETE FROM` e `INSERT INTO` na mesma tabela. **Achou 16
arquivos de código e 8 funções do banco.** Foram examinados a fundo dois processos — a importação
(uma das 8 funções) e a edição do orçamento (um dos 16 arquivos). **Os outros NÃO foram
auditados**:

- no código: entre outros, `order_items`, `sale_items`, `user_module_permissions`,
  `employee_working_hours` e `product_items`;
- no banco: `update_user_permissions` e as seis funções `superadmin_gravar_*` da base de
  conhecimento (`padrao_ambiente`, `vendedor_perfil`, `mp_fornecedores`, `mp_vidros`,
  `mp_ferragens`, `mp_instalacao`).

Ficam aqui para que a próxima pessoa saiba que a busca os achou e não os olhou. A primeira versão
desta nota dizia "uma função do banco": era a contagem de quem só tinha varrido o código TS, e foi
corrigida antes do commit.

Examinado em `budget_items` e **NÃO contado**, com a medição que o tirou:

| coluna que a regravação não preenche | por que não entra |
|---|---|
| `id` | nenhuma chave estrangeira aponta para `budget_items.id` (consulta a `pg_constraint`): trocar o id não quebra referência |
| `created_at` | volta como `now()`. Perde-se o instante em que o item entrou no orçamento — nenhum leitor dele foi encontrado |
| `commission_percent`, `profit_percent` | colunas antigas, `DEFAULT 0`: **0 em 273 de 273 linhas**. A regravação as zera, e elas já eram zero |

Nenhuma das três tem dano medido hoje. As três são o mecanismo armado: no dia em que alguém ler
`created_at` do item, a edição do orçamento o terá reescrito.

## O remédio — três camadas, da mais barata à definitiva

**1. A trava antes do DELETE.** Enquanto o processo não souber reescrever uma coluna, ele recusa
quando ela tem dado — e recusa ANTES de apagar, dizendo quanto se perderia. É o #147: a importação
conta os tempos gravados e responde 409 antes de baixar os arquivos (removida em 25/10/2026, quando a camada estrutural chegou). A trava é barata e fecha o
risco no dia, mas não o remove: ela troca "perde em silêncio" por "não deixa fazer".

**2. O portão que liga as colunas da tabela às do processo.** Um teste lista as colunas da tabela e
afirma que cada uma está em um de dois conjuntos declarados no código: as que o processo **escreve
a partir do que leu**, e as que o processo **gera** (`id`, `created_at`, com a razão escrita ao
lado). Coluna nova na tabela sem lugar num dos dois fica **vermelha no build**, em vez de chegar
apagada em produção. É o remédio de `copia-divergente.md` (teste ligando o contrato à lista) e de
`construtor-empobrecido.md` (fazer o compilador enumerar), aplicado a quem apaga.

> **A ressalva que decide de onde vem a lista.** As migrações deste repositório NÃO são a fonte de
> verdade do schema (`migracao.md` (Parte II): 4 versões em comum de 146). O portão compara contra
> uma lista declarada no código, e essa lista é conferida contra o `information_schema` de
> produção quando a migração que acrescenta a coluna é aplicada. Ler a pasta `supabase/migrations/`
> daria uma lista plausível e errada.

**3. A coluna que o processo não sabe reescrever sai da tabela.** Se a coluna é de outro dono — o
tempo de fabricação é do dono do produto, não do arquivo do fornecedor —, ela vai para uma tabela
que aquele processo não apaga. É a única das três que remove o defeito em vez de vigiá-lo.

E a alternativa que dispensa as três, quando cabe: **não apagar.** Um UPSERT pela chave natural
atualiza só as colunas que o processo conhece e deixa as outras como estavam. Não cabe quando o
processo precisa remover as linhas que sumiram da origem — e aí a camada 3 é a resposta.

## O corolário aplicável ANTES do defeito existir

**Antes de acrescentar uma coluna a uma tabela, procure quem a apaga inteira.** E, do outro lado:
**antes de escrever um DELETE seguido de INSERT na mesma tabela, liste as colunas dela e marque, ao
lado de cada uma, de onde o INSERT tira o valor.** Coluna sem origem é coluna que este processo
apaga.

Sinais, em ordem de força:

1. Um `DELETE … WHERE <pai> = …` seguido de `INSERT` na mesma tabela — "apaga os itens e grava de
   novo" é o desenho mais comum de salvar uma lista.
2. A tabela recebeu coluna **depois** de o processo ser escrito, por um PR que não tocou nele.
3. A coluna guarda dado de **outro dono** — digitado à mão, congelado de outro momento, estimado
   por alguém — que a fonte do processo não traz.
4. O processo confere **linhas** (contagem gravada contra enviada), e nada confere **colunas**.

Quando o 1 e o 2 coincidem, a coluna nova já está sendo apagada.

## As ressalvas de método — o que esta página NÃO diz

- **Não diz que apagar-e-regravar é errado.** É o desenho certo para substituir um conjunto inteiro
  vindo de uma fonte que o descreve inteiro — a tabela do fornecedor é isso. O defeito é a coluna
  que a fonte não descreve.
- **Não mede quantas tabelas estão expostas.** Duas aparições examinadas, 22 processos achados e
  não auditados. Não é taxa.
- **Não diz que a aparição 2 já causou dano.** O #34 a registrou como armada; a re-medição de hoje
  confirma o código, não mede quantos orçamentos foram reabertos e salvos desde então. Essa medição
  exigiria histórico de edição que não existe.
- **Não substitui `migracao.md` (Parte II).** A lista de colunas do portão é conferida contra
  produção porque a pasta de migrações não é o schema.

## Relação com as outras regras

`construtor-empobrecido.md` e `copia-divergente.md` são as vizinhas mais próximas: lá um produtor
do contrato esquece um campo; aqui o produtor é o processo que regrava, e o campo esquecido é a
coluna que chegou depois dele. O remédio 2 é o delas. `fato-vs-referencia.md` cruza com a aparição
2 — o valor regravado vem do cadastro vivo —, e a distinção está escrita acima. `ausente-vs-falso.md`
explica por que a primeira metade do critério engana: a coluna apagada volta NULL, e NULL lê como
"nunca informado", não como "apagado". `portao-que-nao-alcanca.md` é a razão de a conferência por
contagem de linhas não bastar. `migracao.md` (Parte II) é a ressalva do remédio 2.
`registro-de-classe.md` decidiu a forma desta página e o limite que a manteve em duas linhas.
