---
paths:
  - "src/lib/atendimentos-ia/**"
  - "src/pages/api/super-admin/atendimentos-ia/**"
  - "src/page-parts/atendimentos-ia/**"
  - "src/utils/atendimentos-ia-*.ts"
  - "supabase/migrations/*motor*"
  - "supabase/migrations/*categoria*"
---
# Tabela de preço por categoria — e a ordem que protege o motor

> **Decisão do dono do produto, 27/10/2026**, registrada como foi dita. A medição do estado é do mesmo dia.

## O que está decidido

1. **UMA TABELA = UMA CATEGORIA.** Ao subir uma tabela de fornecedor, a categoria (a ramificação) é
   **obrigatória**, e a importação **recusa** arquivo com mais de um segmento. A razão, dita por ele: não pode
   haver margem para o agente usar, no levantamento e nas fórmulas, **o preço de uma ramificação que ninguém
   escolheu**.
2. **O QUE DECIDE O PREÇO DE UMA RAMIFICAÇÃO é o fornecedor PRINCIPAL dela**
   (`orcamentista_mp_categoria_fornecedor.principal`). **Tabela que nenhuma ramificação escolheu não entra no
   cálculo.**
3. **O caminho para a Wolff:** três tabelas independentes (Perfil, Reforço, Acessórios), cada uma com o seu arquivo;
   a tabela atual é arquivada **depois**.

## A ORDEM OBRIGATÓRIA (a parte crítica)

A tabela atual da Wolff (`72366020-57c9-489f-9385-397b7fa3dedb`) é a **dona do motor**: 12.116 regras, 137 fórmulas
de família, as abas e os **164 tempos ESTIMADO** pendem do `tabela_id` dela. (**CORREÇÃO do dono do produto, 27/10/2026, à
noite:** este texto dizia que os tempos foram "digitados à mão e não estão no arquivo". **Medido: os 164 têm só TRÊS valores —
600 min em 91 tipologias, 300 em 55, 900 em 18 —, todos `ESTIMADO`, `atualizado_por` nulo e o mesmo `atualizado_em`: foram
preenchidos por regra, de uma vez. Não há trabalho manual a preservar.** A ordem abaixo vale do mesmo jeito: são 62.299 linhas
do motor, com ou sem o argumento dos tempos, e o `ON DELETE RESTRICT` fica.) Portanto:

> **NADA arquiva, substitui ou apaga essa tabela antes de o motor estar em `orcamentista_motor`** — a migração
> `20261027000004_copiar_motor_da_wolff_para_a_planilha`, aplicada **e conferida por consulta** (as contagens e o
> aviso `motor da Wolff copiado` do `$verifica$`). **PR C antes de qualquer mexida nas tabelas de preço.**

Quem for arquivar a tabela antiga (PR F) confere primeiro: a planilha existe, a cópia é igual (`EXCEPT ALL` nos dois
sentidos, para as 14 tabelas), e **os leitores já trocaram** (PR D). Arquivar antes disso deixa a conversa sem motor.
A planilha aponta o **mesmo objeto do bucket** que `motor_path` da tabela: a rota da tabela não o remove enquanto
uma planilha o referencia (`caminhosDaPlanilha`).

## O estado MEDIDO em 27/10/2026

| tabela | itens | segmentos | dentro da regra? |
|---|---:|---|---|
| Wolff | 735 | Perfil PVC 534 · Reforço 112 · Acessórios 87 · "acessórios" (minúsculo) 1 · sem segmento 1 | **não** — quatro segmentos |
| Estrela | 24 | Vidro | sim |

> Pela comparação da importação (que ignora a caixa), a Wolff tem **três** categorias do fornecedor — Perfil PVC 534, Reforço 112, Acessórios **88** (os 87 e o "acessórios" em minúsculo) — e **um** item sem categoria. Continua fora da regra.

## O que está implementado — a categoria no upload (PR de 27/10/2026, migração `20261027000005`)

- **`orcamentista_tabela.categoria_chave`** (nula, FK para `orcamentista_categoria_catalogo`): a categoria **da
  tabela**. **Obrigatória na tabela NOVA** — a rota recusa (`lerCorpoDaTabela`), e o banco tem a terceira trava
  (gatilho de INSERT, 23514). Uma vez dada, **não se troca nem se apaga** (rota 409 e gatilho de UPDATE).
