# Estado Relatado Divergindo de Estado Real

## O critério

Formulação do dono do produto, registrada como está:

> Afirmação sobre **ESTADO DE SISTEMA EXTERNO** — schema, PR, branch, deploy — **EXIGE
> CONSULTA À FONTE PRIMÁRIA ANTES DE VIRAR PREMISSA DE DECISÃO**. Memória de conversa, barra
> lateral e relato anterior são **FONTES SECUNDÁRIAS**.

Sistema externo é tudo o que muda sem o repositório saber: o schema do banco, o estado de um
PR, o que está em `main`, o que foi para produção. Nada disso é dedutível do código, e nenhuma
delas avisa quando muda.

## De quem é o defeito

**As três divergências foram do assistente.** Foi ele quem relatou os três estados errados —
não uma vez, três vezes no mesmo dia, com o mesmo mecanismo. Quem corrigiu foi o dono do
produto nas duas primeiras, apontando o dado, e a consulta ao GitHub na terceira.

Isso está escrito assim de propósito. A classe existe porque o erro se repetiu; suavizar a
autoria apagaria justamente o que a torna uma classe e não três acidentes.

## Por que a distinção é difícil de ver

Porque a fonte secundária **é quase sempre correta**, e o custo de consultar parece
desnecessário. Quem acabou de aplicar uma migração lembra de tê-la aplicado; quem abriu um PR
lembra de tê-lo aberto. A memória não está mentindo — ela está **desatualizada**, que é outra
coisa e não se anuncia.

E o erro não tem sintoma no momento em que é cometido. Dizer "a coluna existe" quando ela não
existe não quebra nada **naquele instante**: quebra depois, no ponto que dependia da premissa.
Foi assim que a produção caiu em 01/09 — o PR estava mergeado, o build estava verde, e a
coluna não existia.

## As aparições

| # | O que foi relatado | O que era | Quem decidiu |
|---|--------------------|-----------|--------------|
| 1 | `expense_snapshot` aplicado no banco | **Não estava** — e uma segunda migração também estava pendente | Consulta ao `information_schema` |
| 2 | PR #34 aberto, aguardando validação | **Mergeado havia 20 horas** | Efeito observável no banco: `destination_snapshot` preenchido no produto e copiado no `budget_items` |
| 3 | Quatro PRs abertos aguardando merge | **Três já mergeados** | Consulta ao GitHub |

As três resolvidas do mesmo jeito: **olhando o fato em vez do relato**.

### Nota da busca por precedentes

A busca foi feita, conforme `registro-de-classe.md`. Ela encontrou **um quarto caso com a
mesma assinatura**, que NÃO foi incorporado à tabela: durante a auditoria de migrações, o
assistente afirmou que `tenant_settings.days_per_month` era uma coluna faltante — o nome não
existe, e as colunas reais (`productive_days_per_month` e `administrative_days_per_month`)
existiam ambas. Era afirmação sobre schema feita sem consulta, corrigida pela consulta.

Não está na tabela porque a decisão de contá-lo é do dono do produto, e **inflar a tabela para
chegar a quatro é exatamente o que o limite do método proíbe**. Fica registrado aqui para que
a próxima pessoa saiba que a busca aconteceu e o que ela achou.

## O critério aplicável ANTES do defeito existir

É a parte que previne em vez de explicar:

**Antes de usar um estado externo como premissa de decisão, consulte a fonte primária.**

| Afirmação sobre | Fonte primária | Fonte secundária (não serve) |
|---|---|---|
| coluna existe no banco | `select … from information_schema.columns` | migração mergeada, build verde, memória |
| migração aplicada | consulta ao schema + `NOTIFY pgrst` | retorno do comando de aplicação, PR em `main` |
| estado de um PR | consulta ao GitHub | frase anterior na conversa, barra lateral |
| o que está em `main` | `git fetch` + `git log origin/main` | branch local, lembrança do último merge |
| efeito de um deploy | dado observável no ambiente | "foi mergeado, então está lá" |

O gatilho é simples: **a afirmação vai virar premissa de uma decisão?** Se vai, consulte. Se é
só conversa, não custa nada dizer "acho que" e seguir.

## Ressalvas de método

1. **Três é o que foi DETECTADO, não o que houve.** Uma divergência só entra na conta quando
   alguém a percebe. Afirmação errada que ninguém conferiu não aparece aqui — e o defeito
   desta classe é justamente não ter sintoma na hora.
2. **A amostra é de um dia de trabalho.** Não é base para taxa nem para tendência; é base para
   reconhecer o padrão quando ele voltar.
3. **A correção veio de fora nas duas primeiras.** Não houve autodetecção — o que significa que
   a classe não se resolve com mais atenção, e sim com a consulta como passo obrigatório.

## Relação com as outras regras

`migration-delivery.md` é o caso particular desta classe no banco: migração é PENDENTE POR
PADRÃO até a consulta ao schema provar o contrário. `baseline-measurement.md` trata do irmão
próximo — medição feita na árvore errada, onde o número está certo e a premissa é que está
errada. `registro-de-classe.md` define a forma desta página, incluindo o limite que manteve a
tabela em três linhas.

As três compartilham a mesma origem: **confiar num sinal indireto em vez de olhar o fato.**
