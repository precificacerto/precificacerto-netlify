# Harness — o tempo em tabela própria (migração 20261024000003)

**NÃO TOCA PRODUÇÃO.** Postgres local. Prova que a migração que tira o tempo de fabricação de
`orcamentista_motor_tipologia` e o põe em `orcamentista_motor_tipologia_tempo` copia o que deve,
não apaga nada, e deixa o tempo fora do alcance da importação — que é a razão de ela existir
(`.claude/rules/tabela-que-a-importacao-apaga.md`, aparição 1).

## Como rodar

O Postgres local é o mesmo dos outros harness desta pasta (subir uma vez por container: ver o
README de `../tres-niveis/`). `PGHOST` e `PGPORT` trocam o endereço (padrão: `/tmp/harness-pg`,
`54329`).

```bash
bash scripts/harness/tempo-em-tabela-propria/run.sh              # a migração do repositório
bash scripts/harness/tempo-em-tabela-propria/run.sh <copia>      # uma cópia alterada
python3 -B scripts/harness/tempo-em-tabela-propria/mutacoes.py   # as 13, e o controle
```

`run.sh` monta o banco até a 20261024000001, reproduz o estado de produção
(`05_como_em_producao.sql`), aplica a migração **duas vezes** e confere que o schema ficou
idêntico, roda o caso da reaplicação com divergência, os 7 casos de `10_casos.sql` e o caso 8
(`20_reimportacao_completa.sql`) duas vezes — com a função de importação da 20261020000002 e,
depois de aplicar a 20261025000004, com a que a substitui.

## O estado de partida, e por que é esse

| tabela | tipologia | tempo | por quê |
|---|---|---|---|
| c1 | DP-01 | 90 ESTIMADO | |
| c1 | DP-02 | 150 IMPORTADO | a outra origem, com tempo diferente: trocar origem ou tempo aparece |
| c1 | DP-03 | sem tempo | não pode ganhar linha na tabela nova |
| c2 | DP-01 | 240 ESTIMADO | a MESMA tipologia em outra tabela: uma chave sem `tabela_id` as misturaria |

## Os casos

Medido em 24/10/2026: **8 de 8**, mais a aplicação dupla com schema idêntico.

| caso | o que prova |
|---|---|
| reaplicação | com a tabela nova já divergente (DP-02 = 777), reaplicar ABORTA na verificação 2 e o 777 fica |
| 1 | a tabela nova tem exatamente as 3 tipologias com tempo |
| 2 | tempo e origem copiados como estão, c1 e c2 separados |
| 3 | a tabela antiga intacta (3 tempos, soma 480), e as colunas marcadas OBSOLETAS |
| 4 | **O EFEITO:** a importação real (`importar_conteudo_da_tabela`) apaga os tempos da tabela antiga — o caso confere que apagou — e a tabela nova os guarda |
| 5 | apagar a tabela do fornecedor leva os tempos dela, e só os dela |
| 6 | tempo zero e origem desconhecida recusados |
| 7 | anon e authenticated sem acesso, RLS ligada, 4 políticas |
| 8 | **A TRAVA PODE SAIR:** o estado de produção — 164 tempos ESTIMADO, soma 87.300, tempos diferentes entre si — e a reimportação COMPLETA (164 tipologias, item, regra, fórmula), duas vezes seguidas: a função grava as 164, apaga as colunas antigas (o caso confere — o perigo é real), e os 164 tempos ficam na tabela nova, iguais linha a linha. Roda com as duas versões da função |

**O caso 8 foi medido em 25/10/2026, no PGlite** (Postgres embutido em Node; a máquina não tinha
`psql`), com a mesma sequência de arquivos do `run.sh`: **10 de 10** — a reaplicação, os casos 1 a 7
e o caso 8 nas duas versões da função. **Controle negativo:** com a função da 20261025000004 mutada
para apagar também `orcamentista_motor_tipologia_tempo`, o caso 8 dessa versão fica vermelho
(`0 tempos, 164 linha(s) diferentes do antes`) e o da 20261020000002 segue verde — 9 de 10. Esta
mutação não está em `mutacoes.py`, que muta só a 20261024000003.

**O caso da reaplicação roda ANTES dos outros, e foi movido.** Na primeira versão ele rodava
depois do caso 4. Àquela altura a importação já tinha apagado os tempos da tabela antiga, e a
verificação 2 não tinha o que comparar: o caso ficou vermelho pelo motivo errado. Ele roda agora com
a tabela antiga ainda cheia.

## As 13 mutações

Medido em 24/10/2026: **13 de 13 derrubaram o que deviam; o controle verde.**

| # | mutação | derruba |
|---|---|---|
| V1 | sem o REVOKE de anon e authenticated | verificação 4 |
| V8 | o REVOKE esquece o anon | verificação 4 |
| V2 | sem a RLS ligada | verificação 4 |
| V3 | a política de SELECT sem `is_super_admin()` | verificação 4 (3 políticas) |
| V4 | a cópia leva só os ESTIMADO | verificação 1 |
| V5 | a cópia grava tudo como ESTIMADO | verificação 2 |
| V6 | a chave sem `tabela_id` | verificação 1 |
| V7 | a migração "move" o tempo: apaga as colunas antigas no mesmo passo | verificação 3 |
| B1 | `ON CONFLICT DO UPDATE`: reaplicar sobrescreve a tabela nova | o caso da reaplicação |
| B2 | FK para `orcamentista_motor_tipologia` com CASCADE | caso 4: a importação leva o tempo junto |
| B3 | a FK para a tabela do fornecedor sem CASCADE | caso 5 (violação de FK) |
| B4 | sem o CHECK de tempo positivo | caso 6 |
| B5 | sem marcar as colunas antigas como OBSOLETAS | caso 3 |
| **M0** | **controle: nada muda** | **verde — 8 de 8** |

**A V1 e a V8 só derrubam porque `05_como_em_producao.sql` dá privilégio padrão a `anon`.** O schema
mínimo de `../orcamentista/` dá só a authenticated e service_role; em produção o Supabase dá tudo a
anon também. Na primeira versão deste harness a linha não existia: os 7 privilégios da V1 eram todos
de authenticated, o REVOKE de anon passava verde sem ter o que revogar, e o caso 7 ("anon sem
acesso") passava porque anon nunca teve acesso (`portao-que-nao-alcanca.md`). A V8 — o REVOKE que
esquece o anon — é a mutação que prova a correção.
