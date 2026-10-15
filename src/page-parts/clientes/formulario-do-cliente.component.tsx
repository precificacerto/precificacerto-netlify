/**
 * formulario-do-cliente.component.tsx — o cadastro do cliente, UM SÓ.
 *
 * Era o `<Drawer>` de `clientes/index.tsx:1269`, que servia "Novo Cliente" e "Editar Cliente".
 * O Drawer DEIXOU DE EXISTIR: edição é `/clientes/[id]?aba=dados&editar=1`, e cadastro novo é
 * `/clientes/novo`. **Não há segunda tela de edição**, e esta é a razão de o formulário virar
 * componente em vez de ser copiado nas duas rotas — duas cópias seriam `copia-divergente.md`,
 * e a terceira edição acrescentaria um campo numa delas só.
 *
 * O CORPO DO FORMULÁRIO É O MESMO, campo por campo. O que mudou foi onde ele mora e para onde
 * ele volta depois de salvar.
 *
 * O bloco de RECORRÊNCIA veio junto (era `:1441`), com a mesma regra: só aparece com o
 * cliente já salvo, porque `recalcCustomerRecurrenceOnEdit` precisa do id.
 */

import React, { useEffect, useState } from 'react'
import { Button, Form, Input, InputNumber, Modal, Switch, message } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import { ReloadOutlined, WhatsAppOutlined } from '@ant-design/icons'
import VMasker from 'vanilla-masker'
import { cpf, cnpj } from 'cpf-cnpj-validator'

import { supabase } from '@/supabase/client'
import type { Customer } from '@/supabase/types'
import { useAuth } from '@/hooks/use-auth.hook'
import { recalcCustomerRecurrenceOnEdit } from '@/lib/customer-recurrence'
import { MAX_PHONE_MASKED_LENGTH, phoneMask, phoneRules } from '@/utils/phone-br'
import { SEGMENTOS_DE_CLIENTE, capitalizarPrimeira } from '@/constants/segmentos-de-cliente'

export interface FormularioDoClienteProps {
    /** O cliente em edição, ou `null` no cadastro novo. */
    cliente: Customer | null
    employees: { id: string; name: string }[]
    /** Chamado depois de gravar, com o id do cliente — o novo inclusive. */
    aoSalvar: (customerId: string) => void | Promise<void>
    aoCancelar: () => void
}

