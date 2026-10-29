/**
 * As ETAPAS de UMA família-instância (dono do produto, 27/10/2026; família-instância e catálogo de motores em 28/10/2026, migração
 * 20261028000001): o que o consultor cadastra — número, rótulo LIVRE, AÇÃO de uma lista FECHADA (combo, nunca texto), instrução, as abas
 * da planilha que a etapa carrega e o MOTOR que ela usa. Mora na base de conhecimento da conta, dentro da família (a matéria-prima): a
 * mesma empresa pode ter três famílias PVC, cada uma com as suas etapas. O cartão "Etapas da família" do Catálogo saiu.
 *
 * O RÓTULO É LIVRE; A AÇÃO NÃO É. A ação sai do combo com as cinco do sistema: etapa sem ação da lista é erro, não
 * etapa nova — o código precisa saber o que fazer ali, e um rótulo não diz isso. O número é a posição na lista:
 * reordenar é subir e descer, e o salvar manda a lista inteira. NÃO HÁ botão de remover etapa gravada (a função
 * também recusa); a etapa nova, ainda não salva, pode ser descartada do rascunho.
 *
 * O MOTOR DA ETAPA SAI DO CATÁLOGO: o combo lista os motores do MESMO TIPO da família, não arquivados — primeiro os dos fornecedores
 * principais desta família —, e vai no corpo só quando MUDA (salvar o rótulo não toca no motor). NÃO HÁ campo de arquivo aqui: subir motor
 * de dentro da página de uma conta criaria dado global fora do catálogo. O link "cadastrar motor no catálogo" leva ao catálogo, em
 * Catálogo. Arquivar o motor que uma etapa aponta é recusado pela função.
 *
 * O que se salva aqui AINDA NÃO muda a conversa: o PR D passa a ler as etapas (por instância). A tela diz isso.
 *
 * Tudo pela rota (`rotaDasEtapas`), nunca pelo cliente do Supabase. A recusa aparece NO bloco, com a frase da rota.
 * Portão: `src/utils/__tests__/atendimentos-ia-etapas-a-tela.test.tsx`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Input, Select, Space, Typography, message } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, PlusOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { ROUTES } from '@/constants/routes'
import {
    ABAS_DA_ETAPA, ACOES_DA_ETAPA, LIMITE_DA_INSTRUCAO_DA_ETAPA, LIMITE_DO_ROTULO_DA_ETAPA, ROTULO_DA_ABA, ROTULO_DA_ACAO,
    abasEmOrdem, corpoDoRascunho, etapasMudaram, inserirEtapaAbaixo, lerCorpoDasEtapas, moverEtapa, novaEtapaNoRascunho, rascunhoDasEtapas, rotaDasEtapas,
    type EtapaDaFamilia, type EtapaNoRascunho,
} from '@/utils/atendimentos-ia-etapas'
import { ANCORA_DO_CATALOGO_DE_MOTORES, motoresParaAEtapa, rotuloDoMotor, type MotorDoCatalogo } from '@/utils/atendimentos-ia-catalogo-de-motores'
import { rotaDoNicho } from '@/utils/atendimentos-ia-catalogo'

export const AVISO_DAS_ETAPAS =
    'O rótulo é livre; a ação não é. Cada etapa tem uma das ações do sistema, e etapa sem ação da lista é erro, não etapa nova. '
    + 'O número é a posição na lista. Etapa gravada não se remove por aqui. As etapas são desta família, nesta empresa. '
    + 'O que for salvo ainda não muda a conversa: o PR que troca os leitores passa a lê-las.'
export const SEM_ETAPAS = 'Esta família ainda não tem etapas cadastradas.'
export const SEM_TIPO_SEM_ETAPAS = 'Escolha a família (o tipo) antes de cadastrar as etapas: o motor da etapa é do mesmo tipo.'
export const SEM_MOTORES_DO_TIPO = (tipo: string) => `O catálogo não tem motor do tipo ${tipo}: cadastre um antes de apontá-lo na etapa.`
export const CADASTRAR_MOTOR_NO_CATALOGO = 'Cadastrar motor no catálogo'
/** Os motores moram no NICHO (29/10/2026): o link cai na aba de motores do nicho da conta; sem nicho, no Catálogo, que lista os nichos. */
export const linkDoCatalogoDeMotores = (nichoId: string | null | undefined) =>
    (nichoId ? rotaDoNicho(nichoId, 'motores') : `${ROUTES.SUPER_ADMIN_IA_FORNECEDORES}#${ANCORA_DO_CATALOGO_DE_MOTORES}`)

