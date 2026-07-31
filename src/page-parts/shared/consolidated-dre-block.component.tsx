/**
 * ConsolidatedDREBlock — Bloco de resultado do painel de orçamento/pedido/venda.
 *
 * Relatório v2.0 (item 4.1, 23/06/2026): a "DRE Consolidada" (6 seções —
 * Receitas, Custos, Despesas Operacionais, Atividades Terceirizadas, Impostos,
 * Distribuição do RRO) foi REMOVIDA por ser redundante e menos precisa que a
 * cascata. Este componente agora renderiza SOMENTE a "Memória Cascata"
 * (apuração em etapas do Motor RR — PDF Seção 10 + Excel oficial), que é a
 * fonte de dados correta e NÃO deve ser alterada.
 *
 * A assinatura de props (ConsolidatedDREBlockProps) foi preservada para não
 * quebrar os call sites (orçamento, pedido e venda). Apenas `cascadeTrace` e
 * `totalACobrarComDesconto` continuam tendo efeito; os demais campos são
 * ignorados (mantidos por retrocompatibilidade).
 */

import React from 'react'

import { useDevice } from '@/contexts/device.context'
import { downloadCascadePdf, type CascadePdfMeta } from '@/lib/create-cascade-pdf'
import { formatBRL } from '@/utils/formatters'
import type { DRESection } from '@/utils/consolidated-dre'
import type { CascadeStep } from '@/types/mrm'

// ─────────────── Cascata (Story MRM-V5-005 AC1+AC2 — preservada intacta) ───────────────

/**
 * V10 (ADR-011): renderiza row de step (pai ou child). Indent + cor diferenciam children.
 * Peso opcional aparece apenas em sub-itens do step 12 (redistribuição).
 */
