# 📊 Análise da Planilha — Precificação por Margem de Contribuição (Lucro Real - Industrialização)

> **Analisado por:** Orion (AIOS Master Orchestrator)
> **Data:** 2026-02-13
> **Fonte:** `Precificação Lucro Real Industrialização.xlsx.xlsx`

---

## 🎯 Visão Geral

A planilha implementa o modelo de **Precificação por Margem de Contribuição** para empresas no regime de **Lucro Real** no segmento de **Industrialização**.

A fórmula central é:
```
Preço de Venda = CMV (Custo da Mercadoria Vendida) / Coeficiente
```
Onde:
```
Coeficiente = 1 - Σ(todas as % de despesas, impostos, comissão e lucro)
```

---

## 📐 Estrutura Completa de Cálculos

### BLOCO 1 — Matéria-Prima / Fornecedores / Insumos

**Suporta N produtos/insumos** (no exemplo: PVC, Ferragens, Frete)

Para cada produto/insumo:
```
Base Bruta = Valor do item (informado manualmente)
```

#### 1.1 IPI Custo
```
IPI Custo = Valor informado quando o IPI NÃO gera crédito (depende do CNAE)
```
- Regra: **CNAE define se IPI é crédito ou custo**
- Se for indústria → IPI é creditável
- Se for comércio → IPI é custo

#### 1.2 Créditos Tributários (por item)
Cada item tem um **acionador "x"** que ativa/desativa o cálculo do crédito:

| Tributo | Fórmula | Observação |
|---------|---------|------------|
| **ICMS** | `IF(acionador="x", Base_Bruta × Alíquota_ICMS, 0)` | Alíquota varia por item (12%, 18%, etc.) |
| **PIS/COFINS** | `IF(acionador="x", Base_Bruta × 9.25%, 0)` | Alíquota fixa 9.25% (Lucro Real) |
| **IPI** | `IF(acionador="x", Base_Bruta × Alíquota_IPI, 0)` | Creditável para indústria; custo para comércio |

#### 1.3 Consolidação por Item
```
Total_Créditos_Item = ICMS + PIS/COFINS + IPI (quando acionados)
Custo_Líquido_Item = Base_Bruta + IPI_Custo - Total_Créditos

Fórmula Excel: =Valor_Item + IPI_Custo - SUM(ICMS, PIS/COFINS, IPI)
```

#### 1.4 Total Geral MP/Fornecedores
```
Total_Custo_MP = Σ(Custo_Líquido de cada item)

Fórmula Excel: =SUM(H12:I13) - SUM(H16:I18, H21)
Exemplo: R$ 1.142.000 - R$ 300.250 = R$ 841.750,00
```

---

### BLOCO 2 — Mão de Obra Direta (Produtiva)

**Suporta 2 tipos:** Própria e Terceirizada

```
Valor_MO_Total = MO_Própria + MO_Terceirizada

Fórmula Excel: =SUM(P33, W33)
Exemplo: R$ 250.000 + R$ 0 = R$ 250.000,00
```

#### 2.1 Desconto PIS/COFINS sobre MO Terceirizada
```
Desconto_PIS_COFINS_MO = IF(acionador="x", 9.25% × MO_Terceirizada, 0)

Fórmula Excel: =U36 * (W33 * C4)
```
- *Nota: C4 parece ser uma referência vazia no exemplo, resultando em R$ 0*

#### 2.2 Total Custo MO
```
Total_Custo_MO = Valor_MO_Total (- descontos se aplicável)

Fórmula Excel: =SUM(H33)
Exemplo: R$ 250.000,00
```

---

### BLOCO 3 — CMV (Custo da Mercadoria Vendida)

```
CMV = Total_Custo_MP + Total_Custo_MO

Fórmula Excel: =SUM(W47:W48)
Exemplo: R$ 841.750 + R$ 250.000 = R$ 1.091.750,00
```

#### 3.1 Percentuais do CMV sobre a Receita
```
% Custo_Produtos = Total_Custo_MP / Preço_Venda_Final
% Custo_MO = Total_Custo_MO / Preço_Venda_Final

Fórmula Excel: 
  Q47: =W47/W115 → 25,45%
  Q48: =W48/W115 → 7,56%
```

---

### BLOCO 4 — Despesas (% sobre Receita)

Valores informados pelo usuário (vêm do sistema Precifica Certo):

| Despesa | % | Fórmula Valor |
|---------|---|---------------|
| **MO Indireta** | 6,22% | `= Preço_Venda × 6,22%` |
| **Despesa Fixa** | 10,49% | `= Preço_Venda × 10,49%` |
| **Despesa Variável** | 6,00% | `= Preço_Venda × 6,00%` |
| **Despesa Financeira** | 0,06% | `= Preço_Venda × 0,06%` |

```
Total_Despesas = 22,77%
Fórmula Excel: =SUM(G53:G56)
```

---

### BLOCO 5 — Regime Tributário (Especial)

