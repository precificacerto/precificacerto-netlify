/**
 * orcamentista-na-lista.component.tsx — a coluna "Atendimentos I.A." da lista de contas do super
 * admin: o liga/desliga por conta, e só ele.
 *
 * Bloco 1 (18/10/2026) criou a coluna com o interruptor, um resumo e a ficha de configuração.
 * Bloco 2A (18/10/2026) a deixou SÓ com o interruptor: o resumo e a ficha saíram desta tela, e a
 * configuração vai para a seção própria do Atendimentos I.A. (bloco 2C). A ficha não foi guardada
 * para lá: ela editava `valor_adicional_brl` e `acao_ao_atingir_teto`, que deixaram de ter uso no
 * produto (`docs/registros/o-teto-que-virou-projecao.md`). Está no histórico do git, no commit
 * que criou este arquivo.
 *
 * TRÊS ESTADOS NA CÉLULA, e não dois: configuração CARREGANDO, INDISPONÍVEL (a rota falhou — por
 * exemplo, migração ainda não aplicada) e CONHECIDA. Indisponível mostra travessão e o switch
 * NÃO aparece: um switch desligado afirmaria "desligado" sobre um estado que ninguém leu
 * (`ausente-vs-falso.md`). Conta SEM linha, com a lista lida, é desligada — aí sim é fato.
 */

import React from 'react'
import { Switch, Tooltip } from 'antd'

import type { ConfigDoOrcamentista } from '@/utils/orcamentista-config'

/**
 * O RÓTULO DE TELA é "Atendimentos I.A." desde o bloco 2A (18/10/2026). Só o rótulo: a chave do
 * módulo (`orcamentista`), a rota (`/api/super-admin/orcamentista`) e a tabela
 * (`orcamentista_config`) NÃO mudam de nome.
 */
export const TITULO_DA_COLUNA_ORCAMENTISTA = 'Atendimentos I.A.'
export const TEXTO_INDISPONIVEL = 'Configuração indisponível'

export type EstadoDaLeitura = 'CARREGANDO' | 'INDISPONIVEL' | 'OK'

export function CelulaDoOrcamentista({ tenantId, estado, config, salvando, aoAlternar }: {
    tenantId: string
    estado: EstadoDaLeitura
    config: ConfigDoOrcamentista | undefined
    salvando: boolean
    aoAlternar: (tenantId: string, ativo: boolean) => void
}) {
    if (estado === 'CARREGANDO') return <span data-testid={`orcamentista-${tenantId}`}>…</span>
    if (estado === 'INDISPONIVEL') {
        return (
            <Tooltip title={TEXTO_INDISPONIVEL}>
                <span data-testid={`orcamentista-${tenantId}`} style={{ color: 'var(--color-text-secondary)' }}>—</span>
            </Tooltip>
        )
    }
    return (
        <span data-testid={`orcamentista-${tenantId}`}>
            <Switch
                size="small"
                checked={config?.ativo === true}
                loading={salvando}
                onChange={(v) => aoAlternar(tenantId, v)}
            />
        </span>
    )
}
