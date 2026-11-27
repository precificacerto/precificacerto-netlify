/**
 * /atendimentos-ia/orcamentos-ia/[id]/precificacao — ATALHO para a precificação de um orçamento I.A. O fluxo principal é a página do orçamento
 * (`/orcamentos-ia/[id]`), que traz os itens, a precificação e o arquivo PDF numa página só (pedido 0051, 27/11/2026); este caminho segue existindo e
 * monta o MESMO bloco (`PrecificacaoDoOrcamento`) — nenhuma segunda cópia da precificação.
 */
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { PrecificacaoDoOrcamento } from '@/page-parts/atendimentos-ia/precificacao-do-orcamento.component'

function PaginaDaPrecificacao() {
    const router = useRouter()
    const id = typeof router.query.id === 'string' ? router.query.id : null
    return (
        <Layout title={PAGE_TITLES.ORCAMENTOS_IA} subtitle="Agentes I.A.">
            <div style={{ marginBottom: 12 }}>
                <Link href={id ? `${ROUTES.ATENDIMENTOS_IA_ORCAMENTOS}/${id}` : ROUTES.ATENDIMENTOS_IA_ORCAMENTOS}><ArrowLeftOutlined /> Orçamento</Link>
            </div>
            <PrecificacaoDoOrcamento id={id} />
        </Layout>
    )
}

export default PaginaDaPrecificacao
