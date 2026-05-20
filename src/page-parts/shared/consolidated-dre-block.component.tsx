// TODO(EPIC-RR-V2+1): cobrir branches JSX (4 buckets, MEI/SN, requiresReview)
// com testes de render quando @testing-library/react 19 + peer @testing-library/dom
// estiverem estáveis no projeto. Lógica de dados já coberta por
// consolidated-dre.test.ts (10 testes verdes).
//
// TODO(EPIC-A11Y-DRE / TD-RR-09): acessibilidade do bloco — adicionar
// role="table"/role="row"/role="cell" no grid de distribuição, aria-labelledby
// nos section headers, e aria-describedby no lugar de title= no Row de receitas.
// Quinn S13 review apontou que `title` em <span> não é lido por todos
// screen readers. Aceito como dívida MVP coerente com o padrão do app.
//
/**
 * ConsolidatedDREBlock — Card demonstrativo da DRE consolidada (Sprint S13 EPIC-RR-V2).
 *
 * Princípio: "orçamento não recalcula; CONSOLIDA RRs individuais já calculados
 * por produto". Este componente apenas RENDERIZA o output de `computeConsolidatedDRE`.
 *
 * 6 seções estruturadas (R3=B: bloco NOVO, adicional ao Distribuição existente):
 *   1. RECEITAS — bruta pós-desconto + impostos por fora + receita líquida
 *   2. CUSTOS — total dos produtos/serviços
 *   3. DESPESAS — 4 buckets (R6=b: fixed/variable/financial/administrative) + MOD
 *   4. IMPOSTOS — POR DENTRO (ICMS/PIS/COFINS/ISS) e POR FORA (IPI/ST/DIFAL/...)
 *      separados (R5)
 *   5. RESULTADO RESIDUAL OPERACIONAL (RRO consolidado)
 *   6. DISTRIBUIÇÃO — Comissão/Lucro/IRPJ/CSLL com R$ + % original + % efetivo (R4=c)
 *
 * Usado em orçamento, pedido e venda (R7=B: aplicação universal).
 */

import React from 'react'

import { formatBRL } from '@/utils/formatters'
import type { DRESection } from '@/utils/consolidated-dre'
import { formatResidualLine } from '@/utils/residual-distribution'

function formatPct(pct: number, fractionDigits = 3): string {
  return pct.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

// ─────────────── Sub-componentes visuais ───────────────

function SectionHeader({ title, accent = '#a5b4fc' }: { title: string; accent?: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: accent, textTransform: 'uppercase',
      letterSpacing: 1, marginBottom: 6, marginTop: 12,
    }}>
      {title}
    </div>
  )
}

