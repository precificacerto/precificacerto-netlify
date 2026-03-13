import React, { useState, useEffect } from 'react'
import { Button, Form, Input, Divider, message, Spin } from 'antd'
import { UserOutlined, SaveOutlined, LockOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { useAuth } from '@/hooks/use-auth.hook'
import { supabase } from '@/supabase/client'

function MyAccount() {
    const [messageApi, contextHolder] = message.useMessage()
    const [profileForm] = Form.useForm()
    const { currentUser, setCurrentUser, tenantId } = useAuth()

    const [loadingProfile, setLoadingProfile] = useState(false)
    const [savingProfile, setSavingProfile] = useState(false)
    const [sendingReset, setSendingReset] = useState(false)
    const [companyPhone, setCompanyPhone] = useState<string | null>(null)

    useEffect(() => {
        if (!currentUser) return
        profileForm.setFieldsValue({ email: currentUser.email })
        fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.uid])

    useEffect(() => {
        if (!tenantId) return
        supabase.from('tenants').select('phone').eq('id', tenantId).single().then(({ data }) => {
            setCompanyPhone(data?.phone ?? null)
        })
    }, [tenantId])

    async function fetchProfile() {
        if (!currentUser?.uid) return
        setLoadingProfile(true)
        try {
            const { data } = await supabase
                .from('users')
                .select('name, phone, cpf, email')
                .eq('id', currentUser.uid)
                .single()

            if (data) {
                profileForm.setFieldsValue({
                    name: data.name,
                    phone: data.phone,
                    cpf: data.cpf,
                    email: data.email || currentUser.email,
                })
            }
        } catch (err) {
            console.error('Erro ao carregar perfil:', err)
        } finally {
            setLoadingProfile(false)
        }
    }

    async function handleSaveProfile() {
        try {
            const values = await profileForm.validateFields()
            if (!currentUser?.uid) return

            setSavingProfile(true)
            const { error } = await supabase
                .from('users')
                .update({
                    name: values.name || null,
                    phone: values.phone || null,
                    cpf: values.cpf || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', currentUser.uid)

            if (error) throw error
            setCurrentUser({ ...currentUser!, name: values.name || undefined })
            messageApi.success('Dados pessoais salvos com sucesso!')
        } catch (err: any) {
            console.error('Erro ao salvar perfil:', err)
            messageApi.error('Erro ao salvar: ' + (err.message || 'Verifique os campos'))
        } finally {
            setSavingProfile(false)
        }
    }

    async function handleSendPasswordReset() {
        if (!currentUser?.email) return
        setSendingReset(true)
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(currentUser.email, {
                redirectTo: `${window.location.origin}/reset-password`,
            })
            if (error) throw error
            messageApi.success('Email de recuperação de senha enviado para ' + currentUser.email)
        } catch (err: any) {
            console.error('Erro ao enviar reset:', err)
            messageApi.error('Erro ao enviar email de recuperação')
        } finally {
            setSendingReset(false)
        }
    }

    return (
        <Layout title={PAGE_TITLES.MY_ACCOUNT} subtitle="Gerencie seus dados pessoais">
            {contextHolder}
            <div className="pc-card" style={{ maxWidth: 580 }}>
                {loadingProfile ? (
                    <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                ) : (
                    <>
                        <p style={{ color: 'var(--color-neutral-500)', fontSize: 13, marginBottom: 20 }}>
                            Gerencie suas informações pessoais. O email é vinculado à sua conta de acesso.
                        </p>
                        <Form form={profileForm} layout="vertical">
                            <Form.Item name="name" label="Nome completo">
                                <Input placeholder="Seu nome" />
                            </Form.Item>
                            <Form.Item name="email" label="Email">
                                <Input
                                    disabled
                                    prefix={<MailOutlined style={{ color: 'var(--color-neutral-400)' }} />}
                                    suffix={
                                        <span style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>
                                            Gerenciado pelo login
                                        </span>
                                    }
                                />
                            </Form.Item>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <Form.Item name="phone" label="Telefone (pessoal)">
                                    <Input placeholder="(00) 00000-0000" />
                                </Form.Item>
                                <Form.Item name="cpf" label="CPF">
                                    <Input placeholder="000.000.000-00" />
                                </Form.Item>
                            </div>
                            {companyPhone != null && companyPhone !== '' && (
                                <Form.Item label="Telefone da empresa" tooltip="Cadastrado pelo admin em Configurações / Onboarding">
                                    <Input value={companyPhone} disabled prefix={<PhoneOutlined style={{ color: 'var(--color-neutral-400)' }} />} />
                                </Form.Item>
                            )}
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={handleSaveProfile}
                                loading={savingProfile}
                            >
                                Salvar Dados
                            </Button>
                        </Form>

                        <Divider />

                        <div>
                            <h4 style={{ fontWeight: 600, marginBottom: 8 }}>Alterar Senha</h4>
                            <p style={{ color: 'var(--color-neutral-500)', fontSize: 13, marginBottom: 16 }}>
                                Um email será enviado para <strong>{currentUser?.email}</strong> com um link para redefinir sua senha.
                            </p>
                            <Button
                                icon={<LockOutlined />}
                                onClick={handleSendPasswordReset}
                                loading={sendingReset}
                            >
                                Enviar Email de Redefinição
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Layout>
    )
}

export default MyAccount
