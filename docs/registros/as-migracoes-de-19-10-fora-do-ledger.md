# As três migrações de 19/10 estão no banco e fora do ledger

Data: 19/10/2026 · Atendimentos I.A., blocos 2B.1 e 2B.2

> **REGISTRO, NADA APLICADO.** Este arquivo descreve um estado e o procedimento para acertá-lo.
> Nenhuma linha do ledger foi escrita, nenhuma migração foi criada, e o banco não foi consultado
> nesta rodada. O acerto é escrita no banco de PRODUÇÃO e depende de autorização do dono do
> produto.

## O fato medido

| migração | o que faz | no banco | em `supabase_migrations.schema_migrations` |
|---|---|---|---|
| `20261019000001_atendimentos_ia_bloco_2b1` | as quatro tabelas do catálogo, `modelo`/`nicho_id` em `orcamentista_config`, o bucket `atendimentos-ia` e as políticas | aplicada | **ausente** |
| `20261019000002_comprovantes_presos_ao_tenant` | as três políticas do bucket `comprovantes` presas ao tenant | aplicada | **ausente** |
| `20261019000003_nichos_iniciais` | os 12 nichos da semente | aplicada | **ausente** |

As três foram aplicadas pelo **SQL Editor**, que não grava no ledger. Medido em 19/10/2026, por
consulta de leitura: o ledger termina em **`20261017185237`**. A aplicação e os objetos estão
registrados nos cabeçalhos das próprias migrações, com o md5 de cada uma como aplicada.

**O ledger NÃO foi reconsultado para escrever este registro.** Por `estado-relatado-vs-real.md`,
o estado acima é fonte secundária até alguém o medir de novo — e é por isso que o passo 0 do
procedimento é medir.

## Por que hoje não quebra nada

- **Nada em execução lê o ledger.** Nenhum arquivo de `src/` ou `scripts/` cita
  `schema_migrations`, e o `ci.yml` não tem passo nenhum do Supabase (zero ocorrências de
  `supabase`). O ledger só é lido pelo CLI, e só quando alguém o roda.
- **O app depende dos OBJETOS, e eles existem.** Tabela, coluna, política e linha estão no banco;
  o ledger é o histórico de quem os criou, não a condição para existirem.
- **Não é a primeira vez, e a pasta nunca foi a fonte.** `migration-delivery.md` mediu em
  15/09/2026: 142 arquivos locais sem versão remota, 133 versões remotas sem arquivo, 4 em comum.
  As três de 19/10 são três a mais no mesmo quadro, não uma exceção a ele.

## O que quebraria num `supabase db push`

Pela documentação oficial do CLI (`supabase db push`, e o guia "Database Migrations" —
*"Diagnosing and fixing sync errors"*): o `db push` compara a pasta `supabase/migrations` com o
ledger e **roda, em ordem, as que não estão lá**. Para registrar sem rodar, o caminho previsto é
`supabase migration repair`.

**1. O problema é maior que as três — e acertar as três não torna o `db push` seguro.** Com 142
arquivos sem versão remota, o `db push` os trataria como pendentes, e com 133 versões remotas sem
arquivo o histórico está fora de sincronia — o caso em que a própria documentação diz que o push
falha pedindo `migration repair`. É o item de INFRAESTRUTURA de `migration-delivery.md`, e ele
continua aberto depois deste acerto.

**2. Se o push chegasse às três**, na ordem da versão:

| migração | o que aconteceria | por quê |
|---|---|---|
| `…000001` | **falha no primeiro statement** e desfaz o arquivo inteiro; o push para | `CREATE TABLE public.orcamentista_nicho` sem `IF NOT EXISTS`, e a tabela existe. O `BEGIN`/`COMMIT` do arquivo desfaz o que veio antes no mesmo arquivo |
| `…000002` | **não chegaria a rodar**, porque a `…000001` para o push antes. Rodada sozinha, **passaria** | ver a correção abaixo |
| `…000003` | rodaria sem efeito: 0 linhas | `ON CONFLICT (modelo, lower(nome)) DO NOTHING` |

**3. O `supabase/config.toml` não aponta para a produção.** `project_id = "web-app"` é o
placeholder do `supabase init` (`migration-delivery.md`). Qualquer comando do CLI exige antes
`supabase link --project-ref` para o projeto certo — um passo a mais em que se pode errar o alvo.

### Uma correção de registro — o cabeçalho da `…000003` errava a razão

