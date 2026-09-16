/**
 * ConsolidatedDREBlock — Bloco de resultado do painel de orçamento/pedido/venda.
 *
 * Relatório v2.0 (item 4.1, 23/06/2026): a "DRE Consolidada" (6 seções —
 * Receitas, Custos, Despesas Operacionais, Atividades Terceirizadas, Impostos,
 * Distribuição do RRO) foi REMOVIDA por ser redundante e menos precisa que a
 * cascata. Este componente agora renderiza SOMENTE a "Decomposição"
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
import { downloadCascadePdf, downloadDecompositionPdf, type CascadePdfMeta } from '@/lib/create-cascade-pdf'
import { orderCascadeForDisplay } from '@/utils/cascade-display-order'
import { buildCascadeView, type CascadeViewRow } from '@/utils/cascade-display-view'
import type { DecompositionResult } from '@/utils/decomposition-dre'
import { totalExibido } from '@/utils/decomposition-dre'
import { formatBRL } from '@/utils/formatters'
import { DECOMPOSITION_LABEL } from '@/constants/decomposition-label'
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
/**
 * Insere a hierarquia da Etapa 11 (Venda Consolidada pós-desconto, menos o que não é
 * distribuível) no trace.
 *
 * EXPORTADA PARA TESTE porque ela é INERTE contra um trace de 13 etapas: procura um `step 11`
 * com filho "Restante distribuível", e esse filho só existe na Camada 2 do V17. Enquanto o
 * gravador produzia 13 etapas, as props `totalACobrarComDesconto` e `manualTotal` chegavam ao
 * bloco e não mudavam nada — e o teste que existia afirmava só que elas CHEGAVAM. Afirmar
 * passagem não é afirmar efeito; o teste agora exerce a função contra o trace que o gravador
 * de fato produz.
 */
