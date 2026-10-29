/**
 * Atendimentos I.A. → CATÁLOGO (EPIC §5.5; "Fornecedores e tabelas" até 28/10/2026). Só o super admin.
 *
 * O NICHO É O CONTAINER (dono do produto, 29/10/2026, opção A): esta página é a PORTA — os nichos, agrupados por modelo, com criar e excluir.
 * Abrir um nicho leva à página dele (`rotaDoNicho`, `catalogo/[nichoId].tsx`), onde moram, em abas, as famílias, os fornecedores e os motores.
 * Até 29/10/2026 as quatro seções estavam lado a lado aqui; agora são conteúdo do nicho.
 *
 * TUDO PELAS ROTAS (`ROTAS_DO_CATALOGO`), nada pelo cliente do Supabase. A contagem de fornecedores por nicho sai da mesma lista de
 * fornecedores da rota; falha de leitura aparece como ERRO, nunca como "nenhum fornecedor" (`ausente-vs-falso.md`).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, message } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { AVISO_DO_CATALOGO, ROTAS_DO_CATALOGO, type FornecedorDaLista, type Modelo, type Nicho } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { NichosCard } from '@/page-parts/atendimentos-ia/nichos.component'

export default function Catalogo() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin

    const [nichos, setNichos] = useState<Nicho[]>([])
    const [porNicho, setPorNicho] = useState<Record<string, number>>({})
    const [erro, setErro] = useState<string | null>(null)

    const carregar = useCallback(async () => {
        try {
            const [ns, fs] = await Promise.all([
                chamarRota<Nicho[]>(ROTAS_DO_CATALOGO.nichos),
                chamarRota<FornecedorDaLista[]>(ROTAS_DO_CATALOGO.fornecedores),
            ])
            const contagem: Record<string, number> = {}
            for (const f of fs) contagem[f.nicho_id] = (contagem[f.nicho_id] ?? 0) + 1
            setNichos(ns)
            setPorNicho(contagem)
            setErro(null)
        } catch (e) {
            setErro((e as Error).message)
        }
    }, [])

    useEffect(() => { if (ehSuperAdmin) carregar() }, [ehSuperAdmin, carregar])

    if (currentUser && !ehSuperAdmin) {
        router.replace(ROUTES.DASHBOARD)
        return null
    }
    if (!ehSuperAdmin) return null

    async function criarNicho(n: { modelo: Modelo; nome: string }) {
        try {
            await chamarRota(ROTAS_DO_CATALOGO.nichos, 'POST', n)
            message.success('Nicho criado')
            await carregar()
            return true
        } catch (e) {
            message.error((e as Error).message)
            return false
        }
    }

    async function excluirNicho(n: Nicho) {
        try {
            await chamarRota(ROTAS_DO_CATALOGO.nicho(n.id), 'DELETE')
            message.success('Nicho excluído')
            await carregar()
        } catch (e) {
            message.error((e as Error).message, 8)
        }
    }

    return (
        <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_FORNECEDORES} subtitle={AVISO_DO_CATALOGO}>
            {erro ? (
                <Alert type="error" showIcon message="Não foi possível ler o catálogo." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            ) : (
                <NichosCard nichos={nichos} fornecedoresPorNicho={porNicho} onCriar={criarNicho} onExcluir={excluirNicho} />
            )}
        </Layout>
    )
}
