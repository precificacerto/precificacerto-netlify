/**
 * A CONFIRMAÇÃO DA REMOÇÃO SOBERANA — a mesma para família, fornecedor, motor e etapa do catálogo (dono do produto, 31/10/2026; migração
 * 20261031000003). "A remoção é soberana. [...] Família, fornecedor, motor e etapa."
 *
 * Ao abrir, a tela MEDE (GET, nada é apagado) e mostra o arrasto inteiro: o que SAI e o que FICA E PERDE O VÍNCULO (por tipo de linha, a quantidade
 * e até dez nomes, "e mais N"), o que fica sem ser tocado (Storage, texto, categorias da conta), os AVISOS — entre eles, o EXPLÍCITO de que a
 * conversa de uma empresa PARA quando sai uma tabela com motor (decisão 4; sai quando o PR D entrar) — e os IMPEDIMENTOS. O botão Remover só
 * acende com a caixa de confirmação marcada e sem impedimento. Se o arrasto mudar entre a medição e o clique, a rota recusa (409) com o NOVO, a
 * tela o mostra e pede a confirmação de novo. A falha de leitura aparece como ERRO, nunca como arrasto vazio (`ausente-vs-falso.md`).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Checkbox, Modal, Space, Spin, Typography } from 'antd'
import { ErroDaRota, chamarRota } from '@/page-parts/atendimentos-ia/api'
import {
    CONFIRMO_O_ARRASTO, ROTA_DA_REMOCAO, fraseDoAviso, fraseDoImpedimento, lerArrasto, nomesComOResto, passosQueMexem, resumoDoArrasto, rotaDoArrasto,
    rotuloDoPasso, rotuloDoQueFica, tituloDaRemocao, type Arrasto, type PassoDoArrasto, type TipoDeRemocao,
} from '@/utils/atendimentos-ia-remocao'

export interface AlvoDaRemocao { tipo: TipoDeRemocao; chave: string; nome: string }

interface Props {
    alvo: AlvoDaRemocao | null
    onFechar: () => void
    /** Chamado depois de removido, com o arrasto que saiu. */
    onRemovido: (feito: Arrasto) => void
}

export const MEDINDO_O_ARRASTO = 'Medindo o que sai…'
export const ARRASTO_NAO_LIDO = 'Não foi possível medir o que sai. Nada foi removido.'

function Passo({ p }: { p: PassoDoArrasto }) {
    const nomes = nomesComOResto(p.nomes, p.mais)
    return (
        <li data-passo={`${p.tabela}:${p.acao}`}>
            <strong>{p.quantidade.toLocaleString('pt-BR')}</strong> {rotuloDoPasso(p)}{nomes && <Typography.Text type="secondary">: {nomes}</Typography.Text>}
        </li>
    )
}

export function RemocaoDoCatalogo({ alvo, onFechar, onRemovido }: Props) {
    const [arrasto, setArrasto] = useState<Arrasto | null>(null)
    const [erro, setErro] = useState<string | null>(null)
    const [mudou, setMudou] = useState(false)
    const [confirmo, setConfirmo] = useState(false)
    const [removendo, setRemovendo] = useState(false)

    const medir = useCallback(async (a: AlvoDaRemocao) => {
        setArrasto(null); setErro(null); setConfirmo(false)
        try {
            const lido = lerArrasto(await chamarRota<unknown>(rotaDoArrasto(a.tipo, a.chave)))
            if (!lido) { setErro(ARRASTO_NAO_LIDO); return }
            setArrasto(lido)
        } catch (e) {
            setErro((e as Error).message || ARRASTO_NAO_LIDO)
        }
    }, [])
    useEffect(() => { setMudou(false); if (alvo) medir(alvo) }, [alvo, medir])

    async function remover() {
        if (!alvo || !arrasto || !confirmo || arrasto.impedimentos.length > 0) return
        setRemovendo(true); setErro(null)
        try {
            const feito = await chamarRota<unknown>(ROTA_DA_REMOCAO, 'POST', { tipo: alvo.tipo, chave: alvo.chave, assinatura: arrasto.assinatura, confirmo: true })
            onRemovido(lerArrasto(feito) ?? arrasto)
        } catch (e) {
            // 409 com o arrasto NOVO: mostra o que sai agora e pede a confirmação de novo
            const novo = e instanceof ErroDaRota && e.status === 409 ? lerArrasto((e.corpo as { arrasto?: unknown } | null)?.arrasto) : null
            if (novo) { setArrasto(novo); setConfirmo(false); setMudou(true) }
            setErro((e as Error).message)
        } finally {
            setRemovendo(false)
        }
    }

    const { sai, perde } = arrasto ? passosQueMexem(arrasto) : { sai: [], perde: [] }
    const impedida = (arrasto?.impedimentos.length ?? 0) > 0
    return (
        <Modal title={alvo ? tituloDaRemocao(alvo.tipo, alvo.nome) : 'Remover do catálogo'} open={alvo !== null} onCancel={onFechar} width={720}
            okText="Remover" okButtonProps={{ danger: true, loading: removendo, disabled: !arrasto || !confirmo || impedida }} onOk={remover} destroyOnClose>
            <Space direction="vertical" style={{ width: '100%' }} data-remocao-do-catalogo>
                {!arrasto && !erro && <Space><Spin size="small" /> <Typography.Text type="secondary">{MEDINDO_O_ARRASTO}</Typography.Text></Space>}
                {erro && <Alert type="error" showIcon message={mudou ? 'O que sai mudou.' : 'Nada foi removido.'} description={erro} data-erro-da-remocao />}
                {arrasto && (
                    <>
                        <Typography.Paragraph style={{ margin: 0 }} data-resumo-do-arrasto><strong>{resumoDoArrasto(arrasto)}</strong></Typography.Paragraph>
                        {arrasto.impedimentos.map((i, k) => <Alert key={`i${k}`} type="error" showIcon message="A remoção está impedida." description={fraseDoImpedimento(i)} data-impedimento />)}
                        {arrasto.avisos.map((a, k) => <Alert key={`a${k}`} type="warning" showIcon message={fraseDoAviso(a)} data-aviso-do-arrasto={a.tipo} />)}
                        {sai.length > 0 && (
                            <div data-o-que-sai>
                                <Typography.Text strong>Sai (apagado, com cada linha no log):</Typography.Text>
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{sai.map((p) => <Passo key={p.passo} p={p} />)}</ul>
                            </div>
                        )}
                        {perde.length > 0 && (
                            <div data-o-que-perde-o-vinculo>
                                <Typography.Text strong>Fica, e perde o vínculo:</Typography.Text>
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{perde.map((p) => <Passo key={p.passo} p={p} />)}</ul>
                            </div>
                        )}
                        {arrasto.ficam.length > 0 && (
                            <div data-o-que-fica>
                                <Typography.Text strong>Fica, sem ser tocado:</Typography.Text>
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                    {arrasto.ficam.map((f) => (
                                        <li key={f.rotulo}><strong>{f.quantidade.toLocaleString('pt-BR')}</strong> {rotuloDoQueFica(f)}<Typography.Text type="secondary">: {nomesComOResto(f.nomes, f.mais)}</Typography.Text></li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <span data-confirmo-o-arrasto><Checkbox checked={confirmo} disabled={impedida} onChange={(e) => setConfirmo(e.target.checked)}>{CONFIRMO_O_ARRASTO}</Checkbox></span>
                    </>
                )}
            </Space>
        </Modal>
    )
}
