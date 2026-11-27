/**
 * O bloco da PRECIFICAÇÃO do orçamento I.A. (pedido 0051): a tela de Produtos no modo "orçamento". Ver `PrecificacaoDoOrcamento`.
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, message, Spin } from 'antd'
import { Content } from '@/page-parts/products/content.component'
import { useAuth } from '@/hooks/use-auth.hook'
import { getTenantId } from '@/utils/get-tenant-id'
import { fetchTaxPreview } from '@/utils/calc-tax-preview'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { buildCalcBase } from '@/utils/build-calc-base'
import type { CalcBaseType } from '@/types/calc-base.type'
import type { DestinoDoProdutoDoOrcamento, GravacaoDaPrecificacao, OrcamentoNaPrecificacao } from '@/lib/atendimentos-ia/precificacao-do-orcamento'
import type { ClienteDoArquivo, ItemDoArquivo } from '@/lib/atendimentos-ia/arquivo-do-orcamento'
import { AvisoDoFiscalDivergente, TopoDoOrcamento } from '@/page-parts/atendimentos-ia/topo-do-orcamento.component'
import { rastroDoFiscalSobrescrito, type CampoDivergente } from '@/lib/atendimentos-ia/precificacao-do-orcamento'

type Estado =
    | { tipo: 'carregando' }
    | { tipo: 'erro'; mensagem: string }
    | { tipo: 'pronto'; orcamento: OrcamentoNaPrecificacao; calcBase: CalcBaseType; versao: number; itensDoArquivo: ItemDoArquivo[] | null; recusaDosItens: string | null; cliente: ClienteDoArquivo | null; fiscalDivergente: CampoDivergente[] }

/** As recusas que a rota devolve, cada uma numa linha; o resto vira a frase geral. */
async function recusasDaResposta(r: Response, geral: string): Promise<string[]> {
    const corpo = (await r.json().catch(() => ({}))) as { error?: string; erros?: string[]; recusas?: string[] }
    if (Array.isArray(corpo.erros) && corpo.erros.length) return corpo.erros
    if (Array.isArray(corpo.recusas) && corpo.recusas.length) return [corpo.error ?? geral, ...corpo.recusas]
    return [corpo.error ?? geral]
}

/**
 * A PRECIFICAÇÃO DO ORÇAMENTO, como bloco (pedido 0051, 27/11/2026: "a tela do orçamento I.A. numa página só"): é o mesmo bloco da tela de
 * Produtos no modo orçamento, montado por `/orcamentos-ia/[id]` logo abaixo dos itens — e pelo atalho `/orcamentos-ia/[id]/precificacao`. `sinal` muda
 * quando o orçamento é recalculado: o bloco relê o gravado e remonta, e o que estava só na tela (sem salvar) cai, como sempre depois de um cálculo.
 * `aoMudarOArquivo` avisa a página depois do salvar (já com o produto gravado) e do recálculo: o arquivo PDF foi regerado, e o visualizador relê.
 */