export function applyTotalACobrarToStep11(
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

/**
 * Uma linha da VISÃO da cascata — construção numerada ou decomposição rotulada.
 *
 * `numero` nulo é a linha da decomposição, e a coluna `#` fica vazia: a R19 tem 21 linhas e o
 * trace tem 6 da etapa 12 em diante, então qualquer número aqui seria inventado. Rótulo sem
 * número é melhor que número que mente.
 */
function CascadeViewLine({ row, colunas }: { row: CascadeViewRow; colunas: number }) {
  const labelColor = row.isChild ? '#94a3b8' : row.isSubtotal ? '#c7d2fe' : '#cbd5e1'
  // Tipografia: rótulo principal em BOLD; tributo em fonte MENOR, como os sub-itens da
  // construção. É a hierarquia da R19 aparecendo na leitura.
  const fontWeight = row.isChild ? 400 : row.isSubtotal ? 700 : 700
  const fontSize = row.isChild ? 10 : undefined
  const pesoText =
    row.peso != null
      ? `peso ${row.peso.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
      : ''
  return (
    <>
      <div style={{ fontVariantNumeric: 'tabular-nums', color: row.isChild ? '#64748b' : '#a5b4fc' }}>
        {row.numero ?? ''}
      </div>
      <div title={row.formula} style={{ color: labelColor, fontWeight, fontSize, paddingLeft: row.isChild ? 12 : 0 }}>
        {row.isChild ? '└─ ' : ''}
        {row.label}
        {row.effectiveRatePct != null && (
          <span style={{ color: '#4ade80', fontSize: 10, marginLeft: 6, fontWeight: 600 }}>
            efetiva {(row.effectiveRatePct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%
          </span>
        )}
      </div>
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize }}>
        {row.base != null ? formatBRL(row.base) : '—'}
      </div>
      {/* OS DOIS PERCENTUAIS, quando eles respondem perguntas diferentes: o peso sobre o RRO
          ("quanto desta sobra é comissão") e o percentual sobre o total geral ("quanto do
          preço é comissão"), que é o que bate com o CADASTRADO. Ver
          `LINHAS_COM_DOIS_PERCENTUAIS`. */}
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize }}>
        {row.pct != null
          ? `${(row.pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%${row.isDerivedAverage ? ' (% médio)' : ''}`
          : pesoText || '—'}
        {row.pctSobreTotalGeral != null && (
          <div style={{ fontSize: 9, color: '#86efac', fontWeight: 600 }}>
            {(row.pctSobreTotalGeral * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}% do total
          </div>
        )}
      </div>
      {/* Uma coluna POR PRODUTO. A etapa da construção não tem abertura por item — o
          `cascade_trace` é consolidado —, e ali sai TRAVESSÃO, nunca R$ 0,00: zero afirmaria
          que aquele produto não tem custo (`.claude/rules/ausente-vs-falso.md`). */}
      {Array.from({ length: colunas }, (_, k) => (
        <div key={`c-${k}`} style={{
          textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize,
          color: row.perItem[k] != null && row.perItem[k] < 0 ? '#fca5a5' : labelColor, fontWeight,
        }}>
          {row.perItem[k] != null ? formatBRL(row.perItem[k]) : '—'}
          {/* A BASE e a ALÍQUOTA DAQUELE item, quando a linha as tem. O percentual da coluna
              da esquerda é do DOCUMENTO e, com produtos heterogêneos, é média ponderada
              derivada — na NF-e cada item tem o seu `vBC` e o seu `pICMS`, e média não
              existe lá. Onde não se aplica, nada é exibido: `R$ 0,00` de base afirmaria que
              o item não tem base de cálculo (`ausente-vs-falso.md`). */}
          {row.basePerItem[k] != null && (
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 400 }}>
              base {formatBRL(row.basePerItem[k])}
            </div>
          )}
          {row.pctPerItem[k] != null && (
            <div style={{ fontSize: 9, color: '#86efac', fontWeight: 600 }}>
              {(row.pctPerItem[k] * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%
            </div>
          )}
          {/* R13 — o componente do ACRÉSCIMO. Ele NÃO está no valor acima: o de cima é o do
              DRE — o acréscimo é repasse e sai inteiro —, e este é o que vai na nota. Somá-lo
              ao DRE obrigaria a inflar a receita bruta na mesma medida, e a instrução foi
              não mudar base nenhuma. */}
          {row.acrescimoPerItem[k] != null && row.baseAcrescimoPerItem[k] != null && (
            <div style={{ fontSize: 9, color: '#fbbf24', fontWeight: 500 }}>
              + frete {formatBRL(row.acrescimoPerItem[k])}
              <div style={{ fontWeight: 700 }}>
                = fiscal {formatBRL(Math.abs(row.perItem[k]) + row.acrescimoPerItem[k])}
              </div>
              <div style={{ color: '#64748b', fontWeight: 400 }}>
                base fiscal {formatBRL((row.basePerItem[k] ?? 0) + row.baseAcrescimoPerItem[k])}
              </div>
            </div>
          )}
        </div>
      ))}
      {/* A NF-e VALIDA que a soma dos itens é igual ao total. Com o total calculado à parte e
          cada coluna arredondada na formatação, os dois divergiam em centavos — medido: sete
          linhas com R$ 0,01 num documento de três produtos. O número INTERNO segue exato; o
          impresso é a soma das colunas. Ver `totalExibido`. */}
      <div style={{
        textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize,
        color: row.valor < 0 ? '#fca5a5' : labelColor, fontWeight,
      }}>
        {formatBRL(totalExibido({ perItem: row.perItem, total: row.valor }))}
      </div>
    </>
  )
}

/** Mesma linha, em bloco vertical — o grid de 5 colunas fica ilegível abaixo de 640px. */
function CascadeViewMobileLine({ row, itemLabels }: { row: CascadeViewRow; itemLabels: string[] }) {
  return (
    <div style={{
      marginLeft: row.isChild ? 12 : 0,
      padding: row.isChild ? '6px 8px' : '8px 10px',
      background: row.isSubtotal ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.02)',
      borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: row.isSubtotal ? '#c7d2fe' : '#cbd5e1', fontWeight: row.isSubtotal ? 700 : 600, fontSize: 12 }}>
          {row.numero != null ? `${row.numero}. ` : ''}{row.label}
        </span>
        <span style={{ color: row.valor < 0 ? '#fca5a5' : '#cbd5e1', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
          {formatBRL(totalExibido({ perItem: row.perItem, total: row.valor }))}
        </span>
      </div>
      {row.perItem.length > 0 && (
        <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>
          {row.perItem.map((v, k) => `${itemLabels[k] ?? `P${k + 1}`}: ${formatBRL(v)}`).join('  ·  ')}
        </div>
      )}
      <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
        {row.base != null ? `base ${formatBRL(row.base)}` : ''}
        {row.pct != null
          ? `${row.base != null ? ' · ' : ''}${(row.pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%${row.isDerivedAverage ? ' (% médio)' : ''}`
          : ''}
      </div>
    </div>
  )
}

function CascadeExpander({ trace: traceBruto, marginTop = 8, pdfMeta, decomposition, itemLabels = [] }: { trace: CascadeStep[]; marginTop?: number; pdfMeta?: CascadePdfMeta; decomposition?: DecompositionResult | null; itemLabels?: string[] }) {
  const { isMobile } = useDevice()

  // R19 — a ordem das deduções: repasse, POR FORA, por dentro, custos/despesas/RT, RRO. O
  // detalhamento dos tributos por fora era exibido no FIM, depois do RRO, embora o valor
  // deles seja apurado na Etapa 12. `orderCascadeForDisplay` o move para junto de onde ele
  // nasce; nenhum valor muda, porque a CONTA já obedecia à ordem — ver o cabeçalho do módulo.
  const trace = orderCascadeForDisplay(traceBruto)

  // R19 — da etapa 12 em diante a cascata passa a exibir as linhas da DECOMPOSIÇÃO, uma por
  // dedução: IBS, CBS, IS e IPI são QUATRO; ICMS, ISS e PIS/COFINS são TRÊS. Sem ela (pedido
  // e venda, que ainda não a montam), segue o trace inteiro, como sempre foi.
  const view = buildCascadeView(trace, decomposition)
  // Só há coluna por produto quando a decomposição governa: o `cascade_trace` sozinho é
  // consolidado, e inventar colunas para ele seria exibir rateio como se fosse apuração.
  const colunas = decomposition && decomposition.rows.length > 0 ? itemLabels.length : 0

  if (view.length === 0) return null

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
        aria-label="Expandir decomposição"
      >
        {/* Adendo Seção 31-A (item 3): título sem sufixo técnico. Origem: PDF Motor RR Seção 10 + Excel oficial.
            RENOMEAÇÃO (relatório, seção 6.5): "Memória Cascata" → "Decomposição". O rótulo sai
            de `DECOMPOSITION_LABEL`, e não de um literal aqui, porque um rótulo espalhado é o
            que faz uma renomeação pegar dois dos três lugares. */}
        📋 {DECOMPOSITION_LABEL}
      </summary>
      {isMobile ? (
        /* DM2 mobile (≤639px): blocos verticais por etapa — grid de 5 colunas vira ilegível */
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {view.map((row) => (
            <CascadeViewMobileLine key={`m-${row.key}`} row={row} itemLabels={itemLabels} />
          ))}
        </div>
      ) : (
        <div
          style={{
            marginTop: 8,
            display: 'grid',
            gridTemplateColumns: `auto 1fr auto auto ${'auto '.repeat(colunas)}auto`,
            gap: '4px 12px',
            fontSize: 11,
            color: '#94a3b8',
          }}
        >
          <div style={{ fontWeight: 700, color: '#c7d2fe' }}>#</div>
          <div style={{ fontWeight: 700, color: '#c7d2fe' }}>Etapa</div>
          <div style={{ fontWeight: 700, color: '#c7d2fe', textAlign: 'right' }}>Base (R$)</div>
          <div style={{ fontWeight: 700, color: '#c7d2fe', textAlign: 'right' }}>Alíquota</div>
          {Array.from({ length: colunas }, (_, k) => (
            <div key={`h-${k}`} style={{ fontWeight: 700, color: '#c7d2fe', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {itemLabels[k] ?? `Produto ${k + 1}`}
            </div>
          ))}
          <div style={{ fontWeight: 700, color: '#c7d2fe', textAlign: 'right' }}>Total (R$)</div>
          {/* V10 (ADR-011): os children viram linhas próprias, indentadas — e da etapa 12 em
              diante as linhas são as da R19, uma por dedução. `buildCascadeView` decide. */}
          {view.map((row) => (
            <React.Fragment key={row.key}>
              <CascadeViewLine row={row} colunas={colunas} />
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
      {/* O INVARIANTE DO RRO — o apurado por subtração contra o que a construção reservou.
          O RESIDUAL não cobre isto: ele fecha por construção, distribuindo o RRO inteiro seja
          ele qual for, e foi assim que um CMV zerado inflou a conta em silêncio. */}
      {decomposition?.rro?.foraDeZero && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 11,
          background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5',
        }}>
          ⚠ O RRO apurado ({formatBRL(decomposition.rro.apurado)}) não bate com o reservado pela
          construção ({formatBRL(decomposition.rro.esperado)}) — diferença de{' '}
          {formatBRL(decomposition.rro.divergencia)}. Há valor sem dedução correspondente, e a
          distribuição abaixo está inflada na mesma medida.
        </div>
      )}

      {/* PC-FEAT-CASCADE-PDF-001: botão de exportação no RODAPÉ, alinhado à DIREITA, após a Etapa 17. */}
      {pdfMeta && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            type="button"
            onClick={() => (
              // O PDF sai em COLUNAS — uma por produto —, que é o formato que a decomposição
              // pede no papel. A tela fica com as ETAPAS, que é o rastro do motor: são duas
              // LEITURAS do mesmo cálculo, não dois cálculos. Sem decomposição montada (tela
              // que ainda não a passa), cai no PDF das etapas em vez de não gerar nada.
              pdfMeta.decomposition
                ? downloadDecompositionPdf(pdfMeta)
                : downloadCascadePdf(trace, pdfMeta)
            )}
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
            aria-label="Gerar PDF da decomposição"
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
  /**
   * R19 — a DECOMPOSIÇÃO do documento. Quando presente, ela substitui as etapas da 12 em
   * diante por uma linha POR DEDUÇÃO. Ausente = a cascata segue inteira, como sempre foi.
   */
  decomposition?: DecompositionResult | null
  /** Rótulo de cada coluna de produto, paralelo a `perItem`. */
  itemLabels?: string[]
}

/**
 * Renderiza apenas a Decomposição (item 4.1). Os demais campos de props são
 * aceitos para retrocompatibilidade dos call sites, mas não têm efeito visual.
 */
export function ConsolidatedDREBlock(props: ConsolidatedDREBlockProps) {
  const { cascadeTrace = null, totalACobrarComDesconto = null, manualTotal, despAcessoriasTotal, marginTop = 8, pdfMeta, decomposition, itemLabels } = props

  // Display (19/06/2026): ajusta a linha "Venda Consolidada pós-desconto" (Etapa 11)
  // para refletir o Total a cobrar pós-desconto. Puramente visual — não altera o motor.
  // Spec Felipe (31/07/2026): quando manual/desp acessórias são fornecidos, a dedução vira
  // DUAS linhas separadas (senão mantém a linha agregada — fallback).
  const cascadeTraceForDisplay =
    cascadeTrace && totalACobrarComDesconto != null && totalACobrarComDesconto > 0
      ? applyTotalACobrarToStep11(cascadeTrace, totalACobrarComDesconto, manualTotal, despAcessoriasTotal)
      : cascadeTrace

  // REGRA DE INVIOLABILIDADE (doc Cascata RT 14/07, Seção 6): a Decomposição deve
  // renderizar para QUALQUER trace válido (não-vazio), independentemente da contagem de
  // etapas — 13 (V16 legado), 17 (V17), 18/19 (V17 + RT), etc. O guard anterior travava
  // em `13 || 17` e sumia silenciosamente quando o RT adicionava etapa(s) (18) — bug
  // BUG-CASCATA-RT-AUSENTE-001. NUNCA falhar silenciosamente por variação de configuração.
  if (!cascadeTraceForDisplay || cascadeTraceForDisplay.length === 0) {
    return null
  }

  return <CascadeExpander trace={cascadeTraceForDisplay} marginTop={marginTop} pdfMeta={pdfMeta} decomposition={decomposition} itemLabels={itemLabels} />
}
