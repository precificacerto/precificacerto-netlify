/**
 * creditos-tab.component.tsx — a aba CRÉDITOS, depois do Hub. §4 do comando de 21/09/2026.
 *
 * >>> A ABA NÃO CALCULA NADA <<<
 *
 * Cards, situação, momento do crédito e filtros vêm de `creditos-do-periodo.ts`. Aqui só se
 * busca e se desenha. Uma segunda conta nesta tela seria `copia-divergente.md` com a pior das
 * assinaturas: ela fecharia consigo mesma e divergiria do quadro de apuração em silêncio.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, DatePicker, Divider, Input, Select, Spin, Table, Tag, Tooltip } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { supabase } from '@/supabase/client'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import {
  cardsDoPeriodo, filtrarNotas, situacaoDaNota, creditoTotalDaNota,
  TRIBUTOS_DO_CREDITO, SPLIT_PAYMENT_DESLIGADO,
  type NotaDeCompra, type SituacaoDoCredito, type TributoDoCredito,
} from '@/utils/creditos-do-periodo'
import { QuadroDeApuracao } from '@/components/creditos/quadro-de-apuracao.component'

const brl = (v: number | null | undefined) =>
  v == null ? '—' : `R$ ${getMonetaryValue(v)}`

const ROTULO: Record<TributoDoCredito, string> = {
  ICMS: 'ICMS', PIS_COFINS: 'PIS/COFINS', IPI: 'IPI', CBS: 'CBS', IBS: 'IBS',
}

const COR_DA_SITUACAO: Record<SituacaoDoCredito, string> = {
  APROPRIADO: 'green', A_APROPRIAR: 'gold', LEGADO: 'default',
}

const AJUDA_DA_SITUACAO: Record<SituacaoDoCredito, string> = {
  APROPRIADO: 'O crédito entra na apuração deste mês.',
  A_APROPRIAR: 'O crédito existe e ainda não entra neste mês — CBS/IBS aguardando liquidação, ou nota de outra competência.',
  LEGADO: 'Nota criada a partir de um lançamento antigo: não há número nem fornecedor, e a data do crédito foi deduzida do vencimento. Confira antes de levar à apuração.',
}

/** As linhas que a consulta devolve, antes de virarem `NotaDeCompra`. */
type LinhaDoBanco = {
  id: string
  invoice_number: string | null
  supplier_name: string | null
  expense_nature: string | null
  expense_category: string | null
  total_amount: number | null
  credit_date: string | null
  credit_date_estimated: boolean | null
  origin: string | null
  credit_icms: number | null
  credit_pis_cofins: number | null
  credit_ipi: number | null
  credit_cbs: number | null
  credit_ibs: number | null
}

