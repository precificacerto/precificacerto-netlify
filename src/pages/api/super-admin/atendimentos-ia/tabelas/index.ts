/**
 * POST /api/super-admin/atendimentos-ia/tabelas — grava uma tabela NOVA de um fornecedor:
 * { fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, vigencia, familia, categoria_chave }.
 *
 * O MOTOR É OBRIGATÓRIO SÓ NA TABELA DE PERFIL (dono do produto, 27/10/2026), e quem recusa é a ROTA — não só a tela
 * (`lerCorpoDaTabela`, com a frase de `MENSAGEM_MOTOR_OBRIGATORIO`). Reforço e Acessórios são preço puro: o motor tem casa
 * própria (`orcamentista_motor`). O banco é a terceira trava: CHECK `orcamentista_tabela_perfil_exige_motor` (migração
 * 20261027000007), e a CHECK do par (caminho e nome andam juntos).
 *
 * E os dois arquivos têm de ESTAR no bucket: a linha não é gravada apontando para um objeto que
 * não chegou (o envio é feito pelo navegador com a URL assinada de `url-de-envio`).
 *
 * A FAMÍLIA É OBRIGATÓRIA e vem DA LISTA (dono do produto, 26/10/2026; migração 20261026000004): a
 * rota confere a chave contra `orcamentista_familia_catalogo` antes de gravar. A FK da família e a do
 * fornecedor são ambas 23503: a mensagem do banco diz qual, e cada uma tem a sua frase — a da
 * família nunca vira "Fornecedor não encontrado".
 *
 * A CATEGORIA É OBRIGATÓRIA e vem DA LISTA, no mesmo desenho (dono do produto, 27/10/2026: "uma tabela = uma
 * categoria"; migração 20261027000005): a rota confere a chave contra `orcamentista_categoria_catalogo`, e o
 * banco tem a terceira trava (gatilho de INSERT, 23514) e a FK (23503, com a frase própria da categoria).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, criarTabela, falhaInterna, listarCategorias, listarFamilias, objetoExiste } from '@/lib/atendimentos-ia/repositorio'
import { ehFkDaCategoria, ehFkDaFamilia, ehTravaDaCategoriaObrigatoria, ehTravaDoMotorPelaMetade, ehTravaDoPerfilSemMotor, fraseDaCategoriaDesconhecida, fraseDaFamiliaDesconhecida, lerCorpoDaTabela, MENSAGEM_CATEGORIA_OBRIGATORIA, MENSAGEM_MOTOR_INCOMPLETO, MENSAGEM_MOTOR_OBRIGATORIO, recusada } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const leitura = lerCorpoDaTabela(req.body)
  if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
  const t = leitura.corpo

  try {
    if (!(await listarFamilias()).some((f) => f.chave === t.familia)) return res.status(400).json({ error: fraseDaFamiliaDesconhecida(t.familia) })
    if (!(await listarCategorias()).some((c) => c.chave === t.categoria_chave)) return res.status(400).json({ error: fraseDaCategoriaDesconhecida(t.categoria_chave) })
    if (!(await objetoExiste(t.arquivo_path))) return res.status(400).json({ error: 'O arquivo da tabela não chegou ao armazenamento. Envie de novo.' })
    if (t.motor_path !== null && !(await objetoExiste(t.motor_path))) return res.status(400).json({ error: 'O arquivo do motor não chegou ao armazenamento. Envie de novo.' })
    const criada = await criarTabela({ ...t, criado_por: caller.user_id })
    return res.status(201).json(criada)
  } catch (e) {
    const codigo = codigoDoErro(e)
    if (codigo === '23503' && ehFkDaFamilia(e)) return res.status(400).json({ error: fraseDaFamiliaDesconhecida(t.familia) })
    if (codigo === '23503' && ehFkDaCategoria(e)) return res.status(400).json({ error: fraseDaCategoriaDesconhecida(t.categoria_chave) })
    if (codigo === '23514' && ehTravaDaCategoriaObrigatoria(e)) return res.status(400).json({ error: MENSAGEM_CATEGORIA_OBRIGATORIA })
    if (codigo === '23503') return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    if (codigo === '23514' && ehTravaDoPerfilSemMotor(e)) return res.status(400).json({ error: MENSAGEM_MOTOR_OBRIGATORIO })
    if (codigo === '23514' && ehTravaDoMotorPelaMetade(e)) return res.status(400).json({ error: MENSAGEM_MOTOR_INCOMPLETO })
    return falhaInterna(res, 'tabela POST', e, 'Não foi possível gravar a tabela.')
  }
}
