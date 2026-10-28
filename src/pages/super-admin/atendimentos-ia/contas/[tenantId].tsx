/**
 * Atendimentos I.A. → Contas ligadas → configuração de UMA conta (EPIC §5.4, bloco 2C.1). Só o
 * super admin.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a lista de contas e a tela de configuração mostram APENAS o
 * nome/identificação da conta e a configuração do Atendimentos I.A. NADA do conteúdo da conta —
 * nem clientes, nem orçamentos, nem funcionários, nem valores. O super admin não tem tenant e não
 * pode enxergar dado de cliente por construção.
 *
 * EXCEÇÃO NOMINAL E MÍNIMA (decisão do dono do produto, 23/10/2026): ID E NOME DE FUNCIONÁRIO,
 * só para atribuir perfil de vendedor na Base de conhecimento (`contas/[tenantId]/base-de-conhecimento`).
 *   - O QUE PERMITE: a rota `GET /api/super-admin/base-de-conhecimento/funcionarios` devolve
 *     `{ id, nome }` dos funcionários ativos da empresa, e o GET da base devolve o nome dos vendedores
 *     já gravados (este desde o #126).
 *   - O QUE NÃO PERMITE: telefone, e-mail, cargo, salário, status ou qualquer outra coluna de
 *     funcionário; e nada de clientes, orçamentos ou valores de venda. Outro campo é outra decisão.
 *   - POR QUÊ: o perfil de vendedor é configuração do Atendimentos I.A. e precisa dizer A QUEM se
 *     aplica; sem o nome, o super admin escolheria um uuid às cegas.
 * A regra continua valendo para o que protege — o conteúdo do negócio do cliente.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * O bloco 2C.1 trouxe o grupo MODELO + NICHO. A projeção de gasto ainda não está aqui.
 *
 * OS DOIS BLOCOS (dono do produto, 28/10/2026): depois da configuração, a tela tem BASE DE CONHECIMENTO (o acesso à
 * base, de onde vêm os fornecedores e, deles, as tabelas) e PROMPT DE ATENDIMENTO (`PromptDeAtendimento`: o contexto da
 * empresa, texto livre até 4.000 caracteres — manda em quando e em que forma, nunca no número). O bloco MOTOR SAIU
 * daqui: "o bloco Motor sai de onde está e passa a ser item da base de conhecimento, dentro da família" — manter os
 * dois seria duas verdades na mesma tela. O motor mora na família, na base de conhecimento (`EtapasDaFamilia`). O
 * teste de anexo fica à parte, como instrumento de diagnóstico do consultor.
 *
 * "TABELAS EM USO" SAIU desta tela (dono do produto, 26/10/2026): as tabelas da conta são DERIVADAS dos
 * fornecedores que a base de conhecimento vincula (`tabelas-da-conta.ts`), e não há segunda escolha a fazer.
 * O motor, agora, mora na família, na base de conhecimento.
 *
 * A TRAVA DO MODELO E DO NICHO CONTINUA, e mudou de fonte: enquanto a base de conhecimento vincular
 * fornecedor com tabela, a ROTA recusa (409) a troca e nomeia as tabelas que seguram, e esta tela mostra a
 * recusa — e diz a trava antes, em `AVISO_DA_TRAVA_DO_MODELO_E_NICHO`. É a escolha conservadora: nada é
 * apagado por efeito colateral de um seletor. Ver `gravarModeloENicho` em `pages/api/super-admin/orcamentista/[tenantId].ts`.
 *
 * A gravação manda SÓ `modelo` e `nicho_id` (`CorpoDoModeloENicho`), pela rota da conta: o
 * liga/desliga é de Tenants, e a gravação do modelo e do nicho não leva `ativo` (`orcamentista-config.ts`).
 *
 * O NICHO É DO MODELO: o seletor oferece só os nichos do modelo escolhido, e trocar o modelo
 * esvazia o nicho NO FORMULÁRIO. Não é regra inventada pela tela — é a FK composta
 * `(modelo, nicho_id)` do banco (`20261019000001`): um nicho de outro modelo seria recusado.
 *
 * A conta é LIDA da lista de contas ligadas (`ROTAS_DO_CATALOGO.contas`): conta que não está lá
 * não está ligada, e não ganha formulário. Falha de leitura é ERRO, nunca formulário vazio.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Card, Select, Space, Typography, message } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import {
    AVISO_DA_TRAVA_DO_MODELO_E_NICHO,
    BASE_DO_CADASTRO,
    MODELOS,
    ROTAS_DO_CATALOGO,
    ROTULO_DO_MODELO,
    TITULO_DA_BASE_DO_CADASTRO,
    usaTabelaDeFornecedor,
    type ContaLigada,
    type Modelo,
    type ModeloSemFornecedor,
    type Nicho,
} from '@/utils/atendimentos-ia-catalogo'
import { rotaDaConfig, type CorpoDoModeloENicho } from '@/utils/orcamentista-config'
import { TesteDeAnexo } from '@/page-parts/atendimentos-ia/teste-de-anexo.component'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { NichoSelect } from '@/page-parts/atendimentos-ia/nicho-select.component'
import { PromptDeAtendimento } from '@/page-parts/atendimentos-ia/prompt-de-atendimento.component'
import { rotaDaTelaDaBase } from '@/page-parts/atendimentos-ia/base-de-conhecimento/formulario'

const SEM_MODELO = '__sem_modelo__'

export default function ConfiguracaoDaConta() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin
    const tenantId = typeof router.query.tenantId === 'string' ? router.query.tenantId : null

    const [conta, setConta] = useState<ContaLigada | null | undefined>(undefined)
    const [nichos, setNichos] = useState<Nicho[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [modelo, setModelo] = useState<Modelo | null>(null)
    const [nichoId, setNichoId] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    /** A recusa da rota fica NA TELA até a próxima tentativa — a frase do 409 diz o que segura. */
    const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null)

    const carregar = useCallback(async () => {
        if (!tenantId) return
        try {
            const [cs, ns] = await Promise.all([
                chamarRota<ContaLigada[]>(ROTAS_DO_CATALOGO.contas),
                chamarRota<Nicho[]>(ROTAS_DO_CATALOGO.nichos),
            ])
            const achada = cs.find((c) => c.tenant_id === tenantId) ?? null
            setConta(achada)
            setNichos(ns)
            setModelo(achada?.modelo ?? null)
            setNichoId(achada?.nicho_id ?? null)
            setErro(null)
        } catch (e) {
            setErro((e as Error).message)
        }
    }, [tenantId])

    useEffect(() => { if (ehSuperAdmin) carregar() }, [ehSuperAdmin, carregar])

    const nichosDoModelo = useMemo(() => nichos.filter((n) => n.modelo === modelo), [nichos, modelo])

    if (currentUser && !ehSuperAdmin) {
        router.replace(ROUTES.DASHBOARD)
        return null
    }
    if (!ehSuperAdmin) return null

    async function salvar() {
        if (!tenantId) return
        setSalvando(true)
        setErroAoSalvar(null)
        try {
            const corpo: CorpoDoModeloENicho = { modelo, nicho_id: modelo ? nichoId : null }
            await chamarRota(rotaDaConfig(tenantId), 'PATCH', corpo)
            message.success('Configuração salva')
            await carregar()
        } catch (e) {
            setErroAoSalvar((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    const voltar = <Button onClick={() => router.push(ROUTES.SUPER_ADMIN_IA_CONTAS)}>← Voltar</Button>

    if (erro) {
        return (
            <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_CONTA}>
                <Alert type="error" showIcon message="Não foi possível ler a configuração da conta." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            </Layout>
        )
    }
    if (conta === null) {
        return (
            <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_CONTA}>
                <Alert type="warning" showIcon message="Esta conta não está com o Atendimentos I.A. ligado." description="Ligue em Super Admin → Tenants; depois ela aparece em Contas ligadas." action={voltar} />
            </Layout>
        )
    }
    if (conta === undefined) return <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_CONTA}>{null}</Layout>
    const semFornecedor = !!conta.modelo && !usaTabelaDeFornecedor(conta.modelo)

    return (
        <Layout title={conta.nome} subtitle={PAGE_TITLES.SUPER_ADMIN_IA_CONTA}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>{voltar}</div>
            <Card>
                <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 380 }}>
                    <div>
                        <Typography.Title level={5} style={{ marginTop: 0 }}>Modelo de atendimento</Typography.Title>
                        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                            Como o motor da I.A. atende esta conta. É campo do Atendimentos I.A. — não encosta na
                            segmentação fiscal que o cliente escolheu no primeiro acesso dele.
                        </Typography.Paragraph>
                        <Select<string>
                            style={{ width: '100%' }}
                            aria-label="Modelo"
                            value={modelo ?? SEM_MODELO}
                            onChange={(v) => {
                                setModelo(v === SEM_MODELO ? null : (v as Modelo))
                                setNichoId(null)
                            }}
                            options={[
                                { value: SEM_MODELO, label: '— não definido —' },
                                ...MODELOS.map((m) => ({ value: m, label: ROTULO_DO_MODELO[m] })),
                            ]}
                        />
                    </div>
                    <div>
                        <Typography.Title level={5} style={{ marginTop: 0 }}>Nicho</Typography.Title>
                        <NichoSelect
                            nichos={nichosDoModelo}
                            value={nichoId ?? undefined}
                            onChange={(id) => setNichoId(id ?? null)}
                            disabled={!modelo}
                            allowClear
                            placeholder={!modelo ? 'Escolha o modelo primeiro' : nichosDoModelo.length ? undefined : 'Nenhum nicho deste modelo — crie um no Catálogo'}
                        />
                    </div>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }} data-aviso="trava-do-modelo-e-nicho">
                        {AVISO_DA_TRAVA_DO_MODELO_E_NICHO}
                    </Typography.Paragraph>
                    <Button type="primary" onClick={salvar} loading={salvando}>Salvar configuração</Button>
                    {erroAoSalvar && <Alert type="error" showIcon message="A configuração não foi salva." description={erroAoSalvar} />}
                </Space>
            </Card>
            {/* OS TRÊS BLOCOS (dono do produto, 26/10/2026): as três camadas, visíveis, nesta ordem.
                BASE DE CONHECIMENTO (fornecedores, tabelas, preços — edita dado, estruturado), MOTOR (a cascata e o
                que está carregado — mostra, e edita só escolha estruturada) e PROMPT DE ATENDIMENTO (como conversar). */}
            <Card style={{ marginTop: 16 }} data-bloco="base-de-conhecimento">
                <Typography.Title level={4} style={{ marginTop: 0 }}>1. Base de conhecimento</Typography.Title>
                <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                    Fornecedores, tabelas e preços desta conta. Edita dado, estruturado.
                </Typography.Paragraph>
                {/* Só Fabricação usa fornecedor → tabela → motor (`MODELO_COM_FORNECEDOR`, decisão do
                    dono do produto de 19/10/2026). Revenda e Prestação de serviço montam o orçamento
                    a partir do cadastro do próprio cliente. Lê o modelo SALVO da conta, não o do
                    formulário: a configuração vale depois de salva. */}
                {semFornecedor && (
                    <div data-grupo="base-do-cadastro">
                        <Typography.Title level={5} style={{ marginTop: 0 }}>{TITULO_DA_BASE_DO_CADASTRO}</Typography.Title>
                        <Typography.Paragraph style={{ marginBottom: 0 }}>{BASE_DO_CADASTRO[conta.modelo as ModeloSemFornecedor]}</Typography.Paragraph>
                    </div>
                )}
                <div style={{ marginTop: semFornecedor ? 16 : 0 }} data-grupo="acesso-a-base-de-conhecimento">
                    <Typography.Title level={5} style={{ marginTop: 0 }}>Base de conhecimento</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                        Perfil, vidro, acessórios, produção, vendedores e adicionais desta conta. As tabelas da conta são as
                        dos fornecedores vinculados aqui.
                    </Typography.Paragraph>
                    <Button onClick={() => router.push(rotaDaTelaDaBase(conta.tenant_id))}>Base de conhecimento</Button>
                </div>
            </Card>
            <Card style={{ marginTop: 16 }} data-bloco="prompt-de-atendimento">
                <Typography.Title level={4} style={{ marginTop: 0 }}>2. Prompt de atendimento</Typography.Title>
                <PromptDeAtendimento tenantId={conta.tenant_id} />
            </Card>
            {/* REGRA DE PRODUTO (dono do produto, 26/10/2026): toda mensagem nasce da conversa do vendedor com o
                agente; o super admin é o consultor e não fala com ninguém. O teste de anexo FICA, como instrumento
                de diagnóstico do consultor — não é funcionalidade. */}
            <Card style={{ marginTop: 16 }} data-bloco="diagnostico">
                <Typography.Title level={5} style={{ marginTop: 0 }}>Instrumento de diagnóstico do consultor</Typography.Title>
                <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                    Para conferir a conexão — não é funcionalidade. Toda mensagem ao vendedor nasce da conversa dele com o agente.
                </Typography.Paragraph>
                <TesteDeAnexo tenantId={conta.tenant_id} />
            </Card>
        </Layout>
    )
}