```
% Regime = 0% (Lucro Real não usa essa linha — é pra Simples Nacional)
Valor = Preço_Venda × 0%

Fórmula Excel: =W115*Q60
```

---

### BLOCO 6 — Comissão de Venda

```
% Comissão = 6,00% (informado pelo usuário)
Valor = Preço_Venda × 6,00%

Fórmula Excel: =W115*Q64
Exemplo: R$ 198.420,45
```

---

### BLOCO 7 — Margem de Lucro Desejada

```
% Lucro = 12,00% (informado pelo usuário)
Valor = Preço_Venda × 12,00%

Fórmula Excel: =W115*Q68
Exemplo: R$ 396.840,90
```

---

### BLOCO 8 — Impostos sobre o Lucro Líquido (CSLL + IRPJ)

#### 8.1 CSLL
```
Lucro_Real_Ajustado = Valor_Lucro_Desejado (= Preço_Venda × % Lucro)
CSLL = Lucro_Real_Ajustado × 9%
% Equivalente_Receita = CSLL / Preço_Venda

Fórmula Excel:
  K73: =W68                  → R$ 396.840,90
  K74: =K73 × 9%             → R$ 35.715,68
  N74: =K74 / W115           → 1,08%
```

#### 8.2 IRPJ
```
IRPJ = Lucro_Real_Ajustado × 15%
% Equivalente_Receita = IRPJ / Preço_Venda

Fórmula Excel:
  K78: =W68                  → R$ 396.840,90
  K79: =K78 × 15%            → R$ 59.526,14
  N79: =K79 / W115           → 1,80%
```

#### 8.3 Adicional de IRPJ
```
Base_Adicional = Lucro_Real_Ajustado - R$ 240.000 (limite anual)
IF Base_Adicional > 0:
  Adicional_IRPJ = Base_Adicional × 10%
ELSE:
  Adicional_IRPJ = 0
% Equivalente_Receita = Adicional_IRPJ / Preço_Venda

Fórmula Excel:
  I84: =I82 - 240000         → R$ 156.840,90
  K84: =I84 × 10%            → R$ 15.684,09
  N84: =IF(OR(K84<0, W115=0), 0, K84/W115) → 0,4743%
```

#### 8.4 Total Impostos sobre Lucro
```
Total_% = CSLL% + IRPJ% + Adicional%
        = 1,08% + 1,80% + 0,4743%
        = 3,3543%

Fórmula Excel: =SUM(G76:G80) → 3,35%
```

---

### BLOCO 9 — Impostos de Venda (Calculados "por dentro")

#### 9.1 ICMS (por dentro)
```
Ativação: IF acionador = "x"
Preço_Líquido = Preço_Venda_Final
Alíquota_Venda = 15% (informada)
Alíquota_Final = Alíquota_Venda × (1 - fator_redução)
Valor_ICMS = Preço_Venda × Alíquota_Final

Fórmula Excel:
  M93: =M91 × (1-L92)        → 15%
  Q93: =IF(C92="x", M93, "0") → 15%
  W93: =W115 × Q93           → R$ 496.051,13
```

#### 9.2 PIS/COFINS (por dentro, base = Receita - ICMS)
```
Ativação: IF acionador = "x"
Base_PIS_COFINS = Preço_Venda - ICMS
PIS_COFINS = Base_PIS_COFINS × 9,25%
% Equivalente_Receita = PIS_COFINS / Preço_Venda

Fórmula Excel:
  N97: =IF(C99="x", W115, "")  → R$ 3.307.007,52
  N98: =W93                    → R$ 496.051,13
  N99: =N97 - N98              → R$ 2.810.956,40  ← BASE
  N101: =N99 × 9,25%           → R$ 260.013,47
  N103: =N101 / W115           → 7,8625%
```

**⚠️ IMPORTANTE:** O PIS/COFINS no Lucro Real é calculado sobre a receita **menos o ICMS**, diferente do Simples Nacional.

#### 9.3 ISS (por dentro) — Desativado no exemplo
```
Ativação: IF acionador = "x" (desativado)
Alíquota_Venda = 5%
Valor_ISS = 0 (desativado)
```

---

### BLOCO 10 — FÓRMULA CENTRAL: Preço de Venda

```
Coeficiente = 1 - Σ(todas as % na coluna Q, linhas 47 a 110)

Preço_Venda = CMV / Coeficiente

Fórmula Excel:
  S50: =1 - SUM(Q51:Q110)    → 0,33013 (33,01%)
  W115: =W50 / S50           → R$ 3.307.007,52
  Q115: =SUM(Q47:Q110)       → 100,00% (validação)
```

