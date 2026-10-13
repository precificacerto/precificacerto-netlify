# O Limite do Desconto, e o Que Acontece Quando Ele É Ultrapassado

> **Esta regra é independente da rodada que a originou.** Ela nasceu na correção do card
> "Distribuição do resultado" (13/10/2026), porque foi ali que a VII.5 precisou ser reescrita,
> mas **não depende dela**: vale para orçamento, pedido e venda, em todo regime e todo segmento.
> Reverter aquela correção não deve levar esta página junto.

**Escopo.** A Parte VII da ESPEC: o limite de desconto, os três estados, a autorização, e o
que a repartição do resultado faz acima do limite. Não trata da cascata tributária — isso é
`cascata-lucro-real.md` — nem da apresentação da tabela, que é `decomposicao-na-tela.md`.

## Por que esta página existe

A regra vivia **só em comentário de módulo**, e **mudou duas vezes em três dias**: decidida em
11/10/2026, implementada em 12/10, reescrita em 13/10. Quem fosse mexer na repartição leria o
cabeçalho de um dos dois módulos e encontraria a redação daquele módulo — não a história da
decisão, nem a medição que derrubou a primeira versão.

É o diagnóstico de `registro-de-classe.md` com outro material: ali o que ficava soterrado era
corpo de PR, aqui é comentário de arquivo. Os dois são **o lugar em que não se lê** no momento
em que importa. Os comentários **ficam** — eles estão no ponto de declaração, que é o que
`razao-longe-da-restricao.md` exige — e apontam para cá.

**Onde a regra é imposta, em código:**

| Ponto | O que mora ali |
|---|---|
| `src/utils/limite-de-desconto.ts` | a VII.3 (o limite), os três estados, o denominador lido da matriz, o rastro da autorização |
| `src/utils/mrm-engine-v17/absorption.ts` | a VII.4 e a VII.5 na etapa 16 do motor — o piso de exibição e o descoberto |
| `src/utils/decomposition-dre.ts` | o **piso da decomposição**, que é o que as telas leem, e o descoberto exibido |
| `src/page-parts/shared/autorizacao-do-desconto.component.tsx` | o aviso, o checkbox e o reset — um componente para as três telas |

## O limite — VII.3

```
LimiteMinimo = (CP + MOD + DOP) ÷ (1 − Σ imp_dentro% − RT%)
d_máximo     = 1 − (LimiteMinimo ÷ OP_DENTRO)
```

O limite cai **exatamente onde o RRO zera**. Acima dele a venda não cobre o que já aconteceu.

**O denominador é lido da matriz, sem nomear regime.** Entra o tributo cuja célula tem
colocação `POR_DENTRO` **e** base `≠ LUCRO`. O `base ≠ LUCRO` é o discriminante que a própria
VII.3 usa ao dizer, do Lucro Real, que *"IRPJ/CSLL não entram: são resíduo"* — e com ele a
regra reproduz a tabela da VII.3 nos seis regimes sem um `if` por regime
(`regime-e-segmento-determinam-a-construcao.md`: a decomposição lê, não infere).

**Os três estados — VII.2, e são três:**

| estado | quando | na tela |
|---|---|---|
| `VERDE` | desconto ≤ limite | nada aparece |
| `AMARELO` | acima do limite, não autorizado | aviso + checkbox desmarcado, **save travado** |
| `VERMELHO_AUTORIZADO` | acima do limite, autorizado | salva, e a repartição vai a zero |

**A autorização não sobrevive à mudança do número.** Mudar o desconto depois de autorizar
reseta o checkbox e volta a travar o save — `useAutorizacaoDoDesconto`. Autorização que
sobrevive à mudança do número é autorização para outro número.

**Alíquota ausente não vira alíquota zero.** `somaDoDenominador` devolve `semAliquota` com os
tributos que a matriz manda somar e para os quais o chamador não trouxe percentual: eles
contribuem zero na soma, porque não há outro número a usar, **mas a lista sai**, para que a
tela diga que o limite está incompleto em vez de exibi-lo como apurado — `ausente-vs-falso.md`.

---

## A VII.5 — AS DUAS REDAÇÕES, DATADAS

### A redação de 11/10/2026 — CAIU

> O sacrifício segue o **modo de proteção**.

Acima do limite, o modo continuava governando e **congelava a parcela protegida**:
`COMMISSION_PROTECTED` pagava `comissão% × âncora` integral, `PROFIT_PROTECTED` pagava
`lucro% × âncora`, e o descoberto era `|RRO|` **mais** o que ficou congelado.

