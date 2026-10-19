/** O seletor de nicho AGRUPADO POR MODELO (EPIC §5.5) — a mesma lista no credenciar e no editar. */
import React from 'react'
import { Select } from 'antd'
import { MODELOS, ROTULO_DO_MODELO, type Nicho } from '@/utils/atendimentos-ia-catalogo'

export const PLACEHOLDER_SEM_NICHO = 'Nenhum nicho cadastrado — crie um em Nichos'
export const PLACEHOLDER_COM_NICHO = 'Escolha o nicho'

export interface GrupoDeNichos { label: string; options: { label: string; value: string }[] }

/** Os grupos do seletor: um por modelo, na ordem de `MODELOS`, sem grupo vazio. */
export function gruposDoSeletor(nichos: Nicho[]): GrupoDeNichos[] {
    return MODELOS.map((m) => ({
        label: ROTULO_DO_MODELO[m],
        options: nichos.filter((n) => n.modelo === m).map((n) => ({ label: n.nome, value: n.id })),
    })).filter((g) => g.options.length > 0)
}

export function NichoSelect({ nichos, value, onChange }: { nichos: Nicho[]; value?: string; onChange: (id: string) => void }) {
    return (
        <Select
            style={{ width: '100%' }}
            placeholder={nichos.length ? PLACEHOLDER_COM_NICHO : PLACEHOLDER_SEM_NICHO}
            value={value}
            onChange={onChange}
            options={gruposDoSeletor(nichos)}
            aria-label="Nicho"
        />
    )
}
