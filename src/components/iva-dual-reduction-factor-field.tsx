/**
 * iva-dual-reduction-factor-field.tsx — campo do fator de redução do IVA DUAL.
 *
 * CAMPO LIVRE com ATALHO, não seletor fechado. O `InputNumber` aceita qualquer
 * inteiro em [0, 100] — 45 e 27 são válidos — e os chips apenas preenchem valores
 * frequentes. A tela antiga era um `Select` com sete opções fixas, que era o que
 * impediria 45 amanhã, e que não tinha o `0`.
 *
 * Os quatro atalhos da LC 214/2025 aparecem marcados; 40, 70 e 80 ficam sem
 * enquadramento nomeado, porque não têm um.
 *
 * Usado pela tela de produto e pela de serviço. `variant` só muda cor de texto —
 * a tela de serviço é escura, a de produto é clara.
 */
import React from 'react'
import { InputNumber, Tooltip } from 'antd'
import {
  IVA_DUAL_REDUCTION_SHORTCUTS,
  IVA_DUAL_REDUCTION_MAX_PCT,
  IVA_DUAL_REDUCTION_MIN_PCT,
} from '@/utils/iva-dual-reduction-factor'

export interface IvaDualReductionFactorFieldProps {
  /** Percentual inteiro em [0, 100], ou `null` para NÃO CLASSIFICADO. */
  value: number | null
  onChange: (value: number | null) => void
  variant?: 'light' | 'dark'
  inputWidth?: number | string
}

export default function IvaDualReductionFactorField({
  value,
  onChange,
  variant = 'light',
  inputWidth = 220,
}: IvaDualReductionFactorFieldProps) {
  const muted = variant === 'dark' ? '#94a3b8' : '#64748b'
  const chipBg = variant === 'dark' ? 'rgba(255,255,255,0.06)' : '#f1f5f9'
  const chipBgAtivo = variant === 'dark' ? 'rgba(46,144,250,0.28)' : '#dbeafe'
  const chipBorda = variant === 'dark' ? 'rgba(255,255,255,0.12)' : '#e2e8f0'
  const chipTexto = variant === 'dark' ? '#e2e8f0' : '#334155'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <InputNumber
          value={value}
          onChange={(v) => onChange(v == null ? null : Number(v))}
          min={IVA_DUAL_REDUCTION_MIN_PCT}
          max={IVA_DUAL_REDUCTION_MAX_PCT}
          precision={0}
          step={1}
          style={{ width: inputWidth }}
          placeholder="Fator (%) — vazio = não classificado"
          addonAfter="%"
        />
        {value == null && (
          <span style={{ fontSize: 11, color: muted }}>
            Não classificado. Zero é diferente de vazio: <strong>0%</strong> é integral, regime
            regular.
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {IVA_DUAL_REDUCTION_SHORTCUTS.map((atalho) => {
          const ativo = value === atalho.pct
          const chip = (
            <button
              key={atalho.pct}
              type="button"
              onClick={() => onChange(atalho.pct)}
              style={{
                cursor: 'pointer',
                fontSize: 11,
                lineHeight: '18px',
                padding: '1px 9px',
                borderRadius: 999,
                border: `1px solid ${ativo ? 'rgba(46,144,250,0.6)' : chipBorda}`,
                background: ativo ? chipBgAtivo : chipBg,
                color: chipTexto,
                fontWeight: ativo ? 700 : 500,
              }}
            >
              {atalho.label}
              {atalho.lc214 && (
                <span style={{ marginLeft: 5, fontSize: 9, color: muted }}>LC 214</span>
              )}
            </button>
          )
          return atalho.enquadramento ? (
            <Tooltip key={atalho.pct} title={atalho.enquadramento}>
              {chip}
            </Tooltip>
          ) : (
            <Tooltip key={atalho.pct} title="Sem enquadramento nomeado na LC 214/2025">
              {chip}
            </Tooltip>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>
        Os atalhos são sugestão, não limite: qualquer inteiro de 0 a 100 é aceito.
      </div>
    </div>
  )
}
