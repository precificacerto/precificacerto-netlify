# A Cor Afirmada pelo Código

> **Esta regra é independente da rodada que a originou.** Nasceu em 12/11/2026, à noite, na medição dos 68 perfis do motor da Wolf (a 5.3 do
> comando único), quando quatro perfis caíram no nome técnico em itens cuja descrição não diz a cor. **Supera, neste ponto, a regra de 25/10/2026**
> registrada em `.claude/rules/a-coluna-que-parece-enumeracao.md` ("recusa quando a descrição não diz a cor"): ela continua valendo quando nem o
> código nem a descrição afirmam a cor.

## O critério

Decisão do dono do produto, 12/11/2026, registrada como está:

> A regra de 25/10 ("recusa quando a descrição não diz a cor") fica SUPERADA no caso em que o CÓDIGO carrega a cor. Medido: 90531 = 9053+1,
> 9721 = 972+1, 9511 = 951+1, 10251 = 1025+1, e 1 é BRANCO na tabela de cores da Wolff.

A HIERARQUIA DA COR de um item da tabela de preço, quando a resolução de referência o acha pelo nome técnico:

| degrau | o que decide | quando |
|---|---|---|
| **a** | o **sufixo do código**, quando ele está na tabela de cores do fornecedor (`orcamentista_fornecedor_cor`) | sempre que há sufixo conhecido — **decide**, e a descrição não precisa repetir |
| **b** | a **palavra de cor** na descrição | quando não há sufixo conhecido |
| **c** | nenhum dos dois | a cor **não foi afirmada** — e aí sim recusa (falta nomeada) |

**A palavra de cor é cor escrita, não "sem cor"**: as descrições da Wolf escrevem `LAMINADO GOLDEN OAK` e `LAMINADO NOGUEIRA` para as cores que a
tabela chama `AMADEIRADO GOLDEN OAK` e `AMADEIRADO NOGUEIRA`. As palavras de cor são as dos nomes da tabela, menos os modificadores (`EXTERNO`,
`AMADEIRADO`), que também são palavra de peça ("ARREMATE EXTERNO"). A frase inteira da tabela vence a palavra: `EXTERNO PRETO TEXTURADO` não é
`PRETO TEXTURADO`.

## Por que a distinção é difícil de ver

Porque o sufixo só existe **numa família**. O código `90531` sozinho não diz nada — é a família `90531`, `905320`, `905321`… que mostra o prefixo
`9053` e o dígito da cor. E um prefixo comum pode ser coincidência: `8427` (o reforço do SF92) e `83571` (o embelezador) dividem o `8`, e nenhum dos
dois é `8` + uma cor. **Família, no código, é o prefixo comum dos candidatos do degrau quando pelo menos DOIS deles terminam num código da tabela
de cores** (`baseDaFamilia`). O ".1" do fim (face menor) sai antes.

## As aparições

| # | Quando | O perfil | O item | A cor afirmada |
|---|---|---|---|---|
| 1 | 12/11/2026, medição 5.3 | `BZ1770/WOLFF` em BRANCO | `90531` — "BZ1770 - GUARNIÇÃO ARREMATE INTERNO 17X70MM" | o código: 9053 + **1** |
| 2 | idem | `GM42N/WOLFF` | `9721` — "GM42N - ENCONTRO CENTRAL 4 FOLHAS - ALUMÍNIO" | o código: 972 + **1** |
| 3 | idem | `FR106/WOLFF` | `9511` — "FR106 - FOLHA PORTA ABERTURA INTERNA" | o código: 951 + **1** |
| 4 | idem | `BZ3016/WOLFF` | `10251` — "BZ3016 - PERFIL ACABAMENTO EXTERNO CAIXA PERSIANA - PINGADEIRA" | o código: 1025 + **1** |

O contraste, que fica recusado: o `10491` ("BZ0012 - BASE DA GUARNIÇÃO - CLICK") é código sozinho, sem família, e a descrição não diz cor — degrau
**c**, a cor não foi afirmada.

## O remédio

Implementado em `src/lib/atendimentos-ia/resolucao-de-referencia.ts` (`corAfirmada`, `corAfirmadaEhAPedida`, `baseDaFamilia`), provado em
`resolucao-de-referencia.test.ts` e na bateria `scripts/harness/falta-nomeada-e-tres-caminhos/mutacoes.py`.

## As ressalvas de método — o que esta regra NÃO diz

- **Não vale fora do degrau do nome técnico.** A ponte e o exato acham o código que o motor deu; o degrau "código + cor" constrói o sufixo pela
  própria tabela de cores.
- **Não infere o dígito sem a tabela de cores.** Sem `orcamentista_fornecedor_cor` (a migração pendente, ou o fornecedor sem cores), o degrau do
  nome técnico nem roda.
- **Não decide sobre outro fornecedor.** A família e os dígitos medidos são os da Wolf.
