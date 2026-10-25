# Asserção Negativa Que Nunca Falha

> **Esta regra é independente da rodada que a originou.** Nasceu em 15/10/2026, no portão do
> cabeçalho da ficha do cliente, porque foi ali que a mutação ficou verde — mas **não depende
> daquela feature**. Vale para toda asserção negativa, em todo portão. Reverter a ficha não
> deve levar esta página junto.

## O critério

**Asserção negativa cujo literal é escrito à mão afirma a ausência de uma string que talvez
não exista em hipótese nenhuma — ela é VERDE POR CONSTRUÇÃO.**

`expect(texto).not.toContain('X')` só vale alguma coisa se existir um estado do sistema em que
`'X'` **aparece**. Quando o texto que o código produz nunca é exatamente `'X'` — por um
caractere invisível, por um espaço a mais, por maiúscula —, a asserção passa com a correção e
passa sem ela. Ela não é um teste fraco: ela não é um teste.

## Por que a distinção é difícil de ver

Porque a asserção **parece a mais rigorosa das duas**. Afirmar que algo NÃO está na tela soa
mais forte que afirmar que algo está, e a negativa costuma ser escrita justamente para barrar
o defeito que mais preocupa. A redação é clara, o nome do caso é claro, o verde chega.

E o literal é escrito **olhando o que a tela mostra**, não o que a função devolve. São duas
strings diferentes sempre que a formatação passa por `Intl`, por `toLocaleString`, por um
template, ou por qualquer coisa que o olho normaliza e o `===` não.

O defeito também não tem sintoma. Uma asserção positiva que erra o literal fica **vermelha na
hora** e se conserta em trinta segundos. A negativa que erra o literal fica **verde para
sempre**, e continua verde no dia em que o defeito chegar.

## As aparições — DOIS mecanismos, a mesma classe

