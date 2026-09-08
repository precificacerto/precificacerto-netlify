# Entrega de Migração

## A regra

**PR que adiciona migração só está entregue quando a migração estiver APLICADA e VERIFICADA no
banco.** Merge não é entrega. O arquivo `.sql` no repositório é a intenção; a coluna existindo
na tabela é o fato.

**Build verde não prova schema aplicado.** `npm run build`, `tsc`, `jest` e `next lint` leem
código, não o banco. Todos os quatro passam com a migração pendente — e passaram.

## O que aconteceu (01/09/2026)

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

## Por que não existe gate hoje

O controle de migrações do banco e os arquivos do repositório **não têm relação nenhuma**.
Medido em 01/09/2026:

| | |
|---|---|
| Arquivos `.sql` em `supabase/migrations/` | 146 |
| Versões em `supabase_migrations.schema_migrations` | 130 |
| Versões em comum (por timestamp do nome) | **0** |

Zero. As migrações do banco foram aplicadas historicamente por outro caminho (Studio, MCP,
dashboard), cada uma com a sua própria versão gerada na hora. Nenhuma delas carrega o
timestamp do arquivo correspondente.

Consequência: `supabase db push`, que compara essa tabela com os arquivos, não é o caminho em
uso — e se fosse rodado hoje trataria as 146 como pendentes. Não há nada, hoje, que compare o
que o repositório declara com o que o banco tem.

Enquanto isso for verdade, **a verificação é manual e é obrigatória**.

## PENDENTE POR PADRÃO

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

### Item de INFRAESTRUTURA — rodada futura, não agora

Ligar o repositório ao banco (um gate que compare os arquivos declarados com o schema real, ou
adotar de fato o caminho que a tabela `schema_migrations` pressupõe) é trabalho de
infraestrutura, com escopo e rodada próprios. Não faz parte de nenhuma correção de defeito e
não deve ser puxado no meio de uma.

Até lá, a regra desta página é o mecanismo — não um paliativo à espera dele.

## A ORDEM depende do que a migração CRIA

O default continua sendo **pendente** nos dois casos abaixo — merge não aplica nada. O que
muda é que **"aplicar depois" NÃO é sempre seguro**.

| a migração cria | ordem correta | o que quebra na ordem errada |
|---|---|---|
| **COLUNA ou TIPO** que o código novo GRAVA | aplicar **ANTES OU JUNTO** | mergear antes deixa o código gravando em coluna inexistente |
| **FUNÇÃO** que o código novo CHAMA | aplicar **ANTES DO MERGE** | mergear antes deixa o botão chamando função inexistente |

**Caso real do primeiro:** `expense_snapshot`. O PR foi mergeado, a coluna não existia, e o
salvar de serviço quebrou em produção em 01/09/2026 — `Could not find the 'expense_snapshot'
column of 'services' in the schema cache`.

**Caso real do segundo:** `delete_sale_cascade`. Mergear sem aplicar deixaria o botão
"Excluir" na tela de Vendas chamando uma função que o banco não tem: o clique falha com
`function public.delete_sale_cascade does not exist`.

**É a mesma classe com a ordem invertida** — lá faltou aplicar DEPOIS do merge, aqui faltaria
aplicar ANTES. Para função, depois já é tarde.

### Função exige verificar TAMBÉM as dependências dela

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

### Ressalva de método: o `raw` NÃO fecha a cadeia byte a byte

Ler o arquivo em `raw.githubusercontent.com` protege contra a corrupção por tradução — foi o
que o #26 ensinou, e continua valendo. Mas há um limite que precisa estar dito por extenso:

**A leitura via `raw` NORMALIZA A INDENTAÇÃO.** A aplicação acaba sendo **token a token**, não
byte a byte, e por isso **o `md5` do arquivo NÃO é reproduzível por esse caminho**. Conferir o
`md5` depois de aplicar assim vai divergir, e a divergência não significa corrupção.

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

### Onde a ordem tem de estar escrita

Formulação do dono do produto, registrada como está:

> Corpo de PR protege ESTE merge; a regra versionada protege os FUTUROS.

Escrever a ordem no corpo do PR é necessário — é lá que quem mergeia lê, e por isso ela vai no
corpo, com destaque, em todo PR com migração. Mas não é suficiente: corpo de PR mergeado fica
soterrado, que é o diagnóstico já registrado em `registro-de-classe.md`. A diferença é que ali
o que se perdia era CONHECIMENTO, e aqui é **instrução de OPERAÇÃO** — o custo de perdê-la não
é repetir uma análise, é derrubar produção.

Por isso os dois: **corpo do PR** para o merge de agora, **esta página** para os próximos.

## Como verificar

Depois de aplicar, consultar o schema — não confiar no retorno do comando de aplicação:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = '<tabela>'
  and column_name  = '<coluna>';
```

Zero linhas = não está aplicada, independentemente do que o merge diga.

### E recarregar o schema cache

```sql
NOTIFY pgrst, 'reload schema';
```

A mensagem de erro que quebrou produção vem do **PostgREST**, não do Postgres: a coluna pode
já existir na tabela e o PostgREST continuar servindo o cache antigo. Verificar `information_
schema` prova o Postgres; o `NOTIFY` cobre a camada que de fato produziu o erro.

## Cuidado ao ler SQL para revisão

Página traduzida automaticamente pelo navegador corrompe SQL de forma convincente: nesta
mesma ocorrência, um revisor leu `ADICIONAR` no lugar de `ADD` e `despesa_snapshot` no lugar
de `expense_snapshot`, e o `COMMENT ON COLUMN` passou a parecer citar uma coluna que a linha
anterior não criava — três sintomas coerentes entre si, todos falsos.

Para revisar SQL com segurança: abrir em **raw** (`/raw/` no GitHub), ou transportar o
conteúdo em **base64**, que não é traduzido, junto com o `md5sum` do arquivo. Texto puro serve
para leitura humana, nunca como fonte de verdade na conferência.

## Relação com as outras regras

`baseline-measurement.md` cobre como medir o efeito de um PR **no código**. Esta cobre o
efeito **no banco**. As duas falham do mesmo jeito quando se confia num sinal indireto: lá,
uma contagem de erros medida na árvore errada; aqui, um build verde que nunca olhou o schema.
