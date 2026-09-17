# A Razão Longe da Restrição

> **Esta regra é independente da correção que a originou.** Nasceu na rodada em que a lista
> fechada do fator de redução do IVA DUAL foi alargada e depois revertida, mas não depende dela.

## O critério

**Uma restrição é imposta em vários pontos e citada em outros. Quem vem mudá-la lê o ponto onde
ela é DECLARADA — e é justamente esse que costuma estar mudo, porque quem a declarou sabia por
quê.**

A restrição muda não parece restrição com razão perdida. Parece **escolha arbitrária**, e
escolha arbitrária convida a ser alargada.

### O núcleo que caiu, registrado porque a queda é o argumento

A primeira formulação foi do dono do produto, e dizia:

> A lista fechada de sete valores tinha uma razão externa ao código — a LC 214 — e eu a li como
> restrição arbitrária, **porque o código não dizia de onde ela vinha**.

A medição desmentiu a última oração. O código dizia, **três vezes**:

```
supabase/migrations/20260414000001_add_iva_dual_fields.sql:4
  LC 214/2025 — 7 faixas de regimes diferenciados IBS/CBS;
  80% e 100% adicionados v2.0 28/06/2026

supabase/migrations/20260628000001_iva_dual_reduction_factor_check.sql:2
  LC 214/2025 — 7 faixas VÁLIDAS do Fator de Redução do IVA Dual:
  30, 40, 50, 60, 70, 80, 100. A UI (dropdown em products/services) já
  restringe a esses valores; esta constraint trava a integridade no banco.

src/utils/item-tax-rates.ts:552
  Fator de Redução IVA Dual (LC 214/2025, art. 261)
```

A segunda diz, com a palavra **válidas**, exatamente o que se veio propor desfazer.

**Isso é o que justifica a página existir.** Se a razão estivesse ausente, a correção seria
óbvia — escrevam a lei no código — e não precisaria de regra nenhuma. A correção óbvia já
estava feita, três vezes, e não impediu nada. O que faltava era **onde**.

Onde não estava: no `Select`. As duas telas declaravam `[30, 40, 50, 60, 70, 80, 100]` inline,
sem uma palavra. O `Tooltip` ao lado explicava a fórmula e não mencionava a lei.

Três pontos IMPUNHAM a restrição — tela de produto, tela de serviço, `CHECK` do banco. As
citações estavam em dois pontos **adjacentes** (as migrações) e um **distante** (o helper).
Nenhuma no ponto de declaração.

### A razão tem FONTE OFICIAL, e ela chegou depois — 16/09/2026

O registro acima dizia que a razão era "a LC 214", lida no texto da lei. Ela é mais forte que
isso, e o fato só apareceu meses depois, quando o dono do produto trouxe o arquivo oficial
**`cClassTrib 2026-06-22.xlsx`**, do Portal DF-e SVRS.

Os percentuais de `pRedIBS`/`pRedCBS` da tabela oficial, medidos sobre as 164 linhas:

| valor | linhas |
|---|---|
| 0 | 105 |
| 30 | 2 |
| 40 | 5 |
| 50 | 1 |
| 60 | 22 |
| 70 | 1 |
| 80 | 1 |
| 100 | 26 |

**Os valores distintos maiores que zero são exatamente `30, 40, 50, 60, 70, 80, 100`, em 59
das 164 linhas.** É a lista do `Select` original, item por item, sem sobra e sem falta.

O que isso muda no registro: a restrição não era leitura da lei feita por alguém — era
**transcrição de uma tabela publicada**. Quem a escreveu tinha a fonte na mão. A aparição 1
continua sendo o que era (razão longe da declaração, leitor alarga), e o custo dela sobe: o
campo livre não afrouxou uma interpretação, afrouxou **um domínio enumerado pelo fisco**.

E a citação que faltava agora tem endereço verificável, que é o critério da regra 1 desta
página — *"a citação boa é a que permite ao próximo leitor VERIFICAR"*:

```
// Fator de redução do IVA Dual — as 7 faixas são os valores distintos de
// pRedIBS/pRedCBS na tabela oficial cClassTrib do Portal DF-e SVRS
// (publicação 2026-06-22), 59 das 164 linhas. LC 214/2025.
```

## Por que a distinção é difícil de ver

Porque quem declara a restrição **não precisa da citação**. Ele acabou de ler a lei; a lista
está fresca; escrever de onde ela veio parece redundante no minuto em que se escreve. A citação
só passa a valer quando o contexto some — e o contexto some para todo mundo que não estava lá.

E não some por rotatividade. **Basta que quem sabia não esteja na conversa em que a restrição é
mudada** — que é o caso normal, não o excepcional. Escrever a regra como seguro contra saída de
gente subestima a frequência: o autor do `Select` pode estar do lado, e ainda assim não ter sido
perguntado.

Do outro lado, quem propõe a mudança **olha para o ponto de declaração**, porque é esse que ele
vai editar. Ele não abre a migração de três meses atrás para descobrir por que um array literal
tem sete elementos.

