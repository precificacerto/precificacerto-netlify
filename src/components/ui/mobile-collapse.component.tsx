import { CSSProperties, FC, ReactNode } from 'react'
import { DownOutlined } from '@ant-design/icons'

interface Props {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  style?: CSSProperties
}

/**
 * MobileCollapse — bloco recolhível (`<details>`) padronizado para cabeçalhos informativos no mobile.
 * Extraído na consolidação da Sprint Mobile 3 (EPIC-POR-FORA-V3) para eliminar a duplicação de
 * estilos inline de `details/summary` que existia em Usuários e Conectividade.
 *
 * Uso: renderize-o apenas quando `isMobile` (o caller decide), passando o título do aviso e o conteúdo.
 */
export const MobileCollapse: FC<Props> = ({ title, children, defaultOpen = false, style }) => {
  return (
    <details
      open={defaultOpen}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 12,
        ...style,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          listStyle: 'none',
        }}
      >
        <DownOutlined style={{ fontSize: 10 }} />
        {title}
      </summary>
      <div style={{ marginTop: 8, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>{children}</div>
    </details>
  )
}
