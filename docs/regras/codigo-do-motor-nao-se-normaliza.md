# O Código do Motor Não Se Normaliza

> **Esta regra é independente da funcionalidade que a originou.** Nasceu em 12/11/2026, nos desenhos das
> tipologias (#264), porque foi ali que uma normalização de código juntou dois produtos diferentes. **Não
> depende dos desenhos**: vale para todo lugar que casa, junta ou conta códigos de tipologia, de item ou de
> perfil.

## O critério

Formulação do dono do produto, registrada como está:

> **CÓDIGO DO MOTOR NÃO SE NORMALIZA.** DP-017 é um código, não um DP-17 mal digitado. **Zero à esquerda faz
> parte da identidade.**

E a lição da classe, também dele:

> **Número que não fecha é medição incompleta, nunca regra nova.**

Duas consequências diretas:

- **o código CRU é a identidade.** Para casar qualquer coisa (o desenho com a tipologia, a regra com o item),
  compara-se o código como ele está no motor. Só sai o que é marca de formato do arquivo, e é nomeado: o
  asterisco do início do código no índice `principal` do WVetro (`*DP-01`);
- **o código normalizado é DADO, nunca CHAVE.** A coluna `orcamentista_tipologia_desenho.codigo_dp` existe e
  fica, mas não serve para casar desenho: ela junta DP-017 com DP-17.

A família é maior que o zero à esquerda: **nem a grafia nem a descrição juntam dois códigos.** Dois códigos
com a mesma descrição continuam sendo dois códigos, até o dono do produto decidir o contrário.

## Por que a distinção é difícil de ver

Porque a normalização parece correção, não decisão. "DP-017" e "DP-17" diferem por um zero, e o reflexo é ler
o zero como ruído de digitação. Nada no texto do código diz que são produtos diferentes: a prova está em
outro lugar (na descrição, nos contadores do motor), e quem normaliza não vai olhar, porque acha que está
consertando.

E a normalização tem cara de cuidado. Ela aparece como "padronizar antes de comparar", que é um bom hábito com
texto livre. Código de motor não é texto livre: é a chave que o fornecedor deu ao produto.

O defeito também não aparece sozinho. Uma tabela com o código normalizado passa em todas as CHECKs de forma
(`^DP-[1-9][0-9]*$`), e o casamento por ela devolve um desenho, não um erro. O erro só aparece quando alguém
olha o desenho e vê uma persiana onde devia haver um peitoril — ou não olha, confirma com "sim", e o alumínio
é cortado.

## As aparições

| # | Onde | O que se afirmava | O que a medição mostrou | Estado |
|---|---|---|---|---|
| 1 | Índice dos desenhos (#264) e cabeçalho da migração `20261111000001` | DP-017 e DP-17 são o mesmo código escrito de dois jeitos, uma "colisão de grafias" | **Produtos diferentes.** Medido em produção em 12/11/2026, no motor `022fc55e`: DP-017 é janela de correr de 3 folhas com **peitoril fixo**, com 105 perfis, 4 vidros e 421 insumos; DP-17 é a mesma janela **com persiana**, com 75 perfis, 1 vidro e 422 insumos. No índice do WVetro, as duas têm condições e desenhos próprios | **Corrigido no código** (#264, `c96ee463`): a tela e a importação dizem "códigos diferentes que a normalização juntaria"; o portão `desenhos-slug-sem-copia.test.ts` reprova `codigo_dp` e a normalização fora da leitura e da importação do índice. **O cabeçalho da migração continua errado, e fica**: a migração está aplicada e é imutável (`migracao.md`); a correção é esta página |
| 2 | O mesmo índice e o motor | (o par que a normalização escondia) | **A duplicata real é DP-017 com DP-18**: descrição idêntica e os três contadores iguais, 105 perfis, 4 vidros e 421 insumos | **Aberto, com o dono do produto**: qual dos dois é o código que vale. A escolha do desenho não depende disso: cada um tem desenho próprio pelos dois degraus |
| 3 | Índice do WVetro, linhas `principal` | (o segundo caso da mesma família) | **DP-100 e DP-101** têm a mesma descrição ("PORTA DE CORRER 06 FOLHAS MÓVEIS \| 04 VIDROS - 02 TELAS \| TRILHO PVC EMBUTIDO \| EUROPA 42") e o mesmo desenho. **A DP-101 não existe no motor**; só existe no índice | **Aberto**: a importação dos desenhos nomeia o par ("têm a mesma descrição"); nada o funde |

### Como o erro passou — a parte que faz esta regra valer

A aparição 1 não nasceu de distração. Nasceu de uma conta que não fechava e foi fechada com uma regra.

1. **A medição incompleta.** O dono do produto mediu a cobertura do índice procurando códigos DP com
   `startswith("DP-")`. No índice `principal`, os códigos vêm com um asterisco na frente (`*DP-01`, `*DP-017`),
   e o filtro não achou nenhum. É `instrumento-que-nao-enxerga.md`: o padrão era a memória do formato, não o
   formato.
2. **A conta fechada com uma regra.** Com a cobertura sem fechar, a explicação escolhida foi uma regra nova:
   normalizar o código (tirar o zero à esquerda) e casar o segundo degrau pela descrição. A normalização entrou
   no código (`codigoDpNormalizado`, escrita pelo assistente a pedido, sem questionar) e no cabeçalho da
   migração como "colisão de grafias".
3. **A medição até o fim.** O dono do produto então pediu um teste que prendesse os números dele (140 pelo
   primeiro degrau, 23 pelo segundo, 1 empate na DP-17). O assistente **recusou escrever o teste** e mediu de
   novo, pelo código cru, contra o índice e o motor. Os números verdadeiros eram **141 / 23 / 0**, e o empate da
   DP-17 só existia porque a normalização misturava os desenhos de dois produtos. Um teste que prende número
   errado transforma erro em regra.

O dono do produto conferiu na fonte, aceitou a correção e formulou a lição: **número que não fecha é medição
incompleta, nunca regra nova.**

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`, em 12/11/2026: procurei no código (`src/`, sem os testes) toda
normalização de código usada como chave, ou seja, zero à esquerda tirado ou posto (`replace(/^0+/`, `0*(\d)`,
`padStart`), e código convertido para número. **Uma aparição de normalização (a 1), e nenhuma outra foi
forçada.**

Examinado e **NÃO contado**, com a razão — precedente descartado com razão vale mais que precedente omitido:

| o quê | onde | por que não entra |
|---|---|---|
| o CST de PIS/COFINS completado com zero à esquerda (`"2"` → `"02"`) | `src/utils/custo-liquido-do-item.ts`, `norm` | o CST tem **dois dígitos por exigência da lei**: `"2"` e `"02"` são o **mesmo** código, e completar o zero dá a forma canônica dele. Aqui a normalização junta códigos **diferentes** |
| os `padStart(2, '0')` de data e hora | agenda, caixa, apuração | formatação de número para exibição, não identidade de código |

As aparições 2 e 3 não são normalização: são códigos distintos com a mesma descrição. Estão na tabela porque
pertencem à mesma família — **o que junta dois códigos não é a grafia nem a descrição, é a decisão do dono do
produto** — e porque foi a correção da 1 que as trouxe à vista.

## O corolário aplicável ANTES do defeito existir

- **Antes de casar dois conjuntos de códigos, compare o cru.** Se o casamento cru não fecha, o próximo passo é
  medir o que ficou de fora (que formato ele tem, por que o filtro não o viu), nunca inventar uma
  equivalência que faça a conta fechar.
- **Antes de tirar ou pôr um caractere de um código** (zero, asterisco, espaço, caixa), pergunte se isso é
  marca de formato do arquivo ou parte da identidade, e **meça**: os dois códigos que a transformação juntaria
  são o mesmo produto? Descrição e contadores do motor respondem.
- **Uma coluna normalizada pode existir como dado.** Ela não vira chave, e um portão reprova quem a usar para
  casar.
- **Antes de prender números num teste, refaça a medição.** O teste que prende o número de outra pessoa sem
  medir herda o erro dela com a autoridade de um portão.

## As ressalvas de método — o que a medição NÃO diz

- **Os contadores são da Detalhe do motor `022fc55e`** (`n_perfis`, `n_vidros`, `n_insumos`), lidos em produção
  em 12/11/2026. Contadores iguais (DP-017 e DP-18) são forte indício de duplicata, **não prova**: dois produtos
  diferentes podem ter os mesmos totais. Quem decide é o dono do produto.
- **O índice medido é o de 11/11/2026** (sha256 `8c68a6d5c195c4247606312f09b8a0fd38b3ecdca5c02f2c32c0ed138b6ac9e7`).
  Outro índice pode trazer outros pares; a importação os nomeia a partir do dado, não de uma lista fixa.
- **Os números 141 / 23 / 0** são do índice e do motor dessa data, pelo código cru. Eles vão presos em teste
  quando a escolha do desenho for implementada (depois da conferência dos caminhos com as tabelas cheias).
- **A busca por precedentes olhou o código, não os dados.** Outras tabelas do motor podem ter pares de códigos
  que a normalização juntaria; isso não foi medido.

## Relação com as outras regras

`instrumento-que-nao-enxerga.md` é o mecanismo da medição que falhou: o `startswith("DP-")` que não via o
asterisco. `hipotese-derrubada-pela-propria-medicao.md` é a vizinha mais próxima no método, e esta página
acrescenta o caso em que a hipótese virou **regra** antes de ser medida, e quem a derrubou foi outra pessoa,
recusando prender o número. `teste-que-nao-exercita.md` cobre o teste que passa sem provar; aqui o risco era o
teste que **prova o errado**. `a-coluna-que-parece-enumeracao.md` é a irmã no banco: lá a coluna `cor` parece
enumeração e é discriminador; aqui a coluna `codigo_dp` parece chave e é dado. `copia-divergente.md` é a razão
do portão que reprova `codigo_dp` fora do lugar. `migracao.md` é a razão de o cabeçalho errado da
`20261111000001` ficar como está, com a correção aqui. `registro-de-classe.md` decidiu a forma desta página e a
nota da busca.
