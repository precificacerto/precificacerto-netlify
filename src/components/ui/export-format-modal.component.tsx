import { Modal, Button, DatePicker } from 'antd'
import { FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons'
import { FC, useState } from 'react'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

interface Props {
  open: boolean
  onClose: () => void
  onExportExcel: (startDate?: string, endDate?: string) => void
  onExportPdf: (startDate?: string, endDate?: string) => void
  title?: string
  /** If true, skip the date range step and export immediately */
  skipDateRange?: boolean
}

export const ExportFormatModal: FC<Props> = ({ open, onClose, onExportExcel, onExportPdf, title = 'Exportar Relatório', skipDateRange = false }) => {
  const [step, setStep] = useState<'format' | 'range'>('format')
  const [selectedFormat, setSelectedFormat] = useState<'excel' | 'pdf' | null>(null)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])

  const handleClose = () => {
    setStep('format')
    setSelectedFormat(null)
    setDateRange([dayjs().startOf('month'), dayjs().endOf('month')])
    onClose()
  }

  const handleSelectFormat = (format: 'excel' | 'pdf') => {
    if (skipDateRange) {
      if (format === 'excel') onExportExcel()
      else onExportPdf()
      handleClose()
      return
    }
    setSelectedFormat(format)
    setStep('range')
  }

  const handleConfirmExport = () => {
    const start = dateRange[0].startOf('day').toISOString()
    const end = dateRange[1].endOf('day').toISOString()
    if (selectedFormat === 'excel') onExportExcel(start, end)
    else onExportPdf(start, end)
    handleClose()
  }

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={title}
      footer={null}
      centered
      width="min(440px, calc(100vw - 32px))"
    >
      {step === 'format' ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
            Escolha o formato de exportação:
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button
              size="large"
              icon={<FileExcelOutlined />}
              onClick={() => handleSelectFormat('excel')}
              style={{
                height: 80, flex: '1 1 140px', minWidth: 120, maxWidth: 180,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#f0fdf4', borderColor: '#22c55e', color: '#15803d'
              }}
            >
              <span style={{ fontSize: 13 }}>Excel</span>
            </Button>
            <Button
              size="large"
              icon={<FilePdfOutlined />}
              onClick={() => handleSelectFormat('pdf')}
              style={{
                height: 80, flex: '1 1 140px', minWidth: 120, maxWidth: 180,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#fef2f2', borderColor: '#ef4444', color: '#dc2626'
              }}
            >
              <span style={{ fontSize: 13 }}>PDF</span>
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '16px 0' }}>
          <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16 }}>
            Selecione o período que deseja exportar:
          </p>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0], dates[1]])
              }
            }}
            format="DD/MM/YYYY"
            style={{ width: '100%', marginBottom: 20 }}
            presets={[
              { label: 'Este mês', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
              { label: 'Mês passado', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
              { label: 'Últimos 3 meses', value: [dayjs().subtract(3, 'month').startOf('month'), dayjs().endOf('month')] },
              { label: 'Este ano', value: [dayjs().startOf('year'), dayjs().endOf('year')] },
            ]}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setStep('format')}>Voltar</Button>
            <Button type="primary" onClick={handleConfirmExport}>
              Exportar {selectedFormat === 'excel' ? 'Excel' : 'PDF'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
