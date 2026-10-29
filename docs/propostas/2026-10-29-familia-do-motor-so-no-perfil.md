# Proposta — a família do motor só no Perfil, sem perder a trava (29/10/2026)

**Decisão pedida (dono do produto, 29/10/2026, item 6):** a família do motor é obrigatória só no PERFIL e nula nas demais categorias, e a ligação
etapa ↔ motor deixa de exigir família igual quando o motor não tem família. **Este texto mede e propõe. Nada foi escrito em migração.**

## O que existe hoje (medido em produção, 29/10/2026, só leitura)

| tabela | trava | o que faz |
|---|---|---|
| `orcamentista_motor` | `familia` NOT NULL; `UNIQUE (id, familia)` | o alvo das duas FKs compostas |
| `orcamentista_familia_etapa` | `FOREIGN KEY (motor_id, familia) → motor (id, familia)`, `ON DELETE RESTRICT` | a etapa PVC só aponta motor PVC. **É a única FK da etapa para o motor: não há FK simples `motor_id → motor(id)`** |
| `orcamentista_levantamento_item` | `FK (motor_id, familia) → motor (id, familia)`, mais `FK (motor_id) → motor(id)` e `CHECK (motor_id IS NULL OR familia IS NOT NULL)` | o mesmo, no item |

O dado: 1 motor (PERFIL, PVC), 3 etapas apontando para ele, 4 itens de levantamento, **nenhum** com motor. Funções que leem a família do motor:
`superadmin_criar_motor`, `superadmin_gravar_etapas_da_materia_prima` e `superadmin_arquivar_motor`.

**Por que não basta tornar `familia` nula:** a FK é `MATCH SIMPLE`. A etapa tem `familia` NOT NULL (`'PVC'`), então a FK é sempre conferida, e
`(motor_id, 'PVC')` não casa com `(id, NULL)`: **toda etapa que apontasse motor de persiana seria recusada.** Trocar para `MATCH FULL` não ajuda.

## A proposta — a trava continua declarativa, sem gatilho

1. **No motor:**
   - `familia` deixa de ser NOT NULL.
   - Uma CHECK `(categoria_chave = 'PERFIL') = (familia IS NOT NULL)`: obrigatória no Perfil e **nula** nas demais. É a mesma regra da tabela de preço
     (`20261028000002`), só que estrita dos dois lados, como você escreveu.
   - Uma coluna gerada `familia_exigida = coalesce(familia, '*')` e `UNIQUE (id, familia_exigida)`. **`'*'` nunca é chave de família:** a CHECK
     `orcamentista_familia_catalogo_chave_forma` exige `^[A-Z][A-Z0-9_]{0,39}$`.
2. **Na etapa e no item:**
   - Uma coluna `motor_familia_exigida`.
   - Uma CHECK: ela existe se e só se há motor, e vale `familia` ou `'*'`.
   - A FK composta passa a ser `(motor_id, motor_familia_exigida) → motor (id, familia_exigida)`.
   - A FK antiga sai.
3. **As funções** passam a gravar `motor_familia_exigida = coalesce(motor.familia, '*')`; o combo da etapa oferece os motores da família **e** os sem família.

### O que a trava garante — PROVADO num Postgres 16 local, 11 casos

| caso | resultado |
|---|---|
| etapa PVC → motor PERFIL PVC | passa |
| etapa PVC → motor PERFIL ALUMÍNIO, dizendo `PVC` | **FK recusa** |
| etapa PVC → motor PERFIL ALUMÍNIO, dizendo `'*'` (tentativa de burlar) | **FK recusa**: o motor exige ALUMÍNIO, não "qualquer" |
| etapa PVC → motor PERFIL ALUMÍNIO, dizendo `ALUMÍNIO` | **CHECK recusa**: a exigida tem de ser a da etapa ou `'*'` |
| etapa PVC → motor PERSIANAS sem família | passa |
| etapa VECA → **o mesmo** motor PERSIANAS | passa: um motor só para as duas linhas |
| etapa → motor PERSIANAS dizendo `PVC` | **FK recusa** |
| etapa com motor e sem a exigida | **CHECK recusa** |
| motor PERFIL sem família; motor PERSIANAS com família | **CHECK recusa** os dois |
| trocar a família de um motor que tem uso | **FK recusa** (`ON UPDATE NO ACTION`) |
| dar família a um motor de persiana que tem uso | **FK recusa** |

Ou seja: **a trava que hoje impede PVC de usar motor de alumínio fica igual no Perfil**. Nas outras categorias ela deixa de existir **porque o motor
não tem linha**, e não porque alguém a abriu. Nada depende de a função lembrar de conferir: o banco recusa, como hoje.

## O custo

- **Uma migração**, PENDENTE como as outras, com:
  - 2 FKs trocadas, 3 CHECKs e 1 coluna gerada;
  - 2 colunas novas (etapa e item);
  - 2 ou 3 funções reescritas: criar motor, gravar etapas, e a de trocar o arquivo, se já existir.
- **Um preenchimento, que precisa da sua autorização:** as 3 etapas de hoje ganham `motor_familia_exigida = 'PVC'` (o motor delas é PERFIL PVC).
  - Aborta se houver etapa com motor de outra família ou motor sem família.
  - Antes e depois vão no log.
  - Os 4 itens de levantamento não têm motor e não mudam.
- **O código:**
  - o combo da etapa (`motoresParaAEtapa`);
  - o "Novo motor": a família só aparece no Perfil, e vem da tabela de PERFIL do fornecedor (item 5);
  - os leitores do catálogo;
  - os testes.
- **O que não muda:** o motor da Wolff (PERFIL, PVC), as 62.299 linhas, os tempos, a conversa.

## A alternativa, e por que não

**Gatilho** nos dois lados: na etapa, conferindo a família do motor; no motor, conferindo as etapas ao mudar a família. Funciona, mas a trava sai do
catálogo de constraints e passa a ser código: some numa troca de função e não aparece em `pg_constraint`. A coluna gerada mantém tudo declarativo,
pelo mesmo custo.

## Pergunta que fica com você

**Dar família a um motor que hoje não tem** (de PERSIANAS para PERFIL, numa edição) só é possível sem uso — a FK recusa com uso, e a decisão 4 já
restringe a edição a motor sem uso. Nenhuma outra pergunta pendente nesta proposta.
