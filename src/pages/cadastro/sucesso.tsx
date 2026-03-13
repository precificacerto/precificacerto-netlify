import Head from 'next/head'
import Image from 'next/image'
import { Button } from 'antd'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { CheckCircleOutlined } from '@ant-design/icons'

const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_STRIPE_TRIAL_DAYS) || 7

export default function CadastroSucesso() {
  return (
    <>
      <Head>
        <title>Cadastro confirmado | Precifica Certo</title>
        <meta name="description" content="Seu cadastro foi confirmado. Verifique seu e-mail para acessar a plataforma." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          minHeight: '100vh',
          background: '#0a1628',
          padding: '16px',
        }}
      >
        <div style={{ marginBottom: '32px', position: 'relative', zIndex: 1 }}>
          <Image src="/logo-dark.svg" alt="Precifica Certo" width={200} height={130} priority />
        </div>

        <section
          style={{
            width: '100%',
            maxWidth: 420,
            background: '#111c2e',
            borderRadius: '16px',
            padding: '40px 32px',
            boxShadow: '0px 4px 24px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #22C55E 0%, #00A35E 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}
            >
              <CheckCircleOutlined style={{ fontSize: 32, color: '#FFFFFF' }} />
            </div>
            <h1
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: '#f1f5f9',
                marginBottom: '8px',
              }}
            >
              Teste gratuito ativado!
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: '#94a3b8',
                marginBottom: '16px',
                lineHeight: 1.6,
              }}
            >
              Seu período de teste de <strong>{TRIAL_DAYS} dias</strong> começou agora.
              Você não será cobrado durante este período.
            </p>
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: '16px',
              }}
            >
              <p style={{ fontSize: '13px', color: '#86efac', margin: 0, lineHeight: 1.5 }}>
                Após {TRIAL_DAYS} dias, o plano selecionado será cobrado automaticamente no cartão cadastrado.
              </p>
            </div>
            <p
              style={{
                fontSize: '14px',
                color: '#94a3b8',
                marginBottom: '24px',
                lineHeight: 1.6,
              }}
            >
              Verifique seu e-mail. Enviamos as instruções de acesso para você entrar na plataforma.
            </p>
            <p
              style={{
                fontSize: '13px',
                color: '#98A2B3',
                marginBottom: '24px',
                lineHeight: 1.5,
              }}
            >
              Após o primeiro login, defina sua senha e conclua o cadastro da sua empresa.
            </p>
            <Link href={ROUTES.LOGIN}>
              <Button type="primary" block size="large">
                Ir para o Login
              </Button>
            </Link>
          </div>
        </section>

        <p
          style={{
            marginTop: '24px',
            fontSize: '12px',
            color: '#98A2B3',
            position: 'relative',
            zIndex: 1,
          }}
        >
          © {new Date().getFullYear()} Precifica Certo. Todos os direitos reservados.
        </p>
      </main>
    </>
  )
}