export function CreditosTab({ tenantId }: { tenantId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [notas, setNotas] = useState<NotaDeCompra[]>([])
  const [mes, setMes] = useState<string>(dayjs().format('YYYY-MM'))
  const [tributo, setTributo] = useState<TributoDoCredito | null>(null)
  const [fornecedor, setFornecedor] = useState('')
  const [natureza, setNatureza] = useState<string | null>(null)
  const [situacao, setSituacao] = useState<SituacaoDoCredito | null>(null)

  const buscar = useCallback(async () => {
    setCarregando(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // O cast é do `database.types.ts` desatualizado: a tabela nasce na migração
      // `20260922000002` e os tipos gerados ainda não a conhecem.
      const { data } = await (supabase as any)
        .from('purchase_invoices')
        .select('id, invoice_number, supplier_name, expense_nature, expense_category, total_amount, credit_date, credit_date_estimated, origin, credit_icms, credit_pis_cofins, credit_ipi, credit_cbs, credit_ibs')
        .eq('tenant_id', tenantId)
        .order('credit_date', { ascending: false })

      setNotas(((data ?? []) as LinhaDoBanco[]).map((r) => ({
        id: String(r.id),
        invoiceNumber: r.invoice_number,
        supplierName: r.supplier_name,
        expenseNature: r.expense_nature,
        expenseCategory: r.expense_category,
        totalAmount: r.total_amount == null ? null : Number(r.total_amount),
        creditDate: r.credit_date,
        creditDateEstimated: r.credit_date_estimated === true,
        origin: r.origin === 'LEGADO' ? 'LEGADO' : 'NOVO',
        creditos: {
          ICMS: r.credit_icms == null ? null : Number(r.credit_icms),
          PIS_COFINS: r.credit_pis_cofins == null ? null : Number(r.credit_pis_cofins),
          IPI: r.credit_ipi == null ? null : Number(r.credit_ipi),
          CBS: r.credit_cbs == null ? null : Number(r.credit_cbs),
          IBS: r.credit_ibs == null ? null : Number(r.credit_ibs),
        },
      })))
    } catch {
      setNotas([])
    } finally {
      setCarregando(false)
    }
  }, [tenantId])

  useEffect(() => { void buscar() }, [buscar])

  // O SPLIT PAYMENT nasce desligado, e a data não é conhecida. Ver `creditos-do-periodo.ts`.
  const split = SPLIT_PAYMENT_DESLIGADO

  const cards = useMemo(() => cardsDoPeriodo(notas, mes, split), [notas, mes, split])
  const lista = useMemo(
    () => filtrarNotas(notas, { mes, tributo, fornecedor: fornecedor || null, natureza, situacao }, split),
    [notas, mes, tributo, fornecedor, natureza, situacao, split],
  )

  const naturezas = useMemo(
    () => Array.from(new Set(notas.map((n) => n.expenseNature).filter(Boolean))) as string[],
    [notas],
  )

  if (carregando) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      {/* ── CARDS ────────────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Card size="small" title="Crédito do período">
          <strong style={{ fontSize: 18, color: '#22C55E' }}>{brl(cards.total)}</strong>
        </Card>
        {TRIBUTOS_DO_CREDITO.map((t) => (
          <Card size="small" key={t} title={ROTULO[t]}>
            {/*
              Travessão, nunca R$ 0,00: o tributo sem crédito no mês não teve crédito
              APURADO — exibir zero afirma que houve operação e ela não creditou.
            */}
            <span style={{ fontSize: 16 }}>{cards.porTributo[t] === 0 ? '—' : brl(cards.porTributo[t])}</span>
          </Card>
        ))}
        <Card
          size="small"
          title={(
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              A apropriar
              <Tooltip title="Crédito que existe nas notas e ainda não entra em mês nenhum: CBS/IBS aguardando liquidação sob split payment, ou nota sem data que permita dizer a competência.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          )}
        >
          <span style={{ fontSize: 16, color: cards.aApropriar > 0 ? '#D97706' : undefined }}>
            {cards.aApropriar === 0 ? '—' : brl(cards.aApropriar)}
          </span>
        </Card>
      </div>

      {/* ── FILTROS ──────────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <DatePicker
          picker="month"
          value={dayjs(`${mes}-01`)}
          onChange={(d) => setMes((d ?? dayjs()).format('YYYY-MM'))}
          allowClear={false}
        />
        <Select
          placeholder="Tributo" allowClear style={{ width: 150 }}
          value={tributo} onChange={(v) => setTributo(v ?? null)}
          options={TRIBUTOS_DO_CREDITO.map((t) => ({ value: t, label: ROTULO[t] }))}
        />
        <Input
          placeholder="Fornecedor" style={{ width: 200 }}
          value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} allowClear
        />
        <Select
          placeholder="Natureza" allowClear style={{ width: 180 }}
          value={natureza} onChange={(v) => setNatureza(v ?? null)}
          options={naturezas.map((n) => ({ value: n, label: n }))}
        />
        <Select
          placeholder="Situação" allowClear style={{ width: 170 }}
          value={situacao} onChange={(v) => setSituacao(v ?? null)}
          options={(['APROPRIADO', 'A_APROPRIAR', 'LEGADO'] as SituacaoDoCredito[])
            .map((s) => ({ value: s, label: s === 'A_APROPRIAR' ? 'A apropriar' : s === 'APROPRIADO' ? 'Apropriado' : 'Legado' }))}
        />
      </div>

      {/* ── TABELA ───────────────────────────────────────────────────────────────────── */}
      <Table
        size="small"
        rowKey="id"
        dataSource={lista}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: 'Data do crédito', dataIndex: 'creditDate', key: 'creditDate',
            render: (v: string | null, r: NotaDeCompra) => v == null ? '—' : (
              <span>
                {dayjs(v).format('DD/MM/YYYY')}
                {/*
                  A data ESTIMADA se anuncia. Sem a marca, ela é indistinguível de uma data
                  de emissão informada, e vai para a apuração como se fosse.
                */}
                {r.creditDateEstimated && (
                  <Tooltip title="Data deduzida do vencimento do lançamento, não informada na nota.">
                    <Tag color="default" style={{ marginLeft: 6, fontSize: 10 }}>estimada</Tag>
                  </Tooltip>
                )}
              </span>
            ),
          },
          {
            title: 'Nº da NF', dataIndex: 'invoiceNumber', key: 'invoiceNumber',
            render: (v: string | null) => v || '—',
          },
          {
            title: 'Fornecedor', dataIndex: 'supplierName', key: 'supplierName',
            render: (v: string | null) => v || '—',
          },
          { title: 'Natureza', dataIndex: 'expenseNature', key: 'expenseNature', render: (v: string | null) => v || '—' },
          {
            title: 'Valor total', dataIndex: 'totalAmount', key: 'totalAmount',
            align: 'right' as const, render: (v: number | null) => brl(v),
          },
          ...TRIBUTOS_DO_CREDITO.map((t) => ({
            title: ROTULO[t], key: t, align: 'right' as const,
            render: (_: unknown, r: NotaDeCompra) => {
              const v = r.creditos[t]
              return v == null || v === 0 ? '—' : brl(v)
            },
          })),
          {
            title: 'Crédito total', key: 'total', align: 'right' as const,
            render: (_: unknown, r: NotaDeCompra) => (
              <strong style={{ color: '#22C55E' }}>{brl(creditoTotalDaNota(r))}</strong>
            ),
          },
          {
            title: 'Situação', key: 'situacao',
            render: (_: unknown, r: NotaDeCompra) => {
              const s = situacaoDaNota(r, mes, split)
              return (
                <Tooltip title={AJUDA_DA_SITUACAO[s]}>
                  <Tag color={COR_DA_SITUACAO[s]}>
                    {s === 'A_APROPRIAR' ? 'A apropriar' : s === 'APROPRIADO' ? 'Apropriado' : 'Legado'}
                  </Tag>
                </Tooltip>
              )
            },
          },
        ]}
      />

      {/*
        O QUADRO DE APURAÇÃO — §5. Ele mora AQUI, ao lado dos créditos, e não no DRE: o DRE
        mede resultado, e isto é conta corrente com o fisco.
      */}
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Quadro de apuração</div>
      <QuadroDeApuracao tenantId={tenantId} />
    </section>
  )
}

export default CreditosTab
