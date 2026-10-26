/**
 * POST /api/super-admin/atendimentos-ia/tabelas — grava uma tabela NOVA de um fornecedor:
 * { fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, vigencia }.
 *
 * O MOTOR É OBRIGATÓRIO, e quem recusa é a ROTA — não só a tela (`lerCorpoDaTabela`, com a frase
 * de `MENSAGEM_MOTOR_OBRIGATORIO`). "Quando for inserida uma nova tabela, tem que inserir o motor
 * de aplicação" (dono do produto, EPIC §3.8). O banco é a terceira trava: `motor_path` e
 * `motor_nome` são NOT NULL.
 *
 * E os dois arquivos têm de ESTAR no bucket: a linha não é gravada apontando para um objeto que
 * não chegou (o envio é feito pelo navegador com a URL assinada de `url-de-envio`).
 *
 * A FAMÍLIA É OBRIGATÓRIA e vem DA LISTA (dono do produto, 26/10/2026; migração 20261026000004): a
 * rota confere a chave contra `orcamentista_familia_catalogo` antes de gravar. A FK da família e a do
 * fornecedor são ambas 23503: a mensagem do banco diz qual, e cada uma tem a sua frase — a da
 * família nunca vira "Fornecedor não encontrado".
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, criarTabela, falhaInterna, listarFamilias, objetoExiste } from '@/lib/atendimentos-ia/repositorio'
import { ehFkDaFamilia, fraseDaFamiliaDesconhecida, lerCorpoDaTabela, MENSAGEM_MOTOR_OBRIGATORIO, recusada } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const leitura = lerCorpoDaTabela(req.body)
  if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
  const t = leitura.corpo

  try {
    if (!(await listarFamilias()).some((f) => f.chave === t.familia)) return res.status(400).json({ error: fraseDaFamiliaDesconhecida(t.familia) })
    if (!(await objetoExiste(t.arquivo_path))) return res.status(400).json({ error: 'O arquivo da tabela não chegou ao armazenamento. Envie de novo.' })
    if (!(await objetoExiste(t.motor_path))) return res.status(400).json({ error: 'O arquivo do motor não chegou ao armazenamento. Envie de novo.' })
    const criada = await criarTabela({ ...t, criado_por: caller.user_id })
    return res.status(201).json(criada)
  } catch (e) {
    const codigo = codigoDoErro(e)
    if (codigo === '23503' && ehFkDaFamilia(e)) return res.status(400).json({ error: fraseDaFamiliaDesconhecida(t.familia) })
    if (codigo === '23503') return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    if (codigo === '23502') return res.status(400).json({ error: MENSAGEM_MOTOR_OBRIGATORIO })
    return falhaInterna(res, 'tabela POST', e, 'Não foi possível gravar a tabela.')
  }
}
