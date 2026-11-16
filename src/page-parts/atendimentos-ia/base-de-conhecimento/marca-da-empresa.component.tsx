/**
 * A MARCA DA EMPRESA, na base de conhecimento (dono do produto, 16/11/2026).
 *
 * O arquivo do orçamento já desenhava a logo no canto esquerdo do cabeçalho — e nenhuma tela do sistema a gravava
 * (medido em 16/11/2026: `logo_url` existia nas duas tabelas, o PDF a lia, nada a escrevia). É o que este bloco faz.
 *
 * ONDE FICA, e por quê (decisão do dono do produto, perguntado): na base de conhecimento DA EMPRESA, não no catálogo
 * do nicho. O catálogo é global, e uma marca lá sairia no PDF de todas as empresas.
 *
 * GRAVA SOZINHO, fora do "Salvar alterações" da tela: subir a imagem é a ação inteira, e misturá-la ao formulário
 * faria o botão único gravar uma imagem que o usuário só queria ver. Remover limpa a marca, com confirmação.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Popconfirm, Space, Typography, message } from 'antd'
import { FORMA_DA_MARCA, LIMITE_DA_MARCA, fraseDaMarcaForaDoFormato, fraseDaMarcaGrande } from '@/lib/atendimentos-ia/base-de-conhecimento'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { ROTAS_DA_BASE } from './formulario'

/** O arquivo escolhido vira o data URL que o PDF desenha — sem bucket, sem URL que expira. */
export function lerArquivoComoDataUrl(arquivo: File): Promise<string> {
    return new Promise((resolve, recusar) => {
        const leitor = new FileReader()
        leitor.onerror = () => recusar(new Error('não foi possível ler o arquivo'))
        leitor.onload = () => resolve(String(leitor.result ?? ''))
        leitor.readAsDataURL(arquivo)
    })
}

/** A recusa que o usuário lê ANTES de subir; a do banco é a que não deixa passar por outro caminho. */
export function recusaDaMarca(dados: string): string | null {
    if (!FORMA_DA_MARCA.test(dados)) return fraseDaMarcaForaDoFormato
    if (dados.length > LIMITE_DA_MARCA) return fraseDaMarcaGrande(dados.length)
    return null
}

export function MarcaDaEmpresa({ tenantId }: { tenantId: string }) {
    const [logo, setLogo] = useState<string | null | undefined>(undefined)
    const [erro, setErro] = useState<string | null>(null)
    const [gravando, setGravando] = useState(false)
    const entrada = useRef<HTMLInputElement | null>(null)

    const ler = useCallback(async () => {
        try {
            const r = await chamarRota<{ logo: string | null }>(ROTAS_DA_BASE.marca(tenantId))
            setLogo(r.logo)
            setErro(null)
        } catch (e) {
            setLogo(null)
            setErro((e as Error).message)
        }
    }, [tenantId])

    useEffect(() => { ler() }, [ler])

    const gravar = async (dados: string | null) => {
        setGravando(true)
        try {
            await chamarRota(ROTAS_DA_BASE.marca(tenantId), 'PUT', { logo: dados })
            setLogo(dados)
            setErro(null)
            message.success(dados === null ? 'Marca removida.' : 'Marca gravada.')
        } catch (e) {
            setErro((e as Error).message)
            message.error('A marca não foi gravada.')
        } finally {
            setGravando(false)
        }
    }

    const escolher = async (arquivo: File | undefined) => {
        if (!arquivo) return
        try {
            const dados = await lerArquivoComoDataUrl(arquivo)
            const recusa = recusaDaMarca(dados)
            if (recusa) { setErro(recusa); message.error(recusa); return }
            await gravar(dados)
        } catch (e) {
            setErro((e as Error).message)
        }
    }

    return (
        <Card key="marca" data-bloco="marca" title="Marca da empresa" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Typography.Text type="secondary">
                    É a logo que sai no cabeçalho do arquivo do orçamento. PNG ou JPEG, até cerca de 300 KB. Sem marca, o lugar fica em branco.
                </Typography.Text>
                {erro && <Alert type="error" showIcon message="A marca não foi gravada." description={erro} />}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 180, height: 110,
                    border: '1px dashed #d9d9d9', borderRadius: 8, background: '#fafafa', overflow: 'hidden',
                }}>
                    {logo
                        // eslint-disable-next-line @next/next/no-img-element -- é um data URL já em memória, sem host para otimizar
                        ? <img src={logo} alt="Marca da empresa" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        : <Typography.Text type="secondary">{logo === undefined ? 'lendo…' : 'sem marca'}</Typography.Text>}
                </div>
                <input ref={entrada} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
                    onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = '' }} />
                <Space wrap>
                    <Button type="primary" loading={gravando} onClick={() => entrada.current?.click()}>
                        {logo ? 'Trocar a marca' : 'Subir a marca'}
                    </Button>
                    {logo && (
                        <Popconfirm title="Remover a marca?" description="O cabeçalho do orçamento volta a sair sem logo."
                            okText="Remover" cancelText="Cancelar" onConfirm={() => gravar(null)}>
                            <Button danger loading={gravando}>Remover</Button>
                        </Popconfirm>
                    )}
                </Space>
            </Space>
        </Card>
    )
}
