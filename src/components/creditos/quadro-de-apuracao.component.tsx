/**
 * quadro-de-apuracao.component.tsx — débito − crédito − saldo credor, por tributo e por mês.
 *
 * Comando do PO de 21/09/2026, §5 e §6:
 *
 *   > Quadro de apuração, por tributo e por mês, **ao lado do DRE (não é linha do DRE)**.
 *   > Crédito NUNCA é categoria de despesa no DRE — é redução do custo/despesa.
 *
 * O DRE mede RESULTADO; este quadro mede uma CONTA CORRENTE com o fisco, que atravessa meses
 * pelo saldo credor. Pôr o crédito como linha do DRE o contaria duas vezes — ele já está
 * deduzido do custo — e pôr o saldo credor lá afirmaria um resultado que não aconteceu.
 *
 * A conta é de `apuracao-de-tributos.ts`. Esta tela busca e desenha.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, DatePicker, Spin, Table, Tooltip } from 'antd'
import { WarningOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { supabase } from '@/supabase/client'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import {
  apurarMes, guiaEntraNaApuracao, TRIBUTOS_APURAVEIS, type TributoApuravel,
} from '@/utils/apuracao-de-tributos'
import { TRIBUTOS_DO_CREDITO, type TributoDoCredito } from '@/utils/creditos-do-periodo'

const brl = (v: number | null | undefined) => v == null ? '—' : `R$ ${getMonetaryValue(v)}`

/**
 * De qual coluna de crédito cada tributo apurável se alimenta.
 *
 * PIS e COFINS apuram SEPARADOS e a nota guarda o crédito SOMADO — é a assimetria que a
 * coluna `credit_pis_cofins` carrega desde o #68. Enquanto ela não for partida, os dois
 * leem a mesma coluna, e o quadro DIZ isso em vez de repartir o número por estimativa
 * (`ausente-vs-falso.md`).
 */
const COLUNA_DO_CREDITO: Record<TributoApuravel, TributoDoCredito | null> = {
  ICMS: 'ICMS', PIS: 'PIS_COFINS', COFINS: 'PIS_COFINS', IPI: 'IPI', CBS: 'CBS', IBS: 'IBS',
}

const CAMPO: Record<TributoDoCredito, string> = {
  ICMS: 'credit_icms', PIS_COFINS: 'credit_pis_cofins', IPI: 'credit_ipi',
  CBS: 'credit_cbs', IBS: 'credit_ibs',
}

interface LinhaDoQuadro {
  key: TributoApuravel
  tributo: TributoApuravel
  guia: number | null
  credito: number
  debito: number | null
  aRecolher: number | null
  saldoCredorATransportar: number
  alerta: boolean
}

