/**
 * O modal da TABELA (EPIC §5.6): Arquivo → Motor → Família → Categoria → Vigência, NESSA ORDEM.
 *
 * A FAMÍLIA (dono do produto, 26/10/2026) vem da LISTA (`familias`, da rota) e é OBRIGATÓRIA na
 * tabela nova: sem ela o salvar não liga. Nenhuma vem escolhida pela tela — nem quando a lista tem
 * uma só. Na edição de uma tabela de antes da família, a tela diz "Família não informada" e salvar
 * sem escolher não manda família (a família se troca, e não se apaga).
 *
 * A CATEGORIA (dono do produto, 27/10/2026: "uma tabela = uma categoria") vem da LISTA (`categorias`, da rota) e é
 * OBRIGATÓRIA na tabela nova, nos mesmos termos da família: sem ela o salvar não liga, e nenhuma vem escolhida pela
 * tela. Na edição, a tabela de antes (sem categoria) pode ganhar UMA, uma vez; a que já tem aparece como texto,
 * porque não se troca (a rota e o banco recusam).
 *
 * O MOTOR É OBRIGATÓRIO SÓ NA TABELA DE PERFIL (27/10/2026): com a categoria PERFIL escolhida, sem o arquivo do motor o botão de salvar
 * não liga, e a frase diz por quê; nas demais categorias (Reforço, Acessórios… — preço puro) o arquivo é opcional. Esta é a trava da
 * TELA — a da ROTA é a que vale (`lerCorpoDaTabela`), e o banco tem a terceira (CHECK `orcamentista_tabela_perfil_exige_motor`).
 *
 * Serve dois usos: a tabela NOVA (os dois arquivos são exigidos) e a EDIÇÃO (cada arquivo é
 * trocado só se outro for escolhido; o atual aparece pelo nome).
 *
 * TODA RECUSA APARECE AQUI DENTRO, com o arquivo e o motivo (dono do produto, 20/10/2026: "pop-up
 * que não fecha e não explica é pior que erro"):
 *   - o FORMATO é conferido AO ESCOLHER — o `accept` é sugestão, não trava; ver o cabeçalho de
 *     `EXTENSOES_ACEITAS`. O arquivo recusado não entra;
 *   - o erro de SALVAR vem da página pela prop `erro` e aparece num Alert dentro do modal — não
 *     num `message` passageiro fora dele.
 * Portão: `atendimentos-ia-formato-do-arquivo.test.tsx`.
 */