- **Não confundir os dois nomes.** A *categoria da tabela* é a ramificação (PERFIL, REFORCO, VIDRO…), escolhida na
  tela. A *categoria do fornecedor* é o que o arquivo traz em cada item, na coluna `COLUNA_DA_CATEGORIA_DO_FORNECEDOR`
  (a palavra do dono do produto é "segmento", mas o portão de vocabulário proíbe a raiz em `src/`). **Nenhuma
  deduz a outra**: o sistema não tem mapa "Perfil PVC → PERFIL", e a importação só confere que o arquivo traz **uma**.
- **A importação de tabela que DECLARA a categoria recusa arquivo com mais de uma categoria do fornecedor**
  (422, nomeando as que achou, com a contagem, antes de gravar). Duas grafias da mesma categoria ("Acessórios" e
  "acessórios", espaço de sobra) contam como **uma**. Item sem a categoria preenchida **não é categoria**: vai a um
  aviso (`itens_sem_categoria_do_fornecedor`), nunca é somado a uma delas.
- **A tabela de antes NÃO é recusada retroativamente.** Sem categoria declarada (a da Wolff), a importação roda como
  sempre, com o aviso `tabela_sem_categoria_declarada`. Se a leitura da tabela não trouxer a coluna (`undefined`), a
  importação **falha fechada** (recusa), e não trata como "de antes".
- **Declarar a categoria de uma tabela já importada** (PATCH, uma vez): a Estrela (24 itens, só Vidro) pode ganhar
  VIDRO pela tela de edição. A tabela cujos itens gravados têm mais de uma categoria do fornecedor (a Wolff) **não
  pode declarar uma só** (409, nomeando as que achou). As outras edições dela seguem livres.
- **O que a migração NÃO faz:** nenhum UPDATE de dado (as duas tabelas de hoje ficam nulas); não toca no índice
  `orcamentista_tabela_uma_vigente` (fornecedor, família); a coluna não é NOT NULL.

## O que está implementado — o motor opcional na tabela e a etapa que aponta o motor (27/10/2026, migrações `20261027000007` e `20261027000008` aplicadas; `20261027000009` mergeada)

Decisão do dono do produto, 27/10/2026: "Exija o arquivo do motor apenas quando `categoria_chave = 'PERFIL'`. O motor tem casa própria agora
(`orcamentista_motor`); não precisa mais viajar colado na tabela de preço."

- **O arquivo do motor na tabela é OPCIONAL EM TODA CATEGORIA** (decisão do dono do produto, 27/10/2026, à noite: "o motor mora na família").
  De manhã (`20261027000007`) só o Perfil o exigia, por uma CHECK (`orcamentista_tabela_perfil_exige_motor`); **ela nasceu de manhã e saiu à noite**
  (`20261027000009`, pendente até ser aplicada) — não estava errada, o desenho mudou: o motor entra pela etapa da família, e o motor importado
  na tabela grava por `tabela_id` e faria a conversa recusar `TABELA_REPETIDA`. Resta a CHECK do par (`orcamentista_tabela_motor_par`): caminho
  e nome andam juntos. A rota recusa a metade (`lerCorpoDaTabela`) e o motor, na edição, troca inteiro e **não se apaga**.
  **Vazio não é motor** (achado do dono do produto): a Estrela está em produção com `motor_path = ''` e `motor_nome = ''`; a importação e a
  exclusão tratam nulo, vazio e só-espaço como "sem motor". (Quando a CHECK do Perfil existia, o `IS NOT NULL` deixava passar a string vazia;
  a versão final dela, `coalesce(motor_path ~ '[^[:space:]]', false)`, é a que foi aplicada — `btrim` simples não serve: só tira espaço.)
