/**
 * GET /api/super-admin/atendimentos-ia/desenhos/conferencia
 * → { sem_objeto: string[], sem_linha: string[], caminhos, objetos }
 *
 * A CONFERÊNCIA DEPOIS DA IMPORTAÇÃO (dono do produto, 11/11/2026: "esta é a prova de verdade"): os caminhos que a tabela do índice aponta e
 * o bucket NÃO tem, e os objetos de `tipologias/` que NENHUMA linha aponta — os dois lados, nomeados. Zero dos dois: o slug do grupo casou
 * entre o envio e a importação. Só lê: nada é gravado, apagado ou movido.
 *
 * Lê TODAS as páginas dos dois lados (o PostgREST e o Storage cortam em 1000): uma página só esconderia o que falta.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { caminhosDoIndiceDeDesenhos, codigoDoErro, falhaInterna, nomesNaPasta, pastasEm } from '@/lib/atendimentos-ia/repositorio'
import { FRASE_SEM_A_MIGRACAO, PASTA_DOS_DESENHOS, conferirDesenhos } from '@/lib/atendimentos-ia/desenhos-das-tipologias'

/** O banco sem a tabela (a migração não aplicada): o PostgREST responde PGRST205; o Postgres, 42P01. */
const SEM_A_TABELA = new Set(['PGRST205', '42P01'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await requireSuperAdmin(req, res)
    if (!caller) return
    try {
        const caminhos = await caminhosDoIndiceDeDesenhos()
        const objetos: string[] = []
        for (const grupo of await pastasEm(PASTA_DOS_DESENHOS)) {
            for (const nome of await nomesNaPasta(`${PASTA_DOS_DESENHOS}/${grupo}`)) objetos.push(`${PASTA_DOS_DESENHOS}/${grupo}/${nome}`)
        }
        const c = conferirDesenhos(caminhos, objetos)
        return res.status(200).json({ sem_objeto: c.semObjeto, sem_linha: c.semLinha, caminhos: c.caminhos, objetos: c.objetos })
    } catch (e) {
        const codigo = codigoDoErro(e)
        if (codigo !== null && SEM_A_TABELA.has(codigo)) return res.status(409).json({ error: `${FRASE_SEM_A_MIGRACAO} Não há o que conferir.` })
        return falhaInterna(res, 'conferir desenhos', e, 'Não foi possível conferir os desenhos com o Storage.')
    }
}
