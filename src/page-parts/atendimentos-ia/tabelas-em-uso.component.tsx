/**
 * "Tabelas em uso" — o grupo da configuração da conta em que o super admin escolhe, do nicho da
 * conta, o fornecedor e a tabela que o motor vai considerar.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * A CASCATA (dono do produto): "escolho a segmentação, e aí eu tenho todos os fornecedores
 * daquela segmentação; escolho a tabela daquele fornecedor".
 * (dito em 19/10/2026; citação, mantida como foi dita. O vocabulário da área foi decidido
 * depois, em 20/10/2026: na área, a palavra é MODELO — EPIC §11.)
 *   - os fornecedores vêm da rota DA CONTA, já filtrados pelo nicho SALVO dela. A tela nunca pede
 *     a lista da plataforma — nem quando o nicho não tem fornecedor: aí ela diz que não há. (O
 *     mockup, em `fornDoNicho`, caía para a lista inteira; a instrução é o contrário.)
 *   - DOIS seletores, em linhas separadas: o fornecedor, e depois a tabela DELE. Pode haver 50 ou
 *     100 tabelas, e um seletor só misturaria todas.
 *   - a VIGÊNCIA é mostrada como foi digitada. Se ela é data de upload ou prazo é decisão em
 *     aberto, e por isso não há regra de vencimento aqui.
 *
 * Tudo pelas rotas, nada pelo cliente do Supabase (`atendimentos-ia-a-tela-nao-fala-com-o-banco`).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Select, Space, Typography } from 'antd'
import { ROTAS_DO_CATALOGO, type TabelasDaConta } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'

export const SEM_FORNECEDOR_NO_NICHO = 'Nenhum fornecedor neste nicho ainda.'
export const SEM_NICHO_SALVO = 'Escolha e salve o modelo e o nicho da conta para escolher as tabelas.'

/** O rótulo de uma tabela no seletor: o arquivo, e a vigência como foi digitada, quando há. */
const rotuloDaTabela = (t: { arquivo_nome: string; vigencia: string | null }) => (t.vigencia ? `${t.arquivo_nome} · ${t.vigencia}` : t.arquivo_nome)

export function TabelasEmUso({ tenantId }: { tenantId: string }) {
    const [dados, setDados] = useState<TabelasDaConta | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [erroAoGravar, setErroAoGravar] = useState<string | null>(null)
    const [fornecedorId, setFornecedorId] = useState<string | null>(null)
    const [tabelaId, setTabelaId] = useState<string | null>(null)
    const [gravando, setGravando] = useState(false)

    const carregar = useCallback(async () => {
        try {
            setDados(await chamarRota<TabelasDaConta>(ROTAS_DO_CATALOGO.tabelasDaConta(tenantId)))
            setErroAoLer(null)
        } catch (e) {
            setErroAoLer((e as Error).message)
        }
    }, [tenantId])

    useEffect(() => { carregar() }, [carregar])

    const fornecedor = useMemo(() => dados?.fornecedores.find((f) => f.id === fornecedorId) ?? null, [dados, fornecedorId])
    const emUso = useMemo(() => new Set((dados?.em_uso ?? []).map((t) => t.tabela_id)), [dados])

    async function gravar(acao: () => Promise<unknown>) {
        setGravando(true)
        setErroAoGravar(null)
        try {
            await acao()
            await carregar()
            return true
        } catch (e) {
            setErroAoGravar((e as Error).message)
            return false
        } finally {
            setGravando(false)
        }
    }

    async function adicionar() {
        if (!tabelaId) return
        const ok = await gravar(() => chamarRota(ROTAS_DO_CATALOGO.tabelasDaConta(tenantId), 'POST', { tabela_id: tabelaId }))
        if (ok) setTabelaId(null)
    }

    const remover = (id: string) => gravar(() => chamarRota(ROTAS_DO_CATALOGO.tabelaDaConta(tenantId, id), 'DELETE'))

    return (
        <div data-grupo="tabelas-em-uso">
            <Typography.Title level={5} style={{ marginTop: 0 }}>Tabelas em uso</Typography.Title>

            {erroAoLer ? (
                <Alert type="error" showIcon message="Não foi possível ler as tabelas da conta." description={erroAoLer} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            ) : dados === null ? null : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {dados.em_uso.length === 0 ? (
                        <Typography.Text type="secondary">Nenhuma tabela em uso.</Typography.Text>
                    ) : (
                        <div>
                            {dados.em_uso.map((t) => (
                                <div key={t.tabela_id} data-tabela-em-uso style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', padding: '6px 0' }}>
                                    <strong>{t.fornecedor_nome}</strong>
                                    <span>{t.arquivo_nome}</span>
                                    <Typography.Text type="secondary">motor: {t.motor_nome}</Typography.Text>
                                    <span data-vigencia>{t.vigencia ?? '—'}</span>
                                    <Button size="small" danger style={{ marginLeft: 'auto' }} disabled={gravando} onClick={() => remover(t.tabela_id)}>Remover</Button>
                                </div>
                            ))}
                            <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '6px 0 0' }}>
                                Enquanto houver tabela em uso, o modelo e o nicho da conta não podem ser trocados.
                            </Typography.Paragraph>
                        </div>
                    )}

                    {!dados.nicho_id ? (
                        <Typography.Text type="secondary">{SEM_NICHO_SALVO}</Typography.Text>
                    ) : dados.fornecedores.length === 0 ? (
                        <Typography.Text type="secondary">{SEM_FORNECEDOR_NO_NICHO}</Typography.Text>
                    ) : (
                        <Space direction="vertical" style={{ width: '100%', maxWidth: 520 }}>
                            <Select<string>
                                style={{ width: '100%' }}
                                aria-label="Fornecedor"
                                placeholder="Escolha o fornecedor"
                                virtual={false}
                                value={fornecedorId ?? undefined}
                                onChange={(v) => { setFornecedorId(v); setTabelaId(null) }}
                                options={dados.fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
                            />
                            <Select<string>
                                style={{ width: '100%' }}
                                aria-label="Tabela do fornecedor"
                                placeholder={fornecedor ? (fornecedor.tabelas.length ? 'Escolha a tabela' : 'Este fornecedor ainda não tem tabela') : 'Escolha o fornecedor primeiro'}
                                virtual={false}
                                disabled={!fornecedor || fornecedor.tabelas.length === 0}
                                value={tabelaId ?? undefined}
                                onChange={(v) => setTabelaId(v)}
                                options={(fornecedor?.tabelas ?? []).map((t) => ({
                                    value: t.id,
                                    label: emUso.has(t.id) ? `${rotuloDaTabela(t)} (já em uso)` : rotuloDaTabela(t),
                                    disabled: emUso.has(t.id),
                                }))}
                            />
                            <Button type="primary" onClick={adicionar} disabled={!tabelaId} loading={gravando}>Adicionar</Button>
                        </Space>
                    )}

                    {erroAoGravar && <Alert type="error" showIcon message="A alteração não foi salva." description={erroAoGravar} />}
                </Space>
            )}
        </div>
    )
}
