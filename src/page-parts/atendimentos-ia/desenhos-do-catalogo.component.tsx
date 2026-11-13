/**
 * OS DESENHOS DAS TIPOLOGIAS, na sexta aba do nicho (dono do produto, 11/11/2026): o super admin escolhe o ÍNDICE canônico (o CSV) e os
 * ZIPS do WVetro; a página descompacta cada zip no navegador, pula o `indice.csv` de dentro e manda imagem por imagem para
 * `tipologias/<grupo>/<arquivo>` — a pasta sai da coluna GRUPO do índice, nunca do nome do zip. Ver `desenhos-das-tipologias.ts`.
 *
 * Ao fim, por zip, o resumo e as listas NOMEADAS: falhas, recusados, ignorados, já existiam e os citados no índice que o zip não tem. Rodar de
 * novo retoma: o que já está no bucket não sobe outra vez, e nada é apagado.
 *
 * Esta aba NÃO grava o índice no banco: a tabela do índice é de uma migração PENDENTE, e a importação vem depois dela.
 */
import React, { useState } from 'react'
import { Alert, Button, Card, Checkbox, Collapse, Divider, Progress, Space, Typography, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { codigosComAMesmaDescricao, codigosQueANormalizacaoJuntaria, lerIndice, resumoDoEnvio, type LinhaDoIndice, type Recusa, type ResultadoDoEnvio } from '@/lib/atendimentos-ia/desenhos-das-tipologias'
import { enviarDesenhosDoZip } from '@/page-parts/atendimentos-ia/envio-dos-desenhos'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { ROTAS_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'

export const TITULO_DOS_DESENHOS = 'Desenhos das tipologias'
export const AVISO_DOS_DESENHOS =
    'Escolha o índice (tipologia_desenho.csv) e os zips de desenhos do WVetro. Cada imagem vai para tipologias/<grupo>/<arquivo>, com o grupo que o '
    + 'índice dá a ela. Rodar de novo continua de onde parou: o que já está no Storage não sobe outra vez, e nada é apagado.'

type ResultadoDoZip = ResultadoDoEnvio | { zip: string; erro: string }
type Importacao = { resultado: string; antes?: number; linhas: number; sha256: string; sem_arquivo: string[]; juntados_pela_normalizacao: string[]; mesma_descricao: string[] }
type Conferencia = { sem_objeto: string[]; sem_linha: string[]; caminhos: number; objetos: number }
/** O que a tela diz de uma importação: o resultado, as contagens e o sha256 do texto que entrou (para conferir com o do arquivo). */
export const resumoDaImportacao = (r: Importacao) => r.resultado === 'igual'
    ? `O índice é o mesmo da última importação (sha256 ${r.sha256}): nada foi apagado nem regravado; a tabela segue com ${r.linhas} linhas.`
    : `Importado: a tabela tinha ${r.antes ?? 0} linhas e agora tem ${r.linhas} (sha256 ${r.sha256}).`
/** A conferência índice × Storage: zero dos dois lados é o slug casado; qualquer um é nomeado. */
export const resumoDaConferencia = (c: Conferencia) => (c.sem_objeto.length === 0 && c.sem_linha.length === 0
    ? `Índice e Storage casam: ${c.caminhos} caminhos, ${c.objetos} objetos, nenhum de um lado sem o outro.`
    : `${c.sem_objeto.length} caminho(s) do índice sem objeto no Storage e ${c.sem_linha.length} objeto(s) do Storage que nenhuma linha aponta.`)

/** O texto de um arquivo escolhido (FileReader: vale no navegador e no ambiente de teste). */
const lerTexto = (arquivo: Blob) => new Promise<string>((ok, falha) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result ?? ''))
    r.onerror = () => falha(r.error ?? new Error('o arquivo não pôde ser lido'))
    r.readAsText(arquivo, 'utf-8')
})

/** Uma lista nomeada, aberta só quando o usuário quer ver; a contagem fica no título, sempre. */
function ListaNomeada({ titulo, itens, chave }: { titulo: string; itens: ReadonlyArray<Recusa | string>; chave: string }) {
    if (itens.length === 0) return null
    return (
        <Collapse size="small" items={[{ key: chave, label: `${titulo} (${itens.length})`, children: (
            <ul style={{ margin: 0, paddingLeft: 18 }} data-lista={chave}>
                {itens.map((x, i) => <li key={i}>{typeof x === 'string' ? x : `${x.arquivo} — ${x.motivo}`}</li>)}
            </ul>
        ) }]} />
    )
}

