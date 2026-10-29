/**
 * O CATÁLOGO DE MOTORES (dono do produto, 28/10/2026; migração 20261028000001): mora no CATÁLOGO, a última seção, depois dos
 * fornecedores (nicho → famílias → fornecedores → motores: o motor vem por último porque escolhe o fornecedor). O motor é GLOBAL e COMPARTILHADO — "empresas diferentes podem usar o mesmo motor" —, e cada um tem FORNECEDOR + CATEGORIA +
 * TIPO (a família do catálogo: PVC, ALUMINIO…). A etapa da família-instância, na base de conhecimento da conta, só o seleciona.
 *
 * A lista mostra, de cada motor: fornecedor, categoria, tipo, arquivo, tipologias e QUEM USA (empresa e família — só nomes). A ETAPA SAIU
 * DO CATÁLOGO (dono do produto, 29/10/2026: "etapa deve ser desconsiderada"): ela é da empresa, e o mesmo motor serve empresas que numeram
 * diferente. Arquivar o motor que uma família usa é recusado pela função, com a frase dela; o botão já vem travado quando a lista sabe que há uso.
 *
 * "Novo motor" pede, nesta ordem, CATEGORIA → FORNECEDOR → FAMÍLIA → ARQUIVO (29/10/2026; era família primeiro): no PERFIL a família VEM da
 * tabela de Perfil do fornecedor ("derivar da tabela de PERFIL do fornecedor quando ela existir"), e por isso vem depois dele — com uma família
 * só, ela já vem escolhida; com mais de uma, escolhe-se entre elas; a rota recusa outra. Nas demais categorias a família ainda se escolhe à mão
 * (o banco a exige em todo motor até a decisão do item 6). A família é o que impede uma etapa de PVC usar motor de alumínio (a FK composta do
 * banco garante). O fornecedor sai SÓ dos que têm tabela daquela categoria — a categoria é da tabela, não do fornecedor —, e trocar a categoria
 * ou o fornecedor limpa o que deixou de valer.
 *
 * DENTRO DO NICHO (29/10/2026): a página do nicho passa só os fornecedores dele, e a lista mostra só os motores desses fornecedores. O arquivo vai em dois passos, como o da tabela
 * (`enviarArquivo` com `tipo: 'motor'`, na pasta DO FORNECEDOR), e a rota lê, confere e cria numa transação só. A Wolf pode ter motor de
 * PERFIL e de PERSIANAS ao mesmo tempo: não há vigente. O motor novo nasce SEM TEMPO e sem etapa.
 *
 * Tudo pelas rotas (`ROTAS_DOS_MOTORES`), nunca pelo cliente do Supabase. A recusa aparece onde a ação aconteceu: a da criação DENTRO do
 * modal; a do arquivar no cartão, acima da lista.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Modal, Select, Space, Switch, Table, Tag, Typography, Upload, message } from 'antd'
import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { chamarRota, enviarArquivo } from '@/page-parts/atendimentos-ia/api'
import { familiaObrigatoria, type Categoria, type Familia, type FornecedorDaLista } from '@/utils/atendimentos-ia-catalogo'
import {
    ANCORA_DO_CATALOGO_DE_MOTORES, MOTOR_SEM_USO, ROTAS_DOS_MOTORES, fraseDoMotorCriado, fraseDoMotorEmUso, fraseDoUso, type MotorDoCatalogo,
} from '@/utils/atendimentos-ia-catalogo-de-motores'

export const TITULO_DO_CATALOGO_DE_MOTORES = 'Catálogo de motores'
export const AVISO_DO_CATALOGO_DE_MOTORES =
    'O motor é da plataforma e pode ser usado por várias empresas: cada família escolhe o seu, na base de conhecimento da conta. '
    + 'Cada motor tem fornecedor, categoria e tipo. Arquivar não apaga, e o motor que uma família usa não se arquiva.'
export const SEM_MOTOR_NO_CATALOGO = 'Nenhum motor no catálogo.'
export const FAMILIA_DA_TABELA_DE_PERFIL = 'No Perfil, a família vem da tabela de Perfil do fornecedor.'
export const fraseSemFornecedorDaCategoria = (categoria: string) =>
    `Nenhum fornecedor tem tabela da categoria ${categoria}: cadastre a tabela do fornecedor, com essa categoria, antes do motor.`

/** Os fornecedores que têm tabela da categoria, em ordem alfabética: é deles que o motor da categoria escolhe. */
export const fornecedoresDaCategoria = (fornecedores: readonly FornecedorDaLista[], categoria: string) =>
    fornecedores.filter((f) => f.categorias_das_tabelas.includes(categoria)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

interface Novo { fornecedor_id: string | null; categoria: string | null; familia: string | null; arquivo: File | null }
const NOVO_VAZIO: Novo = { fornecedor_id: null, categoria: null, familia: null, arquivo: null }

export function MotoresDoCatalogo({ fornecedores, categorias, familias }: { fornecedores: FornecedorDaLista[]; categorias: Categoria[]; familias: Familia[] }) {
    const [motores, setMotores] = useState<MotorDoCatalogo[] | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [verArquivados, setVerArquivados] = useState(false)
    const [erroAoArquivar, setErroAoArquivar] = useState<string | null>(null)
    const [arquivando, setArquivando] = useState<string | null>(null)
    const [aberto, setAberto] = useState(false)
    const [novo, setNovo] = useState<Novo>(NOVO_VAZIO)
    const [criando, setCriando] = useState(false)
    const [erroAoCriar, setErroAoCriar] = useState<string | null>(null)

    const carregar = useCallback(async () => {
        setErroAoLer(null)
        try {
            setMotores((await chamarRota<{ motores: MotorDoCatalogo[] }>(ROTAS_DOS_MOTORES.lista)).motores)
        } catch (e) {
            setMotores(null)
            setErroAoLer((e as Error).message)
        }
    }, [])
    useEffect(() => { carregar() }, [carregar])

    const rotuloDaCategoria = (c: string) => categorias.find((x) => x.chave === c)?.rotulo ?? c
    const rotuloDoTipo = (f: string) => familias.find((x) => x.chave === f)?.rotulo ?? f
    const doNicho = new Set(fornecedores.map((f) => f.id))
    const visiveis = (motores ?? []).filter((m) => doNicho.has(m.fornecedor_id) && (verArquivados || m.arquivado_em === null))
    const doMotor = novo.categoria === null ? [] : fornecedoresDaCategoria(fornecedores, novo.categoria)
    const perfil = novo.categoria !== null && familiaObrigatoria(novo.categoria)
    const doFornecedor = fornecedores.find((f) => f.id === novo.fornecedor_id) ?? null
    // no Perfil, as famílias que a tela oferece são SÓ as das tabelas de Perfil do fornecedor; nas demais, todas
    const familiasOferecidas = perfil ? familias.filter((f) => (doFornecedor?.familias_do_perfil ?? []).includes(f.chave)) : familias
    const completo = novo.fornecedor_id !== null && novo.categoria !== null && novo.familia !== null && novo.arquivo !== null

    async function arquivar(m: MotorDoCatalogo) {
        setArquivando(m.id)
        setErroAoArquivar(null)
        try {
            await chamarRota(ROTAS_DOS_MOTORES.arquivar, 'POST', { motor_id: m.id })
            message.success('Motor arquivado')
            await carregar()
        } catch (e) {
            setErroAoArquivar((e as Error).message)
        } finally {
            setArquivando(null)
        }
    }

    const abrir = (sim: boolean) => { setErroAoCriar(null); setNovo(NOVO_VAZIO); setAberto(sim) }

    /** A família depois de escolher o fornecedor: no Perfil, a da tabela de Perfil dele quando é uma só; senão, a que estava, se ainda vale. */
    function familiaDepois(n: Novo, fornecedorId: string | null): string | null {
        if (n.categoria === null || !familiaObrigatoria(n.categoria)) return n.familia
        const doPerfil = fornecedores.find((f) => f.id === fornecedorId)?.familias_do_perfil ?? []
        if (doPerfil.length === 1) return doPerfil[0]
        return n.familia !== null && doPerfil.includes(n.familia) ? n.familia : null
    }

    async function criar() {
        if (!completo) return
        setCriando(true)
        setErroAoCriar(null)
        try {
            const enviado = await enviarArquivo(novo.fornecedor_id as string, 'motor', novo.arquivo as File)
            const r = await chamarRota<{ regras: number; tipologias: number; detalhes?: number }>(ROTAS_DOS_MOTORES.lista, 'POST', {
                fornecedor_id: novo.fornecedor_id, categoria: novo.categoria, familia: novo.familia, path: enviado.path, nome: enviado.nome,
            })
            message.success(fraseDoMotorCriado(r), 8)
            abrir(false)
            await carregar()
        } catch (e) {
            setErroAoCriar((e as Error).message)
        } finally {
            setCriando(false)
        }
    }

    return (
        <Card id={ANCORA_DO_CATALOGO_DE_MOTORES} title={TITULO_DO_CATALOGO_DE_MOTORES} size="small" style={{ marginTop: 16 }} data-catalogo-de-motores
            extra={<Button size="small" icon={<PlusOutlined />} onClick={() => abrir(true)} data-novo-motor>Novo motor</Button>}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>{AVISO_DO_CATALOGO_DE_MOTORES}</Typography.Paragraph>
            {erroAoLer && <Alert type="error" showIcon message="Não foi possível ler o catálogo de motores." description={erroAoLer} action={<Button onClick={carregar}>Tentar de novo</Button>} data-erro-do-catalogo />}
            {erroAoArquivar && <Alert type="error" showIcon closable onClose={() => setErroAoArquivar(null)} style={{ marginBottom: 12 }} message="O motor não foi arquivado." description={erroAoArquivar} data-erro-ao-arquivar />}
            {!erroAoLer && (
                <>
                    <Space style={{ marginBottom: 8 }}>
                        <Switch size="small" checked={verArquivados} onChange={setVerArquivados} aria-label="Mostrar os arquivados" />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Mostrar os arquivados</Typography.Text>
                    </Space>
                    <Table<MotorDoCatalogo>
                        rowKey="id" size="small" loading={motores === null} dataSource={visiveis} pagination={false}
                        locale={{ emptyText: <Empty description={SEM_MOTOR_NO_CATALOGO} /> }}
                        onRow={(m) => ({ 'data-motor': m.id } as React.HTMLAttributes<HTMLElement>)}
                        columns={[
                            { title: 'Fornecedor', dataIndex: 'fornecedor' },
                            { title: 'Categoria', render: (_, m) => rotuloDaCategoria(m.categoria) },
                            { title: 'Tipo', render: (_, m) => rotuloDoTipo(m.familia) },
                            { title: 'Arquivo', render: (_, m) => <span>{m.arquivo_nome} {m.arquivado_em && <Tag>arquivado</Tag>}</span> },
                            { title: 'Tipologias', align: 'right', render: (_, m) => (m.tipologias === null ? '—' : m.tipologias.toLocaleString('pt-BR')) },
                            {
                                title: 'Quem usa',
                                render: (_, m) => (m.usos.length === 0
                                    ? <Typography.Text type="secondary" data-sem-uso>{MOTOR_SEM_USO}</Typography.Text>
                                    : <ul style={{ margin: 0, paddingLeft: 16 }} data-usos>{m.usos.map((u, i) => <li key={i}>{fraseDoUso(u)}</li>)}</ul>),
                            },
                            {
                                title: '',
                                align: 'right',
                                render: (_, m) => (m.arquivado_em !== null ? null : (
                                    <Button size="small" danger loading={arquivando === m.id} disabled={m.usos.length > 0 || arquivando !== null}
                                        title={m.usos.length > 0 ? fraseDoMotorEmUso(m.usos.length) : undefined} onClick={() => arquivar(m)} aria-label={`Arquivar ${m.arquivo_nome}`}>
                                        Arquivar
                                    </Button>
                                )),
                            },
                        ]}
                    />
                </>
            )}
            <Modal title="Novo motor" open={aberto} onCancel={() => abrir(false)} okText="Criar motor" onOk={criar}
                okButtonProps={{ disabled: !completo || criando, loading: criando }} destroyOnClose>
                <Space direction="vertical" style={{ width: '100%' }} data-modal-do-motor>
                    <Select aria-label="Categoria do motor" placeholder="1. Categoria" style={{ width: '100%' }}
                        value={novo.categoria ?? undefined}
                        onChange={(v) => setNovo((n) => {
                            const fornecedorId = fornecedoresDaCategoria(fornecedores, v).some((f) => f.id === n.fornecedor_id) ? n.fornecedor_id : null
                            const comCategoria = { ...n, categoria: v, fornecedor_id: fornecedorId }
                            return { ...comCategoria, familia: familiaDepois(comCategoria, fornecedorId) }
                        })}
                        options={[...categorias].sort((a, b) => a.ordem - b.ordem).map((c) => ({ value: c.chave, label: c.rotulo }))} />
                    <Select aria-label="Fornecedor do motor" placeholder="2. Fornecedor" style={{ width: '100%' }} showSearch optionFilterProp="label" disabled={novo.categoria === null}
                        value={novo.fornecedor_id ?? undefined} onChange={(v) => setNovo((n) => ({ ...n, fornecedor_id: v, familia: familiaDepois(n, v) }))}
                        options={doMotor.map((f) => ({ value: f.id, label: f.nome }))} />
                    {novo.categoria !== null && doMotor.length === 0 && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }} data-sem-fornecedor-da-categoria>{fraseSemFornecedorDaCategoria(rotuloDaCategoria(novo.categoria))}</Typography.Text>
                    )}
                    <Select aria-label="Família do motor" placeholder="3. Família" style={{ width: '100%' }} disabled={novo.fornecedor_id === null || (perfil && familiasOferecidas.length <= 1)}
                        value={novo.familia ?? undefined} onChange={(v) => setNovo((n) => ({ ...n, familia: v }))}
                        options={[...familiasOferecidas].sort((a, b) => a.ordem - b.ordem).map((f) => ({ value: f.chave, label: f.rotulo }))} />
                    {perfil && novo.fornecedor_id !== null && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }} data-familia-da-tabela-de-perfil>{FAMILIA_DA_TABELA_DE_PERFIL}</Typography.Text>
                    )}
                    <Upload accept=".xlsx,.xlsm" maxCount={1} disabled={novo.familia === null}
                        fileList={novo.arquivo ? [{ uid: 'motor', name: novo.arquivo.name, status: 'done' }] : []}
                        onRemove={() => { setNovo((n) => ({ ...n, arquivo: null })); return true }}
                        beforeUpload={(arquivo) => { setNovo((n) => ({ ...n, arquivo: arquivo as unknown as File })); return false }}>
                        <Button icon={<UploadOutlined />} disabled={novo.familia === null} aria-label="Arquivo do motor">4. Arquivo do motor (.xlsx, .xlsm)</Button>
                    </Upload>
                    {erroAoCriar && <Alert type="error" showIcon message="O motor não foi criado." description={erroAoCriar} data-erro-ao-criar-motor />}
                </Space>
            </Modal>
        </Card>
    )
}
