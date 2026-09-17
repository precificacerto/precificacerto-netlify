# Leitores e Escritores São Listas Diferentes

> **Ocorrência ÚNICA, registrada como caso único.** A busca por precedentes foi feita
> conforme `.claude/rules/registro-de-classe.md` e está registrada abaixo. Nenhuma segunda
> aparição foi forçada.
>
> **Nome proposto, se um dia virar regra:** `leitores-e-escritores.md`.

## O critério

Formulação do dono do produto, 17/09/2026, registrada como está:

> Ao remover um controle, medir quem **LÊ** o valor não basta — é preciso medir quem o
> **ESCREVE**, e o controle removido era o único escritor em tempo de edição. **Leitores e
> escritores são listas diferentes.**

## O que aconteceu

Em 17/09/2026 o seletor "Item base (mercadoria para revenda)" foi removido da tela de
produto. A medição que autorizou a remoção enumerou **cinco leitores** de
`products.base_item_id` — montagem de custo, gravação, recálculo, sincronização de estoque,
criação de estoque — e mediu a população: 62 produtos com a coluna preenchida, 15 sem, os
dois caminhos já convivendo.

A medição estava certa no que mediu. **Ela não enumerou quem ESCREVE a coluna**, e o seletor
era um dos escritores — o único em **tempo de edição**, dentro da própria tela:

| ponto que escreve `baseItemId` | `origin/main` | depois da remoção |
|---|---|---|
| o seletor (dois lugares na tela) | **2** | **0** |
| prefill ao criar produto a partir de um item | 1 | 1 |
| reset ao trocar para PRODUZIDO | 1 | 1 |
| **escritores de UI** | **2** | **ZERO** |

E `content.component.tsx` tem um `useEffect` com `[productType, baseItemId, items]` que é
**o que dá CUSTO ao produto de revenda**: ele resolve o custo do item base e o injeta na
composição. Sem escritor, o efeito nunca dispara num produto novo.

### O que o usuário viu, e por que a leitura dele estava certa

Produto de REVENDA novo, criado direto na tela: composição vazia → `itemsPriceSum = 0` →
`doProductCalc` devolve preço zero → **a tabela inteira sai `R$ 0,00`**, com IRPJ e CSLL em
`0,000%`.

Foi relatado como *"a coluna Valor (R$) está vazia"*. Ela não estava vazia — estava toda em
`R$ 0,00`, o que é pior: **o número estava lá e não significava nada.**

Os outros dois fluxos não foram afetados, e é por isso que o defeito não apareceu antes:

| fluxo | escritor | estado |
|---|---|---|
| REVENDA em EDIÇÃO | o banco, ao carregar | sem defeito |
| criado a partir de um item | o prefill | sem defeito |
| **REVENDA NOVO, direto na tela** | **nenhum** | **o defeito** |

## Por que a distinção é difícil de ver

Porque **a lista de leitores é a que a pergunta natural produz.** Ao remover algo, pergunta-se
"quem depende disto?" — e `grep` por um nome de coluna devolve, em maioria esmagadora,
leituras. As escritas são poucas, muitas vezes uma só, e ficam num `onChange` ou num
`setState` que não menciona a coluna do banco: aqui a coluna é `base_item_id` e o escritor
escrevia `setBaseItemId`. **Os dois nomes não casam no mesmo `grep`.**

E a medição PARECE completa: cinco leitores encontrados, população contada, os dois caminhos
convivendo. Ela responde bem à pergunta "o que quebra se o valor sumir?" — e a pergunta certa
era outra: **"o que passa a nunca ter valor?"**

O defeito também não tem sintoma onde é cometido. A remoção compila, os testes passam, a
gravação deriva corretamente. Ele aparece um fluxo adiante, como uma tela de zeros.

## O corolário aplicável ANTES do defeito existir

**Antes de remover um controle, enumere as DUAS listas: quem lê o valor, e quem o escreve.**

Sinais, em ordem de força:

1. O controle removido **escrevia** alguma coisa — um `setState`, um campo de formulário,
   uma coluna.
2. O nome do estado na tela **difere** do nome do dado no banco (`baseItemId` × `base_item_id`),
   então um `grep` só acha metade.
3. Existe um `useEffect` (ou equivalente) com aquele estado **no array de dependências** —
   ele é um leitor que só roda quando alguém escreve.
4. O valor tem mais de uma origem, e as origens **não são equivalentes**: uma serve ao
   produto em edição, outra ao produto novo.

Quando dois ou mais coincidem, liste os escritores antes de remover. O comando é diferente
do que acha leitores:

```bash
# LEITORES — o nome do dado
grep -rn "base_item_id" src/

# ESCRITORES — o nome do ESTADO, e as atribuições a ele
grep -rn "setBaseItemId\|baseItemId:" src/
```

