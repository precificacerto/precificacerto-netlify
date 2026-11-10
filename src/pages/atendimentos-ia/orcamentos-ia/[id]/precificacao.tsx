/**
 * /atendimentos-ia/orcamentos-ia/[id]/precificacao — a PRECIFICAÇÃO FINAL de um orçamento I.A. (o 1b, dono do produto, 09/11/2026).
 *
 * É a tela de Produtos no modo "orçamento" (decisão 2: "sem segunda cópia da precificação"): o `Content` de Produtos recebe o orçamento, e a
 * entrada do cálculo é a dele — o líquido dos materiais e os minutos da fabricação dos itens calculados. O cabeçalho é fixo (código = o número;
 * Produzido, UN, Orçamentos I.A.), e salvar grava NO ORÇAMENTO, pela rota `/precificacao` — nunca em `products`.
 *
 * O `calcBase` é montado como na página de produto (`buildCalcBase` sobre a configuração de despesas da empresa): é ele que faz a mão de obra
 * da tela ser a mesma do cálculo do servidor, e a reconciliação da D2 na tela confere isso.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Alert, message, Spin } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { Content } from '@/page-parts/products/content.component'
import { useAuth } from '@/hooks/use-auth.hook'
import { getTenantId } from '@/utils/get-tenant-id'
import { supabase } from '@/supabase/client'
import { fetchTaxPreview } from '@/utils/calc-tax-preview'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { buildCalcBase } from '@/utils/build-calc-base'
import type { CalcBaseType } from '@/types/calc-base.type'
import type { GravacaoDaPrecificacao, OrcamentoNaPrecificacao } from '@/lib/atendimentos-ia/precificacao-do-orcamento'
import type { ClienteDoArquivo, ItemDoArquivo } from '@/lib/atendimentos-ia/arquivo-do-orcamento'
import { TopoDoOrcamento } from '@/page-parts/atendimentos-ia/topo-do-orcamento.component'

type Estado =
    | { tipo: 'carregando' }
    | { tipo: 'erro'; mensagem: string }
    | { tipo: 'pronto'; orcamento: OrcamentoNaPrecificacao; calcBase: CalcBaseType; versao: number; itensDoArquivo: ItemDoArquivo[] | null; recusaDosItens: string | null; cliente: ClienteDoArquivo | null }

/** As recusas que a rota devolve, cada uma numa linha; o resto vira a frase geral. */
async function recusasDaResposta(r: Response, geral: string): Promise<string[]> {
    const corpo = (await r.json().catch(() => ({}))) as { error?: string; erros?: string[]; recusas?: string[] }
    if (Array.isArray(corpo.erros) && corpo.erros.length) return corpo.erros
    if (Array.isArray(corpo.recusas) && corpo.recusas.length) return [corpo.error ?? geral, ...corpo.recusas]
    return [corpo.error ?? geral]
}

function PrecificacaoDoOrcamento() {
    const router = useRouter()
    const id = typeof router.query.id === 'string' ? router.query.id : null
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
            const { orcamento, cliente, itens_do_arquivo, recusa_dos_itens } = (await r.json()) as {
                orcamento: OrcamentoNaPrecificacao; cliente?: ClienteDoArquivo | null; itens_do_arquivo?: ItemDoArquivo[] | null; recusa_dos_itens?: string | null
            }
            await mergeExpenseConfig(tenantId)
            const [expenseRes, taxPreview] = await Promise.all([
                supabase.from('tenant_expense_config').select('*').eq('tenant_id', tenantId).single(),
                fetchTaxPreview(tenantId),
            ])
            setEstado((e) => ({
                tipo: 'pronto', orcamento, calcBase: buildCalcBase(expenseRes.data, taxPreview), versao: e.tipo === 'pronto' ? e.versao + 1 : 1,
                itensDoArquivo: itens_do_arquivo ?? null, recusaDosItens: recusa_dos_itens ?? null, cliente: cliente ?? null,
            }))
        } catch {
            setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler o orçamento.' })
        }
    }, [id])
    useEffect(() => { void carregar() }, [carregar])

    const salvar = useCallback(async (g: GravacaoDaPrecificacao): Promise<string[] | null> => {
        const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}/precificacao`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(g),
        })
        if (!r.ok) return recusasDaResposta(r, 'Não foi possível salvar a precificação.')
        // o ARQUIVO "Orçamento" sai ao salvar (11/11/2026); quando não sai, o preço fica salvo e a tela diz por quê
        const corpo = (await r.json().catch(() => ({}))) as { arquivo?: { nomeDoArquivo: string } | null; recusas_do_arquivo?: string[] }
        if (corpo.arquivo) messageApi.success(`Arquivo gerado: ${corpo.arquivo.nomeDoArquivo}`)
        setRecusasDoArquivo(corpo.recusas_do_arquivo ?? [])
        await carregar()
        return null
    }, [id, carregar, messageApi])

    const recalcular = useCallback(async () => {
        const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}/calcular`, { method: 'POST' })
        if (!r.ok) { messageApi.error((await recusasDaResposta(r, 'Não foi possível calcular o orçamento.')).join(' · ')); return }
        messageApi.success('Orçamento recalculado.')
        await carregar()
    }, [id, carregar, messageApi])

    return (
        <Layout title={PAGE_TITLES.ORCAMENTOS_IA} subtitle="Agentes I.A.">
            {contextHolder}
            <div data-pagina-da-precificacao="" data-estado={estado.tipo}>
                <div style={{ marginBottom: 12 }}>
                    <Link href={id ? `${ROUTES.ATENDIMENTOS_IA_ORCAMENTOS}/${id}` : ROUTES.ATENDIMENTOS_IA_ORCAMENTOS}><ArrowLeftOutlined /> Orçamento</Link>
                </div>
                {estado.tipo === 'carregando' && <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>}
                {estado.tipo === 'erro' && <Alert type="error" showIcon message={estado.mensagem} />}
                {recusasDoArquivo.length > 0 && (
                    <Alert type="warning" showIcon style={{ marginBottom: 12 }} data-recusas-do-arquivo=""
                        message="A precificação foi salva, mas o arquivo do orçamento não saiu:"
                        description={<ul style={{ margin: 0, paddingLeft: 18 }}>{recusasDoArquivo.map((f) => <li key={f}>{f}</li>)}</ul>} />
                )}
                {estado.tipo === 'pronto' && estado.cliente && <TopoDoOrcamento cliente={estado.cliente} />}
                {estado.tipo === 'pronto' && id && (
                    <div style={{ marginBottom: 12 }}><a href={`/api/atendimentos-ia/orcamentos/${id}/arquivo`} target="_blank" rel="noopener noreferrer" data-abrir-arquivo="">Abrir o último arquivo do orçamento (PDF)</a></div>
                )}
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
                        onRecalcularOrcamento={recalcular}
                    />
                )}
            </div>
        </Layout>
    )
}

export default PrecificacaoDoOrcamento