- **A importação de tabela sem motor lê só o preço**: as listas do motor vão vazias, não há cruzamento, e o arquivo do motor não é baixado.
- **A etapa aponta o motor** (`orcamentista_familia_etapa.motor_id`): `superadmin_gravar_etapas_da_familia` aceita `motor_id` no item (ausente
  mantém, `null` limpa, uuid aponta, e confere que o motor é da família da etapa e não está arquivado); `superadmin_arquivar_motor` **recusa** arquivar
  a planilha que alguma etapa aponta, nomeando a etapa. A tela das etapas ganhou o motor por etapa e "Inserir etapa abaixo"; o corpo só leva
  `motor_id` quando MUDOU.
- **O bloco Motor da conta** mostra, antes dos fornecedores, o cabeçalho "Motores das etapas" de cada família que a conta usa, e a **planilha da
  família** (sem fornecedor) aparece para a conta que usa a família (`familiasDaConta`: a família de uma matéria-prima da conta ou de uma tabela dos
  fornecedores que ela vincula; família não informada não conta).
- **`tabelas-da-conta.ts` agrupa por (fornecedor, família, categoria)**: Perfil, Reforço e Acessórios da Wolff são três grupos e as três valem.
  A tabela sem categoria (as de antes) é um grupo à parte.

**O que NÃO mudou — a conversa (PR D).** O leitor da conversa continua pedindo tabela **com motor** (tipologias importadas) e **recusa** duas tabelas
com motor do mesmo fornecedor e família (`TABELA_REPETIDA`), sem olhar a categoria, de propósito: a Wolff de antes (sem categoria, com motor) e a
nova de Perfil (com motor) valem cada uma no seu grupo, e deixá-las entrar juntas duplicaria as tipologias. **Subir** as três tabelas é seguro (Reforço e Acessórios não têm tipologia; a de Perfil só passa a ter ao ser IMPORTADA).
**Importar a de Perfil, com motor, antes do PR D faz a conversa da conta parar**, com a recusa nomeada `TABELA_REPETIDA` — e não duplica nada. A ordem continua a de cima: PR D troca os leitores, só então a tabela antiga sai (PR F).

## O que NÃO está implementado ainda — não presuma

- **O preço pelo principal da ramificação:** hoje os leitores usam as tabelas dos fornecedores vinculados
  (`tabelas-da-conta.ts`), sem filtrar por principal. Trocar isso é trabalho dos leitores (PR D).
- **A Wolff continua sem categoria**, com as categorias do fornecedor misturadas no mesmo arquivo, e é a fonte que a
  conversa ainda lê. Sai de circulação por decisão do dono do produto, **depois** do PR D.
- **REFORCO e ACESSORIOS_VEDACAO da De Paula não têm fornecedor vinculado** (medido em 27/10/2026): com a regra do
  principal, o preço delas não tem de onde vir até alguém vincular.
- **A Parte 2** (tirar o código do material do motor) segue pendente de desenho.
- **O motor criado por uma etapa não é lido pela conversa** (PR D) e nasce sem tempo — ver o PR E abaixo.

## O motor é da família — decisão de 27/10/2026 (corrige a de ontem) e as DÍVIDAS com data

Alinhamento com o dono do produto: o motor **não** é do par família + fornecedor de perfil. "Dentro das famílias, o
motor é mais importante dentro da família do que os fornecedores. A família definida aciona o motor, e o motor faz a
busca através das tipologias dos perfis ou dos materiais lá dentro dos fornecedores." Cada **etapa** da família aponta
o seu motor (`orcamentista_familia_etapa.motor_id`); o apanhado é multi-família, e cada item diz a sua
(`orcamentista_levantamento_item.familia`). A estrutura é a migração `20261027000006` (proposta; **só vale depois de
aplicada e conferida**). O item com `motor_id` exige `familia` por **CHECK**: a FK composta é `MATCH SIMPLE` e dá a
restrição por satisfeita se uma coluna for nula; `MATCH FULL` não serve (recusa o item com família e sem motor).

**Dívidas registradas em 27/10/2026:**
1. **`orcamentista_motor.vigente` fica por ora e sai quando os leitores trocarem** (PR D, com `motor_id` das etapas
   povoado). O que sai: a coluna, o índice `orcamentista_motor_uma_vigente`, o CHECK
   `orcamentista_motor_arquivado_nao_e_vigente`, a escrita em `superadmin_arquivar_motor`, 3 arquivos de código
   (`motor-da-conta.ts`, `motor-da-conta.component.tsx`, `atendimentos-ia-motor.ts`) e 4 de teste. **Até lá, a etapa
   vence**, e **arquivar planilha que uma etapa aponta é recusado** — implementado na `20261027000008` (pendente até ser aplicada).
