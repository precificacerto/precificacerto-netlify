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
de família, as abas e os **164 tempos ESTIMADO** pendem do `tabela_id` dela. Os tempos foram **digitados à mão** e
**não estão no arquivo**. Portanto:

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

## O que NÃO está implementado ainda — não presuma

- **O preço pelo principal da ramificação:** hoje os leitores usam as tabelas dos fornecedores vinculados
  (`tabelas-da-conta.ts`), sem filtrar por categoria nem por principal. Trocar isso é trabalho dos leitores (PR D).
- **A Wolff continua sem categoria**, com as categorias do fornecedor misturadas no mesmo arquivo, e é a fonte que a
  conversa ainda lê. Sai de circulação por decisão do dono do produto, **depois** do PR D.
- **O índice `orcamentista_tabela_uma_vigente` é por (fornecedor, família):** três tabelas da Wolff na mesma família
  (Perfil, Reforço, Acessórios) não podem ser as três vigentes. Se a regra do principal dispensar a vigente na
  escolha do preço, isso não atrapalha; se não, o índice precisa incluir a categoria. Decisão do PR D.
- **O arquivo do motor continua obrigatório** em toda tabela nova (`motor_path`/`motor_nome` NOT NULL, `MENSAGEM_MOTOR_OBRIGATORIO`),
  mesmo para Reforço e Acessórios, que não têm motor próprio: o motor mora em `orcamentista_motor` desde o PR C.
- **REFORCO e ACESSORIOS_VEDACAO da De Paula não têm fornecedor vinculado** (medido em 27/10/2026): com a regra do
  principal, o preço delas não tem de onde vir até alguém vincular.

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
   vence**, e **arquivar planilha que uma etapa aponta é recusado** — isto último **ainda não está implementado**: a
   função de arquivar de hoje não sabe das etapas.
2. **`superadmin_gravar_etapas_da_familia` recusa `motor_id`** (lista fechada): hoje ninguém aponta o motor de uma
   etapa pela tela. Muda junto com o código.
3. **A conta só enxerga planilha de fornecedor que ela vincula** (`motor-da-conta.ts`): planilha sem fornecedor
   (permitida pela `20261027000006`) não aparece para conta nenhuma.
4. **`tabelas-da-conta.ts` e `tabelaVigenteDoPar` assumem uma vigente por (fornecedor, família)**; com o índice por
   categoria podem existir várias.

**Em aberto, sem resposta (27/10/2026):** a redução por tipologia vale para qualquer fornecedor de PVC? Não se sabe:
só há um fornecedor de PVC em produção, e as constantes de geometria (119 das 137 fórmulas de família) estão
indexadas por LINHA (EUROPA 42/60, DESIGN), que são linhas da Wolff.

## O corolário aplicável ANTES do defeito existir

Antes de tirar uma tabela de fornecedor de circulação — arquivar, substituir o arquivo, apagar —, pergunte **o que
pende do `tabela_id` dela** (consulte as 14 tabelas do motor e os tempos), e não só o que a tela mostra. O que foi
digitado à mão e não está no arquivo (`orcamentista_motor_tipologia_tempo`) não volta com uma reimportação
(`tabela-que-a-importacao-apaga.md`, camada 3).
