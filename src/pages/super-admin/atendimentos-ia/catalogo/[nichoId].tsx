/**
 * Atendimentos I.A. → CATÁLOGO → UM NICHO. Só o super admin.
 *
 * O NICHO É O CONTAINER (dono do produto, 29/10/2026, opção A): famílias, fornecedores e motores vivem DENTRO do nicho — abrindo
 * "Esquadrias" é que se cria, edita e remove os três. A página tem três abas, nesta ordem: FAMÍLIAS → FORNECEDORES → MOTORES (a mesma ordem do
 * Catálogo de 28/10/2026: a família define as categorias, o fornecedor usa as categorias, o motor escolhe o fornecedor). A aba vem da URL
 * (`?aba=`), para o link "cadastrar motor no catálogo" da etapa cair direto nos motores do nicho da conta.
 *
 * O QUE É DO NICHO, E O QUE NÃO É:
 *   - FORNECEDORES: os de `nicho_id` igual ao da página. O credenciamento já vem com este nicho escolhido.
 *   - MOTORES: os dos fornecedores deste nicho — o motor só chega ao nicho pelo fornecedor.
 *   - FAMÍLIAS: GLOBAIS. `orcamentista_familia_catalogo` não tem nicho e não ganha agora (12 nichos, um só com fornecedores, nenhuma família
 *     além da PVC Wolf — dívida registrada em `tabela-de-preco-por-categoria.md`). A aba diz isso, para ninguém achar que acrescentar uma
 *     família aqui a deixa só neste nicho.
 *
 * TUDO PELAS ROTAS (`ROTAS_DO_CATALOGO`), nada pelo cliente do Supabase: as tabelas não dão privilégio ao navegador, e uma lista lida por ele
 * chegaria VAZIA, dizendo "nenhum fornecedor" sobre um dado que ninguém leu. Falha de leitura aparece como ERRO, nunca como lista vazia
 * (`ausente-vs-falso.md`). Nicho que não existe é "Nicho não encontrado.", nunca a página vazia de um nicho.
 *
 * CREDENCIAR — a recusa aparece onde a ação aconteceu (cabeçalho de `EXTENSOES_ACEITAS`):
 *   - o fornecedor recusado: o erro aparece DENTRO do modal de credenciamento;
 *   - o fornecedor gravado e alguma tabela recusada: o modal FECHA — o fornecedor já existe, e um novo "Salvar credenciamento" criaria um
 *     SEGUNDO (não há índice único no nome) — e as falhas ficam num Alert FIXO na aba, acima da lista, até o usuário fechar.
 * Portão: `atendimentos-ia-recusa-onde-a-acao-aconteceu.test.tsx`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Empty, Table, Tabs, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import {
    ABAS_DO_NICHO, AVISO_DA_FAMILIA_GLOBAL, AVISO_DO_CATALOGO, NICHO_NAO_ENCONTRADO, ROTAS_DO_CATALOGO, ROTULO_DA_ABA_DO_NICHO, ROTULO_DO_MODELO,
    abaDoNicho, rotaDoNicho, type AbaDoNicho, type Categoria, type Familia, type FornecedorDaLista, type Nicho,
} from '@/utils/atendimentos-ia-catalogo'
import { chamarRota, gravarTabelaNova } from '@/page-parts/atendimentos-ia/api'
import { FornecedorModal, TITULO_FORNECEDOR_NAO_CREDENCIADO, type DadosDoFornecedor, type ErroDoFornecedor } from '@/page-parts/atendimentos-ia/fornecedor-modal.component'
import { FamiliasCard } from '@/page-parts/atendimentos-ia/familias.component'
import { MotoresDoCatalogo } from '@/page-parts/atendimentos-ia/motores-do-catalogo.component'

export default function NichoDoCatalogo() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin
    const nichoId = typeof router.query.nichoId === 'string' ? router.query.nichoId : null
    const aba = abaDoNicho(router.query.aba)

    const [todos, setTodos] = useState<FornecedorDaLista[] | null>(null)
    const [nichos, setNichos] = useState<Nicho[] | null>(null)
    const [familias, setFamilias] = useState<Familia[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [credenciando, setCredenciando] = useState(false)
    const [salvando, setSalvando] = useState(false)
    const [erroAoCredenciar, setErroAoCredenciar] = useState<ErroDoFornecedor | null>(null)
    const [credenciadoComFalhas, setCredenciadoComFalhas] = useState<{ nome: string; falhas: string[] } | null>(null)

    const carregar = useCallback(async () => {
        try {
            const [fs, ns, fams, cats] = await Promise.all([
                chamarRota<FornecedorDaLista[]>(ROTAS_DO_CATALOGO.fornecedores),
                chamarRota<Nicho[]>(ROTAS_DO_CATALOGO.nichos),
                chamarRota<Familia[]>(ROTAS_DO_CATALOGO.familias),
                chamarRota<Categoria[]>(ROTAS_DO_CATALOGO.categorias),
            ])
            setTodos(fs)
            setNichos(ns)
            setFamilias(fams)
            setCategorias(cats)
            setErro(null)
        } catch (e) {
            setErro((e as Error).message)
        }
    }, [])

    useEffect(() => { if (ehSuperAdmin) carregar() }, [ehSuperAdmin, carregar])

    if (currentUser && !ehSuperAdmin) {
        router.replace(ROUTES.DASHBOARD)
        return null
    }
    if (!ehSuperAdmin) return null

    const nicho = nichos?.find((n) => n.id === nichoId) ?? null
    const fornecedores = todos === null ? null : todos.filter((f) => f.nicho_id === nichoId)
    const trocarAba = (a: string) => { if (nichoId) router.replace(rotaDoNicho(nichoId, abaDoNicho(a)), undefined, { shallow: true }) }

    /** Abre ou fecha o credenciamento sempre SEM o erro da tentativa anterior. */
    const abrirCredenciamento = (aberto: boolean) => { setErroAoCredenciar(null); setCredenciando(aberto) }

    async function credenciar(d: DadosDoFornecedor) {
        setSalvando(true)
        setErroAoCredenciar(null)
        let id: string
        try {
            id = (await chamarRota<{ id: string }>(ROTAS_DO_CATALOGO.fornecedores, 'POST', { nome: d.nome, nicho_id: d.nicho_id })).id
        } catch (e) {
            setErroAoCredenciar({ titulo: TITULO_FORNECEDOR_NAO_CREDENCIADO, motivo: (e as Error).message })
            setSalvando(false)
            return
        }
        try {
            const falhas: string[] = []
            for (const t of d.tabelas) {
                try { await gravarTabelaNova(id, t) } catch (e) { falhas.push((e as Error).message) }
            }
            setCredenciadoComFalhas(falhas.length ? { nome: d.nome.trim(), falhas } : null)
            if (!falhas.length) message.success('Fornecedor credenciado')
            abrirCredenciamento(false)
            await carregar()
        } finally {
            setSalvando(false)
        }
    }

    async function criarFamilia(rotulo: string) {
        try {
            await chamarRota(ROTAS_DO_CATALOGO.familias, 'POST', { rotulo })
            message.success('Família acrescentada')
            await carregar()
            return true
        } catch (e) {
            message.error((e as Error).message, 8)
            return false
        }
    }

    const conteudo: Record<AbaDoNicho, React.ReactNode> = {
        familias: (
            <div data-aba-familias>
                <Alert type="info" showIcon style={{ marginBottom: 12 }} message={AVISO_DA_FAMILIA_GLOBAL} data-familia-global />
                <FamiliasCard familias={familias} onCriar={criarFamilia} />
            </div>
        ),
        fornecedores: (
            <div data-aba-fornecedores>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 12px' }} data-secao-fornecedores>
                    <Typography.Title level={5} style={{ margin: 0 }}>Fornecedores</Typography.Title>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirCredenciamento(true)}>
                        Credenciar fornecedor
                    </Button>
                </div>
                {credenciadoComFalhas && (
                    <Alert
                        type="warning"
                        showIcon
                        closable
                        onClose={() => setCredenciadoComFalhas(null)}
                        style={{ marginBottom: 12 }}
                        message={`Fornecedor "${credenciadoComFalhas.nome}" credenciado, mas ${credenciadoComFalhas.falhas.length} tabela(s) não entraram.`}
                        description={<ul style={{ margin: 0, paddingLeft: 18 }}>{credenciadoComFalhas.falhas.map((f, i) => <li key={i}>{f}</li>)}</ul>}
                        data-credenciado-com-falhas
                    />
                )}
                <div className="pc-card--table">
                    <Table<FornecedorDaLista>
                        rowKey="id"
                        loading={fornecedores === null}
                        dataSource={fornecedores ?? []}
                        pagination={false}
                        locale={{ emptyText: <Empty description="Nenhum fornecedor credenciado neste nicho." /> }}
                        columns={[
                            { title: 'Fornecedor', dataIndex: 'nome' },
                            { title: 'Contas usando', render: (_, f) => (f.contas_usando.length ? f.contas_usando.join(', ') : <Typography.Text type="secondary">—</Typography.Text>) },
                            {
                                title: '',
                                align: 'right',
                                render: (_, f) => (
                                    <Button size="small" onClick={() => router.push(`${ROUTES.SUPER_ADMIN_IA_FORNECEDORES}/${f.id}`)}>
                                        Tabelas ({f.tabelas})
                                    </Button>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>
        ),
        motores: fornecedores === null ? null : (
            <div data-aba-motores><MotoresDoCatalogo fornecedores={fornecedores} categorias={categorias} familias={familias} /></div>
        ),
    }

    return (
        <Layout title={nicho?.nome ?? PAGE_TITLES.SUPER_ADMIN_IA_FORNECEDORES} subtitle={AVISO_DO_CATALOGO}>
            <div style={{ marginBottom: 8 }}>
                <a href={ROUTES.SUPER_ADMIN_IA_FORNECEDORES} data-voltar-ao-catalogo>← Catálogo</a>
            </div>
            {erro ? (
                <Alert type="error" showIcon message="Não foi possível ler o catálogo." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            ) : nichos !== null && nicho === null ? (
                <Alert type="warning" showIcon message={NICHO_NAO_ENCONTRADO} data-nicho-nao-encontrado />
            ) : nicho === null ? null : (
                <div data-pagina-do-nicho={nicho.id}>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>
                        <Tag>{ROTULO_DO_MODELO[nicho.modelo]}</Tag> Famílias, fornecedores e motores do nicho {nicho.nome}.
                    </Typography.Paragraph>
                    <Tabs activeKey={aba} onChange={trocarAba}
                        items={ABAS_DO_NICHO.map((a) => ({ key: a, label: ROTULO_DA_ABA_DO_NICHO[a], children: conteudo[a] }))} />
                </div>
            )}

            {nicho && (
                <FornecedorModal
                    aberto={credenciando}
                    modo="credenciar"
                    nichos={[nicho]}
                    familias={familias}
                    categorias={categorias}
                    inicial={{ nome: '', nicho_id: nicho.id }}
                    salvando={salvando}
                    erro={credenciando ? erroAoCredenciar : null}
                    onCancelar={() => abrirCredenciamento(false)}
                    onSalvar={credenciar}
                />
            )}
        </Layout>
    )
}
