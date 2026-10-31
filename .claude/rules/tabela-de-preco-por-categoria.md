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

## O catálogo é soberano nas quatro seções — dono do produto, 31/10/2026 (migração `20261031000003`, PENDENTE até o dono do produto aplicar; pressupõe a `20261031000002`)

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
  quem escrever o PR D tira o aviso da função e da tela (`fraseDoAviso`).
- **O impedimento (não é uso, é conflito):** na família, a tabela de outra categoria que perde a família e é **vigente** colidiria no índice
  `orcamentista_tabela_uma_vigente` com outra vigente do mesmo fornecedor e categoria sem família. A medição nomeia as tabelas e a remoção recusa (23505)
  antes de apagar. Medido em 31/10/2026: nenhuma tabela vigente em produção — o impedimento não aparece hoje. **Leitura do assistente, relatada no PR:**
  escolher qual das duas fica vigente não foi autorizado.
- **E. A falta de configuração é ERRO que nomeia o que falta e manda ver a configuração.** `conferirEtapasParaExecutar(etapas, contexto)` recusa, uma
  frase por falta, na ordem: **família** sem tipo (removida do catálogo ou nunca escolhida), **etapa** (família sem etapas), **motor** (cada etapa sem
  motor), **fornecedor** (o Perfil sem fornecedor principal). A rota das etapas da conta devolve `erros_de_configuracao`, e a tela mostra o erro (e não
  mostra "pronta" enquanto houver falta). **O fornecedor conferido é só o do PERFIL** (o que o motor lê). Medido em produção em 31/10/2026: na De Paula,
  5 das 7 categorias da PVC estão sem fornecedor principal (PERSIANAS, REFORCO, FERRAGENS, ACESSORIOS_VEDACAO, INSTALACAO) — **se a falta delas também
  impede executar está com o dono do produto**, e a conferência não as acusa até ele decidir.
- **Prova:** `scripts/harness/catalogo-soberano/` — a cadeia real com a `20261031000002` e o estado de produção medido em 31/10/2026 (os ids reais), a
  migração duas vezes, 22 casos (cada arrasto, a trava C pelos três caminhos, o log linha a linha, a assinatura, o impedimento, a linha que some no
  meio e a que sai por cascata), 3 corridas (gravar etapa × remover motor nos dois sentidos; duas remoções do mesmo item), 3 guardas, a prova de volume
  (`30_volume.sh`: ~125 mil linhas em ~5 s, limite da função 80 s) e as mutações nas duas passadas.