2. ~~`superadmin_gravar_etapas_da_familia` recusa `motor_id`~~ — **paga em 27/10/2026** (`20261027000008`, pendente até ser aplicada).
3. ~~A conta só enxerga planilha de fornecedor que ela vincula~~ — **paga em 27/10/2026**: a planilha da família aparece para a conta que usa a família.
4. ~~`tabelas-da-conta.ts` e `tabelaVigenteDoPar` assumem uma vigente por (fornecedor, família)~~ — **paga em 27/10/2026**: os dois agrupam por
   (fornecedor, família, categoria).

**Decisões do dono do produto, 27/10/2026, à noite (o motor mora na família, na base de conhecimento):**
1. ~~Tempos na troca do arquivo do motor: COPIAR, com três limites~~ — **CAIU no mesmo dia (prioridade do dono do produto, à noite)**: "os tempos
   ficam como estão"; a estrutura de tempos não muda, e a regra de copiar tempos na troca de arquivo cai por ora. **Correção da premissa:** os 164
   tempos NÃO foram digitados à mão. Medido em produção em 27/10/2026: **164 linhas, 164 tipologias distintas, só TRÊS valores — 600 min em 91
   tipologias, 300 em 55, 900 em 18 (soma 87.300) —, todos `ESTIMADO`, `atualizado_por` nulo e um único `atualizado_em`**: preenchidos por regra, de
   uma vez. Servem para o teste. O `ON DELETE RESTRICT` e a ordem "copiar o motor antes de arquivar a tabela" ficam (62.299 linhas do motor, com
   ou sem o argumento dos tempos).
   **DÍVIDA REGISTRADA (não é trabalho de agora): a coluna de TEMPO DE FABRICAÇÃO na aba de tipologias do motor.** Decisão do dono do produto:
   "o tempo de fabricação de cada tipologia virá na tabela das tipologias [...] tudo dentro do motor, em uma coluna específica". Hoje a aba
   Detalhe (`orcamentista_motor_tipologia_detalhe`: tipologia, linha, descrição, tipo, larg/alt mín/máx, fonte do limite, n_perfis, n_vidros,
   n_insumos, ordem) NÃO tem tempo, e o arquivo `Motor_Wolf_PVC.xlsx` também não — por isso os tempos foram estimados. Quando a coluna vier: a
   coluna entra na Detalhe e `orcamentista_motor_tipologia_tempo` vira dívida, ou continua alimentada pela importação (a decidir então). Até lá,
   um motor novo subido pela etapa nasce **sem tempo** (a tabela de tempos só tem linhas do motor da Wolff, `motor_id` da planilha dela); como a
   conversa ainda lê o motor da tabela (PR D depois), nada do cálculo muda. O PR D terá de decidir de onde vem o tempo do motor da etapa.
2. **A exigência do Perfil sai agora** (`20261027000009`), num PR pequeno antes do PR E — ver acima.
3. **DECIDIDO (dono do produto, à noite): o motor fica GLOBAL — opção A** — porque o tempo, vindo no motor, é da plataforma, e toda conta da
   família herda os mesmos; **não se duplica por conta**. (Antes estava "aberto — planilha global ou por conta?", pergunta que toca a regra de
   isolamento entre contas, que é inviolável.) Medido em
   27/10/2026: nenhuma tabela do catálogo da plataforma (`orcamentista_fornecedor`, `_tabela`, `_tabela_item`, `_motor` e suas 12 tabelas de
   conteúdo, `_familia_etapa`) tem `tenant_id`; todas têm RLS só de super admin e nenhum grant para `anon`/`authenticated`; o que é da conta
   (`orcamentista_materia_prima`, `_mp_categoria`, `_mp_categoria_fornecedor`, `_levantamento*`…) tem `tenant_id`. O vínculo conta→catálogo é a
   matéria-prima (a família) e o fornecedor vinculado. Uma cópia do motor da Wolff pesa 24 MB (13 tabelas).