### A redação de 13/10/2026 — VIGENTE

Formulação do dono do produto, registrada como está:

> **ATÉ** o limite → o modo de proteção governa, como hoje. **ULTRAPASSADO** → zera nos TRÊS
> modos. Comissão zero, lucro zero, descoberto = `|RRO|`, igual nos três.

| estado | comissão | lucro | descoberto |
|---|---|---|---|
| **até o limite** | o modo governa, como sempre | idem | não existe |
| **ultrapassado e autorizado** | **ZERO** | **ZERO** | `\|RRO\|`, **IGUAL nos três modos** |

IRPJ e CSLL vão a zero junto, **por conta e não por omissão**: são tributo sobre o lucro, e
lucro zero não produz imposto sobre lucro.

### A medição que derrubou a primeira

Mesmo documento, mesmo desconto autorizado, **só o modo diferente**:

| modo | descoberto, redação de 11/10 |
|---|---:|
| Congela Lucro | **R$ 4.114,07** |
| Proporcional | **R$ 1.093,16** |

### Por que caiu — e a razão é de coerência de tela, não de conta

O defeito que abriu a rodada: o aviso dizia *"operação em lucro zero"* e o card
"Distribuição do resultado", no mesmo orçamento, exibia **Lucro R$ 1.956,86 (7,441%)**. Daí a
regra do dono do produto, de 13/10/2026:

> Nenhuma tela pode exibir lucro positivo enquanto o aviso diz lucro zero.

Com o modo congelando acima do limite, a etapa 16 continuaria exibindo uma parcela integral —
e a Memória Cascata **é** uma tela que mostra repartição. A regra nova fecha na origem: sem
congelamento não há parcela protegida a exibir.

**O ganho que não era o objetivo e vale registrar:** o descoberto ficou **comparável**. Antes,
dois documentos idênticos com modos diferentes mostravam prejuízos diferentes, e a diferença
era escolha de absorção, não fato econômico.

**Consequência de implementação, escrita porque é contraintuitiva:** no ramo de RRO negativo o
`policy` **deixou de ser lido de propósito**. Um ramo por modo ali reintroduziria exatamente a
variação que a regra nova existe para eliminar.

### O que NÃO mudou: zero é piso de EXIBIÇÃO

A VII.4 continua valendo com todas as letras — *"o número não pode mentir"*. As etapas 12 a 15
ficam inalteradas e **o RRO continua saindo negativo, como a conta manda**. O que ganha piso é
a REPARTIÇÃO, e o que não cabe sai na linha de **descoberto**. Sem essa linha, forçar as
parcelas a zero faria a etapa 17 fechar **escondendo o buraco** — que é o que a arquitetura de
dois blocos existe para impedir.

---

## UM NÚMERO SÓ NA TELA — e a divergência que resta

Decisão de 13/10/2026: o aviso e o card leem **o mesmo** descoberto. Antes liam fontes
diferentes, e o usuário via dois números para o mesmo prejuízo no mesmo documento:

| quem exibia | de onde lia | número |
|---|---|---:|
| o aviso | motor, etapa 16 | **R$ 1.093,16** |
| o card | decomposição | **R$ 618,13** |

Os dois passam a ler a **decomposição**, porque ela é a fonte única do card desde o `1934dbb`
e é a única que fecha o próprio DRE.

### A DIVERGÊNCIA DOS DOIS RRO — registrada, NÃO corrigida

Os dois descobertos não são o mesmo número porque **os dois RRO não são**:

| | |
|---|---:|
| motor (etapa 16) | R$ 1.093,16 |
| decomposição | R$ 618,13 |
| **divergência** | **R$ 475,04** |

**A razão:** a decomposição **corrige três coisas que a etapa 16 não corrige** — a ordem das
deduções da R19, o CMV do item e a escala do PIS/COFINS. Foi justamente por isso que o
`1934dbb` fez o card trocar de fonte.

**Ela é ANTERIOR a esta rodada e existe TAMBÉM ABAIXO do limite**, onde não há autorização
nenhuma. Há um caso no portão que o prova, para que ninguém a leia como efeito do piso.

**Por que não foi corrigida.** Decisão do dono do produto: *registrar, não corrigir.* Unificar
os dois RRO é rodada própria — mexeria na **etapa 16 do motor**, que é o que a base instalada
já gravou em `tax_breakdown` (`fato-vs-referencia.md`: aquele número é fato histórico, não
referência viva). Esta rodada tirou a divergência **da tela**; ela segue viva na Memória
Cascata, que é a tela do motor.

