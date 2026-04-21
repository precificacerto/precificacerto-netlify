import { ReactNode } from 'react'
import { Drawer } from 'antd'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  height?: string | number
  children: ReactNode
  footer?: ReactNode
}

const MobileBottomSheet = ({ open, onClose, title, height = 'auto', children, footer }: Props) => (
  <Drawer
    open={open}
    onClose={onClose}
    placement="bottom"
    height={height}
    title={title}
    className="pc-mobile-bottom-sheet"
    styles={{
      body: { padding: 16, paddingBottom: 'calc(var(--safe-bottom) + 16px)' },
      header: { borderBottom: '1px solid rgba(255,255,255,0.06)' },
    }}
    footer={footer}
  >
    {children}
  </Drawer>
)

export { MobileBottomSheet }
