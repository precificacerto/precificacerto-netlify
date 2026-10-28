/**
 * GET  /api/super-admin/atendimentos-ia/familias — as famílias das tabelas de fornecedor, NA ORDEM.
 * POST /api/super-admin/atendimentos-ia/familias — acrescenta `{ rotulo }` no FIM da lista.
 *
 * A FAMÍLIA (dono do produto, 26/10/2026; migração 20261026000004): o primeiro degrau da cascata
 * FAMÍLIA -> LINHA -> TIPOLOGIA. LISTA FECHADA, no padrão de `orcamentista_categoria_catalogo`; o super
 * admin acrescenta entradas ("Portas de ACM e Portas de garagem ainda vão aparecer"). Não há excluir
 * nem renomear: a família de uma tabela é FK RESTRICT, e ninguém pediu.
 *
 * A chave é derivada do rótulo (`lerFamiliaNova`); a ordem é a última + 1, calculada aqui. Duas
 * gravações ao mesmo tempo esbarram na ordem única (23505), e a resposta diz para tentar de novo.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, criarFamilia, falhaInterna, listarFamilias } from '@/lib/atendimentos-ia/repositorio'
import { fraseDaFamiliaComNomeRepetido, lerFamiliaNova, recusada } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  if (req.method === 'GET') {
    try {
      return res.status(200).json((await listarFamilias()).sort((a, b) => a.ordem - b.ordem))
    } catch (e) {
      return falhaInterna(res, 'familias GET', e, 'Não foi possível ler as famílias.')
    }
  }

  const leitura = lerFamiliaNova(req.body)
  if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
  const { rotulo, chave } = leitura.corpo
  try {
    const atuais = await listarFamilias()
    if (atuais.some((f) => f.chave === chave)) return res.status(409).json({ error: `A família "${chave}" já está na lista.` })
    // uma entrada por LINHA, cada uma com nome próprio (28/10/2026): o nome repetido, sem olhar a caixa, também é recusa — chaves
    // diferentes (PVC e PVC_WOLF) com o mesmo nome exibido seriam duas famílias que ninguém distingue na tela
    const igual = atuais.find((f) => f.rotulo.trim().toLocaleLowerCase('pt-BR') === rotulo.toLocaleLowerCase('pt-BR'))
    if (igual) return res.status(409).json({ error: fraseDaFamiliaComNomeRepetido(igual.rotulo) })
    const ordem = atuais.reduce((m, f) => Math.max(m, f.ordem), 0) + 1
    return res.status(201).json(await criarFamilia({ chave, rotulo, ordem }))
  } catch (e) {
    if (codigoDoErro(e) === '23505') return res.status(409).json({ error: 'Outra família foi gravada ao mesmo tempo. Tente de novo.' })
    return falhaInterna(res, 'familias POST', e, 'Não foi possível acrescentar a família.')
  }
}