/**
 * As etapas de UMA família-instância. `principais` são os fornecedores principais das categorias desta família (o combo os põe primeiro);
 * `rotuloDaCategoria` dá o nome da categoria no rótulo do motor.
 */
export function EtapasDaFamilia({ tenantId, materiaPrimaId, principais = [], rotuloDaCategoria, nichoId = null }: {
    tenantId: string; materiaPrimaId: string; principais?: readonly string[]; rotuloDaCategoria?: (c: string) => string
    /** O nicho da conta: o link "cadastrar motor no catálogo" cai nos motores dele. */
    nichoId?: string | null
}) {
    const [gravadas, setGravadas] = useState<EtapaDaFamilia[] | null>(null)
    const [familia, setFamilia] = useState<string | null>(null)
    const [motores, setMotores] = useState<MotorDoCatalogo[]>([])
    const [rascunho, setRascunho] = useState<EtapaNoRascunho[]>([])
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)

    const carregar = useCallback(async () => {
        setErroAoLer(null)
        try {
            const r = await chamarRota<{ familia: string | null; etapas: EtapaDaFamilia[]; motores?: MotorDoCatalogo[] }>(rotaDasEtapas(tenantId, materiaPrimaId))
            setGravadas(r.etapas)
            setFamilia(r.familia)
            setMotores(r.motores ?? [])
            setRascunho(rascunhoDasEtapas(r.etapas))
        } catch (e) {
            setGravadas(null)
            setErroAoLer((e as Error).message)
        }
    }, [tenantId, materiaPrimaId])
    useEffect(() => { setGravadas(null); setErroAoSalvar(null); carregar() }, [carregar])

    const mudou = gravadas !== null && etapasMudaram(rascunho, gravadas)
    const mudarEtapa = (local: string, f: Partial<EtapaNoRascunho>) => setRascunho((r) => r.map((e) => (e.local === local ? { ...e, ...f } : e)))
    const doCombo = familia === null ? [] : motoresParaAEtapa(motores, familia, principais)
    const rotulo = (m: MotorDoCatalogo) => rotuloDoMotor(m, rotuloDaCategoria)

    async function salvar() {
        // a rota confere de novo; conferir aqui diz qual etapa antes de gastar o pedido
        const conferido = lerCorpoDasEtapas(corpoDoRascunho(rascunho))
        if (conferido.ok === false) { setErroAoSalvar(conferido.erro); return }
        setSalvando(true)
        setErroAoSalvar(null)
        try {
            await chamarRota(rotaDasEtapas(tenantId), 'PUT', { materia_prima: materiaPrimaId, etapas: conferido.etapas })
            message.success('Etapas salvas')
            await carregar()
        } catch (e) {
            setErroAoSalvar((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    if (erroAoLer) return <Alert type="error" showIcon message="Não foi possível ler as etapas." description={erroAoLer} action={<Button onClick={carregar}>Tentar de novo</Button>} data-erro-das-etapas />
    if (gravadas === null) return null
    return (
        <div data-etapas-da-familia={materiaPrimaId}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>{AVISO_DAS_ETAPAS}</Typography.Paragraph>
            {familia === null && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={SEM_TIPO_SEM_ETAPAS} data-sem-tipo />}
            {familia !== null && doCombo.length === 0 && <Typography.Paragraph type="secondary" style={{ fontSize: 13 }} data-sem-motores-do-tipo>{SEM_MOTORES_DO_TIPO(familia)}</Typography.Paragraph>}
            <Typography.Paragraph style={{ fontSize: 13 }}>
                <a href={linkDoCatalogoDeMotores(nichoId)} target="_blank" rel="noreferrer" data-cadastrar-motor-no-catalogo>{CADASTRAR_MOTOR_NO_CATALOGO}</a>
            </Typography.Paragraph>
            {rascunho.length === 0 && <Typography.Paragraph type="secondary" data-sem-etapas>{SEM_ETAPAS}</Typography.Paragraph>}
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {rascunho.map((e, i) => (
                    <Card key={e.local} size="small" data-etapa={e.local} title={<span data-numero-da-etapa>{`Etapa ${i + 1}`}</span>}
                        extra={(
                            <Space size={4}>
                                <Button size="small" icon={<ArrowUpOutlined />} aria-label={`Subir a etapa ${i + 1}`} disabled={i === 0} onClick={() => setRascunho((r) => moverEtapa(r, i, -1))} />
                                <Button size="small" icon={<ArrowDownOutlined />} aria-label={`Descer a etapa ${i + 1}`} disabled={i === rascunho.length - 1} onClick={() => setRascunho((r) => moverEtapa(r, i, 1))} />
                                <Button size="small" icon={<VerticalAlignBottomOutlined />} aria-label={`Inserir uma etapa abaixo da etapa ${i + 1}`} onClick={() => setRascunho((r) => inserirEtapaAbaixo(r, i))}>Inserir etapa abaixo</Button>
                                {e.id === null && <Button size="small" onClick={() => setRascunho((r) => r.filter((x) => x.local !== e.local))}>Descartar</Button>}
                            </Space>
                        )}>
                        <Space wrap align="start" style={{ width: '100%' }}>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Rótulo (livre)</Typography.Text>
                                <Input aria-label={`Rótulo da etapa ${i + 1}`} style={{ width: 260 }} maxLength={LIMITE_DO_ROTULO_DA_ETAPA} value={e.rotulo} onChange={(ev) => mudarEtapa(e.local, { rotulo: ev.target.value })} />
                            </div>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Ação (da lista)</Typography.Text>
                                <Select aria-label={`Ação da etapa ${i + 1}`} style={{ width: 280 }} placeholder="Escolha a ação" value={e.acao ?? undefined}
                                    onChange={(v) => mudarEtapa(e.local, { acao: v })} options={ACOES_DA_ETAPA.map((a) => ({ value: a, label: ROTULO_DA_ACAO[a] }))} />
                            </div>
                            <div data-motor-da-etapa={e.local}>
                                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Motor da etapa (do catálogo, do mesmo tipo)</Typography.Text>
                                <Select aria-label={`Motor da etapa ${i + 1}`} style={{ width: 320 }} allowClear placeholder="Sem motor"
                                    value={e.motor_id ?? undefined} onChange={(v) => mudarEtapa(e.local, { motor_id: v ?? null })}
                                    options={[...doCombo.map((m) => ({ value: m.id, label: rotulo(m) })),
                                        // o motor gravado que a lista não traz (a função não deixa arquivar o apontado; isto é só para nunca esconder o que está gravado)
                                        ...(e.motor_id != null && !doCombo.some((m) => m.id === e.motor_id) ? [{ value: e.motor_id, label: `(motor ${e.motor_id.slice(0, 8)}…, fora da lista)` }] : [])]} />
                            </div>
                        </Space>
                        <div style={{ marginTop: 8 }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Instrução</Typography.Text>
                            <Input.TextArea aria-label={`Instrução da etapa ${i + 1}`} autoSize={{ minRows: 2, maxRows: 10 }} value={e.instrucao} onChange={(ev) => mudarEtapa(e.local, { instrucao: ev.target.value })} />
                            <Typography.Text type={[...e.instrucao].length > LIMITE_DA_INSTRUCAO_DA_ETAPA ? 'danger' : 'secondary'} style={{ fontSize: 12 }} data-contagem-da-instrucao>
                                {`${[...e.instrucao].length.toLocaleString('pt-BR')} de ${LIMITE_DA_INSTRUCAO_DA_ETAPA.toLocaleString('pt-BR')} caracteres`}
                            </Typography.Text>
                        </div>
                        <div style={{ marginTop: 8 }} data-abas-da-etapa>
                            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Abas da planilha que a etapa carrega</Typography.Text>
                            <Checkbox.Group value={e.abas} onChange={(v) => mudarEtapa(e.local, { abas: abasEmOrdem(v as string[]) })}
                                options={ABAS_DA_ETAPA.map((a) => ({ value: a, label: ROTULO_DA_ABA[a] }))} />
                        </div>
                    </Card>
                ))}
            </Space>
            <Space style={{ marginTop: 12 }}>
                <Button icon={<PlusOutlined />} onClick={() => setRascunho((r) => [...r, novaEtapaNoRascunho()])}>Nova etapa</Button>
                <Button type="primary" disabled={!mudou || salvando || familia === null} loading={salvando} onClick={salvar} data-salvar-etapas>Salvar etapas</Button>
            </Space>
            {erroAoSalvar && <Alert type="error" showIcon style={{ marginTop: 12 }} message="As etapas não foram salvas." description={erroAoSalvar} data-erro-ao-salvar-etapas />}
        </div>
    )
}
