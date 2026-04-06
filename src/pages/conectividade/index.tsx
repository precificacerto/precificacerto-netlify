import React, { useState, useEffect, useRef } from 'react'
import { Button, Card, Input, Tag, message, Divider, Space, Alert, Spin, Tooltip, Radio, Checkbox, Progress } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { getTenantId as fetchTenantId } from '@/utils/get-tenant-id'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCustomers } from '@/hooks/use-data.hooks'
import type { TenantSettings } from '@/supabase/types'
import type { Customer } from '@/supabase/types'
import {
    SaveOutlined,
    WhatsAppOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    CloseCircleOutlined,
    CalendarOutlined,
    ClockCircleOutlined,
    FileTextOutlined,
    UserOutlined,
    InfoCircleOutlined,
    SendOutlined,
    StopOutlined,
} from '@ant-design/icons'

function Conectividade() {
    const { currentUser } = useAuth()
    const [messageApi, contextHolder] = message.useMessage()
    const [loading, setLoading] = useState(false)
    const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null)

    const [waConnected, setWaConnected] = useState(false)
    const [waPhone, setWaPhone] = useState<string | null>(null)
    const [isGeneratingQR, setIsGeneratingQR] = useState(false)
    const [qrCodeData, setQrCodeData] = useState<string | null>(null)
    const [useSharedMessage, setUseSharedMessage] = useState<string | null>(null)
    const [isConnecting, setIsConnecting] = useState(false)
    const [instanceMode, setInstanceMode] = useState<'OWN' | 'SHARED'>('OWN')
    const [savingInstanceMode, setSavingInstanceMode] = useState(false)
    const [reminderMessage, setReminderMessage] = useState('')
    const [budgetMessage, setBudgetMessage] = useState('')
    const reminderTextareaRef = useRef<any>(null)
    const budgetTextareaRef = useRef<any>(null)
    const manualMessageRef = useRef<any>(null)
    const dispatchCancelledRef = useRef(false)
    const qrContainerRef = useRef<HTMLDivElement>(null)
    const isSuperAdmin = currentUser?.is_super_admin === true

    const { data: customersList = [] } = useCustomers()
    const clientsWithPhone = (customersList as Customer[]).filter(
        c => (c.whatsapp_phone && c.whatsapp_phone.trim()) || (c.phone && c.phone.trim())
    )

    const [manualDispatchSelectedIds, setManualDispatchSelectedIds] = useState<string[]>([])
    const [manualMessageText, setManualMessageText] = useState('')
    const [dispatchProgress, setDispatchProgress] = useState<{
        sending: boolean
        current: number
        total: number
        lastClientName?: string
        countdown?: number
    } | null>(null)

    const fetchSettings = async () => {
        setLoading(true)
        try {
            const tenantId = await fetchTenantId()
            if (!tenantId) {
                messageApi.error('Não foi possível identificar o tenant.')
                return
            }
            const { data } = await supabase
                .from('tenant_settings')
                .select('*')
                .eq('tenant_id', tenantId)
                .single()

            if (data) {
                setTenantSettings(data)
                setInstanceMode((data.whatsapp_instance_mode as 'OWN' | 'SHARED') || 'OWN')
                setReminderMessage(data.whatsapp_reminder_message ?? '')
                setBudgetMessage(data.whatsapp_budget_message ?? '')
                setWaPhone(data.whatsapp_phone ?? null)
                setWaConnected(data.whatsapp_connected ?? false)
            }

            const statusRes = await fetch('/api/whatsapp/status')
            const statusData = await statusRes.json().catch(() => ({}))
            if (statusRes.ok && statusData.canSend) {
                setWaConnected(true)
            }
        } catch (error: any) {
            console.error('Erro ao carregar conectividade:', error)
            messageApi.error('Erro ao carregar: ' + (error.message || 'Erro desconhecido'))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSettings()
    }, [])

    async function handleSaveMessageTemplates() {
        try {
            if (!tenantSettings) return
            const { error } = await supabase
                .from('tenant_settings')
                .update({
                    whatsapp_reminder_message: reminderMessage || null,
                    whatsapp_budget_message: budgetMessage || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', tenantSettings.id)
            if (error) throw error
            messageApi.success('Templates de mensagem salvos!')
        } catch (error: any) {
            console.error('Erro ao salvar templates:', error)
            messageApi.error('Erro ao salvar: ' + (error.message || 'Erro desconhecido'))
        }
    }

    function insertVariable(
        variable: string,
        value: string,
        setter: (v: string) => void,
        ref: React.MutableRefObject<any>
    ) {
        const el = ref.current?.resizableTextArea?.textArea as HTMLTextAreaElement | null
        if (!el) {
            setter(value + variable)
            return
        }
        const start = el.selectionStart ?? value.length
        const end = el.selectionEnd ?? value.length
        const newVal = value.slice(0, start) + variable + value.slice(end)
        setter(newVal)
        setTimeout(() => {
            el.focus()
            el.setSelectionRange(start + variable.length, start + variable.length)
        }, 0)
    }

    function normalizeQrValue(value: unknown): string | null {
        if (typeof value === 'string' && value.trim()) {
            const s = value.trim()
            if (s.startsWith('data:') || s.startsWith('http')) return s
            return `data:image/png;base64,${s}`
        }
        if (value && typeof value === 'object' && 'url' in value) return (value as { url: string }).url
        if (value && typeof value === 'object' && 'data' in value) return normalizeQrValue((value as { data: unknown }).data)
        if (value && typeof value === 'object' && 'image' in value) return normalizeQrValue((value as { image: unknown }).image)
        return null
    }

    async function handleGenerateQR() {
        setIsGeneratingQR(true)
        setIsConnecting(true)
        setUseSharedMessage(null)
        setQrCodeData(null)
        try {
            const res = await fetch('/api/whatsapp/qr')
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                messageApi.error(data.error || `Erro ao obter QR (${res.status}).`)
                return
            }
            if (data.useShared) {
                setUseSharedMessage(data.message || 'Disparos usam o WhatsApp do administrador.')
                setQrCodeData(null)
                setIsGeneratingQR(false)
                return
            }
            if (data.alreadyConnected) {
                setWaConnected(true)
                messageApi.success('WhatsApp já está conectado!')
                setIsGeneratingQR(false)
                return
            }
            const qrRaw = data.qr ?? data.qrCode ?? data.data?.QRCode ?? data.data?.qrCode ?? data.data?.qr ?? data.data?.qrcode ?? data.data
            const qr = normalizeQrValue(qrRaw)
            if (qr) {
                setQrCodeData(qr)
                setUseSharedMessage(null)
                setIsGeneratingQR(false)
                messageApi.info('Escaneie o QR Code com seu WhatsApp.')
                requestAnimationFrame(() => {
                    qrContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                })
            } else {
                messageApi.error(data.error || 'Não foi possível obter o QR Code. Tente novamente.')
                setIsGeneratingQR(false)
            }
        } catch (e: any) {
            messageApi.error(e.message || 'Erro ao obter QR Code.')
        } finally {
            setIsGeneratingQR(false)
        }
    }

    async function handleInstanceModeChange(mode: 'OWN' | 'SHARED') {
        if (!isSuperAdmin) return
        setSavingInstanceMode(true)
        try {
            const res = await fetch('/api/whatsapp/instance-mode', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ whatsapp_instance_mode: mode }),
            })
            const data = await res.json().catch(() => ({}))
            if (res.ok) {
                setInstanceMode(mode)
                setTenantSettings(prev => prev ? { ...prev, whatsapp_instance_mode: mode } : null)
                messageApi.success('Modo de instância atualizado.')
            } else {
                messageApi.error(data.error || 'Erro ao salvar.')
            }
        } catch (e: any) {
            messageApi.error(e.message || 'Erro ao salvar.')
        } finally {
            setSavingInstanceMode(false)
        }
    }

    async function handleDisconnect() {
        try {
            const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' })
            if (res.ok) {
                setWaConnected(false)
                setWaPhone(null)
                setQrCodeData(null)
                setUseSharedMessage(null)
                setIsConnecting(false)
                messageApi.success('WhatsApp desconectado.')
            } else {
                const data = await res.json().catch(() => ({}))
                messageApi.error(data.error || 'Erro ao desconectar.')
            }
        } catch (e: any) {
            messageApi.error(e.message || 'Erro ao desconectar.')
        }
    }

    function getClientPhone(c: Customer): string {
        const raw = (c.whatsapp_phone && c.whatsapp_phone.trim() ? c.whatsapp_phone : c.phone) || ''
        const digits = raw.replace(/\D/g, '').trim()
        if (!digits) return ''
        if (digits.length <= 11 && !digits.startsWith('55')) return '55' + digits
        return digits
    }

    async function handleManualDispatch() {
        if (!manualMessageText.trim()) {
            messageApi.warning('Digite a mensagem para o disparo.')
            return
        }
        const selected = clientsWithPhone.filter(c => manualDispatchSelectedIds.includes(c.id))
        if (selected.length === 0) {
            messageApi.warning('Selecione pelo menos um cliente com telefone/WhatsApp.')
            return
        }
        dispatchCancelledRef.current = false
        setDispatchProgress({ sending: true, current: 0, total: selected.length })

        for (let i = 0; i < selected.length; i++) {
            if (dispatchCancelledRef.current) {
                setDispatchProgress(null)
                messageApi.info('Disparo cancelado.')
                return
            }
            const client = selected[i]
            const phone = getClientPhone(client)
            if (!phone) continue
            const text = manualMessageText.replace(/\{\{nome_cliente\}\}/gi, client.name || 'Cliente')

            setDispatchProgress({
                sending: true,
                current: i + 1,
                total: selected.length,
                lastClientName: client.name || undefined,
                countdown: undefined,
            })

            try {
                const res = await fetch('/api/whatsapp/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, text }),
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) {
                    messageApi.error(`Falha ao enviar para ${client.name}: ${data.error || res.status}`)
                    setDispatchProgress(null)
                    return
                }
            } catch (e: any) {
                messageApi.error(`Erro ao enviar para ${client.name}: ${e.message}`)
                setDispatchProgress(null)
                return
            }

            if (i < selected.length - 1) {
                for (let countdown = 60; countdown >= 0 && !dispatchCancelledRef.current; countdown--) {
                    setDispatchProgress(prev =>
                        prev
                            ? { ...prev, countdown: countdown }
                            : null
                    )
                    await new Promise(r => setTimeout(r, 1000))
                }
            }
        }

        setDispatchProgress(null)
        messageApi.success(`Disparo concluído: ${selected.length} mensagem(ns) enviada(s). Intervalo de 60s entre cada uma.`)
    }

    function cancelManualDispatch() {
        dispatchCancelledRef.current = true
    }

    return (
        <Layout title={PAGE_TITLES.CONNECTIVITY} subtitle="WhatsApp e templates de mensagem">
            {contextHolder}
            <div className="pc-card" style={{ minHeight: 'calc(100vh - 180px)', width: '100%' }}>
                {loading && !tenantSettings ? (
                    <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                ) : (
                    <div style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: '0 4px' }}>

                        {isSuperAdmin && (
                            <Card size="small" style={{ marginBottom: 24, borderRadius: 12 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Modo de instância WhatsApp</div>
                                <Radio.Group
                                    value={instanceMode}
                                    onChange={e => handleInstanceModeChange(e.target.value)}
                                    disabled={savingInstanceMode}
                                >
                                    <Radio value="OWN">Cada funcionário com seu WhatsApp</Radio>
                                    <Radio value="SHARED">Todos usam o WhatsApp do super admin (instância única)</Radio>
                                </Radio.Group>
                            </Card>
                        )}

                        {!isSuperAdmin && instanceMode === 'OWN' && (
                            <Alert
                                message="Sua conexão WhatsApp"
                                description="Cada usuário tem sua própria conexão. As mensagens (lembretes, orçamentos) serão enviadas pelo número que você conectar aqui — não pelo WhatsApp do admin ou de outros usuários."
                                type="info"
                                showIcon
                                icon={<UserOutlined />}
                                style={{ marginBottom: 24 }}
                            />
                        )}

                        <div style={{
                            padding: '16px 20px',
                            borderRadius: 12,
                            marginBottom: 24,
                            background: waConnected
                                ? 'linear-gradient(135deg, rgba(37,211,102,0.08), rgba(37,211,102,0.03))'
                                : isConnecting
                                    ? 'linear-gradient(135deg, rgba(247,144,9,0.08), rgba(247,144,9,0.03))'
                                    : 'linear-gradient(135deg, rgba(102,112,133,0.08), rgba(102,112,133,0.03))',
                            border: `1px solid ${waConnected ? 'rgba(37,211,102,0.2)' : isConnecting ? 'rgba(247,144,9,0.2)' : 'rgba(102,112,133,0.15)'}`,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                        width: 48, height: 48, borderRadius: 12,
                                        background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <WhatsAppOutlined style={{ fontSize: 24, color: '#FFF' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>
                                            WhatsApp Business
                                            <Tag
                                                color={waConnected ? 'success' : isConnecting ? 'warning' : 'default'}
                                                style={{ marginLeft: 8 }}
                                            >
                                                {waConnected ? 'Conectado' : isConnecting ? 'Conectando...' : 'Desconectado'}
                                            </Tag>
                                        </div>
                                        {waConnected && waPhone && (
                                            <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>{waPhone}</div>
                                        )}
                                        {!waConnected && !isConnecting && (
                                            <div style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>
                                                Escaneie o QR Code para conectar seu WhatsApp e habilitar disparos automáticos
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Space>
                                    {(waConnected || qrCodeData) && (
                                        <Button danger onClick={handleDisconnect} icon={<CloseCircleOutlined />}>
                                            Desconectar
                                        </Button>
                                    )}
                                    {!useSharedMessage && (
                                        <Button
                                            type="primary"
                                            onClick={handleGenerateQR}
                                            loading={isGeneratingQR}
                                            icon={<QrcodeOutlined />}
                                            style={{ background: '#25D366', borderColor: '#25D366' }}
                                        >
                                            {qrCodeData ? 'Gerar novo QR Code' : 'Conectar via QR Code'}
                                        </Button>
                                    )}
                                </Space>
                            </div>
                        </div>

                        {(isGeneratingQR || qrCodeData || useSharedMessage) && (
                            <div
                                ref={qrContainerRef}
                                style={{
                                    textAlign: 'center',
                                    padding: 32,
                                    borderRadius: 12,
                                    border: '2px dashed rgba(37,211,102,0.3)',
                                    background: 'rgba(37,211,102,0.02)',
                                    marginBottom: 24,
                                }}
                            >
                                {isGeneratingQR ? (
                                    <div>
                                        <Spin size="large" />
                                        <div style={{ marginTop: 12, color: 'var(--color-neutral-500)' }}>Gerando QR Code...</div>
                                    </div>
                                ) : useSharedMessage ? (
                                    <Alert
                                        message="Instância compartilhada"
                                        description={useSharedMessage}
                                        type="info"
                                        showIcon
                                        style={{ textAlign: 'left', maxWidth: 480, margin: '0 auto' }}
                                    />
                                ) : qrCodeData && (qrCodeData.startsWith('data:') || qrCodeData.startsWith('http')) ? (
                                    <div>
                                        {/* QR code container: white background required for scannability */}
                                        <div style={{
                                            width: 240, height: 240, margin: '0 auto 16px',
                                            background: '#FFF', borderRadius: 16,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            overflow: 'hidden',
                                            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                                        }}>
                                            <img key={qrCodeData.slice(0, 50)} src={qrCodeData} alt="QR Code WhatsApp" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        </div>
                                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Escaneie com seu WhatsApp</div>
                                        <div style={{ fontSize: 13, color: 'var(--color-neutral-400)', marginBottom: 16, maxWidth: 360, margin: '0 auto 16px' }}>
                                            Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar aparelho → Aponte para o QR Code acima
                                        </div>
                                        <Button icon={<ReloadOutlined />} onClick={handleGenerateQR}>Gerar Novo QR</Button>
                                    </div>
                                ) : (
                                    <div>
                                        {/* QR code container: white background required for scannability */}
                                        <div style={{
                                            width: 240, height: 240, margin: '0 auto 16px',
                                            background: '#FFF', borderRadius: 16,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                                        }}>
                                            <QrcodeOutlined style={{ fontSize: 120, color: '#f1f5f9' }} />
                                        </div>
                                        <Button icon={<ReloadOutlined />} onClick={handleGenerateQR}>Gerar Novo QR</Button>
                                    </div>
                                )}
                            </div>
                        )}

                        <Divider style={{ marginBottom: 24 }}>
                            <span style={{ fontSize: 13, color: 'var(--color-neutral-500)', fontWeight: 500 }}>
                                Templates de Mensagem Automática
                            </span>
                        </Divider>

                        <Alert
                            message={
                                <span>
                                    Use <Tag color="green" style={{ margin: '0 2px' }}>{'{{nome_cliente}}'}</Tag> para inserir o nome do cliente automaticamente na mensagem.
                                </span>
                            }
                            type="info"
                            showIcon
                            icon={<InfoCircleOutlined />}
                            style={{ borderRadius: 8, marginBottom: 20 }}
                        />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                            <Card
                                size="small"
                                style={{ borderRadius: 12, border: '1px solid rgba(37,211,102,0.2)', background: 'rgba(37,211,102,0.02)' }}
                                title={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(37,211,102,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <CalendarOutlined style={{ color: '#25D366', fontSize: 14 }} />
                                        </div>
                                        <span style={{ fontSize: 13, fontWeight: 600 }}>Lembrete de Agendamento</span>
                                        <Tooltip title="Enviado automaticamente para o cliente no dia anterior ao agendamento cadastrado na agenda.">
                                            <InfoCircleOutlined style={{ fontSize: 12, color: 'var(--color-neutral-400)' }} />
                                        </Tooltip>
                                    </div>
                                }
                            >
                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 8 }}>
                                    Disparado 24h antes do agendamento. Use as variáveis para personalizar a mensagem com nome, data e horário.
                                </div>
                                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                                    <span style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginRight: 2 }}>Inserir variável:</span>
                                    <Tag color="green" style={{ cursor: 'pointer', fontSize: 11 }} icon={<UserOutlined />} onClick={() => insertVariable('{{nome_cliente}}', reminderMessage, setReminderMessage, reminderTextareaRef)}>{'{{nome_cliente}}'}</Tag>
                                    <Tag color="blue" style={{ cursor: 'pointer', fontSize: 11 }} icon={<CalendarOutlined />} onClick={() => insertVariable('{{data_agendamento}}', reminderMessage, setReminderMessage, reminderTextareaRef)}>{'{{data_agendamento}}'}</Tag>
                                    <Tag color="orange" style={{ cursor: 'pointer', fontSize: 11 }} icon={<ClockCircleOutlined />} onClick={() => insertVariable('{{horario_agendamento}}', reminderMessage, setReminderMessage, reminderTextareaRef)}>{'{{horario_agendamento}}'}</Tag>
                                </div>
                                <Input.TextArea ref={reminderTextareaRef} rows={6} value={reminderMessage} onChange={e => setReminderMessage(e.target.value)} placeholder="Olá, {{nome_cliente}}! Lembrete do seu agendamento no dia {{data_agendamento}} às {{horario_agendamento}}." style={{ borderRadius: 8, resize: 'vertical', fontSize: 13 }} />
                            </Card>
                            <Card
                                size="small"
                                style={{ borderRadius: 12, border: '1px solid rgba(46,144,250,0.2)', background: 'rgba(46,144,250,0.02)' }}
                                title={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(46,144,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <FileTextOutlined style={{ color: '#2E90FA', fontSize: 14 }} />
                                        </div>
                                        <span style={{ fontSize: 13, fontWeight: 600 }}>Envio de Orçamento</span>
                                        <Tooltip title="Mensagem enviada junto com o orçamento pelo WhatsApp.">
                                            <InfoCircleOutlined style={{ fontSize: 12, color: 'var(--color-neutral-400)' }} />
                                        </Tooltip>
                                    </div>
                                }
                            >
                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 8 }}>
                                    Enviada ao cliente quando um orçamento é disparado pelo WhatsApp.
                                </div>
                                <div style={{ marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginRight: 6 }}>Inserir variável:</span>
                                    <Tag color="blue" style={{ cursor: 'pointer', fontSize: 11 }} icon={<UserOutlined />} onClick={() => insertVariable('{{nome_cliente}}', budgetMessage, setBudgetMessage, budgetTextareaRef)}>{'{{nome_cliente}}'}</Tag>
                                </div>
                                <Input.TextArea ref={budgetTextareaRef} rows={6} value={budgetMessage} onChange={e => setBudgetMessage(e.target.value)} placeholder="Olá, {{nome_cliente}}! Segue o orçamento solicitado." style={{ borderRadius: 8, resize: 'vertical', fontSize: 13 }} />
                            </Card>
                        </div>

                        <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveMessageTemplates} style={{ background: '#25D366', borderColor: '#25D366' }}>
                            Salvar Templates de Mensagem
                        </Button>

                        <Divider style={{ marginTop: 32, marginBottom: 24 }}>
                            <span style={{ fontSize: 13, color: 'var(--color-neutral-500)', fontWeight: 500 }}>
                                Disparo manual
                            </span>
                        </Divider>

                        <Card
                            size="small"
                            title={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(37,211,102,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <SendOutlined style={{ color: '#25D366', fontSize: 14 }} />
                                    </div>
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>Enviar mensagem para uma sequência de clientes</span>
                                </div>
                            }
                            style={{ borderRadius: 12, border: '1px solid rgba(37,211,102,0.2)', background: 'rgba(37,211,102,0.02)', marginBottom: 24 }}
                        >
                            <p style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 12 }}>
                                As mensagens são enviadas <strong>uma por vez</strong>, com <strong>intervalo de 60 segundos</strong> entre cada envio.
                            </p>
                            {!waConnected && (
                                <Alert type="warning" message="Conecte o WhatsApp acima para habilitar o disparo manual." style={{ marginBottom: 16 }} />
                            )}
                            <Alert
                                message={
                                    <span>
                                        Use <Tag color="green" style={{ margin: '0 2px' }}>{'{{nome_cliente}}'}</Tag> na mensagem para inserir o nome de cada cliente.
                                    </span>
                                }
                                type="info"
                                showIcon
                                icon={<InfoCircleOutlined />}
                                style={{ borderRadius: 8, marginBottom: 16 }}
                            />
                            <div style={{ marginBottom: 12 }}>
                                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginRight: 6 }}>Inserir variável:</span>
                                <Tag color="green" style={{ cursor: 'pointer', fontSize: 11 }} icon={<UserOutlined />} onClick={() => insertVariable('{{nome_cliente}}', manualMessageText, setManualMessageText, manualMessageRef)}>{'{{nome_cliente}}'}</Tag>
                            </div>
                            <Input.TextArea
                                ref={manualMessageRef}
                                rows={4}
                                value={manualMessageText}
                                onChange={e => setManualMessageText(e.target.value)}
                                placeholder="Ex.: Olá, {{nome_cliente}}! Mensagem personalizada..."
                                style={{ borderRadius: 8, resize: 'vertical', fontSize: 13, marginBottom: 16 }}
                                disabled={!waConnected || !!dispatchProgress?.sending}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>Selecione os clientes (com telefone/WhatsApp cadastrado):</span>
                                {clientsWithPhone.length > 0 && (
                                    <Space>
                                        <Button size="small" onClick={() => setManualDispatchSelectedIds(clientsWithPhone.map(c => c.id))} disabled={!!dispatchProgress?.sending}>
                                            Marcar todos
                                        </Button>
                                        <Button size="small" onClick={() => setManualDispatchSelectedIds([])} disabled={!!dispatchProgress?.sending}>
                                            Desmarcar todos
                                        </Button>
                                    </Space>
                                )}
                            </div>
                            <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, marginBottom: 16, background: 'rgba(255,255,255,0.04)' }}>
                                {clientsWithPhone.length === 0 ? (
                                    <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>Nenhum cliente com telefone ou WhatsApp cadastrado.</div>
                                ) : (
                                    <Checkbox.Group
                                        value={manualDispatchSelectedIds}
                                        onChange={vals => setManualDispatchSelectedIds(vals as string[])}
                                        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                    >
                                        {clientsWithPhone.map(c => (
                                            <Checkbox key={c.id} value={c.id} disabled={!!dispatchProgress?.sending}>
                                                <span style={{ fontSize: 13 }}>{c.name}</span>
                                                <span style={{ fontSize: 12, color: 'var(--color-neutral-400)', marginLeft: 6 }}>
                                                    ({(c.whatsapp_phone || c.phone || '').trim()})
                                                </span>
                                            </Checkbox>
                                        ))}
                                    </Checkbox.Group>
                                )}
                            </div>
                            {dispatchProgress?.sending && (
                                <div style={{ marginBottom: 16 }}>
                                    <Progress
                                        percent={dispatchProgress.total ? Math.round((dispatchProgress.current / dispatchProgress.total) * 100) : 0}
                                        status="active"
                                    />
                                    <div style={{ fontSize: 13, color: 'var(--color-neutral-600)', marginTop: 8 }}>
                                        Enviando {dispatchProgress.current} de {dispatchProgress.total}
                                        {dispatchProgress.lastClientName && ` — ${dispatchProgress.lastClientName}`}
                                        {typeof dispatchProgress.countdown === 'number' && (
                                            <span style={{ marginLeft: 8, fontWeight: 600 }}>Próximo em {dispatchProgress.countdown}s</span>
                                        )}
                                    </div>
                                </div>
                            )}
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<SendOutlined />}
                                    onClick={handleManualDispatch}
                                    loading={dispatchProgress?.sending}
                                    disabled={!waConnected || clientsWithPhone.length === 0 || manualDispatchSelectedIds.length === 0}
                                    style={{ background: '#25D366', borderColor: '#25D366' }}
                                >
                                    Enviar para sequência
                                </Button>
                                {dispatchProgress?.sending && (
                                    <Button icon={<StopOutlined />} onClick={cancelManualDispatch}>
                                        Cancelar
                                    </Button>
                                )}
                            </Space>
                        </Card>
                    </div>
                )}
            </div>
        </Layout>
    )
}

export default Conectividade
