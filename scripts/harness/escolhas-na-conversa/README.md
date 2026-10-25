# Harness das escolhas na conversa

Só jest. Não toca banco nem produção. A migração da coluna (`20261025000001`) tem harness próprio, de
Postgres local, em `scripts/harness/escolhas-na-pre-definicao/`.

```bash
python3 -B scripts/harness/escolhas-na-conversa/mutacoes.py          # todas
python3 -B scripts/harness/escolhas-na-conversa/mutacoes.py E3 E9   # só estas
```

Cada mutação estraga UMA regra de `escolhas-da-tipologia.ts`, `conversa-da-ia.ts` ou
`levantamento-da-conversa.ts` e roda os três portões (`escolhas-da-tipologia.test.ts`,
`levantamento-da-conversa.test.ts` e `atendimentos-ia-conversa-da-ia.test.ts`). `VERMELHO` exige que o
caso nomeado apareça entre os que caíram; `E0` é o controle.

| | regra | caso que a guarda |
|---|---|---|
| E1 | Condição falsa não pergunta | MAE NÃO é perguntada |
| E2 | Condição que não dá para avaliar pergunta | PERGUNTA |
| E3 | só as que faltam | só as que FALTAM |
| E4 | só ARI, ARE e MAE são capturadas | fica no Padrão |
| E5 | só opção da aba é aceita | opção que não existe |
| E6 | escolha feita não é sobrescrita | não sobrescreve |
| E7 | do jsonb, só as capturadas viram escolha | não vira escolha |
| E8 | a pergunta traz as opções por extenso | a pergunta da ARI, inteira |
| E9 | a pré-definição só fecha sem escolha pendente | NÃO fecha |
| E10 | as pendentes vão ao prompt | vão ao prompt |
| E11 | o prompt proíbe escolher sozinho | vão ao prompt |
| E12 | a escolha válida é gravada | GRAVADA em escolhas |
| E13 | a coluna `escolhas` é lida | CHEGAM AO AVALIADOR |
| E14 | as escolhas seguem para o levantamento | CHEGAM AO AVALIADOR |
| E15 | o levantamento usa as escolhas gravadas | a DP-02 FECHA |
| E16 | a linha das escolhas aparece no texto | com as escolhas |
