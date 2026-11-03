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

> **SUPERADO pelo PR D (02/11/2026)** — a conversa não lê motor de tabela nenhuma; ver a seção do PR D no fim desta página. O parágrafo abaixo fica
> como o estado de 27/10/2026.

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
- **O motor criado por uma etapa não é lido pela conversa** (PR D) e nasce sem tempo — ver o PR E abaixo. *(Desde o PR D, 02/11/2026, a conversa lê o
  motor das etapas 1 e 2; o tempo vem de `orcamentista_motor_tipologia_tempo` por `motor_id`, e o motor sem tempo dá a mão de obra "não sai", nomeada.)*

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

## DESENHO FINAL — família-instância e catálogo de motores (dono do produto, 28/10/2026; consolida e prevalece sobre o anterior)

**A categoria é da TABELA** (o #189): a Wolf pode vender perfil, reforço metálico, persiana, ferragem e adesivo, e tem UMA TABELA POR CATEGORIA — "para
não dar conflito e não ter sobra de informação no perfil e faltar em outro lugar". **O motor é GLOBAL e COMPARTILHADO** ("empresas diferentes podem usar o
mesmo motor"): uma base só na plataforma, e cada família de cada empresa seleciona qual usa.

**Aprovado, 28/10/2026:**
1. **As etapas são da FAMÍLIA-INSTÂNCIA** (a matéria-prima, que tem `tenant_id`), não da chave do catálogo: a mesma empresa pode ter três famílias PVC,
   cada uma com fornecedores diferentes ("o motor da etapa busca fornecedores através dos códigos de cada perfil identificado"). A etapa ganha
   `tenant_id` e `materia_prima_id`, mantém `familia` para a FK composta com o motor (PVC só aponta motor PVC), e a unicidade passa a ser
   `(materia_prima_id, numero)`. Trocar a família de uma matéria-prima que tem etapas é recusa nomeada. O cartão "Etapas da família" sai de Fornecedores e tabelas.
2. **Cai o índice `(tenant_id, familia)`** (`orcamentista_materia_prima_tenant_familia_idx`, da `20261027000002`): a unicidade que fica é `(tenant_id, lower(nome))`
   — títulos diferentes bastam. Duas instâncias "iguais" (mesmo tipo, mesmos principais) são AVISO, não trava.
3. **Catálogo de motores** em Fornecedores e tabelas, abaixo dos fornecedores: cada motor com **fornecedor + categoria**; `familia` fica como TIPO.
   `vigente` e o índice `orcamentista_motor_uma_vigente` **saem** (quem escolhe é a etapa; eles impediriam a Wolf de ter motor de PERFIL e de PERSIANA).
4. **Na etapa, o campo de arquivo some**: fica o combo do catálogo e o link "cadastrar motor no catálogo". Subir motor de dentro da página de uma conta
   criaria dado global fora do catálogo.
5. **Preenchimentos autorizados** (com guarda que aborta): o motor da Wolff ganha `categoria_chave = 'PERFIL'`; as 3 etapas PVC passam para a instância
   "Esquadrias de PVC WOLF" da De Paula (o nome que ela tem desde 28/10/2026). A migração aborta se houver mais de uma matéria-prima PVC ou se as etapas não forem exatamente as 3 medidas.

**Implementado (28/10/2026, migração `20261028000001`, PENDENTE até o dono do produto aplicar):** a etapa tem `tenant_id` e `materia_prima_id`
(FK composta `(materia_prima_id, tenant_id, familia)` → matéria-prima, `ON DELETE CASCADE`; o remover loga as etapas); o motor tem `fornecedor_id` e
`categoria_chave` obrigatórios e não tem mais `vigente`. Funções: `superadmin_gravar_etapas_da_materia_prima`, `superadmin_criar_motor` (no catálogo,
pasta `<fornecedor>/motor/`, sem apontar etapa), `superadmin_arquivar_motor` (a recusa nomeia etapa, família e EMPRESA), `superadmin_definir_familia_da_materia_prima`
(recusa trocar o tipo de quem tem etapas). Na tela: as etapas ficam na base de conhecimento da conta, dentro da família; o catálogo de motores fica em
Fornecedores e tabelas (âncora `#motores`); o bloco "Motor" da conta (morto desde o #188) foi apagado porque lia `vigente`. Prova:
`scripts/harness/familia-instancia/` (cadeia real + estado de produção conferido em 28/10/2026). **O cálculo da conversa não muda**: quem lê as etapas é o PR D.

**REGISTRO PARA O PR D (antes de escrevê-lo): derivar POR INSTÂNCIA, não por conta.** Hoje a derivação das tabelas da conversa (`derivarTabelasDaConta`,
`vinculosDaConta`) junta os fornecedores de TODAS as matérias-primas da conta. Com duas famílias PVC na mesma empresa, isso mistura os fornecedores da
Família 1 com os da Família 2 — exatamente o que o desenho quer separar. O PR D deriva as tabelas (e o motor, pelas etapas) a partir da família-instância
do item, e o item de levantamento passa a dizer de qual instância é (`materia_prima_id`, a acrescentar no PR D).
**SUPERADO pela decisão do dono do produto de 02/11/2026, no PR D:** a família é a CHAVE do catálogo (as famílias distintas da conta), as tabelas de
preço são as dos fornecedores vinculados POR CONTA com a família da conta ou família nula, e o item grava `familia` e `motor_id` — não `materia_prima_id`.
Duas instâncias da mesma família com motores diferentes na mesma etapa são erro de configuração (`MOTORES_DIVERGENTES`), não duas famílias.

**Pendentes com o dono do produto (não mexer):** o fornecedor repetido "Wolf  Perfis PVC" (espaço duplo, de 24/10) e a tabela PERFIL pendurada nele;
as duas tabelas FERRAGENS da IMAB, nenhuma vigente.

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

**MEDIÇÃO — a conta por tipo é 551, com 2 em comum; 549 é a de códigos distintos** (assistente, 28/10/2026, só leitura; confirmada pelo dono do
produto, que tinha usado 549 em vários comandos como se fosse a soma):

| contagem em `orcamentista_motor_regra` | códigos |
|---|---:|
| distintos, todos os tipos | **549** |
| distintos com `tipo = 'Perfil'` | 488 |
| distintos com `tipo = 'Insumo'` | 63 |
| soma por tipo | **551** |
| nos dois tipos | **2**: `8428` (40 regras) e `8431` (138 regras) |

```sql
select tipo, count(distinct codigo) from orcamentista_motor_regra group by rollup(tipo);
select codigo, array_agg(distinct tipo), count(*) from orcamentista_motor_regra group by codigo having count(distinct tipo) > 1;
```

**Quem citar o número diz qual dos dois é:** 549 códigos distintos, ou 488 + 63 = 551 por tipo. Os dois códigos em comum não são erro da medição: é o
mesmo código em dois papéis, e quem separar o insumo do fornecedor de perfil decide código a código (`a-coluna-que-parece-enumeracao.md`).

Ou seja: a família opcional nas outras categorias vale para a tabela que é **só** de preço (ferragem da IMAB, vidro da Estrela). O insumo que o motor da
Wolff cita (vedação, calço, escova) **não** é buscado numa tabela de ACESSÓRIOS de outro fornecedor: ele sai do mesmo fornecedor do perfil. Separar o
insumo do motor do fornecedor de perfil é desenho futuro, e pede decisão do dono do produto.

## Ajustes de tela — dono do produto, 29/10/2026 (sem estrutura nova no banco)

- **A etapa saiu do catálogo de motores** ("etapa deve ser desconsiderada"): a etapa é da empresa, e o mesmo motor serve empresas que numeram
  diferente. O "Quem usa" mostra **empresa · família**, um por família — três etapas da mesma família que apontam o motor são um uso só —, e a trava
  de arquivar conta famílias. A recusa da função (`superadmin_arquivar_motor`) ainda nomeia a etapa: mudar o texto dela é migração, e não foi pedida.
- **A base de conhecimento perdeu o "N de M categorias"** do cabeçalho da família, e o "Remover" virou **"Remover família"**, na borda direita do
  cabeçalho. O caminho não mudou: marca, "Desfazer" devolve, e o salvar manda `remover` à `superadmin_gravar_arvore`, que chama a
  `superadmin_remover_materia_prima` (conferido no `prosrc` de produção em 29/10/2026) — a que loga a árvore inteira e as etapas que o CASCADE leva.
- **Medido para as propostas (29/10/2026, só leitura):** o catálogo de famílias (`orcamentista_familia_catalogo`: chave, rótulo, ordem) **não tem
  nicho** — é global; o fornecedor tem `nicho_id`; o motor só chega ao nicho pelo fornecedor. 12 nichos, só "Esquadrias" com fornecedor (63). O motor
  da Wolff pende de 62.299 linhas (62.295 de conteúdo em 13 tabelas + 4 importações), todas `ON DELETE RESTRICT`, e tem 3 etapas apontando. **Nenhuma
  tabela de PERFIL existe hoje**: a família do motor não se deriva de tabela nenhuma, e o "Novo motor" de PERFIL não oferece fornecedor.

## Decisões de 29/10/2026 — o nicho, o motor e a família do motor

Formulação do dono do produto, registrada como está:

> **NICHO COMO CONTAINER: OPÇÃO A**, página própria (/catalogo/[nicho]) com as três abas. A família fica GLOBAL com aviso, até haver motivo medido para
> lhe dar nicho. [...] **TROCAR O ARQUIVO DO MOTOR: OPÇÃO (a)** [...] um levantamento antigo tem de continuar lendo o que leu. [...] **NÃO faça a opção
> (b)**: apagar e reimportar com o mesmo id muda, em silêncio, o que um levantamento já calculado leu. [...] **"REMOVER O ARQUIVO" É ARQUIVAR.**

1. **O nicho é o container — implementado (sem migração):**
   - o Catálogo lista os nichos, e cada um abre `/super-admin/atendimentos-ia/catalogo/[nichoId]`, com as abas **Famílias → Fornecedores → Motores**
     e a aba na URL (`?aba=`);
   - fornecedores são os do `nicho_id`; motores, os desses fornecedores;
   - o "voltar" do fornecedor e o "cadastrar motor no catálogo" da etapa levam ao nicho.
2. **DÍVIDA — a família não tem nicho.** `orcamentista_familia_catalogo` é global, e a aba diz isso (`AVISO_DA_FAMILIA_GLOBAL`). **Não se cria a
   coluna agora:**
   - 12 nichos, um só com fornecedores (Esquadrias, 63);
   - nenhuma família além da PVC Wolf;
   - "seria estrutura nova para um problema que ainda não existe".

   Quando houver família de outro nicho, mede-se e propõe-se.
3. **Trocar o arquivo do motor = motor NOVO** (opção a, aprovada):
   - as famílias que usavam o antigo são reapontadas na mesma transação, e o antigo é arquivado com as linhas intactas;
   - os 164 tempos ficam no motor antigo, porque são do arquivo antigo;
   - **a opção (b), apagar e reimportar com o mesmo id, é proibida.**

   **Implementado na `20261029000001` (PENDENTE até o dono do produto aplicar):** `superadmin_trocar_arquivo_do_motor` trava o antigo, cria o
   novo pela `superadmin_criar_motor`, reaponta as etapas (com log por etapa, com a empresa) e arquiva o antigo pela `superadmin_arquivar_motor`,
   numa transação só. O item de levantamento que leu o antigo continua no antigo. Na tela, "Trocar arquivo" vale também em motor com uso.
4. **"Remover o arquivo" é ARQUIVAR**, que já existe: motor sem arquivo não é motor (`arquivo_path`/`arquivo_nome` NOT NULL). **Apagar o motor** só sem
   uso NEM conteúdo, e só com autorização do dono do produto, como todo DELETE. Não há botão para isso.
5. **Editar categoria e fornecedor do motor: só sem uso.** Com uso, o arquivo ficaria na pasta do fornecedor antigo e o motor mentiria sobre a origem.
   **Implementado na `20261029000001`:**
   - `superadmin_editar_motor` recusa com uso (etapa **ou** item de levantamento), nomeando quantos.
   - Trocar o fornecedor exige o caminho na pasta de motor do NOVO: a rota **copia** o objeto e, se a função recusar, remove **só a cópia**. O
     arquivo antigo nunca é apagado, porque apagar é DELETE.
   - No Perfil, a família do motor tem de ser a de uma tabela de Perfil do fornecedor novo.
6. **A família do motor de PERFIL vem da tabela de PERFIL do fornecedor — implementado (sem migração):**
   - o "Novo motor" pede **categoria → fornecedor → família → arquivo** (era família primeiro);
   - no Perfil, a família é a das tabelas de Perfil do fornecedor (`familias_do_perfil`): com uma, já vem escolhida e travada; com mais de uma,
     escolhe-se entre elas;
   - a rota recusa outra (400 nomeando as que há) e o fornecedor sem tabela de Perfil, antes de baixar o arquivo;
   - nas demais categorias a família ainda se escolhia à mão até o item 7; com ele, fora do Perfil a tela não pergunta a família.
7. **A família do motor só no Perfil (motor de persiana serve qualquer linha):** decidido como regra, com o mesmo motivo da tabela
   (`20261028000002`). **Mexe na FK composta da `20261028000001`.**
   - A medição e a proposta estão em `docs/propostas/2026-10-29-familia-do-motor-so-no-perfil.md`: uma coluna gerada `familia_exigida =
     coalesce(familia, '*')`, com a trava declarativa, provada em 11 casos num Postgres 16 local.
   - **APROVADA pelo dono do produto em 29/10/2026**, nas palavras dele: "A trava continua DECLARATIVA, no catálogo de constraints, e não em código
     de função — era esse o ponto. O '*' é seguro porque a CHECK orcamentista_familia_catalogo_chave_forma exige ^[A-Z][A-Z0-9_]{0,39}$ [...]
     Escreva a migração assim, sem gatilho." E: "AUTORIZADO O PREENCHIMENTO: as 3 etapas de hoje ganham motor_familia_exigida = 'PVC', com antes
     e depois no log, e com a guarda que você propôs."

   **Implementado na `20261029000002_familia_do_motor_so_no_perfil` (PENDENTE até o dono do produto aplicar; pressupõe a `20261029000001`):**
   - **No motor:**
     - `familia` nula permitida;
     - a CHECK `orcamentista_motor_familia_so_no_perfil`, `(categoria_chave = 'PERFIL') = (familia IS NOT NULL)`;
     - a coluna gerada `familia_exigida` e o `UNIQUE (id, familia_exigida)`;
     - sai o `UNIQUE (id, familia)`.
   - **Na etapa e no item:** `motor_familia_exigida`, a CHECK (existe se e só se há motor; vale a família da linha ou `'*'`) e a FK
     `(motor_id, motor_familia_exigida) -> motor (id, familia_exigida)`, `ON DELETE RESTRICT`. As FKs `(motor_id, familia)` saem; a FK simples
     do item fica.
   - **O preenchimento autorizado:** as 3 etapas ganham `'PVC'`, com log. A guarda aborta se:
     - as etapas a preencher não forem exatamente as 3;
     - alguma tiver motor sem família, de outra família ou fora do Perfil;
     - houver motor fora do Perfil com família;
     - houver item de levantamento com motor;
     - a forma da chave de família não for a medida.
   - **Funções:**
     - `superadmin_criar_motor`: a família é obrigatória no Perfil e recusada fora dele;
     - `superadmin_gravar_etapas_da_materia_prima`: aceita o motor sem família e grava a exigida;
     - `superadmin_editar_motor`: ganha `p_familia`, e a família anda com a categoria. Sai a assinatura sem ela.
   - **O código:**
     - o "Novo motor" só pergunta a família no Perfil;
     - a lista diz "Qualquer linha";
     - o combo da etapa oferece também os motores sem família;
     - a edição de Perfil pede a família da tabela de Perfil do fornecedor.
   - **Prova:** `scripts/harness/familia-do-motor-so-no-perfil/`, com a cadeia real e o estado de produção de 29/10/2026, as 8 guardas, as duas
     corridas e as mutações nas duas passadas.

## Incidente de 29/10/2026 — a edição trocou o arquivo da tabela da Wolff e apagou o original

**Medido (logs do Supabase e `storage.objects`, só leitura):** às 16:07:09 uma edição (PATCH) **sem categoria** trocou o `arquivo_path` da tabela
`72366020…` (735 itens importados em 20/10) para `arquivo/acc4e760-…-Perfis_de_PVC_-_Wolff.xlsx`, e às 16:07:10 a rota **apagou** o objeto antigo,
`arquivo/2b9fc126-…-Modelo-2026-Atualizada-Tabela-de-Pedidos-Wolff-Perfis.xlsm` (601.701 bytes, eTag `2a7e0959153303fac954af9851c4dd8f`). A
rota só protegia o arquivo do MOTOR (`caminhosDaPlanilha`); o de preço não tinha trava — e é exatamente o que "A ORDEM OBRIGATÓRIA", acima,
proíbe ("NADA arquiva, substitui ou apaga essa tabela"). **Nada se perdeu:** o dono do produto tinha a cópia (md5 e tamanho iguais ao eTag).
As outras quatro edições (16:03, 16:04, 16:06, 16:13) traziam a categoria e foram recusadas pela conferência dos itens gravados — a recusa
estava certa no efeito, mas a frase não dizia que contava os itens do arquivo de antes. Cada uma deixou o arquivo enviado sobrando no bucket:
`9ad536c7`, `56f75f12` e `d6ab0018`, guardados como prova até o conserto (c) estar em produção.

**Os consertos (aprovados pelo dono do produto, 29/10/2026, nesta prioridade):**
- **(a)** o arquivo de uma tabela com algum item importado **não se troca**: a edição responde 409 com `fraseDoArquivoDaTabelaImportada`, que manda
  criar **tabela nova**, antes de qualquer outra conferência, gravação ou remoção;
- **(c)** a edição **recusada** tira do bucket o arquivo que a tela acabou de enviar — só se nenhuma tabela (arquivo ou motor) e nenhuma planilha do
  motor o referencia, e nada sai se a conferência falhar;
- **(b)** a recusa das categorias diz "os itens gravados do arquivo de antes" e aponta a tabela nova.

**Arquivo novo de uma categoria é TABELA NOVA.** O `Perfis_de_PVC_-_Wolff.xlsx` é um **terceiro formato** que o importador não lê (17 abas — Resumo,
16 por cor e "Sem preço na tabela" —, cabeçalho na linha 4, toda linha com Categoria = "Perfis de PVC"); o leitor que reconhece pela FORMA, e não
pelo nome da aba, se mede junto com os arquivos WVetro.

## O motor serve N famílias e uma categoria — dono do produto, 29/10/2026 (migração `20261029000003`, PENDENTE até o dono do produto aplicar)

Formulação do dono do produto, registrada como está:

> "A gente define, bota o arquivo do motor, a qual categoria ele pertence e para quais famílias ele atua." [...] Medido: nenhum '*' em uso [...]
> Dados limpos, então o '*' sai de cena — todo motor passa a listar famílias explicitamente. [...] A migração 20261029000002 FICA COMO ESTÁ.

**Substitui o item 7 acima** (a família só no Perfil, com o `'*'`). A `20261029000002` não muda (migração aplicada é imutável); a `20261029000003` desfaz o
desenho dela por cima.

- **A ligação `orcamentista_motor_familia (motor_id, familia)`**, PK das duas; `motor_id` → motor `ON DELETE CASCADE`; `familia` → catálogo `ON DELETE
  RESTRICT`. RLS e as mesmas quatro políticas e grants de `orcamentista_motor` (lidos do banco em 29/10/2026). Semeada de `motor.familia` (1 motor, 1 linha),
  com antes e depois medidos e log.
- **Todo motor tem pelo menos uma família** — um `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` (`orcamentista_motor_sem_familia`, nas duas tabelas),
  conferido no COMMIT. Por que não uma coluna de contagem: a CHECK não é adiável, e o motor nasce antes da ligação — a trava impediria a criação. A função
  do gatilho trava a linha do motor antes de contar (duas transações que tiram famílias diferentes do mesmo motor se enfileiram).
- **Na etapa e no item:** a CHECK da exigida perde o `'*'` (a exigida é a família da linha), e a FK `(motor_id, motor_familia_exigida)` aponta a LIGAÇÃO.
  Uma etapa de família X só aponta motor que atua em X.
- **Saem do motor** `familia`, `familia_exigida`, a CHECK `orcamentista_motor_familia_so_no_perfil` e o UNIQUE delas. `categoria_chave` fica.
- **Funções:** `superadmin_criar_motor(..., p_familias text[], ...)` (pelo menos uma, sem repetição, todas do catálogo; a ligação depois do motor, na mesma
  transação); `superadmin_editar_motor(..., p_familias text[], ...)` — fornecedor e categoria SÓ SEM USO, as famílias também COM uso, e tirar a que uma etapa
  ou item usa é recusa `23001` que nomeia quem usa (empresa / família-instância / etapa; o levantamento do item); a gravação das etapas recusa o motor que não
  atua na família; trocar o arquivo cria o novo com as mesmas famílias.
- **No código:** o POST `/motores` leva `familias: string[]`; **caiu a trava "família só no Perfil, a da tabela de Perfil do fornecedor"** (zero tabelas de
  Perfil em produção) — a família não se amarra mais a uma tabela da categoria; família fora do catálogo é 400 nomeando-a. O catálogo mostra a lista; o
  "Editar" vale com uso (categoria e fornecedor travados no modal), e a recusa da família em uso é 409 dentro do modal.
- **Prova:** `scripts/harness/motor-para-n-familias/` — a cadeia real com a `20261029000002` como em produção, os casos de cada trava (DML direto e funções),
  os COMMITs de verdade do gatilho adiado, três corridas, cinco guardas e as mutações nas duas passadas.

## O motor tem nome; arquivar motor em uso é permitido; a família só calcula pronta — dono do produto, 29/10/2026 (migração `20261029000005`, PENDENTE até o dono do produto aplicar)

Formulação do dono do produto, registrada como está:

> A. "Quando for criar ou credenciar um novo motor, ou qualquer motor, é preciso nomeá-lo. Então, nós temos que ter o local de inserir ou editar o nome."
> B. "Excluir um motor que esteja vinculado a uma família ou etapa não é problema. [...] Caso não tenha, ele fica apontando para ele. Se não tiver nenhum,
> ele não vai poder fazer o cálculo. Então, ele não responde nada. [...] eu posso apontar um outro motor, um motor mais atualizado [...] Aí ele volta a
> funcionar."
> C. "para funcionar, a família funcionar, ela precisa ter todos os motores. Caso não tenha um motor, ela não funciona."

A `20261029000003` (aplicada às 18:50 UTC de 29/10/2026) não muda; a `20261029000005` vem por cima, e **não depende da `20261029000004`** (as duas ordens
provadas no harness).

- **A. `orcamentista_motor.nome`**, NOT NULL; CHECK `orcamentista_motor_nome_forma` (sem espaço nas pontas, 1 a 80 caracteres — a forma do rótulo da etapa);
  índice único PARCIAL `orcamentista_motor_nome_ativo (fornecedor_id, nome) WHERE arquivado_em IS NULL` (o arquivado libera o nome). Semeado do
  `arquivo_nome` sem a extensão (`Motor_Wolf_PVC.xlsx` → `Motor_Wolf_PVC`; 1 motor), com antes e depois no log. `superadmin_criar_motor` recebe `p_nome`;
  `superadmin_editar_motor` edita o nome COM uso. No corpo das rotas ele é `nome_do_motor` (`nome` continua sendo o do arquivo); o combo da etapa e o
  catálogo mostram o nome. **Trocar o arquivo dá ao novo o MESMO nome** — e, como o índice é conferido no INSERT, a troca **arquiva o antigo ANTES de
  criar o novo** (a premissa "o antigo é arquivado na mesma transação, então não colide" só vale nessa ordem; na de antes — criar, reapontar, arquivar
  — o INSERT colidiria. Provado no harness, caso F5).
- **B. As FKs `(motor_id, motor_familia_exigida)` da etapa e do item passam a `ON DELETE SET NULL`** (anula as duas colunas; a CHECK "a exigida existe se e só
  se há motor" continua satisfeita — caso K3). Arquivar não apaga a ligação (é UPDATE), então o SET NULL só age quando uma ligação é apagada; **a FK deixou
  de proteger a família em uso**: quem recusa tirar do motor a família que uma etapa usa é a conferência de `superadmin_editar_motor`, com o motor travado
  (caso F6, mutação E7). `superadmin_arquivar_motor` arquiva também com uso: LIMPA o motor das etapas, loga cada uma com o tenant dela e devolve
  `etapas_sem_motor` (empresa / família / número / rótulo), que a tela lista depois de arquivar. **O item de levantamento já gravado não é tocado** — a
  pergunta está com o dono do produto (medido em 29/10/2026: 4 itens, nenhum com motor, e nenhum código lê ou grava `motor_id` do item).
- **C. Não é constraint.** Montar a família aos poucos e gravar etapa sem motor continuam permitidos. A leitura das etapas devolve `pronta` (tem etapas e
  TODAS com motor; família sem etapa NÃO está pronta) e `etapas_sem_motor`; a tela mostra. A conferência de execução é `conferirEtapasParaExecutar`
  (`src/utils/atendimentos-ia-etapas.ts`), que recusa nomeando cada etapa: *a etapa 2 ("Levantamento de esquadrias") está sem motor: escolha um motor
  para ela*. **Dívida:** nada executa as etapas hoje (a conversa ainda não as lê, é o PR D) — quem passar a executá-las chama a conferência antes.
- **Prova:** `scripts/harness/nome-do-motor-e-arquivar/` — a cadeia real com a `20261029000003` e o estado de produção medido, os casos de cada trava e
  função, duas corridas (gravar etapa × arquivar), três guardas, as duas ordens com a `20261029000004`, e as mutações nas duas passadas.

## Excluir etapa na conta passa a ser permitido — dono do produto, 30/10/2026 (migração `20261031000001`, PENDENTE até o dono do produto aplicar)

Formulação do dono do produto, registrada como está:

> Hoje `superadmin_gravar_etapas_da_materia_prima` recusa: 'a etapa % ("%") nao veio na lista: remover etapa nao e permitido por aqui'. Essa recusa
> SAI. A etapa que não vier na lista é removida, com antes e depois no log, e as demais RENUMERAM para 1..N sem buraco (a numeração aparece na
> conversa e na ordem de execução). A tela ganha o botão de excluir, com confirmação que nomeia o que se perde (rótulo, instrução e motor).

- **A função** (mesma assinatura; o corpo da `20261029000003` com uma mudança): a etapa desta família que não veio na lista é travada e APAGADA, com
  uma linha de log por etapa (o tenant dela; o antes é a linha inteira e `remocao_da_etapa`; o depois é nulo), além do log da lista inteira. As que
  ficam recebem o número da posição: 1..N, sem buraco. A resposta traz `etapas_removidas`. **Lista vazia remove todas** — é o que a regra diz; a
  tela confirma etapa por etapa. Um item inválido na mesma lista desfaz tudo, também a remoção (caso X5).
- **A guarda:** nenhuma FK aponta `orcamentista_familia_etapa` (medido em 31/10/2026). Se alguém passar a apontar, apagar a etapa deixa de ser
  inofensivo, e a migração aborta em vez de seguir.
- **A tela:** as etapas gravadas ganham "Excluir", com confirmação que nomeia o rótulo, a instrução e o motor GRAVADOS (não o rascunho); confirmada,
  a etapa sai do rascunho e não vai na lista ao salvar.
- **O portão de paridade** passou a ler a função da ÚLTIMA migração que a escreve (antes fixava a `20261029000003`, e a `20261029000005` já tinha
  redefinido `superadmin_criar_motor` sem ele ver — `copia-divergente.md`).
- **Prova:** `scripts/harness/excluir-etapa-na-conta/` — a cadeia real até a `20261029000005` e o estado das 3 etapas medido em 31/10/2026, os casos,
  duas corridas (remover × salvar a lista inteira; renomear × remover), duas guardas e as mutações nas duas passadas.

## Saem da tela os campos do Perfil que o motor já traz — dono do produto, 30/10/2026 (sem migração)

Formulação do dono do produto, registrada como está:

> "Eu quero remover também essas indicações aqui de maior usabilidade. [...] a gente já vai estar tendo as informações da tipologia. Tipologia que vai
> trazer todas as relações que nós precisamos. Então, e também vai existir o contexto de conversa." [...] NÃO apague coluna nenhuma nesta rodada.

- **Os campos não são colunas de `orcamentista_esquadrias_base`** (medido em 31/10/2026): são linhas de `orcamentista_categoria_campo` (categoria PERFIL),
  e o valor mora em `orcamentista_mp_categoria.config`. `esquadrias_base`/`_padrao` já tinham saído da tela em 23/10/2026.
- **Saíram da tela e da gravação** (`CAMPOS_FORA_DA_TELA`, `src/lib/atendimentos-ia/base-de-conhecimento.ts`): Linha, Cor predominante, Barra (mm),
  Solda e Custo das barras. A tela não os mostra (`camposDa`), e as rotas `/categoria` e `/arvore` os recusam com frase, antes da função. A definição no
  catálogo de campos e o valor gravado FICAM (a gravação faz merge); apagar é migração à parte.
- **NÃO saíram, e estão com o dono do produto: Cores que trabalha e Serra (mm).** O cálculo da conversa os lê do `config` (`lerCoresDaEmpresa` valida a cor
  do perfil e lê o motor por ela; `lerSerra` alimenta o agrupador de barras). A premissa "os campos da tela são cópia manual do motor" vale para o VALOR,
  não para quem lê: tirar os dois da tela deixaria o cálculo dependendo de um valor que ninguém mais edita. E a `cor` do motor não é lista de cores
  (`a-coluna-que-parece-enumeracao.md`: 16 valores que não são cor), então "as cores vêm do motor" pede uma decisão de como filtrar.
- **Dívida:** o combobox de Linha (as linhas da tabela em uso, os avisos de "sem fórmula" e "fora da tabela", e as consultas de `linhas_por_fornecedor` no
  GET da árvore) ficou sem campo que o use. Sai junto com a migração que apagar a definição de Linha.

## A etapa vira item de catálogo — dono do produto, 31/10/2026 (migração `20261031000002`, PENDENTE até o dono do produto aplicar; pressupõe a `20261031000001`)

Formulação do dono do produto, registrada como está:

> "Vamos criar a aba das etapas para que a gente consiga partir dela, alimentar ela, fazer as integrações, as divisões corretas, informando onde vai
> cada coisa, para depois a gente alinhar isso." E: "O apanhado, o levantamento, a definição de cada etapa, qual motor vai ser colocado, eu vou
> determinar manualmente. Eu quero que você crie somente a sessão." [...] NÃO INVENTE ETAPA NENHUMA. [...] As abas "dizem o que a etapa CARREGA do
> motor: técnico, igual para toda empresa. O que varia por empresa é a INSTRUÇÃO, que fica na conta."

- **`orcamentista_etapa_catalogo`** (global, sem nicho): nome NOT NULL de 1 a 60 sem espaço nas pontas, **único sem olhar a caixa** (índice em
  `lower(nome)`; a função dá a frase), `acao` da lista fechada, `abas` da planilha (as mesmas CHECK que a etapa tinha), `ordem` (>= 1, única),
  `criado_por`, `criado_em`. RLS e grants **espelhados de `orcamentista_motor`** — medidos em produção em 31/10/2026 e conferidos pelo `$verifica$`
  contra o catálogo do banco (políticas e privilégios iguais, por `EXCEPT` nos dois sentidos), não contra o texto do arquivo.
- **A etapa da conta** ganha `etapa_catalogo_id uuid NOT NULL` → catálogo `ON DELETE RESTRICT` e **perde `rotulo`, `acao` e `abas`** (com as três
  CHECK). `instrucao`, `numero`, `motor_id` e `motor_familia_exigida` ficam. A conta **seleciona**, não renomeia.
- **O semeio (opção b, escolhida pelo dono do produto):** as 3 etapas gravadas por ele em 31/10/2026 às 14:57:47 UTC sobem **exatamente como estão** —
  nome = rótulo, ação e abas literais, um item por (rótulo, ação, abas), na ordem do menor número; `criado_por` nulo (quem criou o item foi a migração;
  o log diz de que etapas ele veio). O "fabricaçãoprodução" fica: corrigi-lo é trabalho do dono do produto, na tela. Duas etapas com o mesmo nome sem
  olhar a caixa e conteúdo diferente **abortam** (escolher qual vale não foi autorizado); iguais em tudo viram um item só. Contagens antes e depois e
  uma linha de log por item e por etapa; aborta se não fecharem.
- **Funções** (SECURITY DEFINER, `search_path` fixo, só `service_role`, log, trava de aviso): `superadmin_criar_etapa_do_catalogo` (no fim da lista),
  `superadmin_editar_etapa_do_catalogo` (nome, ação e abas, também **com uso** — o item é o mesmo para toda conta que o seleciona; a tela avisa quantas
  etapas a mudança alcança), `superadmin_remover_etapa_do_catalogo` (em uso é **recusa nomeada**, empresa / família / etapa N, até dez e "e mais N";
  nunca cascata). A gravação das etapas da conta recebe `etapa_catalogo_id` no lugar de rótulo, ação e abas (com `FOR SHARE` no item: remover espera
  e vê o uso), e a remoção da etapa da conta (a `20261031000001`) continua. `superadmin_arquivar_motor` lê o rótulo do catálogo; a lista
  `etapas_sem_motor` mantém a chave `rotulo`.
- **A guarda** confere pelo md5 do corpo que substitui o que foi lido: a gravação das etapas tem de ser a da `20261031000001` (`bc74a15d…`) e o arquivar
  a da `20261029000005` (`a6219d0a…`). Por isso a ordem acordada: aplicar a `20261031000001` → mergear o #200 → mergear o #201 → esta.
- **Na tela:** a quarta aba do nicho, **Etapas**, depois de Motores — criar, renomear/editar e remover, com quem usa cada item. Na base de
  conhecimento, a etapa é **escolhida de uma lista** (o catálogo); somem os campos de rótulo e de ação, e as abas aparecem só para leitura.
- **O mesmo item em duas etapas da mesma família é PERMITIDO** — decisão do dono do produto, 31/10/2026, registrada como foi dita: "CONFIRMADO que
  o MESMO item do catálogo de etapas PODE aparecer em duas etapas da mesma família. [...] a instrução (o prompt) continua morando na conta, então
  'Confirmar' pode aparecer duas vezes no mesmo fluxo com textos diferentes — uma depois do apanhado, outra depois do levantamento." **Não há
  unicidade (família, item)** — nem no banco nem na rota —, e quem acrescentar uma trava dessas contraria esta decisão.
- **DÍVIDA — o catálogo de etapas não tem nicho**, como o de famílias (seção de 29/10/2026, item 2): a lista é a mesma em todos os nichos, e a aba diz
  isso (`AVISO_DA_ETAPA_GLOBAL`). Quando houver etapa de outro nicho, mede-se e propõe-se.
- **Cores e Serra** ficaram fora deste PR (dono do produto, 31/10/2026): trocar a fonte para o motor é mudança de cálculo, e a coluna `cor` do motor não é
  só cor (16 dos 72 valores não são — `a-coluna-que-parece-enumeracao.md`).
- **Prova:** `scripts/harness/etapa-no-catalogo/` — a cadeia real até a `20261031000001` e o estado das 3 etapas de 31/10/2026, a migração duas vezes,
  os casos de cada trava e função, duas corridas (remover o item × gravar a etapa que o aponta, nos dois sentidos), cinco guardas, o semeio de etapas
  iguais, e as mutações nas duas passadas.

## O catálogo é soberano nas quatro seções — dono do produto, 31/10/2026 (migração `20261031000003`, aplicada e conferida em produção em 01/11/2026; pressupõe a `20261031000002`)

Formulação do dono do produto, registrada como está:

> "A remoção é soberana. O departamento de motores, de famílias, de categoria, de fornecedores que tem ali, ele é soberano quanto ao resto. Família,
> fornecedor, motor e etapa. Isso é soberano dentro do catálogo." E: "a instrução para quando não houver ou houver uma falta dentro dessas quatro
> categorias [...] é importante que ela reporte como um erro, solicitando que veja a configuração."

**Substitui as recusas por uso** de remover família (`20261029000004`, `superadmin_remover_familia`) e de remover etapa do catálogo (`20261031000002`,
`superadmin_remover_etapa_do_catalogo`): as duas funções saem, e as seções acima que dizem "remover em uso é recusa nomeada" valem só para a época delas.

- **A. Remover é ARRASTO DECLARADO E CONFIRMADO**, numa rota só (`/api/super-admin/atendimentos-ia/catalogo/remover`):
  1. a rota **mede antes, sem apagar** (`superadmin_arrasto_do_catalogo`): por passo, a quantidade e até 10 nomes ("e mais N"); o que **fica** (Storage,
     texto `fornecedor_perfil`, categorias da conta); os **avisos**; os **impedimentos**; e a **assinatura** (md5 das quantidades por passo);
  2. a tela (`RemocaoDoCatalogo`) mostra tudo e exige a **confirmação explícita** (a caixa marcada; o corpo leva `confirmo: true` e a assinatura);
  3. só então `superadmin_remover_do_catalogo` trava o que sai, **mede de novo e recusa se a assinatura mudou** (40001 → a tela mostra o arrasto novo e
     pede a confirmação de novo), e apaga **explicitamente, em ordem** (filhos antes dos pais), numa transação, **logando cada linha** no
     `superadmin_alteracao_log` (a linha inteira em `antes`, `depois` nulo no que sai, o tenant de quem era dela; o que perde o vínculo tem antes e depois).
  4. A medição e a remoção leem a **mesma lista de passos** (`orcamentista_arrasto_passos`): o que a tela mostra é o que a função apaga. Cada passo
     confere o `ROW_COUNT` contra o que mediu, e no fim **cada tabela alcançada tem de ter perdido exatamente o que os passos dela apagaram** — aborta se
     não (prova contra uma linha que some no meio ou sai por cascata sem log).
- **AS FKs CONTINUAM COMO ESTÃO. Nenhuma vira CASCADE.** Medido no harness: algumas FKs **de antes** já são CASCADE (o conteúdo do motor → a tabela; as
  categorias da conta → a matéria-prima; a ligação → o motor) ou SET NULL (o item e a etapa → a ligação; o item → a tabela). Ficam assim; os passos
  apagam/soltam os filhos antes, e a conta das tabelas prova que nenhuma cascata agiu sem log. A **guarda do fecho** aborta a migração se uma tabela
  nova passar a apontar uma tabela de onde se apaga sem estar nos passos.
- **C. DOCUMENTO DE CLIENTE NÃO É ARRASTADO (trava inegociável).** O item de levantamento **fica e perde o vínculo** (família, motor e
  `motor_familia_exigida`, tabela → nulo), com antes e depois no log. O `$verifica$` aborta se algum passo tiver documento de cliente com ação `sai`.
- **O que cada remoção leva** (decisões do dono do produto, 31/10/2026):
  - **família:** a matéria-prima da conta **fica, sem tipo** (as etapas dela saem; as categorias e os dados ficam); a tabela de **PERFIL** da família **sai
    junto** (com os itens e o conteúdo); a de outra categoria só **perde a família**; o motor cuja **única** família é a removida **sai junto** (o de várias
    só perde a ligação); as ramificações e a família do catálogo saem;
  - **fornecedor:** as tabelas dele (itens, conteúdo de motor por `tabela_id`, importações, `conta_tabela`), os motores dele (com o conteúdo), as ligações,
    e o vínculo de conta (`mp_categoria_fornecedor`); as etapas que apontavam o motor ficam sem motor;
  - **motor:** o conteúdo e as importações dele, as ligações; as etapas ficam sem motor; a tabela e o fornecedor ficam. **Arquivar e Remover coexistem**
    (D): arquivar não apaga; remover vale também para o motor arquivado;
  - **etapa do catálogo:** as etapas de conta que a usam saem, e as de baixo **renumeram** 1..N, com antes e depois no log.
  - **Ficam, só listados no arrasto (decisão 5):** os arquivos do Storage (nada é apagado do bucket) e o texto `fornecedor_perfil` de
    `esquadrias_base`/`_padrao`.
- **Decisão 4 — remover o fornecedor Wolf Perfis é PERMITIDO hoje, antes do PR D, COM AVISO EXPLÍCITO** na confirmação: a conversa da empresa que usa a
  tabela `72366020` **PARA de funcionar até ser reconfigurada**, porque a conversa ainda lê o motor pela tabela, não pelo catálogo. Não é exceção nem
  recusa: é aviso (`conversa_para`, com as empresas e a tabela). **ESTE AVISO SAI QUANDO O PR D ENTRAR** (a conversa passa a ler o motor pelo catálogo);
  quem escrever o PR D tira o aviso da função e da tela (`fraseDoAviso`). **REVISTO pelo dono do produto em 02/11/2026, no pedido do PR D:** "Não mexa
  [...] na função do arrasto nem no texto do aviso conversa_para — ficam como estão." O aviso FICOU; o texto dele (a conversa lê o motor pela tabela)
  deixou de descrever o código — ver a seção do PR D.
- **O impedimento (não é uso, é conflito):** na família, a tabela de outra categoria que perde a família e é **vigente** colidiria no índice
  `orcamentista_tabela_uma_vigente` com outra vigente do mesmo fornecedor e categoria sem família. A medição nomeia as tabelas e a remoção recusa (23505)
  antes de apagar. Medido em 31/10/2026: nenhuma tabela vigente em produção — o impedimento não aparece hoje. **Leitura do assistente, relatada no PR:**
  escolher qual das duas fica vigente não foi autorizado.
- **E. A falta de configuração é ERRO que nomeia o que falta e manda ver a configuração.** `conferirEtapasParaExecutar(etapas, contexto)` recusa, uma
  frase por falta, na ordem: **família** sem tipo (removida do catálogo ou nunca escolhida), **etapa** (família sem etapas), **motor** (cada etapa sem
  motor), **fornecedor** (cada categoria da família sem fornecedor). A rota das etapas da conta devolve `erros_de_configuracao`, e a tela mostra o erro
  (e não mostra "pronta" enquanto houver falta).
  **O FORNECEDOR É COBRADO EM TODAS AS CATEGORIAS** que a família declara como ramificação — decisão do dono do produto, 31/10/2026, registrada como foi
  dita: "Sim deve reclamar que está faltando fornecedores." Falta é a categoria **sem nenhum fornecedor vinculado** (ou que nem foi criada na conta),
  cada uma com a sua frase. Medido em produção em 31/10/2026: a De Paula tem fornecedor só em PERFIL (Wolf Perfis) e VIDRO (Estrela); PERSIANAS, REFORCO,
  FERRAGENS, ACESSORIOS_VEDACAO e INSTALACAO estão com zero — **hoje a conferência acusa cinco faltas, e isso é o esperado, não defeito.**
- **REQUISITO SEGUINTE, registrado e NÃO implementado (dono do produto, 31/10/2026):** o fornecedor de cada categoria vira uma **lista hierárquica com
  busca em cascata** — "o fornecedor Celsius, ele fica como primeiro, o fornecedor Roto como segundo e o fornecedor Detone como terceiro [...] não havendo
  o insumo dentro da tabela da Celsius, ele vai consultar a tabela da Roto [...] a ordem é muito importante." A estrutura (`ordem`, N por categoria) já
  existe em `orcamentista_mp_categoria_fornecedor`; faltam a tela (vários e ordenar) e o cálculo (procurar na ordem, parar no primeiro que tiver). Trabalho
  próprio, depois da medição pedida.
- **Prova:** `scripts/harness/catalogo-soberano/` — a cadeia real com a `20261031000002` e o estado de produção medido em 31/10/2026 (os ids reais), a
  migração duas vezes, 22 casos (cada arrasto, a trava C pelos três caminhos, o log linha a linha, a assinatura, o impedimento, a linha que some no
  meio e a que sai por cascata), 3 corridas (gravar etapa × remover motor nos dois sentidos; duas remoções do mesmo item), 3 guardas, a prova de volume
  (`30_volume.sh`: ~125 mil linhas em ~5 s, limite da função 80 s) e as mutações nas duas passadas.

## A tabela de fornecedor entra na soberania do catálogo — dono do produto, 01/11/2026 (migração `20261101000001`, PENDENTE até o dono do produto aplicar; pressupõe a `20261031000003`)

Formulação do dono do produto, registrada como está:

> "definido em regra que essa mensagem não pode acontecer. Se for excluído, deve ser excluído, permitir a exclusão. Depois, ele só não vai calcular.
> Então, ele deve permitir que eu faça exclusão de tabelas dentro de fornecedores."

**A recusa "A tabela está em uso e não pode ser excluída" NÃO PODE MAIS ACONTECER.** O DELETE de `/api/super-admin/atendimentos-ia/tabelas/[id]` saiu
(405), com `fraseDaTabelaEmUso`, `contasQueUsamATabela` e `excluirTabela`. A tabela é a **quinta raiz** do arrasto (`tipo: 'tabela'`), pela mesma rota
(`catalogo/remover`), a mesma tela (`RemocaoDoCatalogo`, aberta pelo botão Remover da linha na página do fornecedor) e **os mesmos passos**
(`orcamentista_arrasto_passos`), sem caminho novo — desenho aprovado pelo dono do produto: "reaproveitar os passos, sem caminho novo".

- **O que sai com a tabela:** os itens de preço, o conteúdo de motor gravado por `tabela_id` (as 13 tabelas), as importações e a
  `orcamentista_conta_tabela`. **O item de levantamento fica e perde a tabela** (`tabela_id` nulo; o motor e a família dele ficam) — a trava C.
- **O que NÃO sai:** o motor do catálogo (tem cópia própria, por `motor_id`), as ligações, as etapas (não perdem o motor), o fornecedor e as outras
  tabelas dele.
- **OS ARQUIVOS DO BUCKET FICAM** (dono do produto, 01/11/2026: "Apagar objeto de Storage é irreversível e fora da transação"), só listados no arrasto,
  como a decisão 5 das outras quatro raízes. **Vale também para o `motor_path` que a `72366020` divide com o motor `9a233c55`: esse não sai em hipótese
  nenhuma.**
- **A ORDEM — a remoção da tabela é PERMITIDA antes do PR D, com o aviso obrigatório** (dono do produto, 01/11/2026). Se a tabela tem motor (tipologias
  importadas), a confirmação mostra o aviso `conversa_para`: a conversa da empresa que a usa **PARA** (hoje vale para a `72366020`, usada pela De Paula).
  **ESTE AVISO SAI QUANDO O PR D ENTRAR** (a conversa passa a ler o motor pelo catálogo) — quem escrever o PR D tira o aviso da função e da tela
  (`fraseDoAviso`), também para o tipo `tabela`. **REVISTO em 02/11/2026: o aviso fica como está** (ver a seção do PR D).
- **Medido em produção em 01/11/2026 (só leitura):** 17 FKs apontam `orcamentista_tabela` (`conta_tabela` RESTRICT, `levantamento_item` SET NULL, o resto
  CASCADE; nenhuma fora dos passos). A `72366020` tem 735 itens, 62.295 linhas de conteúdo (164 tipologias), 4 importações, 1 `conta_tabela` e 0 itens de
  levantamento; o motor `9a233c55` tem as suas 12.116 regras e os 164 tempos por `motor_id`, e não muda.
- **Prova:** `scripts/harness/tabela-soberana/` — a cadeia real com a `20261031000003` e o estado de produção, a migração duas vezes, 8 casos próprios mais
  a regressão inteira da `catalogo-soberano`, 2 corridas (duas remoções da mesma tabela; tabela × fornecedor medido antes, 40001), 3 guardas e o
  contraste delas (36/36), o volume (`30_volume.sh`: a `72366020` com ~62 mil linhas em ~3 s, e as regras do motor intactas) e 15 mutações, mortas nas
  duas passadas.
- **A guarda compara os corpos SEM o `\r`.** Medido em 01/11/2026: os corpos da `20261031000003` em produção têm `\r` (foi aplicada pelo Editor, em
  CRLF — 93 no dos passos, 116 no da remoção); sem o `\r`, os cinco md5 são os do arquivo. O contraste `aceita 1` aplica a `20261031000003` em CRLF e
  prova que a guarda aceita; a mutação G3 (comparar com o `\r`) o derruba.


## "Subido em" é o momento do arquivo, não o da linha — dono do produto, 01/11/2026 (migração `20261101000002`, PENDENTE até o dono do produto aplicar)

Formulação do dono do produto, registrada como está:

> "onde está escrito subido em, foi alterado agora, então ele deveria pegar o exato momento, não o dia que foi criado."

**O defeito era de dado, não de tela.** A `orcamentista_tabela` só tinha `criado_em`, e a troca de arquivo (PATCH de `tabelas/[id]`) é um UPDATE que não
gravava data. A `21acfa75` foi criada em 29/10/2026 às 19:26 UTC e teve o arquivo trocado em 01/11; a tela mostrava 29/10.

- **`arquivo_em timestamptz NOT NULL DEFAULT now()`**, mantida pelo **banco** (gatilho `orcamentista_tabela_arquivo_em`), por qualquer caminho:
  na criação, `arquivo_em = criado_em`; na troca de `arquivo_path`, o instante da troca; em qualquer outro UPDATE (vigência, família, motor, o arrasto
  que tira a família), fica como estava — **não se escreve à mão** (fato histórico: `fato-vs-referencia.md`). Só o `arquivo_path` conta: o `motor_path`
  da tabela é legado e não é "Subido em".
- **O semeio (dono do produto, 02/11/2026: "SEMEIE PELO STORAGE"):** cada linha de antes recebe o **envio do objeto do arquivo atual** no Storage
  (`storage.objects.created_at`, bucket `atendimentos-ia`, nome = `arquivo_path`); `criado_em` **só como reserva**, para a tabela cujo objeto não está
  lá. **Uma linha de log por tabela** no `superadmin_alteracao_log` (antes sem `arquivo_em`, depois com ele, e `origem_de_arquivo_em`, que diz qual
  dos dois). Reaplicar não semeia nem loga de novo. Medido em 02/11/2026: a `21acfa75` fica com **01/11 21:08:19 UTC** (o arquivo trocado); a IMAB
  (`fe2c6667`) com 28/10 16:24:39 (o envio, 2 s antes da linha); a Estrela (`arquivo_path` vazio, sem objeto) com o `criado_em`. A primeira versão
  semeava só com `criado_em` ("é a melhor aproximação que existe"); a medida do Storage a superou antes de a migração ser aplicada.
- **Tabela criada depois da migração:** o gatilho dá `arquivo_em = criado_em` (a linha), não o envio do objeto, que acontece segundos antes. A
  diferença é de segundos e só vale para o arquivo de criação; a troca de arquivo grava o instante da troca.
- **O aborto de 02/11/2026, na verificação 3 (nada foi alterado):** a versão `102a8c59…` revogava a função do gatilho só `FROM PUBLIC`. Em produção,
  o que o `postgres` cria no schema `public` dá EXECUTE a `authenticated` e `service_role` por **privilégio padrão** (`pg_default_acl`, medido: grant
  próprio, não herdado de PUBLIC; o do `supabase_admin` dá também a `anon`), e o REVOKE de PUBLIC não os alcança. A verificação 3 pegou; o harness
  não, porque o Postgres local não tinha esse privilégio padrão. Corrigido para `FROM PUBLIC, anon, authenticated`, como as outras migrações
  (`5fce5f31…`); o harness passou a reproduzir o privilégio padrão de produção e o **contraste 2** prova que o REVOKE só de PUBLIC aborta com a
  frase da verificação 3 — e que, sem o privilégio padrão, o contraste falha (o harness de antes não via o defeito).
- **A tela mostra data e hora** (dono do produto, 02/11/2026: "É o que 'exato momento' quer dizer"): `dd/mm/aaaa hh:mm`, no fuso de quem olha
  (`dataEHoraBR`).

## A lista de tabelas do fornecedor é UM CARTÃO POR TABELA — dono do produto, 02/11/2026 (sem migração)

Formulação do dono do produto, registrada como está:

> "eu estou vendo muito mal distribuído por coluna. Eu acho que nós temos que fazer as colunas se tornarem linhas. E aí cada discriminação tendo a sua
> descrição. [...] Cada fornecedor, que vai ter uma tabela, vai ser uma célula."

- A grade de nove colunas saiu da página do fornecedor (`fornecedores/[id].tsx`). Cada tabela é um cartão (`CartaoDaTabela`): o **nome do arquivo** em
  destaque no topo, inteiro; dentro, as **mesmas sete** informações, cada uma numa linha com o rótulo à esquerda e o valor à direita — motor · família ·
  categoria · vigente · vigência (nota) · subido em · contas usando (`CAMPOS_DO_CARTAO`); **Importação, Editar e Remover** no rodapé.
- **"NÃO acrescente informação nova: as mesmas sete, mais nada."** O portão (`atendimentos-ia-cartao-da-tabela.test.tsx`) confere a lista contra o
  pedido escrito no teste, não contra a constante, e que o texto do cartão é só o título, as sete linhas e os três botões.
- **Janela estreita:** a linha quebra (o valor desce para baixo do rótulo), o valor quebra em qualquer ponto (`overflowWrap: 'anywhere'`), os botões
  quebram de linha, e a grade de cartões nunca pede mais que a largura da tela (`minmax(min(100%, 22rem), 1fr)`).
- **Prova:** `scripts/harness/arquivo-em/` — a base da `tabela-soberana` (com a `20261101000001`), o estado de produção de 01/11 depois das 21:08 (a
  `72366020` removida pelo arrasto, os `criado_em` reais e os objetos do Storage, com um de mesmo nome em outro bucket), a migração duas vezes, 8 casos,
  a regressão das duas suítes do arrasto, o contraste da reaplicação e o da verificação 3 (40/40); 20 mutações mortas nas duas passadas.

## A conversa lê o motor pela FAMÍLIA, não pela tabela — PR D, dono do produto, 02/11/2026 (sem migração)

Formulação do dono do produto, registrada como está (o pedido inteiro está no corpo do PR):

> "1. ORIGEM DA FAMÍLIA — Família(s) da conta = orcamentista_materia_prima da conta (campo família), distintas. 1 família: é ela, sem perguntar. 2+:
> junta as tipologias dos motores de cada família e a IA pergunta de qual é [...]. 0: erro de configuração, não cai na família da tabela.
> 2. ORIGEM DO MOTOR — família -> orcamentista_familia_etapa (familia, numero) -> motor_id. [...] 3. ORIGEM DO PREÇO — O preço do código continua vindo
> das tabelas VIGENTES da(s) família(s) da conta, todas as categorias [...]. Código sem preço: reporte o código sem valor, nunca estime nem oculte.
> 4. ERRO EXPLÍCITO, nunca fallback e nunca voltar a ler por tabela_id [...] Padrão: 'Falta de configuração — <o que falta>: verifique o catálogo em <seção>'."

E as respostas dele às perguntas do PR (02/11/2026): a família pela **base de conhecimento**; **vigente = a regra atual** (sozinha no grupo vale sem a
marca; com 2+, só a marcada; nenhuma marcada é `SEM_VIGENTE`); as tabelas de preço são as **vinculadas + "qualquer linha"** (família da conta ou nula);
código **sem preço** mantém a recusa nomeada; código **em duas tabelas** mantém `ITEM_EM_DUAS_LINHAS`; o item grava **`familia` e `motor_id`**; a mesma
família com motores diferentes na mesma etapa é **erro de configuração**.

- **A família e o motor:** `src/lib/atendimentos-ia/motor-da-familia.ts` (`lerMotoresDaConta`): as famílias distintas de `orcamentista_materia_prima`, as
  etapas 1 (Gerar o levantamento) e 2 (Calcular as barras e os materiais) de cada instância, e o motor de cada etapa. A lista de tipologias é a do motor
  da etapa 1; as abas, as regras, o tempo e a mão de obra do cálculo são do motor da etapa 2. **Tudo por `motor_id`**; a conversa não lê mais conteúdo de
  motor por `tabela_id` em ponto nenhum (nem como reserva).
- **O preço:** `orcamentista_tabela_item` continua por `tabela_id`, das tabelas que `derivarTabelasDaConta` deriva e que valem para a família.
  `tabelas-da-conta.ts` virou só PREÇO: não conta mais tipologia de tabela nenhuma (`tipologias`/`comMotor` saíram).
- **Os erros, cada um com a frase do padrão:** `SEM_FAMILIA`, `SEM_ETAPA`, `ETAPA_SEM_MOTOR`, `MOTOR_ARQUIVADO`, `MOTOR_SEM_CONTEUDO` (0 tipologias por
  `motor_id`), `MOTORES_DIVERGENTES`, `SEM_TABELA_VIGENTE`; e, de antes, `PERFIL_SEM_TABELA`, `SEM_VIGENTE` e `SEM_LISTA_DE_TIPOLOGIAS`.
- **A esquadria grava** `familia`, `motor_id` (o motor do cálculo, o da etapa 2) e `motor_familia_exigida` = `familia` (as CHECKs da tabela);
  `tabela_id` não é lido nem escrito pela conversa. A cada gravação a família e o motor são resolvidos de novo (`resolverFamilias`): a etapa que troca de
  motor leva a esquadria ao motor novo.
- **MUDOU, e é efeito da decisão, não descuido:** como toda tabela da família é preço, duas tabelas de PREÇO no mesmo grupo (fornecedor, família,
  categoria) e nenhuma vigente passam a recusar `SEM_VIGENTE` — antes ficavam fora da conversa e não recusavam.
- **Não mudou, de propósito (o pedido):** `motor_path`/`motor_nome`, a função do arrasto e o texto do aviso `conversa_para`; a execução de etapa pela
  `acao` do catálogo (o fluxo fixo continua). **Leitura do assistente, relatada no PR:** a decisão C de 29/10 ("a família só funciona com todos os
  motores") não é conferida aqui — o PR D confere as etapas 1 e 2, como o pedido; a família com uma etapa 3 sem motor conversa. Medido em 02/11/2026: a
  De Paula só tem as etapas 1 e 2, as duas com motor.
- **Medido em produção em 02/11/2026 (só leitura):** as 12.116 regras e as 164 tipologias e tempos do `9a233c55` têm `motor_id` e **nenhuma** tem
  `tabela_id` — a leitura antiga por `tabela_id` não achava nada. A `72366020` não existe mais. As cinco abas da DP-02 do motor têm o md5 das da fixture
  dos testes. Com o PR D, a DP-02 da De Paula **recusa nomeando 1023, 8432 e 8433**: os três estão no motor e em nenhuma tabela de preço do catálogo
  (o portão `(1p)` de `levantamento-da-conversa.test.ts` reproduz isso).


## A categoria ganha tela: criar, renomear e remover, a sexta raiz da soberania — dono do produto, 02/11/2026 (migração `20261102000002`, PENDENTE até o dono do produto aplicar; pressupõe a `20261031000003` e a `20261101000001`)

Formulação do dono do produto, registrada como está:

> "Hoje as categorias (orcamentista_categoria_catalogo: PERFIL, PERSIANAS, REFORCO, FERRAGENS, ACESSORIOS_VEDACAO, VIDRO, INSTALACAO) não têm tela
> [...] Quero criar, renomear e remover categoria, como já faço com etapa." E: "a aba Categorias fica logo DEPOIS de Famílias, ou seja, a ordem das
> abas do catálogo passa a ser: Famílias, Categorias, Fornecedores, Motores, Etapas."

**As três decisões do dono do produto, registradas como foram ditas:**

1. > "SIM — renomear é só o rótulo; a chave é imutável, como na família. A tela deve dizer isso quando o usuário tentar editar a chave."
   A chave nasce derivada do nome (`chaveDaCategoria`, a mesma regra da família: maiúscula, sem acento, `_`, até 40) e aparece antes de salvar;
   `superadmin_editar_categoria(p_por, p_chave, p_rotulo)` só recebe o rótulo; `chave` no corpo do POST ou do PATCH é recusa com a frase
   `CHAVE_DA_CATEGORIA_NAO_MUDA`; na tela, a chave aparece travada e tocá-la mostra a frase. A estrutural também renomeia — dela só a remoção é recusada.
2. > "ARRASTA, como nas outras raízes. A remoção leva mp_categoria e o que pende dela, mas o arrasto tem de listar isso NOMEANDO CADA EMPRESA e a
   > contagem por empresa antes de confirmar, e a remoção recusa se a assinatura mudou. Configuração de conta não é documento de cliente, então a trava C
   > não se aplica; o que protege aqui é o arrasto declarado. Nunca apague sem exibir a lista."
   O tipo `categoria` entra em `orcamentista_arrasto_passos` com **43 passos**: o item de levantamento perde o motor e a tabela (documento de cliente —
   a trava C continua valendo para ele); a etapa de conta fica sem motor; o conteúdo dos motores e das tabelas da categoria, as importações, os itens, a
   `conta_tabela`, as ligações, os motores e as tabelas saem; depois **a base de conhecimento das contas** — `mp_categoria_fornecedor`, `mp_vidro`,
   `mp_ferragem`, `mp_instalacao`, `mp_categoria` (filtradas pela categoria da família de conta, cada linha nomeando a empresa) —, os
   `categoria_campo`, as `familia_ramificacao` e a linha do catálogo. A medição devolve a chave nova **`empresas`**: por tenant, a empresa e a contagem de
   categorias de conta, fornecedores escolhidos, vidros, ferragens e instalações que saem — a lista inteira, não dez nomes —, e a confirmação a mostra
   em "Por empresa" antes da caixa. Nos outros cinco tipos, `empresas` é `[]`. A assinatura, a trava da linha, a conferência por passo e a conta das
   tabelas contra cascatas são as da `20261031000003`.
3. > "SIM — PERFIL, VIDRO, FERRAGENS e INSTALACAO têm remoção RECUSADA nesta PR, com motivo nomeado dizendo que são estruturais no código e no banco.
   > Mudança de código para destravá-las fica para outra PR. Criar categoria nova e remover categoria não estrutural é livre."
   `orcamentista_categorias_estruturais()` devolve as quatro; a medição delas traz o impedimento `categoria_estrutural`, e `superadmin_remover_do_catalogo`
   recusa com **23514** (`check_violation`) e a frase "a categoria X e estrutural: o codigo e o banco dependem da chave dela (CHECKs e funcoes). Nada foi
   removido." — a rota trata o 23514 como o 23505: 409 com a frase, medida de novo. Na tela, o Remover delas vem desligado, com o motivo. **Por que são
   estruturais (medido em 02/11/2026):** no código, `CATEGORIA_QUE_EXIGE_FAMILIA = 'PERFIL'`, `CAMPO_DA_LINHA` (`arvore.ts`), `repositorio.ts:175`,
   `levantamento-da-conversa.ts:148,454`; no banco, as CHECKs `orcamentista_tabela_familia_no_perfil`, `mp_vidro_categoria_vidro`,
   `mp_ferragem_categoria_ferragens`, `mp_instalacao_categoria_instalacao`, as funções `superadmin_gravar_mp_vidros/ferragens/instalacao` e a
   `orcamentista_arrasto_conjuntos` (a tabela de PERFIL da família). `CATEGORIAS_ESTRUTURAIS` no código é conferida contra a função da migração pelo teste.

**O que mais a migração faz:** as CHECKs `orcamentista_categoria_catalogo_chave_forma` (`^[A-Z][A-Z0-9_]{0,39}$`) e `_rotulo_forma` (aparado, 1 a 60),
com guarda que aborta nomeando a linha que fugir da forma; `superadmin_criar_categoria(p_por, p_chave, p_rotulo)` (ordem = última + 1 sob trava de
aviso; chave e nome repetidos sem caixa são recusa 22023; log com tenant nulo); o fecho do arrasto passa a conhecer `orcamentista_mp_categoria` e
`orcamentista_categoria_campo`; a guarda confere por md5 os cinco corpos do arrasto como estão em produção, e a verificação aborta se os passos dos cinco
tipos de antes mudarem, se os 43 da categoria não forem os esperados na ordem, se um documento de cliente sair, ou se uma FK mudar.

**A tela:** `categorias-do-catalogo.component.tsx`, na aba Categorias do nicho; GET `/categorias` continua a lista leve do modal de tabela e ganha
`estrutural`; `?usos=1` traz quem usa (tabelas, motores, famílias, empresas); POST cria; PATCH `/categorias/[chave]` renomeia; remover é a rota
`catalogo/remover` com `tipo=categoria`. O catálogo é GLOBAL, como famílias e etapas (a mesma dívida do nicho).

**Prova:** `scripts/harness/categorias-do-catalogo/` — a base da tabela-soberana + o privilégio padrão + a `20261101000002` + a `20261102000001` + o
catálogo de campos como em produção (`09_estado.sql`) + a tabela de persianas (`09_persianas.sql`), a migração duas vezes, 14 casos (os 43 passos, a
medição por empresa, as quatro estruturais recusadas, a remoção de PERSIANAS e de REFORCO com o log linha a linha e as outras intactas, a assinatura,
a categoria com motor e etapa, criar e editar com cada recusa, as CHECKs), a regressão dos 22 + 8 casos das duas migrações de antes, 4 corridas, 3
guardas e 31 mutações nas duas passadas (a mutação do GRANT da remoção era equivalente — o CREATE OR REPLACE preserva a ACL — e foi trocada; está anotada no `mutacoes.py`).

**Aparição de 02/11/2026 — a migração colada no projeto errado.** A primeira tentativa de aplicar abortou com "dependencia ausente [...] (corpos: {})".
O log de postgres mostrou que a colagem foi no SQL Editor do projeto **DAMA-Consultoria** (`azyrbuxvecbohdwrjaqe`), que não tem nenhuma tabela nem função
`orcamentista_*`; no Precifica Certo não houve tentativa. A guarda fez o que devia, mas a frase não dizia onde estava: a guarda passou a conferir
cada função pela **assinatura de entrada** (`to_regprocedure`; os parâmetros OUT de `orcamentista_arrasto_conjuntos` não entram na identidade) e a
nomear, na recusa, o banco, o usuário, quantas tabelas `orcamentista_*` ele tem e, função a função, "não existe" ou o md5 achado contra o esperado
(`guarda 4` do harness: um banco vazio). O mesmo log mostrou o texto colado com CRLF e com os caracteres de caixa (`═`) corrompidos em `ÔòÉ`: a
colagem pelo navegador no Windows reescreve o que não é ASCII. Por isso os comentários **dentro dos corpos `$fn$`** desta migração ficaram em ASCII
(o que entra em `prosrc` fica igual ao arquivo em qualquer colagem); o que está fora dos corpos não vai ao catálogo. É a Parte III de `migracao.md`
(o corpo é o artefato) aparecendo pela codificação, não pelo comentário cortado.

## O bloco tributário do item da tabela — dono do produto, 02/11/2026 (migração `20261102000001`, PENDENTE até o dono do produto aplicar)

Formulação do dono do produto, registrada como está:

> "Hoje orcamentista_tabela_item só guarda ipi e aliquota_interna_pct. Precisa guardar os dois blocos [...] NULL significa 'o fornecedor não
> informou'. 0 significa 'alíquota zero'. Não use DEFAULT 0, não use COALESCE para tratar NULL como 0 em lugar nenhum. [...] Nenhuma coluna
> gerada: custo_liquido é o que veio do arquivo, não um cálculo do banco."

- **As 12 colunas** (numeric, NULL, sem default): o bloco creditável (`cred_icms_pct`, `cred_pis_cofins_pct`, `cred_ibs_pct`, `cred_cbs_pct`,
  `cred_ipi_pct`), o não creditável (`nc_ipi_pct`, `nc_icms_st_pct`, `nc_difal_pct`, `nc_is_pct`) e o resultado (`credito_pct`, `credito_valor`,
  `custo_liquido`). CHECKs: `orcamentista_tabela_item_ipi_de_um_lado` e `orcamentista_tabela_item_percentual_na_faixa` (0 a 100; as duas em R$ fora).
- **A função `importar_conteudo_da_tabela` muda na mesma migração** (decisão do dono do produto, 02/11/2026): ela apaga e regrava os itens com
  lista de colunas fixa, e sem a mudança as 12 nunca chegariam ao banco — e cada reimportação as apagaria (`tabela-que-a-importacao-apaga.md`,
  sinais 1 e 2). Guarda pelo md5 do corpo medido em produção (`c412c59f…`, o da `20261025000004`).
- **O importador** (`src/utils/atendimentos-ia-bloco-tributario.ts` e `lerPreco`) lê as 12 **pelo cabeçalho de cada seção**, com o nome exato; vazio é
  NULL, 0 é 0; texto, data ou erro do Excel **recusam a importação inteira** nomeando cada célula; os dois IPIs e o percentual fora de 0..100 são
  recusados antes de gravar. **O recálculo** (respostas do dono do produto, 02/11/2026): bruto = `custo`; `credito_pct` = soma do creditável;
  `credito_valor` = custo × pct ÷ 100; `custo_liquido` = custo − crédito; os não creditáveis não entram; o IPI vai pelo par (creditável, ou vazio com o
  não creditável preenchido) e os outros quatro são exigidos. Diferença acima de 0,01 é **divergência**: grava o que veio e reporta item a item
  (`bloco_tributario_divergente`); falta de dado é `bloco_tributario_nao_recalculavel`, nomeando o que falta. Resultado vazio no arquivo fica vazio.
- **O cálculo do orçamento e a conversa NÃO leem estas colunas** (o pedido: "só gravação e leitura").
- **Prova:** `scripts/harness/bloco-tributario/` (12 casos e 2 contrastes; 31 de 32 mutações mortas — a sobrevivente, o REVOKE só de PUBLIC na passada
  sem a verificação, não muda nada em produção, porque o `CREATE OR REPLACE` preserva o ACL da função que já existe) e
  `src/utils/__tests__/atendimentos-ia-bloco-tributario.test.ts` (23 mutações do importador, todas mortas).

## O layout ÚNICO da tabela de fornecedor — CABECALHO + ITENS, colunas por nome — dono do produto, 02/11/2026 (sem migração; pressupõe a `20261102000001` aplicada)

Formulação do dono do produto, registrada como está:

> "Hoje o importador procura a aba de preço pelo nome e lê as colunas por posição fixa; por isso o arquivo Reforco_Metalico_-_Wolff.xlsx foi
> recusado com 'não tem a aba Tabela Wolff'. [...] Reconhecer o layout único: aba CABECALHO (categoria, fornecedor, vigencia, regime_tributario,
> uf_origem, moeda) e aba ITENS com cabeçalho na linha 1 e estas colunas, lidas POR NOME [...]. O formato antigo continua funcionando."

E as decisões dele no mesmo dia: **as 28 colunas são obrigatórias**; `valor_barra_interno = custo_bruto` quando `vendido_por = 'barra'` ("é o mesmo
número, não há multiplicação nem cálculo"), senão NULL com aviso — **nunca `valor_metro × medida_barra_m`**; a aba CABECALHO é **só lida e devolvida**
no resultado, sem gravar nem comparar; `segmento` do arquivo vai para a coluna `segmento` do item (a coluna 11 de antes), e a categoria da TABELA é a
do cadastro, não do arquivo; `valor_kg`, `multiplo_compra`, `linha`, `cor` e `codigo_wvetro` **não têm coluna no banco** e ficam fora da gravação
nesta PR (um aviso diz quantas linhas vieram com valor nelas).

- **O caminho é escolhido pela FORMA do arquivo** (`lerTabelaDePreco`): com a aba `ITENS` ou a `CABECALHO` (nome sem olhar caixa nem espaços), é o
  layout único — e a ITENS tem de estar lá; sem as duas, o de antes (aba `ABAS_DA_IMPORTACAO.preco`, colunas `COL_PRECO` por posição), cuja recusa
  passa a dizer que o layout único também não foi achado. A ITENS vence quando as duas abas coexistem.
- **Recusas nomeadas (nada é gravado):** CABECALHO sem ITENS; ITENS sem a coluna `codigo` na linha 1 (cabeçalho não reconhecível); coluna obrigatória
  ausente (cada uma nomeada; o nome é exato, `CUSTO_BRUTO` não é `custo_bruto`); coluna repetida; **texto, data ou erro do Excel em coluna numérica**
  (as 4 de preço/medida e as 12 do bloco — nunca vira 0 nem NULL; o texto numérico brasileiro "1.234,56" é número); `vendido_por` fora de
  `barra`/`unidade` (a CHECK do banco; a caixa não importa); e as do #208 (os dois IPIs, percentual fora de 0..100).
- **O mapa:** `custo_bruto → custo`, `valor_metro → valor_metro_interno`, `peso_kg_por_m → peso`, `segmento → segmento`; `secao`, `descricao`,
  `unidade`, `ncm`, `medida_barra_m`, `vendido_por` e as 12 tributárias diretos. **Ficam NULL** por não existirem no layout: `aliquota_interna_pct`
  (medido em 02/11/2026: **nenhum leitor** no cálculo, na conversa ou nas telas — só o importador escreve; 24 das 509 linhas de produção já a têm
  NULL), `ipi` (a coluna antiga; o IPI agora é `cred_ipi_pct`/`nc_ipi_pct`), `pacote`, `valor_metro_12`, `valor_barra_12`.
- **Avisos novos:** `itens_sem_custo` (o item sem `custo_bruto` entra com `custo` NULL — nunca 0 —, sem valor por barra nem resultado a recalcular),
  `tabela_sem_valor_por_barra` (os vendidos por unidade ou sem `vendido_por`: o total por barra inteira não sai para eles),
  `colunas_sem_destino_no_layout_unico`. O código repetido segue a regra de 20/10/2026 (fica a primeira, aviso em voz alta se os valores diferem).
- **O bloco tributário do #208 vale igual** (`conferirBlocoDoItem`, compartilhado pelos dois layouts). **Medido pelo dono do produto no arquivo de
  PERSIANAS (76 itens):** `credito_pct = 21,25` em todas as linhas; IPI creditável 6,5 em 38, 3,25 em 4, 0 em 8 e vazio em 26 → com a regra do #208 o
  importador reporta **42 divergências e 26 "não recalculável"**, 8 sem aviso, e grava o que veio. **A regra não mudou nesta PR** (decisão dele): se o
  fornecedor exclui o IPI do crédito, a soma do #208 precisa de decisão própria.
- **Prova:** `src/utils/__tests__/atendimentos-ia-layout-unico.test.ts` — as fixtures PERSIANAS (76, como medido) e REFORÇO (18, 8 sem `custo_bruto`),
  as duas formas da aba CABECALHO, cada recusa, e o layout de antes; mutações do leitor (ver o PR).

## Importar ao salvar — dono do produto, 02/11/2026 (sem migração)

Formulação do dono do produto, registrada como está:

> "Hoje 'Salvar tabela' grava o cadastro e a importação é um segundo passo manual, e por isso tabela fica com 0 itens sem ninguém perceber
> (aconteceu com a Reforco_Metalico_-_Wolff.xlsx)." [...] "Recusa do arquivo NÃO pode desfazer o cadastro já salvo: a tabela fica salva e a
> importação aparece como recusada, nomeando o motivo. Salvar sem trocar o arquivo (só família ou vigência) NÃO reimporta. O botão Importar
> continua existindo." E as respostas dele: o resultado aparece na **tela de Importação** (sem duplicar na página do fornecedor); o
> **credenciamento no nicho NÃO importa** ao salvar (N tabelas × 90 s de `maxDuration`); o **cartão** mostra "não importada" com 0 itens;
> "nunca deixe a tela em estado de sucesso sem itens gravados".

- **Medido antes (02/11/2026):** o arquivo já está no Storage ao salvar, nos dois casos (a tela envia pela URL assinada antes do POST/PATCH, e
  as rotas recusam se o objeto não estiver lá); a troca de arquivo na edição só passa com 0 itens (trava de 29/10); a função
  `importar_conteudo_da_tabela` apaga e regrava os itens e o conteúdo do motor por `tabela_id`; e a importação **recusada não deixa registro**
  (`orcamentista_importacao` só recebe linha no sucesso) — é por isso que a Reforço ficou com 0 itens em silêncio.
- **O caminho:** "Salvar tabela" com arquivo — a tabela nova, ou a edição que troca o arquivo — grava e **leva** à tela de Importação da tabela
  com `?importar=1` (`telaDaImportacao(id, true)`); a tela **dispara a mesma importação do botão, uma vez**, tira o parâmetro da URL (recarregar
  não reimporta) e mostra o resultado como sempre. São duas chamadas: a recusa da segunda não toca na primeira. Sem troca de arquivo, a
  edição fica na página e nada é reimportado.
- **"Não importada" é contagem do banco, não da última importação:** `TabelaDoFornecedor.itens` (lista do fornecedor) e `itens` em `/conteudo`
  vêm de `contarItensDaTabela`. O cartão com 0 itens diz "Não importada: nenhum item de preço gravado." abaixo do nome, com "Importar agora"
  (cobre o credenciamento e qualquer caminho futuro que grave sem importar); com itens, nada aparece (é estado, não a oitava informação). A tela
  de Importação mostra o aviso com o motivo — a recusa (inclusive o 504 do limite de tempo), a importação que não deixou item, ou "nunca" — e
  **relê o banco também na recusa**, para nunca afirmar sucesso sem item gravado. Sem a contagem (rota de antes), nada é dito
  (`ausente-vs-falso.md`).
- **Prova:** `src/utils/__tests__/atendimentos-ia-importar-ao-salvar.test.tsx` (os três caminhos da página do fornecedor, o disparo único, a
  recusa, o 504, os três motivos, o cartão, e o credenciamento que NÃO importa).


## A categoria da família chega na conta — dono do produto, 02/11/2026 (migração `20261103000001`, PENDENTE até o dono do produto aplicar; pressupõe a `20261102000002`)

**O defeito, medido em produção em 02/11/2026 (só leitura):** a VEDACAO foi criada às 23:23:09 UTC e marcada na ramificação da PVC às 23:34:30, e
`orcamentista_mp_categoria` da De Paula não ganhou a linha dela. Gravar a matéria-prima "Esquadrias de PVC WOLF" (`79d764fe…`) recusava com
"categoria VEDACAO: categoria inexistente nesta empresa" — a recusa é do banco (`superadmin_gravar_arvore`, `20261023000004_gravar_arvore.sql:239-243`),
não do TS. **Só três lugares criavam a linha:** a matéria-prima NOVA (`superadmin_gravar_materia_prima`, catálogo inteiro, config NULL), o upsert da
categoria (`superadmin_gravar_mp_categoria`) e o preenchimento único da `20261024000004`. Marcar categoria na ramificação (`superadmin_editar_familia`) e
trocar a família de uma matéria-prima não criavam nada.

Decisões do dono do produto, registradas como foram ditas:

> 1. "DESMARCAR: mantém a regra de 27/10 — nada que está gravado some da tela. A categoria desmarcada SEM dado some; a desmarcada COM dado continua
>    aparecendo, marcada 'fora da família'. Não mude esse comportamento nesta PR."
> 2. "COBRE OS TRÊS CAMINHOS: marcar categoria na ramificação, criar matéria-prima e trocar a matéria-prima de família — todos passam a garantir a linha
>    de mp_categoria das categorias daquela família, com ON CONFLICT DO NOTHING. NÃO mude o que a matéria-prima nova já faz hoje (ganhar as linhas do
>    catálogo inteiro): só acrescente a garantia, para não mexer no que já funciona."
> 3. "config NULL, como você propôs. Nunca {}."
> 4. "PREENCHER A FALTA DE HOJE: sim, inclua o INSERT da VEDACAO da De Paula na migração, nos moldes da 20261024000004. Escreva no cabeçalho da
>    migração, em destaque, que ela grava dado de conta, quantas linhas e de qual empresa."
> 5. "Guarda por md5 de editar_familia (2553cf7c…) e criar_familia (aa90f740…), como você propôs."
>
> E: "Nenhum dado de conta é apagado nesta PR."

- **A regra, num lugar só:** `orcamentista_garantir_categorias_da_familia(p_por, p_familia, p_materia_prima, p_origem)` — para cada matéria-prima da
  família (ou só a dada), uma linha por categoria de `orcamentista_familia_ramificacao`, `config` NULL, `ON CONFLICT (materia_prima_id, categoria_chave)
  DO NOTHING`; cada linha CRIADA vai ao `superadmin_alteracao_log` com o tenant dela, a família e a origem (`ramificacao`, `troca_de_familia`,
  `materia_prima_nova`); devolve quantas criou. **Fechada:** não é SECURITY DEFINER e não tem grant a ninguém (nem `service_role`); só as quatro
  funções SECURITY DEFINER a chamam.
- **As quatro chamam a auxiliar, com o corpo de produção intacto** (o `montar_migracao.py` prova pelo diff que só se acrescentaram linhas):
  `superadmin_editar_familia` e `superadmin_criar_familia` depois de regravar as ramificações; `superadmin_definir_familia_da_materia_prima` quando a
  família muda; `superadmin_gravar_materia_prima` na matéria-prima nova ou quando a gravação muda a família. **Em `criar_familia` a garantia é sempre
  vazia** (a FK `orcamentista_materia_prima_familia_fkey` impede matéria-prima de apontar família que ainda não existe) — fica pela coerência.
- **Desmarcar não apaga nada**; remarcar não duplica (o `ON CONFLICT`). A tela não mudou.
- **Sem trava própria na auxiliar:** a marcação e a troca de família já se enfileiram na linha da família (`FOR UPDATE` de `superadmin_editar_familia`
  contra o `FOR KEY SHARE` que a FK toma ao gravar `orcamentista_materia_prima.familia`). A trava de aviso que a primeira versão tinha era redundante e
  saiu; as duas corridas do harness provam as duas ordens.
- **O preenchimento grava dado de conta: 1 linha**, a VEDACAO da De Paula (tenant `20e08592…`, matéria-prima `79d764fe…`), config NULL,
  `atualizado_por` NULL, logada com a origem `preenchimento 20261103000001`. A guarda **aborta** se faltar qualquer outra linha na hora de aplicar — o
  cabeçalho nunca diz menos do que a migração grava.
- **A guarda** confere os quatro corpos pelo md5 sem `\r` (`aa90f740…` criar, `2553cf7c…` editar, `e7e49ec7…` definir, `49ffa56e…` gravar), cada um pela
  assinatura de entrada (`to_regprocedure`), aceita os corpos desta migração na reaplicação, e nomeia o banco, o usuário e o que difere — a lição da
  `20261102000002` colada no projeto errado. Linhas novas dentro dos corpos `$fn$` em ASCII. REVOKE de `PUBLIC, anon, authenticated` (o privilégio
  padrão de produção).
- **Prova:** `scripts/harness/garantia-da-categoria-na-conta/` — a base da `categorias-do-catalogo` com os corpos de produção e o estado de
  `orcamentista_mp_categoria` como em produção (`09_estado.sql`: a VEDACAO criada e marcada pelas funções antigas, a falta reproduzida), a migração duas
  vezes, 11 casos, 2 corridas, 4 guardas (a 4ª num banco vazio) — 17 de 17 —, e 22 mutações nas duas passadas (`mutacoes.py`, com as duas equivalentes
  anotadas).

## Os campos da categoria viram UM campo de INSTRUÇÃO — dono do produto, 03/11/2026 (migração `20261103000002`, PENDENTE até o dono do produto aplicar; pressupõe a `20261023000004` e a `20261103000001`)

Formulação do dono do produto, registrada como está:

> "Quero no lugar disso UM campo de instrução em texto livre por categoria, que o agente consulta quando tem dúvida daquela categoria ('dúvida de
> vidro -> lê a instrução de VIDRO -> busca o preço na tabela do fornecedor')." E: "A instrução de cada categoria entra no prompt junto com a base de
> conhecimento, identificada pela categoria, para o agente consultar. Escrita e sem efeito não serve." E: "Os campos estruturados saem da tela e o
> conteúdo da De Paula é apagado — autorizado por mim hoje, 03/11. A migração tem que imprimir no log o que apagou, por categoria."

**As cinco decisões, registradas como foram ditas:**

1. > "cores e serra_mm FICAM estruturados, como exceção, e só eles. Concordo com o motivo: número que o cálculo usa não pode sair de texto livre."
2. > "Coluna instrucao text em orcamentista_mp_categoria, com CHECK de até 1.500 caracteres. Não use chave dentro de config."
3. > "A migração apaga a config das três categorias (PERFIL perde só as chaves que saem), as 4+4+3 linhas das tabelas e as definições do catálogo de
   > campos que saem. As tabelas e as funções FICAM, vazias e sem tela — a remoção delas é uma PR à parte, depois, se eu pedir. Imprima no log o que
   > apagou, por categoria."
4. > "No prompt, mande só as categorias que TÊM instrução preenchida. Categoria com instrução vazia não gera seção nenhuma — não quero pagar 12.000
   > caracteres por bloco vazio."
5. > "Depois desta PR, a tela de cada categoria fica com: o campo de instrução para todas, mais cores e serra_mm só no Perfil."

**CORREÇÃO do dono do produto, 03/11/2026, antes de aplicar (a migração ainda era PENDENTE):**

> "PARE antes de eu aplicar a 20261103000002: cor_predominante não pode sair. [...] cor_predominante é a fonte da cor padrão [...] ('cor não dita =
> config.cor_predominante da categoria Perfil'). Apagá-la deixa a conversa sem cor padrão e sem lista de cores. Corrija: cor_predominante FICA
> estruturada, junto com cores e serra_mm. Saem só linha, barra_mm, solda e criterio_custo_barra."

A migração foi remontada antes de qualquer aplicação (o md5 abaixo é o do arquivo corrigido); a tela do Perfil mostra os três.

- **A MIGRAÇÃO APAGA DADO DE CONTA** (a De Paula, tenant `20e08592…`, matéria-prima `79d764fe…`), medido em 03/11/2026 e escrito no cabeçalho: da config do
  PERFIL as chaves `linha`, `barra_mm`, `solda` e `criterio_custo_barra` (ficam `cores`, `cor_predominante` e `serra_mm`); a config inteira do REFORCO
  (`usa`, `material`, `par_inox_referencia`) e dos ACESSORIOS_VEDACAO (`vedacao`, `cor_por_perfil`, `modelo_interlock`), que viram NULL (nunca `{}`);
  as 4 linhas de `orcamentista_mp_vidro`, as 4 de `_mp_ferragem` e as 3 de `_mp_instalacao`, pelos ids; e as 10 definições de
  `orcamentista_categoria_campo` que saem (ficam `PERFIL.cores`, `PERFIL.cor_predominante` e `PERFIL.serra_mm`). **Cada remoção tem a sua linha no `superadmin_alteracao_log`**
  (a linha inteira em `antes`, marcada `remocao = 20261103000002`, com o tenant de quem era; a definição é global, tenant NULL) **e um `RAISE NOTICE` por
  categoria**; reaplicar não apaga nem loga de novo. **A guarda aborta se houver o que apagar fora do medido** — uma linha a mais, uma config com chave
  que sai em outra matéria-prima ou empresa, uma definição a mais no catálogo —, nomeando-o: o cabeçalho nunca diz menos do que a migração apaga.
- **A coluna** `orcamentista_mp_categoria.instrucao text`, nula = não informada; a CHECK `orcamentista_mp_categoria_instrucao_forma` exige 1 a 1.500
  caracteres (`char_length`, não bytes) e sem espaço nas pontas — vazio não existe, é NULL (`ausente-vs-falso.md`).
- **A função nova** `superadmin_gravar_instrucao_da_categoria(p_tenant, p_por, p_mp_categoria, p_instrucao jsonb)`: super admin; a categoria tem de ser
  da empresa (a de outra empresa e a inexistente recebem a MESMA frase); texto ou null; apara; vazio e só espaço limpam; acima de 1.500 recusa nomeando o
  número; a mesma instrução não grava nem loga; a mudança grava `atualizado_por` e loga com `campo = instrucao`. **`superadmin_gravar_arvore` ganha a chave
  `instrucao`** no mesmo bloco da categoria (o erro sai com o caminho, "materia-prima X, categoria Y, instrucao: …", e a árvore inteira se desfaz); a
  guarda confere o corpo de produção da árvore pelo md5 (`d1165c55…`, o da `20261023000004`) e aceita o desta na reaplicação. **Decisão do dono do produto:
  o corpo da árvore passou todo a ASCII** (os comentários perderam os acentos; o `montar_migracao.py` prova pelo diff que só comentários mudaram e que o
  acréscimo são a chave e o bloco de 5 linhas) — a colagem pelo SQL Editor no Windows reescreve o que não é ASCII, e o `prosrc` é o artefato
  (`migracao.md`, Parte III).
- **`superadmin_gravar_mp_categoria` não muda e preserva a instrução** (é upsert só de config); como ela valida as chaves contra o catálogo de campos,
  **o banco passa a recusar `linha`, `usa`, `solda`… nomeando a chave** — o banco e a rota dizem o mesmo.
- **No código:** `CAMPOS_QUE_FICAM = { PERFIL: ['cores', 'cor_predominante', 'serra_mm'] }` substitui `CAMPOS_FORA_DA_TELA` (lista fechada: um campo NOVO no catálogo NÃO
  aparece na tela); a tela mostra, em toda categoria, fornecedores + a instrução (contador "N / 1.500", contado como o banco conta, em vermelho acima
  do limite, e o salvar segura a árvore na tela) e, só no Perfil, cores, cor predominante e serra; as tabelas de vidro, ferragem e acabamento saíram da tela e do corpo;
  as rotas `/vidros`, `/ferragens` e `/instalacao` respondem **410** com `fraseDaListaQueSaiu`; a árvore recusa as três listas e toda chave de config
  fora dos que ficam, antes da função. A tela manda `instrucao` só se mudou (aparada; vazia é null); o `depois` sem a chave (rota de antes da
  migração) mantém a que a tela tinha.
- **No prompt** (`instrucoes-da-categoria.ts`): `lerInstrucoesDaEmpresa` lê só as preenchidas (`.not('instrucao', 'is', null)` e, em JS, descarta o só
  espaço); a seção entra no `sistema()` depois das escolhas de arremate e antes do contexto da empresa, com o cabeçalho que diz que a instrução NÃO
  manda em número e que as regras de NUNCA do prompt base valem acima dela; cada seção é `[Rótulo (CHAVE)]` e, quando mais de uma matéria-prima da
  conta tem instrução, ` — <matéria-prima>`; na ordem do catálogo. **Sem instrução preenchida, nenhuma linha** (nem o cabeçalho). Antes da migração a
  coluna não existe: 42703/PGRST204 viram `sem_migracao`, a conversa segue sem a seção e a linha [IA] diz `instrucoes=sem_migracao`; com a coluna,
  `instrucoes=N`. O texto nunca vai ao log.
- **REGISTRO, não defeito:** a função da árvore **ainda aceita** `vidros`, `ferragens` e `instalacao` (as tabelas e as funções ficam, por decisão);
  quem barra é a rota. O caso 10 do harness prova isso de propósito, para a remoção futura saber o que muda.
- **ACHADO da medição (Fase 1), com o dono do produto:** a De Paula tem `cores = null` no PERFIL — a conversa para na cor (`FRASE_SEM_CORES`) até alguém
  preencher as cores. Não é desta PR.
- **DÍVIDAS registradas em 03/11/2026:** (a) o combobox de Linha (`CAMPO_DA_LINHA`, `LinhaDaTabela`, os avisos "sem fórmula"/"fora da tabela" e as
  consultas de `linhas_por_fornecedor` no GET da árvore) ficou sem definição que o use — a tela nunca o monta; sai numa PR de limpeza; (b)
  `orcamentista_familia_etapa.instrucao` continua NÃO chegando ao modelo (a conversa executa o fluxo fixo) — a instrução da etapa é outro caminho, a
  decidir.
- **Prova:** `scripts/harness/instrucao-da-categoria/` — a base da garantia (`20261103000001` aplicada, com o privilégio padrão de produção) + os seis
  corpos de PRODUÇÃO das funções da base de conhecimento (md5 conferido) + as três tabelas na estrutura de produção (`pg_constraint` e `pg_indexes`,
  inclusive o índice único de expressão dos vidros) + o conteúdo medido da De Paula; a migração duas vezes; 10 casos, 3 corridas (instrução × config
  na mesma categoria, nas duas ordens; duas instruções), 7 guardas (corpo diferente, linha/config/definição fora do medido, função nova com outro corpo,
  coluna com outro tipo, banco vazio) e 29 mutações nas duas passadas (`mutacoes.py`). No código: 11 mutações da tela e 10 do leitor/prompt, todas
  mortas (a tabela está no PR).
- **A migração:** `supabase/migrations/20261103000002_instrucao_da_categoria.sql`, md5 `ccc508e65ec77239794ef975c238e35b`, 559 linhas, 41065 bytes, LF.


## Porta não é janela, quantidade não dita é 1, os limites do motor e o agrupamento — dono do produto, 03/11/2026 (sem migração)

**O caso que originou:** levantamento "Geronimo Silva", 03/11/2026. "Janela de correr 1,50x1,20" e "porta janela 2,50x2,40" saíram **as três como
DP-02** ("JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42"), a IA **perguntou a quantidade** e **repetiu dois itens idênticos**.

**Medido antes de escrever (Fase 1, sem alterar nada):** a lista ao modelo levava só `código | descrição | tipo` (`levantamento-da-conversa.ts`); a
tipologia era decidida pela IA e validada **só por pertencer à lista** (`aplicarProposta`); os limites só apareciam como aviso `LIMITE` **depois** da
escolha (`avaliador-de-formulas.ts`); a quantidade não tinha padrão; não havia agrupamento. No motor da De Paula (164 tipologias): **91** descrições
começam com PORTA, **50** com JANELA, **15** MAXIM-AR, **8** FIXO; `alt_min/alt_max` em 130, `larg_min` em 8; **as faixas de altura de porta (464 a 3288)
e de janela (388 a 2644) se sobrepõem** — a altura NÃO separa porta de janela. DP-02: largura sem limite, altura 388 a 2439.

**As decisões, registradas como foram ditas:**

1. > "PORTA × JANELA: o descarte usa a DESCRIÇÃO (primeira palavra). 'porta', 'porta-janela' e 'porta janela' do vendedor descartam toda tipologia cuja
   > descrição começa com JANELA; 'janela' descarta as que começam com PORTA. MAXIM-AR e FIXO NÃO entram nessa regra — não são descartados por ela, só
   > pelos limites. O descarte é no código, antes de o modelo escolher, e a lista enviada ao modelo já vai filtrada."
2. > "LIMITES: NULL nunca descarta — ausente não é zero, e nunca invente limite. Quando o item fica fora de todas as faixas, não escolha a mais próxima:
   > frase própria, nomeando a medida do item e a faixa das tipologias que sobraram, pedindo ao vendedor que confirme a medida ou diga a tipologia. O
   > aviso LIMITE do cálculo continua existindo para o que passar."
3. > "AMBIENTE: não crie campo nenhum. Agrupe por tipologia + medidas + variáveis (escolhas), que é o que existe hoje. Deixe o código preparado para o
   > ambiente entrar como mais um critério quando existir, mas não o invente agora."
4. > "quantidade não dita é 1 (sem perguntar), a lista ao modelo leva descrição e limites além do código, e o agrupamento soma as unidades. Nenhuma
   > migração. Abra PR, NÃO faça merge."

E as três respostas às perguntas do assistente: a palavra do vendedor chega **por item, pelo campo `abertura` da ferramenta** (a IA classifica a
palavra, não escolhe; o código filtra pela mensagem quando ela traz uma só das palavras e **sempre confere por item**); **cor e vidro também entram
na chave** do agrupamento; **só itens completos** se fundem, ao gravar.

**O que está implementado (`tipologias-candidatas.ts`, puro; `levantamento-em-montagem.ts`; `conversa-da-ia.ts`; `levantamento-da-conversa.ts`;
`atendimentos-ia-prompt-base.ts`):**

- **A lista ao modelo** é `código | descrição | tipo | limites de largura | limites de altura` (+ família e fornecedor quando há mais de uma família).
  Limite que o arquivo não traz vai como **"sem limite no arquivo"** — nunca zero (`ausente-vs-falso.md`); os unilaterais vão como "mín X"/"máx X".
  O select da Detalhe passou a trazer `larg_min_mm, larg_max_mm, alt_min_mm, alt_max_mm`, lidos com `numeroOuNulo`.
- **A abertura.** `palavrasDeAbertura` resolve "porta janela"/"porta-janela" como PORTA antes de procurar "janela"; `aberturaDita` é a palavra da
  mensagem quando ela traz **uma só** (as duas, fora de "porta janela", ou nenhuma, é null); `aberturaDaDescricao` é a **primeira palavra** da
  descrição, PORTA ou JANELA, e tudo o mais (MAXIM-AR, FIXO, PORTAL…) não declara. **A lista enviada ao modelo já vai filtrada** pela abertura da
  mensagem (`filtrarPorAbertura`). No item, `aberturaDoItem` aceita o campo `abertura` da ferramenta **só se a palavra está na mensagem** (a IA não
  inventa); senão vale a da mensagem. Em `aplicarProposta`, **antes** de a tipologia entrar no item, nenhuma candidata do código compatível com a
  abertura descarta a tipologia (`descartados += 1`, recusa `ABERTURA`); a resposta é `fraseDaAberturaRecusada` (em linguagem de obra, sem código).
- **Os limites.** `cabeNosLimites`: NULL nunca descarta, e só a medida dita é conferida. Depois de a proposta entrar, com tipologia e alguma medida, se
  **nenhuma** candidata do código cabe, a tipologia, as escolhas, a família e o motor saem (as medidas ficam), recusa `LIMITES`, desfecho
  `nenhuma-cabe`; a resposta é `fraseDeNenhumaTipologiaCabe`: a medida do item e a faixa (do menor mínimo ao maior máximo) das que **sobraram depois do
  filtro porta × janela**, por medida, dizendo que **a tipologia sem limite no arquivo não conta**, mais o pedido de confirmar a medida ou descrever a
  esquadria. Nunca "a mais próxima". O aviso `LIMITE` do avaliador continua para o que passa.
- **Quantidade não dita é 1:** no fim de `aplicarProposta`, o item que já diz alguma coisa e não diz quantas recebe 1 — a pergunta "Quantas unidades?"
  não sai mais por falta dela. O prompt base ganhou "Quantidade não dita é 1: assuma e não pergunte quantas." em O QUE JÁ ESTÁ DEFINIDO, e duas regras
  de NUNCA (porta × janela; a tipologia em que a medida não cabe).
- **O agrupamento** (`agruparIguais`, chamado depois de `resolverFamilias` e antes de gravar): `CRITERIOS_DO_AGRUPAMENTO = tipologia, largura_mm,
  altura_mm, cor_perfil, vidro, familia, motor_id` + as escolhas (ordenadas) — **o ambiente entra nessa lista quando existir, e hoje não existe**. Só o
  item **completo** (tudo dito menos a quantidade, família resolvida) se funde; o primeiro fica com as unidades somadas (não dita conta 1), os outros
  saem, a numeração volta a 1..N. A linha [IA] diz `agrupados=N` quando N > 0. **A escolha dita numa mensagem de duas esquadrias vai só à primeira
  (a padrão), e aí as variáveis diferem: com razão, não se fundem.**
- **O único DELETE da conversa fora da pergunta em aberto:** `gravarLevantamento` apaga a linha gravada cuja `ordem` não voltou (a que se fundiu), por
  id, com tenant e levantamento conferidos, e **confere a contagem atingida** (R1) — como o update. `tabela-que-a-importacao-apaga.md` não se aplica: o
  processo não apaga e regrava a tabela; apaga a linha que deixou de existir, e a que fica é atualizada por `ordem`, coluna a coluna.
- **A ferramenta** ganhou `abertura: enum ['porta','janela']` (opcional; o esquema strict continua em até 16 uniões e 24 opcionais).

**DÍVIDA registrada em 03/11/2026:** a palavra "porta"/"janela" **só vale na mensagem em que foi dita** — não é gravada no item e não persiste entre
turnos. Na mensagem seguinte ("é de correr, 6 folhas"), a tipologia que a IA propõe é conferida só pelos limites; se ela voltar a propor uma JANELA
para a porta, o código não a descarta. Persistir a abertura exigiria coluna no item (migração), que o dono do produto não pediu.

**Prova:** `tipologias-candidatas.test.ts` (52 casos: as palavras, a descrição, o filtro, os limites com NULL, a linha do prompt, as frases, o
agrupamento critério a critério); bloco (24) de `atendimentos-ia-levantamento-por-nome.test.ts` (o caso do Geronimo de ponta a ponta, a lista filtrada
por palavra da mensagem, a `abertura` inventada que não vale, o maxim-ar que fica, 2500 de altura na DP-02, 5000 de largura que passa, a alteração que
tira a tipologia gravada, a quantidade 1 sem pergunta, o agrupamento com o DELETE conferido); bloco (L) de `levantamento-em-montagem.test.ts` (duas
candidatas do mesmo código: basta uma caber); e **52 mutações do código, 52 mortas** (15 no módulo puro, 17 em `aplicarProposta` e no agrupamento, 12 na
conversa, 2 no leitor da Detalhe, 3 no prompt — a tabela está no PR). Três sobreviveram na primeira passada e ganharam teste próprio: `some`→`every`
nos limites (uma candidata cabendo basta), as escolhas que ficavam quando a tipologia caía pelos limites, e o DELETE do agrupamento sem conferir a
contagem atingida.
