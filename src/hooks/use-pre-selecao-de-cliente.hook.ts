/**
 * use-pre-selecao-de-cliente.hook.ts — `?cliente=<id>` abre um documento NOVO com o cliente
 * já selecionado.
 *
 * PRÉ-PREENCHER NÃO É LER. Este parâmetro não abre nem exibe documento existente: ele diz
 * com quem o documento novo começa. É a distinção que separa isto de `/vendas?venda=<id>`,
 * que abriria um documento de terceiro e depende da decisão de visibilidade.
 *
 * A GUARDA DE `router.isReady` É OBRIGATÓRIA. No primeiro render a query vem VAZIA, antes
 * da hidratação do Next — a lição está comentada em `relatorio-vendas/index.tsx:169-172`.
 * Sem ela o efeito roda uma vez sem o parâmetro, marca-se como lido, e o link aberto direto
 * nunca pré-preenche. O sintoma é o pior: funciona ao navegar, falha ao colar o endereço.
 *
 * O PARÂMETRO É LIMPO DEPOIS DE LIDO, com `replace` + `shallow`. Ele é uma INSTRUÇÃO DE
 * ABERTURA, não um estado da tela: deixá-lo na URL faz um F5 sobre um rascunho já alterado
 * reabrir o formulário do zero e descartar o que foi digitado. A limpeza é cirúrgica —
 * os outros parâmetros ficam.
 *
 * ID QUE NÃO RESOLVE não produz erro nem toast. Orçamento novo com cliente em branco é
 * estado legítimo, e "cliente não encontrado" numa tela de CRIAÇÃO é ruído sobre uma ação
 * que o usuário não pediu.
 *
 * CLIENTE INATIVO RESOLVE. A busca é por id, sem filtro de `is_active`: a ficha dele existe,
 * e vender para inativo é decisão de quem vende. Quem chama precisa garantir que ele tenha
 * opção no `<Select>` — os 14 inativos da base não vêm em `useCustomers`.
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '@/supabase/client'

/** O nome do parâmetro, exportado para que o portão não dependa de string solta. */
export const PARAM_CLIENTE = 'cliente'

export interface ClientePreSelecionado {
    id: string
    name: string
}

export interface PreSelecaoDeCliente {
    /** Chamado uma vez, assim que o parâmetro é visto — ANTES da busca. Abre o formulário. */
    aoAbrir: () => void
    /** Chamado só quando o id resolve. Não é chamado no id fantasma. */
    aoResolverCliente: (cliente: ClientePreSelecionado) => void
}

export function usePreSelecaoDeCliente({ aoAbrir, aoResolverCliente }: PreSelecaoDeCliente): void {
    const router = useRouter()
    // Uma vez por montagem.
    //
    // NENHUMA MUTAÇÃO DO PORTÃO O DERRUBA, e isso está dito aqui em vez de escondido: com
    // o `replace` limpando o parâmetro, a reentrada já é barrada pela saída `id === ''`
    // logo abaixo. Ele é defesa em profundidade para o dia em que a limpeza mudar de forma
    // — e um portão que o exigisse precisaria de um estado que o Next não produz hoje.
    // Removê-lo só porque nenhum caso o alcança seria tirar a barreira por falta de prova
    // de que ela foi usada.
    const jaLeu = useRef(false)
    // As callbacks entram por ref para que trocar a identidade delas a cada render não
    // reexecute o efeito — o gatilho é o parâmetro, não a função.
    const refAbrir = useRef(aoAbrir)
    const refResolver = useRef(aoResolverCliente)
    refAbrir.current = aoAbrir
    refResolver.current = aoResolverCliente

    useEffect(() => {
        if (!router.isReady || jaLeu.current) return
        const bruto = router.query[PARAM_CLIENTE]
        const id = (Array.isArray(bruto) ? bruto[0] : bruto) ?? ''
        if (id === '') return
        jaLeu.current = true

        refAbrir.current()
        ;(async () => {
            const { data, error } = await supabase
                .from('customers')
                .select('id, name')
                .eq('id', id)
                .maybeSingle()
            if (error) throw error
            if (data) refResolver.current(data as ClientePreSelecionado)
        })().catch((e) => console.error('Erro ao pré-selecionar cliente:', e))

        const { [PARAM_CLIENTE]: _lido, ...resto } = router.query as Record<string, string>
        void router.replace({ pathname: router.pathname, query: resto }, undefined, { shallow: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady, router.query[PARAM_CLIENTE]])
}
