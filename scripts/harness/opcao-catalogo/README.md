# Harness — a opção no catálogo (migração `20261024000002`)

**NÃO TOCA PRODUÇÃO.** Roda num Postgres local descartável. Prova o que a
`20261024000002_opcao_no_catalogo_e_criterio_da_barra.sql` faz, e prova que cada proteção dela
**fica vermelha** quando é retirada: as 26 mutações abaixo, mais um controle que tem de sair verde.

## Como rodar

O Postgres local é o mesmo dos outros harness desta pasta (subir uma vez por container: ver o
README de `../tres-niveis/`). `PGHOST` e `PGPORT` trocam o endereço (padrão: `/tmp/harness-pg`,
`54329`).

```bash
bash scripts/harness/opcao-catalogo/run.sh                 # a migração do repositório
bash scripts/harness/opcao-catalogo/run.sh <copia>         # uma cópia alterada
python3 -B scripts/harness/opcao-catalogo/mutacoes.py      # as 26, e o controle
python3 -B scripts/harness/opcao-catalogo/mutacoes.py V9   # só esta
```

Saída do `run.sh`: uma linha `ok:` ou `FALHOU:` por caso, e `23 de 23 casos ok`. Sai com 1 se
faltar algum. Um erro que não começa com `FALHOU` aparece como `ERRO NAO PREVISTO` e não conta
como verde.

## O que o `run.sh` faz

1. Cria o banco `harness_opcao_catalogo` e aplica `../base-de-conhecimento/00_base.sql`,
   `20261022000003`, `20261022000004`, `20261023000001`, `../tres-niveis/01_pre.sql`,
   `20261023000002` e `20261023000003`, do repositório.
2. Roda `05_como_em_producao.sql`, que reproduz o estado de produção:
   - **guarda o texto certo** dos rótulos e dos 11 COMMENTs, como a `20261023000002` acabou de
     gravar, em `harness_esperado`. Esse é o oráculo dos casos 1 e 2, e não uma segunda cópia dos
     textos escrita no harness;
   - **reproduz o mojibake**: cada rótulo e COMMENT relido como Latin-1 e regravado como UTF-8. O
     caso 3 confere o hex de REFORCO contra o **medido em produção** em 24/10/2026
     (`5265666f72c383c2a76f2064652061c383c2a76f`). Sem isso o conserto seria exercitado sobre um
     estado inventado;
   - cria uma empresa com o PERFIL **já configurado** antes da migração, para o caso 6 provar que
     ela não escolhe critério nenhum por omissão.
3. Aplica **duas vezes** a migração dada e confere que a segunda deixou o schema idêntico.
4. Roda os 23 casos de `10_casos.sql`.

## Os casos que pedem nota

- **Caso 12: o número 1 onde a opção é a string "1".** Com as opções reais
  (`BARRA_INTEIRA`, `CONSUMO_REAL`), um número ou um booleano já cai na checagem de pertencer à
  lista, e a checagem de que o valor é **string** ficaria sem caso que a exercite (B2 passaria
  verde nos casos 9 e 10). O caso 12 usa um campo de harness com opções `{1,2}`: ali só o tipo
  separa o número 1 da string "1". É `teste-que-nao-exercita.md`, variante 2.
- **Os casos 19 a 23 e a função `orcamentista_opcoes_validas`.** Cada regra da lista é barrada por
  **uma** checagem só. A primeira versão contava os distintos com `count(DISTINCT v)`, que ignora
  NULL: uma lista com NULL caía na checagem de repetidos, e tirar a checagem de NULL (B9) não
  deixaria nada vermelho. Hoje a contagem usa `SELECT DISTINCT`, que conta NULL como valor.

## As 26 mutações — o que cada uma derruba

Medido em 24/10/2026: **26 de 26 vermelhas, e o controle M0 verde (23 de 23 casos ok).**
Remedido em 25/10/2026, com a verificação 3a pelo par: **27 de 27 vermelhas (a V13 é nova), M0 verde (23 de 23) e M1 verde.**

