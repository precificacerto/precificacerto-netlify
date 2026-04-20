import Head from 'next/head'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { Button, Alert } from 'antd'
import { useAuth } from '@/hooks/use-auth.hook'

export default function AcessoBloqueado() {
  const router = useRouter()
  const { currentUser } = useAuth()

  const reason = (router.query.reason as string) || 'owner_block'

  const isPaymentOverdue = reason === 'payment_overdue'
  const isOwnerBlock = reason === 'owner_block' || reason === 'user_inactive'

  const supportPhone = '555199114290'

  const handleGoToPlans = () => {
    router.replace('/planos')
  }

  const handleSupport = () => {
    const email = currentUser?.email || 'precificacerto@gmail.com'
    const msg = `Olá, estou precisando de suporte, meu email é: ${email}`
    const url = `https://api.whatsapp.com/send?phone=${supportPhone}&text=${encodeURIComponent(msg)}`
    if (typeof window !== 'undefined') {
      window.location.href = url
    }
  }

  return (
    <>
      <Head>
        <title>Acesso bloqueado | Precifica Certo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
      </Head>

      <main className="auth-page">
        <section className="auth-card auth-card--medium" style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 16 }}>
            <Image
              src="/logo-dark.svg"
              alt="Precifica Certo"
              width={200}
              height={120}
              priority
              sizes="(max-width: 640px) 150px, 200px"
              style={{ width: '100%', height: 'auto', maxWidth: 200 }}
            />
          </div>

          {isPaymentOverdue && (
            <Alert
              type="error"
              showIcon
              message="Acesso bloqueado por falta de pagamento"
              description="Identificamos pendência no pagamento da sua assinatura. Para voltar a usar a plataforma, regularize o pagamento do plano."
              style={{ marginBottom: 24, textAlign: 'left' }}
            />
          )}

          {isOwnerBlock && (
            <Alert
              type="warning"
              showIcon
              message="Acesso bloqueado pelo administrador"
              description="O acesso desta conta à plataforma foi bloqueado pelo administrador do sistema. Caso acredite que isso é um engano, entre em contato com o suporte."
              style={{ marginBottom: 24, textAlign: 'left' }}
            />
          )}

          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>
            Você não poderá acessar as telas internas enquanto a situação da sua conta não for regularizada.
          </p>

          <div className="acesso-bloqueado-actions">
            {isPaymentOverdue && (
              <Button type="primary" size="large" block onClick={handleGoToPlans}>
                Regularizar pagamento na Stripe
              </Button>
            )}
            <Button size="large" block onClick={handleSupport}>
              Falar com suporte
            </Button>
            <Button size="large" block onClick={() => router.replace('/login')}>
              Voltar para o login
            </Button>
          </div>
        </section>
      </main>

      <style jsx>{`
        .acesso-bloqueado-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        @media (min-width: 640px) {
          .acesso-bloqueado-actions {
            flex-direction: row;
            flex-wrap: wrap;
            justify-content: center;
            gap: 12px;
          }
          .acesso-bloqueado-actions :global(.ant-btn) {
            flex: 1 1 auto;
            min-width: 140px;
          }
        }
      `}</style>
    </>
  )
}