export function FormularioDoCliente({ cliente, employees, aoSalvar, aoCancelar }: FormularioDoClienteProps) {
    const [form] = Form.useForm()
    const [messageApi, contextHolder] = message.useMessage()
    const { currentUser, tenantId } = useAuth()
    const [saving, setSaving] = useState(false)
    const [recorrenciaAberta, setRecorrenciaAberta] = useState(false)
    const [recorrenciaAtiva, setRecorrenciaAtiva] = useState(false)
    const [recorrenciaDias, setRecorrenciaDias] = useState<number | null>(null)
    const [recorrenciaMensagem, setRecorrenciaMensagem] = useState('')
    const [recorrenciaSalvando, setRecorrenciaSalvando] = useState(false)

    const isSuperAdmin = currentUser?.is_super_admin === true
    const isAdminRole = isSuperAdmin || (currentUser?.role && String(currentUser.role).toLowerCase() === 'admin')
    const emEdicaoDe = cliente?.id ?? null

    useEffect(() => {
        if (cliente) {
            form.setFieldsValue(cliente)
            const r = cliente as any
            setRecorrenciaAtiva(Boolean(r.recurrence_active))
            setRecorrenciaDias(r.recurrence_days ?? null)
            setRecorrenciaMensagem(r.recurrence_message || '')
        } else {
            form.resetFields()
            form.setFieldsValue({ customer_type: 'PF', status: 'ACTIVE' })
            setRecorrenciaAtiva(false)
            setRecorrenciaDias(null)
            setRecorrenciaMensagem('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cliente])

    async function salvar() {
        try {
            const values = await form.validateFields()
            setSaving(true)

            const tenant_id = tenantId ?? currentUser?.tenant_id
            if (!tenant_id) {
                messageApi.error('Sessão expirada. Faça logout e login novamente.')
                return
            }

            if (values.whatsapp_phone) values.whatsapp_phone = values.whatsapp_phone.replace(/\D/g, '')

            const owner_id = isAdminRole ? (values.owner_id || null) : (currentUser?.employee_id ?? values.owner_id ?? null)

            const { owner_id: _omit, ...restValues } = values

            if (emEdicaoDe) {
                const { error } = await supabase
                    .from('customers')
                    .update({ ...restValues, owner_id, updated_at: new Date().toISOString() })
                    .eq('id', emEdicaoDe)

                if (error) throw error

                messageApi.success('Cliente atualizado!')
            } else {
                const { data: novoCliente, error } = await supabase
                    .from('customers')
                    .insert([{
                    ...restValues,
                    tenant_id,
                    owner_id,
                    status: restValues.status || 'ACTIVE',
                    customer_type: restValues.customer_type || 'PF',
                }])
                    .select()
                    .single()

                if (error) throw error
                await aoSalvar((novoCliente as { id: string }).id)
                return
            }

            await aoSalvar(emEdicaoDe)
        } catch (error: any) {
            console.error('Erro ao salvar:', error)
            messageApi.error('Erro ao salvar: ' + (error.message || 'Verifique os campos'))
        } finally {
            setSaving(false)
        }
    }

    async function salvarRecorrencia() {
        if (!emEdicaoDe) {
            messageApi.warning('Salve o cliente antes de configurar a recorrência.')
            return
        }
        if (recorrenciaAtiva) {
            if (!recorrenciaDias || recorrenciaDias <= 0) {
                messageApi.error('Informe o prazo em dias (maior que zero).')
                return
            }
            if (!recorrenciaMensagem.trim()) {
                messageApi.error('Escreva a mensagem que será enviada ao cliente.')
                return
            }
        }

        try {
            setRecorrenciaSalvando(true)
            const tenant_id = tenantId ?? currentUser?.tenant_id
            if (!tenant_id) {
                messageApi.error('Sessão expirada. Faça logout e login novamente.')
                return
            }

            const { error } = await (supabase as any)
                .from('customers')
                .update({
                    recurrence_active: recorrenciaAtiva,
                    recurrence_days: recorrenciaAtiva ? recorrenciaDias : null,
                    recurrence_message: recorrenciaAtiva ? recorrenciaMensagem : null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', emEdicaoDe)
            if (error) throw error

            const userId = currentUser?.uid
            if (userId) {
                await recalcCustomerRecurrenceOnEdit({
                    supabase,
                    tenantId: tenant_id,
                    customerId: emEdicaoDe,
                    userId,
                })
            }

            await aoSalvar(emEdicaoDe)
            messageApi.success(recorrenciaAtiva ? 'Recorrência configurada!' : 'Recorrência desativada.')
            setRecorrenciaAberta(false)
        } catch (err: any) {
            console.error('Erro ao salvar recorrência:', err)
            messageApi.error('Erro ao salvar recorrência: ' + (err.message || 'tente novamente'))
        } finally {
            setRecorrenciaSalvando(false)
        }
    }

    return (
        <>
            {contextHolder}
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="Nome / Razão Social" rules={[{ required: true, message: 'Informe o nome' }]}>
                        <Input placeholder="Nome completo ou razão social" onChange={(e) => form.setFieldsValue({ name: capitalizarPrimeira(e.target.value) })} />
                    </Form.Item>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                        <Form.Item name="customer_type" label="Tipo" rules={[{ required: true }]}>
                            <Select onChange={() => form.setFieldsValue({ document: '' })}>
                                <Select.Option value="PF">Pessoa Física</Select.Option>
                                <Select.Option value="PJ">Pessoa Jurídica</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item
                            shouldUpdate={(prev, curr) => prev.customer_type !== curr.customer_type}
                        >
                            {({ getFieldValue }) => {
                                const type = getFieldValue('customer_type') || 'PF'
                                const isPf = type === 'PF'
                                return (
                                    <Form.Item
                                        name="document"
                                        label={isPf ? "CPF" : "CNPJ"}
                                        rules={[
                                            {
                                                validator: (_, value) => {
                                                    if (!value) return Promise.resolve()
                                                    const clean = value.replace(/\D/g, '')
                                                    if (isPf) {
                                                        if (!cpf.isValid(clean)) return Promise.reject('CPF inválido')
                                                    } else {
                                                        if (!cnpj.isValid(clean)) return Promise.reject('CNPJ inválido')
                                                    }
                                                    return Promise.resolve()
                                                }
                                            }
                                        ]}
                                    >
                                        <Input
                                            placeholder={isPf ? "000.000.000-00" : "00.000.000/0000-00"}
                                            maxLength={isPf ? 14 : 18}
                                            onChange={(e) => {
                                                const value = e.target.value
                                                const masked = isPf
                                                    ? VMasker.toPattern(value, '999.999.999-99')
                                                    : VMasker.toPattern(value, '99.999.999/9999-99')
                                                form.setFieldsValue({ document: masked })
                                            }}
                                        />
                                    </Form.Item>
                                )
                            }}
                        </Form.Item>
                    </div>

                    <Form.Item name="email" label="Email">
                        <Input placeholder="email@exemplo.com" />
                    </Form.Item>

                    {/* WhatsApp para Disparos */}
                    <div style={{ background: 'linear-gradient(135deg, rgba(37,211,102,0.06), rgba(37,211,102,0.02))', border: '1px solid rgba(37,211,102,0.15)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <WhatsAppOutlined style={{ color: '#25D366' }} /> WhatsApp para Disparos
                        </div>
                        <Form.Item
                            name="whatsapp_phone"
                            label="Número WhatsApp"
                            style={{ marginBottom: 0 }}
                            rules={phoneRules('Informe o WhatsApp para disparos')}
                        >
                            <Input
                                placeholder="(00) 00000-0000"
                                maxLength={MAX_PHONE_MASKED_LENGTH}
                                onChange={(e) => form.setFieldsValue({ whatsapp_phone: phoneMask(e.target.value) })}
                            />
                        </Form.Item>
                        <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', marginTop: 4 }}>
                            {/* O texto anterior pedia "DDI + DDD + Número (ex: 5551999990000)" e CONTRADIZIA a
                                máscara, que corta em 11 dígitos. Quem manda é o envio: `normalizePhoneBR`
                                acrescenta o `55` sozinho quando o número tem até 11 dígitos. Guardar com DDI
                                faria o número cair no ramo errado da normalização. */}
                            Formato: DDD + número (ex: (51) 99999-0000). Usado para lembretes e envio de
                            orçamentos — o código do país é acrescentado no envio.
                        </div>
                    </div>

                    <Form.Item name="address" label="Endereço">
                        <Input placeholder="Rua, número, complemento" />
                    </Form.Item>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                        <Form.Item name="city" label="Cidade">
                            <Input placeholder="Cidade" />
                        </Form.Item>
                        <Form.Item name="state_code" label="Estado">
                            <Input placeholder="UF" maxLength={2} />
                        </Form.Item>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                        <Form.Item name="segment" label="Segmento">
                            <Select placeholder="Selecione" allowClear>
                                {SEGMENTOS_DE_CLIENTE.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                            </Select>
                        </Form.Item>
                        <Form.Item name="status" label="Status">
                            <Select>
                                <Select.Option value="ACTIVE">Ativo</Select.Option>
                                <Select.Option value="INACTIVE">Inativo</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item name="owner_id" label="Responsável (funcionário)">
                        <Select placeholder="Opcional — vincular a um funcionário ativo" allowClear>
                            {employees.map(e => (
                                <Select.Option key={e.id} value={e.id}>{e.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="notes" label="Observações">
                        <Input.TextArea rows={3} placeholder="Notas sobre o cliente..." />
                    </Form.Item>

                    {emEdicaoDe && (
                        <div style={{ background: 'linear-gradient(135deg, rgba(122,90,248,0.08), rgba(122,90,248,0.02))', border: '1px solid rgba(122,90,248,0.18)', padding: 12, borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ReloadOutlined style={{ color: '#7A5AF8' }} /> Recorrência de Contato
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', marginTop: 2 }}>
                                    {recorrenciaAtiva && recorrenciaDias
                                        ? `Ativa — disparo ${recorrenciaDias} dias após o último pedido`
                                        : 'Configure uma mensagem e um prazo em dias para disparo automático via WhatsApp.'}
                                </div>
                            </div>
                            <Button icon={<ReloadOutlined />} onClick={() => setRecorrenciaAberta(true)}>
                                {recorrenciaAtiva ? 'Editar' : 'Configurar'}
                            </Button>
                        </div>
                    )}
                </Form>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                <Button onClick={aoCancelar}>Cancelar</Button>
                <Button type="primary" onClick={salvar} loading={saving}>Salvar</Button>
            </div>
            {/* Recurrence Modal */}
            <Modal
                title={<span><ReloadOutlined style={{ marginRight: 8, color: '#7A5AF8' }} />Recorrência de Contato</span>}
                open={recorrenciaAberta}
                onCancel={() => setRecorrenciaAberta(false)}
                onOk={salvarRecorrencia}
                okText="Salvar"
                cancelText="Cancelar"
                confirmLoading={recorrenciaSalvando}
                destroyOnClose
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <Switch checked={recorrenciaAtiva} onChange={setRecorrenciaAtiva} />
                    <span style={{ fontSize: 13 }}>
                        {recorrenciaAtiva ? 'Recorrência ativa' : 'Recorrência desativada'}
                    </span>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Prazo para disparo (dias)</div>
                    <InputNumber
                        min={1}
                        placeholder="Ex.: 30"
                        value={recorrenciaDias ?? undefined}
                        onChange={(v) => setRecorrenciaDias(typeof v === 'number' ? v : null)}
                        style={{ width: '100%' }}
                        disabled={!recorrenciaAtiva}
                    />
                    <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', marginTop: 4 }}>
                        Contado a partir do último pedido do cliente. Uma nova venda zera o timer.
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Mensagem</div>
                    <Input.TextArea
                        rows={5}
                        placeholder="Ex.: Olá {{nome_cliente}}, sentimos sua falta! Passando para manter contato."
                        value={recorrenciaMensagem}
                        onChange={(e) => setRecorrenciaMensagem(e.target.value)}
                        disabled={!recorrenciaAtiva}
                    />
                    <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', marginTop: 4 }}>
                        Placeholder disponível: <code>{'{{nome_cliente}}'}</code>. A mensagem será enviada via WhatsApp (WuzAPI).
                    </div>
                </div>
            </Modal>
        </>
    )
}