## As aparições

Todas com a mesma forma mecânica: **restrição declarada muda, razão adjacente ou ausente do
ponto de leitura, leitor propõe alargar.**

| # | A restrição | Onde é declarada | Onde a razão estava | Estado |
|---|---|---|---|---|
| 1 | as sete faixas do fator de redução, `[30, 40, 50, 60, 70, 80, 100]` | array literal inline em `products/content.component.tsx` e `services/content.component.tsx` | duas migrações e o cabeçalho de `item-tax-rates.ts` | **disparou** — virou campo livre, e a reversão custou uma rodada inteira |
| 2 | `isLRorLPorSH` decidindo quem grava `sale_price_base` | `products/content.component.tsx:230`, sem comentário | em lugar nenhum do código — é a regra do regime: o Simples tem IBS/CBS dentro da guia única | **quase disparou** — houve recomendação de alargar para SN/MEI/serviço; o dono do produto barrou |
| 3 | `isLRorLPSvcComp` inclui `LUCRO_PRESUMIDO_RET`; `isLRorLP`, no produto, não inclui | `services/content.component.tsx:135` e `products/content.component.tsx:229`, nenhuma com comentário | nenhuma das duas cita nada | **armada** — dois nomes quase iguais com membros diferentes, e não dá para saber pelo código se a divergência é regra ou descuido |
| 4 | `isLucroRealOrLP = isLucroReal \|\| isLucroPresumido \|\| isSimplesHibrido` | `items/new-item-form.component.tsx:58`, sem comentário, usada em 11 pontos | nenhuma | **armada** — o NOME exclui o Simples Híbrido e o VALOR o inclui. Quem ler o nome e alargar "para incluir o SH" mexe no que já estava incluído |

As duas últimas ainda não produziram proposta nenhuma. Estão na tabela porque a forma é
idêntica e o gatilho é o mesmo — é o mesmo estado da migração do PR #18 em
`migration-delivery.md`: **ficou armada, esperando**.

### O que a #3 e a #4 NÃO afirmam

Não afirmam defeito. A divergência entre produto e serviço quanto ao RET **pode** ser a regra
certa; o nome `isLucroRealOrLP` com Simples Híbrido dentro **pode** ter razão. O que se afirma é
que **não dá para saber pelo código** — e é exatamente essa a condição que produziu a #1 e a #2.

## O repositório já sabe fazer — e é isso que torna a regra barata

Esta página não pede hábito novo. Pede **uniformidade de um hábito que já existe**, às vezes na
mesma tela, às vezes duas linhas acima:

```ts
// services/content.component.tsx:127
// MEI: o DAS é fixo e independe do faturamento — imposto NUNCA entra na
// formação do preço. `taxPreview.isMei` é a fonte canônica; …
const isMeiSvcComp = taxPreview?.isMei === true || currentUser?.taxableRegime === 'MEI'
const isLucroRealSvcComp = currentUser?.taxableRegime === 'LUCRO_REAL'      // ← nada
const isLucroPresumidoSvcComp = …                                          // ← nada
const isSHSvcComp = …                                                      // ← nada
const isLRorLPSvcComp = …                                                  // ← nada
const isLRorLPorSHSvcComp = …                                              // ← nada
```

Uma guarda citada, cinco mudas, no mesmo bloco.

```ts
// items/new-item-form.component.tsx:50
// Lucro Real — base PIS+COFINS não-cumulativo (1,65% + 7,6% = 9,25%)
const PIS_COFINS_BASE = 9.25
…
const isLucroRealOrLP = isLucroReal || isLucroPresumido || isSimplesHibrido  // ← nada
```

O número mágico ganhou a razão; a guarda de regime, oito linhas abaixo, não. A assimetria é
consistente e diz algo: **cita-se o que parece precisar de explicação, e uma condição booleana
parece se explicar sozinha.** Não se explica — ela codifica quem está dentro e quem está fora,
que é precisamente onde mora a regra externa.

## As três regras

### 1. A citação acompanha a DECLARAÇÃO, em cada ponto onde a restrição é declarada

Não uma vez, no ponto de origem. **Em cada ponto.** A restrição do IVA DUAL era declarada em
três lugares e citada em nenhum dos três.

E a citação tem de dizer **o que faria a restrição mudar**. `// LC 214/2025, art. 127` serve;
`// por lei` não serve, porque não diz onde olhar nem o que precisaria acontecer para a lista
crescer. A citação boa é a que permite ao próximo leitor **verificar**, não só acreditar.

### 2. Restrição sem razão citada no ponto de declaração não autoriza remoção. Autoriza pergunta

Esta é a regra do lado de quem PROPÕE, e é estreita de propósito.

A versão larga — "quem propõe precisa achar a razão antes" — foi considerada e **descartada**:
é pedido de cuidado, sem gatilho e sem critério de parada, exatamente o que
`registro-de-classe.md` recusa quando diz que "procure padrões" não seria regra. A forma
estreita tem as duas coisas: **gatilho** (achei uma restrição muda) e **ação** (pergunte antes
de alargar).

