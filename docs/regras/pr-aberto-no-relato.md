# O PR Aberto no Relato

> Registrada em 08/11/2026, a partir do #239, que ficou aberto e fora dos relatos. Regra de método do dono do produto; vale para
> todo relato de estado, em toda rodada.

## O critério

Formulação do dono do produto, registrada como está:

> Todo PR aberto entra na lista de estado de TODO relato, até ser mergeado ou fechado por decisão. PR pronto e esquecido é
> trabalho feito que não vale nada.

**Um PR sai da lista de estado por um de dois motivos: o merge ou o fechamento decidido pelo dono do produto.** Não sai porque o
assunto da conversa mudou, porque o relato anterior já o citou, nem porque está verde e "só falta o merge".

## Por que a distinção é difícil de ver

Porque o PR esquecido **não tem sintoma**. O CI dele está verde, o GitHub o mostra como `clean`, e nada falha. O relato que o
omite não diz nada falso: ele lista o que foi feito na rodada, e o PR é de uma rodada anterior. Cada relato, sozinho, está certo;
é a soma deles que tira o PR do campo de visão de quem decide o merge.

E o CI verde envelhece sem avisar. Ele vale para a main do momento em que rodou; cada merge posterior o afasta do código que vai
de fato entrar. Não conflitar no texto não significa não conflitar no comportamento.

## A aparição

| # | Quando | O PR | O que aconteceu |
|---|---|---|---|
| 1 | 08/11/2026 | #239, o aviso de cor na importação do motor (Nível 2) | aberto às 03:13 e relatado naquela hora. Ninguém mandou mergear, e as listas de estado seguintes não o incluíram mais. Ficou 25 commits atrás da main, com o CI de 03:23, enquanto o mesmo defeito que ele avisa (a cor com espaço duplo) era corrigido à mão ao longo do dia |

### Nota da busca por precedentes

Feita conforme `registro-de-classe.md`. Procurei, no histórico desta campanha, um PR verde que tivesse ficado sem decisão por
sair dos relatos; não achei outro. O #243 e o #246 ficaram abertos por decisão explícita (rascunho até o motor, e fechado sem
merge), e não entram: estavam na lista, com o motivo. Uma aparição; a regra vale por ser do dono do produto, não pela contagem.

## O remédio

1. **Todo relato termina com a lista de estado dos PRs abertos**, consultada no GitHub naquele momento
   (`gh api repos/{owner}/{repo}/pulls?state=open`), e não lembrada (`estado-relatado-vs-real.md`).
2. **Cada linha diz o que falta para sair da lista**: o merge liberado, o CI, a decisão do dono do produto, ou o motivo de estar
   parado (um rascunho que espera o motor, por exemplo).
3. **CI verde tem data e base.** Um PR atrás da main não é dado como pronto pelo CI antigo; é atualizado com a main e espera o CI
   fechar de novo antes do merge.

## Relação com as outras regras

`trabalho-que-vive-no-container.md` é a vizinha: lá, o trabalho que não foi empurrado não está entregue; aqui, o trabalho
empurrado e com PR também não está, enquanto ninguém o decide. `estado-relatado-vs-real.md` dá o método da lista: consultar a
fonte, não a memória.
