import { FC } from 'react'
import type { AdvancedOutsideParams, AdvancedOutsideResult } from '@/utils/icms-st-difal'

/**
 * TaxDecompositionPanel — EPIC-POR-FORA-V3.
 * Apresentação (somente exibição) da decomposição dos tributos avançados "por fora":
 *   - "Auditoria — Decomposição ICMS-ST" (base, MVA, MVA ajustada, base ST, presumido, próprio, ICMS-ST)
 *   - "Resumo Final — DIFAL" (base, alíq. destino/origem, FCP, resultado)
 *
 * NÃO calcula nada — recebe o resultado já computado por `computeAdvancedOutsideTaxes`
 * (fonte única em icms-st-difal.ts). Apenas formata.
 */

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v || 0)
}

function pctFmt(v?: number) {
  return `${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`
}

const panelStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 16,
  background: '#f8fafc',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
}

const titleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 10,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  fontSize: 13,
  color: '#334155',
}

const totalStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 0 0',
  marginTop: 6,
  borderTop: '1px solid #e2e8f0',
  fontSize: 15,
  fontWeight: 800,
  color: '#027A48',
}

interface Props {
  result: AdvancedOutsideResult
  params: AdvancedOutsideParams
}

export const TaxDecompositionPanel: FC<Props> = ({ result, params }) => {
  const { st, difal } = result
  return (
    <>
      {st && params.icmsStActive && (
        <div style={panelStyle}>
          <div style={titleStyle}>Auditoria — Decomposição ICMS-ST</div>
          <div style={rowStyle}><span>Base da operação</span><strong>{fmt(st.bcPropria)}</strong></div>
          <div style={rowStyle}><span>MVA original</span><strong>{pctFmt(params.mvaOriginalPct)}</strong></div>
          <div style={{ ...rowStyle, opacity: params.stDifalInterestadual ? 1 : 0.5 }}>
            <span>MVA ajustada</span><strong>{pctFmt(st.mvaAjustada * 100)}</strong>
          </div>
          <div style={rowStyle}>
            <span>Base ST presumida &times; (1 + {pctFmt(st.mvaAplicada * 100)})</span><strong>{fmt(st.basePresumida)}</strong>
          </div>
          <div style={rowStyle}>
            <span>ICMS presumido &times; {pctFmt(params.icmsAlqInternaDestinoPct)}</span><strong>{fmt(st.icmsPresumido)}</strong>
          </div>
          <div style={rowStyle}>
            <span>ICMS próprio &times; {pctFmt(params.stDifalInterestadual ? params.icmsAlqInterestadualOrigemPct : params.icmsAlqInternaDestinoPct)}</span>
            <strong>{fmt(st.icmsProprio)}</strong>
          </div>
          <div style={totalStyle}><span>ICMS-ST (presumido − próprio)</span><span>{fmt(st.icmsSt)}</span></div>
        </div>
      )}

      {difal && params.difalActive && (
        <div style={panelStyle}>
          <div style={titleStyle}>Resumo Final — DIFAL</div>
          <div style={rowStyle}><span>Base de cálculo</span><strong>{fmt(difal.bc)}</strong></div>
          <div style={rowStyle}><span>Alíquota destino</span><strong>{pctFmt(params.icmsAlqInternaDestinoPct)}</strong></div>
          <div style={rowStyle}><span>Alíquota origem</span><strong>{pctFmt(params.icmsAlqInterestadualOrigemPct)}</strong></div>
          {difal.fcp > 0 && (
            <div style={rowStyle}><span>FCP/FECP (GNRE separado)</span><strong>{fmt(difal.fcp)}</strong></div>
          )}
          <div style={totalStyle}><span>Resultado (DIFAL)</span><span>{fmt(difal.difal)}</span></div>
        </div>
      )}
    </>
  )
}
