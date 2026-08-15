import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Form, Input, Alert, Checkbox } from 'antd'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROUTES } from '@/constants/routes'
import { getDefaultRouteForUser } from '@/lib/default-route-by-role'
import { maskPhoneBR, isValidBrazilianMobile, phoneDigits } from '@/utils/contact-validation'

/**
 * Etapa 1 do novo fluxo de cadastro (Escopo 13/08/2026): coleta credenciais e cria
 * a conta ANTES do pagamento (tenant PENDING_PAYMENT). Ao concluir, abre sessão e
 * segue para a Etapa 2 (/cadastro/usuarios).
 *
 * Rota é "pública" para o AuthGuard (prefixo /cadastro), então não é chutada para
 * /assinar mesmo com o tenant em PENDING_PAYMENT.
 */

const CONSENT_VERSION = 'v1-2026-08'
const ETAPA2_ROUTE = '/cadastro/usuarios'

type Etapa1Form = {
  name: string
  email: string
  phone: string
  company: string
  password: string
}

export default function CadastroCredenciais() {
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [emailExists, setEmailExists] = useState(false)
  const [consent, setConsent] = useState(false)
  const [form] = Form.useForm()
  const { currentUser, login } = useAuth()
  const router = useRouter()

  // Se já houver sessão, o usuário não deve refazer a Etapa 1.
  useEffect(() => {
    if (!currentUser) return
    if (currentUser.planStatus === 'PENDING_PAYMENT') {
      router.replace(ETAPA2_ROUTE)
    } else {
      router.replace(getDefaultRouteForUser(currentUser))
    }
  }, [currentUser, router])

  const onFinish = async (values: Etapa1Form) => {
    setLoading(true)
    setErrorMessage('')
    setEmailExists(false)

    const email = values.email.trim().toLowerCase()
    const password = values.password

    // UTMs vindas da landing (querystring) — capturadas para o funil/remarketing.
    const q = router.query
    const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

    try {
      const res = await fetch('/api/cadastro/etapa1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email,
          whatsapp: phoneDigits(values.phone),
          company: values.company.trim(),
          password,
          consent: true,
          consentVersion: CONSENT_VERSION,
          origemLead: str(q.origem) || 'cadastro',
          utmSource: str(q.utm_source),
          utmMedium: str(q.utm_medium),
          utmCampaign: str(q.utm_campaign),
          utmContent: str(q.utm_content),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'EMAIL_EXISTS') setEmailExists(true)
        setErrorMessage(data.error || 'Não foi possível criar a conta.')
        return
      }

      // Conta criada — abre sessão com a senha recém-cadastrada e segue para a Etapa 2.
      await login({ email, password })
      router.push(ETAPA2_ROUTE)
    } catch {
      setErrorMessage('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Criar conta | Precifica Certo</title>
        <meta name="description" content="Crie sua conta no Precifica Certo e comece o teste grátis" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="auth-page">
        <div className="auth-page-logo">
          <Image
            src="/logo-dark.svg"
            alt="Precifica Certo"
            width={200}
            height={130}
            priority
            sizes="(max-width: 640px) 150px, 200px"
            style={{ width: '100%', height: 'auto', maxWidth: 200 }}
          />
        </div>

        <section className="auth-card">
          <h1 className="auth-card-title">Criar sua conta</h1>

          {/* Indicador de etapas (1. Seus dados · 2. Usuários · 3. Acesso) */}
          <div className="signup-steps" aria-hidden>
            <span className="signup-step on" />
            <span className="signup-step" />
            <span className="signup-step" />
          </div>
          <div className="signup-steps-lbl">
            <strong>1. Seus dados</strong>
            <span>2. Usuários</span>
            <span>3. Acesso</span>
          </div>

          <Form form={form} name="cadastro-credenciais" onFinish={onFinish} layout="vertical" autoComplete="off" onChange={() => setErrorMessage('')}>
            <Form.Item label="Nome completo" name="name" rules={[{ required: true, message: 'Informe seu nome' }, { min: 3, message: 'Informe seu nome completo' }]}>
              <Input placeholder="Como podemos te chamar" autoComplete="name" />
            </Form.Item>

            <Form.Item
              label="E-mail"
              name="email"
              rules={[{ required: true, message: 'Informe seu e-mail' }, { type: 'email', message: 'E-mail inválido' }]}
            >
              <Input placeholder="seu@email.com" autoComplete="email" />
            </Form.Item>

            <Form.Item
              label="WhatsApp"
              name="phone"
              extra="Precisa ser um celular — é por onde enviamos o acesso."
              getValueFromEvent={(e) => maskPhoneBR(e.target.value)}
              rules={[
                { required: true, message: 'Informe seu WhatsApp' },
                {
                  validator: (_, v) =>
                    isValidBrazilianMobile(v || '')
                      ? Promise.resolve()
                      : Promise.reject(new Error('Informe um celular válido com DDD')),
                },
              ]}
            >
              <Input placeholder="(00) 00000-0000" inputMode="numeric" maxLength={15} autoComplete="tel" />
            </Form.Item>

            <Form.Item label="Empresa" name="company" rules={[{ required: true, message: 'Informe o nome da empresa' }, { min: 2, message: 'Informe o nome da empresa' }]}>
              <Input placeholder="Nome da sua empresa" autoComplete="organization" />
            </Form.Item>

            <Form.Item label="Senha" name="password" rules={[{ required: true, message: 'Crie uma senha' }, { min: 8, message: 'A senha precisa de pelo menos 8 caracteres' }]}>
              <Input.Password placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
            </Form.Item>

            <Form.Item className="signup-consent">
              <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)}>
                Autorizo o contato por e-mail e WhatsApp sobre minha conta e novidades da plataforma.
              </Checkbox>
            </Form.Item>

            {errorMessage && (
              <Alert
                message={errorMessage}
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                action={
                  emailExists ? (
                    <Link href={ROUTES.LOGIN} style={{ fontWeight: 600 }}>
                      Entrar
                    </Link>
                  ) : undefined
                }
              />
            )}

            <Button htmlType="submit" type="primary" loading={loading} disabled={!consent} block size="large">
              Continuar
            </Button>
            <p className="signup-after">Você define os usuários na próxima etapa.</p>
          </Form>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <span style={{ fontSize: '14px', color: '#94a3b8' }}>Já tem uma conta? </span>
            <Link href={ROUTES.LOGIN} style={{ fontSize: '14px', fontWeight: 600 }}>
              Faça login
            </Link>
          </div>
        </section>

        <p className="auth-footer-text">© {new Date().getFullYear()} Precifica Certo. Todos os direitos reservados.</p>
      </main>

      <style jsx>{`
        .signup-steps {
          display: flex;
          gap: 7px;
          margin-bottom: 9px;
        }
        .signup-step {
          flex: 1;
          height: 3px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.12);
        }
        .signup-step.on {
          background: #22c55e;
        }
        .signup-steps-lbl {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #94a3b8;
          margin-bottom: 24px;
        }
        .signup-steps-lbl strong {
          color: #e2e8f0;
          font-weight: 600;
        }
        .signup-consent {
          margin-top: 4px;
        }
        .signup-after {
          text-align: center;
          font-size: 12.5px;
          color: #94a3b8;
          margin-top: 12px;
        }
      `}</style>
    </>
  )
}
