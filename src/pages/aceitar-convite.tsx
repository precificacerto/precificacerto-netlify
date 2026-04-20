import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Button, Form, Input, message } from 'antd'
import { useRouter } from 'next/router'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROUTES } from '@/constants/routes'
import { getDefaultRouteForUser } from '@/lib/default-route-by-role'

function capitalizeWords(str: string): string {
    return str.replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function AceitarConvite() {
    const router = useRouter()
    const { currentUser, loading: authLoading, refreshUser } = useAuth()
    const [checkingInvite, setCheckingInvite] = useState(true)
    const [isInviteFlow, setIsInviteFlow] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [messageApi, contextHolder] = message.useMessage()
    const [form] = Form.useForm()

    useEffect(() => {
        if (typeof window === 'undefined') return

        const checkSession = (session: { user: { email?: string; user_metadata?: Record<string, unknown> } } | null) => {
            if (!session) {
                setCheckingInvite(false)
                return
            }
            const meta = session.user?.user_metadata || {}
            const fromInvite = meta.from_admin_invite === 'true' || meta.from_admin_invite === true || meta.is_employee === 'true' || meta.is_employee === true
            if (fromInvite) {
                setIsInviteFlow(true)
                setInviteEmail(session.user?.email || '')
            }
            setCheckingInvite(false)
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                checkSession(session)
            } else {
                setCheckingInvite(false)
            }
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) checkSession(session)
        })
        return () => subscription.unsubscribe()
    }, [])

    useEffect(() => {
        if (inviteEmail) form.setFieldsValue({ email: inviteEmail })
    }, [inviteEmail, form])

    useEffect(() => {
        if (authLoading || checkingInvite) return
        if (currentUser && !isInviteFlow) {
            router.replace(getDefaultRouteForUser(currentUser))
        }
    }, [authLoading, checkingInvite, currentUser, isInviteFlow, router])

    const onFinish = async (values: { name: string; position?: string; password: string; confirmPassword: string }) => {
        if (values.password !== values.confirmPassword) {
            messageApi.error('As senhas não coincidem')
            return
        }
        if (values.password.length < 6) {
            messageApi.error('A senha deve ter pelo menos 6 caracteres')
            return
        }

        setSubmitting(true)
        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: values.password,
                data: {
                    full_name: values.name.trim(),
                    position: values.position?.trim() || '',
                    invite_completed: 'true',
                },
            })
            if (updateError) throw updateError

            const res = await fetch('/api/employees/complete-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: values.name.trim(),
                    position: values.position?.trim() || null,
                }),
            })
            const result = await res.json()
            if (!res.ok) throw new Error(result.error)

            messageApi.success(result.message || 'Cadastro concluído!')
            const profile = await refreshUser()
            const target = getDefaultRouteForUser(profile ?? null)
            setTimeout(() => router.replace(target), 1500)
        } catch (err: any) {
            messageApi.error(err.message || 'Erro ao concluir cadastro')
        } finally {
            setSubmitting(false)
        }
    }

    if (authLoading || checkingInvite) {
        return (
            <>
                <Head>
                    <title>Aceitar Convite | Precifica Certo</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                    <link rel="icon" href="/favicon.ico" />
                </Head>
                <main className="auth-page">
                    <div className="auth-page-logo">
                        <Image
                            src="/logo-dark.svg"
                            alt="Precifica Certo"
                            width={180}
                            height={117}
                            priority
                            sizes="(max-width: 640px) 140px, 180px"
                            style={{ width: '100%', height: 'auto', maxWidth: 180 }}
                        />
                    </div>
                    <p style={{ marginTop: 8, color: '#94a3b8' }}>Carregando...</p>
                </main>
            </>
        )
    }

    if (!isInviteFlow && !currentUser) {
        router.replace(ROUTES.LOGIN)
        return null
    }

    if (!isInviteFlow) return null

    return (
        <>
            <Head>
                <title>Complete seu cadastro | Precifica Certo</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            {contextHolder}

            <main className="auth-page">
                <div className="auth-page-glow auth-page-glow--tl" />
                <div className="auth-page-glow auth-page-glow--br" />

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
                    <h1 className="auth-card-title">Complete seu cadastro</h1>
                    <p className="auth-card-subtitle">
                        Você foi convidado para a plataforma. Defina sua senha e preencha seus dados.
                    </p>

                    <Form
                        form={form}
                        name="aceitar-convite"
                        onFinish={onFinish}
                        autoComplete="off"
                        layout="vertical"
                    >
                        <Form.Item label="Email" name="email">
                            <Input disabled placeholder="email@exemplo.com" />
                        </Form.Item>
                        <Form.Item
                            label="Senha"
                            name="password"
                            rules={[
                                { required: true, message: 'Defina uma senha' },
                                { min: 6, message: 'Mínimo 6 caracteres' },
                            ]}
                        >
                            <Input.Password placeholder="••••••••" />
                        </Form.Item>
                        <Form.Item
                            label="Confirmar senha"
                            name="confirmPassword"
                            dependencies={['password']}
                            rules={[
                                { required: true, message: 'Confirme a senha' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('password') === value) return Promise.resolve()
                                        return Promise.reject(new Error('As senhas não coincidem'))
                                    },
                                }),
                            ]}
                        >
                            <Input.Password placeholder="••••••••" />
                        </Form.Item>
                        <Form.Item
                            label="Nome completo"
                            name="name"
                            rules={[{ required: true, message: 'Informe seu nome' }]}
                        >
                            <Input
                                placeholder="Seu nome"
                                onChange={(e) => form.setFieldsValue({ name: capitalizeWords(e.target.value) })}
                            />
                        </Form.Item>
                        <Form.Item label="Profissão / Cargo" name="position">
                            <Input
                                placeholder="Ex.: Operador de máquinas, Vendedor"
                                onChange={(e) => form.setFieldsValue({ position: capitalizeWords(e.target.value) })}
                            />
                        </Form.Item>
                        <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                            <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
                                Concluir cadastro
                            </Button>
                        </Form.Item>
                    </Form>
                </section>

                <p className="auth-footer-text">
                    © {new Date().getFullYear()} Precifica Certo
                </p>
            </main>
        </>
    )
}
