/**
 * Atendimentos I.A. → Fornecedores e tabelas → UMA tabela → Importação. Só o super admin.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * A TELA NÃO CALCULA NADA (dono do produto, 20/10/2026). Todo número vem da rota — a última
 * importação (`/importar`) e o que está no banco (`/conteudo`) —, e a ordem das tipologias
 * também. ANTES da primeira importação não há contagem, e a tela não mostra zero no lugar
 * (`ausente-vs-falso.md`): mostra os dois arquivos, se são importáveis, e o botão.
 *
 * O ERRO DA ROTA aparece AQUI, com o motivo — a extensão, o Storage, a planilha que o leitor
 * recusa, e a contagem divergente com os dois números lado a lado. A recusa aparece onde a ação
 * aconteceu (cabeçalho de `EXTENSOES_ACEITAS`).
 *
 * IMPORTAR AO SALVAR (dono do produto, 02/11/2026): "Salvar tabela" com arquivo chega aqui com `?importar=1`, e a tela DISPARA a mesma
 * importação que o botão dispara — uma vez, e o parâmetro sai da URL em seguida, para o recarregar não reimportar. O resultado aparece
 * como sempre; a recusa do arquivo não toca no cadastro, que já estava salvo.
 *
 * A TROCA NO MESMO LUGAR (dono do produto, 12/11/2026): a edição que troca o arquivo chega aqui com o arquivo NOVO na URL (`arquivo_path` e
 * `arquivo_nome`, o `arquivo_pendente` da edição) — ele ainda não é o arquivo da tabela. A importação lê dele e, com a tabela já tendo itens,
 * NÃO grava: devolve a PRÉVIA, e a tela mostra "entram N, saem M, ficam K", com TODOS os códigos que saem. Só "Confirmar a troca" grava —
 * com o sha256 que a prévia mostrou — e o arquivo da tabela é trocado junto com os itens. Encolher o total pede a caixa "Permitir que a
 * tabela encolha". "Cancelar" não grava nada, e o arquivo de hoje continua o da tabela.
 *
 * "NÃO IMPORTADA" (mesma decisão): a tabela com 0 itens GRAVADOS (a contagem do banco, em `/conteudo`) diz isso num aviso, com o motivo quando
 * há — a recusa da importação, ou a importação que não deixou item. A tela NUNCA fica em estado de sucesso sem itens gravados: se a rota
 * estourou o tempo (504) ou recusou, o estado é lido do banco de novo e o aviso aparece. Antes da primeira leitura do conteúdo não há
 * contagem, e nada é dito (`ausente-vs-falso.md`).
 *
 * Tudo pelas rotas, nada pelo cliente do Supabase (`atendimentos-ia-a-tela-nao-fala-com-o-banco`).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Card, Checkbox, Empty, List, Space, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { PARAMETROS_DO_ARQUIVO_PENDENTE, PARAMETRO_IMPORTAR_AO_ABRIR, ROTAS_DO_CATALOGO, arquivoImportavel, extensaoDoArquivo, fraseDoArquivoNaoImportavel, telaDaImportacao } from '@/utils/atendimentos-ia-catalogo'
import type { Aviso, ContagensDaGravacao, TipologiaLida } from '@/utils/atendimentos-ia-importacao'
import { quandoFoiImportado, textoDoAviso } from '@/utils/atendimentos-ia-importacao-apresentacao'
import { ErroDaRota, chamarRota } from '@/page-parts/atendimentos-ia/api'
import { ESTILO_DA_DATA } from '@/page-parts/atendimentos-ia/linha-da-tabela.component'

interface DadosDaTabela { id: string; fornecedor_id: string; fornecedor_nome: string | null; arquivo_nome: string; motor_nome: string | null; vigencia: string | null; categoria_chave: string | null; categoria_rotulo: string | null }
interface UltimaImportacao {
    importado_em: string
    importado_por_nome: string | null
    itens: number
    regras: number
    tipologias: number
    cruzam: number
    nao_cruzam: number
    normalizados: number
    avisos: Aviso[]
}
/** `itens` são os de preço GRAVADOS no banco (02/11/2026) — é com eles que a tela diz "não importada". */
interface Conteudo { formulas: number; tipologias: TipologiaLida[]; itens: number }
/** A prévia da troca, como a rota a devolve (`previaDaTroca` + a frase, o sha256 e o arquivo lido). */
export interface PreviaDaImportacao { antes: number; entram: number; ficam: number; novos: number; saem: string[]; encolhe: boolean; frase: string; sha256: string; arquivo_nome: string; arquivo_trocado: boolean }
interface ErroDaImportacao { motivo: string; divergencia: { enviado: ContagensDaGravacao; gravado: ContagensDaGravacao } | null }

