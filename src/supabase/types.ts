// =============================================================================
// Supabase Database Types — Aligned with actual schema
// =============================================================================

// ── Enums ──
export type EmployeeRole = 'PRODUCTIVE' | 'COMMERCIAL' | 'ADMINISTRATIVE'
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE'
export type CustomerType = 'PF' | 'PJ'
export type CustomerStatus = 'ACTIVE' | 'INACTIVE'
export type EventStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
export type BudgetStatus = 'DRAFT' | 'AWAITING_PAYMENT' | 'SENT' | 'APPROVED' | 'PAID' | 'EXPIRED' | 'REJECTED'
export type PaymentMethod = 'PIX' | 'DINHEIRO' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'BOLETO' | 'TRANSFERENCIA'
export type UserRole = 'ADMIN' | 'MANAGER' | 'SELLER'
export type TaxRegime = 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL' | 'MEI' | 'SIMPLES_HIBRIDO' | 'LUCRO_PRESUMIDO_RET'
export type UnitMeasure = 'UN' | 'KG' | 'L' | 'M' | 'M2' | 'M3' | 'H' | 'MIN' | 'G' | 'ML' | 'CM' | 'MM' | 'KM' | 'W'
export type CashDirection = 'INCOME' | 'EXPENSE'
export type CashCategoryType = 'REVENUE' | 'EXPENSE'
export type OrderStatus = 'PENDING' | 'APPROVED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
export type AllocationStatus = 'RESERVED' | 'PICKED' | 'CANCELLED'
export type DispatchTypeEnum = 'MESSAGE' | 'BUDGET' | 'REMINDER' | 'MARKETING'
export type DispatchStatusEnum = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
export type EventType = 'SERVICE' | 'MEETING' | 'DELIVERY' | 'FOLLOW_UP' | 'REMINDER' | 'OTHER'
export type PermissionModule = 'DASHBOARD' | 'SALES' | 'PRODUCTS' | 'FINANCIAL' | 'SETTINGS' | 'USERS'
export type ItemType = 'INSUMO' | 'REVENDA' | 'EMBALAGEM'
export type ProductTypeEnum = 'PRODUZIDO' | 'REVENDA'
export type SaleScope = 'INTRAESTADUAL' | 'INTERESTADUAL'
export type BuyerType = 'CONSUMIDOR_FINAL' | 'CONTRIBUINTE_PJ'

// ── Tenant ──
export interface Tenant {
    id: string
    name: string
    cnpj_cpf?: string | null
    segment?: string | null
    plan_status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'
    email?: string | null
    phone?: string | null
    cep?: string | null
    street?: string | null
    number?: string | null
    complement?: string | null
    neighborhood?: string | null
    city?: string | null
    state_code?: string | null
    logo_url?: string | null
    created_at: string
    updated_at: string
}

// ── Tenant Settings ──
export interface TenantSettings {
    id: string
    tenant_id: string
    tax_regime?: TaxRegime | null
    logo_url?: string | null
    currency?: string | null
    calc_type?: 'INDUSTRIALIZACAO' | 'SERVICO' | 'REVENDA' | null
    state_code?: string | null
    cnae_code?: string | null
    cnae_allows_ipi_credit?: boolean | null
    workload_unit?: 'MINUTES' | 'HOURS' | 'DAYS' | 'ACTIVITIES' | null
    monthly_workload?: number | null
    num_productive_employees?: number | null
    num_commercial_employees?: number | null
    num_administrative_employees?: number | null
    administrative_monthly_workload?: number | null
    simples_anexo?: string | null
    simples_revenue_12m?: number | null
    /** Número de meses do período do faturamento (média mensal = simples_revenue_12m / revenue_period_months). */
    revenue_period_months?: number | null
    lucro_presumido_activity?: string | null
    icms_contribuinte?: boolean | null
    iss_municipality_rate?: number | null
    tax_reduction_factor?: number | null
    whatsapp_connected?: boolean | null
    whatsapp_phone?: string | null
    n8n_webhook_url?: string | null
    whatsapp_reminder_message?: string | null
    whatsapp_budget_message?: string | null
    whatsapp_instance_mode?: 'OWN' | 'SHARED' | null
    whatsapp_shared_instance_user_id?: string | null
    onboarding_mirrored_to_cashflow?: boolean | null
    created_at: string
    updated_at: string
}

