import React from 'react'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'

/**
 * Tela exibida quando alguém chega às rotas de Serviços por URL direta numa empresa cuja
 * segmentação não é Prestação de Serviços. O menu e as Permissões já escondem o módulo
 * (`segment-visibility.ts`); isto fecha a porta que sobra, a da barra de endereço.
 */
export function ServicesSegmentNotice() {
    return (
        <Layout title={PAGE_TITLES.SERVICES}>
            <div style={{ padding: 40, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
                <h3 style={{ marginBottom: 8 }}>Serviços não se aplica a esta empresa</h3>
                <p style={{ color: '#64748b', margin: 0 }}>
                    O cadastro de Serviços está disponível apenas para a segmentação
                    Prestação de Serviços. Na Industrialização, a mão de obra e a estrutura
                    já entram na construção do produto, pela margem de contribuição e pelo
                    rateio por minutos.
                </p>
            </div>
        </Layout>
    )
}
