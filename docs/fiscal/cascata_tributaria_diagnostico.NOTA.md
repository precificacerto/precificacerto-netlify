# Nota — `cascata_tributaria_diagnostico.pdf`

**Modelo conceitual validado numericamente (Jun/2026).**

- O diagnóstico apontou corretamente a hierarquia de desconstrução (desconto → dedução dos tributos
  adicionais → âncora limpa → desmonte reverso → RRO).
- Confirmado por teste: o motor V17 mantém o **RRO independente dos tributos por fora** (ICMS-ST,
  DIFAL, ICMS Complementar, Desp. Acessórias vão ao `valor_final`, não ao RRO) — via
  `peso_op_interna` + `computeTotalACobrar`.
- Ao validar **desconto 10% + ICMS-ST** contra a planilha `Motor RRO 11.06` (fonte de verdade),
  foram encontrados e **corrigidos** 2 gargalos:
  - **Gargalo 1:** base do ICMS-ST/DIFAL passa a descontar toda a operação:
    `BC = (OpDentro+IPI+Desp.Acess)×(1−d)`.
  - **Gargalo 3:** a Desp. Acessória é FIXA no desconto e seu desconto é absorvido pela âncora.
- **ST recalculado sobre a base pós-desconto: confirmado.** Invariante e valores canônicos travados
  em `src/utils/__tests__/motor-rro-1106-oracle.test.ts` (RRO = **R$ 12.963,89**).

> Decisão formal e detalhes: **`docs/architecture/adr-018-desconto-base-cheia-st-difal-ancora.md`**.
> Regra "frete fixo D3" do doc v4 Tab. 77 fica **SUPERADA** pela planilha 11.06.
