/**
 * orcamentista-na-lista.component.tsx — a coluna "Orçamentista" da lista de contas do super admin,
 * e a ficha que ela abre.
 *
 * Bloco 1 (18/10/2026). O super admin liga numa conta, desliga na outra, e na ficha define o
 * valor do adicional e o teto de consumo com a ação ao atingi-lo. NENHUMA tela do tenant mexe
 * nisto — o tenant só lê a própria linha, e a tela dele é o bloco 2.
 *
 * TRÊS ESTADOS NA CÉLULA, e não dois: configuração CARREGANDO, INDISPONÍVEL (a rota falhou — por
 * exemplo, migração ainda não aplicada) e CONHECIDA. Indisponível mostra travessão e o switch
 * NÃO aparece: um switch desligado afirmaria "desligado" sobre um estado que ninguém leu
 * (`ausente-vs-falso.md`). Conta SEM linha, com a lista lida, é desligada — aí sim é fato.
 */

import React, { useEffect, useState } from 'react'
import { Button, InputNumber, Modal, Select, Space, Switch, Tag, Tooltip } from 'antd'

import { formatBRL } from '@/utils/formatters'
import {
    ACOES_AO_ATINGIR_TETO,
    ROTULO_DA_ACAO,
    type AcaoAoAtingirTeto,
    type ConfigDoOrcamentista,
    type CorpoDaConfig,
} from '@/utils/orcamentista-config'

export const TITULO_DA_COLUNA_ORCAMENTISTA = 'Orçamentista'
export const ROTULO_ABRIR_FICHA = 'Ficha'
export const ROTULO_SALVAR_FICHA = 'Salvar configuração'
export const TEXTO_INDISPONIVEL = 'Configuração indisponível'

export type EstadoDaLeitura = 'CARREGANDO' | 'INDISPONIVEL' | 'OK'

/** O resumo da configuração numa linha — o que a célula mostra ao lado do switch. */
export function resumoDaConfig(c: ConfigDoOrcamentista | undefined): string {
    if (!c) return 'Nunca configurado'
    const partes: string[] = []
    partes.push(c.valor_adicional_brl === null ? 'adicional não definido' : `${formatBRL(c.valor_adicional_brl)}/mês`)
    partes.push(c.teto_de_consumo_brl === null
        ? 'sem teto'
        : `teto ${formatBRL(c.teto_de_consumo_brl)} · ${c.acao_ao_atingir_teto === 'BLOQUEAR' ? 'bloqueia' : 'avisa'}`)
    return partes.join(' · ')
}

export function CelulaDoOrcamentista({ tenantId, estado, config, salvando, aoAlternar, aoAbrirFicha }: {
    tenantId: string
    estado: EstadoDaLeitura
    config: ConfigDoOrcamentista | undefined
    salvando: boolean
    aoAlternar: (tenantId: string, ativo: boolean) => void
    aoAbrirFicha: (tenantId: string) => void
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
        <Space data-testid={`orcamentista-${tenantId}`} direction="vertical" size={2}>
            <Space size={6}>
                <Switch
                    size="small"
                    checked={config?.ativo === true}
                    loading={salvando}
                    onChange={(v) => aoAlternar(tenantId, v)}
                />
                <Button type="link" size="small" onClick={() => aoAbrirFicha(tenantId)}>{ROTULO_ABRIR_FICHA}</Button>
            </Space>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{resumoDaConfig(config)}</span>
        </Space>
    )
}

/** A ficha: os quatro campos do contrato, e só eles. */
export function FichaDoOrcamentista({ aberta, nomeDaConta, config, salvando, aoSalvar, aoFechar }: {
    aberta: boolean
    nomeDaConta: string
    config: ConfigDoOrcamentista | undefined
    salvando: boolean
    aoSalvar: (corpo: CorpoDaConfig) => void
    aoFechar: () => void
}) {
    const [ativo, setAtivo] = useState(false)
    const [valor, setValor] = useState<number | null>(null)
    const [teto, setTeto] = useState<number | null>(null)
    const [acao, setAcao] = useState<AcaoAoAtingirTeto | null>(null)

    // Ao abrir, a ficha parte do que está GRAVADO — nunca de um estado de outra conta.
    useEffect(() => {
        if (!aberta) return
        setAtivo(config?.ativo === true)
        setValor(config?.valor_adicional_brl ?? null)
        setTeto(config?.teto_de_consumo_brl ?? null)
        setAcao(config?.acao_ao_atingir_teto ?? null)
    }, [aberta, config])

    // Teto e ação andam juntos (a mesma regra da CHECK do banco).
    const incoerente = (teto === null) !== (acao === null)

    return (
        <Modal
            open={aberta}
            title={`Orçamentista — ${nomeDaConta}`}
            okText={ROTULO_SALVAR_FICHA}
            cancelText="Cancelar"
            confirmLoading={salvando}
            okButtonProps={{ disabled: incoerente }}
            onCancel={aoFechar}
            onOk={() => aoSalvar({ ativo, valor_adicional_brl: valor, teto_de_consumo_brl: teto, acao_ao_atingir_teto: acao })}
        >
            <div data-testid="ficha-do-orcamentista" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Switch checked={ativo} onChange={setAtivo} /> {ativo ? 'Ligado nesta conta' : 'Desligado nesta conta'}
                </label>
                <label>
                    <div>Valor do adicional (R$ por mês)</div>
                    <InputNumber data-testid="ficha-valor" min={0} precision={2} decimalSeparator="," style={{ width: 200 }}
                        value={valor ?? undefined} onChange={(v) => setValor(typeof v === 'number' ? v : null)} />
                </label>
                <label>
                    <div>Teto de consumo (R$ por mês) — vazio = sem teto</div>
                    <InputNumber data-testid="ficha-teto" min={0.01} precision={2} decimalSeparator="," style={{ width: 200 }}
                        value={teto ?? undefined}
                        onChange={(v) => { const n = typeof v === 'number' ? v : null; setTeto(n); if (n === null) setAcao(null) }} />
                </label>
                <label>
                    <div>Ao atingir o teto</div>
                    <Select data-testid="ficha-acao" style={{ width: 260 }} allowClear disabled={teto === null}
                        value={acao ?? undefined} placeholder={teto === null ? 'Defina o teto primeiro' : 'Escolha'}
                        onChange={(v) => setAcao((v ?? null) as AcaoAoAtingirTeto | null)}
                        options={ACOES_AO_ATINGIR_TETO.map((a) => ({ value: a, label: ROTULO_DA_ACAO[a] }))} />
                </label>
                {incoerente && <Tag color="orange">Com teto, escolha a ação ao atingi-lo.</Tag>}
                {config?.ativado_em && (
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Ativado em {new Date(config.ativado_em).toLocaleString('pt-BR')}
                    </span>
                )}
            </div>
        </Modal>
    )
}
