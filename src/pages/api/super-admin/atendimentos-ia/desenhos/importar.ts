/**
 * POST /api/super-admin/atendimentos-ia/desenhos/importar — { texto: o CSV do índice, permitir_encolher: boolean }
 * → { resultado, antes?, linhas, sha256, sem_arquivo: string[], colisoes: string[] }
 *
 * A IMPORTAÇÃO DO ÍNDICE DOS DESENHOS (dono do produto, 11/11/2026; migração 20261111000001): lê o CSV, monta as linhas com
 * `linhasParaImportar` (o caminho de cada uma vem de `caminhoDoDesenho`, a MESMA função do envio dos zips) e chama a função do banco, que
 * apaga e regrava a tabela numa transação. O sha256 é calculado AQUI, dos bytes recebidos — o que vai ao log é o do texto que entrou.
 *
 * Nada some em silêncio: a linha que não serve RECUSA a importação inteira (400, nomeando cada uma); as linhas sem arquivo nos zips e as
 * colisões de código (DP-017 e DP-17) voltam nomeadas. A trava do encolhimento é da função (409 com a frase dela). Sem a migração, 409
 * nomeando-a — nunca 500.
 */
import { createHash } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, falhaInterna, importarDesenhos } from '@/lib/atendimentos-ia/repositorio'
import { FRASE_SEM_A_MIGRACAO, lerIndice, linhasParaImportar } from '@/lib/atendimentos-ia/desenhos-das-tipologias'

// o índice real tem 819.243 bytes; o padrão do Next (1 MB) não deixa folga para o JSON que o envolve
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

/** O banco sem a função (a migração não aplicada): o PostgREST responde PGRST202; o Postgres, 42883. */
const SEM_A_FUNCAO = new Set(['PGRST202', '42883'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await requireSuperAdmin(req, res)
    if (!caller) return

    const corpo = (req.body ?? {}) as { texto?: unknown; permitir_encolher?: unknown }
    if (typeof corpo.texto !== 'string' || corpo.texto === '') return res.status(400).json({ error: 'texto: o conteúdo do índice (CSV) é obrigatório.' })
    if (typeof corpo.permitir_encolher !== 'boolean') return res.status(400).json({ error: 'permitir_encolher: obrigatório, true ou false.' })

    const sha256 = createHash('sha256').update(Buffer.from(corpo.texto, 'utf-8')).digest('hex')
    const lido = lerIndice(corpo.texto)
    if ('erro' in lido) return res.status(400).json({ error: `índice: ${lido.erro}`, sha256 })
    const montado = linhasParaImportar(lido.linhas)
    if ('recusas' in montado) return res.status(400).json({ error: 'O índice tem linhas que não podem ser importadas. Nada foi importado.', recusas: montado.recusas, sha256 })

    try {
        const r = await importarDesenhos({ por: caller.user_id, sha256, linhas: montado.linhas, permitirEncolher: corpo.permitir_encolher })
        return res.status(200).json({ ...r, sha256, sem_arquivo: montado.semArquivo, colisoes: montado.colisoes })
    } catch (e) {
        const codigo = codigoDoErro(e)
        if (codigo !== null && SEM_A_FUNCAO.has(codigo)) return res.status(409).json({ error: `${FRASE_SEM_A_MIGRACAO} Nada foi importado.`, sha256 })
        // as recusas da função (o encolhimento, a chave desconhecida, as CHECKs): a frase dela, que já nomeia o que recusou
        if (codigo === '22023' || codigo === '23514') return res.status(409).json({ error: (e as Error).message, sha256 })
        return falhaInterna(res, 'importar desenhos', e, 'Não foi possível importar o índice dos desenhos.')
    }
}
