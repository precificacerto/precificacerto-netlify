/**
 * selecao-de-clientes.component.tsx — a caixa de seleção do envio para sequência.
 *
 * Maquete aprovada pelo dono do produto em 17/10/2026. A regra da seleção está em
 * `src/utils/selecao-paginada.ts`; aqui mora a forma:
 *
 * - SEM ROLAGEM INTERNA. A caixa tinha `maxHeight: 220; overflow: auto` — uma lista dentro de
 *   uma página, com duas barras de rolagem. Agora quem rola é a página. Há portão afirmando que
 *   a lista não tem altura máxima nem overflow.
 * - CABEÇALHO E RODAPÉ NAS PONTAS DA CAIXA, `position: sticky`: com a página rolando, os três
 *   botões ficam no topo e o contador + enviar no pé, sem precisar rolar para agir.
 * - PAGINAÇÃO de `PAGE_SIZE_SELECAO_DE_SEQUENCIA`, com o `<Pagination>` do antd e o mesmo
 *   `showTotal(total, range)` de `data-table.component.tsx` — o padrão do repositório, não um
 *   segundo.
 * - CHECKBOX POR ID, um a um, e não `Checkbox.Group`: o grupo devolve no `onChange` só as opções
 *   que ele tem registradas, e com paginação apagaria os marcados das outras páginas.
 */

import React, { useEffect, useState } from 'react'
import { Button, Checkbox, Pagination, Space } from 'antd'
import { SendOutlined } from '@ant-design/icons'

import { PAGE_SIZE_SELECAO_DE_SEQUENCIA } from '@/constants/pagination'
import {
    ROTULO_LIMPAR_SELECAO,
    alternar,
    faixaDaPagina,
    itensDaPagina,
    marcarPagina,
    paginaValida,
    rotuloMarcarPagina,
    rotuloMarcarTodos,
    textoDoContador,
    textoMostrando,
} from '@/utils/selecao-paginada'

export interface ClienteSelecionavel {
    id: string
    name: string
    telefone: string
}

export const ROTULO_ENVIAR_PARA_SEQUENCIA = 'Enviar para sequência'
export const TEXTO_SEM_CLIENTES = 'Nenhum cliente com telefone ou WhatsApp cadastrado.'

export interface SelecaoDeClientesProps {
    clientes: readonly ClienteSelecionavel[]
    selecionados: string[]
    aoMudarSelecao: (ids: string[]) => void
    /** Durante o envio, nada se marca nem se desmarca. */
    enviando: boolean
    /** Outro motivo de não enviar (WhatsApp desconectado). A seleção vazia é tratada aqui. */
    envioBloqueado: boolean
    aoEnviar: () => void
    /** Progresso e Cancelar, que a página já monta — ficam logo acima do rodapé. */
    progresso?: React.ReactNode
    acoesExtras?: React.ReactNode
    /** Injetável só para o portão; a tela usa a constante. */
    tamanhoDaPagina?: number
}

export function SelecaoDeClientes({
    clientes, selecionados, aoMudarSelecao, enviando, envioBloqueado, aoEnviar, progresso, acoesExtras,
    tamanhoDaPagina = PAGE_SIZE_SELECAO_DE_SEQUENCIA,
}: SelecaoDeClientesProps) {
    const [pagina, setPagina] = useState(1)
    const atual = paginaValida(clientes.length, pagina, tamanhoDaPagina)
    // A lista encolheu (cliente excluído, telefone apagado): a página clampada vira o estado.
    useEffect(() => { if (atual !== pagina) setPagina(atual) }, [atual, pagina])

    const daPagina = itensDaPagina(clientes, atual, tamanhoDaPagina)
    const idsDaPagina = daPagina.map((c) => c.id)
    const marcados = new Set(selecionados)
    const nestaPagina = idsDaPagina.filter((id) => marcados.has(id)).length
    const faixa = faixaDaPagina(clientes.length, atual, tamanhoDaPagina)

    return (
        <div
            data-testid="caixa-de-selecao"
            style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, marginBottom: 16, background: 'rgba(255,255,255,0.04)' }}
        >
            <div
                data-testid="cabecalho-da-selecao"
                style={{
                    position: 'sticky', top: 0, zIndex: 2, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8,
                    justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--color-neutral-50)', borderBottom: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px 8px 0 0',
                }}
            >
                <span style={{ fontSize: 13, fontWeight: 600 }}>Selecione os clientes (com telefone/WhatsApp cadastrado):</span>
                {clientes.length > 0 && (
                    <Space wrap>
                        <Button size="small" disabled={enviando} onClick={() => aoMudarSelecao(marcarPagina(selecionados, idsDaPagina))}>
                            {rotuloMarcarPagina(idsDaPagina.length)}
                        </Button>
                        <Button size="small" disabled={enviando} onClick={() => aoMudarSelecao(clientes.map((c) => c.id))}>
                            {rotuloMarcarTodos(clientes.length)}
                        </Button>
                        <Button size="small" disabled={enviando || selecionados.length === 0} onClick={() => aoMudarSelecao([])}>
                            {ROTULO_LIMPAR_SELECAO}
                        </Button>
                    </Space>
                )}
            </div>

            {/* SEM `maxHeight` e SEM `overflow`: quem rola é a página. */}
            <div data-testid="lista-de-selecao" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {clientes.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>{TEXTO_SEM_CLIENTES}</div>
                ) : (
                    daPagina.map((c) => (
                        <Checkbox
                            key={c.id}
                            data-id={c.id}
                            checked={marcados.has(c.id)}
                            disabled={enviando}
                            onChange={(e) => aoMudarSelecao(alternar(selecionados, c.id, e.target.checked))}
                        >
                            <span style={{ fontSize: 13 }}>{c.name}</span>
                            <span style={{ fontSize: 12, color: 'var(--color-neutral-400)', marginLeft: 6 }}>({c.telefone})</span>
                        </Checkbox>
                    ))
                )}
            </div>

            {clientes.length > 0 && (
                <div data-testid="barra-de-paginacao" style={{ padding: '0 12px 12px', display: 'flex', justifyContent: 'flex-end' }}>
                    <Pagination
                        size="small"
                        current={atual}
                        pageSize={tamanhoDaPagina}
                        total={clientes.length}
                        showSizeChanger={false}
                        showTotal={() => textoMostrando(faixa)}
                        onChange={(p) => setPagina(p)}
                    />
                </div>
            )}

            {progresso && <div style={{ padding: '0 12px 12px' }}>{progresso}</div>}

            <div
                data-testid="rodape-da-selecao"
                style={{
                    position: 'sticky', bottom: 0, zIndex: 2, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8,
                    justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--color-neutral-50)', borderTop: '1px solid rgba(255,255,255,0.08)', borderRadius: '0 0 8px 8px',
                }}
            >
                <span data-testid="contador-da-selecao" style={{ fontSize: 13 }}>
                    {textoDoContador(selecionados.length, clientes.length, nestaPagina)}
                </span>
                <Space>
                    <Button
                        type="primary"
                        data-testid="botao-enviar-sequencia"
                        icon={<SendOutlined />}
                        onClick={aoEnviar}
                        loading={enviando}
                        disabled={envioBloqueado || clientes.length === 0 || selecionados.length === 0}
                        style={{ background: '#25D366', borderColor: '#25D366' }}
                    >
                        {ROTULO_ENVIAR_PARA_SEQUENCIA}
                    </Button>
                    {acoesExtras}
                </Space>
            </div>
        </div>
    )
}