export function PrecificacaoDoOrcamento({ id, sinal = 0, aoMudarOArquivo, comLinkDoArquivo = true, naPaginaDoOrcamento = false }: { id: string | null; sinal?: number; aoMudarOArquivo?: () => void; comLinkDoArquivo?: boolean; naPaginaDoOrcamento?: boolean }) {
    const { currentUser } = useAuth()
    const [messageApi, contextHolder] = message.useMessage()
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    const [recusasDoArquivo, setRecusasDoArquivo] = useState<string[]>([])

    const carregar = useCallback(async () => {
        if (!id) return
        try {
            const tenantId = await getTenantId()
            if (!tenantId) return setEstado({ tipo: 'erro', mensagem: 'Não foi possível identificar a empresa.' })
            const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}/precificacao`)
            if (!r.ok) return setEstado({ tipo: 'erro', mensagem: (await recusasDaResposta(r, 'Não foi possível ler o orçamento.')).join(' ') })
            const { orcamento, cliente, fiscal_divergente, itens_do_arquivo, recusa_dos_itens } = (await r.json()) as {
                orcamento: OrcamentoNaPrecificacao; cliente?: ClienteDoArquivo | null; fiscal_divergente?: CampoDivergente[]; itens_do_arquivo?: ItemDoArquivo[] | null; recusa_dos_itens?: string | null
            }
            await mergeExpenseConfig(tenantId)
            // a configuração de despesas vem da ROTA, no tenant do chamador: a tela não fala com o banco (0051)
            const [despesas, taxPreview] = await Promise.all([fetch('/api/atendimentos-ia/config-de-despesas'), fetchTaxPreview(tenantId)])
            if (!despesas.ok) return setEstado({ tipo: 'erro', mensagem: (await recusasDaResposta(despesas, 'Não foi possível ler a configuração de despesas da empresa.')).join(' ') })
            const { config } = (await despesas.json()) as { config: Parameters<typeof buildCalcBase>[0] }
            setEstado((e) => ({
                tipo: 'pronto', orcamento, calcBase: buildCalcBase(config, taxPreview), versao: e.tipo === 'pronto' ? e.versao + 1 : 1,
                itensDoArquivo: itens_do_arquivo ?? null, recusaDosItens: recusa_dos_itens ?? null, cliente: cliente ?? null, fiscalDivergente: fiscal_divergente ?? [],
            }))
        } catch {
            setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler o orçamento.' })
        }
    }, [id])
    useEffect(() => { void carregar() }, [carregar, sinal])

    const salvar = useCallback(async (g: GravacaoDaPrecificacao): Promise<string[] | DestinoDoProdutoDoOrcamento> => {
        const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}/precificacao`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(g),
        })
        if (!r.ok) return recusasDaResposta(r, 'Não foi possível salvar a precificação.')
        // o ARQUIVO "Orçamento" sai ao salvar (11/11/2026); quando não sai, o preço fica salvo e a tela diz por quê
        const corpo = (await r.json().catch(() => ({}))) as {
            arquivo?: { nomeDoArquivo: string } | null; recusas_do_arquivo?: string[]; fiscal_sobrescrito?: CampoDivergente[]
            tabela_do_vendedor?: { id: string; nome: string } | null; aviso_da_tabela?: string | null
        }
        if (corpo.arquivo) messageApi.success(`Arquivo gerado: ${corpo.arquivo.nomeDoArquivo}`)
        if (corpo.fiscal_sobrescrito?.length) messageApi.info(`O fiscal gravado voltou ao padrão (registrado): ${rastroDoFiscalSobrescrito(corpo.fiscal_sobrescrito)}`)
        setRecusasDoArquivo(corpo.recusas_do_arquivo ?? [])
        // a releitura vem DEPOIS de a tela gravar o produto do orçamento na tabela (`onOrcamentoSalvo`): reler antes remontaria a tela no meio
        return { tabela: corpo.tabela_do_vendedor ?? null, aviso: corpo.aviso_da_tabela ?? null }
    }, [id, messageApi])

    const recalcular = useCallback(async () => {
        const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}/calcular`, { method: 'POST' })
        if (!r.ok) { messageApi.error((await recusasDaResposta(r, 'Não foi possível calcular o orçamento.')).join(' · ')); return }
        messageApi.success('Orçamento recalculado.')
        // o arquivo PDF é regerado a cada cálculo (0051), como o "Calcular" da página do orçamento
        await fetch(`/api/atendimentos-ia/orcamentos/${id}/arquivo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'precificar' }) }).catch((): null => null)
        await carregar()
        aoMudarOArquivo?.()
    }, [id, carregar, messageApi, aoMudarOArquivo])

    return (
        <>
            {contextHolder}
            <div data-pagina-da-precificacao="" data-estado={estado.tipo}>
                {estado.tipo === 'carregando' && <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>}
                {estado.tipo === 'erro' && <Alert type="error" showIcon message={estado.mensagem} />}
                {recusasDoArquivo.length > 0 && (
                    <Alert type="warning" showIcon style={{ marginBottom: 12 }} data-recusas-do-arquivo=""
                        message="A precificação foi salva, mas o arquivo do orçamento não saiu:"
                        description={<ul style={{ margin: 0, paddingLeft: 18 }}>{recusasDoArquivo.map((f) => <li key={f}>{f}</li>)}</ul>} />
                )}
                {estado.tipo === 'pronto' && estado.cliente && !naPaginaDoOrcamento && <TopoDoOrcamento cliente={estado.cliente} />}
                {estado.tipo === 'pronto' && <AvisoDoFiscalDivergente divergencia={estado.fiscalDivergente} />}
                {estado.tipo === 'pronto' && currentUser && (
                    <Content
                        // a cada leitura um componente novo: o estado da tela parte do orçamento gravado, nunca do de antes
                        key={`${estado.orcamento.id}-${estado.versao}`}
                        messageApi={messageApi}
                        isEditingMode={false}
                        itemsFromApi={[]}
                        calcBase={estado.calcBase}
                        currentUser={currentUser}
                        orcamento={estado.orcamento}
                        itensDoArquivo={estado.itensDoArquivo}
                        recusaDosItensDoArquivo={estado.recusaDosItens}
                        onSalvarOrcamento={salvar}
                        onOrcamentoSalvo={() => { void carregar(); aoMudarOArquivo?.() }}
                        onRecalcularOrcamento={recalcular}
                        // o link do último PDF vai ao FIM da tela, abaixo dos itens precificados (dono do produto, 11/11/2026)
                        semTabelaDeItens={naPaginaDoOrcamento}
                        rodapeDoOrcamento={id && comLinkDoArquivo ? <a href={`/api/atendimentos-ia/orcamentos/${id}/arquivo`} target="_blank" rel="noopener noreferrer" data-abrir-arquivo="">Abrir proposta (PDF)</a> : null}
                    />
                )}
            </div>
        </>
    )
}
