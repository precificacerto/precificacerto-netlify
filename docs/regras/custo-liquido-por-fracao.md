# Regra do motor — custo líquido por fração, e o custo líquido do item

> Versionada em 09/11/2026 a partir de `claude/Regra_Custo_Liquido_Por_Fracao.md` (o documento do projeto, fora deste repositório),
> com o texto do dono do produto como veio. As referências a `claude/*.md` apontam para esses documentos do projeto. O que mudou ao
> versionar está na seção "O estado medido ao versionar", no fim.

Decidido com o PO em 09/11/2026. **É regra do motor, não de cadastro.** A
atualização da tabela vem depois; o motor precisa saber a regra desde já.

> "O que importa é que o motor saiba qual é a regra que tem que ser aplicada,
> porque a atualização da tabela a gente implementa depois. Importante também
> que o motor saiba que, se nós temos uma barra de 6 metros com o custo bruto e
> os abatimentos dos créditos recuperáveis, ele já consegue identificar por
> metro o que vai ser utilizado para encontrar aquele custo." — PO

## A ordem, e ela é esta

```
1.  custo bruto da UNIDADE DE COMPRA          (a barra de 6 m, a peça, o pacote)
2.  − crédito de ICMS           (sobre o bruto)
3.  − crédito de PIS/COFINS     (sobre o SALDO)
4.  + IPI sem crédito           (compõe o custo)
    = CUSTO LÍQUIDO DA UNIDADE DE COMPRA
5.  ÷ a medida da unidade        (6 m, 5,50 m, 1 peça)
    = CUSTO LÍQUIDO DA FRAÇÃO    (por metro, por peça)
6.  × o consumo do item          (os metros que aquele item consome)
    = CUSTO LÍQUIDO DO MATERIAL NO ITEM
7.  Σ de todos os materiais do item
    = AGRUPAMENTO CUSTO LÍQUIDO DO ITEM
```

**A cascata roda na unidade de compra, antes de dividir.** O crédito nasce na
**entrada da mercadoria** — a barra comprada —, não na fração consumida. A
palavra **fração** já é a da casa: *"é dela que sai o custo líquido da fração (a
unidade de medida que a receita do produto consome)"*
(`claude/Levantamento_Dois_Blocos_Exclusao_Estorno.md`).

Para percentuais puros, dividir antes ou depois dá o mesmo número — conferido:
`398,304 × 0,83 × 0,9075 ÷ 6 = 50,002088` e
`(398,304 ÷ 6) × 0,83 × 0,9075 = 50,002088`. **Mas a ordem acima é a que vale**,
porque é a única que continua certa quando entrar valor em R$ (IPI, ST, DIFAL
vêm em valor na nota, não em percentual) e porque é onde o arredondamento deve
cair: no documento de entrada.

### Exemplo trabalhado, para o teste de regressão

`9641` — HF88S MARCO CORRER DUPLO COM ABA, BRANCO, barra de 6 m:

| | |
|---|---|
| bruto da barra | R$ 398,3040 |
| crédito ICMS 17% | − R$ 67,7117 |
| saldo | R$ 330,5923 |
| crédito PIS/COFINS 9,25% sobre o saldo | − R$ 30,5798 |
| **líquido da barra** | **R$ 300,0125** |
| **líquido por metro** | **R$ 50,002088** |
| *(bruto por metro, para comparação)* | *R$ 66,384000* |

Os 17% e os 9,25% deste exemplo são a hipótese do Lucro Real; a coluna de
crédito de PIS/COFINS do perfil está **vazia** hoje (ver
`claude/Contrato_Tabela_Fornecedor.md`).

## Por que isto é o coração do Orçamentista

Sem o custo líquido por fração **não existe custo por item**: uma barra é
cortada e dividida entre esquadrias diferentes, então não há como atribuir a
barra inteira a um item. É a fração que torna o item individualmente custeável —
e o custo por item é a regra que define a seção nova do Orçamentista
(`claude/BRIEFING_Agente_Para_Precificacao.md`).

## OS DOIS MODOS — decisão do PO, 09/11/2026

> "Nós teremos uma situação de aproveitamento ou não aproveitamento.
> Aproveitamento é quando ele usa parte do todo que é considerado — exemplo, usa
> 78% da barra. E quando não tem aproveitamento, considera o cálculo da barra
> inteira. (…) Quando considerado sem aproveitamento, que é barra inteira, ele
> vai ter que fazer o cálculo sobre o total de barras daquela proposta e dividir
> proporcionalmente por item." — PO

