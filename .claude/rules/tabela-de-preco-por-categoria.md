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

## Os campos da categoria viram UM campo de INSTRUÇÃO — dono do produto, 03/11/2026 (migração `20261103000002`, aplicada e conferida em produção em 03/11/2026 às 13:23:48 UTC, antes do merge do #214 às 13:25:50; pressupõe a `20261023000004` e a `20261103000001`)

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
- **A migração:** `supabase/migrations/20261103000002_instrucao_da_categoria.sql`, md5 `cb4f26b012eee5e1ced235dcb4ca14cf`, 563 linhas, 41.725 bytes, LF (a versão anterior, `ccc508e6…`, apagava `cor_predominante` e nunca foi aplicada).
- **Aplicação conferida por consulta (03/11/2026, só leitura):** a coluna `instrucao text` existe; `superadmin_gravar_arvore` em produção tem o corpo
  desta migração (md5 `bbac1a84f0a102b4d37d90295a5b3fa9`) e `superadmin_gravar_instrucao_da_categoria` o seu (`95e5b34e09888a05071a86cea3b55a31`) —
  nenhum `\r` e nada fora do ASCII entrou no `prosrc`; as três tabelas vazias; o catálogo de campos é `PERFIL.cor_predominante, PERFIL.cores,
  PERFIL.serra_mm`; a config do PERFIL da De Paula é `{"cores": null, "cor_predominante": "BRANCO", "serra_mm": 5}`; 24 linhas de log com a marca
  `remocao = 20261103000002`, todas às 13:23:48 UTC. A ordem da Parte I de `migracao.md` foi cumprida: aplicada 2 min antes do merge. Como as
  demais aplicadas pelo SQL Editor, não há linha em `supabase_migrations.schema_migrations` (ver `migracao.md`, Parte II).


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

## O resgate do levantamento antigo e o contexto que não se perde — dono do produto, 03/11/2026 (sem migração)