Alargar uma restrição é destrutivo de um jeito silencioso: nada quebra, nenhum teste fica
vermelho, e o dado errado só aparece meses depois. Perguntar custa uma mensagem.

### 3. Grep acha a restrição; a razão mora na linha que não contém o identificador

A mais barata das três, e a que explica o caso melhor que qualquer outra.

O levantamento greppou `iva_dual_reduction_factor` na migração
`20260628000001`. A **linha 1** casou e apareceu no resultado:

```
-- Migration: CHECK constraint para iva_dual_reduction_factor (Relatório de Correção v2.0, Item 02)
```

A **linha 2** tinha a lei e **não casou**, porque diz "Fator de Redução do IVA Dual" em prosa,
sem o identificador:

```
-- LC 214/2025 — 7 faixas válidas do Fator de Redução do IVA Dual: 30, 40, 50, 60, 70, 80, 100.
```

Uma linha de distância decidiu a rodada. E a linha que casou já trazia um segundo sinal
ignorado: **`Relatório de Correção v2.0, Item 02`** — a constraint foi adicionada *depois* da
coluna, de propósito, como correção. Restrição acrescentada mais tarde como conserto é evidência
de razão mesmo sem a razão escrita.

**Ao ler um artefato para justificar afrouxar uma restrição, abra o arquivo.** Não confie no que
casou com o padrão. Esta regra não depende de ninguém ser mais cuidadoso — depende de um
comando diferente.

## O discriminante contra `decisao-sob-regra-da-epoca.md`

As duas tratam de uma decisão antiga que parece errada agora. Separam-se na primeira pergunta:
**a regra mudou?**

| | `decisao-sob-regra-da-epoca` | esta página |
|---|---|---|
| A regra | **mudou** | **é a mesma** — a LC 214 valia quando o `Select` foi escrito e vale hoje |
| A decisão antiga | certa **para a época**, errada pela régua de hoje | certa **agora**, pela régua de agora |
| O erro de quem revisita | anacronismo — julgar o passado pela régua nova | **desconhecimento da regra vigente** |
| A correção que previne | **datar** a decisão e a regra sob a qual foi tomada | **citar a fonte externa** no ponto de declaração |

A diferença é operacional, não filosófica: **datar não resolve nada aqui.** A data do `Select` é
irrelevante — ele estaria igualmente certo se tivesse sido escrito ontem. E citar a lei não
resolve o caso da outra página, onde a lei citada seria a revogada.

## O eco com `ausente-vs-falso.md`

**Ausência de citação foi lida como ausência de razão.** É a mesma forma de ler `NULL` como `0`:
um estado que significa "não informado" tratado como um estado que significa "não existe".

A diferença é só o material. Lá é uma coluna; aqui é um array literal sem comentário. Nos dois
casos o dano vem de converter silêncio em afirmação — e nos dois casos a correção é a mesma
família: **tornar a ausência visível**, seja deixando a coluna nulável, seja escrevendo de onde
a lista veio.

## De quem são

**As duas aparições que produziram proposta de alargar são do assistente.** E a segunda veio
**depois** de o dono do produto ter corrigido a primeira família de erro.

Está escrito assim porque é o que sustenta a página: se citar a lei bastasse, a #1 não teria
acontecido — a lei estava citada três vezes. E se o problema fosse falta de cuidado individual,
a #2 não teria acontecido depois da correção da #1, porque a correção teria bastado.

**O que NÃO é:** não é descuido. As quatro aparições têm a mesma forma mecânica — restrição
declarada muda, razão adjacente, leitor alarga. Se fosse descuido, a correção seria "tenha mais
cuidado", e não haveria por que escrever página nenhuma.

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, e **dirigida**: o dono do produto apontou onde procurar —
guardas de regime e de segmento, onde a razão é sempre externa (lei, regime tributário) e a
declaração é sempre inline. O palpite estava certo, e é de onde saíram a #3 e a #4.

Método, para quem for refazer:

```bash
# pontos de DECLARAÇÃO de guardas de regime/segmento
grep -rnE "const (is[A-Z][A-Za-z]*) *=" --include=*.ts --include=*.tsx src \
  | grep -iE "mei|simples|lucro|real|presumido|hibrid|regime|servico|revenda|industrial"
# e então, para cada uma, LER as linhas acima — não greppar por elas
```

A busca parou em quatro. Nenhuma quinta foi forçada.

## Relação com as outras regras

`decisao-sob-regra-da-epoca.md` é a vizinha da qual esta se distingue explicitamente — ver o
discriminante acima. `ausente-vs-falso.md` é a mesma forma de erro em outro material.
`teste-que-nao-exercita.md` e `portao-que-nao-alcanca.md` tratam do verde que não afirma nada;
esta trata do **silêncio que afirma "não há razão"**. E `registro-de-classe.md` decidiu tanto a
forma desta página quanto o descarte da versão larga da regra 2.
