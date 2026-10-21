/**
 * A seção ATENDIMENTOS I.A. está ligada para a conta, e o usuário pode ver o Orçamentista? Quem
 * responde é o SERVIDOR (`/api/atendimentos-ia/orcamentista/secao`, que lê
 * `orcamentista_config.ativo` e a permissão do módulo). O menu desktop e o drawer mobile só
 * desenham o item "Orçamentista" com a resposta 200 — esconder aqui é consequência, não trava: a
 * página tem a mesma checagem na rota do painel.
 *
 * Só pergunta quando faz sentido (`habilitado`): o super admin não tem conta, e quem não tem a
 * permissão do módulo não veria o item de qualquer jeito. Até a resposta chegar, e em qualquer
 * falha, a resposta é `false` — o item não se desenha.
 *
 * A pergunta é feita UMA vez por usuário, e os dois menus a compartilham. Ligar ou desligar a
 * seção no super admin passa a valer para a conta no próximo carregamento da página.
 */
import { useEffect, useState } from 'react'

export const ROTA_DA_SECAO_DO_ORCAMENTISTA = '/api/atendimentos-ia/orcamentista/secao'

let cache: { usuario: string; resposta: Promise<boolean> } | null = null

async function perguntar(): Promise<boolean> {
  try {
    if (typeof fetch !== 'function') return false
    const r = await fetch(ROTA_DA_SECAO_DO_ORCAMENTISTA)
    return r.ok
  } catch {
    return false
  }
}

export function useSecaoDoOrcamentista(habilitado: boolean, usuario: string | null | undefined): boolean {
  const [ligada, setLigada] = useState(false)
  useEffect(() => {
    if (!habilitado || !usuario) {
      setLigada(false)
      return
    }
    if (!cache || cache.usuario !== usuario) cache = { usuario, resposta: perguntar() }
    let vivo = true
    cache.resposta.then((v) => { if (vivo) setLigada(v) })
    return () => { vivo = false }
  }, [habilitado, usuario])
  return ligada
}

/** Esquece a resposta guardada — para testes, e para quem precisar perguntar de novo. */
export function esquecerSecaoDoOrcamentista() {
  cache = null
}
