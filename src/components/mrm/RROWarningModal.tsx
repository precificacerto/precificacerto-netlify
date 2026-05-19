/**
 * RROWarningModal — Modal de aviso para budgets/orders quando RRO ≤ 0.
 *
 * Story: MRM-V2-S2.3 (camada `mrm-policies.ts`).
 *
 * Padrão de uso:
 *   const decision = decideMrmAction({ motorResult, documentType: 'budget' })
 *   if (decision.action === 'warn') {
 *     setModalOpen(true) // exibe este modal antes de salvar
 *   }
 *
 * Botão "Continuar mesmo assim" → caller persiste com `requires_review: true`.
 * Botão "Cancelar" → fecha sem salvar.
 *
 * Para `sales` (block_save) NÃO use este modal — exiba toast/messageApi.error
 * e aborte o save sem prompt.
 */
import React from 'react'
import { Modal, Typography } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'

export interface RROWarningModalProps {
  open: boolean
  message: string
  /** Acionado quando usuário confirma "Continuar mesmo assim". Caller deve salvar com `requires_review: true`. */
  onContinue: () => void
  /** Acionado quando usuário cancela ou fecha o modal. */
  onCancel: () => void
  /** Loading do botão de confirmação enquanto o save acontece. */
  loading?: boolean
  /** Título customizável. Default: "Margem residual zero ou negativa". */
  title?: string
}

export function RROWarningModal({
  open,
  message,
  onContinue,
  onCancel,
  loading = false,
  title = 'Margem residual zero ou negativa',
}: RROWarningModalProps) {
  return (
    <Modal
      open={open}
      onOk={onContinue}
      onCancel={onCancel}
      okText="Continuar mesmo assim"
      cancelText="Cancelar"
      okButtonProps={{ danger: true, loading }}
      cancelButtonProps={{ disabled: loading }}
      maskClosable={!loading}
      closable={!loading}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ExclamationCircleOutlined style={{ color: '#faad14' }} />
          {title}
        </span>
      }
    >
      <Typography.Paragraph style={{ marginBottom: 8 }}>{message}</Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
        Ao continuar, este documento será marcado como <strong>"Requer revisão"</strong> e
        ficará destacado nas listagens até que um responsável valide.
      </Typography.Paragraph>
    </Modal>
  )
}

export default RROWarningModal