## O PR E — a etapa sobe o motor e o título da família é digitado (27/10/2026, migração `20261027000010`, PENDENTE até o dono do produto aplicar)

Escopo fechado pelo dono do produto: "O PR E é só isto." **(1)** O motor mora na família, na base de conhecimento, **acima da ramificação 1** (Perfil)
e antes dos fornecedores. **(2)** A lista de etapas é a lista de motores: cada etapa **gravada** tem o seu campo de arquivo; subir o arquivo **cria
a linha em `orcamentista_motor`** (família da etapa, sem fornecedor, não vigente) e **já aponta a etapa**, numa transação só
(`superadmin_criar_motor_da_etapa`). Trocar o arquivo é subir outro: o motor novo nasce, a etapa o aponta, o velho fica arquivável
(`superadmin_arquivar_motor` já recusa arquivar o que uma etapa aponta). **(3)** O rótulo da família é **digitado** e é o título:
`orcamentista_materia_prima.nome`, renomeado por `superadmin_renomear_materia_prima` (1 a 80 caracteres, sem repetir outro nome da empresa,
com log). **(4)** O motor é **global** (opção A): nenhuma duplicação por conta.

- **Onde mora na tela:** a seção "Motores da família" é a lista de etapas (`EtapasDaFamilia`), montada dentro do bloco da matéria-prima que
  tem família, entre a família e as categorias. O mesmo componente segue no cartão "Etapas da família" de Fornecedores e tabelas (o catálogo
  global se edita dos dois lados; é a mesma lista e as mesmas rotas). A seção traz o aviso de que etapa e motor valem para **todas** as contas da
  família e **nomeia** quais (só o nome da conta).
- **Como o arquivo viaja:** a rota da família assina o envio em `familia/<chave>/motor/<uuid>-<nome>` (`motor-url-de-envio`), o navegador manda
  os bytes ao Storage, e a rota da etapa (`motor-da-etapa/[etapaId]`) lê o objeto com o **mesmo leitor da importação** (`lerArquivoDoMotor` —
  `lerOMotor` é uma só, para os dois caminhos), chama a função e **confere as doze contagens** contra o que mandou (divergência é 500, nunca
  sucesso). A função confere o mesmo prefixo da pasta.
- **Campo travado:** o arquivo só sobe com a lista salva (subir relê a lista e perderia o rascunho), e a etapa nova mostra "salve antes".
- **O motor novo nasce SEM TEMPO** (os tempos são os 164 do motor da Wolff, 600/300/900, `ESTIMADO`; a coluna de tempo na aba de tipologias é a
  dívida acima). O cálculo da conversa **não muda**: a conversa ainda lê o motor da tabela. Um motor criado por uma etapa é **invisível à
  conversa até o PR D**. O PR D tem de decidir de onde vem o tempo do motor da etapa.
- **O bloco Motor saiu da página da conta** (dono do produto, 28/10/2026: "manter os dois é duas verdades na mesma tela"); o componente, o `lib` e as rotas `contas/[tenantId]/motor/*`
  ficaram no código, sem ninguém montá-los (arquivar planilha, marcar vigente, família da tabela e ver tipologias perderam tela). **Ainda não feito, de propósito:** trocar os leitores é o PR D;
  o código do material fora do motor é a Parte 2.
- **Isolamento (medido, sem furo):** as funções novas e as rotas são de super admin; o motor e as etapas não têm `tenant_id` e a conta não os
  lê; a única superfície nova que toca uma conta é o `nome` da matéria-prima, e a função confere `tenant_id`. O efeito entre contas de editar
  dado global de dentro da página de uma conta é dito na tela, não escondido.

## O fornecedor da ramificação sai da TABELA — o filtro (28/10/2026, sem migração)