function CascadeRow({
  step,
  isChild = false,
  showStepNumber = true,
  hideRate = false,
}: {
  step: CascadeStep
  isChild?: boolean
  showStepNumber?: boolean
  /** V15.2 (2026-05-25): oculta % nos children de despesas (step 10) — Founder request. */
  hideRate?: boolean
}) {
  const labelColor = isChild ? '#94a3b8' : '#cbd5e1'
  const indent = isChild ? '└─ ' : ''
  const fontWeight = isChild ? 400 : 600
  const pesoText =
    step.peso != null
      ? `peso ${step.peso.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
      : ''
  return (
    <>
      <div style={{ fontVariantNumeric: 'tabular-nums', color: isChild ? '#64748b' : '#a5b4fc' }}>
        {showStepNumber && !isChild ? step.step : ''}
      </div>
      <div title={step.formula} style={{ color: labelColor, fontWeight, paddingLeft: isChild ? 12 : 0 }}>
        {indent}
        {step.label}
        {step.effective_rate_pct != null && (
          <span style={{ color: '#4ade80', fontSize: 10, marginLeft: 6, fontWeight: 600 }}>
            efetiva {(step.effective_rate_pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%
          </span>
        )}
        {pesoText && <span style={{ color: '#64748b', fontSize: 10, marginLeft: 6 }}>({pesoText})</span>}
      </div>
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: labelColor }}>
        {step.base != null ? formatBRL(step.base) : '—'}
      </div>
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: labelColor }}>
        {hideRate
          ? '—'
          : step.rate != null
            ? `${(step.rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: step.step === 11 ? 5 : 4 })}%`
            : '—'}
      </div>
      <div
        style={{
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          color: step.amount < 0 ? '#fca5a5' : labelColor,
          fontWeight,
        }}
      >
        {step.display_kind === 'count'
          ? `${step.amount} produto${step.amount === 1 ? '' : 's'}`
          : formatBRL(step.amount)}
      </div>
    </>
  )
}

/**
 * Mobile (DM2, ≤639px): renderiza um step como bloco vertical (cartão) em vez de
 * linha de grid. Children aparecem como sub-blocos indentados. `hideRate` oculta
 * a linha de Alíquota. Reaproveita os mesmos dados/formatadores do grid desktop.
 */
function CascadeMobileItem({
  step,
  isChild = false,
  hideRate = false,
}: {
  step: CascadeStep
  isChild?: boolean
  hideRate?: boolean
}) {
  const labelColor = isChild ? '#94a3b8' : '#cbd5e1'
  const valueColor = step.amount < 0 ? '#fca5a5' : labelColor
  const pesoText =
    step.peso != null
      ? `peso ${step.peso.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
      : ''
  return (
    <div
      style={{
        marginLeft: isChild ? 12 : 0,
        marginTop: isChild ? 6 : 0,
        padding: isChild ? '6px 8px' : '8px 10px',
        background: isChild ? 'rgba(99,102,241,0.04)' : 'rgba(99,102,241,0.08)',
        border: `1px solid ${isChild ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.20)'}`,
        borderRadius: 5,
        borderLeft: isChild ? '2px solid rgba(99,102,241,0.30)' : undefined,
      }}
    >
      {/* Cabeçalho do bloco: #step + nome da etapa */}
      <div
        title={step.formula}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          fontWeight: isChild ? 500 : 700,
          fontSize: isChild ? 11 : 12,
          color: isChild ? '#cbd5e1' : '#e2e8f0',
          marginBottom: 4,
        }}
      >
        {!isChild && (
          <span style={{ color: '#a5b4fc', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
            #{step.step}
          </span>
        )}
        <span>
          {isChild ? '└─ ' : ''}
          {step.label}
        </span>
        {step.effective_rate_pct != null && (
          <span style={{ color: '#4ade80', fontSize: 10, fontWeight: 600 }}>
            efetiva {(step.effective_rate_pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%
          </span>
        )}
        {pesoText && <span style={{ color: '#64748b', fontSize: 10 }}>({pesoText})</span>}
      </div>
      {/* Linhas rotuladas: Base · Alíquota (se não hideRate) · Valor */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px', fontSize: 11 }}>
        <span style={{ color: '#64748b' }}>
          Base:{' '}
          <span style={{ color: labelColor, fontVariantNumeric: 'tabular-nums' }}>
            {step.base != null ? formatBRL(step.base) : '—'}
          </span>
        </span>
        {!hideRate && (
          <span style={{ color: '#64748b' }}>
            Alíquota:{' '}
            <span style={{ color: labelColor, fontVariantNumeric: 'tabular-nums' }}>
              {step.rate != null
                ? `${(step.rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: step.step === 11 ? 5 : 4 })}%`
                : '—'}
            </span>
          </span>
        )}
        <span style={{ color: '#64748b' }}>
          Valor:{' '}
          <span style={{ color: valueColor, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {step.display_kind === 'count'
              ? `${step.amount} produto${step.amount === 1 ? '' : 's'}`
              : formatBRL(step.amount)}
          </span>
        </span>
      </div>
      {/* Children como sub-blocos indentados; hideRate herda regra do step 10 (despesas) */}
      {step.children?.map((child, idx) => (
        <CascadeMobileItem
          key={`mstep-${step.step}-child-${idx}-${child.source}`}
          step={child}
          isChild
          hideRate={step.step === 10}
        />
      ))}
    </div>
  )
}

/**
 * Ajuste de DISPLAY (pedido do usuário, 19/06/2026): a linha "Venda Consolidada
 * pós-desconto" da Etapa 11 deve refletir o TOTAL A COBRAR pós-desconto — o valor que
 * o cliente efetivamente paga, já com os tributos por fora — e não a base distribuível
 * do motor (restante + desp). Recebe `totalACobrar` da fiação lateral da página (mesmo
 * número exibido em "Total a cobrar"). Reescreve SÓ os children EXIBIDOS do step 11;
 * NÃO toca amount/rate do step pai nem o "Restante distribuível" (que casa com as
 * Etapas 12/13 e alimenta o RRO/oráculos). A diferença (tributos por fora + Desp.
 * Acessória fixa + arredondamento cascata↔lateral) é isolada numa linha de dedução
 * agregada, para a sub-árvore fechar exatamente: TotalACobrar − dedução = Restante.
 */
function applyTotalACobrarToStep11(
  trace: CascadeStep[],
  totalACobrar: number,
  manualTotal?: number,
  despAcessoriasTotal?: number,
): CascadeStep[] {
  if (!(totalACobrar > 0)) return trace
  return trace.map((step) => {
    if (step.step !== 11 || !step.children?.length) return step
    const restChild = step.children.find((c) => (c.label ?? '').toLowerCase().includes('restante distribu'))
    if (!restChild) return step
    const restante = restChild.amount
    const naoDistribuivel = totalACobrar - restante

    const vendaConsolidadaRow: CascadeStep = {
      step: 11,
      label: 'Venda Consolidada pós-desconto (Total a cobrar)',
      base: null,
      rate: null,
      amount: totalACobrar,
      formula: 'Total a cobrar do cliente pós-desconto (inclui tributos por fora)',
      source: 'TOTAL_A_COBRAR',
    }

    // Spec Felipe (31/07/2026): duas linhas SEPARADAS quando pelo menos um total é fornecido.
    // Os tributos por fora (IBS/CBS/IS/IPI) NUNCA entram aqui — pertencem às Etapas 13/17.
    const manual = Number(manualTotal) || 0
    const desp = Number(despAcessoriasTotal) || 0
    const hasSeparate = manual > 0 || desp > 0
    if (hasSeparate) {
      // Fechamento: manual + desp deve == naoDistribuivel (validado no motor). Diferença de
      // arredondamento (<R$ 1) é absorvida na última linha exibida; divergência grande → fallback.
      const diff = naoDistribuivel - (manual + desp)
      if (Math.abs(diff) < 1) {
        let manualAdj = manual
        let despAdj = desp
        if (desp > 0) despAdj = desp + diff
        else manualAdj = manual + diff
        const deductionRows: CascadeStep[] = []
        if (manual > 0) {
          deductionRows.push({
            step: 11,
            label: '(−) Produtos inseridos manualmente',
            base: null,
            rate: null,
            amount: -manualAdj,
            formula: 'Produtos inseridos manualmente (repasse puro, imunes ao desconto)',
            source: 'TOTAL_A_COBRAR',
          })
        }
        if (desp > 0) {
          deductionRows.push({
            step: 11,
            label: '(−) Despesas acessórias',
            base: null,
            rate: null,
            amount: -despAdj,
            formula: 'Despesas acessórias fixas (frete + seguro + acessórias, imunes ao desconto)',
            source: 'TOTAL_A_COBRAR',
          })
        }
        return { ...step, children: [vendaConsolidadaRow, ...deductionRows, restChild] }
      }
      // Divergência grande → não inventar: cai no fallback agregado abaixo.
    }

    // Fallback agregado (nenhum total fornecido OU divergência > R$ 1): comportamento anterior.
    return {
      ...step,
      children: [
        vendaConsolidadaRow,
        {
          step: 11,
          // Rel. 30/07 desktop #8: nomenclatura corrigida. Esta dedução agregada representa
          // os produtos inseridos manualmente (repasse puro, imunes ao desconto) somados às
          // Desp. Acessórias fixas — ambos valores estáticos, não distribuíveis.
          label: '(−) Produtos inseridos manualmente + Desp. Acessórias (não distribuíveis)',
          base: null,
          rate: null,
          amount: -naoDistribuivel,
          formula: 'Total a cobrar − Restante distribuível',
          source: 'TOTAL_A_COBRAR',
        },
        restChild,
      ],
    }
  })
}

function CascadeExpander({ trace, marginTop = 8, pdfMeta }: { trace: CascadeStep[]; marginTop?: number; pdfMeta?: CascadePdfMeta }) {
  const { isMobile } = useDevice()

  if (trace.length === 0) return null

  return (
    <details
      style={{
        marginTop,
        padding: '8px 12px',
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.20)',
        borderRadius: 6,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 700,
          color: '#a5b4fc',
          textTransform: 'uppercase',
          letterSpacing: 1,
          padding: '4px 0',
        }}
        aria-label="Expandir memória cascata"
      >
        {/* Adendo Seção 31-A (item 3): título sem sufixo técnico. Origem: PDF Motor RR Seção 10 + Excel oficial. */}
        📋 Memória cascata
      </summary>
      {isMobile ? (
        /* DM2 mobile (≤639px): blocos verticais por etapa — grid de 5 colunas vira ilegível */
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trace.map((step) => (
            <CascadeMobileItem key={`mstep-${step.step}-${step.source}`} step={step} />
          ))}
        </div>
      ) : (
        <div
          style={{
            marginTop: 8,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto auto auto',
            gap: '4px 12px',
            fontSize: 11,
            color: '#94a3b8',
          }}
        >
          <div style={{ fontWeight: 700, color: '#c7d2fe' }}>#</div>
          <div style={{ fontWeight: 700, color: '#c7d2fe' }}>Etapa</div>
          <div style={{ fontWeight: 700, color: '#c7d2fe', textAlign: 'right' }}>Base (R$)</div>
          <div style={{ fontWeight: 700, color: '#c7d2fe', textAlign: 'right' }}>Alíquota</div>
          <div style={{ fontWeight: 700, color: '#c7d2fe', textAlign: 'right' }}>Valor (R$)</div>
          {trace.map((step) => (
            <React.Fragment key={`step-${step.step}-${step.source}`}>
              <CascadeRow step={step} />
              {/* V10 (ADR-011): renderiza children como sub-itens indentados */}
              {/* V15.2 (2026-05-25): oculta % nos children do step 10 (despesas) — Founder request */}
              {step.children?.map((child, idx) => (
                <CascadeRow
                  key={`step-${step.step}-child-${idx}-${child.source}`}
                  step={child}
                  isChild
                  showStepNumber={false}
                  hideRate={step.step === 10}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
      {/* Adendo Seção 31-A (item 3): referência técnica (PDF Motor RR Seção 10 + Excel oficial
          `Motor de descontos do resultado residual operacional.xlsx`) mantida apenas em comentário,
          fora da interface do usuário. */}
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
        Sub-itens em cinza detalham cada componente.
      </div>
      {/* PC-FEAT-CASCADE-PDF-001: botão de exportação no RODAPÉ, alinhado à DIREITA, após a Etapa 17. */}
      {pdfMeta && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            type="button"
            onClick={() => downloadCascadePdf(trace, pdfMeta)}
            style={{
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: '#6366f1',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
            }}
            aria-label="Gerar PDF da memória cascata"
          >
            📄 Gerar PDF
          </button>
        </div>
      )}
    </details>
  )
}

export interface ConsolidatedDREBlockProps {
  /** Mantido por retrocompatibilidade — não é mais renderizado (item 4.1). */
  dre: DRESection
  /** Espaçamento superior em px (default: 8). */
  marginTop?: number
  /** Mantido por retrocompatibilidade — sem efeito (item 4.1). */
  hideTitle?: boolean
  /**
   * Memória cascata (PDF Motor RR Seção 10). 13 etapas (V16) ou 17 etapas (V17).
   * Quando presente e válida, renderiza o expansível (default fechado).
   */
  cascadeTrace?: CascadeStep[] | null
  /** Mantido por retrocompatibilidade — sem efeito (item 4.1). */
  pesoOpInterna?: number | null
  /** Mantido por retrocompatibilidade — sem efeito (item 4.1). */
  ancoraInterna?: number | null
  /**
   * Display (19/06/2026): total a cobrar pós-desconto (fiação lateral da página).
   * Quando > 0, a Etapa 11 da cascata exibe esse valor na linha "Venda
   * Consolidada pós-desconto". Default null → cascata exibida sem ajuste.
   */
  totalACobrarComDesconto?: number | null
  /**
   * Spec Felipe (31/07/2026): total dos PRODUTOS INSERIDOS MANUALMENTE (repasse puro,
   * imune ao desconto). Quando fornecido (junto com `totalACobrarComDesconto`), a dedução da
   * Etapa 11 é exibida em linha própria "(−) Produtos inseridos manualmente". Fiação lateral
   * da página (Σ unit_price × quantity dos itens manuais). Default undefined → linha agregada.
   */
  manualTotal?: number
  /**
   * Spec Felipe (31/07/2026): total das DESPESAS ACESSÓRIAS fixas (frete + seguro + acessórias),
   * imunes ao desconto. Quando fornecido, a dedução da Etapa 11 exibe linha própria
   * "(−) Despesas acessórias". Fiação lateral da página. Default undefined → linha agregada.
   */
  despAcessoriasTotal?: number
  /**
   * PC-FEAT-CASCADE-PDF-001: metadados do orçamento para o botão "Gerar PDF" no rodapé da
   * cascata. Quando presente, exibe o botão (após a Etapa 17). Opcional — pedido/venda podem
   * omitir e o botão não aparece.
   */
  pdfMeta?: CascadePdfMeta
}

/**
 * Renderiza apenas a Memória Cascata (item 4.1). Os demais campos de props são
 * aceitos para retrocompatibilidade dos call sites, mas não têm efeito visual.
 */
export function ConsolidatedDREBlock(props: ConsolidatedDREBlockProps) {
  const { cascadeTrace = null, totalACobrarComDesconto = null, manualTotal, despAcessoriasTotal, marginTop = 8, pdfMeta } = props

  // Display (19/06/2026): ajusta a linha "Venda Consolidada pós-desconto" (Etapa 11)
  // para refletir o Total a cobrar pós-desconto. Puramente visual — não altera o motor.
  // Spec Felipe (31/07/2026): quando manual/desp acessórias são fornecidos, a dedução vira
  // DUAS linhas separadas (senão mantém a linha agregada — fallback).
  const cascadeTraceForDisplay =
    cascadeTrace && totalACobrarComDesconto != null && totalACobrarComDesconto > 0
      ? applyTotalACobrarToStep11(cascadeTrace, totalACobrarComDesconto, manualTotal, despAcessoriasTotal)
      : cascadeTrace

  // REGRA DE INVIOLABILIDADE (doc Cascata RT 14/07, Seção 6): a Memória Cascata deve
  // renderizar para QUALQUER trace válido (não-vazio), independentemente da contagem de
  // etapas — 13 (V16 legado), 17 (V17), 18/19 (V17 + RT), etc. O guard anterior travava
  // em `13 || 17` e sumia silenciosamente quando o RT adicionava etapa(s) (18) — bug
  // BUG-CASCATA-RT-AUSENTE-001. NUNCA falhar silenciosamente por variação de configuração.
  if (!cascadeTraceForDisplay || cascadeTraceForDisplay.length === 0) {
    return null
  }

  return <CascadeExpander trace={cascadeTraceForDisplay} marginTop={marginTop} pdfMeta={pdfMeta} />
}
