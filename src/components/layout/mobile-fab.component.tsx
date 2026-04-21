import { ReactNode } from 'react'

type Props = {
  onClick: () => void
  icon: ReactNode
  label: string
}

const MobileFab = ({ onClick, icon, label }: Props) => (
  <button
    type="button"
    className="pc-mobile-fab"
    onClick={onClick}
    aria-label={label}
    title={label}
  >
    {icon}
  </button>
)

export { MobileFab }