| # | Quando | A asserção | Por que não podia falhar |
|---|---|---|---|
| 1 | 15/10/2026, portão do cabeçalho da ficha | `expect(t.texto()).not.toContain('R$ 0,00')`, no caso *"cliente SEM parcela mostra travessão, nunca R$ 0,00"* | `formatBRL` usa **espaço não separável** (U+00A0) entre o `R$` e o número. O literal tinha espaço comum (U+0020). Medido: `[...formatBRL(0)].map(c => c.charCodeAt(0))` → `82 36 **160** 48 44 48 48` |
| 2 | 23/10/2026, portão das rotas dos três níveis (#133) | `expect(JSON.stringify(r.json)).not.toContain(texto)`, no caso *"23514 → frase fixa — o texto do banco NÃO vai"* | o `texto` injetado tinha **aspas** (`relation "orcamentista_mp_instalacao"`). O `JSON.stringify` as escapa para `\"`, então a SERIALIZAÇÃO nunca contém o texto cru — **nem quando a resposta o carrega inteiro**. Medido: a mutação que passava o texto do 23514 adiante ficou **verde** (M14) |

**De quem é a 1.** Do assistente. A mesma linha tinha sido escrita **duas vezes** — no portão da
coluna partida (etapa 4a) e no do cabeçalho (4b.3) — e as duas estavam mortas.

**Como apareceu:** pela **mutação**, não pela leitura. A mutação que trocava o travessão por
`R$ 0,00` deveria derrubar o caso, e ele ficou **verde**. Nenhuma releitura do arquivo teria
encontrado: o literal está certo aos olhos, e o caractere que o invalida não tem desenho.

**No portão da 4a a mesma linha estava morta e o caso ficou vermelho assim mesmo**, porque
havia ao lado um `expect(celulas[0]).toBe('—')` que discriminava. Isso é sorte, não método —
e é a razão de esta página existir em vez de uma correção pontual.

### A aparição 2 — o mesmo verde, por outro mecanismo

**O mecanismo mudou e a classe não.** Na 1 o literal era inalcançável porque a FUNÇÃO formata
(um caractere invisível no meio); na 2 o literal era inalcançável porque o TESTE serializou o
lugar onde procurava. Nas duas, a string procurada e a string examinada nunca podiam ser iguais,
com ou sem o defeito — e a asserção ficou verde por construção.

**De quem é a 2.** Do assistente, que já tinha esta página escrita. Ela não foi evitada por
estar registrada: o remédio dizia "compare com o produto da função", e o `texto` ERA o produto
do mock. O que faltava na regra era a outra ponta — **o lugar onde se procura também pode
transformar**.

**Como apareceu:** pela mutação, de novo. Das 29 mutações daquele portão, foi a única real que
não derrubou nada.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, sobre os portões escritos nesta campanha. **Na
primeira escrita, uma aparição, em dois lugares, e nenhuma segunda foi forçada.** A 2 não foi
procurada: apareceu oito dias depois, numa rodada de mutações, e entrou por instrução do dono do
produto, como segundo mecanismo da mesma classe.

**A busca da 2, em 23/10/2026:** `not.toContain`/`not.toMatch` sobre `JSON.stringify`,
`innerHTML` ou `outerHTML` em `src/` — **30 ocorrências**, a do M14 incluída. As outras 29
procuram literais e constantes sem aspas, sem `\` e sem caractere de controle (nomes, ids,
tokens `orc_…`, seis dígitos, `'Oi beleza, quero um orçamento'`); acento não é escapado pelo
`JSON.stringify`. **Estão fora do risco, e nenhuma terceira foi forçada.**

A primeira busca procurou outras negativas
com literal transcrito e encontrou-as comparando contra **constantes exportadas** ou contra
**chamadas registradas** — que é justamente o remédio abaixo, já praticado sem estar escrito.

O que ela **não** cobriu: negativas sobre DOM (`not.toContain(TITULO_SEM_VENCIMENTO)`) usam a
constante do próprio módulo e estão fora do risco por construção.

## O remédio

**Compare contra o PRODUTO DA PRÓPRIA FUNÇÃO, nunca contra o texto transcrito.**

```ts
expect(t.texto()).not.toContain('R$ 0,00')     // morta: o literal não é o que a função produz
expect(t.texto()).not.toContain(formatBRL(0))  // viva: a comparação é com o que sai de verdade
```

Quando não houver função — um rótulo fixo, um título —, **exporte a constante** e compare com
ela. O mesmo gesto que `instrumento-que-nao-enxerga.md` pede para o `grep`: não escreva o
padrão de memória, derive-o da fonte.

### E compare contra o VALOR, nunca contra uma SERIALIZAÇÃO dele

A lição que a aparição 2 generaliza, formulação do dono do produto: **a serialização pode
alterar o que você está procurando.** `JSON.stringify` escapa aspas, barras e caracteres de
controle; `innerHTML` escapa `<` e `&`; um objeto em template vira `[object Object]`. Procurar a
string crua dentro de qualquer um deles é procurar algo que a transformação já desfez.

```ts
expect(JSON.stringify(r.json)).not.toContain(texto)  // morta: \" no lugar de "
expect(r.json.error).not.toBe(texto)                 // viva: o valor, como saiu
expect(Object.values(r.json)).not.toContain(texto)   // viva: os valores, sem serializar
```

Os dois remédios são a mesma regra vista de cada ponta: **a string procurada vem da fonte (a
função ou a constante), e o lugar onde se procura é o valor como ele sai — nunca uma
representação dele.**

## O corolário aplicável ANTES do defeito existir

**Toda asserção negativa precisa de uma mutação que a faça ficar VERMELHA. Se nenhuma mutação
a derruba, ela não afirma nada.**

É o critério de `teste-que-nao-exercita.md` aplicado ao caso em que o verde é estrutural em
vez de circunstancial: lá o caso escolhido não discrimina os dois estados; aqui o caso **não
tem** segundo estado, porque o literal é inalcançável.

Sinais de que a negativa pode estar morta, em ordem de força:

1. O literal foi escrito **olhando a tela** ou a saída do terminal, não a função.
2. A string passa por `Intl.NumberFormat`, `toLocaleString`, `Date`, ou qualquer formatação
   com separador — todos introduzem caracteres que o olho lê como espaço e o `===` não.
   **Ou o lugar onde se procura é uma serialização** — `JSON.stringify`, `innerHTML`, uma linha
   de log —, e o literal tem um caractere que ela escapa (aspas, `<`, `&`, `\`).
3. A asserção é a **única** do caso. Se a mutação não a derruba, nada mais sobra.
4. Nenhuma mutação foi rodada contra aquele caso.

Quando o 1 e o 4 coincidem, rode a mutação antes de confiar no verde.

---

## JEST VERDE NÃO É `tsc` VERDE

Registro ao lado, porque é a mesma família — um instrumento dando verde sobre o que ele não
alcança — e porque aconteceu na MESMA rodada.

**O jest compila com babel, que apaga os tipos sem checá-los.** Nesta rodada a assinatura de
`buildSaleHistoryDetail` e de `buildInstallmentPlan` ganhou `hoje` obrigatório, e três
chamadas em `historico-cliente-status-do-documento.test.ts` ficaram sem o argumento. O jest
rodou **verde**, com os três `TS2345` vivos na árvore; quem pegou foi o `tsc`.

**Os dois rodam, e um não substitui o outro:**

| instrumento | o que ele alcança | o que ele NÃO alcança |
|---|---|---|
| `jest` | comportamento em tempo de execução, no caminho que o caso percorre | contrato de tipo — babel não checa, só apaga |
| `tsc --noEmit` | o contrato em toda a árvore, arquivos de teste inclusive | se o comportamento está certo |

Consequência operacional, e é a que importa: **uma mudança de assinatura precisa do `tsc`
antes de o jest ser levado a sério.** Verde do jest sobre uma chamada que não compila é a
mesma classe de `portao-que-nao-alcanca.md` — o indicador não varia no caso que se quer
detectar.

E o contrário também vale, e é por isso que `baseline-measurement.md` manda rodar os dois: o
`tsc` verde não diz nada sobre comportamento, e foi o jest que pegou as 18 mutações desta
etapa.

## Relação com as outras regras

`teste-que-nao-exercita.md` é a origem do critério — esta é a variante em que o caso não
discrimina por **impossibilidade do literal**, não por escolha de fixture.
`instrumento-que-nao-enxerga.md` é a vizinha mais próxima: lá o padrão do `grep` é escrito à
imagem do primeiro exemplo, aqui o literal da asserção é escrito à imagem da tela — nos dois
o instrumento é feito de memória em vez de derivado da fonte.
`portao-que-nao-alcanca.md` é o que a nota do `tsc` × jest acrescenta, e a pergunta 4 dela é
exatamente a desta página aplicada a um número de relatório. `registro-de-classe.md` decidiu a
forma e o limite que manteve a tabela em uma linha até a segunda aparecer sem ser procurada.