// ── Tenant Expense Config ──
export interface TenantExpenseConfig {
    id: string
    tenant_id: string
    indirect_labor_percent?: number | null
    fixed_expense_percent?: number | null
    variable_expense_percent?: number | null
    financial_expense_percent?: number | null
    production_labor_cost?: number | null
    // Admin labor fields from cashflow aggregation
    admin_salary_total?: number | null
    admin_fgts_total?: number | null
    admin_other_costs?: number | null
    admin_labor_percent?: number | null
    production_labor_percent?: number | null
    commission_percent?: number | null
    profit_margin_percent?: number | null
    taxable_regime_percent?: number | null
    updated_at?: string | null
}

// ── User ──
export interface User {
    id: string
    tenant_id: string
    email: string
    name?: string
    phone?: string | null
    cpf?: string | null
    avatar_url?: string | null
    role: UserRole
    is_active: boolean
    is_super_admin?: boolean
    work_schedule?: any
    max_discount_percent?: number
    can_give_discount?: boolean
    whatsapp_connected?: boolean
    created_at: string
    updated_at: string
}

// ── Employee ──
export interface Employee {
    id: string
    tenant_id: string
    name: string
    email?: string | null
    phone?: string | null
    document?: string | null
    role: EmployeeRole
    position?: string | null
    status: EmployeeStatus
    salary: number
    work_hours_per_day: number
    work_days_per_month: number
    hire_date?: string | null
    birth_date?: string | null
    notes?: string | null
    avatar_url?: string | null
    commission_percent?: number | null
    user_id?: string | null
    pending_permissions?: Record<string, any> | null
    created_at: string
    updated_at: string
}

export interface EmployeeInsert {
    tenant_id: string
    name: string
    email?: string
    phone?: string
    document?: string
    role?: EmployeeRole
    position?: string
    salary?: number
    work_hours_per_day?: number
    work_days_per_month?: number
    hire_date?: string
    birth_date?: string
    notes?: string
}

export interface EmployeeUpdate {
    name?: string
    email?: string
    phone?: string
    document?: string
    role?: EmployeeRole
    position?: string
    status?: EmployeeStatus
    salary?: number
    work_hours_per_day?: number
    work_days_per_month?: number
    hire_date?: string
    birth_date?: string
    notes?: string
}

// ── Customer ──
export interface Customer {
    id: string
    tenant_id: string
    name: string
    document?: string | null
    is_pj: boolean
    customer_type: CustomerType
    status: CustomerStatus
    email?: string | null
    phone?: string | null
    whatsapp_phone?: string | null
    birth_date?: string | null
    notes?: string | null
    address?: string | null
    cep?: string | null
    street?: string | null
    number?: string | null
    complement?: string | null
    neighborhood?: string | null
    city?: string | null
    state_code?: string | null
    segment?: string | null
    ie?: string | null
    is_icms_contributor?: boolean | null
    owner_id?: string | null
    created_at: string
    updated_at: string
}

export interface CustomerInsert {
    tenant_id: string
    name: string
    document?: string
    is_pj?: boolean
    customer_type?: CustomerType
    status?: CustomerStatus
    email?: string
    phone?: string
    whatsapp_phone?: string
    birth_date?: string
    notes?: string
    address?: string
    city?: string
    state_code?: string
    segment?: string
}

export interface CustomerUpdate {
    name?: string
    document?: string
    is_pj?: boolean
    customer_type?: CustomerType
    status?: CustomerStatus
    email?: string
    phone?: string
    whatsapp_phone?: string
    birth_date?: string
    notes?: string
    address?: string
    city?: string
    state_code?: string
    segment?: string
}