| # | mutação | o que caiu |
|---|---|---|
| V1 | sem o REVOKE da função das opções (nova: nasce com os DEFAULT PRIVILEGES do Supabase) | aborta: verificacao 4: public.orcamentista_opcoes_validas(text[]) aberta a PUBLIC/anon/authenticated (ou service_role sem EXECUTE… |
| V2 | a função de gravar aberta a anon | aborta: verificacao 4: public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) aberta a PUBLIC/anon/authenticated (o… |
| V3 | a função de gravar sem SECURITY DEFINER | aborta: verificacao 4: public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) sem SECURITY DEFINER ou sem search_pa… |
| V4 | a função de gravar sem o search_path | aborta: verificacao 4: public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) sem SECURITY DEFINER ou sem search_pa… |
| V5 | sem o UPDATE de um rótulo (REFORCO) | aborta: verificacao 3: ainda ha mojibake ("Ã" ou "Â" seguido de U+0080..U+00BF) em: rotulo REFORCO. Nada foi alterado. |
| V6 | sem o COMMENT de uma das 3 tabelas fora das 8 (esquadrias_padrao) | aborta: verificacao 3: ainda ha mojibake ("Ã" ou "Â" seguido de U+0080..U+00BF) em: COMMENT orcamentista_esquadrias_padrao. Nada foi alterado. |
| V7 | rótulo "consertado" SEM acento — sem "Ã", só o md5 pega | aborta: verificacao 3: o texto gravado nao e o da 20261023000002 (md5 nao bate) em: rotulo REFORCO. Nada foi alterado. |
| V8 | COMMENT com texto diferente e sem "Ã" — só o md5 pega | aborta: verificacao 3: o texto gravado nao e o da 20261023000002 (md5 nao bate) em: COMMENT orcamentista_mp_vidro. Nada foi alter… |
| V9 | O ARQUIVO INTEIRO PELA ÁREA DE TRANSFERÊNCIA (UTF-8 lido como Latin-1) | aborta: verificacao 3: ainda ha "Ã" ou "Ã" em: rotulo REFORCO; rotulo ACESSORIOS_VEDACAO; rotulo INSTALACAO; rotulo REFORCO.usa… |
| V10 | as opções na ordem trocada | aborta: verificacao 2: criterio_custo_barra nao esta em PERFIL como opcao {BARRA_INTEIRA, CONSUMO_REAL}, nesta ordem. Nada foi al… |
| V11 | o CHECK de tipo sem 'opcao' | aborta: new row for relation "orcamentista_categoria_campo" violates check constraint "orcamentista_categoria_campo_tipo_valido" |
| V12 | sem o CHECK de coerência | aborta: verificacao 1: o CHECK de coerencia entre tipo e opcoes nao existe. Nada foi alterado. |
| B1 | o ramo 'opcao' só confere que é string — não que pertence à lista | FALHOU: QUALQUER_COISA — recusado, e a mensagem diz a chave e os valores aceitos — ACEITO, devia ser recusado |
| B2 | o ramo 'opcao' só confere a lista — não que é string | FALHOU: numero 1 onde a opcao e a STRING "1" — recusado pelo tipo, nao pela lista — ACEITO, devia ser recusado |
| B3 | sem o ramo 'opcao' (cai no ELSE false) | ERRO NAO PREVISTO: valor(es) com tipo errado em PERFIL: criterio_custo_barra (esperado um de: BARRA_INTEIRA, CONSUMO_REAL) |
| B4 | a mensagem sem os valores aceitos (a descrição de antes) | FALHOU: QUALQUER_COISA — recusado, e a mensagem diz a chave e os valores aceitos — a mensagem nao traz "criterio_custo_barra (esperado um de: BARRA_IN… |
| B5 | a lista aceita REPETIDOS | FALHOU: CHECK — opcao com valor REPETIDO — ACEITO, devia ser recusado |
| B6 | a lista aceita valor SÓ DE ESPAÇOS (compara sem btrim) | FALHOU: CHECK — opcao com valor SO DE ESPACOS — ACEITO, devia ser recusado |
| B7 | a lista aceita valor VAZIO | FALHOU: CHECK — opcao com valor VAZIO — ACEITO, devia ser recusado |
| B8 | a lista aceita UM valor só | FALHOU: CHECK — opcao com UM valor so — ACEITO, devia ser recusado |
| B9 | a lista aceita NULL no meio | FALHOU: CHECK — opcao com valor NULL — ACEITO, devia ser recusado |
| B10 | a coerência sem a metade 'tipo <> opcao ⇒ opcoes NULL' | FALHOU: CHECK — texto COM opcoes — ACEITO, devia ser recusado |
| B11 | a coerência sem a metade 'opcao ⇒ opcoes NOT NULL' | FALHOU: CHECK — opcao SEM opcoes — ACEITO, devia ser recusado |
| B12 | COM valor padrão: preenche BARRA_INTEIRA no PERFIL de quem já existia | FALHOU: sem padrao — a migracao escolheu um criterio por omissao: {"linha": "EUROPA 42", "barra_mm": 6000, "criterio_custo_barra": "BARRA_INTEIRA"} |
| B13 | null deixa de passar (é o limpar) | FALHOU: null foi recusado: valor(es) com tipo errado em PERFIL: criterio_custo_barra (esperado um de: BARRA_INTEIRA, CONSUMO_REAL) |
| B14 | o ausente mexe: o config SUBSTITUI em vez de merge | FALHOU: ausente mexeu no criterio: {"linha": "EUROPA 60"} |
| V13 | a verificação 3a volta a `chr(195)`/`chr(194)` sozinhos, com um rótulo CERTO com "Ã" no banco (`TEXTO_CERTO_COM_A_TIL=1`) | aborta: verificacao 3 — acusa "VEDAÇÃO DAS FOLHAS", que é texto certo |
| **M0** | **controle: nada muda** | **verde: 23 de 23 casos ok** |
| **M1** | **controle com o rótulo CERTO com "Ã" no banco** | **verde: a migração passa, duas vezes, schema idêntico** |

