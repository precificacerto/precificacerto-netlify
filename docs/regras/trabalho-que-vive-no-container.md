# Trabalho Que Vive Só no Container

> **Esta regra é independente da rodada que a originou.** Nasceu em 15/10/2026, na reconstrução
> das três etapas da Seção Clientes, porque foi ali que a perda aconteceu — mas **não depende
> dela**: vale para toda rodada, em todo branch, com ou sem feature envolvida. Reverter aquelas
> três etapas não deve levar esta página junto.

## O critério

**Trabalho não empurrado NÃO ESTÁ ENTREGUE — está num disco que se reconstrói.**

E o corolário que é a outra metade dele, e a que custou a rodada:

> **Quem proíbe o push é dono de dizer a consequência.**

A proibição de empurrar é legítima e é do dono do produto. O que não é legítimo é cumpri-la em
silêncio. Entre "não empurre" e "o que existe hoje só existe num lugar" há uma informação que
só quem está no container tem, e é dele o dever de dizê-la.

### O relato que descreve o fato e esconde o risco

Formulação do dono do produto, registrada como está:

> Um relatório que diz **"3 commits à frente de main"** descreve um fato e esconde um risco;
> o relato correto é **"3 commits que existem num só lugar"**.

As duas frases são verdadeiras sobre o mesmo estado. A primeira é a saída do `git status`, e
ela fala de **posição** — onde o branch está em relação ao `main`. A segunda fala de
**cardinalidade** — em quantas máquinas aquele objeto existe. Só a segunda responde à pergunta
que importa quando o container é reconstruído.

## Por que a distinção é difícil de ver

Porque o git **se comporta exatamente igual** nos dois estados. `git log` mostra os commits,
`git show` mostra o diff, o `status` fica limpo, e o trabalho está, para todos os efeitos do
dia a dia, feito. Nada na ferramenta distingue um commit que existe em dois lugares de um que
existe em um. O SHA tem o mesmo tamanho.

E o sinal que existia apontava para o outro lado. O hook de parada pediu push **quatro vezes**,
e as quatro vezes ele estava certo. Cada negativa minha foi, isoladamente, obediência correta a
uma instrução explícita da rodada — *"Não tente push"* — e por isso nenhuma delas pareceu uma
decisão. Foi a soma das quatro que criou o estado, e a soma não aparece em nenhuma delas.

O defeito também não tem sintoma no momento em que é cometido. Declinar o push não quebra nada
naquele instante. Quebra depois, de uma vez, e sem erro: o container volta, o `git log` mostra
um commit que não é o seu, e o reflog não tem para onde apontar.

## A aparição

| # | Quando | O que se perdeu | Como |
|---|---|---|---|
| 1 | 15/10/2026 | **quatro commits** (`a28ebe1`, `4515be1`, `ab71458`, `ac9b52d`), **~2.800 linhas** — as três etapas da Seção Clientes mais os quatro portões novos | o container foi reconstruído. Os objetos sumiram do `.git`; o reflog mostrava só `a32e903`. **Nenhum dos quatro tinha sido empurrado** |

**De quem é.** Do assistente. O dono do produto escreveu *"Não tente push"* nas quatro
instruções da rodada, e cumprir isso era o certo. O que faltou foi meu: **eu declinei o pedido
do hook quatro vezes e nenhuma vez disse o que aquilo significava.** A informação de que o
trabalho existia num disco só era minha, e eu não a passei adiante.

Está escrito assim porque suavizar apagaria o mecanismo. Não foi descuido — nenhuma das quatro
negativas foi errada vista sozinha, e é justamente por isso que mais atenção não as teria
evitado. O que faltava era **uma frase**, e a regra abaixo é essa frase virada procedimento.

**E o dono do produto corrigiu a própria instrução ao saber:**

> Push de branch de trabalho **não entrega nada a ninguém e é reversível**. O portão de revisão
> é o **PR**, não o push. Eu errei ao tratar os dois como a mesma coisa.

