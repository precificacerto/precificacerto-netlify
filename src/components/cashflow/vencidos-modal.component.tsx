/**
 * vencidos-modal.component.tsx — o modal de vencidos e a faixa do cabeçalho.
 *
 * Comando do PO de 21/09/2026, §3.
 *
 * >>> A FAIXA E O MODAL LEEM A MESMA FUNÇÃO <<<
 *
 * `resumirVencidos` é a fonte, e os dois derivam dela. Duas contagens do mesmo conjunto é
 * `copia-divergente.md` na forma mais visível que existe: a faixa diz 82 e o modal lista 85,
 * e o usuário não tem como saber qual acreditar.
 *
 * >>> A DISPENSA É POR SESSÃO **E POR CONJUNTO** <<<
 *
 * *"Abre uma vez por sessão por tenant (…) volta a abrir em novo login ou quando surgir um
 * vencido novo. Nunca suprimir para sempre."* A chave inclui uma assinatura dos ids: sem ela,
 * dispensar uma vez calaria o modal para um vencido que apareceu depois.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Modal, Table, Tabs, message } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { supabase } from '@/supabase/client'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { LARGURA_MODAL_50 } from '@/utils/largura-de-modal'
import {
  resumirVencidos, chaveDeDispensa, textoDaFaixa,
  type EntradaBruta, type LancamentoVencido, type ResumoDosVencidos,
} from '@/utils/vencidos-do-tenant'

const brl = (v: number) => `R$ ${getMonetaryValue(v)}`

const VAZIO: ResumoDosVencidos = {
  aPagar: [], aReceber: [], totalAPagar: 0, totalAReceber: 0, temVencidos: false,
}

export function useVencidos(tenantId: string | null, refreshToken?: number) {
  const [resumo, setResumo] = useState<ResumoDosVencidos>(VAZIO)
  const [carregando, setCarregando] = useState(true)

  const recarregar = React.useCallback(async () => {
    if (!tenantId) return
    setCarregando(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // O cast é do `database.types.ts` desatualizado para `cash_entries`, não da consulta.
      const { data } = await (supabase as any)
        .from('cash_entries')
        .select('id, type, due_date, paid_date, description, amount, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('paid_date', null)
        .lt('due_date', dayjs().format('YYYY-MM-DD'))
      setResumo(resumirVencidos((data ?? []) as EntradaBruta[], dayjs().format('YYYY-MM-DD')))
    } catch {
      setResumo(VAZIO)
    } finally {
      setCarregando(false)
    }
  }, [tenantId])

  useEffect(() => { void recarregar() }, [recarregar, refreshToken])

  return { resumo, carregando, recarregar }
}

/** A FAIXA do cabeçalho. Não renderiza nada sem vencidos — ela não mente exibindo zero. */
export function FaixaDeVencidos({ resumo, onAbrir }: { resumo: ResumoDosVencidos; onAbrir: () => void }) {
  if (!resumo.temVencidos) return null
  return (
    <button
      type="button"
      onClick={onAbrir}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.35)',
        borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, fontWeight: 600,
      }}
    >
      {textoDaFaixa(resumo, brl)}
      <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.8 }}>— clique para resolver</span>
    </button>
  )
}

interface Props {
  resumo: ResumoDosVencidos
  aberto: boolean
  onFechar: () => void
  onMudou: () => void
}