**Todo item carrega SEMPRE os dois valores: bruto e líquido.** Em qualquer dos
modos.

### Modo COM aproveitamento

O item paga o **consumo real** — os metros que de fato entram nele.

```
custo do material no item = custo líquido da fração × consumo do item
```

### Modo SEM aproveitamento (barra inteira)

O item paga a sua parte das **barras inteiras da proposta**:

```
1.  total de barras da proposta, POR CÓDIGO
2.  custo líquido de cada barra (a cascata da seção anterior)
3.  ratear, por código, entre os itens, na proporção do consumo
    de AQUELE código em cada item
```

**O rateio é POR CÓDIGO, não por metro global** — e isto não é detalhe. Cada
perfil tem um R$/m diferente: o `HF88S` custa R$ 66,384 o metro e o baguete
`GB25` custa R$ 10,3725. Um rateio por metro global faria o item que só usa
baguete pagar a média, subsidiando o item que usa marco. Por código, cada item
paga o que puxou.

### As duas direções do cálculo — e são opostas

O PO nomeou a diferença: *"vai fazer o rateio ao contrário"*.

| modo | direção | parte de | chega em |
|---|---|---|---|
| **COM aproveitamento** | **de baixo para cima** | o consumo de cada item | o total, somando os itens |
| **SEM aproveitamento** | **de cima para baixo** | o total de barras do **pedido inteiro** | cada item, por rateio |

> "Quando for um modo sem aproveitamento, é sinal que aquele pedido inteiro deve
> ser considerado. Em tese, ele vai ficar mais caro, porque vai fazer o rateio ao
> contrário: vai considerar o total e vai fazer o rateio. Diferente do
> aproveitamento, que ele sai do consumo." — PO, 09/11/2026

**Sim, fica mais caro — e é o ponto.** Medido no "Geraldo Huck":
R$ 5.281,47 por barra inteira contra R$ 4.172,44 por consumo real, **26,58%
mais caro**, os R$ 1.109,01 da sobra. No modo sem aproveitamento a sobra **é
cobrada**; no modo com aproveitamento ela **não é**, e nesse caso alguém
precisa decidir quem a absorve.

**Consequência de desenho:** o modo é do **pedido**, não do item. Todos os itens
de uma proposta usam o mesmo modo, porque o rateio de cima para baixo só existe
em relação ao total daquele pedido.

### O MODO TEM DE VIAJAR CONGELADO ATÉ A PRECIFICAÇÃO

> "É importante que, na hora da precificação, essa informação chegue até lá."

A informação não pode ser **lida ao vivo** da base de conhecimento no momento de
precificar. Se for, mudar o modo na base de conhecimento muda o preço de um
orçamento que já foi feito — e um orçamento já entregue ao cliente deixa de ser
reproduzível.

**O modo tem de ser gravado no levantamento, junto com os outros percentuais** —
e o padrão já existe e está medido em produção:

| o que já é congelado hoje | onde |
|---|---|
| comissão do vendedor, reserva técnica, lucro projetado | `orcamentista_levantamento.comissao_percentual`, `reserva_tecnica_percentual`, `lucro_projetado_percentual` |
| o motor usado | `orcamentista_levantamento_item.motor_id` (uuid, nunca o nome) |

O modo de aproveitamento entra nessa mesma lista: **lido da base de conhecimento
no momento em que o levantamento é fechado, gravado no levantamento, e dali em
diante é ele que vale** — exatamente como o `motor_id`, que é por uuid e não por
rótulo justamente para que trocar o motor não desconfigure o que já foi
calculado.

Dois campos, não um:

```
aproveitamento_modo    COM | SEM
aproveitamento_origem  'base de conhecimento' | 'fallback: <motivo do aviso>'
```

O segundo existe porque o fallback para barra inteira dispara um aviso, e o
aviso tem de ficar legível depois — sem ele, ninguém sabe por que aquele
orçamento saiu 26% mais caro.

### O gatilho, e o que acontece quando o pré-setado não vale

A informação de qual modo usar é **pré-setada na base de conhecimento**, por
empresa, e o agente a aplica em **todos** os orçamentos sem perguntar.

