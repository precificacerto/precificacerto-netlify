/**
 * /clientes/novo — o cadastro de cliente.
 *
 * Existe porque o `<Drawer>` que servia "Novo Cliente" e "Editar Cliente" foi removido, e o
 * formulário é UM SÓ: `FormularioDoCliente`, consumido por esta rota e por
 * `/clientes/[id]?editar=1`. Duas cópias do formulário seriam `copia-divergente.md`.
 *
 * Rota ESTÁTICA ao lado de `[id].tsx`: no Next o estático vence o dinâmico, então
 * `/clientes/novo` nunca cai na ficha com `id = 'novo'`. É o mesmo arranjo de
 * `produtos/criar.tsx` ao lado de `produtos/[id].tsx`.
 */

import React from 'react'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { FichaDoCliente } from '@/page-parts/clientes/ficha-do-cliente.component'

export default function NovoClientePage() {
    return (
        <Layout title={PAGE_TITLES.CLIENTS} subtitle="Novo cliente">
            <FichaDoCliente customerId={null} />
        </Layout>
    )
}
