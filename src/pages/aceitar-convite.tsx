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
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <link rel="icon" href="/favicon.ico" />
                </Head>
                <main style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexDirection: 'column',
                    minHeight: '100vh',
                    background: '#0a1628',
                }}>
                    <Image src="/logo-dark.svg" alt="Precifica Certo" width={180} height={117} priority />
                    <p style={{ marginTop: 24, color: '#94a3b8' }}>Carregando...</p>
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
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            {contextHolder}
            <main style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'column',
                minHeight: '100vh',
                background: '#0a1628',
                padding: 16,
            }}>
                <div style={{
                    position: 'fixed',
                    top: '-20%',
                    right: '-10%',
                    width: 500,
                    height: 500,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }} />
                <div style={{
                    position: 'fixed',
                    bottom: '-15%',
                    left: '-5%',
                    width: 400,
                    height: 400,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(34, 197, 94, 0.05) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }} />

                <div style={{ marginBottom: 24, position: 'relative', zIndex: 1 }}>
                    <Image src="/logo-dark.svg" alt="Precifica Certo" width={200} height={130} priority />
                </div>

                <section style={{
                    width: '100%',
                    maxWidth: 420,
                    background: '#111c2e',
                    borderRadius: 16,
                    padding: '40px 32px',
                    boxShadow: '0px 4px 24px rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    position: 'relative',
                    zIndex: 1,
                }}>
                    <h1 style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: '#f1f5f9',
                        marginBottom: 4,
                        textAlign: 'center',
                    }}>
                        Complete seu cadastro
                    </h1>
                    <p style={{
                        fontSize: 14,
                        color: '#94a3b8',
                        marginBottom: 32,
                        textAlign: 'center',
                    }}>
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

                <p style={{
                    marginTop: 24,
                    fontSize: 12,
                    color: '#98A2B3',
                    position: 'relative',
                    zIndex: 1,
                }}>
                    © {new Date().getFullYear()} Precifica Certo
                </p>
            </main>
        </>
    )
}