> "Casualmente tenha algo diferente disso, aí ele vai avisar o agente e o agente
> vai desconsiderar, ou seja, vai considerar a barra inteira."

Ou seja: **barra inteira é o fallback seguro.** Diante de qualquer divergência
do pré-setado, o agente avisa e cai para *sem aproveitamento*. Isso é coerente
com o resto do sistema: o fallback nunca pode ser o que barateia o custo.

### ONDE FICA, E QUEM DECIDE — decisão do PO, 09/11/2026

> "O seletor deve estar dentro da seção da precificação, que estará dentro do
> menu Orçamentista. Sendo definido **por orçamento**, sobre a orientação da base
> de conhecimento, podendo ser alterada / corrigida."

Isto **corrige** a versão anterior desta seção, que punha o seletor na tela das
credenciais. O lugar é outro, e a natureza do campo é outra.

| camada | papel |
|---|---|
| **base de conhecimento** | **orienta** — é o padrão da empresa, o valor que chega preenchido |
| **seletor na seção de precificação** (menu Orçamentista) | **decide** — por orçamento, e pode ser alterado ou corrigido ali |
| **o orçamento** | **guarda** o modo que de fato valeu, congelado |

O campo é **por orçamento**, não uma chave global que vale calada para todos. A
base de conhecimento não manda: ela orienta. Quem decide é o seletor daquele
orçamento, e ele fica **dentro da seção da precificação**, onde a pessoa está
quando o preço se forma — não numa tela de configuração distante.

Isso também **resolve a pergunta de permissão** que estava em aberto: quem
altera é **a pessoa**, no orçamento, pelo seletor. O agente aplica o que
encontra e tem um único desvio próprio — o fallback para barra inteira, com
aviso e motivo.

**Três origens possíveis, e todas têm de ficar gravadas:**

```
aproveitamento_modo     COM | SEM
aproveitamento_origem   base_de_conhecimento
                      | alterado_no_orcamento
                      | fallback_barra_inteira
aproveitamento_motivo   texto, quando origem != base_de_conhecimento
aproveitamento_por      quem alterou, quando foi alterado no orçamento
```

Sem a origem gravada, ninguém descobre depois por que dois orçamentos da mesma
empresa, no mesmo dia, saíram com 26,58% de diferença.

**A trava que vem de graça com "por orçamento":** alterar o modo **reprecifica**
— é a diferença entre R$ 4.172,44 e R$ 5.281,47. Então, se o orçamento já foi
enviado ao cliente, a alteração gera **nova versão**, nunca uma edição silenciosa
do mesmo número. O que já saiu tem de continuar reproduzível.

**Dois pontos para o Code medir antes de desenhar** (não tenho acesso ao
repositório nesta sessão):

- a seção de precificação dentro do Orçamentista ainda não existe — nasce com
  este bloco, então o seletor entra no desenho dela desde o início, não depois;
- de onde vem o valor que chega preenchido: a `orcamentista_base_conhecimento`
  é por `tenant_id`, o que serve; confirmar que nada no caminho a lê por nicho.

### FALTA A PROVISÃO — medido em 09/11/2026

O PO disse que a informação já está provisionada na base de conhecimento.
**Medido: não está.** Não existe campo de modo de aproveitamento em lugar algum.

| tabela | o que tem | tem o modo? |
|---|---|---|
| `orcamentista_base_conhecimento` | só `frete_*` e `instalacao_*` (modo, valor, percentual, base) | **não** |
| `orcamentista_esquadrias_padrao` | `barra_mm`, `serra_mm` — e **0 linhas** | **não** |
| `orcamentista_esquadrias_base` | `barra_mm`, `serra_mm` — 1 linha | **não** |
| `orcamentista_mp_categoria.config` (PERFIL) | `cor_predominante`, `cores`, `serra_mm` | **não** |
| `orcamentista_motor_otimizacao` | os 7 parâmetros de corte | **não** |

O que **existe** é o motor de otimização que **produz** o aproveitamento —
`algoritmo: FFD (maior primeiro, melhor encaixe)`, `barra_mm: 6000`,
`serra_mm: 5`, `refilo: 45 mm por ponta só em PINTURA MADEIRA`,
`sobra_minima_mm: 0`, e as exceções `IL50/WOLFF 5.500 mm` e `KT16 5.800 mm`. É
dele que saiu o 78,29% do "Geraldo Huck". **O que falta é o interruptor**: usar
esse resultado ou ignorar e cobrar barra inteira.