const num = (x: number) => x.toLocaleString('pt-BR')
export const TITULO_DA_TABELA_NAO_IMPORTADA = 'Tabela não importada: nenhum item de preço gravado.'
export const MOTIVO_DA_NAO_IMPORTADA = {
    recusada: 'A importação foi recusada — o motivo está no aviso acima. O cadastro da tabela ficou salvo; corrija o arquivo e importe de novo.',
    sem_itens: 'A última importação não deixou item de preço gravado. Confira o arquivo e importe de novo.',
    nunca: 'Esta tabela ainda não foi importada. Use "Importar" para gravar os itens do arquivo.',
} as const
const ROTULO_DA_CONTAGEM: Record<keyof ContagensDaGravacao, string> = { itens: 'Itens de preço', regras: 'Regras do motor', tipologias: 'Tipologias', formulas: 'Fórmulas da linha' }

function Contagem({ chave, rotulo, valor }: { chave: string; rotulo: string; valor: number }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Typography.Text type="secondary">{rotulo}</Typography.Text>
            <strong style={ESTILO_DA_DATA} data-contagem={chave}>{num(valor)}</strong>
        </div>
    )
}

export default function ImportacaoDaTabela() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin
    const id = typeof router.query.id === 'string' ? router.query.id : null

    const [tabela, setTabela] = useState<DadosDaTabela | null>(null)
    const [ultima, setUltima] = useState<UltimaImportacao | null>(null)
    const [conteudo, setConteudo] = useState<Conteudo | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [erroDaImportacao, setErroDaImportacao] = useState<ErroDaImportacao | null>(null)
    const [importando, setImportando] = useState(false)
    /** O disparo automático (`?importar=1`) acontece UMA vez por abertura — nem o recarregar da lista nem o efeito repetido o repetem. */
    const disparou = useRef(false)
    const importarAoAbrir = router.query[PARAMETRO_IMPORTAR_AO_ABRIR] !== undefined
    /** O arquivo NOVO que a edição deixou pendente; guardado aqui porque o parâmetro sai da URL ao abrir. */
    const [pendente, setPendente] = useState<{ path: string; nome: string } | null>(null)
    const [previa, setPrevia] = useState<PreviaDaImportacao | null>(null)
    const [permitirEncolher, setPermitirEncolher] = useState(false)

    const carregar = useCallback(async () => {
        if (!id) return
        try {
            const [t, u, c] = await Promise.all([
                chamarRota<DadosDaTabela>(ROTAS_DO_CATALOGO.tabela(id)),
                chamarRota<UltimaImportacao | null>(ROTAS_DO_CATALOGO.importacao(id)),
                chamarRota<Conteudo>(ROTAS_DO_CATALOGO.conteudoDaTabela(id)),
            ])
            setTabela(t)
            setUltima(u)
            setConteudo(c)
            setErroAoLer(null)
        } catch (e) {
            setErroAoLer((e as Error).message)
        }
    }, [id])

    useEffect(() => { if (ehSuperAdmin) carregar() }, [ehSuperAdmin, carregar])

    // IMPORTAR AO SALVAR: chegou com `?importar=1` → dispara a mesma importação do botão, uma vez, e tira o parâmetro da URL
    useEffect(() => {
        if (!ehSuperAdmin || !id || !importarAoAbrir || disparou.current) return
        disparou.current = true
        const p = router.query[PARAMETROS_DO_ARQUIVO_PENDENTE.path]
        const n = router.query[PARAMETROS_DO_ARQUIVO_PENDENTE.nome]
        const doPedido = typeof p === 'string' && typeof n === 'string' && p !== '' && n !== '' ? { path: p, nome: n } : null
        setPendente(doPedido)
        router.replace(telaDaImportacao(id), undefined, { shallow: true })
        importar({ arquivo: doPedido })
    // `importar` é função do componente, estável por fechar sobre `id`; o disparo é guardado por `disparou`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ehSuperAdmin, id, importarAoAbrir])

    if (currentUser && !ehSuperAdmin) {
        router.replace(ROUTES.DASHBOARD)
        return null
    }
    if (!ehSuperAdmin) return null

    /** Pede a importação: sem confirmação, a rota devolve a prévia (tabela com itens); com ela, grava. O arquivo pendente vai nas duas. */
    async function importar(opcoes: { arquivo?: { path: string; nome: string } | null; confirmar?: PreviaDaImportacao } = {}) {
        if (!id) return
        const arquivo = opcoes.arquivo !== undefined ? opcoes.arquivo : pendente
        setImportando(true)
        setErroDaImportacao(null)
        try {
            const corpo: Record<string, unknown> = {}
            if (arquivo) { corpo.arquivo_path = arquivo.path; corpo.arquivo_nome = arquivo.nome }
            if (opcoes.confirmar) { corpo.confirmar = true; corpo.sha256 = opcoes.confirmar.sha256; corpo.permitir_encolher = permitirEncolher }
            const r = await chamarRota<{ previa?: PreviaDaImportacao; importacao_id?: string }>(ROTAS_DO_CATALOGO.importacao(id), 'POST', corpo)
            if (r.previa && !r.importacao_id) {
                setPrevia(r.previa)
                setPermitirEncolher(false)
            } else {
                setPrevia(null)
                setPendente(null)
            }
        } catch (e) {
            const corpo = (e instanceof ErroDaRota ? e.corpo : null) as { enviado?: ContagensDaGravacao; gravado?: ContagensDaGravacao; previa?: PreviaDaImportacao } | null
            // a recusa da confirmação (encolher sem permissão, arquivo que mudou) traz a prévia de novo: ela fica na tela
            if (corpo?.previa) setPrevia(corpo.previa)
            setErroDaImportacao({
                motivo: (e as Error).message,
                divergencia: corpo?.enviado && corpo?.gravado ? { enviado: corpo.enviado, gravado: corpo.gravado } : null,
            })
        } finally {
            // o estado volta do BANCO também na recusa e no 504 (02/11/2026): a tela nunca afirma sucesso sem itens gravados
            await carregar()
            setImportando(false)
        }
    }

    // "não importada" = 0 itens GRAVADOS, lidos do banco; sem a leitura do conteúdo não há contagem, e nada é dito
    const naoImportada = conteudo !== null && conteudo.itens === 0 && !importando
    const motivoDaNaoImportada = erroDaImportacao ? MOTIVO_DA_NAO_IMPORTADA.recusada : ultima ? MOTIVO_DA_NAO_IMPORTADA.sem_itens : MOTIVO_DA_NAO_IMPORTADA.nunca

    const voltar = () => router.push(tabela ? `${ROUTES.SUPER_ADMIN_IA_FORNECEDORES}/${tabela.fornecedor_id}` : ROUTES.SUPER_ADMIN_IA_FORNECEDORES)

    const arquivos = tabela ? [
        { papel: 'tabela' as const, rotulo: 'Arquivo da tabela', nome: tabela.arquivo_nome },
        // sem arquivo de motor (preço puro), não há o que mostrar nem importar: a linha do motor não existe
        ...(tabela.motor_nome ? [{ papel: 'motor' as const, rotulo: 'Arquivo do motor', nome: tabela.motor_nome }] : []),
    ] : []

    return (
        <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_IMPORTACAO} subtitle={tabela?.fornecedor_nome ?? undefined}>
            <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={voltar}>Voltar para o fornecedor</Button>
                {tabela && <Button type="primary" onClick={() => importar()} loading={importando} disabled={previa !== null}>Importar</Button>}
            </Space>

            {erroAoLer ? (
                <Alert type="error" showIcon message="Não foi possível ler a tabela." description={erroAoLer} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            ) : tabela === null ? null : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {previa && (
                        <Card title="Prévia da troca do arquivo — nada foi gravado ainda" data-previa-da-troca>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Typography.Text>Arquivo lido: <strong>{previa.arquivo_nome}</strong>{previa.arquivo_trocado ? ' (o arquivo novo; o de hoje continua o da tabela até a confirmação)' : ''}</Typography.Text>
                                <Typography.Text strong data-frase-da-previa>{previa.frase}</Typography.Text>
                                <Typography.Text type="secondary">A tabela tem {num(previa.antes)} itens hoje.</Typography.Text>
                                {previa.saem.length > 0 && (
                                    <div data-codigos-que-saem>
                                        <Typography.Text>{previa.saem.length === 1 ? 'Sai este código' : `Saem estes ${num(previa.saem.length)} códigos`} (o arquivo novo não os traz):</Typography.Text>
                                        <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 4, overflowWrap: 'anywhere' }}>{previa.saem.join(', ')}</div>
                                    </div>
                                )}
                                {previa.encolhe && (
                                    <Checkbox checked={permitirEncolher} onChange={(e) => setPermitirEncolher(e.target.checked)} data-permitir-encolher>
                                        Permitir que a tabela encolha de {num(previa.antes)} para {num(previa.entram)} itens
                                    </Checkbox>
                                )}
                                <Space wrap>
                                    <Button type="primary" loading={importando} disabled={previa.encolhe && !permitirEncolher} onClick={() => importar({ confirmar: previa })} data-confirmar-a-troca>Confirmar a troca</Button>
                                    <Button disabled={importando} onClick={() => { setPrevia(null); setPendente(null) }} data-cancelar-a-troca>Cancelar</Button>
                                </Space>
                            </Space>
                        </Card>
                    )}
                    {erroDaImportacao && (
                        <Alert
                            type="error"
                            showIcon
                            closable
                            onClose={() => setErroDaImportacao(null)}
                            message="A importação não foi concluída."
                            data-erro-da-importacao
                            description={
                                <>
                                    <div>{erroDaImportacao.motivo}</div>
                                    {erroDaImportacao.divergencia && (
                                        <table style={{ marginTop: 8 }}>
                                            <thead><tr><th style={{ textAlign: 'left', paddingRight: 16 }} /><th style={{ textAlign: 'right', paddingRight: 16 }}>Lido</th><th style={{ textAlign: 'right' }}>Gravado</th></tr></thead>
                                            <tbody>
                                                {(Object.keys(ROTULO_DA_CONTAGEM) as Array<keyof ContagensDaGravacao>).map((k) => (
                                                    <tr key={k} data-divergencia={k}>
                                                        <td style={{ paddingRight: 16 }}>{ROTULO_DA_CONTAGEM[k]}</td>
                                                        <td style={{ ...ESTILO_DA_DATA, paddingRight: 16 }}>{num(erroDaImportacao.divergencia!.enviado[k])}</td>
                                                        <td style={ESTILO_DA_DATA}>{num(erroDaImportacao.divergencia!.gravado[k])}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </>
                            }
                        />
                    )}

                    {naoImportada && (
                        <Alert type="warning" showIcon message={TITULO_DA_TABELA_NAO_IMPORTADA} description={motivoDaNaoImportada} data-nao-importada={erroDaImportacao ? 'recusada' : ultima ? 'sem-itens' : 'nunca'} />
                    )}

                    <Card size="small" title="Arquivos">
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <div data-categoria-da-tabela={tabela.categoria_chave ?? 'nao-informada'} style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <Typography.Text type="secondary">Categoria da tabela</Typography.Text>
                                {tabela.categoria_chave
                                    ? <strong>{tabela.categoria_rotulo ?? tabela.categoria_chave}</strong>
                                    : <Typography.Text type="secondary">não informada (tabela de antes da regra de uma categoria por tabela)</Typography.Text>}
                            </div>
                            {arquivos.map((a) => {
                                const importavel = arquivoImportavel(a.nome)
                                return (
                                    <div key={a.papel} data-arquivo-da-importacao={a.papel} data-importavel={importavel ? 'sim' : 'nao'} style={{ padding: '6px 0' }}>
                                        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                            <Typography.Text type="secondary">{a.rotulo}</Typography.Text>
                                            <strong>{a.nome}</strong>
                                            <Tag>{extensaoDoArquivo(a.nome) || 'sem extensão'}</Tag>
                                            {importavel ? <Tag color="green">importável</Tag> : <Tag color="red">não importável</Tag>}
                                        </div>
                                        {!importavel && <Typography.Paragraph type="danger" style={{ margin: '4px 0 0' }}>{fraseDoArquivoNaoImportavel(a.nome)}</Typography.Paragraph>}
                                        {ultima && a.papel === 'tabela' && (
                                            <div style={{ maxWidth: 360, marginTop: 6 }}>
                                                <Contagem chave="itens" rotulo={ROTULO_DA_CONTAGEM.itens} valor={ultima.itens} />
                                            </div>
                                        )}
                                        {ultima && a.papel === 'motor' && (
                                            <div style={{ maxWidth: 360, marginTop: 6 }}>
                                                <Contagem chave="regras" rotulo={ROTULO_DA_CONTAGEM.regras} valor={ultima.regras} />
                                                <Contagem chave="tipologias" rotulo={ROTULO_DA_CONTAGEM.tipologias} valor={ultima.tipologias} />
                                                {conteudo && <Contagem chave="formulas" rotulo={ROTULO_DA_CONTAGEM.formulas} valor={conteudo.formulas} />}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </Space>
                    </Card>

                    {!ultima ? (
                        <Typography.Text type="secondary">Esta tabela ainda não foi importada.</Typography.Text>
                    ) : (
                        <>
                            <Typography.Paragraph data-ultima-importacao style={{ margin: 0 }}>
                                Última importação: <span style={ESTILO_DA_DATA}>{quandoFoiImportado(ultima.importado_em)}</span>
                                {' · '}por <b>{ultima.importado_por_nome ?? '—'}</b>
                            </Typography.Paragraph>

                            <Card size="small" title="Cruzamento do motor com o preço" data-cruzamento>
                                <div style={{ maxWidth: 360 }}>
                                    <Contagem chave="cruzam" rotulo="Códigos do motor que acharam preço" valor={ultima.cruzam} />
                                    <Contagem chave="nao_cruzam" rotulo="Códigos do motor sem preço" valor={ultima.nao_cruzam} />
                                    <Contagem chave="normalizados" rotulo="Linhas normalizadas" valor={ultima.normalizados} />
                                </div>
                            </Card>

                            <Card size="small" title="Tipologias" className="pc-card--table">
                                <Table<TipologiaLida>
                                    rowKey="tipologia"
                                    dataSource={conteudo?.tipologias ?? []}
                                    pagination={false}
                                    size="small"
                                    onRow={(t) => ({ 'data-tipologia': t.tipologia } as React.HTMLAttributes<HTMLElement>)}
                                    locale={{ emptyText: <Empty description="Nenhuma tipologia gravada." /> }}
                                    columns={[
                                        { title: 'Tipologia', dataIndex: 'tipologia' },
                                        { title: 'Linha', render: (_, t) => t.linha ?? <Typography.Text type="secondary">—</Typography.Text> },
                                        { title: 'Regras', align: 'right', render: (_, t) => <span style={ESTILO_DA_DATA}>{num(t.n_regras)}</span> },
                                        { title: 'Condicionais', align: 'right', render: (_, t) => <span style={ESTILO_DA_DATA}>{num(t.n_condicionais)}</span> },
                                        { title: 'Variáveis exigidas', render: (_, t) => <span data-variaveis>{t.variaveis.length ? t.variaveis.join(', ') : 'nenhuma'}</span> },
                                    ]}
                                />
                            </Card>

                            <Card size="small" title="Avisos">
                                {ultima.avisos.length === 0 ? (
                                    <Typography.Text type="secondary">A importação não deixou aviso.</Typography.Text>
                                ) : (
                                    <List
                                        size="small"
                                        dataSource={ultima.avisos}
                                        renderItem={(a, i) => {
                                            const { titulo, texto } = textoDoAviso(a)
                                            return (
                                                <List.Item key={i} data-aviso>
                                                    <div><b>{titulo}</b><div>{texto}</div></div>
                                                </List.Item>
                                            )
                                        }}
                                    />
                                )}
                            </Card>
                        </>
                    )}
                </Space>
            )}
        </Layout>
    )
}
