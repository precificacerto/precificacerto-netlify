/** O seletor de nicho AGRUPADO POR MODELO (EPIC §5.5) — a mesma lista no credenciar e no editar. */
import React from 'react'
import { Select } from 'antd'
import { MODELOS, ROTULO_DO_MODELO, type Nicho } from '@/utils/atendimentos-ia-catalogo'

export function NichoSelect({ nichos, value, onChange }: { nichos: Nicho[]; value?: string; onChange: (id: string) => void }) {
    return (
        <Select
            style={{ width: '100%' }}
            placeholder={nichos.length ? 'Escolha o nicho' : 'Nenhum nicho cadastrado — crie um em Nichos'}
            value={value}
            onChange={onChange}
            options={MODELOS.map((m) => ({
                label: ROTULO_DO_MODELO[m],
                options: nichos.filter((n) => n.modelo === m).map((n) => ({ label: n.nome, value: n.id })),
            })).filter((g) => g.options.length > 0)}
            aria-label="Nicho"
        />
    )
}
