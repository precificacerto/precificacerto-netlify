/**
 * /clientes/[id] — a ficha do cliente, no layout, com o menu do lado.
 *
 * Molde de `produtos/[id].tsx`: `useRouter()` + `router.query`, `<Layout>` em volta, e o
 * `Spin` enquanto o router não hidratou. A guarda de `router.isReady` é a mesma lição de
 * `relatorio-vendas/index.tsx:169-172` — antes dela, `router.query.id` é `undefined`.
 */

import React from 'react'
import { useRouter } from 'next/router'
import { Spin } from 'antd'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { FichaDoCliente } from '@/page-parts/clientes/ficha-do-cliente.component'

export default function FichaDoClientePage() {
    const router = useRouter()
    const id = typeof router.query.id === 'string' ? router.query.id : null

    if (!router.isReady || !id) {
        return (
            <Layout title={PAGE_TITLES.CLIENTS}>
                <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
            </Layout>
        )
    }

    return (
        <Layout title={PAGE_TITLES.CLIENTS}>
            <FichaDoCliente customerId={id} />
        </Layout>
    )
}
