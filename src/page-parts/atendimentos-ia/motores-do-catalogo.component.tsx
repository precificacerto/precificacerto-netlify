/**
 * O CATÁLOGO DE MOTORES (dono do produto, 28/10/2026; migração 20261028000001): mora no CATÁLOGO, a última seção, depois dos
 * fornecedores (nicho → famílias → fornecedores → motores: o motor vem por último porque escolhe o fornecedor). O motor é GLOBAL e COMPARTILHADO — "empresas diferentes podem usar o mesmo motor" —, e cada um tem FORNECEDOR + CATEGORIA +
 * TIPO (a família do catálogo: PVC, ALUMINIO…). A etapa da família-instância, na base de conhecimento da conta, só o seleciona.
 *
 * A lista mostra, de cada motor: fornecedor, categoria, tipo, arquivo, tipologias e QUEM USA (empresa e família — só nomes). A ETAPA SAIU
 * DO CATÁLOGO (dono do produto, 29/10/2026: "etapa deve ser desconsiderada"): ela é da empresa, e o mesmo motor serve empresas que numeram
 * diferente.
 *
 * O MOTOR TEM NOME (dono do produto, 29/10/2026; migração 20261029000005): "nós temos que ter o local de inserir ou editar o nome." O "Novo motor"
 * pede o nome (sugerido a partir do arquivo, sem a extensão, e editável), e a edição o muda também com uso. A lista e o combo da etapa mostram o
 * nome; o arquivo segue na sua coluna.
 *
 * ARQUIVAR MOTOR EM USO É PERMITIDO (20261029000005): o botão pede confirmação dizendo que as etapas ficam sem motor, e depois de arquivar a tela
 * lista ONDE repor — empresa, família, número e rótulo de cada etapa que ficou sem motor.
 *
 * ARQUIVAR E REMOVER COEXISTEM (dono do produto, 31/10/2026; migração 20261031000003): arquivar não apaga; REMOVER apaga o motor e o conteúdo dele,
 * e as etapas que o apontam ficam sem motor — pela confirmação do arrasto (`RemocaoDoCatalogo`), que mostra o que sai antes de apagar. Remover
 * vale também para o motor arquivado.
 *
 * "Novo motor" pede, nesta ordem, CATEGORIA → FORNECEDOR → FAMÍLIAS → ARQUIVO. O MOTOR SERVE N FAMÍLIAS E UMA CATEGORIA (dono do produto,
 * 29/10/2026; migração 20261029000003): "A gente define, bota o arquivo do motor, a qual categoria ele pertence e para quais famílias ele
 * atua." As famílias são escolha livre do catálogo de famílias, PELO MENOS UMA, em qualquer categoria — não se amarram mais a uma tabela do
 * fornecedor —, e a lista as mostra todas. A família é o que impede uma etapa de PVC usar motor que não atua em PVC (a FK pela ligação
 * `orcamentista_motor_familia`, no banco, garante). O fornecedor sai SÓ dos que têm tabela daquela categoria — a categoria é da tabela, não
 * do fornecedor —, e trocar a categoria limpa o fornecedor que deixou de valer.
 *
 * DENTRO DO NICHO (29/10/2026): a página do nicho passa só os fornecedores dele, e a lista mostra só os motores desses fornecedores.
 *
 * TROCAR O ARQUIVO = MOTOR NOVO (29/10/2026, migração 20261029000001): vale também com uso — as famílias passam ao novo, e o antigo fica arquivado
 * com o conteúdo intacto. EDITAR: categoria e fornecedor só em motor SEM USO (os dois campos vêm travados quando a lista sabe que há uso, e a
 * função recusa também o motor que só um item de levantamento leu); as FAMÍLIAS se editam também com uso, e tirar a que alguma etapa usa é a
 * recusa da rota, que nomeia quem usa, dentro do modal. "Remover o arquivo" é ARQUIVAR — motor sem arquivo não é motor. O arquivo vai em dois passos, como o da tabela
 * (`enviarArquivo` com `tipo: 'motor'`, na pasta DO FORNECEDOR), e a rota lê, confere e cria numa transação só. A Wolf pode ter motor de
 * PERFIL e de PERSIANAS ao mesmo tempo: não há vigente. O motor novo nasce SEM TEMPO e sem etapa.
 *
 * Tudo pelas rotas (`ROTAS_DOS_MOTORES`), nunca pelo cliente do Supabase. A recusa aparece onde a ação aconteceu: a da criação DENTRO do
 * modal; a do arquivar no cartão, acima da lista.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, Upload, message } from 'antd'
import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { chamarRota, enviarArquivo } from '@/page-parts/atendimentos-ia/api'
import { RemocaoDoCatalogo, type AlvoDaRemocao } from '@/page-parts/atendimentos-ia/remocao-do-catalogo.component'
import { type Categoria, type Familia, type FornecedorDaLista } from '@/utils/atendimentos-ia-catalogo'
import {
    ANCORA_DO_CATALOGO_DE_MOTORES, LIMITE_DO_NOME_DO_MOTOR, MOTOR_COM_USO_NAO_SE_EDITA, MOTOR_SEM_USO, ROTAS_DOS_MOTORES, etapasQueFicaramSemMotor,
    fraseDaEtapaQueFicouSemMotor, fraseDoArquivoTrocado, fraseDoMotorArquivado, fraseDoMotorCriado, fraseDoMotorEmUso, fraseDoUso, nomeDoMotorDoArquivo,
    type EtapaQueFicouSemMotor, type MotorDoCatalogo,
} from '@/utils/atendimentos-ia-catalogo-de-motores'

export const TITULO_DO_CATALOGO_DE_MOTORES = 'Catálogo de motores'
export const AVISO_DO_CATALOGO_DE_MOTORES =
    'O motor é da plataforma e pode ser usado por várias empresas: cada família escolhe o seu, na base de conhecimento da conta. '
    + 'Cada motor tem nome, fornecedor, categoria e famílias. Arquivar não apaga; arquivar o motor que uma família usa o tira dela, '
    + 'e ela não calcula até alguém escolher outro.'
export const SEM_MOTOR_NO_CATALOGO = 'Nenhum motor no catálogo.'
/** O arquivamento deu certo (200), mas a resposta não trouxe quais etapas ficaram sem motor: a tela não inventa a lista nem a diz vazia. */
export const MOTOR_ARQUIVADO_SEM_A_LISTA =
    'Motor arquivado, mas a resposta não disse quais etapas ficaram sem motor: confira as famílias que o usavam, na base de conhecimento das contas.'