export function VencidosModal({ resumo, aberto, onFechar, onMudou }: Props) {
  const [msg, contextHolder] = message.useMessage()
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [novaData, setNovaData] = useState<Dayjs | null>(dayjs().add(7, 'day'))
  const [salvando, setSalvando] = useState(false)

  const efetivar = async (v: LancamentoVencido, data: Dayjs) => {
    setSalvando(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('cash_entries')
        .update({ paid_date: data.format('YYYY-MM-DD') }).eq('id', v.id)
      if (error) throw error
      msg.success(v.tipo === 'EXPENSE' ? 'Pagamento registrado.' : 'Recebimento registrado.')
      onMudou()
    } catch {
      msg.error('Não foi possível registrar.')
    } finally {
      setSalvando(false)
    }
  }

  const reagendar = async (ids: string[], data: Dayjs) => {
    if (ids.length === 0) return
    setSalvando(true)
    try {
      // >>> REAGENDAR MOVE O VENCIMENTO E NADA MAIS <<<
      // Nem valor, nem crédito: o crédito é do mês da ENTRADA da nota, e o vencimento manda
      // apenas no caixa (§1). Há caso afirmando que o crédito não se mexe.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('cash_entries')
        .update({ due_date: data.format('YYYY-MM-DD') }).in('id', ids)
      if (error) throw error
      msg.success(`${ids.length} lançamento(s) reagendado(s).`)
      setSelecionados([])
      onMudou()
    } catch {
      msg.error('Não foi possível reagendar.')
    } finally {
      setSalvando(false)
    }
  }

  const colunas = (tipo: 'EXPENSE' | 'INCOME') => [
    {
      title: 'Vencimento', dataIndex: 'dueDate', key: 'dueDate', width: 120,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    { title: 'Descrição', dataIndex: 'description', key: 'description' },
    {
      title: 'Contato', dataIndex: 'contato', key: 'contato', width: 160,
      // Travessão, nunca string vazia: o campo não foi informado.
      render: (v: string | null) => v || '—',
    },
    {
      title: 'Valor', dataIndex: 'amount', key: 'amount', align: 'right' as const, width: 130,
      render: (v: number) => brl(v),
    },
    {
      title: 'Dias em atraso', dataIndex: 'diasEmAtraso', key: 'dias', align: 'right' as const, width: 120,
      render: (v: number) => <span style={{ color: v > 30 ? '#DC2626' : '#D97706' }}>{v}</span>,
    },
    {
      title: 'Ações', key: 'acoes', width: 200,
      render: (_: unknown, r: LancamentoVencido) => (
        <span style={{ display: 'flex', gap: 8 }}>
          <Button size="small" type="primary" loading={salvando} onClick={() => void efetivar(r, dayjs())}>
            {tipo === 'EXPENSE' ? 'Efetivar' : 'Receber'}
          </Button>
          <Button size="small" loading={salvando} onClick={() => void reagendar([r.id], novaData ?? dayjs().add(7, 'day'))}>
            Reagendar
          </Button>
        </span>
      ),
    },
  ]

  const abas = useMemo(() => {
    const monta = (titulo: string, dados: LancamentoVencido[], total: number, tipo: 'EXPENSE' | 'INCOME') => ({
      key: tipo,
      label: `${titulo} (${dados.length} · ${brl(total)})`,
      children: (
        <Table
          size="small"
          rowKey="id"
          dataSource={dados}
          columns={colunas(tipo)}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
          rowSelection={{
            selectedRowKeys: selecionados,
            onChange: (k) => setSelecionados(k as string[]),
          }}
        />
      ),
    })
    const l = []
    if (resumo.aPagar.length > 0) l.push(monta('A pagar vencidas', resumo.aPagar, resumo.totalAPagar, 'EXPENSE'))
    if (resumo.aReceber.length > 0) l.push(monta('A receber vencidas', resumo.aReceber, resumo.totalAReceber, 'INCOME'))
    return l
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumo, selecionados, salvando, novaData])

  return (
    <>
      {contextHolder}
      <Modal
        title="Lançamentos vencidos"
        open={aberto}
        onCancel={onFechar}
        width={LARGURA_MODAL_50.width}
        style={LARGURA_MODAL_50.style}
        className="modal-50"
        // Cabeçalho e rodapé FIXOS, miolo rolando — §2. Nada encolhe e nada é cortado.
        styles={{ body: { maxHeight: '62vh', overflowY: 'auto' } }}
        footer={(
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Novo vencimento</span>
              <DatePicker value={novaData} onChange={setNovaData} format="DD/MM/YYYY" allowClear={false} />
              <Button
                disabled={selecionados.length === 0}
                loading={salvando}
                onClick={() => void reagendar(selecionados, novaData ?? dayjs().add(7, 'day'))}
              >
                Reagendar {selecionados.length > 0 ? `(${selecionados.length})` : ''}
              </Button>
            </span>
            <Button onClick={onFechar}>Ver depois</Button>
          </div>
        )}
      >
        <Tabs items={abas} />
      </Modal>
    </>
  )
}

/**
 * Decide se o modal abre sozinho — §3.
 *
 * Exportada para que o caso afirme EFEITO em vez de passagem: a regra "uma vez por sessão, e
 * volta quando surge um vencido novo" só é verificável sobre uma função.
 */
export function deveAbrirSozinho(
  tenantId: string | null,
  resumo: ResumoDosVencidos,
  dispensada: (chave: string) => boolean,
): boolean {
  if (!tenantId || !resumo.temVencidos) return false
  return !dispensada(chaveDeDispensa(tenantId, resumo))
}

export default VencidosModal
