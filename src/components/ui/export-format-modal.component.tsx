import { Modal, Button, Space } from 'antd'
import { FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons'
import { FC } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onExportExcel: () => void
  onExportPdf: () => void
  title?: string
}

export const ExportFormatModal: FC<Props> = ({ open, onClose, onExportExcel, onExportPdf, title = 'Exportar Relatório' }) => {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      footer={null}
      centered
      width={400}
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
          Escolha o formato de exportação:
        </p>
        <Space size={16}>
          <Button
            size="large"
            icon={<FileExcelOutlined />}
            onClick={() => { onExportExcel(); onClose() }}
            style={{
              height: 80, width: 140, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              background: '#f0fdf4', borderColor: '#22c55e', color: '#15803d'
            }}
          >
            <span style={{ fontSize: 13 }}>Excel</span>
          </Button>
          <Button
            size="large"
            icon={<FilePdfOutlined />}
            onClick={() => { onExportPdf(); onClose() }}
            style={{
              height: 80, width: 140, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              background: '#fef2f2', borderColor: '#ef4444', color: '#dc2626'
            }}
          >
            <span style={{ fontSize: 13 }}>PDF</span>
          </Button>
        </Space>
      </div>
    </Modal>
  )
}
