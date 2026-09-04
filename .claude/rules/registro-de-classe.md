# Registro de Classe de Defeito

Duas regras que andam juntas: **ONDE** o conhecimento fica guardado e **COMO** ele é escrito.
Separadas, cada uma falha do seu jeito — conhecimento bem escrito que ninguém acha, ou
conhecimento no lugar certo que não convence ninguém.

## ONDE — arquivo versionado, nunca corpo de PR

**Registro de classe de defeito, de regra de método e de limitação conhecida vai para arquivo
versionado em `.claude/rules/` ou `docs/`, com PR aberto.** Não fica só no corpo de um PR, não
fica em branch parada, não fica em comentário de código isolado.

O precedente que estabeleceu a regra: o procedimento de limpar o `tsbuildinfo` antes de medir
o `tsc` viveu em corpo de PR até o #28 versioná-lo — e no meio do caminho a mesma medição
enganosa aconteceu de novo. **O conhecimento existia e não foi lido no momento em que
importava.** Corpo de PR mergeado fica soterrado; branch parada não é lida por ninguém.

### Corolário: a localização protege

Uma regra em `.claude/rules/` sobrevive ao ciclo de vida da funcionalidade que a originou.
Ninguém reverte uma feature de tela esperando mexer ali, e se o fizer o diff mostra. É
proteção por convenção, e é a que funciona no dia a dia.

Proteção por MECANISMO é outra coisa e exige alteração posterior no arquivo: um `git revert`
do merge que criou a página a removeria inteira, mas com um commit posterior o mesmo revert
produz **conflito**, que obriga alguém a decidir. Quando a regra nasce dentro do PR de uma
feature, vale dar a ela um commit próprio depois.

**O que NÃO protege:** dizer no corpo do PR que a regra é independente. Texto em corpo de PR
não protege arquivo nenhum.

## COMO — uma ocorrência é anedota, quatro com o mesmo padrão é critério

Formulação do dono do produto, registrada como está:

> Uma ocorrência é anedota, quatro com o mesmo padrão é critério.

Uma tabela de aparições com uma linha só descreve um caso; com quatro, descreve uma classe. A
diferença não é de volume — é que a partir da terceira ou quarta fica impossível ler o defeito
como acidente local, e o leitor passa a procurar a quinta em vez de corrigir a primeira.

### Como o padrão é encontrado

**Não é procurar por ele.** É recusar-se a registrar uma ocorrência isolada e ir atrás dos
precedentes.

O caso que ensinou isso — `ausente-vs-falso.md`: a forma tabular foi escolha deliberada,
copiada de `fato-vs-referencia.md` porque aquela página funciona. A descoberta de que havia
QUATRO aparições veio de tentar preencher a tabela e não aceitar deixá-la com uma linha. E a
pista estava na formulação do próprio dono do produto, que já citava `NULL` versus `FORA` —
ou seja, **a frase dele já apontava para mais de um caso**, antes de qualquer busca. Mérito
dividido: a forma é de quem escreveu, a pista é de quem formulou.

### O corolário aplicável ANTES do defeito existir

Todo registro de classe deve conter, quando houver, a regra que se aplica **antes** de a
próxima aparição nascer. É a parte que transforma o registro de post-mortem em prevenção.

Exemplo, de `ausente-vs-falso.md`:

> `NOT NULL DEFAULT 0` numa coluna que pode legitimamente valer zero apaga a distinção para
> sempre.

Isso não descreve um defeito passado — decide o desenho da próxima coluna. Foi o que fez as
cinco colunas de `destination_snapshot` do D-A nascerem nuláveis e sem default, sem que
nenhuma delas precisasse falhar primeiro.

### O que um registro de classe precisa ter

1. **A formulação do critério**, literal, de quem o formulou.
2. **Por que a distinção é difícil de ver** — sem isso o leitor acha óbvio e não aplica.
3. **A tabela de aparições**, com onde, o que o defeito afirmava e o estado de cada uma.
4. **O corolário aplicável antes**, quando existir.
5. **As ressalvas de método da medição** — o que o número NÃO mede. Sem elas o número é lido
   além do que diz.
6. **A relação com as outras regras** — o que esta cobre e o que fica com as vizinhas.

## Relação com as outras regras

`baseline-measurement.md` diz como medir sem se enganar. `migration-delivery.md` diz como
saber que o banco tem o que o repositório declara. `fato-vs-referencia.md` e
`ausente-vs-falso.md` são registros de classe escritos segundo esta página. Esta aqui é a
regra sobre as regras: onde elas moram e que forma têm.
