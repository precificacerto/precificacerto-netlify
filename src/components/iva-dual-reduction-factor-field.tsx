/**
 * iva-dual-reduction-factor-field.tsx — campo do fator de redução do IVA DUAL.
 *
 * DROP-DOWN FECHADO com as oito faixas da LC 214/2025. Sem opção "Outro", sem
 * digitação livre. A lista vem de `IVA_DUAL_REDUCTION_OPTIONS`, junto com o
 * artigo de cada faixa e as ressalvas que precisam aparecer para o usuário.
 *
 * A CHECK do banco é mais larga que esta lista, em `[0, 100]`, e isso é
 * deliberado — a lista muda com lei nova, a constraint não deveria mudar junto.
 * A TELA RESTRINGE, O BANCO TOLERA. Consequência prática aqui: um produto pode
 * chegar com fator fora da lista, vindo de importação ou de API, e o
 * drop-down precisa MOSTRAR esse valor em vez de fingir que o campo está vazio.
 * É o que `valorForaDaLista` trata.
 *
 * Usado pela tela de produto e pela de serviço. `variant` só muda cor de texto —
 * a tela de serviço é escura, a de produto é clara.
 */
import React from 'react'
import { Select, Tooltip } from 'antd'
import {
  IVA_DUAL_REDUCTION_OPTIONS,
  isOptionPct,
} from '@/utils/iva-dual-reduction-factor'

export interface IvaDualReductionFactorFieldProps {
  /** Percentual inteiro da lista, ou `null` para NÃO CLASSIFICADO. */
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

  // Valor gravado que não está na lista: legítimo (a CHECK aceita [0,100]), raro,
  // e que NÃO pode sumir da tela só por não ser oferecido para escolha.
  const valorForaDaLista = value != null && !isOptionPct(value)

  const selecionada = IVA_DUAL_REDUCTION_OPTIONS.find((o) => o.pct === value)

  return (
    <div>
      <Select
        placeholder="Selecione a faixa de redução"
        value={value}
        onChange={(val) => onChange(val == null ? null : Number(val))}
        style={{ width: inputWidth }}
        allowClear
        optionLabelProp="label"
      >
        {IVA_DUAL_REDUCTION_OPTIONS.map((o) => (
          <Select.Option key={o.pct} value={o.pct} label={`${o.pct}%`}>
            <div>
              <div style={{ fontWeight: 600 }}>{o.label}</div>
              <div style={{ fontSize: 11, color: muted }}>
                {o.artigo ?? 'artigo não confirmado'}
              </div>
            </div>
          </Select.Option>
        ))}
        {valorForaDaLista && (
          <Select.Option key="__fora__" value={value as number} label={`${value}%`}>
            <div>
              <div style={{ fontWeight: 600 }}>{value}% — fora da lista</div>
              <div style={{ fontSize: 11, color: muted }}>valor já gravado</div>
            </div>
          </Select.Option>
        )}
      </Select>

      {value == null && (
        <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
          Não classificado. Zero é diferente de vazio: <strong>0%</strong> é integral, regime
          regular.
        </div>
      )}

      {selecionada?.nota && (
        <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
          <Tooltip title={selecionada.enquadramento}>
            <span>⚠ {selecionada.nota}</span>
          </Tooltip>
        </div>
      )}

      {valorForaDaLista && (
        <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
          Fator <strong>{value}%</strong> não consta nas faixas da LC 214/2025. O banco aceita o
          valor e o cálculo o respeita; ele não está entre as opções oferecidas.
        </div>
      )}

      <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>
        As reduções <strong>não se acumulam</strong>: havendo mais de um benefício, aplica-se o
        de maior hierarquia ou maior redução (art. 7º-A da LC 227/2026).
      </div>
    </div>
  )
}
