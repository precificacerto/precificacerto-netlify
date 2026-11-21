/**
 * A TELA DA NATUREZA DA VARIÁVEL (dono do produto, item (3) da ordem, 21/11/2026): o super admin edita, por família da conta, a natureza de cada
 * variável do motor do levantamento (POLITICA / ITEM / CALCULO) e a opção padrão em TEXTO — e o vidro padrão por formato — sem SQL.
 *
 *   - Uma linha por variável do motor (com a descrição, em quantas tipologias e as opções do motor) e uma por formato de vidro.
 *   - Cada linha salva sozinha (PUT, `superadmin_gravar_natureza`): a função DEFINE ou TROCA; NÃO remove (`AVISO_SEM_REMOCAO`).
 *   - A política gravada vem com a conferência contra as tipologias (quantas casam, quais não têm opção que comece assim ou têm mais de uma).
 *   - A configuração que falta (família, etapa, motor) aparece com a frase da conferência das etapas, nunca como tela vazia.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, AutoComplete, Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { ROUTES } from '@/constants/routes'
import { NATUREZAS, type Natureza } from '@/lib/atendimentos-ia/natureza-da-variavel'
import { AVISO_SEM_REMOCAO, ROTULO_DA_NATUREZA, type VariavelResumida } from '@/lib/atendimentos-ia/tela-da-natureza'
import type { FamiliaDaTela, LinhaGravada, TelaDaNatureza } from '@/lib/atendimentos-ia/tela-da-natureza-servidor'
import { LIMITE_DO_TEXTO_DO_CAMINHO, type TextosDaFamilia } from '@/lib/atendimentos-ia/textos-do-caminho'

export const rotaDaApiDaNatureza = (tenantId: string) => `/api/super-admin/base-de-conhecimento/natureza?tenant=${tenantId}`
export const rotaDaTelaDaNatureza = (tenantId: string) => `${ROUTES.SUPER_ADMIN_IA_CONTAS}/${tenantId}/natureza`
export const rotaDaApiDosTextos = (tenantId: string) => `/api/super-admin/base-de-conhecimento/textos-do-caminho?tenant=${tenantId}`
export const AJUDA_DOS_TEXTOS =
    'Textos livres da empresa para esta família e para cada fornecedor do caminho dela. O agente os consulta quando tem dúvida; '
    + 'só entram no prompt os da família que está sendo levantada e dos fornecedores dela. Não mandam em número.'
export const SEM_A_TABELA_DOS_TEXTOS = 'Os textos por família e por fornecedor ainda não podem ser escritos: falta aplicar a migração 20261121000003.'

/** Um texto (da família ou de um fornecedor), editado no lugar e salvo sozinho; limpar grava "não escrito", nunca apaga. */
function EditorDoTexto({ tenantId, alvo, titulo, inicial, aoSalvar }: {
    tenantId: string; alvo: { familia: string } | { fornecedor_id: string }; titulo: string; inicial: string | null; aoSalvar: () => void
}) {
    const [texto, setTexto] = useState(inicial ?? '')
    const [erro, setErro] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const caracteres = [...texto.trim()].length
    const acima = caracteres > LIMITE_DO_TEXTO_DO_CAMINHO
    const mudou = (texto.trim() === '' ? null : texto.trim()) !== (inicial ?? null)
    async function salvar() {
        setSalvando(true); setErro(null)
        try {
            await chamarRota(rotaDaApiDosTextos(tenantId), 'PUT', { ...alvo, texto: texto.trim() === '' ? null : texto.trim() })
            aoSalvar()
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }
    return (
        <Space direction="vertical" size={4} style={{ width: '100%' }} data-texto-do-caminho={'familia' in alvo ? `familia:${alvo.familia}` : `fornecedor:${alvo.fornecedor_id}`}>
            <Typography.Text strong>{titulo}</Typography.Text>
            <Input.TextArea value={texto} onChange={(e) => setTexto(e.target.value)} autoSize={{ minRows: 2, maxRows: 8 }} />
            <Space wrap>
                <Typography.Text type={acima ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{caracteres} / {LIMITE_DO_TEXTO_DO_CAMINHO.toLocaleString('pt-BR')}</Typography.Text>
                <Button size="small" type="primary" disabled={!mudou || acima} loading={salvando} onClick={salvar}>Salvar</Button>
            </Space>
            {erro && <Alert type="error" showIcon message={erro} />}
        </Space>
    )
}

/** Os textos de uma família: o dela e o de cada fornecedor do caminho. Sem a tabela, a frase da migração. */
export function TextosDaFamiliaNaTela({ tenantId, familia, rotulo, textos, aoSalvar }: { tenantId: string; familia: string; rotulo: string; textos: TextosDaFamilia | null; aoSalvar: () => void }) {
    if (textos === null) return <Alert type="warning" showIcon message={SEM_A_TABELA_DOS_TEXTOS} data-sem-tabela-dos-textos />
    return (
        <Space direction="vertical" size={12} style={{ width: '100%' }} data-textos-da-familia={familia}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{AJUDA_DOS_TEXTOS}</Typography.Text>
            <EditorDoTexto key={`f:${textos.familia ?? ''}`} tenantId={tenantId} alvo={{ familia }} titulo={`Família ${rotulo}`} inicial={textos.familia} aoSalvar={aoSalvar} />
            {textos.fornecedores.map((f) => (
                <EditorDoTexto key={`${f.id}:${f.texto ?? ''}`} tenantId={tenantId} alvo={{ fornecedor_id: f.id }} titulo={`Fornecedor ${f.nome}`} inicial={f.texto} aoSalvar={aoSalvar} />
            ))}
        </Space>
    )
}

type Linha = { chave: string; variavel: string; formato: string | null; titulo: string; detalhe: string | null; opcoes: string[]; gravada: LinhaGravada | null }

/** As linhas da tabela de uma família: as variáveis do motor (sem o VIDRO) e o vidro por formato (os formatos das tipologias e os já gravados). */
export function linhasDaFamilia(f: FamiliaDaTela): Linha[] {
    const gravadaDe = (variavel: string, formato: string | null) => f.linhas.find((l) => l.variavel === variavel && l.formato === formato && l.linha === null) ?? null
    const doMotor = f.variaveis.filter((v) => v.variavel !== 'VIDRO').map((v: VariavelResumida): Linha => ({
        chave: v.variavel, variavel: v.variavel, formato: null, titulo: v.variavel,
        detalhe: `${v.descricao ?? 'sem descrição no motor'} · ${v.tipologias} tipologia${v.tipologias === 1 ? '' : 's'}`,
        opcoes: v.opcoes.map((o) => o.rotulo), gravada: gravadaDe(v.variavel, null),
    }))
    // a variável gravada que o motor não tem mais continua aparecendo (nada gravado some da tela)
    const foraDoMotor = f.linhas.filter((l) => l.variavel !== 'VIDRO' && !f.variaveis.some((v) => v.variavel === l.variavel)).map((l): Linha => ({
        chave: l.variavel, variavel: l.variavel, formato: null, titulo: l.variavel, detalhe: 'não está no motor do levantamento', opcoes: [], gravada: l,
    }))
    const formatos = [...new Set([...f.formatos, ...f.linhas.filter((l) => l.variavel === 'VIDRO' && l.formato !== null).map((l) => l.formato as string)])]
    const vidros = formatos.map((formato): Linha => ({
        chave: `VIDRO:${formato}`, variavel: 'VIDRO', formato, titulo: `VIDRO — ${formato}`, detalhe: 'o código do item na tabela de vidro do fornecedor principal',
        opcoes: [], gravada: gravadaDe('VIDRO', formato),
    }))
    return [...doMotor, ...foraDoMotor, ...vidros]
}

function EditorDaLinha({ tenantId, familia, linha, aoSalvar }: { tenantId: string; familia: string; linha: Linha; aoSalvar: () => void }) {
    const [natureza, setNatureza] = useState<Natureza | null>(linha.gravada?.natureza ?? null)
    const [opcao, setOpcao] = useState<string>(linha.gravada?.opcao_padrao ?? '')
    const [erro, setErro] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const mudou = natureza !== (linha.gravada?.natureza ?? null) || (natureza === 'POLITICA' && opcao.trim() !== (linha.gravada?.opcao_padrao ?? ''))
    const salvar = async () => {
        if (natureza === null) return
        setSalvando(true); setErro(null)
        try {
            await chamarRota(rotaDaApiDaNatureza(tenantId), 'PUT', { linha: {
                familia, formato: linha.formato, variavel: linha.variavel, natureza, opcao_padrao: natureza === 'POLITICA' ? opcao : null,
            } })
            aoSalvar()
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }
    return (
        <Space direction="vertical" size={4} style={{ width: '100%' }} data-linha-da-natureza={linha.chave}>
            <Space wrap>
                <Select<Natureza> style={{ minWidth: 220 }} placeholder="sem definição" value={natureza ?? undefined} onChange={setNatureza}
                    options={NATUREZAS.map((n) => ({ value: n, label: ROTULO_DA_NATUREZA[n].split(' — ')[0] }))} />
                {natureza === 'POLITICA' && (
                    <AutoComplete style={{ minWidth: 260 }} value={opcao} onChange={setOpcao} placeholder="o começo do rótulo da opção"
                        options={linha.opcoes.map((o) => ({ value: o }))} filterOption={(t, o) => String(o?.value ?? '').toUpperCase().includes(t.toUpperCase())} />
                )}
                <Button type="primary" disabled={!mudou || natureza === null} loading={salvando} onClick={salvar}>Salvar</Button>
            </Space>
            {natureza !== null && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{ROTULO_DA_NATUREZA[natureza]}</Typography.Text>}
            {linha.gravada?.conferencia && <Alert type="warning" showIcon message={linha.gravada.conferencia} />}
            {erro && <Alert type="error" showIcon message={erro} />}
        </Space>
    )
}

export function NaturezaDaVariavel({ tenantId }: { tenantId: string }) {
    const [tela, setTela] = useState<TelaDaNatureza | null>(null)
    const [erro, setErro] = useState<string | null>(null)
    const carregar = useCallback(async () => {
        try { setTela(await chamarRota<TelaDaNatureza>(rotaDaApiDaNatureza(tenantId))); setErro(null) } catch (e) { setErro((e as Error).message) }
    }, [tenantId])
    useEffect(() => { carregar() }, [carregar])
    const familias = useMemo(() => (tela?.ok ? tela.familias : []), [tela])

    if (erro) return <Alert type="error" showIcon message="Não foi possível ler a natureza das variáveis." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} />
    if (tela === null) return null
    if (tela.ok === false) return <Alert type="warning" showIcon message="Falta de configuração" description={<span style={{ whiteSpace: 'pre-line' }}>{tela.frase}</span>} />
    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert type="info" showIcon message={AVISO_SEM_REMOCAO} />
            {familias.map((f) => (
                <Card key={f.familia} title={<Space wrap><span>{f.rotulo}</span><Tag>{f.familia}</Tag><Typography.Text type="secondary">motor {f.motor.nome}</Typography.Text></Space>} data-familia={f.familia}>
                    <Card size="small" type="inner" title="Textos da família e dos fornecedores" style={{ marginBottom: 12 }}>
                        <TextosDaFamiliaNaTela tenantId={tenantId} familia={f.familia} rotulo={f.rotulo} textos={f.textos} aoSalvar={carregar} />
                    </Card>
                    <Table<Linha> rowKey="chave" pagination={false} size="small" dataSource={linhasDaFamilia(f)} columns={[
                        { title: 'Variável', key: 'v', width: '35%', render: (_, l) => (<Space direction="vertical" size={0}>
                            <Typography.Text strong>{l.titulo}</Typography.Text>
                            {l.detalhe && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{l.detalhe}</Typography.Text>}
                        </Space>) },
                        { title: 'Natureza e opção padrão', key: 'n', render: (_, l) => (
                            <EditorDaLinha key={`${l.chave}:${l.gravada?.atualizado_em ?? '-'}`} tenantId={tenantId} familia={f.familia} linha={l} aoSalvar={carregar} />) },
                    ]} />
                </Card>
            ))}
        </Space>
    )
}
