/**
 * O USUÁRIO DO CÁLCULO a partir de `tenant_settings`: o tipo de cálculo, a carga horária, a unidade, a equipe produtiva e o regime — os campos
 * que o motor do produto lê do `currentUser`. Módulo puro: o `auth.context` monta o usuário logado daqui, e o servidor da cadeia do "sim" do
 * orçamento I.A. (dono do produto, 11/11/2026) monta o MESMO, sem uma segunda cópia do mapa (`copia-divergente.md`). Movido do `auth.context`
 * sem alteração.
 */
export const MAPA_DO_TIPO_DE_CALCULO: Record<string, string> = {
  INDUSTRIALIZACAO: 'INDUSTRIALIZATION',
  SERVICO: 'SERVICE',
  REVENDA: 'RESALE',
  INDUSTRIALIZATION: 'INDUSTRIALIZATION',
  SERVICE: 'SERVICE',
  RESALE: 'RESALE',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a linha de `tenant_settings` como o `auth.context` sempre a leu (select *)
export function usuarioDoCalculo(settings: any) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do enum vem do chamador, como no `auth.context`
    calcType: (MAPA_DO_TIPO_DE_CALCULO[settings?.calc_type] || settings?.calc_type || null) as any,
    monthlyWorkloadInMinutes: settings?.monthly_workload ? Number(settings.monthly_workload) : 0,
    unitMeasure: settings?.workload_unit || null,
    numProductiveSectorEmployee: settings?.num_productive_employees ?? 1,
    taxableRegime: settings?.tax_regime || null,
  }
}