function Row({ label, value, color, indent = 0, hint }: {
  label: string
  value: string
  color?: string
  indent?: number
  hint?: string
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      paddingLeft: indent, paddingTop: 2, paddingBottom: 2, fontSize: 12,
    }}>
      <span style={{ color: '#94a3b8' }} title={hint}>{label}</span>
      <span style={{ color: color ?? '#cbd5e1', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(99,102,241,0.15)', margin: '6px 0' }} />
}

// ─────────────── Componente principal ───────────────

export interface ConsolidatedDREBlockProps {
  dre: DRESection
  /** Espaçamento superior em px (default: 8). */
  marginTop?: number
  /**
   * Quando true, esconde o título "DRE Consolidada" (útil quando o bloco
   * está dentro de um modal/popup que já tem cabeçalho).
   */
  hideTitle?: boolean
}

export function ConsolidatedDREBlock({
  dre,
  marginTop = 8,
  hideTitle = false,
}: ConsolidatedDREBlockProps) {
  const {
    receitas,
    custos,
    despesas,
    impostos,
    rro,
    distribuicao,
    hidesProfitTaxes,
    requiresReview,
  } = dre

  return (
    <div style={{
      marginTop,
      padding: '14px 18px',
      background: 'rgba(15, 23, 42, 0.45)',
      border: '1px solid rgba(99, 102, 241, 0.30)',
      borderRadius: 8,
    }}>
      {!hideTitle && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 13, fontWeight: 700, color: '#c7d2fe', marginBottom: 4,
        }}>
          <span>DRE Consolidada</span>
          {requiresReview && (
            <span style={{
              fontSize: 10, fontWeight: 500, color: '#facc15',
              background: 'rgba(234,179,8,0.15)', padding: '2px 8px', borderRadius: 4,
            }}>
              Atualizando para nova versão do motor
            </span>
          )}
        </div>
      )}

      {/* ─── 1. RECEITAS ─── */}
      <SectionHeader title="Receitas" accent="#34d399" />
      <Row
        label="Receita (pós-desconto)"
        value={formatBRL(receitas.bruta)}
        color="#a7f3d0"
        hint="Receita operacional já considerando o desconto aplicado no documento (não é a receita bruta original V₀)."
      />
      {receitas.impostosForaTotal > 0 && (
        <Row
          label="(−) Impostos por fora (IPI, ICMS-ST, DIFAL...)"
          value={`− ${formatBRL(receitas.impostosForaTotal)}`}
          color="#fda4af"
          indent={12}
        />
      )}
      <Row
        label="= Receita operacional líquida"
        value={formatBRL(receitas.liquida)}
        color="#6ee7b7"
      />

      <Divider />

      {/* ─── 2. CUSTOS ─── */}
      <SectionHeader title="Custos" accent="#fcd34d" />
      <Row
        label="Custos líquidos totais"
        value={formatBRL(custos.total)}
        color="#fde68a"
        hint="Soma de (cost_total × quantity) por item. Custos cadastrados em produtos/serviços."
      />

      <Divider />

      {/* ─── 3. DESPESAS (4 buckets) ─── */}
      {/* Quinn S13 review: usar `!== 0` em vez de `> 0` para defender contra
          bucket negativo (ajustes contábeis); previne inconsistência onde
          a linha some mas o valor continua entrando no total. */}
      <SectionHeader title="Despesas Operacionais" accent="#f97316" />
      {despesas.fixas !== 0 && <Row label="Fixas" value={formatBRL(despesas.fixas)} color="#fed7aa" indent={12} />}
      {despesas.variaveis !== 0 && <Row label="Variáveis" value={formatBRL(despesas.variaveis)} color="#fed7aa" indent={12} />}
      {despesas.financeiras !== 0 && <Row label="Financeiras" value={formatBRL(despesas.financeiras)} color="#fed7aa" indent={12} />}
      {despesas.administrativas !== 0 && <Row label="Administrativas" value={formatBRL(despesas.administrativas)} color="#fed7aa" indent={12} />}
      {despesas.mod !== 0 && <Row label="Mão de Obra Direta (MOD)" value={formatBRL(despesas.mod)} color="#fed7aa" indent={12} />}
      <Row label="Total despesas" value={formatBRL(despesas.total)} color="#fb923c" />

      <Divider />

      {/* ─── 4. IMPOSTOS (POR DENTRO / POR FORA separados — R5) ─── */}
      <SectionHeader title="Impostos" accent="#60a5fa" />
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontStyle: 'italic' }}>
        Por dentro (incidem sobre receita operacional):
      </div>
      {impostos.porDentro.length === 0 && (
        <Row label="(sem impostos por dentro cadastrados)" value="—" color="#475569" indent={12} />
      )}
      {impostos.porDentro.map(tax => (
        <Row
          key={`inside-${tax.type}`}
          label={tax.type}
          value={`${formatBRL(tax.amount)}  (${formatPct(tax.effectivePct)}%)`}
          color="#bfdbfe"
          indent={12}
        />
      ))}
      <Row label="Subtotal impostos por dentro" value={formatBRL(impostos.porDentroTotal)} color="#93c5fd" />

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, marginBottom: 4, fontStyle: 'italic' }}>
        Por fora (acrescem ao preço operacional):
      </div>
      {impostos.porForaArr.length === 0 && (
        <Row label="(sem impostos por fora cadastrados)" value="—" color="#475569" indent={12} />
      )}
      {impostos.porForaArr.map(tax => (
        <Row
          key={`outside-${tax.type}`}
          label={tax.type}
          value={`${formatBRL(tax.amount)}  (${formatPct(tax.effectivePct)}%)`}
          color="#bfdbfe"
          indent={12}
        />
      ))}
      <Row label="Subtotal impostos por fora" value={formatBRL(impostos.porForaTotal)} color="#93c5fd" />
      <Row label="Total impostos" value={formatBRL(impostos.total)} color="#60a5fa" />

      <Divider />

      {/* ─── 5. RRO ─── */}
      <SectionHeader title="Resultado Residual Operacional (RRO)" accent="#a78bfa" />
      <Row
        label="RRO consolidado"
        value={`${formatBRL(rro.valor)}  (${formatPct(rro.effectivePct)}% s/ receita)`}
        color="#c4b5fd"
      />

      <Divider />

      {/* ─── 6. DISTRIBUIÇÃO (R$ + % original + % efetivo — R4=c) ─── */}
      <SectionHeader title="Distribuição do RRO" accent="#818cf8" />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(120px, 1.2fr) minmax(100px, 1fr) minmax(180px, 2fr)',
        gap: 4, fontSize: 12, marginTop: 2,
      }}>
        <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rubrica</div>
        <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Valor (R$)</div>
        <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>% original → % sobre venda c/ desc.</div>

        <div style={{ color: '#a5b4fc' }}>Comissão</div>
        <div style={{ textAlign: 'right', color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{formatBRL(distribuicao.commission.amount)}</div>
        <div style={{ textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{formatResidualLine(distribuicao.commission, rro.valor > 0)}</div>

        <div style={{ color: '#a5b4fc' }}>Lucro</div>
        <div style={{ textAlign: 'right', color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{formatBRL(distribuicao.profit.amount)}</div>
        <div style={{ textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{formatResidualLine(distribuicao.profit, rro.valor > 0)}</div>

        {!hidesProfitTaxes && (
          <>
            <div style={{ color: '#a5b4fc' }}>IRPJ</div>
            <div style={{ textAlign: 'right', color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{formatBRL(distribuicao.irpj.amount)}</div>
            <div style={{ textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{formatResidualLine(distribuicao.irpj, rro.valor > 0)}</div>

            <div style={{ color: '#a5b4fc' }}>CSLL</div>
            <div style={{ textAlign: 'right', color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{formatBRL(distribuicao.csll.amount)}</div>
            <div style={{ textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{formatResidualLine(distribuicao.csll, rro.valor > 0)}</div>
          </>
        )}

        <div style={{ color: '#c7d2fe', fontWeight: 700 }}>Total RRO</div>
        <div style={{ textAlign: 'right', color: '#c4b5fd', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(rro.valor)}</div>
        <div style={{ textAlign: 'right', color: '#a78bfa', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
          {formatPct(rro.effectivePct)}% s/ receita
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#64748b', marginTop: 10, fontStyle: 'italic' }}>
        Esta DRE consolida os RRs individuais já calculados por cada produto/serviço.
        O orçamento NÃO recalcula percentuais — apenas agrupa resultados econômicos
        para visão gerencial. Custos e despesas operacionais são preservados;
        comissão, lucro, IRPJ e CSLL são proporcionalmente redistribuídos sobre o RRO.
      </div>
    </div>
  )
}
