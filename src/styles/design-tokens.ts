/**
 * 🎨 Precifica Certo — Design System Tokens
 * Sprint 0.1 — Design System & Layout Base
 *
 * Central source of truth for all design tokens.
 * Used by Tailwind config, Ant Design theme, and components.
 */

// ============================================================
// 🎨 COLOR TOKENS
// ============================================================

export const colors = {
    // Primary Brand (Green — updated to match new design language)
    primary: {
        50: '#f0fdf4',
        100: '#dcfce7',
        200: '#bbf7d0',
        300: '#86efac',
        400: '#4ade80',
        500: '#3bd671', // hover
        600: '#22C55E', // ← PRIMARY
        700: '#16a34a',
        800: '#15803d',
        900: '#14532d', // active/pressed
        950: '#052e16',
    },

    // Neutral (Gray scale for light mode)
    neutral: {
        0: '#FFFFFF',
        25: '#FCFCFD',
        50: '#F8F9FB',
        100: '#F0F2F5',
        200: '#E4E7EC',
        300: '#CDD3DC',
        400: '#98A2B3',
        500: '#667085',
        600: '#475467',
        700: '#344054',
        800: '#1D2939',
        900: '#101828',
        950: '#0C111D',
    },

    // Semantic Colors
    success: {
        50: '#ECFDF3',
        500: '#12B76A',
        700: '#027A48',
    },
    warning: {
        50: '#FFFAEB',
        500: '#F79009',
        700: '#B54708',
    },
    error: {
        50: '#FEF3F2',
        500: '#F04438',
        700: '#B42318',
    },
    info: {
        50: '#EFF8FF',
        500: '#2E90FA',
        700: '#175CD3',
    },

    // Background (Dark Theme)
    background: {
        page: '#0a1628',
        card: '#111c2e',
        sidebar: '#070e1a',
        sidebarHover: 'rgba(255, 255, 255, 0.05)',
        sidebarActive: 'rgba(255, 255, 255, 0.10)',
        input: '#0f1a2e',
        overlay: 'rgba(0, 0, 0, 0.6)',
        elevated: '#162236',
    },

    // Sidebar
    sidebar: {
        bg: '#070e1a',
        text: '#94a3b8',
        textHover: '#ffffff',
        textActive: '#ffffff',
        accent: '#22C55E',
        itemHoverBg: 'rgba(255, 255, 255, 0.05)',
        itemActiveBg: 'rgba(255, 255, 255, 0.10)',
        border: 'rgba(255, 255, 255, 0.06)',
        sectionLabel: '#64748b',
    },

    // Text (Dark Theme — light on dark)
    text: {
        primary: '#f1f5f9',
        secondary: '#94a3b8',
        tertiary: '#64748b',
        placeholder: '#475569',
        disabled: '#334155',
        inverse: '#0a1628',
        link: '#22C55E',
        linkHover: '#4ade80',
        linkActive: '#16a34a',
    },

    // Border (Dark Theme)
    border: {
        primary: '#1e293b',
        secondary: 'rgba(255, 255, 255, 0.06)',
        focus: '#22C55E',
        error: '#F04438',
    },
} as const

// ============================================================
// 📐 SPACING TOKENS (8px grid)
// ============================================================

export const spacing = {
    0: '0px',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
} as const

// ============================================================
// ✏️ TYPOGRAPHY TOKENS
// ============================================================

export const typography = {
    fontFamily: {
        primary: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        mono: "'JetBrains Mono', 'Fira Code', monospace",
    },

    fontSize: {
        xs: '12px',
        sm: '14px',
        base: '16px',
        lg: '18px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '30px',
        '4xl': '36px',
    },

    fontWeight: {
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
    },

    lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
    },
} as const

// ============================================================
// 📏 LAYOUT TOKENS
// ============================================================

export const layout = {
    sidebar: {
        width: '230px',
        collapsedWidth: '64px',
        mobileBreakpoint: '768px',
    },

    container: {
        maxWidth: '1440px',
        padding: '24px',
        paddingMobile: '16px',
    },

    header: {
        height: '64px',
    },

    mobileNav: {
        height: '64px',
    },

    borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
    },
} as const

// ============================================================
// 🌊 SHADOW TOKENS
// ============================================================

