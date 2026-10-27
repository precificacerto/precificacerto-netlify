/**
 * O BLOCO MOTOR da conta (dono do produto, 26/10/2026): o que a conta tem CARREGADO, na ordem da cascata
 * FAMÍLIA → LINHA → TIPOLOGIA → PERFIS, VIDROS, INSUMOS → PREÇO. "Hoje NÃO existe tela nenhuma mostrando
 * isso. Quando algo sai errado, o consultor não tem onde olhar."
 *
 * "O BLOCO MOTOR NÃO É CAMPO DE TEXTO": se "como vai ser aplicado" virasse redação, o cálculo obedeceria
 * uma frase em vez do motor. Ele MOSTRA, e edita só escolha estruturada:
 *   - a FAMÍLIA da tabela, da lista, pela rota da TABELA. A tabela é do catálogo da plataforma: a família
 *     vale para todas as contas que a usam, e o bloco diz quais antes de salvar;
 *   - a VIGENTE da tabela, uma chave liga/desliga, pela rota da TABELA: no máximo uma por fornecedor e família
 *     (índice do banco), e a recusa nomeia a vigente de hoje;
 *   - o CRITÉRIO DE CUSTO DAS BARRAS, uma das duas opções, pela rota da CATEGORIA da base de conhecimento
 *     (`superadmin_gravar_mp_categoria`, que faz merge: só essa chave vai, e o resto do Perfil fica). É o
 *     mesmo campo da tela da base — não uma cópia.
 *
 * AS TABELAS SÃO AS DERIVADAS (dono do produto, 26/10/2026): as dos fornecedores que a base de conhecimento
 * vincula. O bloco LISTA SÓ O QUE TEM MOTOR CARREGADO (dono do produto, 27/10/2026), medido pelo conteúdo
 * (tipologias > 0) — a tabela de preço sai da lista, sem nada ser apagado — e diz A QUAL FAMÍLIA cada motor
 * pertence e DE ONDE ele vem: a tabela do fornecedor (a conversa lê) ou a planilha (a conversa ainda não lê).
 * ARQUIVAR é da planilha: sai da lista e da conversa, o dado fica. NÃO HÁ botão de excluir. Os avisos da
 * derivação vêm no topo.
 *
 * Tudo pelas rotas (`ROTAS_DO_MOTOR`); falha de leitura é ERRO na tela, nunca um bloco vazio.
 * Portão: `src/utils/__tests__/atendimentos-ia-motor-a-tela.test.tsx`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Drawer, Empty, Popconfirm, Radio, Space, Switch, Table, Tabs, Tag, Typography, message } from 'antd'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { ROTAS_DA_BASE } from '@/page-parts/atendimentos-ia/base-de-conhecimento/formulario'
import { ROTAS_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'
import {
    ABAS_DA_TIPOLOGIA, AVISO_NENHUMA_COM_MOTOR, CONTAGENS_DO_MOTOR, ROTAS_DO_MOTOR, ROTULO_DA_ORIGEM, ROTULO_DO_CRITERIO, SEM_MOTOR_NA_CONTA,
    fraseDoArquivar, fraseDoFornecedorSemTabela, fraseDoParSemVigente,
    type AbasDaTipologia, type CriterioDeCustoDaBarra, type DonoDoMotor, type MotorDaConta as Resumo, type PlanilhaNoMotor, type TabelaNoMotor, type TipologiaNoMotor,
} from '@/utils/atendimentos-ia-motor'

export const CASCATA = 'Família → Linha → Tipologia → Perfis, vidros, insumos → Preço'
const numero = (n: number) => n.toLocaleString('pt-BR')
const faixa = (min: number | null, max: number | null) => (min === null && max === null ? '—' : `${min ?? '?'}–${max ?? '?'} mm`)

function FamiliaDaTabela({ tabela, familias, onSalvo }: { tabela: TabelaNoMotor; familias: Resumo['familias']; onSalvo: () => void }) {
    const [escolhida, setEscolhida] = useState<string | null>(tabela.familia)
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState<string | null>(null)
    const rotuloAtual = tabela.familia ? familias.find((f) => f.chave === tabela.familia)?.rotulo ?? tabela.familia : null
    async function salvar() {
        setSalvando(true)
        setErro(null)
        try {
            await chamarRota(ROTAS_DO_CATALOGO.tabela(tabela.tabela_id), 'PATCH', { familia: escolhida })
            message.success('Família da tabela salva')
            onSalvo()
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }
    return (
        <div style={{ marginBottom: 12 }}>
            <Typography.Text strong>Família: </Typography.Text>
            <span data-familia-da-tabela={tabela.tabela_id}>{rotuloAtual ?? <Tag>não informada</Tag>}</span>
            <div style={{ marginTop: 6 }} data-escolha-de-familia={tabela.tabela_id}>
                <Radio.Group value={escolhida} onChange={(e) => setEscolhida(e.target.value as string)} aria-label="Família da tabela">
                    {familias.map((f) => <Radio.Button key={f.chave} value={f.chave}>{f.rotulo}</Radio.Button>)}
                </Radio.Group>
                <Button style={{ marginLeft: 8 }} disabled={escolhida === null || escolhida === tabela.familia} loading={salvando} onClick={salvar}>Salvar família</Button>
            </div>
            {tabela.contas_usando.length > 1 && (
                <Typography.Paragraph type="warning" style={{ fontSize: 12, margin: '6px 0 0' }}>
                    {`Esta tabela é usada por ${tabela.contas_usando.length} contas (${tabela.contas_usando.join(', ')}): trocar a família muda para todas.`}
                </Typography.Paragraph>
            )}
            {erro && <Alert type="error" showIcon style={{ marginTop: 8 }} message="A família não foi salva." description={erro} />}
        </div>
    )
}

/** A marca de vigente: uma chave, pela rota da tabela. A recusa do índice (já há outra vigente) fica no bloco. */
function VigenteDaTabela({ tabela, onSalvo }: { tabela: TabelaNoMotor; onSalvo: () => void }) {
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState<string | null>(null)
    async function marcar(vigente: boolean) {
        setSalvando(true)
        setErro(null)
        try {
            await chamarRota(ROTAS_DO_CATALOGO.tabela(tabela.tabela_id), 'PATCH', { vigente })
            message.success(vigente ? 'Tabela marcada como vigente' : 'Marca de vigente retirada')
            onSalvo()
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }
    return (
        <div style={{ marginBottom: 12 }}>
            <Typography.Text strong>Vigente: </Typography.Text>
            <Switch size="small" checked={tabela.vigente} loading={salvando} onChange={marcar} data-vigente-do-motor={tabela.tabela_id} />
            <Typography.Text type={tabela.vale ? 'secondary' : 'warning'} style={{ marginLeft: 8, fontSize: 12 }} data-vale={tabela.tabela_id}>
                {tabela.vale ? 'Vale para levantamento novo' : 'Esta tabela não vale para levantamento novo: há outra deste fornecedor na mesma família, e a vigente é a que vale.'}
            </Typography.Text>
            {erro && <Alert type="error" showIcon style={{ marginTop: 8 }} message="A marca de vigente não foi salva." description={erro} />}
        </div>
    )
}

function TipologiasDoMotor({ tenantId, dono, fornecedor }: { tenantId: string; dono: DonoDoMotor; fornecedor: string }) {
    const [lista, setLista] = useState<TipologiaNoMotor[] | null>(null)
    const [erro, setErro] = useState<string | null>(null)
    const [aberta, setAberta] = useState<string | null>(null)
    const [abas, setAbas] = useState<AbasDaTipologia | null>(null)
    const [erroDasAbas, setErroDasAbas] = useState<string | null>(null)

    async function carregar() {
        setErro(null)
        try { setLista(await chamarRota<TipologiaNoMotor[]>(ROTAS_DO_MOTOR.tipologias(tenantId, dono))) } catch (e) { setErro((e as Error).message) }
    }
    async function abrir(tipologia: string) {
        setAberta(tipologia)
        setAbas(null)
        setErroDasAbas(null)
        try { setAbas(await chamarRota<AbasDaTipologia>(ROTAS_DO_MOTOR.tipologia(tenantId, dono, tipologia))) } catch (e) { setErroDasAbas((e as Error).message) }
    }

    if (lista === null) {
        return (
            <>
                <Button onClick={carregar} data-ver-tipologias>Ver tipologias</Button>
                {erro && <Alert type="error" showIcon style={{ marginTop: 8 }} message="Não foi possível ler as tipologias." description={erro} />}
            </>
        )
    }
    return (
        <>
            <Table<TipologiaNoMotor>
                size="small"
                rowKey="tipologia"
                dataSource={lista}
                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                locale={{ emptyText: <Empty description="A tabela não tem tipologias na aba Detalhe." /> }}
                onRow={(t) => ({ onClick: () => abrir(t.tipologia), style: { cursor: 'pointer' }, ...({ 'data-tipologia': t.tipologia } as Record<string, string>) })}
                columns={[
                    { title: 'Tipologia', dataIndex: 'tipologia' },
                    { title: 'Linha', render: (_, t) => t.linha ?? '—' },
                    { title: 'Descrição', render: (_, t) => t.descricao ?? '—' },
                    { title: 'Largura', render: (_, t) => faixa(t.larg_min_mm, t.larg_max_mm) },
                    { title: 'Altura', render: (_, t) => faixa(t.alt_min_mm, t.alt_max_mm) },
                    { title: 'Perfis', align: 'right', render: (_, t) => t.n_perfis ?? '—' },
                    { title: 'Vidros', align: 'right', render: (_, t) => t.n_vidros ?? '—' },
                    { title: 'Insumos', align: 'right', render: (_, t) => t.n_insumos ?? '—' },
                    { title: 'Tempo', render: (_, t) => (t.tempo_fabricacao_min === null ? 'não cadastrado' : `${t.tempo_fabricacao_min} min${t.tempo_origem ? ` (${t.tempo_origem})` : ''}`) },
                ]}
            />
            <Drawer open={aberta !== null} title={aberta ? `${aberta} — ${fornecedor}` : ''} width={960} onClose={() => setAberta(null)}>
                {erroDasAbas && <Alert type="error" showIcon message="Não foi possível ler as abas da tipologia." description={erroDasAbas} />}
                {abas && (
                    <Tabs
                        items={ABAS_DA_TIPOLOGIA.map((aba) => ({
                            key: aba.chave,
                            label: `${aba.rotulo} (${abas[aba.chave].length})`,
                            children: (
                                <Table
                                    size="small"
                                    rowKey={(_, i) => String(i)}
                                    dataSource={abas[aba.chave]}
                                    pagination={{ pageSize: 50, hideOnSinglePage: true }}
                                    scroll={{ x: true }}
                                    columns={aba.colunas.map((c) => ({ title: c, dataIndex: c, render: (v: unknown) => (v === null || v === undefined ? '—' : String(v)) }))}
                                />
                            ),
                        }))}
                    />
                )}
            </Drawer>
        </>
    )
}

/** ARQUIVAR a planilha: sai da lista e da conversa, o dado fica. A rota não exclui; não há botão de excluir. */
function ArquivarPlanilha({ tenantId, planilha, onFeito }: { tenantId: string; planilha: PlanilhaNoMotor; onFeito: () => void }) {
    const [arquivando, setArquivando] = useState(false)
    const [erro, setErro] = useState<string | null>(null)
    async function arquivar() {
        setArquivando(true)
        setErro(null)
        try {
            await chamarRota(ROTAS_DO_MOTOR.arquivar(tenantId), 'POST', { motor: planilha.motor_id })
            message.success('Motor arquivado')
            onFeito()
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setArquivando(false)
        }
    }
    const outras = planilha.contas_usando.length > 1
    return (
        <div style={{ marginBottom: 12 }}>
            <Popconfirm title={fraseDoArquivar(planilha.arquivo_nome)} okText="Arquivar" cancelText="Voltar" onConfirm={arquivar}>
                <Button danger loading={arquivando} data-arquivar-motor={planilha.motor_id}>Arquivar</Button>
            </Popconfirm>
            {outras && (
                <Typography.Paragraph type="warning" style={{ fontSize: 12, margin: '6px 0 0' }} data-arquivar-contas={planilha.motor_id}>
                    {`Este motor é usado por ${planilha.contas_usando.length} contas (${planilha.contas_usando.join(', ')}): arquivar tira da lista de todas.`}
                </Typography.Paragraph>
            )}
            {erro && <Alert type="error" showIcon style={{ marginTop: 8 }} message="O motor não foi arquivado." description={erro} />}
        </div>
    )
}

function CriterioDaMateriaPrima({ tenantId, mp, onSalvo }: { tenantId: string; mp: Resumo['materias_primas'][number]; onSalvo: () => void }) {
    const [escolhido, setEscolhido] = useState<CriterioDeCustoDaBarra | null>(mp.criterio_custo_barra)
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState<string | null>(null)
    async function salvar() {
        setSalvando(true)
        setErro(null)
        try {
            // só a chave do critério: a função faz MERGE, e o resto do Perfil fica como está
            await chamarRota(ROTAS_DA_BASE.categoria(tenantId, mp.id, 'PERFIL'), 'PUT', { config: { criterio_custo_barra: escolhido } })
            message.success('Critério de custo das barras salvo')
            onSalvo()
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }
    return (
        <div style={{ marginBottom: 8 }} data-criterio={mp.id}>
            <Typography.Text>{mp.nome}: </Typography.Text>
            {mp.criterio_custo_barra === null && <Tag>não configurado</Tag>}
            <Radio.Group value={escolhido} onChange={(e) => setEscolhido(e.target.value as CriterioDeCustoDaBarra)} aria-label={`Custo das barras de ${mp.nome}`}>
                {(Object.keys(ROTULO_DO_CRITERIO) as CriterioDeCustoDaBarra[]).map((c) => <Radio key={c} value={c}>{ROTULO_DO_CRITERIO[c]}</Radio>)}
            </Radio.Group>
            <Button size="small" disabled={escolhido === null || escolhido === mp.criterio_custo_barra} loading={salvando} onClick={salvar}>Salvar critério</Button>
            {erro && <Alert type="error" showIcon style={{ marginTop: 8 }} message="O critério não foi salvo." description={erro} />}
        </div>
    )
}

export function MotorDaConta({ tenantId }: { tenantId: string }) {
    const [resumo, setResumo] = useState<Resumo | null>(null)
    const [erro, setErro] = useState<string | null>(null)
    const [versao, setVersao] = useState(0)

    const carregar = useCallback(async () => {
        try {
            setResumo(await chamarRota<Resumo>(ROTAS_DO_MOTOR.resumo(tenantId)))
            setErro(null)
            setVersao((v) => v + 1)
        } catch (e) {
            setErro((e as Error).message)
        }
    }, [tenantId])
    useEffect(() => { carregar() }, [carregar])

    return (
        <div data-bloco="motor">
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                O que esta conta tem carregado, na ordem da cascata: <b>{CASCATA}</b>. Só aparece o que tem motor carregado
                (tabela de preço, sem tipologias, não é motor). As tabelas são as dos fornecedores vinculados na base de
                conhecimento. O bloco mostra; o que se edita aqui é só escolha da lista — a família e a vigente da tabela, o
                critério de custo das barras — e arquivar a planilha, que não apaga nada.
            </Typography.Paragraph>
            {erro && <Alert type="error" showIcon message="Não foi possível ler o motor da conta." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} />}
            {!erro && resumo && (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {resumo.avisos.nenhuma_com_motor && <Alert type="warning" showIcon message={AVISO_NENHUMA_COM_MOTOR} data-aviso="nenhuma-com-motor" />}
                    {resumo.avisos.fornecedores_sem_tabela.map((f) => (
                        <Alert key={`sem-${f.fornecedor}`} type="warning" showIcon message={fraseDoFornecedorSemTabela(f.fornecedor, f.categorias)} data-aviso="fornecedor-sem-tabela" />
                    ))}
                    {resumo.avisos.pares_sem_vigente.map((p) => (
                        <Alert key={`par-${p.fornecedor}-${p.familia ?? ''}`} type="warning" showIcon message={fraseDoParSemVigente(p.fornecedor, p.familia, p.arquivos)} data-aviso="par-sem-vigente" />
                    ))}
                    {resumo.tabelas.length === 0 && resumo.planilhas.length === 0 && <Alert type="info" showIcon message={SEM_MOTOR_NA_CONTA} data-sem-motor />}
                    {resumo.planilhas.map((p) => (
                        <Card key={`${p.motor_id}-${versao}`} size="small" title={`${p.fornecedor} — ${p.arquivo_nome}`} data-planilha-do-motor={p.motor_id}>
                            <Space wrap style={{ marginBottom: 8 }}>
                                <Tag color="geekblue" data-origem={p.motor_id}>{ROTULO_DA_ORIGEM.PLANILHA}</Tag>
                                <Tag color={p.vigente ? 'green' : 'default'} data-vigente-da-planilha={p.motor_id}>{p.vigente ? 'Vigente' : 'Não vigente'}</Tag>
                            </Space>
                            <div style={{ marginBottom: 12 }}>
                                <Typography.Text strong>Família: </Typography.Text>
                                <span data-familia-do-motor={p.motor_id}>{resumo.familias.find((f) => f.chave === p.familia)?.rotulo ?? p.familia}</span>
                            </div>
                            <ArquivarPlanilha tenantId={tenantId} planilha={p} onFeito={carregar} />
                            <Typography.Text strong>Linhas</Typography.Text>
                            <ul style={{ margin: '4px 0 12px', paddingLeft: 18 }}>
                                {p.linhas.map((l) => <li key={l.linha ?? '-'}>{`${l.linha ?? '(sem linha)'}: ${l.tipologias} tipologia(s)`}</li>)}
                            </ul>
                            <Typography.Text strong>O que está carregado</Typography.Text>
                            <table style={{ margin: '4px 0 12px', fontSize: 13 }}>
                                <tbody>
                                    {CONTAGENS_DO_MOTOR.filter((c) => c.chave !== 'itens_de_preco').map((c) => (
                                        <tr key={c.chave} data-contagem={c.chave}>
                                            <td style={{ paddingRight: 16 }}>{c.rotulo}</td>
                                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{numero(p.contagens[c.chave as keyof PlanilhaNoMotor['contagens']])}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Typography.Text strong>Otimização (aba do motor)</Typography.Text>
                            <ul style={{ margin: '4px 0 12px', paddingLeft: 18 }}>
                                {p.otimizacao.length === 0 ? <li>nenhum parâmetro</li> : p.otimizacao.map((o, i) => <li key={i}>{`${o.parametro ?? '?'}: ${o.valor ?? '—'}`}</li>)}
                            </ul>
                            <TipologiasDoMotor tenantId={tenantId} dono={{ motor: p.motor_id }} fornecedor={p.fornecedor} />
                        </Card>
                    ))}
                    {resumo.tabelas.map((t) => (
                        <Card key={`${t.tabela_id}-${versao}`} size="small" title={`${t.fornecedor} — ${t.arquivo_nome}`} data-tabela-do-motor={t.tabela_id}>
                            <Space wrap style={{ marginBottom: 8 }}>
                                <Tag color="blue" data-origem={t.tabela_id}>{ROTULO_DA_ORIGEM.TABELA}</Tag>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Entra pela base de conhecimento: {t.categorias.join(', ')}</Typography.Text>
                            </Space>
                            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                                Motor: {t.motor_nome}{t.vigencia ? ` · vigência (nota): ${t.vigencia}` : ''}
                            </Typography.Paragraph>
                            <FamiliaDaTabela tabela={t} familias={resumo.familias} onSalvo={carregar} />
                            <VigenteDaTabela tabela={t} onSalvo={carregar} />
                            <Typography.Text strong>Linhas</Typography.Text>
                            <ul style={{ margin: '4px 0 12px', paddingLeft: 18 }}>
                                {t.linhas.map((l) => <li key={l.linha ?? '-'}>{`${l.linha ?? '(sem linha)'}: ${l.tipologias} tipologia(s)`}</li>)}
                            </ul>
                            <Typography.Text strong>O que está carregado</Typography.Text>
                            <table style={{ margin: '4px 0 12px', fontSize: 13 }}>
                                <tbody>
                                    {CONTAGENS_DO_MOTOR.map((c) => (
                                        <tr key={c.chave} data-contagem={c.chave}>
                                            <td style={{ paddingRight: 16 }}>{c.rotulo}</td>
                                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{numero(t.contagens[c.chave])}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Typography.Text strong>Otimização (aba do motor)</Typography.Text>
                            <ul style={{ margin: '4px 0 12px', paddingLeft: 18 }}>
                                {t.otimizacao.length === 0 ? <li>nenhum parâmetro</li> : t.otimizacao.map((o, i) => <li key={i}>{`${o.parametro ?? '?'}: ${o.valor ?? '—'}`}</li>)}
                            </ul>
                            <TipologiasDoMotor tenantId={tenantId} dono={{ tabela: t.tabela_id }} fornecedor={t.fornecedor} />
                        </Card>
                    ))}
                    <Card size="small" title="Custo das barras">
                        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                            Campo da base de conhecimento (categoria Perfil), por matéria-prima — o mesmo da tela da base. Hoje o
                            levantamento mostra os dois totais, por barra inteira e por consumo real; o critério ainda não é lido pelo cálculo.
                        </Typography.Paragraph>
                        {resumo.materias_primas.length === 0
                            ? <Typography.Text type="secondary">A conta não tem matéria-prima na base de conhecimento.</Typography.Text>
                            : resumo.materias_primas.map((mp) => <CriterioDaMateriaPrima key={`${mp.id}-${versao}`} tenantId={tenantId} mp={mp} onSalvo={carregar} />)}
                    </Card>
                </Space>
            )}
        </div>
    )
}
