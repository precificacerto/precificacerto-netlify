---
paths:
  - "src/lib/atendimentos-ia/**"
  - "src/pages/api/super-admin/atendimentos-ia/**"
  - "src/page-parts/atendimentos-ia/**"
  - "src/utils/atendimentos-ia-*.ts"
  - "supabase/migrations/*motor*"
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

## O que NÃO está implementado ainda — não presuma

- **A categoria obrigatória no upload e a recusa de arquivo com mais de um segmento:** é código do PR que vem
  depois do C. Hoje a importação aceita a tabela da Wolff com os quatro segmentos.
- **O preço pelo principal da ramificação:** hoje os leitores usam as tabelas dos fornecedores vinculados
  (`tabelas-da-conta.ts`), sem filtrar por categoria nem por principal. Trocar isso é trabalho dos leitores (PR D).
- **REFORCO e ACESSORIOS_VEDACAO da De Paula não têm fornecedor vinculado** (medido em 27/10/2026): com a regra do
  principal, o preço delas não tem de onde vir até alguém vincular.

## O corolário aplicável ANTES do defeito existir

Antes de tirar uma tabela de fornecedor de circulação — arquivar, substituir o arquivo, apagar —, pergunte **o que
pende do `tabela_id` dela** (consulte as 14 tabelas do motor e os tempos), e não só o que a tela mostra. O que foi
digitado à mão e não está no arquivo (`orcamentista_motor_tipologia_tempo`) não volta com uma reimportação
(`tabela-que-a-importacao-apaga.md`, camada 3).