> Está escrito aqui com os dois números porque uma divergência conhecida sem o par de números
> ao lado é indistinguível de um defeito a caçar. Quem chegar depois precisa saber que ela foi
> **medida e deixada de propósito**.

---

## O defeito do SINAL, que era pior que o piso

Dois `Math.abs` — em `residual-from-decomposition.ts` e `decomposition-dre.ts`, nas linhas
`:76` e `:720` **de antes da correção** —
convertiam valor negativo em positivo **antes de qualquer regra**. Era por eles que o card
exibia `LUCRO R$ 1.956,86 (7,441%)` no mesmo orçamento em que o aviso dizia lucro zero — o
sinal tinha sido apagado a caminho da tela.

**Valor negativo tem de chegar negativo e ser tratado por regra, nunca por `abs`.** Um `abs`
num ponto de exibição não trata sinal: ele **apaga a informação** de que havia sinal a tratar,
e o número que sai é plausível — que é o que o torna pior que uma linha vazia.

E a distinção que a tela precisava ganhar junto: **comissão R$ 0,00 por cadastro em 0% e
comissão R$ 0,00 por piso da autorização eram indistinguíveis.** Hoje a linha zerada por piso
carrega `zeradaPorAutorizacao` e exibe `"X% original → ZERADO pela autorização do desconto"` —
`ausente-vs-falso.md`: zero exibido sem marca afirma que o valor é zero.

## Os portões

| portão | o que ele fica vermelho |
|---|---|
| `a-trava-do-desconto-vira-autorizacao.test.ts` | o limite, os três estados, o denominador por regime, a VII.5 |
| `o-card-nao-mente-sobre-o-lucro.test.ts` | o sinal, o piso, o descoberto, **os três modos com o MESMO descoberto acima do limite** — e o par que mostra que abaixo dele eles seguem diferentes entre si |
| `o-portao-de-componente-da-autorizacao.test.tsx` | o aviso, o checkbox, o save travado e o **reset na mudança do desconto**, nas três telas |

O par do segundo portão é o que satisfaz `teste-que-nao-exercita.md`, variante 2: um caso que
só medisse "os três modos dão o mesmo número" passaria verde com a regra antiga em qualquer
documento abaixo do limite. **O caso que discrimina é o par.**

E a fixture de comissão precisa ser **diferente de zero**: com comissão cadastrada em 0%,
`COMMISSION_PROTECTED` congela `0% × âncora = 0`, e os três modos coincidem **sem exercitar a
regra**. Foi essa a correção de uma asserção minha que media um valor só.

## O corolário aplicável ANTES do defeito existir

**Antes de escrever qualquer coisa que reparta resultado, pergunte se o estado da autorização
chega naquele ponto.** Três candidatos a repetir o defeito:

1. **Um `Math.abs` em ponto de exibição.** Se o valor pode ser negativo, o `abs` não trata o
   caso — ele o esconde. A regra decide; o `abs` nunca decide.
2. **Uma parcela em R$ 0,00 sem marca.** Zero por cadastro e zero por piso são o mesmo byte na
   tela. Quem exibe tem de dizer qual dos dois é.
3. **Um ramo por modo de absorção no estado autorizado.** Acima do limite não há modo: é a
   regra de 13/10, e um `switch (policy)` ali a desfaz sem que nada fique vermelho se o caso
   escolhido tiver comissão zero.

E a regra do lado de quem propõe mudar: **restrição sem razão citada no ponto de declaração
não autoriza remoção — autoriza pergunta** (`razao-longe-da-restricao.md`). Os dois módulos
citam esta página no cabeçalho justamente para que a citação não more só aqui.

## Relação com as outras regras

`registro-de-classe.md` é a razão desta página existir, e decidiu a forma dela.
`teste-que-nao-exercita.md` é o que exige o par de casos do portão do card — variante 2, os
valores precisam DISCRIMINAR. `ausente-vs-falso.md` cobre o zero exibido sem marca e a
alíquota ausente que não é zero. `fato-vs-referencia.md` é a razão de a etapa 16 do motor não
ser corrigida nesta rodada: o número dela está gravado.
`regime-e-segmento-determinam-a-construcao.md` é a razão de o denominador ser lido da matriz
em vez de inferido por regime.
`decomposicao-na-tela.md` cobre como a tabela se apresenta; esta cobre o que ela mostra quando
o desconto estoura. `cascata-lucro-real.md` tem a cascata e a ordem do DRE (R19) que a
divergência dos dois RRO atravessa.