// ── Stock ──
export type StockType = 'ITEM' | 'PRODUCT'

export interface StockRecord {
    id: string
    tenant_id: string
    product_id?: string | null
    item_id?: string | null
    stock_type?: StockType | null
    quantity_current: number
    min_limit: number
    unit?: string | null
    created_at?: string
    updated_at: string
    items?: Item | null
    products?: Product | null
}

export interface StockMovement {
    id: string
    stock_id: string
    delta_quantity: number
    reason?: string | null
    created_at: string
    created_by?: string | null
}

// ── Production ──
export interface Production {
    id: string
    tenant_id: string
    product_id: string
    quantity: number
    notes?: string | null
    created_at: string
    created_by?: string | null
    products?: Product | null
}

export interface ProductionItem {
    id: string
    production_id: string
    item_id: string
    quantity_used: number
    unit?: string | null
    items?: Item | null
}

// ── Sales ──
export interface Sale {
    id: string
    tenant_id: string
    product_id?: string | null
    order_id?: string | null
    invoice_number?: string | null
    quantity?: number
    unit_price?: number
    final_value: number
    customer_id?: string | null
    employee_id?: string | null
    description?: string | null
    status?: string | null
    sale_date: string
    created_at: string
    created_by?: string | null
    products?: Product | null
    customers?: Customer | null
    employees?: { id: string; name: string } | null
}


// ── Item ──
export interface Item {
    id: string
    tenant_id: string
    name: string
    code?: string | null
    item_type?: ItemType | null
    cost_price: number
    cost_gross?: number | null
    cost_net?: number | null
    cost_per_base_unit?: number | null
    unit?: UnitMeasure | null
    base_unit?: UnitMeasure | null
    ncm_code?: string | null
    nbs_code?: string | null
    has_st?: boolean | null
    is_monofasico?: boolean | null
    supplier_name?: string | null
    supplier_state?: string | null
    supplier_id?: string | null
    quantity?: number | null
    observation?: string | null
    created_at: string
    updated_at: string
    supplier?: Supplier | null
}

// ── Product ──
export interface Product {
    id: string
    tenant_id: string
    name: string
    sku?: string | null
    code?: string | null
    product_type?: ProductTypeEnum | null
    base_item_id?: string | null
    sale_price: number
    cost_total?: number | null
    description?: string | null
    unit?: UnitMeasure | null
    yield_quantity?: number | null
    yield_unit?: UnitMeasure | null
    ncm_code?: string | null
    nbs_code?: string | null
    price_table_a?: number | null
    price_table_b?: number | null
    price_table_c?: number | null
    price_table_d?: number | null
    custom_tax_percent?: number | null
    recurrence_days?: number | null
    profit_percent?: number | null
    commission_percent?: number | null
    max_discount_percent?: number | null
    status?: string | null
    quantity?: number | null
    created_at: string
    updated_at: string
}

// ── Cashier ──
export interface CashierCategory {
    id: string
    tenant_id: string
    name: string
    type: CashCategoryType
    is_calculable_in_dre?: boolean | null
    created_at: string
}

export interface CashierMonth {
    id: string
    tenant_id: string
    month_year: string
    total_in: number
    total_out: number
    balance: number
    created_at: string
    updated_at: string
    created_by?: string | null
}

export interface CashEntry {
    id: string
    tenant_id: string
    cashier_month_id?: string | null
    category_id?: string | null
    type: CashDirection
    amount: number
    due_date?: string | null
    paid_date?: string | null
    description?: string | null
    payment_method?: PaymentMethod | null
    origin_type?: 'MANUAL' | 'SALE' | 'FIXED_EXPENSE' | 'SALARY' | null
    origin_id?: string | null
    contact_id?: string | null
    created_at: string
    created_by?: string | null
    cashier_categories?: CashierCategory | null
}

export interface FixedExpense {
    id: string
    tenant_id: string
    description: string
    amount: number
    due_day: number
    category_id?: string | null
    is_active: boolean
    created_at: string
    updated_at: string
    category?: CashierCategory | null
}

