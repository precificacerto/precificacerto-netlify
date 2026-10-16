# Transformação no Meio Quebra a Cadeia de Hash

> **Esta regra é independente da migração que a originou.** Nasceu em 16/10/2026, na aplicação
> das políticas de visibilidade, porque foi ali que a tela de aprovação mostrou um número que
> ninguém tinha explicado — mas **não depende daquela migração**. Vale para todo conteúdo que
> é autorizado por hash e transformado antes de ser executado: SQL, script, payload de API,
> arquivo de configuração. Reverter aquelas políticas não deve levar esta página junto.

## O critério

Formulação do dono do produto, registrada como está:

> Um hash autoriza **UM CONTEÚDO**, não um nome de arquivo. Quando o que vai ser aplicado não
> é o conteúdo autorizado — porque alguém prescreveu uma transformação, mesmo trivial —, a
> autorização deixa de cobrir o que será executado, e o aprovador é posto a decidir sobre um
> número que ninguém lhe explicou.

E a atribuição, que é a parte que impede o remédio errado:

> **O FURO É DE QUEM PRESCREVE.** Eu escrevi "remova o `BEGIN`/`COMMIT`" sem dizer o que isso
> faz com o hash, e o protocolo não tinha onde acusar que a remoção foi de 210 linhas.

## Por que a distinção é difícil de ver

Porque a transformação **é correta e necessária**. Remover `BEGIN`/`COMMIT` ao aplicar por um
conector que abre transação própria não é descuido: é o certo, e está escrito no próprio
arquivo. O que falha não é o gesto — é que **ninguém disse o que o gesto faz com o número**.

E a assimetria de atenção favorece o erro. Quem autoriza olha o hash **do que revisou**. Quem
aplica calcula o hash **do que envia**. Os dois são diligentes, os dois conferem um número, e
os dois conferem números diferentes — sem que nada no protocolo os obrigue a notar.

O sintoma também não aparece na hora. Uma transformação que remove comentários produz um
payload que **executa exatamente igual**. Não há erro, não há aviso, e o diff que alguém
faria depois mostra o banco certo. O que se perdeu é a prova de que o que rodou é o que foi
lido — e isso só importa no dia em que não for.

## As aparições

| # | Onde | A transformação | O que ela faz com a cadeia |
|---|---|---|---|
| 1 | `migration-delivery.md`, ressalva de método da aplicação manual | ler o SQL por `raw.githubusercontent.com` **NORMALIZA A INDENTAÇÃO** | o `md5` do arquivo **deixa de ser reproduzível** pelo caminho da aplicação. Está escrito lá que "conferir o `md5` depois de aplicar assim vai divergir, e a divergência não significa corrupção" |
| 2 | 16/10/2026, aplicação de `20261016000002_politicas_de_visibilidade.sql` | "remova o `BEGIN`/`COMMIT`", prescrito para o conector | a tela de aprovação mostrou `e04c8ddf…` onde a autorização dizia `26de1d1a…`. O dono do produto **negou**, e estava certo |

### A aparição 1 já estava escrita, e não virou regra

É o diagnóstico de `registro-de-classe.md` acontecendo de novo: o conhecimento existia, estava
correto, e estava **no lugar em que não se lê no momento em que importa**. `migration-delivery.md`
registrou que a transformação quebra a reprodutibilidade do `md5` — e tratou isso como uma
RESSALVA DE MEDIÇÃO ("o que o `md5` prova e o que não prova"), não como uma questão de
**autorização**. A diferença é a que esta página existe para fixar: lá o hash divergente era um
inconveniente de conferência; aqui ele é a única coisa entre o aprovador e um conteúdo que ele
não aprovou.

### O caso da aparição 2, com os números

O que foi autorizado, o que foi para a tela, e o que havia entre os dois:

| | |
|---|---:|
| arquivo autorizado, `md5` | `26de1d1af7780d4310c5d13ff7fa248c` |
| linhas do arquivo | **295** |
| payload que foi para a tela, `md5` | `e04c8ddf9873fb8d8cdaa0af7f6723cb` |
| linhas do payload | **85** |
| **linhas removidas** | **210** |
| **linhas que a transformação prescrevia remover** | **2** |

A prescrição era remover duas linhas. O que o assistente removeu foram **210**: ele cortou o
texto *entre* `BEGIN;` e `COMMIT;` e descartou o cabeçalho inteiro e a seção VERIFICAÇÃO
inteira. **As 210 eram todas comentário, e nenhuma executava — isso é SORTE, NÃO MÉTODO.** Com
uma única linha executável fora daquele intervalo, a aplicação teria sido parcial e ninguém
teria como saber pelo número.

Reconhecimento do dono do produto, registrado como está:

> O que me interessa é que o número foi a **ÚNICA** coisa que denunciou — se ele batesse,
> 210 linhas teriam ido embora sem ninguém ver.

A hipótese dele ao negar — *"quase certamente é o arquivo menos o `BEGIN`/`COMMIT`"* — estava
**errada para o lado seguro**: a transformação era mais larga do que ele supôs, e a recusa
pegou isso sem que nenhuma das duas partes soubesse na hora.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, sobre os pontos do repositório em que conteúdo é
conferido por hash. **Duas aparições, e nenhuma terceira foi forçada.**

