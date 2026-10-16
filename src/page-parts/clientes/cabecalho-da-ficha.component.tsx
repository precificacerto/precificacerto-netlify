/**
 * cabecalho-da-ficha.component.tsx — o cabeçalho da ficha, visível em QUALQUER aba.
 *
 * VENCIDO É SEPARADO DE "A RECEBER", e em destaque. São estados diferentes, e somar os dois
 * esconde o que faz alguém pegar o telefone — é a mesma regra da coluna partida da lista,
 * aplicada ao cliente em vez de à linha.
 *
 * OS NÚMEROS NÃO VÊM DE CONSULTA NOVA. As compras saem das entradas que a ficha já carregou;
 * o que se deve sai de `parcelas-do-cliente.ts` com `escopo: 'TODAS'`, sobre a mesma carga
 * que a lista usa. `hoje` é injetado nos dois.
 *
 * TRAVESSÃO, NUNCA R$ 0,00. Cliente sem parcela não tem agregado, e `formatBRL(0)` afirmaria
 * que ele não deve nada — a mesma afirmação para quem deve zero e para quem não tem
 * lançamento (`ausente-vs-falso.md`).
 */

import React from 'react'
import { Button, Tag, Tooltip } from 'antd'
import { DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons'

import { formatBRL } from '@/utils/formatters'
import { telefoneExibivel } from '@/utils/phone-br'
import {
    RESSALVA_TOTAL_COMPRADO,
    ROTULO_TOTAL_COMPRADO,
    type ResumoDoCliente,
} from '@/utils/resumo-do-cliente'
import {
    ROTULO_MAIS_INFORMACOES,
    informacoesExtras,
    temAlgumaInformacaoExtra,
    type ClienteComInformacoesExtras,
} from '@/utils/informacoes-extras-do-cliente'

export const ROTULO_A_RECEBER = 'A receber'
export const ROTULO_VENCIDO = 'Vencido'
export const ROTULO_MAIOR_ATRASO = 'Maior atraso'
export const ROTULO_SEM_VENCIMENTO_FICHA = 'Sem vencimento'

export interface CabecalhoDaFichaProps {
    nome: string
    whatsapp?: string | null
    telefone?: string | null
    situacao?: string | null
    /** O cliente inteiro, para o bloco "Mais informações". */
    cliente: ClienteComInformacoesExtras
    /** Resolve o nome do vendedor responsável a partir do `owner_id`. */
    resolverResponsavel: (ownerId: string) => string | null
    /** `?mais=1` na URL. O bloco abre NA PRÓPRIA PÁGINA, nunca em modal ou drawer. */
    maisAberto: boolean
    aoAlternarMais: (aberto: boolean) => void
    /** `true` na aba DADOS em edição: ali o bloco aparece SEMPRE, porque é onde se preenche. */
    emEdicao: boolean
    /** `true` quando o cliente tem parcela lançada. Decide travessão × R$ 0,00. */
    temCobranca: boolean
    resumo: ResumoDoCliente
    /**
     * Abre um orçamento NOVO com este cliente já selecionado.
     *
     * Só é renderizado quando existe — o botão nasceu junto com a leitura de `?cliente=`
     * em `orcamentos/index.tsx`. Enquanto aquela tela não lia o parâmetro, o botão abriria
     * o formulário EM BRANCO, prometendo o que não cumpre.
     */
    aoNovoOrcamento?: () => void
}

export const ROTULO_NOVO_ORCAMENTO = 'Novo orçamento'

const TRAVESSAO = '—'

function Indicador({ rotulo, valor, destaque, ressalva }: {
    rotulo: string
    valor: React.ReactNode
    destaque?: boolean
    ressalva?: string
}) {
    return (
        <div style={{ minWidth: 150 }}>
            <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {rotulo}
                {ressalva && (
                    <Tooltip title={ressalva}>
                        <span style={{ marginLeft: 4, opacity: 0.8 }}>({ressalva})</span>
                    </Tooltip>
                )}
            </div>
            <div style={{
                fontSize: destaque ? 20 : 16,
                fontWeight: destaque ? 800 : 600,
                color: destaque ? 'var(--color-danger-600, #b42318)' : undefined,
                fontVariantNumeric: 'tabular-nums',
            }}>
                {valor}
            </div>
        </div>
    )
}

export function CabecalhoDaFicha(props: CabecalhoDaFichaProps) {
    const { resumo, temCobranca } = props
    const telefone = telefoneExibivel({ whatsapp: props.whatsapp, fixo: props.telefone })
    const dinheiro = (v: number) => (temCobranca ? formatBRL(v) : TRAVESSAO)
    const extras = informacoesExtras(props.cliente, props.resolverResponsavel)
    // Em EDIÇÃO o bloco aparece sempre — é onde se preenche. Em consulta, só com conteúdo.
    const mostrarBotaoDeMais = props.emEdicao || temAlgumaInformacaoExtra(props.cliente)
    const blocoAberto = props.emEdicao ? props.maisAberto : props.maisAberto && mostrarBotaoDeMais

    return (
        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                {/* CABEÇALHO ENXUTO: nome, telefone e situação. Documento, cidade/UF e
                    e-mail saem para "Mais informações" — não é o que se olha ao abrir. */}
                <span style={{ fontSize: 20, fontWeight: 800 }}>{props.nome}</span>
                {/* Telefone inválido NÃO é exibido nem truncado — `telefoneExibivel` devolve
                    `null`, e a linha simplesmente não aparece. 65 dos 79 `phone` da base
                    estão fora da faixa de um telefone brasileiro. */}
                {telefone ? <span style={{ color: 'var(--color-neutral-400)' }}>{telefone}</span> : null}
                {props.situacao ? <Tag>{props.situacao}</Tag> : null}
                {mostrarBotaoDeMais && (
                    <Button
                        size="small"
                        type="link"
                        icon={props.maisAberto ? <UpOutlined /> : <DownOutlined />}
                        onClick={() => props.aoAlternarMais(!props.maisAberto)}
                    >
                        {ROTULO_MAIS_INFORMACOES}
                    </Button>
                )}
                <div style={{ flex: 1 }} />
                {props.aoNovoOrcamento && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={props.aoNovoOrcamento}>
                        {ROTULO_NOVO_ORCAMENTO}
                    </Button>
                )}
            </div>

            {blocoAberto && (
                <div
                    data-testid="bloco-mais-informacoes"
                    style={{ marginBottom: 14, padding: 12, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}
                >
                    {extras.map((info) => (
                        <div key={info.rotulo} style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
                            <span style={{ minWidth: 190, color: 'var(--color-neutral-400)', fontSize: 12 }}>{info.rotulo}</span>
                            {/* Travessão, nunca string vazia (`ausente-vs-falso.md`). */}
                            <span style={{ fontSize: 13 }}>{info.valor ?? TRAVESSAO}</span>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 14 }}>
                <Indicador
                    rotulo={ROTULO_TOTAL_COMPRADO}
                    ressalva={RESSALVA_TOTAL_COMPRADO}
                    valor={resumo.numeroDeCompras > 0 ? formatBRL(resumo.totalComprado) : TRAVESSAO}
                />
                <Indicador
                    rotulo="Ticket médio"
                    valor={resumo.ticketMedio === null ? TRAVESSAO : formatBRL(resumo.ticketMedio)}
                />
                <Indicador rotulo="Última compra" valor={resumo.ultimaCompra ?? TRAVESSAO} />
                <Indicador rotulo="Nº de compras" valor={resumo.numeroDeCompras} />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                <Indicador rotulo={ROTULO_A_RECEBER} valor={dinheiro(resumo.aReceber)} />
                <Indicador rotulo={ROTULO_VENCIDO} valor={dinheiro(resumo.vencido)} destaque />
                <Indicador
                    rotulo={ROTULO_MAIOR_ATRASO}
                    valor={resumo.maiorAtrasoDias === null
                        ? TRAVESSAO
                        : resumo.maiorAtrasoDias === 1 ? '1 dia' : `${resumo.maiorAtrasoDias} dias`}
                />
                {/* A terceira linha só existe quando há o que mostrar. Um indicador
                    permanentemente em R$ 0,00 treina o olho a ignorá-lo. */}
                {resumo.semVencimento > 0 && (
                    <Indicador rotulo={ROTULO_SEM_VENCIMENTO_FICHA} valor={formatBRL(resumo.semVencimento)} />
                )}
            </div>
        </div>
    )
}
