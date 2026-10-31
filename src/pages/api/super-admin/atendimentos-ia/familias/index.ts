/**
 * GET  /api/super-admin/atendimentos-ia/familias — as famílias do catálogo, NA ORDEM, cada uma com as RAMIFICAÇÕES que declara, na ordem dela.
 * POST /api/super-admin/atendimentos-ia/familias — `{ rotulo, ramificacoes }`: acrescenta uma família no FIM da lista.
 *
 * A FAMÍLIA (dono do produto, 26/10/2026; migração 20261026000004) é o primeiro degrau da cascata FAMÍLIA -> LINHA -> TIPOLOGIA, e uma entrada
 * por LINHA de produto (28/10/2026). Ela é o NOME e as RAMIFICAÇÕES (29/10/2026, migração 20261029000004): a base de conhecimento mostra, numa
 * matéria-prima da família, as categorias que a família declara — família sem ramificação não mostra nenhuma; por isso criar exige ao menos uma.
 * Editar e remover moram em `familias/[chave]`.
 *
 * A chave é derivada do rótulo (`lerFamiliaNova`). A ROTA confere o que dá frase em português — a chave que já existe, o nome repetido (sem
 * olhar a caixa) e as ramificações fora do catálogo de categorias —, e a FUNÇÃO (`superadmin_criar_familia`, que loga e calcula a ordem sob
 * trava) confere de novo: a recusa dela numa corrida volta com a frase dela (22023 → 409).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, criarFamilia, falhaInterna, listarFamilias } from '@/lib/atendimentos-ia/repositorio'
import { familiasDoCatalogo, fraseDaRamificacaoForaDoCatalogo, ramificacoesForaDoCatalogo } from '@/lib/atendimentos-ia/familias-do-catalogo'
import { fraseDaFamiliaComNomeRepetido, lerFamiliaNova, recusada } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  if (req.method === 'GET') {
    try {
      return res.status(200).json(await familiasDoCatalogo())
    } catch (e) {
      return falhaInterna(res, 'familias GET', e, 'Não foi possível ler as famílias.')
    }
  }

  const leitura = lerFamiliaNova(req.body)
  if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
  const { rotulo, chave, ramificacoes } = leitura.corpo
  try {
    const atuais = await listarFamilias()
    if (atuais.some((f) => f.chave === chave)) return res.status(409).json({ error: `A família "${chave}" já está na lista.` })
    // uma entrada por LINHA, cada uma com nome próprio (28/10/2026): o nome repetido, sem olhar a caixa, também é recusa — chaves
    // diferentes (PVC e PVC_WOLF) com o mesmo nome exibido seriam duas famílias que ninguém distingue na tela
    const igual = atuais.find((f) => f.rotulo.trim().toLocaleLowerCase('pt-BR') === rotulo.toLocaleLowerCase('pt-BR'))
    if (igual) return res.status(409).json({ error: fraseDaFamiliaComNomeRepetido(igual.rotulo) })
    const fora = await ramificacoesForaDoCatalogo(ramificacoes)
    if (fora.length > 0) return res.status(400).json({ error: fraseDaRamificacaoForaDoCatalogo(fora) })
    return res.status(201).json(await criarFamilia({ por: caller.user_id, chave, rotulo, ramificacoes }))
  } catch (e) {
    const codigo = codigoDoErro(e)
    if (codigo === '42501') return res.status(403).json({ error: 'Só o super admin altera o catálogo.' })
    if (codigo === '22023' && e instanceof Error && e.message.trim() !== '') return res.status(409).json({ error: e.message })
    return falhaInterna(res, 'familias POST', e, 'Não foi possível acrescentar a família.')
  }
}