**Onde ele nasce — decidido pelo PO em 09/11/2026:** na
`orcamentista_base_conhecimento`, que é a tabela da base de conhecimento e já
segue o padrão `modo / valor / percentual / base` para frete e instalação. Um
campo de modo por empresa, com *sem aproveitamento* como padrão até ser
preenchido, porque o fallback nunca pode ser o que barateia.

De lá ele **orienta** o seletor da seção de precificação, que é quem decide por
orçamento e pode ser corrigido — e o modo que valeu fica gravado no orçamento.
Ver a seção anterior.

### O ALERTA DE MEDIÇÃO: o aproveitamento em metros NÃO serve de fator de dinheiro

Medido no "Geraldo Huck":

| | |
|---|---|
| aproveitamento em **metros** | 201,59 ÷ 257,50 = **78,2874%** |
| aproveitamento em **dinheiro** | 4.172,44 ÷ 5.281,47 = **78,9930%** |
| total das barras | R$ 5.281,47 |
| consumo real | R$ 4.172,44 |
| sobra | R$ 1.109,01 |

São **dois números diferentes**, porque cada barra tem um R$/m próprio. Se
alguém usar o percentual em metros como fator sobre o valor, o resultado erra:
`4.172,44 ÷ 0,782874 = R$ 5.329,65` contra os **R$ 5.281,47** reais — **R$ 48,18
de erro** numa proposta de três itens.

**Regra, portanto:** o modo *sem aproveitamento* rateia o **valor** das barras
por código, nunca aplica o percentual de aproveitamento em metros sobre
dinheiro. É a mesma classe de defeito que esta auditoria vem perseguindo: um
número plausível, uma conta errada, e a diferença some dentro do preço.

## O que o motor precisa guardar por item

Para que a leitura seja auditável depois, por material consumido no item:

```
modo (com / sem aproveitamento) · motivo, se caiu para barra inteira
código do fornecedor · descrição · unidade de compra · medida da unidade
custo bruto da unidade
% crédito ICMS · % crédito PIS/COFINS · % crédito IPI · % IPI sem crédito
custo líquido da unidade · custo líquido da fração
consumo do item (na unidade da fração)
custo líquido do material no item
custo BRUTO do material no item
barras inteiras da proposta por código · sobra por código
```

**Bruto e líquido de cada item, sempre os dois** — é a exigência do PO de
09/11/2026, e é o que permite conferir a cascata depois sem refazer a conta.

Isso **não vai para a conversa do WhatsApp** — fica na seção do Orçamentista,
pela decisão de 08/11. Mas tem de existir, porque é dele que sai o custo líquido
e o valor unitário do item.

## O estado medido ao versionar (09/11/2026, só leitura)

- **O recálculo do importador** (`src/utils/atendimentos-ia-bloco-tributario.ts`, do #208) somava os percentuais creditáveis e os aplicava
  sobre o bruto (17 + 9,25 = 26,25%); a cascata desta regra dá 24,6775% no mesmo par. No 9641, R$ 293,7492 contra R$ 300,0125 por barra.
  A correção para a cascata é PR própria (Nível 3), aprovada pelo dono do produto em 09/11/2026.
- **Nada no cálculo lê** `custo_liquido`, `credito_pct`, `cred_icms_pct`, `cred_pis_cofins_pct` ou `cred_ipi_pct`: só a importação os escreve
  (a função `importar_conteudo_da_tabela`) e confere o que veio no arquivo.
- **O que está gravado** em `orcamentista_tabela_item`: 628 itens com `custo_liquido`, em 8 das 10 tabelas, todos com `credito_pct = 21,25`
  e o líquido igual a `custo × (1 − 0,2125)` — a soma de ICMS 12 e PIS/COFINS 9,25, sem cascata. A tabela de PERFIL (460 itens) e a da IMAB
  (0 itens) estão sem bloco. Pela cascata, o efetivo de 12 + 9,25 é 20,14%, não 21,25%.
- **A seção de precificação do Orçamentista não existe**, e `orcamentista_base_conhecimento` é lida só por `tenant_id`
  (`src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`), nunca por nicho.
