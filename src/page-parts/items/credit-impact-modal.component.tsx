/**
 * credit-impact-modal.component.tsx — quem é afetado quando uma bandeira de crédito muda.
 *
 * Mudar um botão muda `cost_net`, e `cost_net` é o numerador da precificação: o preço
 * sugerido de todo produto e serviço que usa o item muda junto. Esta tela existe para que
 * essa consequência não seja silenciosa.
 *
 * >>> ELA NÃO REGRAVA NADA <<<
 * Salvar o item muda o item, e só ele. A lista abaixo é INFORMAÇÃO: os produtos já
 * precificados mantêm o custo congelado até que alguém os remargeie, um a um, pela tela do
 * produto. É `fato-vs-referencia.md`: o preço formado é memória de um cálculo que aconteceu,
 * e reescrevê-lo em massa por causa de uma decisão de hoje reescreve o passado.
 */
import React from 'react'
import { Alert, Modal, Table, Tag } from 'antd'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import type { ImpactoDoItem } from '@/utils/impacto-do-credito'

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : `R$ ${getMonetaryValue(v)}`

interface Props {
  aberto: boolean
  onClose: () => void
  nomeDoItem: string
  custoAntes: number
  custoDepois: number
  impactos: ImpactoDoItem[]
  carregando?: boolean
}

export function CreditImpactModal({
  aberto, onClose, nomeDoItem, custoAntes, custoDepois, impactos, carregando,
}: Props) {
  const delta = custoDepois - custoAntes

  return (
    <Modal
      open={aberto}
      onCancel={onClose}
      onOk={onClose}
      okText="Entendi"
      cancelButtonProps={{ style: { display: 'none' } }}
      width={760}
      title="O crédito mudou — veja quem é afetado"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <span>
            O custo líquido de <b>{nomeDoItem}</b> foi de {fmt(custoAntes)} para {fmt(custoDepois)}
            {' '}({delta >= 0 ? '+' : '−'} {fmt(Math.abs(delta))}).
          </span>
        }
        description={
          <span>
            {/*
              O aviso diz o que NÃO aconteceu, e isso é tão importante quanto o que
              aconteceu: sem ele o usuário sai daqui achando que os preços já mudaram.
            */}
            <b>Nada foi regravado.</b> Os produtos e serviços abaixo mantêm o preço e o custo
            que já tinham. A coluna <i>preço recalculado</i> é o que a construção daria com o
            custo novo — para aplicá-la, abra o produto e remargeie.
          </span>
        }
      />

      <Table
        size="small"
        rowKey="id"
        loading={carregando}
        pagination={false}
        scroll={{ y: 320 }}
        locale={{ emptyText: 'Nenhum produto ou serviço usa este item.' }}
        dataSource={impactos}
        columns={[
          {
            title: 'Onde', dataIndex: 'nome', key: 'nome',
            render: (nome: string, r: ImpactoDoItem) => (
              <span>
                <Tag color={r.tipo === 'PRODUTO' ? 'blue' : 'purple'}>
                  {r.tipo === 'PRODUTO' ? 'Produto' : 'Serviço'}
                </Tag>
                {nome}
              </span>
            ),
          },
          { title: 'Qtd. do item', dataIndex: 'quantidade', key: 'qtd', align: 'right', width: 100 },
          {
            title: 'Preço atual', dataIndex: 'precoAtual', key: 'atual', align: 'right', width: 120,
            render: (v: number) => fmt(v),
          },
          {
            title: 'Preço recalculado', dataIndex: 'precoNovo', key: 'novo', align: 'right', width: 140,
            // `null` vira travessão, nunca R$ 0,00: quando o custo atual é zero a razão não
            // existe, e um zero ali afirmaria um preço que ninguém apurou.
            render: (v: number | null) => fmt(v),
          },
          {
            title: 'Variação', dataIndex: 'variacao', key: 'var', align: 'right', width: 120,
            render: (v: number | null) => v == null ? '—' : (
              <span style={{ color: v > 0 ? '#fca5a5' : v < 0 ? '#22C55E' : '#94a3b8', fontWeight: 600 }}>
                {v > 0 ? '+' : v < 0 ? '−' : ''} {fmt(Math.abs(v))}
              </span>
            ),
          },
        ]}
      />
    </Modal>
  )
}

export default CreditImpactModal
