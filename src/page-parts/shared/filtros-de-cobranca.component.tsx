/**
 * filtros-de-cobranca.component.tsx — a barra dos três filtros de cobrança.
 *
 * CONTROLADO: recebe `filtros` e `onChange`, não guarda estado. Quem guarda é a URL, por
 * `useFiltrosDeCobrancaNaUrl` — ver o cabeçalho daquele arquivo para a razão.
 *
 * EM ATRASO e A VENCER são INTERRUPTORES INDEPENDENTES, não um seletor de três posições.
 * Os dois ligados significam "quem me deve qualquer coisa", e essa pergunta existe.
 *
 * O RÓTULO DA FAIXA DIZ "Vencimento entre", nunca "período". "Período" não diz de QUAL data
 * se fala — e nesta tela há duas candidatas, o vencimento e a data da venda. O rótulo é
 * regra, não redação: ele vem de `ROTULO_DA_FAIXA_DE_VENCIMENTO`.
 *
 * O atalho escreve a FAIXA RESOLVIDA, não o nome dele. Ver `filtros-de-cobranca.ts`.
 */

import React from 'react'
import { Button, DatePicker, Space, Switch, Tooltip } from 'antd'
import dayjs from 'dayjs'

import {
    ATALHOS_DE_ATRASO,
    ATALHOS_DE_VENCIMENTO,
    ROTULO_DA_FAIXA_DE_VENCIMENTO,
    faixaDoAtalhoDeAtraso,
    faixaDoAtalhoDeVencimento,
    type FiltrosDeCobranca,
} from '@/utils/filtros-de-cobranca'
import type { DiaISO } from '@/utils/parcelas-do-cliente'

export interface FiltrosDeCobrancaProps {
    filtros: FiltrosDeCobranca
    onChange: (proximos: FiltrosDeCobranca) => void
    /** PARÂMETRO, nunca o relógio: é contra ele que "este mês" e "7 dias" são resolvidos. */
    hoje: DiaISO
}

const ROTULO_EM_ATRASO = 'Em atraso'
const ROTULO_A_VENCER = 'A vencer'

export function FiltrosDeCobrancaBar({ filtros, onChange, hoje }: FiltrosDeCobrancaProps) {
    const trocar = (parcial: Partial<FiltrosDeCobranca>) => onChange({ ...filtros, ...parcial })

    const atrasoAtivo = (de: number, ate: number | null) =>
        filtros.atrasoDe === de && filtros.atrasoAte === ate

    const vencimentoAtivo = (de: DiaISO, ate: DiaISO) =>
        filtros.venceDe === de && filtros.venceAte === ate

    return (
        <div className="filtros-de-cobranca" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <Space size={8}>
                <Switch
                    size="small"
                    checked={filtros.emAtraso}
                    onChange={(v) => trocar({ emAtraso: v })}
                    aria-label={ROTULO_EM_ATRASO}
                />
                <span>{ROTULO_EM_ATRASO}</span>
            </Space>

            <Space size={8}>
                <Switch
                    size="small"
                    checked={filtros.aVencer}
                    onChange={(v) => trocar({ aVencer: v })}
                    aria-label={ROTULO_A_VENCER}
                />
                <span>{ROTULO_A_VENCER}</span>
            </Space>

            <Space size={4} wrap>
                {ATALHOS_DE_ATRASO.map((a) => {
                    const faixa = faixaDoAtalhoDeAtraso(a.chave)
                    const ativo = atrasoAtivo(faixa.de, faixa.ate)
                    return (
                        <Button
                            key={a.chave}
                            size="small"
                            type={ativo ? 'primary' : 'default'}
                            onClick={() =>
                                trocar(
                                    ativo
                                        ? { atrasoDe: null, atrasoAte: null }
                                        : { atrasoDe: faixa.de, atrasoAte: faixa.ate, emAtraso: true },
                                )
                            }
                        >
                            {a.rotulo}
                        </Button>
                    )
                })}
            </Space>

            <Space size={8} wrap>
                <span>{ROTULO_DA_FAIXA_DE_VENCIMENTO}</span>
                <DatePicker.RangePicker
                    size="small"
                    format="DD/MM/YYYY"
                    allowEmpty={[true, true]}
                    value={[
                        filtros.venceDe ? dayjs(filtros.venceDe) : null,
                        filtros.venceAte ? dayjs(filtros.venceAte) : null,
                    ]}
                    onChange={(valores) =>
                        trocar({
                            venceDe: valores?.[0] ? valores[0].format('YYYY-MM-DD') : null,
                            venceAte: valores?.[1] ? valores[1].format('YYYY-MM-DD') : null,
                        })
                    }
                />
                {ATALHOS_DE_VENCIMENTO.map((a) => {
                    const faixa = faixaDoAtalhoDeVencimento(a.chave, hoje)
                    const ativo = vencimentoAtivo(faixa.de, faixa.ate)
                    return (
                        <Tooltip key={a.chave} title={`${faixa.de} a ${faixa.ate}`}>
                            <Button
                                size="small"
                                type={ativo ? 'primary' : 'default'}
                                onClick={() =>
                                    trocar(
                                        ativo
                                            ? { venceDe: null, venceAte: null }
                                            // O atalho NÃO liga interruptor: período é ortogonal a
                                            // estado, e "este mês" + EM ATRASO é escolha do usuário.
                                            : { venceDe: faixa.de, venceAte: faixa.ate },
                                    )
                                }
                            >
                                {a.rotulo}
                            </Button>
                        </Tooltip>
                    )
                })}
            </Space>
        </div>
    )
}