O cabeçalho de `20261019000003_nichos_iniciais.sql` **dizia, até 19/10/2026**, que num
`db push` *"as irmãs não [sobrevivem] — a 20261019000001 tem CREATE TABLE sem IF NOT EXISTS, e a
20261019000002 tem DROP POLICY sem IF EXISTS"*. A citação é do texto como ele estava antes do
commit `docs(db): corrige afirmacao errada sobre a migracao dos comprovantes`, que o substituiu.
A primeira metade estava certa. **A segunda não estava:** `DROP POLICY` sem
`IF EXISTS` só falha quando a política **não existe** — e as três políticas existem, porque a
própria `…000002` as recriou com os mesmos nomes (`comprovantes_select_policy`,
`_insert_policy`, `_update_policy`). Rodada de novo, ela as derruba e recria iguais, numa
transação só, e termina sem erro.

O cabeçalho foi escrito pelo assistente, e a primeira versão deste registro não o alterou: o
pedido daquela rodada era só registrar. **Ele foi corrigido em 19/10/2026**, por instrução do
dono do produto, no mesmo commit que datou esta citação — só as linhas de comentário. O md5
das linhas que não são comentário nem vazias continuou `d3dcc4829f8777177892cdba51baf155`, antes
e depois: o SQL executável não mudou. O erro fica registrado aqui para que ninguém conte com uma
falha que não acontece.

## O procedimento — NÃO executado

**0. Medir antes, sem escrever.** O estado acima é de 19/10.

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 5;
-- esperado: o mais recente é 20261017185237, e nenhuma linha com 20261019 no version ou no name

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
order by ordinal_position;
-- as colunas REAIS do ledger: o passo 2, por SQL, depende delas e não pode supô-las
```

E os objetos, para não registrar como aplicado o que não está: as quatro tabelas `orcamentista_*`
novas, `orcamentista_config.modelo` e `.nicho_id`, as políticas `atendimentos_ia_*` e
`comprovantes_*_policy` em `storage.objects`, e os 12 nichos.

**1. Decidir QUAL versão gravar — decisão do dono do produto.**

| opção | `version` | `name` | efeito |
|---|---|---|---|
| (a) | o prefixo do arquivo — `20261019000001`, `…02`, `…03` | o nome do arquivo sem `.sql` | o CLI passa a reconhecer as três como aplicadas: entram nas "em comum", como as quatro de fevereiro |
| (b) | o instante da aplicação | o nome do arquivo sem `.sql` | segue o formato das aplicadas pelo conector (versão gerada, nome do arquivo). Mas o SQL Editor não gerou versão, e o instante teria de vir dos logs — um número reconstruído, não gravado |

A convenção de `migration-delivery.md` (o `name` é o nome completo do arquivo) vale nas duas. A
(a) é a única em que o `db push` deixaria de ver as três como pendentes. **Recomendação: (a).** A
escolha é do dono do produto.

**2. Gravar, sem rodar o SQL das migrações.** Dois caminhos:

- **pelo CLI:** `supabase link --project-ref jvthwpkwzpangnwhuyvj` e depois
  `supabase migration repair --status applied 20261019000001 20261019000002 20261019000003`.
  É o caminho que a documentação prevê para "inserir sem rodar". Só serve para a opção (a).
  Antes de rodar, confirmar que o `link` apontou para a produção.
- **por SQL:** um `INSERT` nas colunas que o passo 0 mediu, com `ON CONFLICT DO NOTHING` se a
  chave permitir. O texto do `INSERT` é conteúdo autorizado por hash: publicar o md5 dele antes
  da tela de aprovação (`transformacao-quebra-a-cadeia-de-hash.md`).

**3. Verificar depois** — por consulta, não pelo retorno do comando (`migration-delivery.md`):
o ledger tem exatamente três linhas a mais, com as versões e os nomes decididos no passo 1, e
nenhuma outra linha mudou.

**4. O que o acerto NÃO resolve.** Os 142 arquivos sem versão remota e as 133 versões sem arquivo
continuam fora de sincronia. Depois do acerto o `db push` **continua inseguro**. Este procedimento
fecha as três de 19/10, e só elas.

## Relação com as outras regras

`migration-delivery.md` tem o quadro geral do ledger, a convenção de nome e o item de
infraestrutura que este acerto não fecha. `estado-relatado-vs-real.md` é a razão do passo 0.
`transformacao-quebra-a-cadeia-de-hash.md` vale para o `INSERT` do caminho por SQL. E o cabeçalho
corrigido acima é o mesmo erro de `estado-relatado-vs-real.md` em escala pequena: uma afirmação
sobre o que o banco faria, escrita sem conferir quando ela falharia.