O que a busca **examinou e rejeitou**: o `md5` **inventado** que o assistente escreveu numa
mensagem de commit em 16/10/2026, corrigido por `amend` antes de sair do container. O dono do
produto o nomeou como classe — *"um hash fabricado TEM A FORMA DE UM FATO MEDIDO, e é o que
alguém cita depois sem reconferir"* —, e ele é **vizinho, não o mesmo**: lá o número não
corresponde a conteúdo nenhum; aqui ele corresponde exatamente a um conteúdo, só que **não ao
que foi autorizado**. Fabricação e transposição falham por mecanismos diferentes e se acham de
jeitos diferentes. Fica registrado aqui para quem procurar a terceira saber que esta foi
olhada.

## O remédio

**Quando o conteúdo enviado não for o arquivo inteiro, o relatório publica OS DOIS HASHES
DESDE O COMEÇO** — o do arquivo e o do payload —, **com a transformação NOMEADA entre eles**, e
a prova **POR DIFF E POR CONTAGEM DE BYTES**, antes de a tela de aprovação aparecer.

A forma, e as três partes são obrigatórias:

```
arquivo       <caminho>                                md5 <hash-do-arquivo>
transformação <descrição literal do que foi removido/alterado, em uma frase>
payload       <o que de fato vai ser enviado>          md5 <hash-do-payload>

prova 1 — diff cru arquivo -> payload, sem resumo
prova 2 — contagem de bytes, com a aritmética fechando
```

**A prova por bytes não é redundante com o diff, e é ela que fecha.** O diff por linha mostra
como iguais duas linhas que diferem num espaço à direita, e não mostra quebra de linha final.
A aritmética dos bytes mostra. No caso da aparição 2:

```
arquivo 19.027 − payload 19.012 = 15
len("BEGIN;") + len("COMMIT;") + 2 quebras = 6 + 7 + 2 = 15
```

Fechando a conta, **não há terceira diferença a procurar**. Não fechando, há — e o número diz
de quantos bytes ela é antes de alguém saber onde.

## O corolário

**A autorização do dono do produto nomeia o hash do PAYLOAD**, que é o que a tela mostra e o
que vai executar. **O hash do ARQUIVO continua valendo para o que foi revisado** — são dois
fatos distintos sobre dois objetos distintos, e a cadeia entre eles é a transformação nomeada.

Um hash só, numa cadeia com transformação no meio, **não prova o que parece provar**.

## O corolário aplicável ANTES do defeito existir

**Antes de prescrever uma transformação sobre conteúdo autorizado, diga o que ela faz com o
hash.** E, do lado de quem aplica: **antes de abrir a tela de aprovação, publique os dois
números.**

Sinais de que a cadeia está prestes a quebrar, em ordem de força:

1. A instrução contém um verbo de transformação — "remova", "troque", "ajuste", "cole sem",
   "adapte" — sobre um conteúdo que foi autorizado por hash.
2. A transformação parece **trivial demais para merecer menção**. Quanto mais trivial, menos
   provável que alguém calcule o hash do resultado.
3. O caminho de aplicação **não aceita o arquivo**, só texto colado — conector, editor web,
   campo de formulário.
4. O relatório publicou **um** hash.

Quando o 2 e o 4 coincidem, a tela de aprovação vai mostrar um número que ninguém explicou, e
o aprovador terá de escolher entre negar sem saber por quê e aprovar sem saber o quê.

## As ressalvas de método — o que esta página NÃO diz

- **Não diz que a transformação é errada.** Remover `BEGIN`/`COMMIT` para o conector é o
  certo, e está prescrito no próprio arquivo de migração. O que falta é dizer o efeito.
- **Não diz que comentário é inofensivo.** Nesta aparição as 210 linhas perdidas eram todas
  comentário, e foi acaso: o recorte foi por delimitador de transação, não por natureza do
  conteúdo. O mesmo recorte sobre um arquivo com DDL fora do `BEGIN`/`COMMIT` teria aplicado
  metade.
- **Não propõe automatizar.** Publicar dois hashes e um diff é trabalho de um comando; um
  portão que os compare precisaria conhecer a transformação de cada caso, e não há caso
  suficiente para desenhá-lo. Duas aparições é critério para a regra, não para a ferramenta.
- **Não mede quantas aplicações passaram com hash único.** Esta é a primeira em que alguém
  olhou. O que a página afirma é que a divergência foi o único sinal, não que ela seja rara.

## Relação com as outras regras

`migration-delivery.md` guarda a aparição 1 e o protocolo de aplicação em que esta regra se
encaixa — é lá que está o `md5sum` antes de revisar, e é de lá que vem a ressalva de que o
caminho `raw` normaliza. `registro-de-classe.md` decidiu a forma desta página e é o
diagnóstico de por que a aparição 1 não bastou: conhecimento certo, no lugar em que não se lê.
`estado-relatado-vs-real.md` é a vizinha mais próxima no método — lá a premissa é um estado
externo não consultado, aqui é a identidade entre dois conteúdos não provada. E
`ausente-vs-falso.md` explica por que um hash só é pior que nenhum neste caso: ele **afirma**
uma correspondência que não foi estabelecida, em vez de calar sobre ela.
