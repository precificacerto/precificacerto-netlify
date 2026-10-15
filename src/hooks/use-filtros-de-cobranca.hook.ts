/**
 * use-filtros-de-cobranca.hook.ts — os filtros da lista de Clientes, guardados NA URL.
 *
 * A URL é o lugar porque "VOLTAR devolve à lista com os filtros como estavam" só é possível
 * se o estado já estiver no endereço ANTES de sair da lista. Estado de componente morre na
 * desmontagem; `sessionStorage` no repositório é só cache e dispensa de aviso, nunca filtro.
 *
 * A GUARDA DE `router.isReady` É OBRIGATÓRIA, e a lição já está comentada no repositório em
 * `relatorio-vendas/index.tsx:169-172`: **no primeiro render o `router.query` vem vazio**,
 * antes da hidratação do Next. Sem a guarda, esse primeiro render lê "nenhum filtro",
 * escreve "nenhum filtro" de volta na URL, e o parâmetro que o usuário acabou de colar é
 * apagado antes de ser aplicado. O sintoma é o pior possível: o link funciona quando você
 * navega até ele e falha quando você o abre direto.
 *
 * A escrita usa `router.replace` com `shallow: true`, como `agenda/index.tsx:540-541`:
 * `replace` para não encher o histórico a cada tecla da busca, `shallow` para não refazer
 * `getServerSideProps`.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import {
    FILTROS_DE_COBRANCA_VAZIOS,
    escreverFiltrosNaQuery,
    lerFiltrosDaQuery,
    type FiltrosDeCobranca,
} from '@/utils/filtros-de-cobranca'

export interface FiltrosNaUrl {
    filtros: FiltrosDeCobranca
    /** Aplica os filtros e escreve os parâmetros. Só tem efeito depois de `pronto`. */
    definirFiltros: (proximos: FiltrosDeCobranca) => void
    /** `false` enquanto o `router` não hidratou. A tela não deve escrever nada antes disto. */
    pronto: boolean
}

export function useFiltrosDeCobrancaNaUrl(rota: string): FiltrosNaUrl {
    const router = useRouter()
    const [filtros, setFiltros] = useState<FiltrosDeCobranca>(FILTROS_DE_COBRANCA_VAZIOS)
    const [pronto, setPronto] = useState(false)

    useEffect(() => {
        // A GUARDA. Sem ela, o primeiro render (query vazia) apaga o que veio no endereço.
        if (!router.isReady) return
        setFiltros(lerFiltrosDaQuery(router.query as Record<string, string | string[] | undefined>))
        setPronto(true)
        // A dependência é a query inteira: voltar pelo botão do navegador troca os
        // parâmetros sem desmontar a página, e a lista tem de acompanhar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady, router.query])

    const definirFiltros = useCallback(
        (proximos: FiltrosDeCobranca) => {
            setFiltros(proximos)
            if (!router.isReady) return
            const query = escreverFiltrosNaQuery(proximos)
            void router.replace(
                Object.keys(query).length > 0 ? { pathname: rota, query } : rota,
                undefined,
                { shallow: true },
            )
        },
        [router, rota],
    )

    return { filtros, definirFiltros, pronto }
}
