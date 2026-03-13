import { useAuth } from '@/hooks/use-auth.hook'
import { Alert } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'

function getDaysRemaining(trialEndsAt: string): number {
  const now = new Date()
  const end = new Date(trialEndsAt)
  const diff = end.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function TrialBanner() {
  const { currentUser } = useAuth()

  if (
    !currentUser ||
    currentUser.planStatus !== 'TRIAL' ||
    currentUser.isFree ||
    currentUser.is_super_admin ||
    !currentUser.trialEndsAt
  ) {
    return null
  }

  const days = getDaysRemaining(currentUser.trialEndsAt)

  const message =
    days === 0
      ? 'Seu período de teste gratuito termina hoje.'
      : days === 1
        ? 'Seu período de teste gratuito termina amanhã.'
        : `Restam ${days} dias do seu período de teste gratuito.`

  return (
    <Alert
      type={days <= 2 ? 'warning' : 'info'}
      showIcon
      icon={<ClockCircleOutlined />}
      message={message}
      banner
      style={{ textAlign: 'center' }}
    />
  )
}
