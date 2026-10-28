/**
 * As ETAPAS de cada família (dono do produto, 27/10/2026; migração 20261027000003): o que o consultor cadastra —
 * número, rótulo LIVRE, AÇÃO de uma lista FECHADA (combo, nunca texto), instrução e as abas da planilha que a etapa
 * carrega. Mora em "Fornecedores e tabelas", abaixo das famílias.
 *
 * O RÓTULO É LIVRE; A AÇÃO NÃO É. A ação sai do combo com as cinco do sistema: etapa sem ação da lista é erro, não
 * etapa nova — o código precisa saber o que fazer ali, e um rótulo não diz isso. O número é a posição na lista:
 * reordenar é subir e descer, e o salvar manda a lista inteira. NÃO HÁ botão de remover etapa gravada (a função
 * também recusa); a etapa nova, ainda não salva, pode ser descartada do rascunho.
 *
 * CADA ETAPA TEM O SEU MOTOR (dono do produto, 27/10/2026; migração 20261027000008): o combo "Motor da etapa" lista as planilhas da MESMA
 * família, não arquivadas, e vai no corpo só quando MUDA (salvar o rótulo não toca no motor). "Inserir etapa abaixo" põe uma etapa nova na
 * posição (as de baixo descem). Trocar de planilha é apontar a etapa para a nova e só então arquivar a velha — arquivar a que uma etapa
 * ainda aponta é recusado pela função.
 *
 * A LISTA DE ETAPAS É A LISTA DE MOTORES (dono do produto, 27/10/2026; migração 20261027000010): cada etapa GRAVADA tem o seu campo de
 * arquivo. Subir o arquivo cria o motor da família (global, opção A) e já aponta a etapa, numa transação só; trocar é subir outro. A
 * etapa nova, ainda não salva, mostra "salve antes"; com alteração pendente o campo fica travado (subir relê a lista). O motor novo nasce
 * SEM TEMPO. O aviso no topo diz que etapa e motor valem para TODAS as contas da família, e nomeia quais.
 *
 * O que se salva aqui AINDA NÃO muda a conversa: o PR D passa a ler as etapas. A tela diz isso.
 *
 * Tudo pela rota (`rotaDasEtapas`), nunca pelo cliente do Supabase. A recusa aparece NO cartão, com a frase da rota.
 * Portão: `src/utils/__tests__/atendimentos-ia-etapas-a-tela.test.tsx`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Input, Radio, Select, Space, Typography, Upload, message } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, PlusOutlined, UploadOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons'
import { chamarRota, enviarArquivoDoMotor } from '@/page-parts/atendimentos-ia/api'
import type { Familia } from '@/utils/atendimentos-ia-catalogo'
import {
    ABAS_DA_ETAPA, ACOES_DA_ETAPA, LIMITE_DA_INSTRUCAO_DA_ETAPA, LIMITE_DO_ROTULO_DA_ETAPA, ROTULO_DA_ABA, ROTULO_DA_ACAO,
    abasEmOrdem, corpoDoRascunho, etapasMudaram, inserirEtapaAbaixo, lerCorpoDasEtapas, moverEtapa, novaEtapaNoRascunho, rascunhoDasEtapas, rotaDasEtapas,
    type EtapaDaFamilia, type EtapaNoRascunho, type MotorDaFamilia,
} from '@/utils/atendimentos-ia-etapas'
import { avisoDoMotorGlobal, fraseDoMotorCriado, rotaDoMotorDaEtapa } from '@/utils/atendimentos-ia-motor-da-etapa'

export const AVISO_DAS_ETAPAS =
    'O rótulo é livre; a ação não é. Cada etapa tem uma das ações do sistema, e etapa sem ação da lista é erro, não etapa nova. '
    + 'O número é a posição na lista. Etapa gravada não se remove por aqui. O que for salvo ainda não muda a conversa: o PR que troca os leitores passa a lê-las.'
export const SEM_ETAPAS = 'Esta família ainda não tem etapas cadastradas.'
export const SALVE_ANTES_DE_SUBIR_O_MOTOR = 'Salve a etapa antes de subir o arquivo do motor.'
export const SALVE_AS_ETAPAS_ANTES_DE_SUBIR = 'Há alterações nas etapas que ainda não foram salvas: salve antes de subir um arquivo (subir relê a lista).'
export const SEM_MOTORES = 'Esta família ainda não tem planilha de motor carregada.'
export const rotuloDoMotor = (m: MotorDaFamilia) => `${m.arquivo_nome} (${m.fornecedor ?? 'da família'})`

/** As etapas de UMA família — a lista de etapas é a lista de motores. Montada no cartão de "Fornecedores e tabelas" e na base de conhecimento. */
export function EtapasDaFamilia({ familia }: { familia: string }) {
    const [gravadas, setGravadas] = useState<EtapaDaFamilia[] | null>(null)
    const [motores, setMotores] = useState<MotorDaFamilia[]>([])
    const [rascunho, setRascunho] = useState<EtapaNoRascunho[]>([])
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [contas, setContas] = useState<string[]>([])
    const [subindo, setSubindo] = useState<string | null>(null)
    const [erroDaSubida, setErroDaSubida] = useState<{ etapaId: string; mensagem: string } | null>(null)

    const carregar = useCallback(async () => {
        setErroAoLer(null)
        try {
            const r = await chamarRota<{ etapas: EtapaDaFamilia[]; motores?: MotorDaFamilia[]; contas?: string[] }>(rotaDasEtapas(familia))
            setGravadas(r.etapas)
            setMotores(r.motores ?? [])
            setContas(r.contas ?? [])
            setRascunho(rascunhoDasEtapas(r.etapas))
        } catch (e) {
            setGravadas(null)
            setErroAoLer((e as Error).message)
        }
    }, [familia])
    useEffect(() => { setGravadas(null); setErroAoSalvar(null); carregar() }, [carregar])

    const mudou = gravadas !== null && etapasMudaram(rascunho, gravadas)
    const mudarEtapa = (local: string, f: Partial<EtapaNoRascunho>) => setRascunho((r) => r.map((e) => (e.local === local ? { ...e, ...f } : e)))

    async function salvar() {
        // a rota confere de novo; conferir aqui diz qual etapa antes de gastar o pedido
        const conferido = lerCorpoDasEtapas(corpoDoRascunho(rascunho))
        if (conferido.ok === false) { setErroAoSalvar(conferido.erro); return }
        setSalvando(true)
        setErroAoSalvar(null)
        try {
            await chamarRota(rotaDasEtapas(familia), 'PUT', { etapas: conferido.etapas })
            message.success('Etapas salvas')
            await carregar()
        } catch (e) {
            setErroAoSalvar((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    /**
     * Subir o arquivo numa etapa GRAVADA: envia para a pasta da família, e a rota lê, cria o motor e aponta a etapa numa transação só.
     * Só sem alteração pendente — subir relê a lista, e o que estivesse no rascunho se perderia. A recusa aparece NO cartão da etapa.
     */
    async function subir(etapaId: string, arquivo: File) {
        setSubindo(etapaId)
        setErroDaSubida(null)
        try {
            const enviado = await enviarArquivoDoMotor(familia, arquivo)
            const r = await chamarRota<{ regras: number; tipologias: number; detalhes?: number }>(rotaDoMotorDaEtapa(familia, etapaId), 'POST', { path: enviado.path, nome: enviado.nome })
            message.success(fraseDoMotorCriado(r))
            await carregar()
        } catch (e) {
            setErroDaSubida({ etapaId, mensagem: (e as Error).message })
        } finally {
            setSubindo(null)
        }
    }

    if (erroAoLer) return <Alert type="error" showIcon message="Não foi possível ler as etapas." description={erroAoLer} action={<Button onClick={carregar}>Tentar de novo</Button>} data-erro-das-etapas />
    if (gravadas === null) return null
    return (
        <div data-etapas-da-familia={familia}>
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message={avisoDoMotorGlobal(contas)} data-aviso-do-motor-global />
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }} data-motores-da-familia>
                {motores.length === 0 ? SEM_MOTORES : `Motores desta família: ${motores.map(rotuloDoMotor).join('; ')}.`}
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
                                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Motor da etapa (planilha da família)</Typography.Text>
                                <Select aria-label={`Motor da etapa ${i + 1}`} style={{ width: 320 }} allowClear placeholder="Sem motor"
                                    value={e.motor_id ?? undefined} onChange={(v) => mudarEtapa(e.local, { motor_id: v ?? null })}
                                    options={[...motores.map((m) => ({ value: m.id, label: rotuloDoMotor(m) })),
                                        // o motor gravado que a lista não traz (a função não deixa arquivar o apontado; isto é só para nunca esconder o que está gravado)
                                        ...(e.motor_id != null && !motores.some((m) => m.id === e.motor_id) ? [{ value: e.motor_id, label: `(motor ${e.motor_id.slice(0, 8)}…, fora da lista)` }] : [])]} />
                            </div>
                        </Space>
                        <div style={{ marginTop: 8 }} data-arquivo-do-motor={e.local}>
                            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Arquivo do motor desta etapa (subir cria o motor e aponta a etapa)</Typography.Text>
                            {e.id === null
                                ? <Typography.Text type="secondary" data-salve-antes-de-subir>{SALVE_ANTES_DE_SUBIR_O_MOTOR}</Typography.Text>
                                : (
                                    <Space wrap>
                                        <Upload accept=".xlsx,.xlsm" showUploadList={false} maxCount={1} disabled={mudou || subindo !== null}
                                            beforeUpload={(arquivo) => {
                                                // o campo desabilitado já não dispara; esta guarda vale para o evento que chegar mesmo assim (arrastar, duplo disparo)
                                                if (!mudou && subindo === null) subir(e.id as string, arquivo as unknown as File)
                                                return false
                                            }}>
                                            <Button icon={<UploadOutlined />} loading={subindo === e.id} disabled={mudou || subindo !== null} aria-label={`Subir o arquivo do motor da etapa ${i + 1}`}>
                                                {e.motor_id ? 'Trocar o arquivo do motor' : 'Subir o arquivo do motor'}
                                            </Button>
                                        </Upload>
                                        {mudou && <Typography.Text type="secondary" style={{ fontSize: 12 }} data-salve-as-etapas>{SALVE_AS_ETAPAS_ANTES_DE_SUBIR}</Typography.Text>}
                                    </Space>
                                )}
                            {erroDaSubida?.etapaId === e.id && <Alert type="error" showIcon style={{ marginTop: 8 }} message="O motor não foi criado." description={erroDaSubida.mensagem} data-erro-da-subida />}
                        </div>
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
                <Button type="primary" disabled={!mudou || salvando} loading={salvando} onClick={salvar} data-salvar-etapas>Salvar etapas</Button>
            </Space>
            {erroAoSalvar && <Alert type="error" showIcon style={{ marginTop: 12 }} message="As etapas não foram salvas." description={erroAoSalvar} data-erro-ao-salvar-etapas />}
        </div>
    )
}

export function EtapasDaFamiliaCard({ familias }: { familias: Familia[] }) {
    const ordenadas = [...familias].sort((a, b) => a.ordem - b.ordem)
    const [escolhida, setEscolhida] = useState<string | null>(null)
    const atual = escolhida !== null && ordenadas.some((f) => f.chave === escolhida) ? escolhida : (ordenadas[0]?.chave ?? null)
    return (
        <Card title="Etapas da família" size="small" style={{ marginTop: 16 }} data-etapas-card>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>{AVISO_DAS_ETAPAS}</Typography.Paragraph>
            {atual === null
                ? <Typography.Text type="secondary">Nenhuma família cadastrada.</Typography.Text>
                : (
                    <>
                        <Radio.Group value={atual} onChange={(ev) => setEscolhida(ev.target.value as string)} aria-label="Família das etapas" style={{ marginBottom: 12 }}>
                            {ordenadas.map((f) => <Radio.Button key={f.chave} value={f.chave}>{f.rotulo}</Radio.Button>)}
                        </Radio.Group>
                        <EtapasDaFamilia key={atual} familia={atual} />
                    </>
                )}
        </Card>
    )
}