#### Decomposição do Coeficiente:
```
+---------------------------------+----------+
| Componente                      | %        |
+---------------------------------+----------+
| Custo Produtos (MP)             | 25,45%   |
| Custo MO Direta                 | 7,56%    |
| MO Indireta                     | 6,22%    |
| Despesa Fixa                    | 10,49%   |
| Despesa Variável                | 6,00%    |
| Despesa Financeira              | 0,06%    |
| Regime Tributário               | 0,00%    |
| Comissão                        | 6,00%    |
| Lucro                           | 12,00%   |
| CSLL                            | 1,08%    |
| IRPJ                            | 1,80%    |
| Adicional IRPJ                  | 0,47%    |
| ICMS                            | 15,00%   |
| PIS/COFINS                      | 7,86%    |
| ISS                             | 0,00%    |
+---------------------------------+----------+
| TOTAL                           | 100,00%  |
+---------------------------------+----------+
| Coeficiente (1 - custos/desp)   | 33,01%   |
+---------------------------------+----------+
```

---

### BLOCO 11 — IPI de Saída (Destacado na Nota)

```
Ativação: IF acionadorMVA = "x" (desativado no exemplo)
Base_IPI = Preço_Venda
IPI_Saída = Preço_Venda × Alíquota_IPI_Saída

Fórmula Excel:
  N122: =IF(F124="X", W115, "")
  N125: =IF(F124="x", N122 × N123, "")
  W125: =N125
```

---

### BLOCO 12 — IBS (Imposto sobre Bens e Serviços) — Reforma Tributária

```
Fator_Redução_Alíquota = 0% (ativo a partir de 2033)
Alíquota_IBS = 0,10%
Alíquota_Reduzida = Alíquota_IBS × (1 - Fator_Redução)
Débito_IBS = Preço_Venda × Alíquota_Reduzida

Fórmula Excel:
  N134: =J134 × (1 - C134)   → 0,10%
  N135: =N133 × N134         → R$ 3.307,01
  W135: 0 (informado manualmente, pois é "a recolher")
```

---

### BLOCO 13 — CBS (Contribuição sobre Bens e Serviços) — Reforma Tributária

```
Ativação: IF acionador = "x"
Alíquota_CBS = 0,90%
Alíquota_Reduzida = Alíquota_CBS × (1 - Fator_Redução)
Débito_CBS = Preço_Venda × Alíquota_Reduzida

Fórmula Excel:
  N140: =J140 × (1 - C134)   → 0,90%
  N141: =N140 × N139         → R$ 29.763,07
  W141: 0 (informado manualmente, pois é "a recolher")
```

**⚠️ NOTA:** CBS e IBS são calculados "por fora" (sobre a receita), mas **NÃO entram no coeficiente de formação de preço**. São tributos a recolher separadamente.

---

### BLOCO 14 — Valor Total de Venda

```
Valor_Total_Venda = Preço_Interno + IPI_Saída (+ IBS + CBS se aplicável)

Fórmula Excel:
  W147: =SUM(W115:W145)      → R$ 3.307.007,52
```

*No exemplo, como IPI de saída, IBS e CBS a recolher são R$ 0, o valor final = Preço Interno.*

---

## 🔑 Diferenças vs. Sistema Atual

| Aspecto | Sistema Atual | Planilha Lucro Real |
|---------|---------------|---------------------|
| **Créditos tributários** | ❌ Não calcula | ✅ ICMS, PIS/COFINS, IPI por item |
| **CSLL** | ❌ Não existe | ✅ 9% sobre lucro → equiv. receita |
| **IRPJ** | ❌ Não existe | ✅ 15% sobre lucro + adicional 10% |
| **ICMS por dentro** | ❌ Não calcula | ✅ Com acionador e alíquota variável |
| **PIS/COFINS por dentro** | ❌ Não calcula | ✅ Base = Receita - ICMS |
| **ISS** | ❌ Não existe | ✅ Com acionador (serviços) |
| **IBS / CBS** | ❌ Não existe | ✅ Reforma tributária (2033+) |
| **IPI saída** | ❌ Não existe | ✅ MVA com acionador |
| **Coeficiente** | Fórmula simples | ✅ Soma de TODOS os % |
| **Fórmula preço** | `CMV / (1 - %despesas)` | `CMV / (1 - Σtodos%)` — igual, mas MUITO mais completo |

---

## 🏗️ Impacto no Desenvolvimento

1. **Sprint 1.2 (Itens):** Precisa implementar acionadores de crédito por tributo (ICMS, PIS/COFINS, IPI) com alíquotas por item
2. **Sprint 1.1 (Config):** Regimes expandidos, incluindo Lucro Real com CSLL, IRPJ e adicional IRPJ
3. **Sprint 2.1 (Produtos):** Motor de precificação precisa ser COMPLETAMENTE reescrito:
   - Cálculos de crédito por item
   - ICMS/PIS-COFINS/ISS por dentro
   - CSLL/IRPJ/Adicional IRPJ
   - IBS/CBS (reforma tributária)
   - IPI de saída
4. **O Coeficiente é a pedra angular** — tudo gira em torno de somar todos os percentuais e dividir o CMV por (1 - total)

---

> 👑 *Motor de precificação mapeado — pronto para implementação!*
> — Orion 🎯