import React, { useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Radio, Typography, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { AVISO_DO_CATALOGO, CATEGORIA_QUE_EXIGE_MOTOR, EXTENSOES_ACEITAS, MENSAGEM_CATEGORIA_OBRIGATORIA, MENSAGEM_FAMILIA_OBRIGATORIA, MENSAGEM_MOTOR_OBRIGATORIO, MOTIVO_DO_FORMATO_RECUSADO, extensaoAceita, fraseDoArquivo, type Categoria, type Familia } from '@/utils/atendimentos-ia-catalogo'
import type { TabelaPendente } from './api'

export const TEXTO_DO_MOTOR = 'O motor é quem faz as reduções de tipologia em cima dos perfis desta tabela. Só a tabela de Perfil leva o arquivo do motor; Reforço e Acessórios são preço puro.'
export const TITULO_DO_ERRO_AO_SALVAR = 'A tabela não foi salva.'

export interface AtualDaTabela { arquivo_nome: string; motor_nome: string | null; vigencia: string | null; familia: string | null; categoria_chave: string | null }

interface Props {
    aberto: boolean
    titulo: string
    /** A lista fechada das famílias, na ordem (`ROTAS_DO_CATALOGO.familias`). */
    familias: Familia[]
    /** A lista fechada das categorias, na ordem (`ROTAS_DO_CATALOGO.categorias`). */
    categorias: Categoria[]
    /** Presente na edição: os arquivos atuais. Ausente na tabela nova. */
    atual?: AtualDaTabela
    salvando?: boolean
    /** O motivo da última tentativa de salvar que falhou — a frase da rota, com o arquivo. */
    erro?: string | null
    onCancelar: () => void
    onSalvar: (t: TabelaPendente) => void
}

function Escolha({ rotulo, arquivo, atual, onEscolher }: { rotulo: string; arquivo: File | null; atual?: string; onEscolher: (f: File) => void }) {
    const [recusa, setRecusa] = useState<string | null>(null)
    return (
        <div style={{ marginBottom: 14 }}>
            <Typography.Text strong>{rotulo}</Typography.Text>
            <div style={{ marginTop: 6 }}>
                <Upload
                    accept={EXTENSOES_ACEITAS.join(',')}
                    maxCount={1}
                    showUploadList={false}
                    beforeUpload={(f) => {
                        if (!extensaoAceita(f.name)) { setRecusa(fraseDoArquivo(f.name, MOTIVO_DO_FORMATO_RECUSADO)); return false }
                        setRecusa(null)
                        onEscolher(f as File)
                        return false
                    }}
                >
                    <Button icon={<UploadOutlined />}>{arquivo || atual ? 'Trocar arquivo' : 'Escolher arquivo'}</Button>
                </Upload>
                <span style={{ marginLeft: 10 }} data-arquivo={rotulo}>
                    {arquivo ? arquivo.name : atual ? <>{atual} <Typography.Text type="secondary">(atual)</Typography.Text></> : <Typography.Text type="secondary">nenhum</Typography.Text>}
                </span>
            </div>
            {recusa && <Alert type="error" showIcon message={recusa} style={{ marginTop: 8 }} data-recusa={rotulo} />}
        </div>
    )
}

export function TabelaModal({ aberto, titulo, familias, categorias, atual, salvando, erro, onCancelar, onSalvar }: Props) {
    const [arquivo, setArquivo] = useState<File | null>(null)
    const [motor, setMotor] = useState<File | null>(null)
    const [vigencia, setVigencia] = useState('')
    const [familia, setFamilia] = useState<string | null>(null)
    const [categoria, setCategoria] = useState<string | null>(null)

    useEffect(() => {
        if (!aberto) return
        setArquivo(null)
        setMotor(null)
        setVigencia(atual?.vigencia ?? '')
        setFamilia(atual?.familia ?? null)
        setCategoria(atual?.categoria_chave ?? null)
    // Só ao ABRIR — ver o mesmo comentário em `fornecedor-modal.component.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto])

    const temArquivo = !!arquivo || !!atual?.arquivo_nome
    const temMotor = !!motor || !!atual?.motor_nome
    // o motor só é exigido na tabela de PERFIL (27/10/2026); na edição a categoria vem da tabela, e na nova do que foi escolhido
    const faltaMotor = categoria === CATEGORIA_QUE_EXIGE_MOTOR && !temMotor
    // a tabela nova precisa da família; a edição de uma tabela sem família salva sem ela
    const faltaFamilia = !atual && familia === null
    // a tabela nova precisa da categoria; a edição de uma tabela de antes (sem categoria) salva sem ela
    const faltaCategoria = !atual && categoria === null
    const rotuloDaCategoria = atual?.categoria_chave ? categorias.find((c) => c.chave === atual.categoria_chave)?.rotulo ?? atual.categoria_chave : null
    const rotuloDaAtual = atual?.familia ? familias.find((f) => f.chave === atual.familia)?.rotulo ?? atual.familia : null

    return (
        <Modal
            open={aberto}
            title={titulo}
            onCancel={onCancelar}
            okText="Salvar tabela"
            cancelText="Cancelar"
            okButtonProps={{ disabled: !temArquivo || faltaMotor || faltaFamilia || faltaCategoria, loading: salvando }}
            // na edição, só vai a família (e a categoria) se mudou
            onOk={() => onSalvar({
                arquivo, motor, vigencia,
                familia: familia !== (atual?.familia ?? null) ? familia : null,
                categoria: categoria !== (atual?.categoria_chave ?? null) ? categoria : null,
            })}
            destroyOnClose
        >
            <Escolha rotulo="Arquivo da tabela" arquivo={arquivo} atual={atual?.arquivo_nome} onEscolher={setArquivo} />
            <Escolha rotulo="Arquivo do motor" arquivo={motor} atual={atual?.motor_nome} onEscolher={setMotor} />
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -6 }}>{TEXTO_DO_MOTOR}</Typography.Paragraph>
            {faltaMotor && <Alert type="warning" showIcon message={MENSAGEM_MOTOR_OBRIGATORIO} style={{ marginBottom: 12 }} />}
            <Typography.Text strong>Família</Typography.Text>
            <div style={{ marginTop: 6, marginBottom: 14 }}>
                <Radio.Group value={familia} onChange={(e) => setFamilia(e.target.value as string)} aria-label="Família da tabela">
                    {familias.map((f) => <Radio.Button key={f.chave} value={f.chave} data-familia={f.chave}>{f.rotulo}</Radio.Button>)}
                </Radio.Group>
                {atual && !atual.familia && familia === null && (
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '6px 0 0' }} data-familia-nao-informada>Família não informada.</Typography.Paragraph>
                )}
                {rotuloDaAtual && <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '6px 0 0' }}>Atual: {rotuloDaAtual}.</Typography.Paragraph>}
                {faltaFamilia && <Alert type="warning" showIcon message={MENSAGEM_FAMILIA_OBRIGATORIA} style={{ marginTop: 8 }} />}
            </div>
            <Typography.Text strong>Categoria</Typography.Text>
            <div style={{ marginTop: 6, marginBottom: 14 }}>
                {rotuloDaCategoria ? (
                    <Typography.Paragraph style={{ margin: 0 }} data-categoria-da-tabela={atual?.categoria_chave}>
                        {rotuloDaCategoria} <Typography.Text type="secondary">(não se troca; para outra categoria, suba outra tabela)</Typography.Text>
                    </Typography.Paragraph>
                ) : (
                    <Radio.Group value={categoria} onChange={(e) => setCategoria(e.target.value as string)} aria-label="Categoria da tabela">
                        {categorias.map((c) => <Radio.Button key={c.chave} value={c.chave} data-categoria={c.chave}>{c.rotulo}</Radio.Button>)}
                    </Radio.Group>
                )}
                {atual && !atual.categoria_chave && categoria === null && (
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '6px 0 0' }} data-categoria-nao-informada>Categoria não informada.</Typography.Paragraph>
                )}
                {faltaCategoria && <Alert type="warning" showIcon message={MENSAGEM_CATEGORIA_OBRIGATORIA} style={{ marginTop: 8 }} />}
            </div>
            <Typography.Text strong>Vigência</Typography.Text>
            <Input
                style={{ marginTop: 6 }}
                placeholder="ex.: desde 01/10/2026"
                value={vigencia}
                onChange={(e) => setVigencia(e.target.value)}
                aria-label="Vigência"
            />
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
                Aceita {EXTENSOES_ACEITAS.join(', ')}. {AVISO_DO_CATALOGO}
            </Typography.Paragraph>
            {erro && <Alert type="error" showIcon message={TITULO_DO_ERRO_AO_SALVAR} description={erro} data-erro-ao-salvar />}
        </Modal>
    )
}
