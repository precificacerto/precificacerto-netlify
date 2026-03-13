import { FC } from 'react'
import { Button, Form, Input, message } from 'antd'
import { AuthType } from '@/types/auth.type'
import { supabase } from '@/supabase/client'
import { useRouter } from 'next/router'
import { ROUTES } from '@/constants/routes'

const ResetPasswordWithEmail: FC = () => {
  const [messageApi, contextHolder] = message.useMessage()

  const router = useRouter()

  const onFinish = async (values: AuthType) => {
    const { email } = values

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error

      messageApi.open({
        type: 'success',
        content: 'Email de recuperação enviado!',
      })
      setTimeout(() => {
        router.push(ROUTES.LOGIN)
      }, 3000)
    } catch (err: unknown) {
      if (process.env.NODE_ENV === 'development') console.error('Reset password error:', err instanceof Error ? err.message : 'Unknown')
      const msg =
        err &&
        typeof err === 'object' &&
        'message' in err &&
        typeof (err as { message?: string }).message === 'string'
          ? (err as { message: string }).message
          : ''
      const isRateLimit =
        msg.toLowerCase().includes('rate limit') ||
        msg.toLowerCase().includes('rate_limit') ||
        (err && typeof err === 'object' && 'status' in err && (err as { status?: number }).status === 429)
      messageApi.open({
        type: 'error',
        content: isRateLimit
          ? 'Muitas tentativas. Aguarde alguns minutos e tente enviar o email novamente.'
          : 'Erro ao enviar email de recuperação. Tente novamente.',
      })
    }
  }

  return (
    <Form
      name="basic"
      initialValues={{ remember: true }}
      autoComplete="off"
      layout="vertical"
      onFinish={onFinish}
    >
      {contextHolder}
      <Form.Item label="Email" name="email" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <div className="flex w-full justify-center">
        <Button htmlType="submit" type="primary">
          Enviar
        </Button>
      </div>
    </Form>
  )
}

export default ResetPasswordWithEmail
