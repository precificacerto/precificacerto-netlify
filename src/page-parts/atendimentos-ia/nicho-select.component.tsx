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

/**
 * `disabled`, `placeholder` e `allowClear` entraram no bloco 2C.1 (configuração da conta), todos
 * opcionais: sem eles o seletor é o mesmo do credenciamento. `placeholder` só substitui o padrão
 * quando quem chama sabe dizer mais — p.ex. "escolha o modelo primeiro", em vez de "nenhum nicho
 * cadastrado" sobre uma lista que está vazia só porque o modelo não foi escolhido.
 */
export function NichoSelect({ nichos, value, onChange, disabled, placeholder, allowClear }: {
    nichos: Nicho[]
    value?: string
    onChange: (id: string | undefined) => void
    disabled?: boolean
    placeholder?: string
    allowClear?: boolean
}) {
    return (
        <Select
            style={{ width: '100%' }}
            placeholder={placeholder ?? (nichos.length ? PLACEHOLDER_COM_NICHO : PLACEHOLDER_SEM_NICHO)}
            value={value}
            onChange={onChange}
            disabled={disabled}
            allowClear={allowClear}
            options={gruposDoSeletor(nichos)}
            aria-label="Nicho"
        />
    )
}