**A categoria fica na tabela** (`orcamentista_tabela.categoria_chave`, `20261027000005`, aplicada): um fornecedor tem VÁRIAS tabelas, uma por categoria, e
a nomenclatura as distingue ("Wolf perfil", "Wolf reforço metálico", "Wolf persiana"). **Não se move a categoria para `orcamentista_fornecedor`, não se cria
coluna lá, e não se credencia fornecedor repetido.** (Uma mensagem anterior pedia o contrário; o dono do produto a corrigiu no mesmo dia.) O que ele quer,
nas palavras dele: "quando eu for lá na categoria dentro da família ver o que eu preciso de persiana, eu vou ver quais são os fornecedores de persiana que eu tenho".

- **O filtro é da TELA** (a lista "+ fornecedor" de cada ramificação): só aparece quem tem tabela COM AQUELA categoria. O servidor da árvore devolve, por fornecedor
  do nicho, `categorias_das_tabelas` (distintas, em ordem) e `tabelas_sem_categoria`. **Categoria nula não é categoria:** vai para a contagem, nunca é somada a uma.
  A função do banco (`superadmin_gravar_mp_fornecedores`) continua aceitando qualquer fornecedor do nicho — **não há migração**, e o filtro não é trava de banco.
- **Quem já está na lista não some:** sem tabela da categoria, ganha a marca "sem tabela desta categoria". Quando não sobra ninguém para escolher, a tela diz por
  quê — "nenhum fornecedor do nicho tem tabela da categoria X", ou "todos já estão" — e **nomeia os fornecedores com tabela sem categoria declarada** (não aparecem em
  categoria nenhuma até alguém declarar a da tabela, em Fornecedores e tabelas).
- **O arquivo do motor saiu do modal de tabela** (o motor entra pela etapa da família). A rota da tabela segue aceitando `motor_path`/`motor_nome` no corpo: as tabelas de antes
  (a Wolff) têm motor, e o destino delas é do PR D.
- **Medido em produção em 28/10/2026:** 64 fornecedores no nicho Esquadrias (e só ele), **3 com tabela, 61 sem nenhuma**. Das 3 tabelas, **1 tem categoria** (IMAB, FERRAGENS,
  família PVC) e **2 têm categoria nula** (Wolf Perfis, Estrela). Ou seja, hoje a lista "+ fornecedor" oferece: **FERRAGENS 1 (IMAB)**; **PERFIL, PERSIANAS, REFORCO,
  ACESSORIOS_VEDACAO, VIDRO e INSTALACAO 0**. Os dois vínculos que existem (Wolf como PERFIL principal, Estrela como VIDRO) são de fornecedores cuja tabela não declara categoria:
  continuam na tela, com a marca. Para um fornecedor aparecer, alguém declara a categoria da tabela (PATCH uma vez; a Wolff, com quatro categorias do fornecedor no arquivo, não
  pode — ver acima).

**Comentários desatualizados em migração já aplicada (não se corrigem lá — `migracao.md`, "migração aplicada é imutável"):** o cabeçalho da
`20261027000002` (linha 26: "digitados à mão e não estão no arquivo") e o da `20261027000004` ("DIGITADOS À MÃO e NÃO estão no arquivo") dizem que os 164 tempos têm trabalho manual. **Isso está errado e a
correção é a medição acima** (3 valores, 600/300/900, `ESTIMADO`, `atualizado_por` nulo, um único `atualizado_em`). O `ON DELETE RESTRICT` e a ordem
"copiar o motor antes de arquivar a tabela" valem pelas 62.299 linhas, não pelo argumento dos tempos.

**Em aberto, sem resposta (27/10/2026) — registrada como PERGUNTA ABERTA, pelo dono do produto: NÃO desenhar variante por linha sem a resposta:**
a redução por tipologia vale para qualquer fornecedor de PVC? Não se sabe — e nem o assistente sabe:
só há um fornecedor de PVC em produção, e as constantes de geometria (119 das 137 fórmulas de família) estão
indexadas por LINHA (EUROPA 42/60, DESIGN), que são linhas da Wolff. **Só o motor de um segundo fornecedor responde.** Não deduzir.

## O corolário aplicável ANTES do defeito existir

Antes de tirar uma tabela de fornecedor de circulação — arquivar, substituir o arquivo, apagar —, pergunte **o que
pende do `tabela_id` dela** (consulte as 14 tabelas do motor e os tempos), e não só o que a tela mostra. O tempo
(`orcamentista_motor_tipologia_tempo`) não volta com uma reimportação (`tabela-que-a-importacao-apaga.md`, camada 3) — e hoje são 164 valores de
teste, 600/300/900, não trabalho manual (correção de 27/10/2026).

