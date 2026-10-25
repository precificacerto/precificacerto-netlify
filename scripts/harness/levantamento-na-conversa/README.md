# Harness do levantamento na conversa

Só jest. Não toca banco nem produção.

```bash
python3 -B scripts/harness/levantamento-na-conversa/mutacoes.py          # todas
python3 -B scripts/harness/levantamento-na-conversa/mutacoes.py L3 L8   # só estas
```

Cada mutação estraga UMA regra de `levantamento-da-conversa.ts`, `conversa-da-ia.ts` ou
`pre-definicao.ts` e roda os dois portões (`levantamento-da-conversa.test.ts` e
`atendimentos-ia-conversa-da-ia.test.ts`). `VERMELHO` exige que o caso nomeado apareça entre os que
caíram; `L0` é o controle.

| | regra | caso que a guarda |
|---|---|---|
| L1 | a tipologia só valida se for código da lista | NÃO é tipologia |
| L2 | a comparação do código é exata | EXATA |
| L3 | sem lista e sem tipologia, a LLM não é chamada | NÃO chama a LLM |
| L4 | a lista vai ao prompt | a lista vai ao prompt |
| L5 | o levantamento sai depois do fechamento | seguido do LEVANTAMENTO |
| L6 | duas tabelas ligadas: recusa, não a primeira | MAIS DE UMA TABELA |
| L7 | as abas da Wolff só valem para a tabela Wolff | OUTRA TABELA |
| L8 | as regras são lidas página a página | página a página |
| L9 | tempo ausente é null, nunca zero | nunca zero |
| L10 | espessura só com um número no texto | 4+4 |
| L11 | duas serras: recusa, não a primeira | DUAS SERRAS |
| L12 | a recusa conta as faltas além da oitava | nenhuma calada |
| L13 | a recusa sai sem o prefixo técnico da esquadria | sem o prefixo de esquadria |
| L14 | o total ausente diz o código que falta | PREÇO AUSENTE |
| L15 | a lista que não existe não vira lista vazia | LISTA AINDA NÃO EXISTE |
