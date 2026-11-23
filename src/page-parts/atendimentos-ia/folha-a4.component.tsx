/**
 * A FOLHA A4 NA TELA (dono do produto, 22/11/2026): "todos os relatórios que nós temos ali em abas, quando ele clicar no relatório, ele já pode
 * abrir em formato de folha A4, já automaticamente no display". A folha mostrada é o PRÓPRIO PDF, gerado pela mesma função do botão "Baixar
 * PDF" — a mesma paginação, as mesmas quebras, sem uma segunda montagem que possa divergir (`copia-divergente`).
 *
 * A vista "Tabela" fica ao lado, para quem precisa copiar um código ou está num aparelho que não mostra PDF embutido (o celular, às vezes).
 */
import React, { useEffect, useState } from 'react'
import { Alert, Radio, Spin } from 'antd'

export type VistaDoRelatorio = 'a4' | 'tabela'
export const VISTA_PADRAO: VistaDoRelatorio = 'a4'
export const FRASE_SEM_VISOR = 'Este navegador não mostra a folha A4 aqui: use "Baixar PDF" ou a vista Tabela.'
export const FRASE_DA_FOLHA_QUE_FALHOU = 'Não foi possível montar a folha A4: use "Baixar PDF" ou a vista Tabela.'

/** O seletor das duas vistas: Folha A4 (o padrão) e Tabela. */
export function SeletorDaVista({ vista, mudar }: { vista: VistaDoRelatorio; mudar: (v: VistaDoRelatorio) => void }) {
    return (
        <Radio.Group optionType="button" buttonStyle="solid" data-vista-do-relatorio={vista} value={vista} onChange={(e) => mudar(e.target.value as VistaDoRelatorio)}
            options={[{ label: 'Folha A4', value: 'a4' }, { label: 'Tabela', value: 'tabela' }]} />
    )
}

/** A folha A4: o PDF de `gerar` num visor embutido, na proporção da página. `gerar` muda só quando o relatório muda. */
export function FolhaA4({ gerar, titulo }: { gerar: () => Promise<Uint8Array>; titulo: string }) {
    const [estado, setEstado] = useState<{ tipo: 'gerando' } | { tipo: 'pronta'; url: string } | { tipo: 'falhou'; frase: string }>({ tipo: 'gerando' })
    useEffect(() => {
        let vivo = true
        let url: string | null = null
        if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
            setEstado({ tipo: 'falhou', frase: FRASE_SEM_VISOR })
            return
        }
        setEstado({ tipo: 'gerando' })
        void gerar().then((bytes) => {
            if (!vivo) return
            url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
            setEstado({ tipo: 'pronta', url })
        }).catch(() => { if (vivo) setEstado({ tipo: 'falhou', frase: FRASE_DA_FOLHA_QUE_FALHOU }) })
        return () => { vivo = false; if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url) }
    }, [gerar])
    if (estado.tipo === 'gerando') return <div style={{ padding: 24, textAlign: 'center' }} data-folha-a4="gerando"><Spin /></div>
    if (estado.tipo === 'falhou') return <Alert type="info" showIcon message={estado.frase} data-folha-a4="falhou" />
    return (
        <div data-folha-a4="pronta" style={{ maxWidth: 900, margin: '0 auto' }}>
            <iframe title={titulo} src={`${estado.url}#view=FitH`} style={{ width: '100%', aspectRatio: '210 / 297', border: '1px solid #d9d9d9', background: '#fff' }} />
        </div>
    )
}