## A família por linha de produto e a família só no Perfil — decisões de 28/10/2026 (migração `20261028000002`, PENDENTE até o dono do produto aplicar)

Formulação do dono do produto, registrada como está:

> **MOTOR POR LINHA: CONFIRMADO.** [...] **A FAMÍLIA NA TABELA É OBRIGATÓRIA SÓ NO PERFIL.** Nas demais categorias [...] a família fica OPCIONAL.
> [...] **Troque o nome para "PVC Wolf" MANTENDO a chave `PVC`**, por migração pequena com log, sem tocar em chave estrangeira nenhuma. As famílias
> novas ("PVC Veca") nascem com chave própria. **NÃO renomeie a chave.**

- **O catálogo de famílias tem uma entrada por LINHA de produto** ("PVC Wolf", "PVC Veca"), e o motor é por linha — a FK composta motor ↔ etapa fica.
- **A família `PVC` é a linha da Wolff:** o nome exibido passa a "PVC Wolf" e a chave fica `PVC`. Trocar a chave derrubaria e recriaria as 6 FKs que
  apontam a chave e as 2 compostas que a carregam pelo motor (3 depois da `20261028000001`); o nome resolve o que se vê sem tocar em nenhuma. A migração guarda o antes e o depois no `superadmin_alteracao_log` e aborta
  se a família já tiver outro nome ou se outra família já se chamar "PVC Wolf". **A rota das famílias recusa nome repetido** (sem olhar a caixa), com 409
  nomeando a que existe.
- **A família na tabela é obrigatória SÓ no PERFIL.** A tabela de perfil é de uma linha (o motor cita os códigos do perfil dela); a de ferragem, vidro,
  acessórios, persianas, reforço e instalação é da categoria e serve **qualquer linha**. As três camadas dizem o mesmo:
  - o banco: a CHECK `orcamentista_tabela_familia_no_perfil` (`categoria_chave IS DISTINCT FROM 'PERFIL' OR familia IS NOT NULL`);
  - a rota: o POST aceita família ausente ou nula fora do Perfil; o PATCH tira a família com `familia: null` e recusa quando a tabela ficaria Perfil sem
    família — inclusive ao DAR a categoria Perfil a uma tabela de antes sem família; a trava do banco numa corrida vira a mesma frase, não um 500;
  - a tela: a opção "Qualquer linha" aparece fora do Perfil, e a coluna da família mostra "Qualquer linha" na tabela sem família de outra categoria.
- **Medido em produção em 28/10/2026, antes da migração:** nenhuma tabela de PERFIL sem família (a do Wolf duplicado tem `PVC`); a família `PVC` se
  chama "PVC"; nenhuma outra família.

**DÍVIDA, registrada como o dono do produto mediu (28/10/2026) — não é trabalho de agora:**

> Dos **549 códigos do motor, 488 são de perfil e 63 de INSUMO** — e os insumos também são da Wolff. **Enquanto o insumo vier de dentro do motor, ele
> segue o fornecedor de perfil, não um fornecedor próprio.**

**A conta, reconferida em produção em 28/10/2026 (só leitura, `orcamentista_motor_regra`):** 488 + 63 = 551, dois a mais que os 549 distintos — porque
**dois códigos estão nos dois tipos**: `8428` (40 regras) e `8431` (138 regras) aparecem como Perfil **e** como Insumo. Não é erro da medição; é o mesmo
código em dois papéis, e quem separar o insumo do fornecedor de perfil decide código a código (`a-coluna-que-parece-enumeracao.md`).

Ou seja: a família opcional nas outras categorias vale para a tabela que é **só** de preço (ferragem da IMAB, vidro da Estrela). O insumo que o motor da
Wolff cita (vedação, calço, escova) **não** é buscado numa tabela de ACESSÓRIOS de outro fornecedor: ele sai do mesmo fornecedor do perfil. Separar o
insumo do motor do fornecedor de perfil é desenho futuro, e pede decisão do dono do produto.