export function DesenhosDoCatalogo() {
    const [indice, setIndice] = useState<{ nome: string; linhas: LinhaDoIndice[]; texto: string } | null>(null)
    const [permitirEncolher, setPermitirEncolher] = useState(false)
    const [importando, setImportando] = useState(false)
    const [importacao, setImportacao] = useState<Importacao | { erro: string; recusas?: string[] } | null>(null)
    const [conferindo, setConferindo] = useState(false)
    const [conferencia, setConferencia] = useState<Conferencia | { erro: string } | null>(null)
    const [erroDoIndice, setErroDoIndice] = useState<string | null>(null)
    const [zips, setZips] = useState<File[]>([])
    const [enviando, setEnviando] = useState(false)
    const [progresso, setProgresso] = useState<{ zip: string; feitos: number; total: number } | null>(null)
    const [resultados, setResultados] = useState<ResultadoDoZip[]>([])

    async function escolherIndice(arquivo: File) {
        setErroDoIndice(null)
        setIndice(null)
        const texto = await lerTexto(arquivo)
        const lido = lerIndice(texto)
        if ('erro' in lido) setErroDoIndice(`${arquivo.name}: ${lido.erro}`)
        else setIndice({ nome: arquivo.name, linhas: lido.linhas, texto })
        return false
    }

    async function importar() {
        if (!indice) return
        setImportando(true)
        setImportacao(null)
        try {
            setImportacao(await chamarRota<Importacao>(ROTAS_DO_CATALOGO.importacaoDeDesenhos, 'POST', { texto: indice.texto, permitir_encolher: permitirEncolher }))
        } catch (e) {
            const corpo = (e as { corpo?: { recusas?: string[] } }).corpo
            setImportacao({ erro: (e as Error).message, recusas: corpo?.recusas })
        }
        setImportando(false)
    }

    async function conferir() {
        setConferindo(true)
        setConferencia(null)
        try { setConferencia(await chamarRota<Conferencia>(ROTAS_DO_CATALOGO.conferenciaDeDesenhos)) } catch (e) { setConferencia({ erro: (e as Error).message }) }
        setConferindo(false)
    }

    async function enviar() {
        if (!indice) return
        setEnviando(true)
        setResultados([])
        const feitos: ResultadoDoZip[] = []
        for (const z of zips) {
            try {
                const r = await enviarDesenhosDoZip(z, z.name, indice.linhas, undefined, (f, t) => setProgresso({ zip: z.name, feitos: f, total: t }))
                feitos.push('erro' in r ? { zip: z.name, erro: r.erro } : r)
            } catch (e) {
                feitos.push({ zip: z.name, erro: `o zip não pôde ser lido: ${(e as Error).message}` })
            }
            setResultados([...feitos])
        }
        setProgresso(null)
        setEnviando(false)
    }

    const juntados = indice ? codigosQueANormalizacaoJuntaria(indice.linhas.map((l) => l.codigo)).map((c) => c.frase) : []
    const mesmaDescricao = indice ? codigosComAMesmaDescricao(indice.linhas) : []
    const achados = [...juntados, ...mesmaDescricao]
    return (
        <Card title={TITULO_DOS_DESENHOS} data-desenhos>
            <Typography.Paragraph type="secondary">{AVISO_DOS_DESENHOS}</Typography.Paragraph>
            <Space direction="vertical" style={{ width: '100%' }}>
                <Upload accept=".csv" maxCount={1} showUploadList={false} beforeUpload={escolherIndice} disabled={enviando}>
                    <Button icon={<UploadOutlined />} disabled={enviando}>Escolher o índice (CSV)</Button>
                </Upload>
                {erroDoIndice && <Alert type="error" showIcon message={erroDoIndice} data-erro-do-indice="" />}
                {indice && (
                    <Alert type="info" showIcon data-indice-lido=""
                        message={`${indice.nome}: ${indice.linhas.length} linhas, ${new Set(indice.linhas.map((l) => l.zip).filter(Boolean)).size} zips citados.`}
                        description={achados.length > 0 ? `Achados no índice, não corrigidos (o código do motor não se normaliza; quem decide é o dono do produto): ${achados.join('; ')}.` : undefined} />
                )}
                <Upload accept=".zip" multiple showUploadList={false} disabled={enviando}
                    beforeUpload={(f, lista) => { setZips(lista); return false }}>
                    <Button icon={<UploadOutlined />} disabled={enviando}>Escolher os zips</Button>
                </Upload>
                {zips.length > 0 && <Typography.Text data-zips="">{zips.map((z) => z.name).join(', ')}</Typography.Text>}
                <Button type="primary" onClick={enviar} loading={enviando} disabled={!indice || zips.length === 0}>Enviar os desenhos</Button>
                {progresso && <Progress percent={progresso.total ? Math.round((100 * progresso.feitos) / progresso.total) : 0} format={() => `${progresso.zip}: ${progresso.feitos}/${progresso.total}`} />}
                {resultados.map((r) => (
                    <Card size="small" key={r.zip} data-resultado={r.zip}>
                        {'erro' in r ? <Alert type="error" showIcon message={`${r.zip}: ${r.erro}`} /> : (
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Alert type={r.falhas.length > 0 ? 'warning' : 'success'} showIcon message={resumoDoEnvio(r)}
                                    description={r.falhas.length > 0 ? 'Rode o envio de novo com o mesmo zip: só o que falhou será tentado.' : undefined} />
                                <ListaNomeada titulo="Falharam" itens={r.falhas} chave="falhas" />
                                <ListaNomeada titulo="Recusados" itens={r.recusados} chave="recusados" />
                                <ListaNomeada titulo="Citados no índice e ausentes do zip" itens={r.faltamNoZip} chave="faltam" />
                                <ListaNomeada titulo="Ignorados" itens={r.ignorados} chave="ignorados" />
                                <ListaNomeada titulo="Já existiam" itens={r.jaExistiam} chave="ja-existiam" />
                            </Space>
                        )}
                    </Card>
                ))}
                <Divider />
                <Typography.Title level={5}>Importar o índice</Typography.Title>
                <Typography.Paragraph type="secondary">
                    Grava o índice no banco: apaga e regrava a tabela inteira, numa transação. Um índice com menos linhas do que a tabela tem é recusado, a
                    menos que você permita encolher.
                </Typography.Paragraph>
                <Checkbox checked={permitirEncolher} onChange={(e) => setPermitirEncolher(e.target.checked)} disabled={importando} data-permitir-encolher="">
                    Permitir que a tabela encolha
                </Checkbox>
                <Button onClick={importar} loading={importando} disabled={!indice}>Importar o índice</Button>
                {importacao && ('erro' in importacao
                    ? <Alert type="error" showIcon message={importacao.erro} data-importacao-erro=""
                        description={importacao.recusas?.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{importacao.recusas.map((x, i) => <li key={i}>{x}</li>)}</ul> : undefined} />
                    : <Space direction="vertical" style={{ width: '100%' }} data-importacao="">
                        <Alert type="success" showIcon message={resumoDaImportacao(importacao)} />
                        <ListaNomeada titulo="Linhas sem arquivo nos zips" itens={importacao.sem_arquivo} chave="sem-arquivo" />
                        <ListaNomeada titulo="Códigos diferentes que a normalização juntaria" itens={importacao.juntados_pela_normalizacao} chave="juntados" />
                        <ListaNomeada titulo="Códigos com a mesma descrição no índice" itens={importacao.mesma_descricao} chave="mesma-descricao" />
                    </Space>)}
                <Divider />
                <Typography.Title level={5}>Conferir índice × Storage</Typography.Title>
                <Button onClick={conferir} loading={conferindo}>Conferir</Button>
                {conferencia && ('erro' in conferencia
                    ? <Alert type="error" showIcon message={conferencia.erro} data-conferencia-erro="" />
                    : <Space direction="vertical" style={{ width: '100%' }} data-conferencia="">
                        <Alert type={conferencia.sem_objeto.length || conferencia.sem_linha.length ? 'warning' : 'success'} showIcon message={resumoDaConferencia(conferencia)} />
                        <ListaNomeada titulo="Caminhos do índice sem objeto no Storage" itens={conferencia.sem_objeto} chave="sem-objeto" />
                        <ListaNomeada titulo="Objetos do Storage que nenhuma linha aponta" itens={conferencia.sem_linha} chave="sem-linha" />
                    </Space>)}
            </Space>
        </Card>
    )
}
