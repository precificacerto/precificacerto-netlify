/**
 * Uma linha de tabela numa lista: arquivo e motor à ESQUERDA, a data na BORDA DIREITA — nunca
 * emendada no texto (pedido do dono do produto, 19/10/2026). A data vai em `tabular-nums` para os
 * dígitos ficarem um embaixo do outro de uma linha para a seguinte.
 */
import React from 'react'

/** O estilo da data alinhada à direita — o mesmo na lista do credenciamento e na coluna "Subido em". */
export const ESTILO_DA_DATA: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }

export function LinhaDaTabela({ arquivo, motor, data }: { arquivo: string; motor: string | null; data?: string | null }) {
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, width: '100%' }}>
            <span style={{ flex: 1, minWidth: 0 }} data-linha="arquivos">{arquivo} · motor: {motor || 'sem motor (preço puro)'}</span>
            {data ? <span style={{ ...ESTILO_DA_DATA, marginLeft: 'auto' }} data-linha="data">{data}</span> : null}
        </div>
    )
}
