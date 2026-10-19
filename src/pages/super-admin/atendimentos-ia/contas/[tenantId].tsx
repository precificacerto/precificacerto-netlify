/**
 * Atendimentos I.A. → Contas ligadas → configuração de UMA conta (EPIC §5.4, bloco 2C.1). Só o
 * super admin.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a lista de contas e a tela de configuração mostram APENAS o
 * nome/identificação da conta e a configuração do Atendimentos I.A. NADA do conteúdo da conta —
 * nem clientes, nem orçamentos, nem funcionários, nem valores. O super admin não tem tenant e não
 * pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * NESTE BLOCO, só o grupo MODELO + NICHO. "Tabelas em uso" é o 2C.2 e a projeção de gasto é o
 * 2C.3 — e nada aqui diz o que trocar o modelo ou o nicho faz com as tabelas da conta: isso é
 * decisão em aberto (EPIC §3.6), e a tela não a toma.
 *
 * A gravação manda SÓ `modelo` e `nicho_id` (`CorpoDaSegmentacao`), pela rota da conta: o
 * liga/desliga é de Tenants, e a segmentação não leva `ativo` (`orcamentista-config.ts`).
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
import { MODELOS, ROTAS_DO_CATALOGO, ROTULO_DO_MODELO, type ContaLigada, type Modelo, type Nicho } from '@/utils/atendimentos-ia-catalogo'
import { rotaDaConfig, type CorpoDaSegmentacao } from '@/utils/orcamentista-config'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { NichoSelect } from '@/page-parts/atendimentos-ia/nicho-select.component'

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
            const corpo: CorpoDaSegmentacao = { modelo, nicho_id: modelo ? nichoId : null }
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
                            placeholder={!modelo ? 'Escolha o modelo primeiro' : nichosDoModelo.length ? undefined : 'Nenhum nicho deste modelo — crie um em Fornecedores e tabelas'}
                        />
                    </div>
                    <Button type="primary" onClick={salvar} loading={salvando}>Salvar configuração</Button>
                    {erroAoSalvar && <Alert type="error" showIcon message="A configuração não foi salva." description={erroAoSalvar} />}
                </Space>
            </Card>
        </Layout>
    )
}