**V9 é a mutação do transporte.** Ela passa o arquivo inteiro por Latin-1, como aconteceu com a
`20261023000002` na área de transferência do Windows, e a migração **aborta** na verificação 3.
A própria mensagem de erro sai corrompida (`"Ã" ou "Ã"`), porque o literal dela também passou
pelo transporte. A verificação procura o PAR — `chr(195)` ou `chr(194)` seguido de U+0080..U+00BF — e compara md5 em hexadecimal,
por isso não depende de literal nenhum que o transporte possa estragar.

**V7 e V8 são as que só o md5 pega**: um rótulo "consertado" sem acento e um COMMENT trocado não
têm "Ã" nenhum, e a verificação 3a passaria. A 3b compara o texto gravado contra o md5 do texto da
`20261023000002`.

## Relação com as outras regras

`transformacao-quebra-a-cadeia-de-hash.md` é a razão da verificação 3b: o md5 do arquivo prova o
arquivo, e este prova o banco. `teste-que-nao-exercita.md` é a razão do caso 12 e da contagem com
`SELECT DISTINCT`. `instrumento-que-se-enxerga.md` é a razão do controle M0 sair verde, que é a
fixture do alvo ausente.

## O detector do mojibake é o PAR, não o "Ã" sozinho (25/10/2026)

A 3a procurava `chr(195)`/`chr(194)` sozinhos, e isso acusa texto **certo**: "Ã" é letra do
português (VEDAÇÃO, MODULAÇÃO, NÃO). Medido sobre as 164 descrições corretas de
`orcamentista_motor_tipologia_detalhe`: o "Ã" sozinho acusa 20, e o par acusa 0 (130 de 130 no texto
corrompido de propósito) — `instrumento-que-nao-enxerga.md`, aparição 6. As duas fixtures rodam aqui:
**V13** é o detector antigo com o alvo AUSENTE (um rótulo certo com "Ã", `06_texto_certo_com_a_til.sql`)
e aborta; **M1** é o par com o mesmo rótulo, e passa. **V5, V6 e V9** são o alvo PRESENTE, e abortam.
