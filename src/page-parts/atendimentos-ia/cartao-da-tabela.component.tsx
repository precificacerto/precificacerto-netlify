/**
 * UM CARTÃO POR TABELA do fornecedor (dono do produto, 02/11/2026).
 *
 * "eu estou vendo muito mal distribuído por coluna. Eu acho que nós temos que fazer as colunas se tornarem linhas. E aí cada discriminação tendo a
 * sua descrição. [...] Cada fornecedor, que vai ter uma tabela, vai ser uma célula."
 *
 * A grade de nove colunas quebrava o texto em três linhas em quase todas elas. Agora: o nome do arquivo em destaque no topo; dentro, cada
 * informação numa LINHA, com o rótulo à esquerda e o valor à direita — as MESMAS SETE de antes, mais nada (`CAMPOS_DO_CARTAO`); os botões
 * (Importação, Editar, Remover) no rodapé. Em janela estreita, o valor desce para baixo do rótulo e o texto quebra em qualquer ponto
 * (`overflowWrap: 'anywhere'`), em vez de sair do cartão; os botões quebram de linha, sem corte.
 */
import React from 'react'
import { Button, Space, Switch, Typography } from 'antd'
import { ESTILO_DA_DATA } from '@/page-parts/atendimentos-ia/linha-da-tabela.component'
import { dataEHoraBR, type TabelaDoFornecedor } from '@/utils/atendimentos-ia-catalogo'

/** Os rótulos, na ordem do dono do produto: motor · família · categoria · vigente · vigência · subido em · contas usando. */
export const CAMPOS_DO_CARTAO = ['Motor', 'Família', 'Categoria', 'Vigente', 'Vigência (nota)', 'Subido em', 'Contas usando'] as const

const ESTILO_DA_LINHA: React.CSSProperties = {
    display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 16, rowGap: 2,
    padding: '6px 0', borderBottom: '1px solid var(--color-neutral-100)',
}
const ESTILO_DO_ROTULO: React.CSSProperties = { flex: '0 0 auto' }
const ESTILO_DO_VALOR: React.CSSProperties = { flex: '1 1 12rem', minWidth: 0, textAlign: 'right', overflowWrap: 'anywhere' }

function Linha({ rotulo, campo, children }: { rotulo: (typeof CAMPOS_DO_CARTAO)[number]; campo: string; children: React.ReactNode }) {
    return (
        <div style={ESTILO_DA_LINHA} data-linha-do-cartao={campo}>
            <Typography.Text type="secondary" style={ESTILO_DO_ROTULO} data-rotulo>{rotulo}</Typography.Text>
            <div style={ESTILO_DO_VALOR} data-valor>{children}</div>
        </div>
    )
}

const Vazio = ({ children, ...data }: { children: React.ReactNode } & Record<`data-${string}`, boolean>) => <Typography.Text type="secondary" {...data}>{children}</Typography.Text>

interface Props {
    tabela: TabelaDoFornecedor
    /** O valor da família, já resolvido pela página (o rótulo do catálogo, "Qualquer linha" ou "não informada"). */
    familia: React.ReactNode
    categoria: React.ReactNode
    onVigente: (vigente: boolean) => void
    onImportacao: () => void
    onEditar: () => void
    onRemover: () => void
}

export function CartaoDaTabela({ tabela: t, familia, categoria, onVigente, onImportacao, onEditar, onRemover }: Props) {
    return (
        <article className="pc-card" style={{ padding: 16, minWidth: 0 }} data-cartao-da-tabela={t.id}>
            <Typography.Title level={5} style={{ margin: '0 0 8px', overflowWrap: 'anywhere' }} data-arquivo-do-cartao>{t.arquivo_nome}</Typography.Title>
            <Linha rotulo="Motor" campo="motor">{t.motor_nome ?? <Vazio data-sem-motor>sem motor (preço puro)</Vazio>}</Linha>
            <Linha rotulo="Família" campo="familia">{familia}</Linha>
            <Linha rotulo="Categoria" campo="categoria">{categoria}</Linha>
            {/* a VIGENTE é a marca que decide o que levantamento novo usa (26/10/2026); a Vigência abaixo é só a nota do consultor */}
            <Linha rotulo="Vigente" campo="vigente">
                <Switch size="small" checked={t.vigente} onChange={onVigente} data-vigente={t.id} aria-label={`Vigente: ${t.arquivo_nome}`} />
            </Linha>
            <Linha rotulo="Vigência (nota)" campo="vigencia">{t.vigencia ?? <Vazio>—</Vazio>}</Linha>
            {/* o momento do arquivo ATUAL, com a hora (dono do produto, 02/11/2026: "exato momento"), em `tabular-nums` */}
            <Linha rotulo="Subido em" campo="subido-em"><span style={ESTILO_DA_DATA} data-campo="subido-em">{dataEHoraBR(t.arquivo_em)}</span></Linha>
            <Linha rotulo="Contas usando" campo="contas-usando">{t.contas_usando.length ? t.contas_usando.join(', ') : <Vazio>—</Vazio>}</Linha>
            <Space wrap style={{ justifyContent: 'flex-end', width: '100%', marginTop: 12 }} data-botoes-do-cartao>
                <Button size="small" onClick={onImportacao}>Importação</Button>
                <Button size="small" onClick={onEditar}>Editar</Button>
                <Button size="small" danger onClick={onRemover} data-remover-tabela={t.id}>Remover</Button>
            </Space>
        </article>
    )
}