É a parte que fecha o caso: a proibição existia porque dois atos de naturezas diferentes
estavam sendo tratados como um. Separá-los custa nada e remove a razão inteira de o estado
existir.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`. **Uma aparição, e nenhuma segunda foi forçada.** A
busca procurou perda de trabalho por ambiente efêmero em rodadas anteriores desta campanha e
não achou outra — o que é esperado, porque esta foi a primeira rodada longa inteira sob a
instrução de não empurrar.

O que ela **achou**, e que fica registrado por ser da mesma família sem ser da mesma classe: a
perda do `node_modules` na mesma reconstrução, resolvida com um `npm ci`. Não entra, porque
`node_modules` é **derivável** — o `package-lock.json` estava versionado e o estado foi
reproduzido em minutos. A distinção é o discriminante da página: o que se perde e se
reconstrói por comando não é a mesma coisa que o que se perde e não existe mais em lugar nenhum.

## O remédio — quatro regras, e as quatro são procedimento

1. **Push ao fim de cada etapa**, assim que o portão daquela etapa ficar verde. Não acumular.
   Uma etapa é a unidade de perda aceitável; três etapas não são.
2. **Push que falha PARA a sequência.** Não se começa a etapa seguinte sobre um estado que não
   conseguiu sair do container — isso só aumenta o que a próxima falha leva junto.
3. **O primeiro push é feito ANTES de investir trabalho**, para provar o caminho. Descobrir que
   o remoto recusa o branch depois de 2.800 linhas é descobrir tarde; descobrir com um commit
   vazio de prova custa trinta segundos.
4. **PR e merge continuam sendo portão do dono do produto.** Esta página não afrouxa nada:
   empurrar um branch de trabalho não publica, não notifica e não entrega. O que ela separa é
   *persistir* de *propor*.

E a regra de relato, que é a que torna as outras quatro acionáveis:

> **Ao declinar um push, diga a consequência na mesma mensagem.** Não "não empurrei, conforme
> instruído", e sim "não empurrei; estes N commits existem num só disco, que pode ser
> reconstruído sem aviso".

## O corolário aplicável ANTES do defeito existir

**Antes de aceitar uma restrição sobre um ato de persistência, pergunte o que deixa de existir
em outro lugar enquanto ela vale.**

Sinais, em ordem de força:

1. A instrução proíbe um ato que **grava fora da máquina atual** — push, upload, commit em
   remoto, gravação em banco.
2. O ambiente é **efêmero por desenho** — container, sandbox, runner de CI, worktree temporário.
3. A restrição vale por **mais de uma etapa**, e o trabalho se acumula debaixo dela.
4. Quem a escreveu **não está no ambiente** e não tem como ver quanto já se acumulou.

Quando os quatro coincidem, a consequência precisa ser dita — e quem a diz é quem está dentro.
Não é pedido de permissão: é informação que só existe de um lado.

> A relação com `razao-longe-da-restricao.md` é direta, e é um espelho: lá a razão da restrição
> mora longe de quem a lê, e quem propõe mudá-la precisa **perguntar**. Aqui a **consequência**
> da restrição mora longe de quem a escreveu, e quem a cumpre precisa **avisar**. Nos dois
> casos o que falta é uma frase, e nos dois casos o silêncio é lido como "não há o que dizer".

## As ressalvas de método — o que esta página NÃO diz

- **Não diz que a instrução do dono do produto estava errada.** Ela foi corrigida por ele, pela
  razão dele, depois de saber do custo. Sem o custo informado, a instrução era defensável.
- **Não diz que o hook resolve.** O hook pediu quatro vezes e foi declinado quatro vezes — ele
  é um lembrete, não um portão, e `portao-que-nao-alcanca.md` já distingue as duas coisas.
  Um lembrete que se pode declinar sem consequência declarada é exatamente o caso dela.
- **Não mede frequência de reconstrução de container.** Uma perda não é taxa. O que a página
  afirma é que o custo de uma é alto e o do remédio é zero, não que a próxima é provável.
- **Não vale para o que é derivável.** `node_modules`, builds, caches e `tsbuildinfo` se perdem
  do mesmo jeito e se reconstroem por comando. A regra é sobre o que **não existe em outro
  lugar**.

## Relação com as outras regras

`estado-relatado-vs-real.md` é a vizinha mais próxima, e a diferença é de direção: lá o relato
afirma um estado externo que ninguém consultou; aqui o relato é **verdadeiro** (`3 commits à
frente de main` é exato) e ainda assim engana, porque descreve o eixo errado. `migracao.md` (Parte II)
é a mesma forma no banco — *merge não é entrega*, aqui *commit não é entrega* —, e as duas
fixam um **default**: migração é pendente por padrão, trabalho é perdível por padrão.
`razao-longe-da-restricao.md` é o espelho do corolário, como registrado acima.
`registro-de-classe.md` decidiu a forma desta página, e é dela o limite que a manteve numa
aparição só, com a nota da busca.
