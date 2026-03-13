import { Spin } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'

const antIcon = <LoadingOutlined style={{ fontSize: 40, color: 'var(--color-primary-600, #22C55E)' }} spin />

const Loader = () => {
  return (
    <div
      className="fixed top-0 right-0 min-w-full min-h-full z-50 flex justify-center items-center"
      style={{
        background: 'rgba(255, 255, 255, 0.8)',
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
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-neutral-500, #667085)',
        }}>
          Carregando...
        </span>
      </div>
    </div>
  )
}

export { Loader }
