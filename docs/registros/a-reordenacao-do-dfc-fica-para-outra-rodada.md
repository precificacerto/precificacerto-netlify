# A Reordenação do DFC Fica Para Outra Rodada

> **Pendência registrada em 17/09/2026, por decisão do dono do produto.** Não é defeito, não
> é classe, e **não deve ser puxada no meio de outra correção** — é o mesmo tratamento que
> `fato-vs-referencia.md` dá ao inventário de congelamento e que `migration-delivery.md` dá à
> reconciliação das migrações: escopo e rodada próprios.

## A decisão

Formulação do dono do produto, registrada como está:

> **A REORDENAÇÃO DO DFC NÃO ENTRA.**

Ela foi considerada na rodada do Repasse e ficou de fora. O que entrou foi a linha nova, no
lugar que a ordem ATUAL já lhe dá: imediatamente depois de "(−) Devoluções e Deduções da
Receita", nas três variantes de demonstração. Nada mais da ordem foi tocado.

## A CORREÇÃO DE REGISTRO, e ela é minha

**A proposta de reordenar o DFC era MINHA, e veio de leitura errada do que o dono do produto
disse.**

Ele falou em **replicar a ordem da análise financeira na decomposição** — levar para a
decomposição do orçamento a sequência que a demonstração financeira já tem. Eu **inverti**:
li como se a demonstração é que devesse ser reordenada para acompanhar a decomposição, e
propus mexer no DFC.

Está escrito assim, com a autoria plana, porque suavizar apagaria o que importa para quem
encontrar esta página: **a reordenação não é um pedido pendente do dono do produto.** É uma
proposta minha, nascida de um erro de leitura, que sobreviveu à correção do erro porque a
ideia em si pode ter mérito próprio. Quem a retomar precisa saber que ela começa sem
patrocínio, e não que ela é um item combinado à espera de execução.

É a distinção que `decisao-sob-regra-da-epoca.md` trata em outro material: o termo que se usa
para descrever trabalho passado aponta a investigação. "Pendência do dono do produto" mandaria
alguém executar; "proposta do assistente, de leitura invertida" manda alguém **decidir
primeiro**.

## O que ficaria para essa rodada, se ela acontecer

Sem defender a proposta, e sem enumerar mais do que foi realmente examinado:

1. **A ordem das deduções da demonstração financeira contra a R19.** A R19 de
   `cascata-lucro-real.md` fixa a ordem da decomposição: repasse primeiro, depois operação por
   fora, depois por dentro, depois custos e despesas, e o RRO como última sobra. As três
   variantes de `dfc/index.tsx` não seguem essa ordem, e **não é evidente que devessem** — uma
   é DRE contábil de caixa realizado, a outra é decomposição de um documento.
2. **O que já foi corrigido e não se repete.** A posição da linha de devoluções foi movida em
   09/09/2026, e a razão está escrita no próprio `dfc/index.tsx`. Quem reordenar precisa ler
   aquele comentário antes, para não desfazer uma decisão tomada achando que corrige um
   descuido.
3. **`LUCRO` fora da demonstração.** `DFC_GROUPS_QUE_SOMAM` exclui o grupo de propósito, e o
   comentário registra que isso descarta 15 lançamentos e R$ 125.318,22. É levantamento
   próprio, já registrado lá, e **não é esta pendência** — fica citado só para que as duas não
   sejam confundidas.

## O que NÃO está afirmado aqui

- **Não está afirmado que a ordem atual está errada.** Ninguém mediu a demonstração contra a
  R19 linha a linha. Afirmar divergência sem a medição seria inferir em vez de ler, que é o
  que `regime-e-segmento-determinam-a-construcao.md` cataloga.
- **Não está afirmado que a reordenação é desejável.** Ela é uma proposta minha, de origem
  corrigida acima.

## Relação com as regras

`registro-de-classe.md` decidiu que isto mora em `docs/registros/` e não em `.claude/rules/`:
não há classe de defeito, há uma pendência e uma correção de autoria.
`decisao-sob-regra-da-epoca.md` é a razão de a correção de registro estar escrita com a
autoria plana. `cascata-lucro-real.md` R19 é a ordem contra a qual a comparação seria feita,
se alguém a fizer.