Foi a segunda linha que não foi rodada.

### E o corolário que decide desenho, não post-mortem

**Quando a remoção de um escritor é a mudança, a correção não é devolver o controle — é
fechar o ciclo pela outra ponta.** Aqui a composição passou a escrever `baseItemId`, pela
**mesma função** que a gravação usa (`derivarBaseItemId`), e a gravação passou a confirmar
em vez de descobrir. O seletor não voltou.

## Ressalvas de método

1. **É UMA ocorrência.** Não há tabela de aparições porque não há aparições a tabelar.
2. **O erro foi do assistente**, e a pergunta que faltou não foi feita por ninguém — nem por
   quem mediu, nem por quem autorizou. Está escrito assim porque suavizar apagaria o
   mecanismo: a medição parecia completa, e é isso que a torna perigosa.
3. **A medição dos cinco leitores continua válida.** Ela não foi refutada; foi mostrada
   parcial. São coisas diferentes, e confundi-las levaria alguém a desconfiar de um dado que
   está certo.

## A busca por precedentes — o que ela achou e por que nada foi usado

Feita sobre `.claude/rules/`, procurando classes que tratem de quem PRODUZ um valor.

| classe | por que NÃO cabe |
|---|---|
| `portao-que-nao-alcanca.md` | é a vizinha mais próxima, e a aparição 6 dela já alargou a página para "o NÚMERO que alguém confere antes de commitar". O mecanismo lá é **um indicador que fica verde** quando o defeito existe. Aqui **não havia indicador**: havia um levantamento cujo ESCOPO era metade da relação. Dobrar um no outro apagaria a distinção entre "o instrumento não alcança" e "a pergunta foi feita numa direção só" |
| `construtor-empobrecido.md` | fala em **enumerar produtores** — e o remédio dela, tornar o campo obrigatório para o compilador enumerá-los, é o parente mais próximo do corolário desta página. Mas o defeito lá é um campo que chega vazio de um produtor existente; aqui o produtor **deixou de existir** |
| `copia-divergente.md` | dois mapeamentos, um esquecendo um campo. Aqui não há duas cópias |
| `hipotese-derrubada-pela-propria-medicao.md` | **explicitamente descartada pelo dono do produto.** Não houve hipótese derrubada: houve pergunta não feita |
| `razao-longe-da-restricao.md` | **também descartada por ele.** A razão do seletor estava medida e escrita; o que faltou foi outra coisa |

**Nenhuma cabe sem forçar**, e por isso isto mora em `docs/registros/` como caso único, com
o nome proposto no topo. Se uma segunda aparição surgir, ela vira `.claude/rules/`.

---

## Anexo — O IRPJ EM R$ MUDOU DE PROPÓSITO, não é regressão

Registrado aqui porque é a mesma rodada e o mesmo arquivo, e porque sem isto alguém
"conserta" de volta comparando com `origin/main`.

Formulação do dono do produto, registrada como está:

> Main mostrava R$ 59,05 ao lado de 0,000%. **Um R$ que a porcentagem ao lado nega é pior que
> zero — afirma valor onde não há conta.** R$ 0,00 coerente com 0,000% é o certo. Registre
> que foi mudança deliberada, não regressão.

Em `origin/main` a linha do IRPJ tinha **duas contas paralelas**:

```
%  →  (profitVal × 0,15) ÷ pricePerUnit × 100     ← zera quando não há preço
R$ →  profitValDisplay × 0,15                     ← NÃO zera
```

Com o motor ainda sem responder, a tela exibia `0,000%` e `R$ 59,05` na mesma linha. Hoje os
dois saem da MESMA linha de `buildProductPriceRows`: ou os dois são zero, ou os dois têm
número. O caso que o protege é o bloco 5 de
`src/utils/__tests__/o-produto-de-revenda-novo-ganha-custo.test.tsx`, e a mutação que
restaura a conta paralela do `main` morre nele.

### Uma correção de texto que este trabalho produziu

O aviso de custo zero, na primeira versão, dizia *"as alíquotas continuam válidas"*. **É
falso para IRPJ e CSLL**, e foi o próprio caso de teste que derrubou a frase: elas não vêm do
cadastro, vêm do preço (`pricePerUnit > 0 ? … : 0`), e zeram junto. O texto passou a dizer
quais alíquotas continuam e por que aquelas duas não.

Algebricamente a expressão **é** `15% × %Lucro` — a dependência do preço é do CAMINHO, não da
fórmula. Derivá-la direto de `productProfitPercent` a tornaria independente do motor. **Não
foi feito nesta rodada**, porque não estava no escopo decidido; fica registrado para quem
decidir.
