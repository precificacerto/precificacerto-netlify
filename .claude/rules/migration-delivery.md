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
