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
import { Alert, Button, Card, Collapse, Progress, Space, Typography, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { colisoesDoCodigo, lerIndice, resumoDoEnvio, type LinhaDoIndice, type Recusa, type ResultadoDoEnvio } from '@/lib/atendimentos-ia/desenhos-das-tipologias'
import { enviarDesenhosDoZip } from '@/page-parts/atendimentos-ia/envio-dos-desenhos'

export const TITULO_DOS_DESENHOS = 'Desenhos das tipologias'
export const AVISO_DOS_DESENHOS =
    'Escolha o índice (tipologia_desenho.csv) e os zips de desenhos do WVetro. Cada imagem vai para tipologias/<grupo>/<arquivo>, com o grupo que o '
    + 'índice dá a ela. Rodar de novo continua de onde parou: o que já está no Storage não sobe outra vez, e nada é apagado.'

type ResultadoDoZip = ResultadoDoEnvio | { zip: string; erro: string }

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
    const [indice, setIndice] = useState<{ nome: string; linhas: LinhaDoIndice[] } | null>(null)
    const [erroDoIndice, setErroDoIndice] = useState<string | null>(null)
    const [zips, setZips] = useState<File[]>([])
    const [enviando, setEnviando] = useState(false)
    const [progresso, setProgresso] = useState<{ zip: string; feitos: number; total: number } | null>(null)
    const [resultados, setResultados] = useState<ResultadoDoZip[]>([])

    async function escolherIndice(arquivo: File) {
        setErroDoIndice(null)
        setIndice(null)
        const lido = lerIndice(await lerTexto(arquivo))
        if ('erro' in lido) setErroDoIndice(`${arquivo.name}: ${lido.erro}`)
        else setIndice({ nome: arquivo.name, linhas: lido.linhas })
        return false
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

    const colisoes = indice ? colisoesDoCodigo(indice.linhas.map((l) => l.codigo)) : []
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
                        description={colisoes.length > 0 ? `Achado no índice, não corrigido: ${colisoes.map((c) => c.frase).join('; ')}.` : undefined} />
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
            </Space>
        </Card>
    )
}
