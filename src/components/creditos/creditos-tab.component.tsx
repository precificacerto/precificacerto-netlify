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
import {
  creditoPrevistoEConfirmado, rotuloDaSituacao, situacaoDaConfirmacao,
  type CreditoDaNota, type SituacaoDaConfirmacao,
} from '@/utils/credito-previsto-e-confirmado'

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
  /** As parcelas que apontam para esta nota — é delas que sai o CONFIRMADO. */
  cash_entries?: { amount: number | null; paid_date: string | null }[] | null
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
  const [confirmacao, setConfirmacao] = useState<SituacaoDaConfirmacao | null>(null)

  const buscar = useCallback(async () => {
    setCarregando(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // O cast é do `database.types.ts` desatualizado: a tabela nasce na migração
      // `20260922000002` e os tipos gerados ainda não a conhecem.
      const { data } = await (supabase as any)
        .from('purchase_invoices')
        .select('id, invoice_number, supplier_name, expense_nature, expense_category, total_amount, credit_date, credit_date_estimated, origin, credit_icms, credit_pis_cofins, credit_ipi, credit_cbs, credit_ibs, cash_entries(amount, paid_date)')
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
        parcelas: (r.cash_entries ?? []).map((p) => ({
          amount: Number(p.amount) || 0, paidDate: p.paid_date,
        })),
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

  /**
   * Os DOIS números de cada nota — §5. A conta é de `credito-previsto-e-confirmado.ts`;
   * aqui só se indexa por nota. Uma segunda conta nesta tela divergiria da apuração em
   * silêncio (`copia-divergente.md`).
   */
  const confirmacaoPorNota = useMemo(() => {
    const m = new Map<string, CreditoDaNota>()
    for (const n of notas) {
      m.set(n.id, creditoPrevistoEConfirmado({
        creditoPrevisto: creditoTotalDaNota(n),
        parcelas: n.parcelas ?? [],
      }))
    }
    return m
  }, [notas])

  /**
   * A PROJEÇÃO FISCAL do mês — §6.
   *
   * Ela soma só as notas que creditam NESTE mês, e por isso é derivada da mesma lista que os
   * cards: previsto e confirmado do mesmo conjunto, ou os dois números falariam de meses
   * diferentes.
   */
  const projecao = useMemo(() => {
    const doMes = filtrarNotas(notas, { mes }, split)
    let previsto = 0
    let confirmado = 0
    for (const n of doMes) {
      const c = confirmacaoPorNota.get(n.id)
      if (!c) continue
      previsto += c.previsto
      confirmado += c.confirmado
    }
    return { previsto, confirmado, aConfirmar: Math.round((previsto - confirmado) * 100) / 100 }
  }, [notas, mes, split, confirmacaoPorNota])
  const lista = useMemo(
    () => filtrarNotas(notas, { mes, tributo, fornecedor: fornecedor || null, natureza, situacao }, split)
      .filter((n) => {
        if (!confirmacao) return true
        const c = confirmacaoPorNota.get(n.id)
        return !!c && situacaoDaConfirmacao(c) === confirmacao
      }),
    [notas, mes, tributo, fornecedor, natureza, situacao, split, confirmacao, confirmacaoPorNota],
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
        <Card size="small" title="Crédito previsto">
          <strong style={{ fontSize: 18, color: '#22C55E' }}>{brl(cards.total)}</strong>
        </Card>
        <Card size="small" title="Crédito confirmado">
          <strong style={{ fontSize: 18 }}>{brl(projecao.confirmado)}</strong>
        </Card>
        <Card size="small" title="A confirmar">
          <strong style={{ fontSize: 18, color: projecao.aConfirmar > 0 ? '#D97706' : undefined }}>
            {projecao.aConfirmar === 0 ? '—' : brl(projecao.aConfirmar)}
          </strong>
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
          placeholder="Confirmação" allowClear style={{ width: 180 }}
          value={confirmacao} onChange={(v) => setConfirmacao(v ?? null)}
          options={[
            { value: 'CONFIRMADO', label: 'Confirmado' },
            { value: 'PARCIAL', label: 'Parcial' },
            { value: 'A_CONFIRMAR', label: 'A confirmar' },
          ]}
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
            title: 'Crédito confirmado', key: 'confirmado', align: 'right' as const,
            render: (_: unknown, r: NotaDeCompra) => {
              const c = confirmacaoPorNota.get(r.id)
              // Travessão quando não há parcela carregada: `0,00` afirmaria que nada foi
              // pago, e o que há é ausência de informação.
              if (!c || c.parcelasTotal === 0) return '—'
              return <span style={{ color: c.confirmado > 0 ? '#22C55E' : '#94a3b8' }}>{brl(c.confirmado)}</span>
            },
          },
          {
            title: 'Confirmação', key: 'confirmacao',
            render: (_: unknown, r: NotaDeCompra) => {
              const c = confirmacaoPorNota.get(r.id)
              if (!c || c.parcelasTotal === 0) return '—'
              const s = situacaoDaConfirmacao(c)
              return (
                <Tag color={s === 'CONFIRMADO' ? 'green' : s === 'PARCIAL' ? 'blue' : 'default'}>
                  {rotuloDaSituacao(c)}
                </Tag>
              )
            },
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
        PROJEÇÃO FISCAL — §6. Os dois números lado a lado, com a frase que explica o que
        acontece quando as parcelas forem pagas. O §5 é explícito: *"nunca trocar um pelo
        outro em silêncio"*, e exibir só um dos dois é a forma silenciosa de trocar.
      */}
      <div style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Projeção fiscal</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
          <span>Confirmado hoje <strong>{brl(projecao.confirmado)}</strong></span>
          <span>Previsto no mês <strong style={{ color: '#22C55E' }}>{brl(projecao.previsto)}</strong></span>
          <span>A confirmar <strong style={{ color: projecao.aConfirmar > 0 ? '#D97706' : undefined }}>{brl(projecao.aConfirmar)}</strong></span>
        </div>
        {projecao.aConfirmar > 0 && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
            Quando todas as parcelas forem pagas, o crédito do mês chega a {brl(projecao.previsto)}.
          </div>
        )}
        {/*
          A LINHA QUE IMPEDE A TROCA SILENCIOSA — §5. A apuração de ICMS, IPI e PIS/COFINS
          usa o PREVISTO, e o usuário precisa saber disso quando os dois números divergem.
        */}
        {projecao.previsto !== projecao.confirmado && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
            A apuração de ICMS, IPI e PIS/COFINS usa o <strong>previsto</strong> — o crédito
            nasce da entrada e não espera pagamento. CBS e IBS também, enquanto o split
            payment não operar.
          </div>
        )}
      </div>

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
