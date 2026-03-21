import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { Button, Table, Radio, Checkbox, message, Spin, Tag } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import Link from 'next/link'
import { Layout } from '@/components/layout/layout.component'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/use-auth.hook'
import { MODULES, type ModuleKey } from '@/hooks/use-permissions.hook'
import { ROUTES } from '@/constants/routes'
import { PERMISSIONS } from '@/shared/enums/permissions'

const MODULE_LABELS: Record<string, string> = {
  home: 'Início',
  customers: 'Clientes',
  items: 'Itens',
  products: 'Produtos',
  budgets: 'Orçamentos',
  sales: 'Vendas',
  sales_report: 'Relatório de Vendas',
  stock: 'Estoque',
  cashier: 'Caixa',
  cash_flow: 'Controle Financeiro',
  dfc: 'Análise Financeira',
  commission: 'Comissão de Vendedor',
  employees: 'Funcionários',
  reports: 'Relatórios',
  agenda: 'Agenda',
  services: 'Serviços',
  connectivity: 'Conectividade',
}

type PermissionRow = {
  module: string
  label: string
  can_view: boolean
  can_edit: boolean
}

type ItemRecord = {
  id: string
  name: string
}

export default function EmployeePermissions() {
  const router = useRouter()
  const { id: employeeId } = router.query
  const { currentUser, tenantId } = useAuth()
  const effectiveTenantId = tenantId ?? currentUser?.tenant_id
  const [messageApi, contextHolder] = message.useMessage()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [employeeName, setEmployeeName] = useState('')
  const [employeeUserId, setEmployeeUserId] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [itemAccessMode, setItemAccessMode] = useState<'all' | 'specific'>('all')
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [allItems, setAllItems] = useState<ItemRecord[]>([])

  const isAdmin = currentUser?.permissions?.find((p) => p === PERMISSIONS.ADMIN)
  const canManagePermissions = currentUser?.is_super_admin === true || !!isAdmin

  useEffect(() => {
    if (!canManagePermissions && !loading) {
      router.replace(ROUTES.EMPLOYEES)
    }
  }, [canManagePermissions, loading, router])

  useEffect(() => {
    if (!employeeId || !effectiveTenantId) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, effectiveTenantId])

  async function loadData() {
    setLoading(true)
    try {
      const tenantId = effectiveTenantId!

      const [empRes, permsRes, itemAccessRes, itemsRes] = await Promise.all([
        supabase.from('employees').select('name, user_id').eq('id', employeeId as string).single(),
        supabase.from('user_module_permissions').select('module, can_view, can_edit')
          .eq('tenant_id', tenantId),
        supabase.from('user_item_access').select('item_id, access_all_items')
          .eq('tenant_id', tenantId),
        supabase.from('items').select('id, name').eq('tenant_id', tenantId).order('name'),
      ])

      if (!empRes.data) {
        messageApi.error('Funcionário não encontrado')
        router.replace(ROUTES.EMPLOYEES)
        return
      }

      setEmployeeName(empRes.data.name)
      setEmployeeUserId(empRes.data.user_id)
      setAllItems(itemsRes.data || [])

      if (!empRes.data.user_id) {
        const grantableModules = (Object.values(MODULES) as string[]).filter(m => m !== MODULES.USERS_MANAGEMENT)
        const allModules = grantableModules.map(m => ({
          module: m,
          label: MODULE_LABELS[m] || m,
          can_view: false,
          can_edit: false,
        }))
        setPermissions(allModules)
        setLoading(false)
        return
      }

      const userPermsRes = await supabase.from('user_module_permissions')
        .select('module, can_view, can_edit')
        .eq('user_id', empRes.data.user_id)
        .eq('tenant_id', tenantId)

      const userItemAccessRes = await supabase.from('user_item_access')
        .select('item_id, access_all_items')
        .eq('user_id', empRes.data.user_id)
        .eq('tenant_id', tenantId)

      const permsMap: Record<string, { can_view: boolean; can_edit: boolean }> = {}
      userPermsRes.data?.forEach(p => {
        permsMap[p.module] = { can_view: p.can_view ?? false, can_edit: p.can_edit ?? false }
      })

      const grantableModules = (Object.values(MODULES) as string[]).filter(m => m !== MODULES.USERS_MANAGEMENT)
      const allModules = grantableModules.map(m => ({
        module: m,
        label: MODULE_LABELS[m] || m,
        can_view: permsMap[m]?.can_view ?? false,
        can_edit: permsMap[m]?.can_edit ?? false,
      }))
      setPermissions(allModules)

      const hasAll = userItemAccessRes.data?.some(i => i.access_all_items) ?? false
      if (hasAll) {
        setItemAccessMode('all')
        setSelectedItemIds([])
      } else {
        const ids = userItemAccessRes.data?.filter(i => i.item_id).map(i => i.item_id!) ?? []
        setItemAccessMode(ids.length > 0 ? 'specific' : 'all')
        setSelectedItemIds(ids)
      }
    } catch (error: any) {
      console.error('Error loading permissions:', error)
      messageApi.error('Erro ao carregar permissões')
    } finally {
      setLoading(false)
    }
  }

  type PermLevel = 'none' | 'view' | 'edit'
  function permLevel(r: PermissionRow): PermLevel {
    if (!r.can_view) return 'none'
    return r.can_edit ? 'edit' : 'view'
  }
  function setPermLevel(module: string, level: PermLevel) {
    setPermissions(prev => prev.map(p =>
      p.module === module
        ? { ...p, can_view: level !== 'none', can_edit: level === 'edit' }
        : p
    ))
  }

  async function handleSave() {
    if (!employeeUserId) {
      messageApi.warning('Este funcionário ainda não tem acesso à plataforma. Envie um convite primeiro.')
      return
    }

    setSaving(true)
    try {
      const tenantId = effectiveTenantId!

      await supabase.from('user_module_permissions')
        .delete()
        .eq('user_id', employeeUserId)
        .eq('tenant_id', tenantId)

      const moduleRows = permissions.map(p => ({
        tenant_id: tenantId,
        user_id: employeeUserId,
        module: p.module,
        can_view: p.can_view,
        can_edit: p.can_edit,
        granted_by: currentUser!.uid,
      }))

      const { error: modError } = await supabase.from('user_module_permissions').insert(moduleRows)
      if (modError) throw modError

      await supabase.from('user_item_access')
        .delete()
        .eq('user_id', employeeUserId)
        .eq('tenant_id', tenantId)

      if (itemAccessMode === 'all') {
        const { error: itemError } = await supabase.from('user_item_access').insert({
          tenant_id: tenantId,
          user_id: employeeUserId,
          access_all_items: true,
          item_id: null,
          granted_by: currentUser!.uid,
        })
        if (itemError) throw itemError
      } else if (selectedItemIds.length > 0) {
        const itemRows = selectedItemIds.map(itemId => ({
          tenant_id: tenantId,
          user_id: employeeUserId,
          item_id: itemId,
          access_all_items: false,
          granted_by: currentUser!.uid,
        }))
        const { error: itemError } = await supabase.from('user_item_access').insert(itemRows)
        if (itemError) throw itemError
      }

      messageApi.success('Permissões salvas com sucesso!')
    } catch (error: any) {
      console.error('Error saving permissions:', error)
      messageApi.error('Erro ao salvar permissões: ' + (error.message || ''))
    } finally {
      setSaving(false)
    }
  }

  if (!canManagePermissions) {
    return null
  }

  const columns = [
    {
      title: 'Módulo',
      dataIndex: 'label',
      key: 'label',
      width: 200,
    },
    {
      title: 'Permissão',
      key: 'permission',
      render: (_: any, record: PermissionRow) => (
        <Radio.Group
          size="small"
          value={permLevel(record)}
          onChange={(e) => setPermLevel(record.module, e.target.value)}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="none">Não ver</Radio.Button>
          <Radio.Button value="view">Visualizar</Radio.Button>
          <Radio.Button value="edit">Editar</Radio.Button>
        </Radio.Group>
      ),
    },
  ]

  return (
    <Layout title="Permissões do Funcionário" subtitle={employeeName || 'Carregando...'}>
      {contextHolder}

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href={ROUTES.EMPLOYEES}>
          <Button icon={<ArrowLeftOutlined />}>Voltar para Funcionários</Button>
        </Link>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          disabled={!employeeUserId}
        >
          Salvar Permissões
        </Button>
      </div>

      {!employeeUserId && !loading && (
        <div style={{
          background: 'var(--color-warning-50, #FFF8E1)',
          border: '1px solid var(--color-warning-200, #FFE082)',
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
        }}>
          Este funcionário ainda não possui acesso à plataforma. Envie um convite na página de funcionários para
          poder configurar as permissões.
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : (
        <>
          <div className="pc-card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Módulos</h3>
            <Table
              columns={columns}
              dataSource={permissions}
              rowKey="module"
              pagination={false}
              size="middle"
            />
          </div>

          <div className="pc-card">
            <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Itens para Orçamento</h3>
            <Radio.Group
              value={itemAccessMode}
              onChange={(e) => setItemAccessMode(e.target.value)}
              style={{ marginBottom: 16 }}
            >
              <Radio value="all">Todos os itens</Radio>
              <Radio value="specific">Itens específicos</Radio>
            </Radio.Group>

            {itemAccessMode === 'specific' && (
              <div style={{
                maxHeight: 300,
                overflowY: 'auto',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 12,
              }}>
                <Checkbox.Group
                  value={selectedItemIds}
                  onChange={(values) => setSelectedItemIds(values as string[])}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {allItems.map(item => (
                    <Checkbox key={item.id} value={item.id}>
                      {item.name}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
                {allItems.length === 0 && (
                  <div style={{ color: 'var(--color-neutral-400)', fontSize: 13 }}>
                    Nenhum item cadastrado no tenant.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  )
}
