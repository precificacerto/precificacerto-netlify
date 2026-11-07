# A folha do levantamento — exemplo renderizado

- `exemplo-levantamento.pdf`: o arquivo como o agente o envia, gerado por `gerarFolhaDoLevantamento`
  (`src/lib/atendimentos-ia/folha-do-levantamento.ts`) a partir de `src/utils/__tests__/fixtures/folha-de-exemplo.ts`.
- `exemplo-levantamento-folha-1.png` e `-2.png`: as duas folhas do mesmo PDF, para conferir sem abrir o arquivo.

A densidade é a do mockup aprovado (dono do produto, 07/11/2026; 794 px = 210 mm): a faixa do item com 12,2 mm, cada linha auxiliar com 4,2 mm
por linha de texto, e a coluna Fig. com 15,3 mm, da altura do item inteiro. Item sem VARIÁVEIS: 24,9 mm; com: 29,1 mm.

**Os dados são fictícios.** Nenhum cliente real sai do tenant. As tipologias, as descrições e as linhas são as do motor da Wolff
(`fdff3386…`), medidas em 06/11/2026.

O exemplo mostra o desenho de cada caso:

| item | tipologia | desenho |
|---|---|---|
| 1 | DP-02 | 2 folhas (da descrição; o motor tem `n_vidros = 1`) |
| 2 | DP-04 | 2 folhas e a bandeira de 400 mm (AF respondida) |
| 3 | DP-39 | porta de 2 folhas, estreita e alta |
| 4 | DP-129 | N = 3 módulos e a bandeira de 300 mm |
| 5 | DP-05 | 2 folhas e o peitoril de 500 mm (aqui a AF é o peitoril) |
| 6 | DP-141 | N = 2 e V = 2 |
| 7 | DP-165 | 1 folha: só o contorno |

**O PDF é conferido byte a byte pelo portão** (`src/utils/__tests__/folha-do-levantamento.test.ts`). Depois de uma mudança de propósito no
gerador, o portão fica vermelho até o exemplo ser regravado:

```
ATUALIZAR_EXEMPLO_DA_FOLHA=1 npx jest src/utils/__tests__/folha-do-levantamento.test.ts
pdftoppm -r 100 -png docs/levantamento/exemplo-levantamento.pdf docs/levantamento/exemplo-levantamento-folha
```
