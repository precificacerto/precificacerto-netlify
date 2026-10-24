# Harness — a trava do tempo na importação (as mutações)

**NÃO TOCA PRODUÇÃO nem banco nenhum.** Só jest. Prova que cada parte da trava em
`src/pages/api/super-admin/atendimentos-ia/tabelas/[id]/importar.ts` (e a frase em
`src/utils/atendimentos-ia-importacao.ts`) tem um caso em
`src/utils/__tests__/atendimentos-ia-importar-rota.test.ts` que **fica vermelho** quando ela é retirada.

## Por que a trava existe

Decisão do dono do produto, 24/10/2026. A função `importar_conteudo_da_tabela` (`20261020000002`)
apaga e regrava `orcamentista_motor_tipologia` **sem** as colunas `tempo_fabricacao_min` e
`tempo_origem`. Importar a tabela da Wolff apagaria os 164 tempos ESTIMADO mesmo com o arquivo
idêntico. Até o tempo ter tabela própria — que a importação não apaga —, o POST é recusado em tabela
com tempo gravado: 409, antes de baixar e de gravar.

## Como rodar

```bash
python3 -B scripts/harness/trava-do-tempo/mutacoes.py         # as 10 (~10 s cada)
python3 -B scripts/harness/trava-do-tempo/mutacoes.py M4 M5   # só estas
```

Mesmo funcionamento e mesmos vereditos de `scripts/harness/agrupador-de-barras/README.md`. O 5º
elemento de uma mutação é um trecho que TEM de aparecer na saída da falha. **Medido em 24/10/2026:
com `--silent`, a saída do jest só lista os casos que FALHARAM** — a M8 derruba só o caso da frase, e
o nome de um caso que segue verde ("só IMPORTADO") não aparece na saída. Um nome de caso exigido
discrimina, portanto.

## As 9 mutações

Medido em 24/10/2026: **9 de 9 vermelhas, cada uma com o trecho exigido; o controle verde.**

| # | mutação | casos | exige |
|---|---|---:|---|
| M1 | a trava não existe | 3 | — |
| M2 | trava só pelo ESTIMADO | 2 | "só IMPORTADO" |
| M3 | trava pela soma das duas origens conhecidas, não pelo total | 1 | "trava pelo TOTAL" |
| M4 | erro do banco ao contar deixa a importação seguir (falha ABERTA) | 1 | "falha fechada" |
| M5 | a trava vem DEPOIS de baixar os arquivos | 3 | "ANTES de baixar" |
| M6 | a trava vale também para o GET | 1 | "o GET continua respondendo" |
| M7 | a trava responde 200, não 409 | 3 | — |
| M8 | a frase não diz a origem dos tempos | 1 | "de que origem" |
| M9 | a frase esquece a origem que não é ESTIMADO nem IMPORTADO | 1 | "de que origem" |
| **M0** | **controle: nada muda** | **0** | **verde** |

## O que este portão NÃO alcança

O repositório é **falso** no portão. A consulta real, `contarTemposGravados` em
`src/lib/atendimentos-ia/repositorio.ts`, não roda aqui, e por isso não é mutada: a mutação daria
"NAO DERRUBOU" por construção (`portao-que-nao-alcanca.md`). O que ela conta foi conferido à mão,
por SQL, contra o banco de produção — ver o corpo do PR.
