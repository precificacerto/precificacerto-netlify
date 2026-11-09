/** A resposta das rotas dos Orçamentos I.A. a cada erro: a frase nomeada para o que é do usuário, 500 sem detalhe para o resto. */
import type { NextApiResponse } from 'next'
import { ErroDeValidacao, ErroNaoEncontrado, ErroSemMigracao, FRASE_SEM_MIGRACAO } from '@/lib/atendimentos-ia/orcamentos-ia'

export function responderErroDoOrcamento(res: NextApiResponse, e: unknown, rota: string) {
    if (e instanceof ErroSemMigracao) return res.status(503).json({ error: FRASE_SEM_MIGRACAO, sem_migracao: true })
    if (e instanceof ErroDeValidacao) return res.status(400).json({ error: e.erros.join(' '), erros: e.erros })
    if (e instanceof ErroNaoEncontrado) return res.status(404).json({ error: e.message })
    console.error(`orcamentos-ia ${rota}:`, e instanceof Error ? e.message : e)
    return res.status(500).json({ error: 'Não foi possível concluir a operação com o orçamento.' })
}
