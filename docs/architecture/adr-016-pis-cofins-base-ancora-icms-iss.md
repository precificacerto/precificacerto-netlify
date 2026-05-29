# ADR-016 — PIS/COFINS sobre (Âncora − ICMS − ISS) + alíquota efetiva consolidada

**Status:** ACCEPTED (Founder 2026-05-29)
**Engine:** Motor V17 (`src/utils/mrm-engine-v17/`)
**Revoga:** ADR-013 (base `Âncora − ICMS`, sem subtrair ISS)

## Context

Em 2026-05-29 o Founder reportou, na memória cascata do orçamento (e na venda no balcão), o PIS/COFINS exibindo **alíquota artificial de 78,3385%** (valor R$ 67.808,61 sobre base R$ 86.558,46). A investigação revelou DOIS problemas:

1. **Causa-raiz do valor inflado (corrigida à parte):** `buildItemTaxRatesFromProduct` dividia o `pis_cofins_pct` agregado (formato percentual) gerando uma parcela PIS < 1 (ex.: 0,77 para o produto "Obra JJCR" de 4,325%), que o `normalizePct` dos tributos interpretava como 77%. Fix: normalizar o agregado para decimal antes do split (`item-tax-rates.ts`).

2. **Base de cálculo divergente em 4 pontos do código** (Âncora cheia / Âncora−ICMS / Âncora−ICMS−ISS / Op Interna) + alíquota PIS/COFINS **recomposta** (`valor ÷ base`) na cascata, que amplificava qualquer erro de valor.

O Founder definiu (decisão fiscal) a regra oficial: **PIS/COFINS incide sobre o resultado após ICMS e ISS**, com a alíquota apresentada sendo a **efetiva consolidada real** dos produtos — não recomposta. Isso reverte a base do ADR-013 (que NÃO subtraía o ISS).

## Decision

### Base canônica (Etapa 13B)

```
base_pis_cofins = Âncora − ICMS − ISS
```

A cascata é segregada em:
- **13A — Impostos sobre faturamento:** ICMS (sobre Âncora) → ISS (sobre Âncora − ICMS) → linha-âncora **"= Resultado após ICMS e ISS"**.
- **13B — PIS/COFINS:** incide exclusivamente sobre o resultado de 13A.

### Transmutação da alíquota (`motor-rro.ts`)

O **valor monetário** do PIS/COFINS é o consolidado da **precificação** (`Σ Op Interna × pct`) — **PRESERVADO**, não reduzido pela base menor. A base de incidência exibida é `Âncora − ICMS − ISS`; a alíquota é **transmutada** para manter o valor:

```ts
pis_cofins = tit.pis_cofins * ancoraFactor          // valor da precificação (preservado)
const base_13a = ancora - icms - iss
pis_cofins_aliquota_efetiva = base_13a > 0
  ? pis_cofins / base_13a                            // = alíq_precif / (1 − ICMS% − ISS%)
  : pis_cofins_rate
```

**Por que transmutar?** A alíquota da precificação (ex.: 3,8269%) é calculada sobre a Op Interna. Aplicá-la direto na base reduzida (`Âncora − ICMS − ISS`) **subestimaria** o tributo. A transmutação `alíq ÷ (1 − ICMS% − ISS%)` recompõe a alíquota para a base menor, garantindo:

```
valor = base_13A × alíq_transmutada = Âncora × alíq_precif = valor da precificação ✅
```

A alíquota transmutada (`MotorOutput.pis_cofins_aliquota_efetiva`) é **exibida na linha 13B** e a memória fica auditável (`base × alíquota = valor`).

**Exemplo validado (orçamento Founder):** alíq_precif 3,8269%, ICMS 8,8482%, ISS 0% → transmutada = 3,8269% / 0,911518 = **4,1983%** → 86.558,46 × 4,1983% = **R$ 3.634,01** (= 94.960,79 × 3,8269%). Base da Etapa 14 = Âncora − ICMS − ISS − PIS/COFINS = **R$ 82.924,45**.

### Regra de segregação

A linha PIS/COFINS NÃO recebe influência de lucro, comissão, IRPJ, CSLL, RRO, custos ou despesas — esses entram nas etapas posteriores (14-16).

## Rationale

1. **Definição fiscal do Founder (2026-05-29):** a base do PIS/COFINS exclui ICMS e ISS.
2. **Auditabilidade:** alíquota efetiva real consolidada dos produtos (Σ PIS/COFINS ÷ Op Interna) elimina o percentual artificial de 78%.
3. **Coerência única:** uma só base canônica em motor, adapter e cascata.

## Alternativas rejeitadas

- **Manter ADR-013 (não subtrair ISS):** rejeitado por decisão fiscal explícita do Founder.
- **Manter alíquota recomposta (`valor ÷ base`):** rejeitado — amplifica erros de valor e não representa a carga tributária real.

## Consequences

### Positivas
- ✅ Alíquota artificial de 78,3385% eliminada.
- ✅ PIS/COFINS auditável (base × alíquota = valor) e segregado (13A/13B).
- ✅ Venda no balcão herda automaticamente (mesmo `extractEpicV5DisplayData`).

### Negativas
- ⚠️ Valor do PIS/COFINS muda em documentos **com ISS > 0** (base encolhe → tributo menor). Documentos sem ISS são indiferentes.
- ⚠️ Snapshots antigos preservados (não recalculados) — ADR-003 mantido.

## Acceptance criteria

1. ✅ Founder aprovou via AskUserQuestion (base = Âncora−ICMS−ISS; alíquota nominal/efetiva).
2. ✅ Suíte `mrm-engine-v17.test.ts` SUITE 5 (ADR-016): base, alíquota efetiva, cascata 13A/13B, regressão "Obra JJCR" (4,325% não infla). 514/514 testes verdes.
3. ⏳ Smoke test browser: cascata 13B mostra ~3,827% e ~R$ 3.313 no orçamento do Founder (validação visual pendente).