export function QuadroDeApuracao({ tenantId }: { tenantId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [mes, setMes] = useState(dayjs().format('YYYY-MM'))
  const [creditoPorTributo, setCreditoPorTributo] = useState<Record<string, number>>({})
  const [guiaPorTributo, setGuiaPorTributo] = useState<Record<string, number | null>>({})

  const buscar = useCallback(async () => {
    setCarregando(true)
    try {
      const primeiro = `${mes}-01`
      const proximo = dayjs(primeiro).add(1, 'month').format('YYYY-MM-DD')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // Os casts são do `database.types.ts` desatualizado — a tabela e as três colunas de
      // guia nascem na migração `20260922000002`.
      const [{ data: notas }, { data: guias }] = await Promise.all([
        (supabase as any).from('purchase_invoices')
          .select('credit_icms, credit_pis_cofins, credit_ipi, credit_cbs, credit_ibs')
          .eq('tenant_id', tenantId).gte('credit_date', primeiro).lt('credit_date', proximo),
        (supabase as any).from('cash_entries')
          .select('amount, tax_kind, guide_type, competence_month')
          .eq('tenant_id', tenantId).eq('is_active', true)
          .gte('competence_month', primeiro).lt('competence_month', proximo),
      ])

      const cred: Record<string, number> = {}
      for (const t of TRIBUTOS_DO_CREDITO) {
        cred[t] = ((notas ?? []) as Record<string, unknown>[])
          .reduce((a, r) => a + (Number(r[CAMPO[t]]) || 0), 0)
      }
      setCreditoPorTributo(cred)

      // `null` quando NÃO HÁ guia daquele tributo no mês — e isso não é zero: é o que
      // acende o alerta do §5.
      const g: Record<string, number | null> = {}
      for (const t of TRIBUTOS_APURAVEIS) g[t] = null
      for (const r of ((guias ?? []) as Record<string, unknown>[])) {
        const kind = String(r.tax_kind ?? '').trim().toUpperCase()
        if (!guiaEntraNaApuracao(kind, String(r.guide_type ?? ''))) continue
        g[kind] = (g[kind] ?? 0) + (Number(r.amount) || 0)
      }
      setGuiaPorTributo(g)
    } catch {
      setCreditoPorTributo({})
      setGuiaPorTributo({})
    } finally {
      setCarregando(false)
    }
  }, [tenantId, mes])

  useEffect(() => { void buscar() }, [buscar])

  const linhas: LinhaDoQuadro[] = useMemo(() => TRIBUTOS_APURAVEIS.map((t) => {
    const coluna = COLUNA_DO_CREDITO[t]
    const credito = coluna ? (creditoPorTributo[coluna] ?? 0) : 0
    const a = apurarMes({
      guia: guiaPorTributo[t] ?? null,
      credito,
      // O saldo credor anterior depende da apuração do mês passado, que depende das guias
      // por competência. Enquanto não houver histórico apurado, ele é ZERO APURADO — e o
      // quadro o exibe, em vez de estimar um transporte que ninguém fechou.
      saldoCredorAnterior: 0,
    })
    return {
      key: t, tributo: t, guia: guiaPorTributo[t] ?? null, credito,
      debito: a.debito, aRecolher: a.aRecolher,
      saldoCredorATransportar: a.saldoCredorATransportar,
      alerta: a.alertaGuiaFaltando,
    }
  }), [creditoPorTributo, guiaPorTributo])

  const comAlerta = linhas.filter((l) => l.alerta)

  if (carregando) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <DatePicker
          picker="month" allowClear={false}
          value={dayjs(`${mes}-01`)}
          onChange={(d) => setMes((d ?? dayjs()).format('YYYY-MM'))}
        />
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          Competência — não é o mês do vencimento da guia.
        </span>
      </div>

      {/*
        O ALERTA DO §5. Crédito no mês e NENHUMA guia daquele tributo é lançamento faltando,
        não imposto zero — e a leitura natural de um débito vazio é a segunda.
      */}
      {comAlerta.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="Há crédito no mês sem guia lançada"
          description={`${comAlerta.map((l) => l.tributo).join(', ')}: o crédito existe e não há guia daquela competência. Isso é lançamento faltando, não imposto zero — o débito do mês não é apurável sem a guia.`}
        />
      )}

      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={linhas}
        columns={[
          { title: 'Tributo', dataIndex: 'tributo', key: 'tributo' },
          {
            title: (
              <Tooltip title="Guia da COMPETÊNCIA deste mês — principal e complementar. Retificadora substitui outra e não soma; multa, juros e parcelamento são despesa.">
                <span>Guia da competência</span>
              </Tooltip>
            ),
            dataIndex: 'guia', key: 'guia', align: 'right' as const,
            // Travessão quando não há guia: `null` é "não lançada", e R$ 0,00 afirmaria uma
            // guia zerada.
            render: (v: number | null) => brl(v),
          },
          { title: 'Crédito do mês', dataIndex: 'credito', key: 'credito', align: 'right' as const, render: (v: number) => v === 0 ? '—' : brl(v) },
          {
            title: (
              <Tooltip title="Débito = Guia + Créditos + (saldo credor anterior − saldo credor atual). O sistema não conhece o débito: ele o DEDUZ do que foi recolhido e do que creditou.">
                <span>Débito da competência</span>
              </Tooltip>
            ),
            dataIndex: 'debito', key: 'debito', align: 'right' as const,
            render: (v: number | null) => v == null ? <span style={{ color: '#D97706' }}>—</span> : brl(v),
          },
          {
            title: 'A recolher', dataIndex: 'aRecolher', key: 'aRecolher', align: 'right' as const,
            render: (v: number | null) => v == null ? '—' : <strong>{brl(v)}</strong>,
          },
          {
            title: 'Saldo credor a transportar', dataIndex: 'saldoCredorATransportar', key: 'saldo',
            align: 'right' as const,
            render: (v: number) => v === 0 ? '—' : <span style={{ color: '#22C55E' }}>{brl(v)}</span>,
          },
        ]}
      />

      <div style={{ fontSize: 12, color: '#64748b' }}>
        Este quadro fica <strong>ao lado do DRE, e não é linha dele</strong>. O DRE mede
        resultado; aqui é a conta corrente com o fisco, que atravessa meses pelo saldo credor.
        O crédito já está deduzido do custo no Hub — somá-lo também aqui como despesa o
        contaria duas vezes.
      </div>
    </section>
  )
}

export default QuadroDeApuracao