export const shadows = {
    xs: '0px 1px 2px rgba(16, 24, 40, 0.05)',
    sm: '0px 1px 3px rgba(16, 24, 40, 0.10), 0px 1px 2px rgba(16, 24, 40, 0.06)',
    md: '0px 4px 8px -2px rgba(16, 24, 40, 0.10), 0px 2px 4px -2px rgba(16, 24, 40, 0.06)',
    lg: '0px 12px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)',
    xl: '0px 20px 24px -4px rgba(16, 24, 40, 0.08), 0px 8px 8px -4px rgba(16, 24, 40, 0.03)',
    sidebar: '2px 0px 8px rgba(16, 24, 40, 0.06)',
    card: '0px 1px 3px rgba(16, 24, 40, 0.08)',
} as const

// ============================================================
// ⚡ TRANSITION TOKENS
// ============================================================

export const transitions = {
    fast: '150ms ease',
    normal: '250ms ease',
    slow: '350ms ease',
} as const

// ============================================================
// 🐜 ANT DESIGN THEME TOKEN MAPPING
// ============================================================

export const antThemeToken = {
    // Brand
    colorPrimary: colors.primary[600],
    colorLink: colors.primary[600],
    colorLinkActive: colors.primary[700],
    colorLinkHover: colors.primary[400],

    // Typography
    fontFamily: typography.fontFamily.primary,
    fontSize: 14,
    fontSizeHeading1: 30,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 18,
    fontSizeHeading5: 16,

    // Layout
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    // Colors — Dark Theme
    colorBgContainer: colors.background.card,
    colorBgLayout: colors.background.page,
    colorBgElevated: colors.background.elevated,
    colorBorder: colors.border.primary,
    colorBorderSecondary: colors.border.secondary,
    colorText: colors.text.primary,
    colorTextSecondary: colors.text.secondary,
    colorTextTertiary: colors.text.tertiary,
    colorTextPlaceholder: colors.text.placeholder,
    colorTextDisabled: colors.text.disabled,
    colorBgBase: colors.background.page,
    colorBgSpotlight: colors.background.elevated,
    colorFillQuaternary: 'rgba(255,255,255,0.04)',
    colorFillTertiary: 'rgba(255,255,255,0.06)',
    colorFillSecondary: 'rgba(255,255,255,0.08)',
    colorFill: 'rgba(255,255,255,0.12)',
    colorBgTextHover: 'rgba(255,255,255,0.06)',
    colorBgTextActive: 'rgba(255,255,255,0.10)',

    // Feedback
    colorSuccess: colors.success[500],
    colorWarning: colors.warning[500],
    colorError: colors.error[500],
    colorInfo: colors.info[500],

    // Shadows (subtle on dark)
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)',
    boxShadowSecondary: '0px 4px 8px rgba(0, 0, 0, 0.3)',

    // Motion
    motionDurationFast: '150ms',
    motionDurationMid: '250ms',
    motionDurationSlow: '350ms',
}

// ============================================================
// 📱 BREAKPOINTS
// ============================================================

export const breakpoints = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
} as const

// ============================================================
// 🎛️ NAVIGATION ITEMS
// ============================================================

export interface NavItem {
    key: string
    label: string
    icon: string
    href: string
    adminOnly?: boolean
    hideForRepresentative?: boolean
}

export const navigationItems: NavItem[] = [
    { key: 'home', label: 'Home', icon: 'home', href: '/' },
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
    { key: 'cashier', label: 'Caixa', icon: 'wallet', href: '/caixa' },
    { key: 'items', label: 'Itens', icon: 'unordered-list', href: '/itens' },
    { key: 'products', label: 'Produtos', icon: 'appstore', href: '/produtos' },
    { key: 'stock', label: 'Estoque', icon: 'database', href: '/estoque' },
    { key: 'budgets', label: 'Orçamentos', icon: 'file-text', href: '/orcamentos-vendas' },
    { key: 'cashflow', label: 'Fluxo de Caixa', icon: 'fund', href: '/fluxo-caixa' },
    { key: 'calendar', label: 'Agenda', icon: 'calendar', href: '/agenda' },
    { key: 'reports', label: 'Relatórios', icon: 'bar-chart', href: '/relatorios' },
    { key: 'support', label: 'Suporte', icon: 'customer-service', href: '/suporte' },
    { key: 'settings', label: 'Configurações', icon: 'setting', href: '/configuracoes' },
    { key: 'users', label: 'Usuários', icon: 'team', href: '/admin/usuarios', adminOnly: true },
]
