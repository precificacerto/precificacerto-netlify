import { FC, useState } from 'react'
import { Button, Form, Input, Alert } from 'antd'
import { AuthType } from '@/types/auth.type'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROUTES } from '@/constants/routes'
import Link from 'next/link'

const SignInWithEmailPassword: FC = () => {
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()

  const onFinish = async (values: AuthType) => {
    const { email, password } = values
    const trimmedEmail = email.trim()

    setLoading(true)
    try {
      await login({ email: trimmedEmail, password })
    } catch (error: any) {
      if (error.message?.includes('Email not confirmed')) {
        setErrorMessage('Email ainda não foi verificado. Confira sua caixa de entrada.')
      } else {
        setErrorMessage('Email ou senha incorretos')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form
      name="basic"
      initialValues={{ remember: true }}
      onFinish={onFinish}
      autoComplete="off"
      onChange={() => {
        setErrorMessage('')
      }}
      layout="vertical"
    >
      <Form.Item
        label="Email"
        name="email"
        rules={[
          { required: true, message: 'Informe seu email' },
          { type: 'email', message: 'Email inválido' },
        ]}
      >
        <Input placeholder="seu@email.com" />
      </Form.Item>

      <Form.Item
        label="Senha"
        name="password"
        rules={[{ required: true, message: 'Informe sua senha' }]}
      >
        <Input.Password placeholder="Sua senha" />
      </Form.Item>

      {errorMessage && (
        <Alert
          message={errorMessage}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Button
        htmlType="submit"
        type="primary"
        loading={loading}
        block
        size="large"
        style={{ marginBottom: 16 }}
      >
        Entrar
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href={ROUTES.RESET_PASSWORD}>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>Esqueceu sua senha?</span>
        </Link>
      </div>

      <div style={{ textAlign: 'center', marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <span style={{ fontSize: '14px', color: '#94a3b8' }}>
          Não tem uma conta?{' '}
        </span>
        <Link href="/cadastro" style={{ fontSize: '14px', fontWeight: 600 }}>
          Cadastre-se
        </Link>
      </div>
    </Form>
  )
}

export default SignInWithEmailPassword
