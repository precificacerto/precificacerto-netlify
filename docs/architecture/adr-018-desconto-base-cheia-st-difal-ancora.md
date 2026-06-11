# ADR-018 — Desconto incide sobre a base cheia (ST/DIFAL) e Desp. Acessória fixa absorvida pela âncora

- **Status:** ACCEPTED
- **Data:** 2026-06-11
- **Fonte de verdade:** planilha `Motor RRO 11.06 (1).xlsx`
- **Supera:** doc v4 (Base de Conhecimento Fiscal) **Tabela 77** ("frete fixo D3")
- **Relaciona:** [[adr-017-tributos-por-fora-conferencia-fiscal]], EPIC-POR-FORA-V2/V3

## Contexto

O diagnóstico `cascata_tributaria_diagnostico.pdf` (Jun/2026) levantou que tributos adicionais
(ICMS-ST, DIFAL, ICMS Complementar, Desp. Acessórias) não eram deduzidos antes da apuração reversa.
A investigação confirmou que o motor V17 já mantém o RRO independente dos tributos **por fora** (eles
vão ao `valor_final`, não ao RRO). Porém, ao validar o cenário canônico com **desconto 10% + ICMS-ST**
contra a planilha `Motor RRO 11.06`, surgiram 2 divergências reais (gargalos):

| # | Item | Código (antes) | Planilha 11.06 | Δ |
|---|------|----------------|----------------|---|
| 1 | BC ICMS-ST pós-desconto | 137.746,31 | **136.901,96** | +844 |
| 1 | ICMS-ST | 18.228,98 | **18.117,24** | +111,74 |
| 3 | Âncora pós-desconto | 129.302,82 | **129.170,22** | +132,60 |
| 3 | **RRO** | 13.073,95 | **12.963,89** | +110,06 |

## Decisão

1. **Gargalo 1 — base do ST/DIFAL desconta toda a operação.**
   `BC_ST = BC_DIFAL = (OpDentro + IPI + Desp. Acessórias) × (1 − d)`.
   O preço efetivo da operação que serve de base ao ICMS-ST/DIFAL **inclui** o desconto comercial.
   Isto **supera a regra "frete fixo D3"** do doc v4 Tab. 77 (que mantinha IPI/Desp. fixos).
   - Implementado em `src/utils/icms-st-difal.ts` (`computeIcmsSt`, `computeDifal`).

2. **Gargalo 3 — Desp. Acessória FIXA no desconto, absorvida pela âncora.**
   No desconto global, frete/seguro (Desp. Acessória) são **contratuais** e não sofrem desconto
   comercial. O desconto que incidiria sobre eles é absorvido pela operação por dentro, reduzindo a
   âncora pós-desconto:
   `ajuste_pool = desp × d × (1 + icms × [ICMS Compl com frete na base])`
   `âncora = âncora_limpa − ajuste_pool × peso_op_interna`.
   O termo de ICMS reflete o excesso da reapuração do ICMS Complementar (cuja base mantém a Desp.
   Acessória FIXA): `ICMSCompl_pós − ICMSCompl×(1−d) = desp × d × icms`.
   - Implementado em `src/utils/mrm-engine-v17.ts` (orquestrador) + `mrm-engine-v17/motor-rro.ts`.

3. **ICMS Complementar — Desp. Acessória permanece FIXA (base legal distinta).**
   Não é inconsistência: frete/seguro são valores contratuais que não sofrem desconto comercial na
   base do ICMS Complementar; já o IPI usa o preço efetivo (descontado). O código já estava correto
   (`computeIcmsComplementar(IPI_pós, Desp_fixa, ICMS)` = R$ 1.312,25).

## Consequências

- Valores canônicos travados em `src/utils/__tests__/motor-rro-1106-oracle.test.ts`
  (BC_ST 136.901,96 · ST 18.117,24 · âncora 129.170,22 · **RRO 12.963,89**).
- 2 testes que encodavam "frete fixo D3" (icms-st-difal.test.ts) foram atualizados para a nova regra
  (BC pós = 130.202,82; DIFAL 6.510,14).
- A correção da âncora (gargalo 3) só ativa com `desconto > 0` **e** `desp_acessorias > 0` — zero
  efeito nos demais cenários; toda a suíte `src/` (445 testes fiscais) permanece verde.

## Follow-up conhecido (NÃO incluso nesta mudança)

- **Gargalo 4 (menor, só exibição):** na planilha 11.06 as bases dos tributos por fora IPI/IBS/CBS/IS
  também descontam a Desp. Acessória (a planilha distribui a operação por fora por peso × pool
  corrigido). O `absorption.ts` ainda soma a Desp. Acessória cheia a essas bases (Δ ~R$ 6 no IPI).
  **Não afeta o RRO** (independente dos por fora). Avaliar em EPIC dedicado se quiser alinhamento bit
  a bit do display por fora à planilha 11.06.

## Doc v4 Tab. 77 — superado

A recomendação "frete fixo D3" (IPI/Desp. fixos no desconto do ST/DIFAL) do doc v4 fica registrada
como **SUPERADA** pela planilha `Motor RRO 11.06` a partir de 2026-06-11.