**O caso que originou** (De Paula, 03/11/2026, 16:30 a 16:34 UTC, medido nos logs `[IA]` de produção e na pergunta em aberto gravada):
"Janela de correr 1,50x1,20 vidro 4mm / porta janela 2,50x2,40 vidro 8mm / Cliente: Geronimo Silva" caiu em `rota=PARECIDO nome=do_cliente`; "Geison
Silva novo" deu `rota=SEM_NOME nome=faltou aberta=NOME_PARECIDO` (a IA mandou só `novo`); o reenvio das esquadrias deu `SEM_NOME nome=faltou
aberta=SEM_NOME desfecho=nao-avancou`. As duas esquadrias estavam retidas em `orcamentista_pergunta_em_aberto` (SEM_NOME, 2 itens), não perdidas — mas
nada se grava sem nome, e a resposta não dizia que as tinha anotado.

**Medido antes (Fase 1):** o nome só existia se a IA o devolvesse e ele estivesse no texto como trecho contíguo (`nomeDaMensagem`); o cliente ganhava o
prefixo "Levantamento" (`nomeDoLevantamentoDoCliente`), e o levantamento existente "Geronimo Silva" não o tinha — "levantamento geronimo silva" contém
"geronimo silva": PARECIDO, nunca IGUAL; `emEspera` era OU as retidas OU as da mensagem (`daPergunta = daMensagem.length === 0 && …`), de modo que a
resposta com nome e uma esquadria nova apagaria as retidas em silêncio; a frase do parecido listava todos, só o nome, e ditava a forma da resposta
("responda: novo X", "escreva o nome exatamente como ele está").

**As decisões, registradas como foram ditas:**

1. > "O PREFIXO 'Levantamento' SAI. O nome do levantamento é o nome do cliente, puro: 'Geronimo Silva', não 'Levantamento Geronimo Silva'. [...] Os
   > levantamentos que já existem com o prefixo continuam como estão; a comparação deve ignorar o prefixo nos dois lados, para que 'Levantamento
   > Geronimo Silva' e 'Geronimo Silva' sejam IGUAIS."
2. > "AS ESQUADRIAS RETIDAS NUNCA SE PERDEM. emEspera passa a ACUMULAR: o que já estava guardado na pergunta em aberto mais o que vem na mensagem nova.
   > [...] apagaria esquadria em silêncio — trate como prioridade igual ao resto."
3. > "NOME VINDO DE RESPOSTA LIVRE: quando há pergunta de nome em aberto, a mensagem do vendedor pode trazer o nome em qualquer forma ('Geison Silva
   > novo', 'é o Geison Silva', 'novo: Geison Silva'). A IA extrai o nome e o código confere que as palavras estão no texto — nunca exija a forma
   > ditada pela pergunta."
4. > "RESGATE: no máximo 3 opções, numeradas, em ordem decrescente de data, cada uma com a data e o estado. O vendedor responde pelo número ou diz
   > 'novo <nome>'. Nunca exija o nome exato." E o acréscimo: "o resgate é conversa, não formulário. [...] Ele responde do jeito dele ('é o do
   > Geronimo', 'o primeiro', 'o de ontem'). Entenda e CONFIRME em uma frase curta — 'Então é o Geronimo Silva, de 01/11, certo?' — e siga quando
   > ele confirmar. [...] TOM: fale como uma secretária de orçamentos experiente — direta, cordial, sem formulário, sem repetir frase pronta, sem
   > 'Não consegui registrar a sua resposta'. Nunca mande o vendedor responder numa forma ditada."
5. > "Endereço e cidade: só o custo no relatório, não faça."

**O que está implementado (`nome-do-levantamento.ts`, `pergunta-em-aberto.ts`, `conversa-da-ia.ts`, `atendimentos-ia-prompt-base.ts`):**

- **O prefixo.** `formaComparavel(nome)` = normalizada sem o "levantamento " inicial, usada nos DOIS lados de `compararNome` (IGUAL e PARECIDO), em
  `nomeDaPergunta`, na comparação com o levantamento do apanhado e na busca do admin pelo nome (`.in('nome_normalizado', [forma, 'levantamento ' + forma])`).
  `nomeSemPrefixo` tira o prefixo do que se grava (o cliente e o nome dito "Levantamento X"); `nome_normalizado` continua sendo `normalizarNome(nome)`
  da linha gravada. Nenhuma linha existente é tocada.
- **As retidas.** `juntarEsquadrias(retidas, novas)`: as da pergunta em aberto primeiro, depois as da mensagem; a da mensagem IDÊNTICA a uma retida (os
  campos da esquadria iguais) é a mesma reenviada e conta uma vez (`reenviadas=N` no log); a que difere em um campo acumula. **Decisão do assistente,
  relatada no PR:** o reenvio idêntico conta uma vez porque foi o caso real (a mensagem 3 remandou as mesmas duas); quem quiser "mais uma igual" na
  resposta ao nome diz a quantidade. `daPergunta` passou a ser "há retidas" (a confirmação do acréscimo continua valendo para elas).
- **O nome livre.** `nomeDaMensagem` confere pelas PALAVRAS (letras e números; a pontuação colada não conta; a ordem não importa), não pelo trecho
  contíguo: "Geison Silva" vale em "Geison Silva novo", "é o Geison Silva", "novo: Geison Silva"; "Geisonaldo Silva" e "Maria Souza" não. O prompt diz à
  IA que, com a pergunta do nome em aberto, o nome vem de qualquer forma.
- **O resgate.** `opcoesDeResgate`: do mais recente ao mais antigo por `criado_em`, no máximo `LIMITE_DO_RESGATE = 3`; a frase numera e diz a data
  (dd/mm/aaaa, fuso `America/Sao_Paulo`) e o estado por extenso ("em montagem"/"completo"); a ordem gravada em `levantamentos` É a numeração. A
  ferramenta ganhou `opcao` (inteiro): a IA traduz "o primeiro", "o 2", "é o do Geronimo", "o de ontem" no número da lista (o prompt leva "Hoje é
  dd/mm/aaaa" enquanto a lista ou a confirmação está em aberta). O código então **confirma numa frase curta** (`fraseDeConfirmarResgate`: "Então é o
  “Geronimo Costa”, de 24/10/2026, certo?") e grava a confirmação como **CONFIRMAR_ACRESCIMO COM `nome`** — a CHECK de `pergunta` em produção
  (`20261026000003`) só aceita os quatro códigos e nenhuma migração foi pedida —, com o escolhido primeiro em `levantamentos` e os outros depois; ao
  prompt vai a confirmação mais a lista ("não, é o segundo" tem a que se referir). "sim" segue: as retidas entram no escolhido sem uma segunda
  confirmação; "não" devolve a lista sem o recusado (ou pergunta o cliente novo, se não sobrou nenhum); outra `opcao` troca o escolhido; a `opcao`
  fora da lista não aponta nada. Com a lista em aberto, a `opcao` vence um nome PARECIDO que a IA também tenha lido ("é o do Lima" → nome "Lima" +
  opcao 2 → a confirmação do Lima); o nome EXATO de um da lista segue como antes (a confirmação do acréscimo); "novo <nome>" cria. O escolhido que sumiu
  do banco invalida a confirmação (nunca cai no citado seguinte).
- **O tom.** Saíram "responda: novo X", "escreva o nome exatamente como ele está" e, no roteamento pelo nome, o "Não consegui registrar a sua resposta":
  a pergunta repetida volta em OUTRAS palavras (`fraseDoResgateEmOutrasPalavras`, `fraseDeConfirmarResgateEmOutrasPalavras`,
  `fraseDeConfirmarAcrescimoEmOutrasPalavras`, as `OUTRAS_PERGUNTAS_DO_NOME`). **Não mudou, de propósito:** o "não registrei" da pendência EM MONTAGEM
  (a pergunta de campo repetida) e o do apanhado repetido — são outro caminho; se o dono do produto quiser o mesmo tom lá, é PR própria.
- **A ferramenta** ficou em 23 opcionais (o limite do strict é 24): `variavel` e `opcao` da escolha viraram obrigatórios para abrir lugar à `opcao` do
  resgate — a escolha sem um deles já era descartada.

**Endereço e cidade do cliente — o custo, não feito (decisão 5):** não existem em `orcamentista_levantamento` (id, tenant_id, remetente_id, nome,
nome_normalizado, estado, criado_em, atualizado_em — medido em 03/11/2026). Tê-los custa: (a) **migração** com duas colunas nulas (`endereco text`,
`cidade text`, CHECK de forma, sem default) e a guarda de costume; (b) **a conversa**: dois campos na ferramenta (hoje em 23 de 24 opcionais — teria
de abrir lugar: `pergunta.campo/texto` obrigatórios, ou o endereço num só campo), a regra no prompt, a leitura conferida no texto (como o nome), a
gravação no insert/update do levantamento e a coleta sem virar interrogatório (só quando o vendedor disser; nunca perguntar por padrão, ou a
secretária vira formulário); (c) **a lista do resgate** mostrando a cidade quando houver (o que mais distingue dois "Geronimo Silva"); (d) **a tela**
do levantamento no super admin, se houver leitura lá; (e) testes, mutações e a fixture do pedido à IA. Estimativa: uma PR do tamanho desta, com
migração PENDENTE.

**Prova:** bloco (25) de `atendimentos-ia-levantamento-por-nome.test.ts` (o caso real como IGUAL; o legado com prefixo; a lista de 3 em ordem com
data e estado; "o primeiro" → confirmação → "sim" sem segunda confirmação; "é o do Lima" com a opção vencendo o nome; a lista e a data de hoje no
prompt da confirmação; "não" com e sem sobra; "Geison Silva novo"; as palavras no texto em qualquer forma; as retidas mais a nova; o reenvio idêntico;
o tom; a opção fora da lista; o nome exato; o escolhido que sumiu; `juntarEsquadrias` pura), 7d e 7e em (12) (o admin com o nome legado e com o
prefixo no apanhado), (5) e (6) de `nome-do-levantamento.test.ts`, e os blocos (15), (16), (23) reescritos para as decisões. **36 mutações, 36 mortas**
(`mutacoes-resgate.py`); seis sobreviveram na primeira passada e ganharam teste próprio (o PARECIDO por distância com o prefixo do gravado, o nome da
pergunta com o prefixo, o escolhido que sumiu, a ordem gravada da confirmação, a busca do admin pelo nome legado, o apanhado de outro vendedor
confirmado com o prefixo).

## A conversa sai do modo formulário, e volta a ser gravada — dono do produto, 03/11/2026 (migração `20261103000003`, aplicada e conferida em produção em 03/11/2026, DEPOIS do merge do #218 às 20:56 UTC; pressupõe a `20261022000001`)

**O caso que originou** (De Paula, 03/11/2026, 18:26 a 18:36 UTC, medido nos logs `[INBOUND]` e `[IA]`): o mesmo `Info.ID` `3EB06E260E4D8D4FA0E8E5`
chegou às 18:26:38 e às 18:27:51 (o reenvio do WUZAPI; a primeira levou `ia_ms=21200`) e foi conduzido DUAS vezes — a segunda caiu em
`nao-avancou`; depois, cinco `SEM_NOME nao-avancou` seguidos, com só duas variantes em `OUTRAS_PERGUNTAS_DO_NOME`, repetiram a mesma frase. E a
pergunta de arremate perguntava um campo por mensagem.

**Medido antes (Fase 1):** 69 de 168 testes da suíte afirmavam frase fixa (49 exatos); `proximaPendencia` devolvia UMA pendência e a pergunta era
"Esquadria N: <campo>"; a `fala` era a única frase do modelo e exigia um só pedido por turno; a duplicata era o reenvio do WUZAPI sem idempotência
(a decisão 4 de 25/10 tirou a linha da mensagem); a conversa não era gravada desde 25/10 (`inbound.ts` sem o insert, `conversa-da-ia.ts` sem o
`lerHistorico`); as duas tabelas serviam como estavam, menos a ligação saída → entrada; 1 conversa e 12 mensagens de 22/10 em produção.

**As decisões, registradas como foram ditas:**

1. > "PARTE 1 — PERSONALIDADE NO PROMPT BASE: VOCÊ É A SECRETÁRIA ORÇAMENTISTA DA EMPRESA. [...] LEIA A CONVERSA INTEIRA, NÃO SÓ A ÚLTIMA MENSAGEM.
   > [...] PERGUNTE UMA VEZ SÓ, E SÓ O QUE FALTA. [...] CONFIRME POUCO. [...] CONSULTE ANTES DE DIZER QUE NÃO TEM. [...] O vendedor não tem que
   > aprender a falar com o sistema. É você que entende como ele fala." (O texto inteiro, verbatim, está em `atendimentos-ia-prompt-base.ts`.)
2. > "Uma pergunta por turno que cubra TODAS as pendências do momento, não um campo por mensagem. As frases fixas viram frases do modelo, mantendo
   > o conteúdo obrigatório (o que falta, de qual esquadria). O código continua validando a resposta; só o texto deixa de ser fixo. A mesma mensagem
   > nunca é processada duas vezes, e a mesma resposta nunca sai duas vezes seguidas."
3. > "CORREÇÃO DA DECISÃO: a conversa VOLTA a ser gravada. A decisão 4 fica REVOGADA pelo dono do produto em 03/11. Nova regra: a conversa do
   > vendedor com o agente é gravada, dentro do tenant, e serve para dois fins: 1. HISTÓRICO [...] 2. IDEMPOTÊNCIA [...] Nada sai do tenant, nunca.
   > Nenhuma empresa vê a conversa de outra."
4. > "MIGRAÇÃO SIM: coluna responde_a uuid nula em orcamentista_mensagem, FK para a própria tabela, e o índice em orcamentista_conversa (tenant_id,
   > remetente_id). [...] Nasce PENDENTE: caminho e md5 com LF, eu leio antes."
5. > "HISTÓRICO: 20 mensagens, 24 horas, teto de 6.000 caracteres [...]. O levantamento formal com preços NÃO entra — vira '[levantamento formal
   > enviado]'. Saída acima de 600 caracteres entra cortada. Essa regra de nunca mandar dinheiro ao modelo é inviolável."
6. > "RETENÇÃO: 12 meses, e o cron fica para PR própria depois desta. Nesta PR nada expira e nada é apagado."
7. > "NÃO reenvie no WhatsApp o que o vendedor já recebeu. Reenvio reconhecido responde 200 e não conduz de novo; só envia quando o primeiro envio
   > falhou de fato."

**A migração `20261103000003_responde_a_na_mensagem.sql`** (md5 `f43ba4ec10e50f2fda77c4d361213c4b`, 146 linhas, 10.115 bytes, LF; `responde_a uuid
NULL`, FK `orcamentista_mensagem(id) ON DELETE SET NULL`, índice parcial `orcamentista_mensagem_responde_a_idx`, e `orcamentista_conversa_remetente_idx
(tenant_id, remetente_id, criado_em DESC)` IF NOT EXISTS). **Medido em 03/11/2026 às 19h UTC: o índice da conversa JÁ EXISTE em produção com essa
definição exata** — a Fase 1 dizia que não existia; a fonte primária desmentiu (`estado-relatado-vs-real.md`). A migração o cria IF NOT EXISTS e a
verificação confere a forma: o de mesmo nome e outra forma aborta. Harness em `scripts/harness/conversa-gravada/` (as duas tabelas como em produção,
12 mensagens sintéticas, a migração duas vezes, 6 casos, 4 contrastes; 12 mutações mortas nas duas passadas).

**Aplicação conferida por consulta (04/11/2026, só leitura):** `responde_a uuid`, nula, sem default, com o comentário da migração; 5 constraints na
mensagem, a `orcamentista_mensagem_responde_a_fkey` como `FOREIGN KEY (responde_a) REFERENCES orcamentista_mensagem(id) ON DELETE SET NULL`, as 4 de
antes intactas; 4 constraints na conversa; 8 índices nas duas tabelas — os 7 de antes com a definição de sempre e o `orcamentista_mensagem_responde_a_idx`
parcial. 46 mensagens gravadas (21 saídas), a última às 21:20:44 UTC de 03/11, **nenhuma ainda com `responde_a`**: todas foram gravadas antes da coluna
existir (`gravacao=sem_migracao`, o caminho previsto). Como as demais aplicadas pelo SQL Editor, não há linha em `supabase_migrations.schema_migrations`.
**A ordem da Parte I de `migracao.md` NÃO foi cumprida desta vez:** o #218 foi mergeado às 20:56 UTC com a coluna ausente, e a migração foi aplicada
depois (a hora exata não está no banco). Não houve dano porque o código foi escrito para degradar sem a coluna — a saída gravada sem `responde_a` e o
reenvio do WUZAPI respondido com 200 sem conduzir nem reenviar (a defesa que não depende da ordem, Parte I) —, e a ausência estava nomeada no topo do PR.
É a aparição 8 da classe, com a ordem invertida e o estrago reduzido a "sem reenvio da saída falhada" durante a janela.

**O que está implementado (`conversa-gravada.ts`, `redacao-da-resposta.ts`, `inbound.ts`, `conversa-da-ia.ts`, `levantamento-em-montagem.ts`,
`atendimentos-ia-prompt-base.ts`):**

- **A gravação.** A rota acha a conversa do remetente (a mais recente por tenant e remetente) ou cria uma, e grava a ENTRADA com o texto e o `Info.ID`
  ANTES de conduzir; a conversa grava a SAÍDA DEPOIS de enviada — o texto como foi enviado (com a `fala` na frente), `responde_a` = a entrada, e o id
  do envio (nulo quando o envio falhou). A gravação da saída nunca derruba a resposta já enviada: falha vira `gravacao=falhou` no log. Toda leitura e
  escrita leva o `tenant_id`.
- **A idempotência.** O `Info.ID` repetido no tenant (23505 na UNIQUE parcial) devolve a entrada de antes, `repetida`, e a conversa decide: saída com id
  de envio → `desfecho=repetida`, nada enviado, IA não chamada; saída sem id (o envio falhou de fato) → só o reenvio do texto gravado, e a saída ganha
  o id (`reenviada`); sem saída e a entrada mais nova que `JANELA_EM_VOO_MS` (60 s, o `maxDuration` da rota) → nada (`em_voo=sim`); sem saída e mais
  velha → a primeira condução morreu, e a mensagem é conduzida de novo. Sem `Info.ID` não há reconhecimento. A UNIQUE que bate e não acha a linha
  (uma corrida) é 500: o WUZAPI reenvia e a próxima acha.
- **O histórico.** `lerHistorico`: as últimas 20 mensagens da conversa das últimas 24 h (sem a entrada desta vez), teto de 6.000 caracteres descartando
  as mais velhas; a saída com DINHEIRO (`temDinheiro`) vira "[levantamento formal enviado]" — decidido pelo texto, nunca pelo desfecho —, a saída acima
  de 600 caracteres entra cortada com reticência, a entrada vai como veio; começa em `user`, papéis seguidos iguais viram uma mensagem. Vai em `messages`
  antes da mensagem desta vez (`historico=N` no log). O prompt diz ao modelo que a ÚLTIMA é a desta vez e que as anteriores servem para entender
  referências e NUNCA perguntar de novo; `itens` passou a aceitar o campo que o vendedor deu para todas ou a que se referiu numa mensagem anterior.
- **As pendências juntas.** `pendenciasDoLevantamento` lista TODAS (esquadria por esquadria: sem a tipologia, os campos; com ela, a família, os campos
  e as escolhas pedidas); `proximaPendencia` é a primeira. `perguntaDasPendencias` as junta: uma linha por esquadria ("Esquadria 1: … \nEsquadria 2:
  …"), os campos numa frase ("Me diga a largura (em mm), a cor do perfil e o vidro."; a tipologia em linguagem de obra "E me diga …"), a família e as
  escolhas na mesma linha; com UMA pendência, a fixa de sempre. A reformulação da IA entra no lugar da fixa do primeiro campo. Vai ao prompt como a
  pergunta em aberto, à pergunta final, ao R2 da montagem e à alteração incompleta.
- **As frases do modelo.** `falar(rascunho)`: um SEGUNDO pedido ao modelo, sem ferramenta, com o prompt base (a personalidade), a tarefa
  (`INSTRUCAO_DA_REDACAO`), o contexto da empresa no fim, o histórico, a mensagem do vendedor e o RASCUNHO (a frase fixa de sempre). O código valida
  (`redacaoValida`): não vazia, até 700 caracteres, TODO número do rascunho presente (1.200 = 1200), TODO nome entre “aspas”, TODO código em CAIXA ALTA
  (DP-02, BRANCO), TODO nome da lista numerada do resgate, sem dinheiro, sem código de fornecedor, e DIFERENTE da última saída enviada; o que não passa
  manda o rascunho (`redacao=<motivo>` no log). O rascunho com dinheiro não vai ao modelo (defesa). A redação é a resposta inteira (a `fala` não a
  antecede). **Passam por `falar`:** as perguntas e confirmações (o nome, o resgate, o acréscimo, a pendência, a esquadria, o vendedor, o não encontrei,
  o nome que existe, a alteração incompleta, o apanhado não confirmado, o acréscimo recusado, o não apliquei, nenhuma cabe, a abertura recusada, os
  "não registrei"). **Ficam fixas:** as falhas (`FALHA_*`), as faltas de configuração, `FRASE_SEM_CORES`, o APANHADO e o levantamento FORMAL.
  `fraseDeNaoRegistrei` perdeu o "Não consegui registrar" e o "Responda em palavras". **Limite conhecido:** a validação confere números, aspas, caixa
  alta e a lista; a lista de opções de arremate por extenso ("sem arremate interno") fica por conta do modelo, instruído a manter tudo.
- **Nunca a mesma resposta duas vezes seguidas.** A redação igual à última saída cai (`repetida`) e sai o rascunho; o rascunho que também for igual sai
  com `repetida=sim` no log — os caminhos de pergunta já têm a forma "em outras palavras", e o caso não apareceu em teste nem em produção.
- **Sem a migração** (a coluna não existe): a saída é gravada sem `responde_a` (`gravacao=sem_migracao`), e o reenvio de uma entrada já gravada é 200
  sem conduzir nem reenviar — o comportamento de antes de 25/10/2026.
- **A personalidade** entrou no prompt base, verbatim, antes de "AS DUAS ETAPAS"; as seis regras de NUNCA ficaram. A tela do agente a mostra.

**Custo por turno:** uma chamada a mais ao modelo nas respostas de pergunta e confirmação (400 tokens de saída no máximo, `effort: low`), e o histórico
de até 6.000 caracteres na entrada das duas. A fixture `pedidos-a-ia-sem-contexto.json` foi regravada (o prompt mudou de propósito).

**Fica para o dono do produto:** o cron de retenção de 12 meses (PR própria); a leitura da conversa gravada na tela do super admin, se quiser.

**Prova:** os blocos (3), (26), (27), (28) e o (21) ampliado de `atendimentos-ia-levantamento-por-nome.test.ts`; (6) e (7) de
`atendimentos-ia-inbound.test.ts` reescritos para a gravação e o reenvio; (VI) de `levantamento-em-montagem.test.ts`; a fixture regravada; o harness da
migração; e as mutações do código (`mutacoes-conversa.py`, o resultado no PR).

## O vidro copiado, nunca completado; a forma canônica; a dedupe por equivalência — dono do produto, 04/11/2026 (sem migração)

**O caso que originou** (De Paula, 03/11/2026, 21:09 a 21:20 UTC, medido nas mensagens gravadas e na pergunta em aberto): o vendedor escreveu
"vidro 4mm" e "vidro 8mm" em todas as mensagens; o modelo devolveu seis grafias — "Vidro comum 4 mm", "incolor comum 4 mm", "incolor 4 mm
comum", "Vidro comum 8 mm", "incolor temperado 8 mm", "incolor 8 mm temperado" —, completadas a partir da instrução da categoria VIDRO que vai ao
sistema ("Padrão: incolor 4 mm comum em janela; 8 mm temperado em porta…"); "8 mm" saiu como "comum" num turno e "temperado" noutro. A pergunta em
aberto acabou com **10 itens para 2 esquadrias**, e a confirmação dizia "juntaria mais 10".

**Medido antes (Fase 1):** o vidro caía no `default` de `valorValido` (`pre-definicao.ts`): qualquer texto não vazio, contra nada; o prompt não
tinha regra para `vidro`; o único consumo estruturado era `espessuraDoVidro` (o número seguido de "mm", para o baguete). A conversa **nunca** leu
`orcamentista_mp_vidro` — a lista (4 linhas: "Incolor 4 mm comum", "Mini boreal 4 mm", "Incolor 8 mm temperado", "Incolor 10 mm temperado") existia só
na tela e foi apagada pela `20261103000002`; restaram a instrução de texto (482 caracteres) e a tabela de preço VIDRO da Estrela (21 itens em caixa
alta). **A dedupe não veio só do vidro:** `juntarEsquadrias` comparava os 6 campos exatamente — "2 uni - DP-02" (só tipologia e quantidade) e os
itens com `quantidade` vinda do histórico eram "outra esquadria".

**As decisões, registradas como foram ditas (opção c):**

1. > "VIDRO COPIADO, NUNCA COMPLETADO. O vidro do item é o que o vendedor disse, literal. O modelo não acrescenta têmpera, cor nem nada vindo da
   > instrução da categoria. A instrução de VIDRO só entra quando o vendedor NÃO disse vidro nenhum para aquela esquadria — e, nesse caso, entra
   > UMA vez, fica gravada e não muda nos turnos seguintes. 'vidro 8mm' nunca pode sair como 'comum' num turno e 'temperado' noutro: isso troca o
   > produto e o preço."
2. > "FORMA CANÔNICA (c): vidroCanonico(texto) -> espessura + têmpera + cor, numa ordem só. Serve para COMPARAR (dedupe e agrupamento); o texto que
   > o vendedor disse continua sendo o que se grava e o que aparece. A regra nunca inventa o que não foi dito: '8 mm' não funde com 'temperado 8 mm'."
3. > "DEDUPE POR EQUIVALÊNCIA, não por igualdade de 6 campos: campo ausente num dos lados não impede a dedupe [...]; quantidade sai da comparação:
   > ela é somada ou atualizada, não é identidade; '2 uni - DP-02' sobre um DP-02 já retido é a MESMA esquadria com a quantidade dita, nunca uma
   > esquadria nova. Com isso, os 10 itens daquele caso teriam sido 2. Use esse caso como teste."
4. > "(b) fica para depois: quando a empresa tiver tabela de preço da categoria VIDRO, a lista do fornecedor pode entrar como referência ao
   > modelo. Não faça agora."
5. > "Não reviva orcamentista_mp_vidro. A decisão de 03/11 continua de pé."
6. O ajuste antes do merge do #220: > "pode, não derrube. Quando o vidro proposto tem parte na mensagem e parte completada pelo modelo, PODE o que não
   > está na mensagem e fique com o que está. 'incolor temperado 8 mm' com a mensagem dizendo só 'vidro 8mm' vira '8 mm', não vira vazio. Só cai
   > inteiro quando NADA do vidro está na mensagem. O vendedor nunca pode ser perguntado por um vidro que ele já disse."

**O que está implementado (`vidro.ts` novo, `pergunta-em-aberto.ts`, `levantamento-em-montagem.ts`, `conversa-da-ia.ts`):**

- **Copiado, nunca completado — e podado, não derrubado.** O prompt ganhou a regra do `vidro` (copiar como escrito; nunca têmpera, cor ou palavra
  da instrução) e a ferramenta ganhou `vidro_padrao` (24 opcionais, o limite do strict). No código, `vidroPodado(proposto, mensagem)`: palavra por
  palavra do vidro proposto, fica a que está na mensagem (os números pelo valor; o enchimento "vidro", "de", "mm" acompanha) e **cai a que o modelo
  completou** — "incolor temperado 8 mm" sobre "vidro 8mm" vira "8 mm", "Vidro comum 4 mm" sobre "vidro 4mm" vira "vidro 4 mm" (`vidro_podado=N` no
  log); só cai INTEIRO quando nada do vidro está na mensagem (`vidro_nao_dito=N`). O vendedor nunca é perguntado por um vidro que já disse. O
  `vidro_padrao` só preenche a esquadria que ficou sem vidro, uma vez, e nunca sobrescreve (`vidro_padrao=N`); viaja com a esquadria retida e entra
  quando o levantamento nasce.
- **A forma canônica.** `formaCanonicaDoVidro`: "<têmpera> <cor> <espessura> mm <resto…>", só com o que foi dito; sinônimos (liso = comum,
  temp. = temperado, fumê = cinza, mini boreal = boreal, jateado = acidato); "3+3" é laminado por construção; o que não é espessura, têmpera nem cor
  fica no resto e distingue. As seis grafias do caso viram quatro formas: as permutações fundem; "comum" não vira "temperado", "com cor" não vira
  "sem cor". O texto gravado e exibido continua o do vendedor.
- **A equivalência.** `esquadriasEquivalentes`: nenhum campo de identidade (tipologia, medidas, cor, vidro — a quantidade NÃO) presente nos dois
  lados difere, e pelo menos um coincide; o vidro pela forma canônica. `fundirEsquadrias`: a mais completa prevalece (o que a retida não tinha vem da
  nova), a quantidade dita atualiza. `juntarEsquadrias` funde a nova equivalente a uma retida (só contra as RETIDAS: duas novas iguais na mesma
  mensagem são duas, e é o agrupamento que soma); a que equivale a mais de uma retida se funde na primeira. O agrupamento dos gravados compara o
  vidro pela forma canônica.
- **O caso como teste, nas duas leituras:** os 10 itens COMO ESTAVAM, pela equivalência, viram **4** — a regra não inventa: "comum 8 mm" e
  "temperado 8 mm" são produtos diferentes, e o modelo já os tinha completado. Os **2** saem com a regra 1 valendo desde a primeira mensagem: o replay
  dos cinco turnos do vendedor, com o vidro copiado, termina com duas esquadrias (2 e 1 unidades) na confirmação.

**Não feito, por decisão:** a lista do fornecedor como referência ao modelo (decisão 4); `orcamentista_mp_vidro` continua vazia (decisão 5).
**Observação fora do escopo, só registro:** no laço daquela conversa o vendedor queria o levantamento existente ("não acrescenta, são só 3
unidades"), e a conversa só ofereceu acrescentar; o levantamento "Geronimo Silva" tem a porta 2.500 x 2.400 gravada como DP-02 (de antes do #215).

**Prova:** `vidro.test.ts` (a forma canônica, os sinônimos, o laminado, o resto, `vidroPodado`: a poda, o que volta igual, o que cai inteiro);
(VII) de `levantamento-em-montagem.test.ts` (o padrão uma vez, nunca sobrescreve, o agrupamento canônico); (29) de
`atendimentos-ia-levantamento-por-nome.test.ts` (os 10 itens → 4; a equivalência pura; duas novas na mesma mensagem; o caso real em cinco turnos → 2;
o completado é podado e gravado sem perguntar; cai inteiro só sem nada na mensagem; o podado funde com o retido; o padrão uma vez; o padrão na
retida; o prompt e a ferramenta); a fixture dos pedidos regravada; e as mutações do código (`mutacoes-vidro.py`, o resultado no PR).

## A conversa executa as ETAPAS DECLARADAS da família: a ação manda, o número é só ordem — dono do produto, 04/11/2026 (sem migração)

**O que estava medido (Fase 1, 04/11/2026):** a conversa não percorria etapas; fazia duas leituras pelo NÚMERO em `motor-da-familia.ts` (1 =
levantamento, 2 = cálculo, com nomes fixos no código), a terceira etapa era ignorada em silêncio, a ação do catálogo não era lida em ponto nenhum
da conversa, e `conferirEtapasParaExecutar` só era chamada pela tela. Com a ordem trocada no catálogo (1 = CALCULAR_BARRAS, 2 = GERAR_LEVANTAMENTO),
os motores trocavam de papel em silêncio. `orcamentista_familia_etapa.instrucao` não chegava ao modelo. Em produção: só a De Paula tem família com
etapas (2, as duas com motor, instrução vazia); o catálogo tem 2 itens (GERAR_LEVANTAMENTO e CALCULAR_BARRAS), nenhum com APANHAR, CONFIRMAR ou ENVIAR.

**As decisões, registradas como foram ditas:**

1. > "A AÇÃO manda, o número é só ORDEM. Nunca mais leia a etapa por número para decidir o papel: quem executa levantamento é a etapa com
   > GERAR_LEVANTAMENTO, quem calcula é a com CALCULAR_BARRAS, onde quer que estejam na ordem. Se o papel vier pelo número, trocar a ordem no
   > catálogo troca os motores em silêncio — foi o que você mediu, e é inaceitável num número que vira preço."
2. > "UNIFIQUE O VOCABULÁRIO: a conversa passa a chamar conferirEtapasParaExecutar, e a conferência por número de lerMotoresDaConta sai. Duas listas
   > de frases de falta para a mesma coisa é como elas se tornam divergentes. Acrescente a essa função o que faltar: ação repetida, ação desconhecida
   > e ação sem executor."
3. > "AÇÃO SEM EXECUTOR: APANHAR, CONFIRMAR e ENVIAR existem no catálogo e não têm código. Etapa com uma delas vira erro nomeado dizendo que a ação
   > ainda não é executada pelo sistema — nunca ignorada em silêncio, que é o que acontece hoje com a terceira etapa."
4. > "CÁLCULO SEM LEVANTAMENTO: erro nomeado ('a etapa de cálculo precisa de uma etapa de levantamento antes dela'). Não invente fonte de esquadrias."
   E, à pergunta do assistente, a família SÓ com a etapa de levantamento: **"Envia o levantamento sem cálculo"** — a conversa apanha, confirma, grava e
   manda ao vendedor a relação das esquadrias, sem barras, sem mão de obra e sem preço.
5. > "INSTRUÇÃO DA ETAPA: mande ao modelo apenas a instrução da ETAPA CORRENTE, nunca a de todas — +8.080 caracteres por chamada é caro demais e a maior
   > parte seria irrelevante no turno. Etapa cujo executor não usa o modelo (CALCULAR_BARRAS) não manda instrução nenhuma; se houver instrução preenchida
   > numa etapa dessas, diga isso no relatório e me avise, porque é configuração que o super admin escreveu achando que teria efeito."
6. > "PROVA DE NÃO-REGRESSÃO: a fixture dos pedidos da De Paula tem de sair byte a byte igual."

**O que está implementado (`atendimentos-ia-etapas.ts`, `motor-da-familia.ts`, `levantamento-da-conversa.ts`, `levantamento-em-montagem.ts`,
`conversa-da-ia.ts`, `etapas-da-familia.ts`):**

- **O executor é da AÇÃO** (`EXECUTOR_DA_ACAO`: GERAR_LEVANTAMENTO → levantamento, CALCULAR_BARRAS → cálculo, as outras três → `null`). `lerMotoresDaConta`
  lê TODAS as etapas da família com o item do catálogo de cada uma (`etapaLida`, a montagem única da tela e da conversa), chama
  `conferirEtapasParaExecutar` com `categoriasSemFornecedor: null` (não conferido: o fornecedor por categoria continua sendo conferência do PREÇO, em
  `levantamento-da-conversa.ts`; conferi-lo aqui recusaria a De Paula, que tem cinco categorias sem fornecedor por desenho desde 31/10), e dá o papel
  pela ação. `FonteDaFamilia` passou a ter `etapas` (na ordem, com ação, executor, instrução e motor), `levantamento`, `calculo` (**nulo quando a
  família só levanta**), `instrucaoDoLevantamento` e `instrucoesSemEfeito`. Saíram `ETAPA_DO_LEVANTAMENTO`, `ETAPA_DO_CALCULO`, os nomes fixos e as
  frases por número; as faltas do motor (arquivado, sem conteúdo) dizem a etapa pelo número E pelo nome do catálogo; a divergência entre duas
  instâncias da mesma família é por AÇÃO (e as instâncias que não declaram as mesmas etapas também divergem).
- **A conferência única** ganhou: ação fora da lista (nunca um lançamento), ação SEM EXECUTOR (a frase nomeia a ação e as duas executadas), ação
  REPETIDA (as etapas em que está), e CÁLCULO SEM LEVANTAMENTO antes dele (pelo número, que é a ordem). A ordem das frases: família → etapa → motor →
  ação → fornecedor. A conversa responde as faltas (uma por linha) antes de chamar o modelo, `motivo=ETAPAS` no log; a tela mostra as mesmas frases.
- **A família só com GERAR_LEVANTAMENTO:** a lista e as Variáveis vêm do motor dela; a esquadria grava `familia` e fica **sem motor** (`motor_id`
  nulo: ausente, não o motor de outro papel); a mensagem final é o cabeçalho e as esquadrias mais "Esta família não tem etapa de cálculo: as barras,
  a mão de obra e o preço não saem. O levantamento fica registrado como está." — sem R$ e sem "o que o preço cobre". Com várias famílias, o bloco de
  cada uma, e "o que o preço cobre" só se alguma calculou.
- **A instrução da etapa corrente:** só a da etapa com GERAR_LEVANTAMENTO (a única que fala com o modelo), só quando preenchida, no fim do sistema,
  depois das instruções de categoria e antes do contexto da empresa: o cabeçalho (`CABECALHO_DA_INSTRUCAO_DA_ETAPA`: não manda em número; as regras de
  NUNCA valem acima) e `[Etapa N — <nome do catálogo>]` (`— família X` quando há mais de uma), uma por família. A linha [IA] diz `instrucao_etapa=N`.
  A instrução escrita numa etapa que não usa o modelo não vai: a linha [IA] diz `instrucao_sem_efeito=<número>:<AÇÃO>:<caracteres>`. **Medido em
  produção em 04/11/2026: nenhuma instrução preenchida** (0 caracteres nas duas etapas da De Paula) — nada a avisar hoje. Sem instrução, o sistema é
  byte a byte o de antes (a fixture `pedidos-a-ia-sem-contexto.json` não foi regravada).
- **O que NÃO mudou:** a redação da resposta (`redacao-da-resposta.ts`) não recebe a instrução da etapa — ela recebe o contexto da empresa, que é tom;
  a instrução é da coleta. A conferência de fornecedor por categoria continua só no preço. Nenhuma migração.

**Prova:** `atendimentos-ia-familia-pronta.test.ts` (a conferência: o mapa dos executores, a ordem que não decide, só levantamento passa e só cálculo
não, cada ação sem executor, a ação fora da lista, a repetida, as faltas juntas na ordem); bloco (1f) de `levantamento-da-conversa.test.ts` (a ordem
trocada é falta; o levantamento na 2 e o cálculo na 3 com motores diferentes dão o papel pela ação; a terceira etapa com ENVIAR é falta; a repetida; a
ação fora da lista; várias faltas juntas; a família só com levantamento — a leitura, a mensagem sem cálculo, duas famílias com uma que só levanta; a
instrução do levantamento e a sem efeito); bloco (30) de `atendimentos-ia-levantamento-por-nome.test.ts` (a falta antes do modelo com `motivo=ETAPAS`;
a ordem trocada; o formal sem cálculo de ponta a ponta com a esquadria sem motor; a instrução no sistema e `instrucao_etapa=1`; a de cálculo fora do
sistema e `instrucao_sem_efeito=2:CALCULAR_BARRAS:39`; sem instrução, o sistema de sempre; duas famílias, cada instrução com a família); a fixture dos
pedidos INALTERADA; e as mutações do código (`mutacoes-etapas.py`, o resultado no PR).

## O turno da conversa tem prazo: 300 s na rota, 45/15/30 s nas chamadas, e as leituras vão em ondas — dono do produto, 04/11/2026 (sem migração)

**O caso que originou** (De Paula, 04/11/2026, 20:11:50 UTC, medido nos logs da Vercel e do PostgREST): a primeira mensagem de uma sessão, com três
esquadrias e o cliente, entrou numa função recém-publicada; a rota leu o banco por 10,5 s (5 chamadas da rota + 24 da conversa, **em série**), chamou o
modelo às 20:12:02 e a chamada **não voltou em 49 s**; a Vercel matou a função aos 60 s (`Vercel Runtime Timeout Error`), **sem linha `[IA]`** (ela só
saía no fim do turno) e sem resposta ao vendedor. O WUZAPI reentregou aos 60 s e caiu em "em voo" (a entrada tinha 58,5 s, a janela era 60 s): o 200
calou o reenvio que, em 03/11, tinha salvado as duas outras mensagens mortas aos 60 s (16:31 e 18:25, com duplicatas). **Três turnos mortos em três
dias, todos a primeira mensagem de uma sessão.** No turno normal (17 turnos de 03/11, 12,1 a 22,8 s) o banco em série custava mais que o modelo
(5,4 a 8,4 s contra 2,2 a 7,4 s).

**As decisões, registradas como foram ditas:**

> 1. "maxDuration da rota inbound para 300, e JANELA_EM_VOO_MS acompanhando."
> 2. "TIMEOUT NA CHAMADA AO MODELO, que é o defeito de fundo: hoje ela não tem limite e o turno inteiro morre em silêncio. 1ª chamada: 45 s. Estourou,
>    o vendedor recebe uma falha nomeada ('não consegui processar agora, me mande de novo'), e a linha [IA] é escrita ANTES do fim do turno, com o motivo.
>    2ª chamada (redação): 15 s. Estourou, cai para a frase de reserva e segue — redação é luxo, nunca pode derrubar o turno. Nenhum caminho pode
>    terminar sem resposta ao vendedor. Esse é o critério de aceitação."
> 4. "As 24 leituras em série viram paralelas (ou cache). 5 a 8 s por turno é o ganho mais barato que temos."
> "O item 3 (200 adiantado) NÃO entra agora. [...] Enquanto o reenvio do WUZAPI for a nossa rede, não vamos cortá-la."

**O que está implementado (`prazo.ts` novo, `conversa-da-ia.ts`, `redacao-da-resposta.ts`, `levantamento-da-conversa.ts`, `motor-da-familia.ts`,
`tabelas-da-conta.ts`, `instrucoes-da-categoria.ts`, `conversa-gravada.ts`, `inbound.ts`):**

- **A rota declara 300 s** (`inbound.ts`) e **`JANELA_EM_VOO_MS` é 300 s**: os dois andam juntos, com portão nos dois testes (a janela menor que o limite
  conduziria em dobro uma reentrega enquanto a primeira ainda roda). O plano aceita 300: as rotas do super admin já declaram 90 e fazem build, o que
  exclui Hobby sem Fluid compute (teto 60); com Fluid, Hobby e Pro aceitam 300. A API da Vercel não devolve o plano; a prova é o build do preview.
- **O prazo** (`prazo(ms)`): um `AbortController` com `setTimeout` — não `AbortSignal.timeout`, porque é com o relógio fingido do Jest que os testes
  adiantam o tempo. O `signal` vai ao `fetch` (interrompe a conexão E a leitura do corpo); `estourou()` distingue o prazo da falha de rede; `limpar()`
  cancela o despertador quando a chamada volta (há portão: nenhum timer sobra).
  - **1ª chamada, 45 s** (`PRAZO_DA_PRIMEIRA_CHAMADA_MS`): estourada, `chamarLlm` devolve `prazo-esgotado`, a linha `[IA]` sai **no instante**
    (`enviou=nao desfecho=prazo-esgotado limite_ms=45000 antes_do_envio=sim ia_ms=45000`), o vendedor recebe `FALHA_PRAZO_DA_IA` (fixa, não passa pela
    redação), nada é gravado, e a linha de sempre sai no fim (`enviou=sim`). A falha de rede continua `FALHA_DA_IA`.
  - **Redação, 15 s** (`PRAZO_DA_REDACAO_MS`): estourada, `redigir` devolve `motivo: 'prazo'` e o rascunho sai (`redacao=prazo` no log).
  - **Envio ao WUZAPI, 30 s** (`PRAZO_DO_ENVIO_MS`, leitura do assistente dentro do critério "nenhum caminho termina sem resposta"): estourado, o turno
    termina com `desfecho=envio-falhou status_envio=prazo_esgotado` e a saída fica gravada sem id de envio — o reenvio do WUZAPI reenvia o texto
    gravado (a regra de 03/11). Os três prazos mais as leituras cabem em menos da metade dos 300 s (há portão).
- **As leituras em ondas** (medido no banco falso por ondas, bloco (32) do teste): **6 idas ao banco em série antes do modelo, eram 22.** Onda 1: a conta
  e a conversa (famílias, categorias e vínculos do preço, cores, levantamento em montagem, contexto, histórico, instruções); onda 2: o catálogo de
  famílias, as etapas, os fornecedores, as tabelas (e, com instrução preenchida, o catálogo de categorias e as matérias-primas); onda 3: os itens do
  catálogo de etapas e os motores; onda 4: a contagem de tipologias e os fornecedores dos motores; onda 5: a lista de tipologias; onda 6: as Variáveis
  (por família) com a pergunta em aberto, ou com os itens da montagem. **A ordem das RESPOSTAS não mudou**: a primeira falta continua sendo a resposta,
  na ordem de antes (família → etapas → motor → preço), e o motor passou a ser lido antes da conferência das etapas de propósito (a leitura que ela
  recusaria não custa nada; a resposta é a frase da conferência). **A paginação** (`lerTudo`): a primeira página traz a contagem exata e as demais vão
  JUNTAS — a ordem total das abas é o que garante que páginas em paralelo não se sobrepõem nem deixam buraco; a contagem lida contra a exata continua.
- **O que mudou de efeito, e é da decisão:** quando a leitura da família recusa (uma falta nomeada) e OUTRA leitura da primeira onda lança (um erro do
  banco), a resposta passa a ser `FALHA_DO_BANCO_ANTES` em vez da frase da falta — antes, as outras leituras nem aconteciam. Nenhum teste cobre esse
  cruzamento, e em produção não há leitura da primeira onda que lance com a conta configurada.
- **Não feito, por decisão:** o 200 adiantado ao WUZAPI (`waitUntil`) — fica para PR própria, depois de uma semana de produção sem turno morto sem
  resposta. **Não feito, por escopo:** o cache do prompt (26 a 29 mil tokens de entrada por chamada, sem `cache_control`); o custo de reduzir isso está
  no PR.

**Prova:** `prazo.test.ts` (o prazo dispara nele, não antes; `limpar` cancela; o ouvinte de abort); bloco (31) de
`atendimentos-ia-levantamento-por-nome.test.ts` (as constantes e a folga no maxDuration; a 1ª chamada pendurada aos 45 s com a linha antes do envio, a
frase, nada gravado e a saída gravada; o contraste da falha de rede; a redação pendurada aos 15 s; o envio pendurado aos 30 s; nenhum timer sobra); bloco
(32) (as 6 ondas exatas da primeira mensagem, a onda com instrução, a montagem, a paginação com 2.500 linhas: `[1, N−1]` e nenhuma linha a menos); (27)
e (6) do inbound (a paridade janela × maxDuration); e as mutações do código (`mutacoes-prazo.py`, o resultado no PR). Os dez testes novos ficam
vermelhos com o código da main (medido antes do push).

## O pedido ao modelo: raciocínio desligado, teto de saída, lista enxuta e o prefixo cacheado — dono do produto, 05/11/2026 (sem migração)

**O caso que originou** (De Paula, 04/11/2026, 21:33 UTC, e três outras primeiras mensagens de sessão em 03 e 04/11): o prazo de 45 s funcionou
(`ia_ms=45001`, a linha `[IA]` saiu antes do envio, o vendedor recebeu a falha nomeada), mas a 1ª chamada continuou estourando. Medido nos 21 turnos
que voltaram (03 e 04/11): a entrada vai de 25,8 a 28,9 mil tokens, **estreita demais para explicar** a diferença entre 2 s e 45 s (r(ms, entrada) = +0,09
sem os dois lentos); o tempo acompanha a SAÍDA (r = +0,87) e, nos dois turnos lentos que voltaram, o modelo gerou a 15 e 20 tokens/s contra 35 a 110
nos normais. O Gabriel mandou só "janela" (73 linhas na lista, não 164) e morreu duas vezes: **o tamanho da lista não é o que mata.** A chamada ia sem
`thinking` (no Sonnet 5.5 isso liga o raciocínio adaptativo) e com `max_tokens: 16000` — folga para um raciocínio que não deveria existir numa extração
curta — e a linha `[IA]` não dizia `stop_reason` nem os tokens de raciocínio: dava para adivinhar entre "API lenta" e "o modelo pensou demais", não para saber.

**As decisões, registradas como foram ditas:**

> 1. "Desligue o raciocínio adaptativo na 1ª chamada e baixe max_tokens para o tamanho real da ferramenta mais folga. Registre stop_reason e os tokens de
>    raciocínio na linha [IA]."
> 2. "Lista enxuta (-40%), volátil no fim do sistema e cache_control no prefixo. Regrave a fixture."
> 3. (operação, não código) "APAGUE a linha de orcamentista_pergunta_em_aberto desse remetente, com log do que havia. [...] O levantamento 'Geronimo Silva'
>    e seus 3 itens FICAM; só a pendência travada sai. E me diga, no relatório, o que faz uma pergunta em aberto ficar presa dois dias: ela deveria expirar,
>    e não expira."

**O que está implementado (`pedido-ao-modelo.ts` novo, `conversa-da-ia.ts`, `redacao-da-resposta.ts`, `tipologias-candidatas.ts`,
`levantamento-da-conversa.ts`):**

- **O raciocínio da 1ª chamada, desligado** (`RACIOCINIO_DA_EXTRACAO = { type: 'between_tools' }`): no Sonnet 5.5 `disabled` é recusado (400);
  `between_tools` é o jeito de não pensar antes da ferramenta, aceito com `effort` até `high` (a chamada vai com `low`). A redação não muda.
- **O teto de saída, 2.000** (`MAX_TOKENS_DA_PRIMEIRA_CHAMADA`): a resposta é UMA chamada da ferramenta; medido nos 21 turnos, 86 a 574 tokens de saída.
  2.000 é mais de três vezes o maior medido (há portão) e cabe a mensagem de dez esquadrias. O que passar disso pára em `max_tokens` sem a ferramenta,
  vira `desfecho=sem-proposta stop_reason=max_tokens`, o vendedor recebe `FALHA_DA_IA` e nada é gravado — e a linha diz `ia_parada=max_tokens`.
- **A linha `[IA]` ganhou quatro campos**, logo depois de `ia_saida`: `ia_raciocinio` (`usage.output_tokens_details.thinking_tokens`), `ia_parada`
  (`stop_reason`), `ia_cache_lido` e `ia_cache_escrito` (`cache_read_input_tokens`, `cache_creation_input_tokens`). **`-` quando a API não traz o
  campo, nunca zero** (`ausente-vs-falso.md`).
- **O sistema em dois blocos** (`blocosDoSistema`): o ESTÁVEL — prompt base, regras, a lista de tipologias, as cores, as escolhas de arremate, as instruções
  de categoria e de etapa e, no fim, o contexto da empresa — com `cache_control: { type: 'ephemeral' }`; e o VOLÁTIL — `Levantamento em montagem`,
  `Hoje é`, `Pergunta em aberto` — depois dele, sem marca. A ordem do pedido é tools → system → messages, então a ferramenta entra no prefixo cacheado.
  O estável é **byte a byte o mesmo entre os turnos da mesma conta** (há portão), enquanto o catálogo, a base de conhecimento e as instruções não mudam.
  A redação vai num bloco só, marcado: o sistema dela é todo da conta. O TTL do cache é 5 min, renovado a cada leitura; os turnos de uma sessão distam
  30 a 60 s. **A lista filtrada muda o estável**: cada lista distinta é uma variante do cache (desde 05/11/2026 a lista é pelo acumulado da conversa,
  então as variantes são por conversa, não três por conta), cada uma aquece no primeiro uso; está dito no teste e aceito.
- **A lista enxuta** (−40 % em produção: 25.306 → 15.268 caracteres nas 164 linhas da De Paula), sem perder informação:
  - a descrição perde o último segmento `| …` quando ele é a LINHA de produto, que o motor já traz numa coluna própria (`descricaoNoPrompt`:
    "JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42" com linha "PVC WOLFF EUROPA 42" → "JANELA DE CORRER 02 FOLHAS MÓVEIS"). Medido: as 164 descrições
    terminam no nome da linha, e as 163 distintas continuam 163 distintas sem o sufixo (o único par DP-017/DP-18 já era igual com ele). A comparação é
    sem acento e sem caixa; sem `|`, sem linha ou com o segmento fora da linha, a descrição vai inteira. O `CandidatoDeTipologia` ganhou `linha`.
  - os limites vão compactos (`limiteCompacto`): `A 388-2439` é a faixa, `L ≥300` só o mínimo, `A ≤2000` só o máximo; **sem L ou sem A, nada sai**, e o
    cabeçalho da lista traz a legenda uma vez (`LEGENDA_DOS_LIMITES`: "sem L ou sem A, o arquivo não traz o limite"). A frase ao vendedor ("sem limite no
    arquivo") continua a mesma na conferência; só o prompt mudou de língua, e a regra do prompt fala a mesma ("a medida que a lista não limita (sem L ou
    sem A) não descarta").
- **A fixture `pedidos-a-ia-sem-contexto.json` foi regravada** (mudança deliberada do pedido: `thinking`, `max_tokens`, os blocos).

**O que NÃO está feito, e por quê:** a pergunta em aberto **não expira** — não há coluna de validade, cron nem conferência de idade em
`pergunta-em-aberto.ts`; a linha só sai em `apagarPerguntaEmAberto`, quando uma mensagem a resolve. Foi assim que a CONFIRMAR_ACRESCIMO do Geronimo
(10 itens retidos, criada em 03/11 às 21:20) ficou dois dias presa: o vendedor nunca respondeu "sim/não". A linha foi apagada por operação autorizada
em 05/11, com o que havia gravado em `superadmin_alteracao_log`. Expirar por idade na leitura (24 h, como o histórico) é proposta no PR, não decisão.

**Prova:** bloco (33) de `atendimentos-ia-levantamento-por-nome.test.ts` (o `thinking`, o `effort`, o teto e a relação com a maior saída medida; os
quatro campos novos quando o `usage` traz e `-` quando não; o corte em `max_tokens`); bloco (34) (os dois blocos e a marca; o estável igual entre dois
turnos da conta com a montagem e a pergunta só no volátil; o contexto no fim do estável; as três variantes do filtro; a redação num bloco só; o volátil
vazio não vira bloco); (24) com a lista enxuta e a legenda; `tipologias-candidatas.test.ts` (`limitesNoPrompt` compacto, `descricaoNoPrompt`);
`levantamento-da-conversa.test.ts` (a `linha` lida e a linha do candidato com e sem ela); e as mutações do código (`mutacoes-prompt.py`, o resultado no
PR). Os testes novos ficam vermelhos com o código da main (medido antes do push).

## A pergunta em aberto expira em 24 h na leitura, como o histórico — dono do produto, 05/11/2026 (sem migração)

**O caso que originou:** a CONFIRMAR_ACRESCIMO do Geronimo (10 itens retidos, criada em 03/11 às 21:20 UTC) ficou dois dias em
`orcamentista_pergunta_em_aberto`, porque a linha só saía em `apagarPerguntaEmAberto`, quando uma mensagem a RESOLVIA — e o vendedor nunca
respondeu "sim/não". Cada mensagem nova do remetente foi lida com a pergunta de terça no sistema: a conversa do Jeison foi lida como resposta
a uma confirmação de dois dias antes. A linha foi apagada por operação autorizada em 05/11 (log em `superadmin_alteracao_log`), e o PR #226
registrou o porquê: não havia validade, cron nem conferência de idade.

**A decisão, registrada como foi dita:**

> "PR própria, Nível 2, para a pergunta em aberto expirar em 24 h na leitura, como o histórico. Pendência presa por dois dias contamina toda
> mensagem nova do vendedor, e foi o que fez a conversa do Jeison ser lida como resposta a uma confirmação de terça."

**O que está implementado (`pergunta-em-aberto.ts`, `conversa-da-ia.ts`):**

- **A janela é a do histórico, uma constante só:** `HORAS_DA_PERGUNTA_EM_ABERTO = HORAS_DO_HISTORICO` (24). A conta é a mesma do histórico
  (`criado_em >= agora − 24 h` fica): `perguntaExpirou(criadoEm, agora)` é verdadeiro quando `criado_em` é mais velho que isso. **Em 24 h exatas a
  pergunta ainda vale; 1 ms a mais expira.** Uma data que não se lê NÃO expira: a idade é desconhecida, e o desconhecido não vira "velha"
  (`ausente-vs-falso`); em produção a coluna é `NOT NULL DEFAULT now()`, então é só a leitura defensiva.
- **A leitura devolve `'expirada'`** (`lerPerguntaEmAberto`, que passou a selecionar `criado_em` e aceita um `agora` injetado): há uma linha, mas velha
  demais para ser a pergunta desta conversa. Na conversa, a guarda é **uma só**: a pergunta que VALE nesta mensagem exclui `'ausente'` e `'expirada'`;
  da expirada nada vai ao modelo (nenhum `Pergunta em aberto:` no sistema), os levantamentos que ela cita não são lidos, e a linha `[IA]` diz
  **`aberta=expirada`** (os outros valores continuam `<código>|ausente|-`).
- **A linha velha fica no banco até ser sobrescrita ou resolvida — como o histórico, a leitura filtra e não apaga.** A próxima pergunta a sobrescreve
  (upsert pela chave tenant + remetente, `criado_em` de agora); a mensagem que resolve a apaga pelo caminho de sempre (`temLinha` continua
  verdadeiro para a expirada: há uma linha). Apagar na leitura seria uma mudança que apaga algo (Nível 3) e não foi pedido.
- **O que não muda:** a pergunta da montagem (guardada no levantamento EM_MONTAGEM) não passa por aqui; a tabela ausente continua `'ausente'`.

**Prova:** bloco (35) de `atendimentos-ia-levantamento-por-nome.test.ts` — a constante igual à do histórico; `perguntaExpirou` em 24 h exatas, 1 ms a
mais, a data do Geronimo e as datas ilegíveis; `lerPerguntaEmAberto` com a linha velha, a nova, o `agora` injetado e sem linha; a pergunta de 23 h
lida como resposta ("é o mesmo" → confirmação, `aberta=NOME_PARECIDO`); a de 25 h NÃO lida (nada no sistema, "é o mesmo" não vira confirmação, nada
entra no levantamento, `aberta=expirada`); a linha expirada apagada pela mensagem que resolve e substituída pela pergunta nova; a pergunta nova
sobrescrevendo a expirada. Mutações do código (`mutacoes-expira.py`): 11 de 11 mortas, depois de unificar a guarda que estava em dois lugares (cada
metade sozinha não mudava nada, e duas mutações sobreviviam). Cinco dos sete testes novos ficam vermelhos com o código da main; os dois que passam nele (a pergunta de 23 h vale; a pergunta nova sobrescreve a velha) descrevem o que já era assim.

## A 1ª chamada em fluxo: 10 s até os cabeçalhos, uma repetição em conexão nova, e o request-id no log — dono do produto, 05/11/2026 (sem migração)

**O caso que originou:** de 04/11 20:11 a 05/11 02:41, as cinco chamadas ao modelo feitas da função em produção (gru1) não receberam
cabeçalho nenhum — duas morreram aos 60 s da Vercel, três no prazo de 45 s do #225 — e a linha `[IA]` saía toda com `-`: sem `usage`,
sem `stop_reason`, sem request-id. Enquanto isso, a sonda da máquina do dono do produto respondia em 6 s ao mesmo pedido, e a sonda de rede em
preview, de dentro de gru1 e com a mesma chave, respondia ao corpo real em 6,8 s sem fluxo e em 1,5 s até o primeiro byte com fluxo. Sem fluxo,
a API só devolve os cabeçalhos quando a geração termina: 45 s sem nada não distinguia fila, geração lenta e pedido perdido.

**A decisão, registrada como foi dita:**

> "STREAMING COM PRAZO CURTO ATÉ OS CABEÇALHOS — autorizado como PR própria, Nível 3: stream: true, prazo de 10 s até os cabeçalhos, UMA
> repetição em conexão nova, e a linha [IA] com ia_primeiro_token_ms e o request-id. Isso é a mitigação que nos tira do escuro: hoje a gente
> espera 45 s para descobrir que nada veio."

**O que está implementado (`resposta-em-fluxo.ts` novo, `pedido-ao-modelo.ts`, `conversa-da-ia.ts`):**

- **O pedido vai com `stream: true`.** O resto do corpo não muda (modelo, teto, raciocínio desligado, dois blocos, ferramenta, histórico). A
  redação continua sem fluxo.
- **Dois prazos.** O GERAL continua 45 s (`PRAZO_DA_PRIMEIRA_CHAMADA_MS`) e cobre a chamada inteira, tentativas e leitura do corpo. O dos
  CABEÇALHOS é 10 s por tentativa (`PRAZO_ATE_OS_CABECALHOS_MS`), com `TENTATIVAS_DA_PRIMEIRA_CHAMADA = 2`: os dois vão juntos ao `fetch` por
  `AbortSignal.any`. Sem cabeçalho em 10 s, a tentativa é abortada — o abort derruba o socket dela — e a segunda abre outra conexão com o mesmo
  pedido. A segunda sem cabeçalho é `prazo-esgotado` aos 20 s, com `sem_cabecalhos_ms=10000 tentativas=2`; a frase ao vendedor é a de sempre
  (`FALHA_PRAZO_DA_IA`), a linha `[IA]` sai antes do envio, nada é gravado. A falha de rede continua `erro-da-llm`, com `tentativas=N`.
- **A resposta em fluxo é montada na forma de antes** (`lerFluxo`): `message_start` traz o `usage` de entrada e do cache; `content_block_start`,
  `content_block_delta` (`text_delta`, `input_json_delta` acumulado em pedaços) e `content_block_stop` montam os blocos; `message_delta` traz
  `stop_reason` e o `usage` de saída, somado ao de entrada; `message_stop` encerra. Quem decide sobre a proposta (`tool_use`, `sem-proposta`,
  `recusa`, `max_tokens`) não mudou. O evento `error` no meio do fluxo é `erro-da-llm` com `fluxo=erro tipo=<tipo>`, nunca uma proposta pela
  metade. Cabeçalhos que chegam e corpo que não termina caem no prazo geral: `prazo-esgotado … cabecalhos_ms=N corpo=interrompido`. O erro
  HTTP com fluxo pedido vem em JSON e é tratado como antes (status, tipo, saldo).
- **A linha `[IA]` ganhou quatro campos**, depois dos do cache: `ia_cabecalhos_ms` (ms até os cabeçalhos da tentativa que respondeu),
  `ia_primeiro_token_ms` (ms até o primeiro `content_block_delta`), `ia_tentativas` e `ia_request_id` (o cabeçalho `request-id` da API, o que a
  Anthropic rastreia). `-` quando não houve (`ausente-vs-falso`). Lidos juntos: cabeçalhos tarde é fila ou pedido perdido; primeiro token cedo
  e fim tarde é geração lenta.
- **O que não muda:** a redação (15 s, sem fluxo), o envio (30 s), a janela em voo, o `maxDuration` 300.

**Prova:** bloco (36) de `atendimentos-ia-levantamento-por-nome.test.ts` (as constantes e a soma dentro do prazo geral; `stream: true` no pedido
e não na redação; a resposta em fluxo montada com o JSON da ferramenta picado, o `usage` somado e os quatro campos no log; `lerFluxo` com
eventos cortados entre chunks, corpo que não é SSE e corpo nulo; a primeira tentativa sem cabeçalhos aos 10 s e a repetição que responde,
`ia_tentativas=2`, mesmo pedido; cabeçalhos que chegam e corpo que não termina, prazo geral aos 45 s; o evento `error`; o erro HTTP com fluxo;
nenhum timer sobra); (31) ajustado — a 1ª chamada pendurada cai aos 20 s (10 + 10), não aos 45. O fake do `fetch` dos testes devolve a 1ª chamada
como a API devolve: SSE quando 2xx e `stream` pedido (`comoFluxo`), JSON nos erros, com `request-id`. A fixture `pedidos-a-ia-sem-contexto.json`
foi regravada (`stream: true`). Mutações do código (`mutacoes-fluxo.py`, o resultado no PR). Os testes novos ficam vermelhos com o código da main.

## O caso do Jorge Koss: a ferramenta sem `strict`, sem `thinking`, a lista pelo acumulado, e a segunda esquadria sem número — dono do produto, 05/11/2026 (sem migração)

**O caso que originou (05/11, 14:04–14:08 UTC, cinco turnos):** "quero orçamento / 1 Porta janelas de correr 2 folhas com vidro comum 6 mm incolor
2,50 x 2,20 / 1 janela maxim ar, mini boreal 60 x60 / Jorge Koss, porto alegre" → a conversa perguntou o cliente; "Nome é Jorge Koss" → "não consegui
vincular"; "Levantamento novo em nome de Jorge Koss" → criou o levantamento com UMA esquadria vazia e pediu a descrição completa; a lista reenviada e
"Branco / Vidro Comum" → `propostos=0`, a mesma pergunta em outras palavras. As linhas `[IA]`: `propostos=0, 0, 1, 0, 0`, `nome=faltou` nos dois
primeiros. O princípio ferido: **o vendedor nunca informa a mesma coisa duas vezes.**

**A medição (sonda em preview, de gru1, com o corpo exato da produção e o histórico reconstruído):** a ferramenta `strict: true` devolvia, em 8 de 8
repetições, itens só com `abertura` e uma `familia` inventada (`"x"`, `"PVC / Alumínio ignorado"`), sem tipologia, medida, quantidade, cor ou vidro —
é o que `esquadriasDaProposta` descarta, então `emEspera` ficava vazio, o cliente não vinha e as esquadrias se perdiam NA SAÍDA DO MODELO (a junção
das retidas e `aplicarProposta` estavam certas). Sem `thinking` (o corpo de antes do #226), a API ficava 45 a 50 s sem responder e devolveu
`400 "Schema is too complex."` — o travamento de 04/11 20:11 a 05/11 02:41 começou no primeiro turno depois do #220, que pôs o `vidro_padrao` como
24º opcional, exatamente o limite documentado; a documentação diz que a gramática é compilada no primeiro uso, com timeout de 180 s e cache de 24 h.
A MESMA ferramenta sem `strict` extraiu o cliente e as duas esquadrias em 4 de 4 (3,7 a 8 s). Antes do #220 (03/11 21:09–21:20, 23 opcionais, sem
`thinking`), a produção respondia em 2 a 7 s com `propostos=8, 24, 28, 38`.

**A decisão, registrada como foi dita:**

> "1. TIRE strict: true. A validação já é nossa (valorValido, nomeDaMensagem, aberturaDoItem, podas). 2. OMITA o thinking, voltando ao que era
> antes do #226: 3,7 s e ~400 tokens contra 7 s e ~700. Mantenha max_tokens 2000 e o cache. 3. itens_sem_campos=N no log. 4. Filtros 6 a 8 pelo
> acumulado, por esquadria, com a lista inteira quando nenhuma candidata sobrar. 5. Teste obrigatório: os cinco turnos do Jorge Koss têm de
> terminar com as DUAS esquadrias completas e o cliente vinculado no primeiro turno."

**O que está implementado:**

- **A ferramenta vai SEM `strict`** (`conversa-da-ia.ts`, `FERRAMENTA`): o esquema continua com `additionalProperties: false` e os tipos de cada campo;
  a validação da entrada é a de sempre (`valorValido`, `nomeDaMensagem`, `aberturaDoItem`, as podas de vidro e fornecedor). O portão (8) passou a
  conferir a AUSÊNCIA do `strict` e registra a medida (0 uniões, 24 opcionais).
- **A 1ª chamada vai SEM `thinking`** (`chamarLlm`): o `between_tools` do #226 saiu; `RACIOCINIO_DA_EXTRACAO` foi removida de `pedido-ao-modelo.ts`.
  Ficam o `effort: low`, o teto de 2.000, o fluxo, o cache e a linha `[IA]` com `ia_raciocinio` (que agora pode trazer tokens de raciocínio adaptativo:
  medido 0 a 618 na repetição dos turnos).
- **A lista do prompt pelo ACUMULADO** (`tipologias-candidatas.ts`: `filtrarPeloAcumulado`, `trechosDoAcumulado`, `tiposDitos`, `palavrasDoTipo`,
  `serveAoTrecho`): o acumulado são as mensagens do VENDEDOR no histórico de 24 h mais a desta vez; cada LINHA é um trecho; o trecho que diz porta ou
  janela (uma só das palavras) ou um TIPO do motor (a coluna `tipo` da Detalhe, lida como dado: alguma palavra do tipo com 3 letras ou mais começa uma
  palavra do trecho — "maxim" casa maxim ar, maxim-ar e maximar; "giro" ou "abrir" casam "Giro / Abrir") filtra; a lista é a UNIÃO do que serve a cada
  trecho (compatível com a abertura E do tipo dito; a tipologia sem tipo no arquivo passa). **A rede de segurança:** o trecho para o qual nenhuma
  tipologia sobra traz a lista INTEIRA; a palavra que não é tipo do motor ("basculante", "projetante", "tombar") não filtra. Sem trecho, lista inteira.
  Só a lista do PROMPT é filtrada: `aplicarProposta` valida contra a lista inteira, e a recusa porta × janela continua pela palavra DESTA mensagem.
  Medido na De Paula (164) nos cinco turnos: hoje 164 em todos; pelo acumulado 87 em todos (−47 %). **Limite registrado:** `DP-167 PORTA OSCILO
  BATENTE + GIRO` tem tipo Oscilo-batente e não vem com "porta de giro" enquanto sobrar alguma porta de giro.
- **A linha `[IA]` ganhou** `lista=enviadas/total trechos=N` (sempre que houve chamada), `trechos_sem_candidata=N` (só quando > 0) e
  `itens_sem_campos=N` (só quando > 0: itens que o modelo devolveu sem nenhum campo da esquadria — foi assim que as do Jorge Koss se perderam).
- **A segunda esquadria sem número e sem tipologia não cai em cima da primeira** (`aplicarProposta`, `levantamento-em-montagem.ts`): o teste dos cinco
  turnos revelou que duas esquadrias na mesma proposta, sem `ordem` e sem `tipologia` (o modelo pergunta qual é), iam AMBAS para a esquadria padrão e
  a segunda sobrescrevia a primeira — a resposta ao item 4 da medição ("alguma validação SUBSTITUI?") é sim, neste caso. Agora a proposta marca as
  esquadrias que já tocou: a seguinte vai para a esquadria ainda não tocada que não tem nenhum dos campos propostos ("Branco" para duas esquadrias
  sem cor vai nas duas sem cor), senão para qualquer não tocada, e só sem nenhuma não tocada vira uma esquadria nova (as duas do Jorge Koss no
  primeiro turno). Com `ordem` dita ou com tipologia, nada mudou.

**Prova:** bloco (37) de `atendimentos-ia-levantamento-por-nome.test.ts` — os cinco turnos (o cliente vincula no PRIMEIRO, `rota=NOVO nome=do_cliente`,
as duas esquadrias gravadas com medida, quantidade e vidro; a lista reenviada não perde nem duplica; "Branco" nas duas; as tipologias; o apanhado e o
"sim" com as DUAS completas; nenhuma resposta repetida); a lista pelo acumulado nos turnos sem palavra (`lista=2/3 trechos=2`) e a validação contra a
lista inteira; sem palavra nenhuma, `lista=3/3 trechos=0`; a rede de segurança (`trechos_sem_candidata=1`) e a palavra que não é tipo; `itens_sem_campos`
com a saída que a produção devolvia; as funções do filtro (palavras do tipo, tipos ditos, trechos, união, ordem, a sem tipo, o limite da DP-167).
Ajustados: (8) e (9) (sem strict), (33) e (36) (sem thinking), (34) (variantes por conversa). A fixture `pedidos-a-ia-sem-contexto.json` foi regravada
(sem `strict`, sem `thinking`). Os testes novos ficam vermelhos com o código da main. Mutações do código (`mutacoes-koss.py`, o resultado no PR).


## O caso da Maria Cristina: a montagem não absorve outro cliente e expira em 24 h; a cor predominante, a pergunta pelo já dito e a tipologia padrão no código — dono do produto, 05/11/2026 (migração `20261105000001`, PENDENTE)

**O caso real (05/11/2026, 16:26–16:29 UTC, De Paula).** O vendedor mandou "quero orçamento / 1 Porta janelas de correr 2 folhas com vidro comum
6 mm incolor 2,50 x 2,20 / 1 janela maxim ar, mini boreal 60 x60 / Cliente: Maria Cristina / Local: Porto Alegre". A conversa (A) gravou as duas
esquadrias no levantamento "Jorge Koss", aberto duas horas antes e ainda EM_MONTAGEM, porque a rota MONTAGEM vinha ANTES do nome e a montagem não
expirava; (B) perguntou a cor do perfil com `cor_predominante "BRANCO"` cadastrada na categoria Perfil; perguntou "É janela ou porta? Abre de correr…"
de uma "janela maxim ar"; e deixou a porta de correr lisa à espera de o modelo escolher entre as doze portas de correr. (C) O cálculo não fecha por
dado do motor (`N` sem Padrão na DP-01; `ARRP`/`ARR` indefinidos em 242 linhas) — **parado até o dono do produto responder**. O padrão da
**maxim-ar** foi nomeado no mesmo dia (DP-01) e está implementado abaixo.

**A decisão, registrada como foi dita:**

> "A) Em MONTAGEM, leia cliente/nome/novo da mensagem. Cliente diferente do levantamento em montagem, ou 'novo', abre levantamento NOVO em vez de
> absorver. Expire a montagem em 24 h, como a pergunta em aberto, com registro. B) Cor não dita = cor_predominante da categoria Perfil, comparada SEM
> CAIXA contra a lista e gravada como está na lista ('BRANCO' cadastrado tem de casar com 'Branco' da lista). Nunca pergunte cor quando houver
> predominante. A pergunta fixa da tipologia para de perguntar o que o acumulado já diz: se o vendedor já disse 'janela maxim ar', não pergunte 'é
> janela ou porta? abre de correr?'. Padrão no CÓDIGO, não no modelo: correr sem folhas ditas = 2 folhas; porta sem informação = 2 folhas."

E, perguntado sobre o índice único "um EM_MONTAGEM por remetente" (da `20261025000003`), que impede a decisão A: **"Migração: derrubar o índice"**
(05/11/2026). Descartados: um estado ABANDONADO (mais código, e o índice ficaria), fechar o antigo como COMPLETO (mentiria) e recuar na decisão A.

**O que está implementado:**

- **A migração `20261105000001_varias_montagens_por_remetente.sql`** (PENDENTE; md5 no PR): `DROP INDEX IF EXISTS orcamentista_levantamento_um_em_montagem`,
  só isso. Guarda: a tabela existe e, se o índice existe, tem a definição medida em produção (outra definição aborta). Verificação: o índice não existe
  mais; as 6 constraints e os 3 outros índices como medidos (`nome_key` e o CHECK do estado NÃO mudam); o comentário da tabela registra. **Sem ela o
  código do PR quebra no caso que corrige**: a mensagem que sai da montagem cria um segundo EM_MONTAGEM e o INSERT cai em 23505 ("Não consegui concluir:
  houve um erro ao gravar o levantamento"; `desfecho=erro motivo="orcamentista_levantamento: duplicate key…"`). Harness em `scripts/harness/varias-montagens/`
  (11 casos, 7 mutações vermelhas, V6 limite declarado, M0 verde).
- **A) A montagem lê a mensagem** (`conversa-da-ia.ts`): a pergunta em aberto é lida SEMPRE (antes, só fora da montagem); depois da 1ª chamada, o nome na
  mensagem (`nomeDaMensagem` ou `nomeDoCliente`) diferente do nome da montagem (`normalizarNome` dos dois, sem o prefixo "Levantamento"), ou `novo: true`,
  tira a mensagem da montagem (`saiDaMontagem`): ela segue o roteamento pelo nome com a pergunta em aberto que houver, e o log diz `montagem=outro_cliente`
  ou `montagem=novo`. O levantamento em montagem **não é tocado**. O mesmo nome, ou nenhum nome e nenhum "novo", continua na montagem como antes.
- **A) A montagem expira em 24 h** (`pergunta-em-aberto.ts`: `montagemExpirou(atualizado_em, criado_em, agora)`, o mesmo prazo da pergunta em aberto;
  `atualizado_em` vazio ou nulo cai no `criado_em` — ausente não é "agora"): a montagem sem toque há mais de 24 h não captura a mensagem; fica no banco
  como está (EM_MONTAGEM, alcançável pelo nome), e o log diz `montagem=expirada`. `lerLevantamentos` passou a ler `atualizado_em`. Havendo VÁRIAS vivas
  (a migração), a mensagem sem nome cai na **mais recentemente tocada**.
- **B) A cor predominante** (`levantamento-da-conversa.ts`: `lerPerfilDaEmpresa(tenantId) → { cores, corPredominante }`; `lerCoresDaEmpresa` delega): o
  `cor_predominante` da categoria PERFIL é casado por `normalizarNome` contra a lista `cores` e devolvido **como está na lista** ("BRANCO" → "Branco");
  fora da lista, ou sem lista, é nulo (nunca uma cor inventada). Na conversa, a esquadria que diz alguma coisa e ficou sem `cor_perfil` recebe a
  predominante **antes das pendências**: a cor nunca é perguntada quando há predominante; a cor dita vence. O log diz `cor_padrao=N`.
- **B) A pergunta fixa pelo já dito** (`pre-definicao.ts`: `perguntasDaTipologia(jaDito)`, `JaDito = { abertura, tipo }`, `NADA_DITO`): três conjuntos de
  três perguntas — abertura dita (sem "É janela ou porta?"), tipo dito (sem "Abre de correr…"), os dois ditos (só folhas, persiana, bandeira, peitoril);
  nada dito, as `PERGUNTAS_DA_TIPOLOGIA` de sempre. `filtrarPeloAcumulado` devolve `jaDito` (algum trecho do acumulado com abertura / com tipo do motor)
  e `lidos` (os trechos com o texto). `perguntaDasPendencias` e `perguntaDaPendencia` recebem o `jaDito`; as alternativas da pergunta repetida vêm do
  mesmo conjunto.
- **B) A tipologia padrão no código** (`tipologia-padrao.ts`, puro: `tipologiaPadrao(item, abertura, trechos, candidatos)`): a esquadria que ficou sem
  tipologia válida ganha a **de correr LISA de 2 folhas** da abertura dela quando: a abertura é dita; o trecho dela no acumulado diz "correr" (tipo do
  motor) ou, sendo PORTA, não diz tipo nenhum ("porta sem informação = 2 folhas"); as folhas ditas (`folhasDitas`: número ou palavra + folhas/caixilhos)
  são 2 ou nenhuma; nada no trecho está fora do padrão (`FORA_DO_PADRAO`: persiana, veneziana, bandeira, peitoril, trilho, embutido, alumínio, tela,
  módulo, divisão, fixo, vidro duplo, pivotante, oscilo, basculante, projetante, abrir, giro, maxim, guilhotina, camarão, sanfona); há **exatamente uma**
  candidata cuja descrição no prompt é `PORTA|JANELA DE CORRER 02 FOLHAS MÓVEIS` + linha (duas linhas = nenhuma: não se escolhe por nós); e a medida cabe
  nos limites dela (fora, nada — nunca "a mais próxima"). Janela sem tipo dito NÃO tem padrão (pode ser maxim-ar, de abrir…). Os motivos da recusa são
  nomeados (`SEM_ABERTURA | SEM_TRECHO | TIPO_NAO_E_CORRER | JANELA_SEM_TIPO | FOLHAS_DITAS | FORA_DO_PADRAO | CANDIDATAS | LIMITES`). O log diz
  `tipologia_padrao=N`. Na De Paula, as lisas são a DP-02 (janela, EUROPA 42) e a DP-39 (porta, EUROPA 42) — e a DP-239 (porta, EUROPA 60) só existe
  no teste de contraste.
- **B) A maxim-ar padrão** (dono do produto, 05/11/2026, registrado como foi dito: "o padrão da maxim-ar está decidido: DP-01 (linha DESIGN), que é
  o modelo mais usado. Pode implementar na mesma PR do B."): a janela cujo trecho no acumulado diz SÓ o tipo maxim-ar é a `PADRAO_DA_MAXIM_AR = 'DP-01'`
  quando nada está fora do padrão dela (`FORA_DA_MAXIM_AR`: persiana, veneziana, bandeira, peitoril, trilho, tela, módulos, travessa, vertical,
  coluna, divisão, fixo, vidro duplo e qualquer outro tipo — correr, abrir, giro, pivotante, oscilo…), não diz mais de uma folha, a DP-01 está no motor
  da empresa e a medida cabe nos limites dela. A maxim-ar com outro tipo no mesmo trecho, ou com a palavra "porta", não tem padrão. **Sem a DP-01 no
  motor, nenhum padrão** — nunca a primeira maxim-ar da lista. Medido em 05/11/2026: são 15 maxim-ar no motor da De Paula; a DP-01 é a única da linha
  DESIGN, alt 352 a 1.152, largura sem limite. **O cálculo da DP-01 continua dependendo de `N`** (sem padrão na aba Variáveis) — é o item C, parado.
- **A esquadria COM tipologia e sem número vai na primeira sem tipologia que a proposta ainda não tocou** (`aplicarProposta`): no caso real, a maxim-ar
  DP-01 caía em cima da porta sem tipologia da mesma mensagem — o irmão do defeito do Jorge Koss (#229), agora para o ramo com tipologia.

**O que não muda:** a validação da tipologia e da cor contra a lista inteira; a recusa porta × janela; o `nome_key` (um nome por remetente) e o CHECK do
estado; a pergunta em aberto fora da montagem; a ordem das respostas às pendências.

**Testes:** bloco (38) de `atendimentos-ia-levantamento-por-nome.test.ts` (o caso real em dois níveis — a montagem sai e o turno fecha; mesmo nome e
nenhum nome continuam; "novo" sem nome; outro nome existente → ALTERAÇÃO; 25 h expira e 23 h não; duas montagens vivas → a mais tocada; a predominante
em quatro formas; `perguntasDaTipologia` nas quatro combinações e na conversa; a tipologia padrão e cada motivo; `folhasDitas` e `FORA_DO_PADRAO`); os
blocos (2), (4), (22) e (32) ajustados à regra nova; o banco falso sem o índice (`violaUnica`) e carimbando `atualizado_em` no INSERT, como em produção.
Mutações do código em `scripts/harness/levantamento-por-nome/mutacoes-maria.py`.

## A observabilidade por etapa: cinco linhas por turno, o que entrou, o que saiu e o que faltou — dono do produto, 05/11/2026 (sem migração)

Formulação do dono do produto, registrada como está:

> "Cada etapa do atendimento tem de dizer, no log, o que recebeu, o que fez e o que faltou — para a gente saber em qual delas o erro ocorreu,
> sem adivinhar." E, na autorização: "Nível 2, só log, sem mexer no fluxo. Uma linha por etapa, com entrada, resultado e falta."

- **As cinco linhas** saem juntas na saída única do turno (`anotar`, `conversa-da-ia.ts`), logo depois da `[IA]`, sempre na ordem; a etapa que o
  turno não alcançou diz `nao_chegou` (o apanhado ainda sem o "sim" não chega ao cálculo; o turno sem nome não chega ao casar):
  - `[ETAPA 1 coletar] historico= retidas= esquadrias= campos= itens_sem_campos= faltou=e1:vidro,…` — o que a mensagem e as esquadrias retidas
    trouxeram; `faltou` é o que ainda não foi dito, por esquadria (a quantidade não dita é 1 e não conta). Com a IA falhando: `ia=<desfecho> faltou=ia`.
  - `[ETAPA 2 casar] lista= trechos= propostos= descartados= escolhidas=e1:DP-39,… padrao=e1:DP-39 recusadas=e1:ABERTURA:DP-100 sem_tipologia=` —
    o casamento com o catálogo e o motor: o que valeu, o que o CÓDIGO pôs pelo padrão e o que ele descartou.
  - `[ETAPA 3 montar] rota= esquadrias= agrupadas= caminhos=e1:GRAVADA_NOVA,… pendencias= gravadas= estado= faltou=e1:cor,e2:escolha:ARI,e3:familia` — a mesma lista de
    pendências que a pergunta cobre, e o que se gravou.
  - `[ETAPA 4 calcular] esquadrias= pecas= barras= codigos= sem_preco= mao_de_obra=ok|falta|sem_calculo desfecho= faltou=e1:VARIAVEL_SEM_VALOR:AT,SEM_PRECO:1023,…`
    — o resumo que `mensagemDoLevantamento` passa a devolver em `etapa` (`ResumoDoCalculo`): peças pela quantidade cortada, barras compradas, códigos
    distintos; a falta é `e<n>:<MOTIVO>[:<variável, código ou perfil>]`. A recusa do avaliador no levantamento de barras passou a carregar a
    `variavel` onde nasceu (`RecusaDoLevantamento.variavel`, opcional).
  - `[ETAPA 5 responder] desfecho= enviou= redacao= gravacao=`.
- **SÓ LOG.** O texto, o desfecho e o preço não mudam: os testes do cálculo comparam o texto e o desfecho exatos, como antes, e o resumo à parte.
  Só contagens e códigos — nunca o texto do vendedor, o telefone, a chave ou valor em reais (o caso (39) confere).
- **Prova:** bloco (39) de `atendimentos-ia-levantamento-por-nome.test.ts` (o apanhado, o "sim", a pergunta, o padrão e a recusa, a IA que falha, o
  turno sem nome, cinco por turno); o resumo em `levantamento-da-conversa.test.ts`; a variável em `levantamento-de-barras.test.ts`; mutações em
  `scripts/harness/levantamento-por-nome/mutacoes-etapas.py`.

## O tempo de fabricação vem no ARQUIVO do motor — dono do produto, 05/11/2026 (migração `20261106000001`, PENDENTE até o dono do produto aplicar)

Paga a dívida de 27/10/2026 ("o tempo de fabricação de cada tipologia virá na tabela das tipologias [...] tudo dentro do motor, em uma coluna
específica"). Formulação do dono do produto, registrada como está:

> "Aba "Detalhe Tipologias", cabeçalho exato: Tempo fabricação (min) — Minutos inteiros, por unidade de esquadria. — Vazio = não informado: sem linha
> de tempo, mão de obra "não sai", nomeada. Vazio NUNCA vira 0. — Zero, negativo ou texto: recusa nomeando linha e coluna. — tempo_origem = IMPORTADO.
> Acrescente uma coluna irmã, opcional: Origem do tempo. Quando preenchida, vai para tempo_origem no lugar de IMPORTADO [...] Vazia, usa IMPORTADO."
> E as três decisões por pergunta: "troca de arquivo que perderia tempos é RECUSADA e nomeada; origem é texto livre de 1 a 120 caracteres, vazia vira
> IMPORTADO; cabeçalho parecido é recusado nomeando o que achou e o que esperava." (O limite era 60; o dono do produto o subiu a 120: "a maior tem 85
> caracteres".)

- **O leitor** (`src/utils/atendimentos-ia-tempos-do-motor.ts`, chamado por `lerOMotor`): as duas colunas são OPCIONAIS e lidas pelo nome, em qualquer
  posição; o tempo vai para `orcamentista_motor_tipologia_tempo`, não para a Detalhe (a linha da Detalhe não ganha coluna). Recusas, todas de uma vez e
  junto com as das abas, nomeando a linha e a coluna: zero, negativo, decimal, texto (também "60"), data, fórmula sem resultado, erro do Excel, acima
  do maior `integer`; a origem acima de 120 caracteres (contados por caractere, como `char_length`); **leitura do assistente, dita no PR:** a origem
  preenchida numa linha SEM tempo, e o tempo numa linha sem o Código. Cabeçalho que, sem acento, caixa e espaço sobrando, é igual a um dos dois e não
  é o exato: recusa nomeando o achado e o esperado. O padrão `IMPORTADO` mora **só no leitor** (a função exige a origem preenchida).
- **A função** `superadmin_criar_motor` aceita a lista `tempos` (opcional: o código de antes não a manda), confere cada um (tipologia de uma linha da
  Detalhe, sem repetir; minutos de 1 ao maior integer; a origem como a CHECK), grava por `motor_id` com o autor, loga e **devolve a contagem**. A rota
  confere a contagem (`LISTAS_DO_MOTOR_DA_ETAPA` ganhou `tempos`): a função de antes da migração não a devolve, e a resposta é 500 com os dois lados —
  nunca sucesso com o tempo descartado (o motor fica criado; a função já fez COMMIT).
- **A troca de arquivo que perderia tempo é RECUSADA** (`superadmin_trocar_arquivo_do_motor`, antes de qualquer escrita, com o antigo travado): o
  antigo tem tempo numa tipologia que o arquivo novo traz na Detalhe sem tempo — coluna ausente ou célula vazia. A recusa nomeia até dez tipologias e
  diz quantas sobram. **Leitura do assistente, dita no PR:** a tipologia que SAIU do arquivo não conta como perda (o motor novo não a tem). Os tempos do
  antigo ficam nele, intactos.
- **A CHECK** `orcamentista_motor_tipologia_tempo_origem` passa de `('ESTIMADO', 'IMPORTADO')` a texto de 1 a 120 caracteres sem espaço nas pontas;
  os dois valores de antes continuam válidos. A origem aparece ao vendedor no levantamento ("600 min por unidade (cronometrado em fábrica)").
- **A tabela com motor colado (legado; 0 em produção em 06/11/2026)** recusa o arquivo com tempo: a importação da tabela grava por `tabela_id` e não
  grava tempo — o tempo entra só pelo catálogo de motores.
- **Medido em produção em 06/11/2026 (só leitura):** 1 motor (`20f66b59…`, 164 tipologias), 0 tempos; os corpos das duas funções com o md5 da
  `20261029000005` (sem o `\r`). Como o motor de hoje não tem tempo, a primeira troca de arquivo nunca é recusada.
- **Prova:** `scripts/harness/tempo-no-arquivo-do-motor/` (a base de `nome-do-motor-e-arquivar`, a migração duas vezes, 11 casos, 5 guardas, o
  contraste dos corpos em CRLF; `mutacoes.py` e `mutacoes-codigo.py`); `atendimentos-ia-tempos-do-motor.test.ts`, o bloco (9) das rotas e os portões
  de `atendimentos-ia-catalogo-de-motores.test.ts`, que passaram a ler a última migração que escreve a função.

## A quantidade dita SUBSTITUI, nunca soma; e o vidro com o rótulo uma vez — dono do produto, 06/11/2026 (sem migração)

**O caso medido (06/11/2026, 12:53 UTC, De Paula):** a mensagem "quero orçamento / 1 Porta janelas de correr 2 folhas com vidro comum 6 mm incolor
2,50 x 2,20 / 1 janela maxim ar, mini boreal 60 x60 / Cliente: Maria Cristina" foi reenviada inteira ao levantamento "Maria Cristina", que já tinha
DP-39 ×1 e DP-01 ×1. A linha `[IA]` disse `rota=ALTERACAO propostos=12 agrupados=2`: as duas esquadrias entraram de novo e o agrupamento as SOMOU
às gravadas — o apanhado saiu "2 unidade(s)" nas duas. E saiu "vidro vidro comum 6 mm incolor": o rótulo na frente de um valor que já o traz.

Formulação do dono do produto, registrada como está:

> "Mesma esquadria, quantidade dita. A quantidade dita SUBSTITUI, nunca soma. Para acrescentar mais uma igual, o vendedor diz o total ("2 portas").
> Não reconheça "mais" nem nenhuma outra palavra para decidir somar." E: "registre no log, por esquadria, qual foi o caminho: GRAVADA_NOVA,
> SUBSTITUIU_QUANTIDADE ou IGNORADA_IGUAL. O log atual só disse "agrupados=2", que é o que escondeu a causa." E, à pergunta: "Manter o 1" — a
> quantidade não dita continua sendo 1 (03/11/2026).

- **`agruparIguais(itens, origem)`** recebe quais esquadrias já estavam GRAVADAS e quais levam o 1 do padrão (`aplicarProposta` devolve
  `quantidadesPadrao`). A esquadria da mensagem igual a uma gravada (os mesmos critérios do agrupamento, o vidro pela forma canônica) é ela mesma:
  com outra quantidade DITA, a dita fica no lugar (`SUBSTITUIU_QUANTIDADE`); com a mesma, ou sem quantidade dita, nada muda (`IGNORADA_IGUAL`). A
  diferente é `GRAVADA_NOVA`. Duas linhas iguais da MESMA mensagem continuam somando (03/11/2026) — `SOMADA_NA_MENSAGEM` —, e o total delas é o que
  substitui a gravada. Duas gravadas que ficam iguais (uma alteração por número) somam, como antes. O reenvio idêntico, portanto, não muda nada,
  quantas vezes vier, e a resposta segue como se a mensagem tivesse vindo uma vez (não "não apliquei").
- **Vale também para o acréscimo confirmado** (a esquadria retida que entra num levantamento existente): igual a uma gravada, substitui — nenhuma
  palavra, nem o "sim", decide somar.
- **O log:** `caminhos=e<ordem final>:<CAMINHO>,…` na linha `[IA]` e na `[ETAPA 3 montar]`.
- **O vidro** (`vidroNoApanhado`, `apanhado.ts`): o valor gravado que já começa por "vidro" ou "vidros" (sem caixa nem acento) vai como está; o que não
  começa ganha "vidro " na frente. O gravado continua o que o vendedor escreveu (04/11/2026). O teste de 04/11 que afirmava "vidro vidro 4 mm" fixava
  o defeito, e foi corrigido.
- **A regra das retidas (04/11/2026) não muda:** `juntarEsquadrias` e o bloco (29) passam como estavam.
- **Prova:** bloco (40) de `atendimentos-ia-levantamento-por-nome.test.ts` (a mensagem exata reenviada; o reenvio N vezes; "2 portas" depois de "1
  porta"; a nova; o vidro), vermelho com o código de antes; o agrupamento contra a gravada em `tipologias-candidatas.test.ts`; o vidro em
  `apanhado.test.ts`; mutações em `scripts/harness/levantamento-por-nome/mutacoes-reenvio.py` (20 de 20 mortas).
