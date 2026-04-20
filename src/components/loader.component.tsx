import { Spin } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'

const antIcon = <LoadingOutlined style={{ fontSize: 40, color: 'var(--color-primary-600, #22C55E)' }} spin />

const Loader = () => {
  return (
    <div
      className="pc-safe-fixed fixed top-0 right-0 min-w-full min-h-full z-50 flex justify-center items-center"
      style={{
        background: 'rgba(10, 22, 40, 0.85)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}>
        <Spin indicator={antIcon} size="large" />
        <span style={{
          fontSize: 'var(--font-small)',
          fontWeight: 500,
          color: 'var(--color-text-secondary, #94a3b8)',
        }}>
          Carregando...
        </span>
      </div>
    </div>
  )
}

export { Loader }