/** As famílias do motor (20261029000003): a etapa de uma família só escolhe motor que atua nela. */
export const FAMILIAS_DO_MOTOR_NA_TELA = 'As famílias em que o motor atua: a etapa de uma família só escolhe motor que atua nela.'
/** Dono do produto, 29/10/2026: trocar o arquivo é MOTOR NOVO; o antigo fica arquivado, com o que já foi calculado com ele. */
export const AVISO_DA_TROCA =
    'Trocar o arquivo cria um motor NOVO, com o mesmo nome, fornecedor, categoria e famílias. As famílias que usam este motor passam ao novo, e este fica '
    + 'arquivado com o conteúdo intacto: o que já foi calculado com ele continua lendo o que leu.'
export const AVISO_DA_EDICAO =
    'Categoria e fornecedor só se editam em motor sem uso; trocar o fornecedor leva o arquivo para a pasta do fornecedor novo. '
    + 'O nome e as famílias se editam também com uso, e a família que alguma etapa usa não sai.'
export const fraseSemFornecedorDaCategoria = (categoria: string) =>
    `Nenhum fornecedor tem tabela da categoria ${categoria}: cadastre a tabela do fornecedor, com essa categoria, antes do motor.`

/** Os fornecedores que têm tabela da categoria, em ordem alfabética: é deles que o motor da categoria escolhe. */
export const fornecedoresDaCategoria = (fornecedores: readonly FornecedorDaLista[], categoria: string) =>
    fornecedores.filter((f) => f.categorias_das_tabelas.includes(categoria)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

interface Novo { fornecedor_id: string | null; categoria: string | null; familias: string[]; arquivo: File | null; nome: string }
const NOVO_VAZIO: Novo = { fornecedor_id: null, categoria: null, familias: [], arquivo: null, nome: '' }
/** O nome que a tela aceita mandar: sem as pontas, de 1 a 80 caracteres (a rota e a CHECK conferem de novo). */
const nomeAceito = (nome: string) => nome.trim() !== '' && [...nome.trim()].length <= LIMITE_DO_NOME_DO_MOTOR
/** As mesmas famílias, sem olhar a ordem: a edição que só reordena não mudou nada. */
const mesmasFamilias = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((f) => b.includes(f))

export function MotoresDoCatalogo({ fornecedores, categorias, familias }: { fornecedores: FornecedorDaLista[]; categorias: Categoria[]; familias: Familia[] }) {
    const [motores, setMotores] = useState<MotorDoCatalogo[] | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [verArquivados, setVerArquivados] = useState(false)
    const [erroAoArquivar, setErroAoArquivar] = useState<string | null>(null)
    /** O que o último arquivamento deixou sem motor: o motor e a lista (vazia = nenhuma etapa o usava). */
    const [arquivado, setArquivado] = useState<{ nome: string; etapas: EtapaQueFicouSemMotor[] | null; erro: string | null } | null>(null)
    const [arquivando, setArquivando] = useState<string | null>(null)
    const [aberto, setAberto] = useState(false)
    const [novo, setNovo] = useState<Novo>(NOVO_VAZIO)
    const [criando, setCriando] = useState(false)
    const [trocando, setTrocando] = useState<MotorDoCatalogo | null>(null)
    const [arquivoNovo, setArquivoNovo] = useState<File | null>(null)
    const [salvandoTroca, setSalvandoTroca] = useState(false)
    const [erroAoTrocar, setErroAoTrocar] = useState<string | null>(null)
    const [editando, setEditando] = useState<MotorDoCatalogo | null>(null)
    const [edicao, setEdicao] = useState<{ categoria: string | null; fornecedor_id: string | null; familias: string[]; nome: string }>({ categoria: null, fornecedor_id: null, familias: [], nome: '' })
    const [salvandoEdicao, setSalvandoEdicao] = useState(false)
    const [erroAoEditar, setErroAoEditar] = useState<string | null>(null)
    const [erroAoCriar, setErroAoCriar] = useState<string | null>(null)
    const [removendo, setRemovendo] = useState<AlvoDaRemocao | null>(null)

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
    /** As chaves na ORDEM do catálogo de famílias (a que não está nele vai ao fim, pela chave). */
    const naOrdemDoCatalogo = (chaves: readonly string[]) => {
        const ordem = (c: string) => familias.find((x) => x.chave === c)?.ordem ?? Number.MAX_SAFE_INTEGER
        return [...chaves].sort((a, b) => ordem(a) - ordem(b) || a.localeCompare(b))
    }
    /** O que o seletor de famílias oferece: o catálogo inteiro, na ordem — a família não se amarra a uma tabela do fornecedor (20261029000003). */
    const opcoesDeFamilia = [...familias].sort((a, b) => a.ordem - b.ordem).map((f) => ({ value: f.chave, label: f.rotulo }))
    const doNicho = new Set(fornecedores.map((f) => f.id))
    const visiveis = (motores ?? []).filter((m) => doNicho.has(m.fornecedor_id) && (verArquivados || m.arquivado_em === null))
    const doMotor = novo.categoria === null ? [] : fornecedoresDaCategoria(fornecedores, novo.categoria)
    const completo = novo.fornecedor_id !== null && novo.categoria !== null && novo.familias.length > 0 && novo.arquivo !== null && nomeAceito(novo.nome)

    const botaoDeRemover = (m: MotorDoCatalogo) => (
        <Button size="small" danger type="text" onClick={() => setRemovendo({ tipo: 'motor', chave: m.id, nome: m.nome })} aria-label={`Remover ${m.nome}`} data-remover-motor>
            Remover
        </Button>
    )

    async function arquivar(m: MotorDoCatalogo) {
        setArquivando(m.id)
        setErroAoArquivar(null)
        setArquivado(null)
        let resposta: unknown
        try {
            resposta = await chamarRota<unknown>(ROTAS_DOS_MOTORES.arquivar, 'POST', { motor_id: m.id })
        } catch (e) {
            setErroAoArquivar((e as Error).message)
            setArquivando(null)
            return
        }
        // a rota respondeu 200: o motor ESTÁ arquivado. Sem a lista na resposta, a tela diz isso — nunca "não foi arquivado", nunca "nenhuma etapa"
        try {
            setArquivado({ nome: m.nome, etapas: etapasQueFicaramSemMotor(resposta), erro: null })
        } catch (e) {
            setArquivado({ nome: m.nome, etapas: null, erro: (e as Error).message })
        }
        try {
            await carregar()
        } finally {
            setArquivando(null)
        }
    }

    const abrir = (sim: boolean) => { setErroAoCriar(null); setNovo(NOVO_VAZIO); setAberto(sim) }

    const abrirTroca = (m: MotorDoCatalogo) => { setErroAoTrocar(null); setArquivoNovo(null); setTrocando(m) }
    const abrirEdicao = (m: MotorDoCatalogo) => {
        setErroAoEditar(null); setEdicao({ categoria: m.categoria, fornecedor_id: m.fornecedor_id, familias: m.familias, nome: m.nome }); setEditando(m)
    }
    /** Com uso, categoria e fornecedor ficam travados (a função recusa); as famílias e o nome, não. */
    const edicaoComUso = editando !== null && editando.usos.length > 0
    const edicaoMudou = editando !== null && edicao.categoria !== null && edicao.fornecedor_id !== null && edicao.familias.length > 0 && nomeAceito(edicao.nome)
        && (edicao.categoria !== editando.categoria || edicao.fornecedor_id !== editando.fornecedor_id || !mesmasFamilias(edicao.familias, editando.familias)
            || edicao.nome.trim() !== editando.nome)

    /** TROCAR O ARQUIVO = MOTOR NOVO: o arquivo vai à pasta do fornecedor DO MOTOR, e a rota cria, reaponta e arquiva numa transação. */
    async function trocar() {
        if (!trocando || !arquivoNovo) return
        setSalvandoTroca(true)
        setErroAoTrocar(null)
        try {
            const enviado = await enviarArquivo(trocando.fornecedor_id, 'motor', arquivoNovo)
            const r = await chamarRota<{ tipologias: number; etapas_reapontadas: number }>(ROTAS_DOS_MOTORES.trocarArquivo, 'POST', { motor_id: trocando.id, path: enviado.path, nome: enviado.nome })
            message.success(fraseDoArquivoTrocado(r), 8)
            setTrocando(null)
            await carregar()
        } catch (e) {
            setErroAoTrocar((e as Error).message)
        } finally {
            setSalvandoTroca(false)
        }
    }

    async function editar() {
        if (!editando || !edicaoMudou) return
        setSalvandoEdicao(true)
        setErroAoEditar(null)
        try {
            await chamarRota(ROTAS_DOS_MOTORES.editar, 'POST', {
                motor_id: editando.id, fornecedor_id: edicao.fornecedor_id, categoria: edicao.categoria, familias: naOrdemDoCatalogo(edicao.familias),
                nome_do_motor: edicao.nome.trim(),
            })
            message.success('Motor editado')
            setEditando(null)
            await carregar()
        } catch (e) {
            setErroAoEditar((e as Error).message)
        } finally {
            setSalvandoEdicao(false)
        }
    }

    async function criar() {
        if (!completo) return
        setCriando(true)
        setErroAoCriar(null)
        try {
            const enviado = await enviarArquivo(novo.fornecedor_id as string, 'motor', novo.arquivo as File)
            const r = await chamarRota<{ regras: number; tipologias: number; detalhes?: number }>(ROTAS_DOS_MOTORES.lista, 'POST', {
                fornecedor_id: novo.fornecedor_id, categoria: novo.categoria, familias: naOrdemDoCatalogo(novo.familias), nome_do_motor: novo.nome.trim(),
                path: enviado.path, nome: enviado.nome,
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
            {arquivado && arquivado.etapas === null && (
                <Alert type="warning" showIcon closable onClose={() => setArquivado(null)} style={{ marginBottom: 12 }} data-motor-arquivado-sem-lista
                    message={`${arquivado.nome}: ${MOTOR_ARQUIVADO_SEM_A_LISTA}`} description={arquivado.erro} />
            )}
            {arquivado && arquivado.etapas !== null && (
                <Alert type={arquivado.etapas.length === 0 ? 'success' : 'warning'} showIcon closable onClose={() => setArquivado(null)} style={{ marginBottom: 12 }}
                    message={`${arquivado.nome}: ${fraseDoMotorArquivado(arquivado.etapas.length)}`} data-motor-arquivado
                    description={arquivado.etapas.length === 0 ? undefined : (
                        <ul style={{ margin: 0, paddingLeft: 16 }} data-etapas-que-ficaram-sem-motor>
                            {arquivado.etapas.map((e) => <li key={e.etapa_id}>{fraseDaEtapaQueFicouSemMotor(e)}</li>)}
                        </ul>
                    )} />
            )}
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
                            { title: 'Nome', render: (_, m) => <span data-nome-do-motor>{m.nome}</span> },
                            { title: 'Fornecedor', dataIndex: 'fornecedor' },
                            { title: 'Categoria', render: (_, m) => rotuloDaCategoria(m.categoria) },
                            {
                                title: 'Famílias',
                                render: (_, m) => (
                                    <span data-familias-do-motor={naOrdemDoCatalogo(m.familias).join(',')}>
                                        {naOrdemDoCatalogo(m.familias).map((f) => <Tag key={f}>{rotuloDoTipo(f)}</Tag>)}
                                    </span>
                                ),
                            },
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
                                render: (_, m) => (m.arquivado_em !== null ? botaoDeRemover(m) : (
                                    <Space size={4} wrap style={{ justifyContent: 'flex-end' }}>
                                        {/* trocar o arquivo é MOTOR NOVO: vale também com uso (as famílias passam ao novo) */}
                                        <Button size="small" onClick={() => abrirTroca(m)} aria-label={`Trocar o arquivo de ${m.nome}`} data-trocar-arquivo>Trocar arquivo</Button>
                                        {/* editar vale também com uso: o nome e as famílias se editam; categoria e fornecedor vêm travados no modal */}
                                        <Button size="small" onClick={() => abrirEdicao(m)} aria-label={`Editar ${m.nome}`} data-editar-motor>Editar</Button>
                                        {/* arquivar vale também com uso (20261029000005): com uso, pede confirmação dizendo que as etapas ficam sem motor */}
                                        <Popconfirm title={m.usos.length > 0 ? fraseDoMotorEmUso(m.usos.length) : `Arquivar ${m.nome}?`} okText="Arquivar" cancelText="Cancelar"
                                            okButtonProps={{ danger: true }} onConfirm={() => arquivar(m)} disabled={arquivando !== null}>
                                            <Button size="small" danger loading={arquivando === m.id} disabled={arquivando !== null} aria-label={`Arquivar ${m.nome}`} data-arquivar-motor>
                                                Arquivar
                                            </Button>
                                        </Popconfirm>
                                        {botaoDeRemover(m)}
                                    </Space>
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
                            return { ...n, categoria: v, fornecedor_id: fornecedorId }
                        })}
                        options={[...categorias].sort((a, b) => a.ordem - b.ordem).map((c) => ({ value: c.chave, label: c.rotulo }))} />
                    <Select aria-label="Fornecedor do motor" placeholder="2. Fornecedor" style={{ width: '100%' }} showSearch optionFilterProp="label" disabled={novo.categoria === null}
                        value={novo.fornecedor_id ?? undefined} onChange={(v) => setNovo((n) => ({ ...n, fornecedor_id: v }))}
                        options={doMotor.map((f) => ({ value: f.id, label: f.nome }))} />
                    {novo.categoria !== null && doMotor.length === 0 && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }} data-sem-fornecedor-da-categoria>{fraseSemFornecedorDaCategoria(rotuloDaCategoria(novo.categoria))}</Typography.Text>
                    )}
                    <Select mode="multiple" aria-label="Famílias do motor" placeholder="3. Famílias" style={{ width: '100%' }} disabled={novo.fornecedor_id === null}
                        value={novo.familias} onChange={(v: string[]) => setNovo((n) => ({ ...n, familias: v }))} options={opcoesDeFamilia} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }} data-familias-do-motor-na-tela>{FAMILIAS_DO_MOTOR_NA_TELA}</Typography.Text>
                    <Upload accept=".xlsx,.xlsm" maxCount={1} disabled={novo.fornecedor_id === null || novo.familias.length === 0}
                        fileList={novo.arquivo ? [{ uid: 'motor', name: novo.arquivo.name, status: 'done' }] : []}
                        onRemove={() => { setNovo((n) => ({ ...n, arquivo: null })); return true }}
                        // o nome sugerido é o do arquivo sem a extensão, só se o campo ainda está vazio: o que alguém digitou não é sobrescrito
                        beforeUpload={(arquivo) => { setNovo((n) => ({ ...n, arquivo: arquivo as unknown as File, nome: n.nome.trim() === '' ? nomeDoMotorDoArquivo(arquivo.name) : n.nome })); return false }}>
                        <Button icon={<UploadOutlined />} disabled={novo.fornecedor_id === null || novo.familias.length === 0} aria-label="Arquivo do motor">
                            4. Arquivo do motor (.xlsx, .xlsm)
                        </Button>
                    </Upload>
                    <Input aria-label="Nome do motor" placeholder="5. Nome do motor" maxLength={LIMITE_DO_NOME_DO_MOTOR} value={novo.nome}
                        onChange={(ev) => setNovo((n) => ({ ...n, nome: ev.target.value }))} data-nome-do-motor-novo />
                    {erroAoCriar && <Alert type="error" showIcon message="O motor não foi criado." description={erroAoCriar} data-erro-ao-criar-motor />}
                </Space>
            </Modal>
            <Modal title={trocando ? `Trocar o arquivo de ${trocando.nome}` : 'Trocar o arquivo'} open={trocando !== null} onCancel={() => setTrocando(null)}
                okText="Trocar o arquivo" onOk={trocar} okButtonProps={{ disabled: arquivoNovo === null || salvandoTroca, loading: salvandoTroca }} destroyOnClose>
                <Space direction="vertical" style={{ width: '100%' }} data-modal-da-troca>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: 0 }} data-aviso-da-troca>{AVISO_DA_TROCA}</Typography.Paragraph>
                    <Upload accept=".xlsx,.xlsm" maxCount={1}
                        fileList={arquivoNovo ? [{ uid: 'novo', name: arquivoNovo.name, status: 'done' }] : []}
                        onRemove={() => { setArquivoNovo(null); return true }}
                        beforeUpload={(a) => { setArquivoNovo(a as unknown as File); return false }}>
                        <Button icon={<UploadOutlined />} aria-label="Arquivo novo do motor">Arquivo novo (.xlsx, .xlsm)</Button>
                    </Upload>
                    {erroAoTrocar && <Alert type="error" showIcon message="O arquivo não foi trocado." description={erroAoTrocar} data-erro-ao-trocar />}
                </Space>
            </Modal>
            <Modal title={editando ? `Editar ${editando.nome}` : 'Editar o motor'} open={editando !== null} onCancel={() => setEditando(null)}
                okText="Salvar" onOk={editar} okButtonProps={{ disabled: !edicaoMudou || salvandoEdicao, loading: salvandoEdicao }} destroyOnClose>
                <Space direction="vertical" style={{ width: '100%' }} data-modal-da-edicao>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: 0 }}>{AVISO_DA_EDICAO}</Typography.Paragraph>
                    {edicaoComUso && <Typography.Text type="secondary" style={{ fontSize: 12 }} data-motor-com-uso>{MOTOR_COM_USO_NAO_SE_EDITA}</Typography.Text>}
                    <Input aria-label="Nome do motor (edição)" maxLength={LIMITE_DO_NOME_DO_MOTOR} value={edicao.nome}
                        onChange={(ev) => setEdicao((x) => ({ ...x, nome: ev.target.value }))} />
                    <Select aria-label="Categoria do motor (edição)" style={{ width: '100%' }} value={edicao.categoria ?? undefined} disabled={edicaoComUso}
                        title={edicaoComUso ? MOTOR_COM_USO_NAO_SE_EDITA : undefined}
                        onChange={(v) => setEdicao((x) => {
                            const fornecedorId = fornecedoresDaCategoria(fornecedores, v).some((f) => f.id === x.fornecedor_id) ? x.fornecedor_id : null
                            return { ...x, categoria: v, fornecedor_id: fornecedorId }
                        })}
                        options={[...categorias].sort((a, b) => a.ordem - b.ordem).map((c) => ({ value: c.chave, label: c.rotulo }))} />
                    <Select aria-label="Fornecedor do motor (edição)" style={{ width: '100%' }} showSearch optionFilterProp="label" disabled={edicao.categoria === null || edicaoComUso}
                        title={edicaoComUso ? MOTOR_COM_USO_NAO_SE_EDITA : undefined}
                        value={edicao.fornecedor_id ?? undefined} onChange={(v) => setEdicao((x) => ({ ...x, fornecedor_id: v }))}
                        options={(edicao.categoria === null ? [] : fornecedoresDaCategoria(fornecedores, edicao.categoria)).map((f) => ({ value: f.id, label: f.nome }))} />
                    <Select mode="multiple" aria-label="Famílias do motor (edição)" style={{ width: '100%' }}
                        value={edicao.familias} onChange={(v: string[]) => setEdicao((x) => ({ ...x, familias: v }))} options={opcoesDeFamilia} />
                    {erroAoEditar && <Alert type="error" showIcon message="O motor não foi editado." description={erroAoEditar} data-erro-ao-editar />}
                </Space>
            </Modal>
            <RemocaoDoCatalogo alvo={removendo} onFechar={() => setRemovendo(null)}
                onRemovido={() => { setRemovendo(null); message.success('Motor removido'); carregar() }} />
        </Card>
    )
}