// ── Budget ──
export interface Budget {
    id: string
    tenant_id: string
    customer_id?: string | null
    status: BudgetStatus
    total_value: number
    expiration_date?: string | null
    payment_method?: PaymentMethod | null
    installments?: number
    paid_date?: string | null
    notes?: string | null
    sale_id?: string | null
    created_at: string
    updated_at: string
    created_by?: string | null
    customer?: Customer | null
}

export interface BudgetItem {
    id: string
    budget_id: string
    product_id: string | null
    quantity: number
    unit_price: number
    discount: number
    created_at: string
    manual_description?: string | null
    products?: Product | null
}

// ── Calendar Event ──
export interface CalendarEvent {
    id: string
    tenant_id: string
    user_id?: string | null
    customer_id?: string | null
    employee_id?: string | null
    title: string
    start_time: string
    end_time: string
    status: EventStatus
    event_type: EventType
    description?: string | null
    created_at: string
    customer?: Customer | null
    employee?: { id: string; name: string } | null
    service_id?: string | null
    service?: { id: string; name: string; base_price?: number } | null
    amount_charged?: number | null
    payment_method?: string | null
}

// ── Service ──
export interface Service {
    id: string
    tenant_id: string
    name: string
    description?: string | null
    estimated_duration_minutes: number
    base_price: number
    cost_total?: number | null
    labor_minutes?: number | null
    labor_cost?: number | null
    commission_percent?: number | null
    profit_percent?: number | null
    taxable_regime_percent?: number | null
    recurrence_days?: number | null
    status: 'ACTIVE' | 'INACTIVE'
    created_at: string
    updated_at: string
    service_items?: ServiceItem[]
}

export interface ServiceItem {
    id: string
    service_id: string
    item_id: string
    quantity: number
    cost_per_base_unit?: number | null
    item_quantity_snapshot?: number | null
    created_at: string
    item?: { id: string; name: string; unit?: string | null; cost_price?: number; quantity?: number } | null
}

// ── Schedule Employee ──
export interface ScheduleEmployee {
    id: string
    tenant_id: string
    employee_id: string
    created_at: string
    employee?: { id: string; name: string; position?: string | null; avatar_url?: string | null } | null
}

// ── Brazilian State (reference table) ──
export interface BrazilianState {
    id: number
    code: string
    name: string
    icms_internal_rate: number
    created_at?: string | null
}

// ── Report Snapshot ──
export interface ReportSnapshot {
    id: string
    tenant_id: string
    report_type: string
    generated_at: string
    filters_used?: any | null
    file_url?: string | null
    data_blob?: any | null
    created_by?: string | null
}

// ── Supplier ──
export interface Supplier {
    id: string
    tenant_id: string
    name: string
    cnpj_cpf?: string | null
    email?: string | null
    phone?: string | null
    state_code?: string | null
    city?: string | null
    address?: string | null
    observation?: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

// ── Tenant Invitation ──
export interface TenantInvitation {
    id: string
    tenant_id: string
    email: string
    role: UserRole
    invited_by: string
    token: string
    accepted_at?: string | null
    expires_at: string
    created_at: string
}

// ── WhatsApp Dispatch ──
export interface WhatsappDispatch {
    id: string
    tenant_id: string
    customer_id?: string | null
    budget_id?: string | null
    calendar_event_id?: string | null
    sent_by: string
    type: DispatchTypeEnum
    status: DispatchStatusEnum
    phone: string
    message_body?: string | null
    error_message?: string | null
    sent_at?: string | null
    delivered_at?: string | null
    read_at?: string | null
    created_at: string
    customer?: Customer | null
}

// ── Permission ──
export interface Permission {
    id: string
    code: string
    description: string
    module: PermissionModule
}

// Legacy type aliases kept for backward compatibility
export type WhatsappStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'
export type DispatchType = DispatchTypeEnum
export type DispatchStatus = DispatchStatusEnum
