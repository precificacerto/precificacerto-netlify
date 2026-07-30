# SPEC 3.4 — Motor RRO (cascata) em todos os regimes tributários

> Doc `Correcoes_Mobile_Desktop_29-07-2026_1.docx` §3.4. Planejamento — aguardando aprovação.
> Autor: Orion (aios-master) · Data: 30/07/2026

## 1. Objetivo
Garantir que o **Motor RRO (Memória Cascata)** esteja disponível e correto em **todos os regimes**: Lucro Real, Lucro Presumido, Simples Nacional, **Simples Híbrido**, MEI. A **estrutura sequencial da cascata** (agrupamento → total com pesos → abatimento) é a mesma; muda apenas a **apuração fiscal** de cada regime.

## 2. Estado atual
- `TaxRegime = 'MEI' | 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL'` (`src/types/mrm.ts:86`). **Falta "Simples Híbrido"**.
- O motor V17 foi construído em torno da cascata do **Lucro Real** (PDF de referência). O regime é consumido em `legacy-adapter.ts` para resolver alíquotas.
- Tabelas de parâmetros por regime já existem: `lucro_real_params`, `lucro_presumido_rates`, `simples_nacional_brackets`, `tax_rates_periods`.
- **Planilhas-oráculo por regime** disponíveis em `tabelas regime/`:
  - Lucro Real / Presumido / Simples / Simples Híbrido — Industrialização e Revenda (Base bruta NF).

## 3. Requisitos do documento
1. Cascata presente em **todos** os regimes citados.
2. Cada regime com seu **modelo de apuração fiscal** (ex.: LR apura ICMS/PIS/COFINS/ISS separadamente; Simples consolida em **DAS**; MEI valor fixo) — nomenclatura e composição variam, **estrutura sequencial permanece**.
3. **Categorias universais** — RT (Comissão Reserva Técnica), Comissões, Lucro, Despesas Fixas/Variáveis/Financeiras — em todos os regimes.
4. Toda a camada já construída (cascata, Motor RRO, Contêiner de vendas, modos de desconto, modos de comissão, recebimento de parcelas) idêntica e disponível para qualquer regime; o que varia é **só o cálculo fiscal** e particularidades por tipo de negócio (serviço = MO por tempo; revenda = MO indireta).

## 4. Arquitetura proposta
**Princípio:** isolar a **camada fiscal** (que varia por regime) da **estrutura da cascata** (invariante), via uma interface de "estratégia fiscal por regime".

- **`TaxStrategy` por regime** (novo, `src/utils/mrm-engine-v17/tax-strategies/`): interface com `computeInsideTaxes(base, ctx)`, `computeOutsideTaxes(...)`, `label()`. Implementações: `LucroRealStrategy` (atual), `LucroPresumidoStrategy`, `SimplesNacionalStrategy` (consolida DAS), `SimplesHibridoStrategy`, `MeiStrategy` (fixo/isento).
- **Motor consome a strategy** conforme `ctx.regime`. A sequência de etapas (1–17) não muda; a **composição de impostos** de cada etapa é delegada à strategy.
- **Enum `TaxRegime`** ganha `SIMPLES_HIBRIDO`. Migração/mapeamento de tenants.
- **Categorias universais** garantidas independentemente do regime (RT/Comissão/Lucro/Despesas sempre presentes).

## 5. Faseamento sugerido
1. Definir a interface `TaxStrategy` e extrair a lógica atual (LR) para `LucroRealStrategy` **sem mudança de resultado** (regressão bit-exact contra oráculos atuais).
2. Adicionar `SIMPLES_HIBRIDO` ao enum + UI de seleção de regime.
3. Implementar `SimplesNacionalStrategy` (DAS) validando contra `Simples ... Base bruta NF.xlsx`.
4. Implementar `LucroPresumidoStrategy`, `SimplesHibridoStrategy`, `MeiStrategy`, cada uma com sua planilha-oráculo.
5. Teste-oráculo por regime (um `*.test.ts` por planilha) — travar os valores canônicos.

## 6. Oráculos / validação
- Uma suíte de teste por regime, cada uma reproduzindo a planilha correspondente em `tabelas regime/` (Industrialização e Revenda). **Nenhum regime entra sem oráculo** — evita reversões (lição do produto manual).

## 7. Riscos
- **Alto:** o motor V17 tem muitas nuances acopladas ao LR (PIS/COFINS sobre base específica, ICMS por dentro, IVA Dual). Extrair a strategy sem quebrar os ~50 testes/oráculos atuais exige cuidado cirúrgico.
- Semântica do **Simples/MEI** (imposto único vs cascata de tributos) pode exigir etapas condicionais.
- **Particularidades por tipo de negócio** (serviço vs revenda) cruzam com regime — matriz regime × tipo.

## 8. Critérios de aceite
- Cascata funcional nos 5 regimes, cada um com apuração fiscal correta validada por planilha.
- Categorias universais presentes em todos.
- LR permanece **bit-exact** (nenhum oráculo atual quebra).
- Camada estrutural (desconto, comissão, parcelas, contêiner) idêntica entre regimes.

## 9. Estimativa
Épico **grande (~5–8 dias)**, dividido por regime. Ordem sugerida: LR (refactor) → Simples → Presumido → Simples Híbrido → MEI. Rodar como sprint dedicada com QA e oráculo por regime.
