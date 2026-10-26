/**
 * GET    /api/super-admin/atendimentos-ia/tabelas/[id] — a tabela, para a tela da importação: os
 *        nomes dos arquivos e o fornecedor (sem os caminhos do bucket).
 * PATCH  /api/super-admin/atendimentos-ia/tabelas/[id] — troca o arquivo, o motor, a vigência ou a
 *        FAMÍLIA (da lista, conferida aqui; ela se troca e não se apaga — 26/10/2026), ou a marca de
 *        VIGENTE (no máximo uma por fornecedor e família, pelo índice único do banco; a recusa nomeia a
 *        vigente de hoje — migração 20261026000005). A `vigencia` continua sendo só texto.
 * DELETE /api/super-admin/atendimentos-ia/tabelas/[id] — exclui uma tabela que nenhuma conta usa.
 *
 * TABELA EM USO o BANCO recusa (FK RESTRICT de `orcamentista_conta_tabela`, 23503). A rota não
 * engole: responde 409 com os NOMES das contas que usam — "Em uso por: …" (EPIC §3.7).
 *
 * >>> A ORDEM DA EXCLUSÃO, e é escolha registrada (bloco 2B.2, 19/10/2026) <<<
 * Primeiro a LINHA, depois os OBJETOS no Storage. Se o Storage falhar, os arquivos ficam no
 * bucket sem linha apontando para eles — ÓRFÃOS. Isso é desperdício de espaço, não erro de
 * cálculo: nenhuma conta enxerga uma tabela que não tem linha. A ordem contrária (objetos
 * primeiro) deixaria, numa falha do banco, uma linha apontando para arquivos que não existem —
 * uma tabela que a conta vê e que não calcula. A resposta diz quando sobrou órfão (`aviso`), e o
 * log leva os caminhos. A troca de arquivo no PATCH segue a mesma ordem: grava a linha nova,
 * depois remove o objeto antigo.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import {
  atualizarTabela,
  codigoDoErro,
  contasQueUsamATabela,
  excluirTabela,
  falhaInterna,
  listarFamilias,
  objetoExiste,
  tabelaVigenteDoPar,
  obterDadosDaTabela,
  obterTabela,
  removerObjetos,
} from '@/lib/atendimentos-ia/repositorio'
import { ehFkDaFamilia, ehIndiceDaVigente, ehUuid, emUsoPor, fraseDaFamiliaDesconhecida, fraseDaVigenteQueJaExiste, lerEdicaoDaTabela, recusada } from '@/utils/atendimentos-ia-catalogo'

const avisoDeOrfaos = (caminhos: string[]) =>
  `Os arquivos não puderam ser apagados do armazenamento e ficaram sem uso: ${caminhos.join(', ')}.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id } = req.query as { id?: string }
  if (!ehUuid(id)) return res.status(400).json({ error: 'Tabela inválida.' })

  if (req.method === 'GET') {
    try {
      const dados = await obterDadosDaTabela(id)
      return dados ? res.status(200).json(dados) : res.status(404).json({ error: 'Tabela não encontrada.' })
    } catch (e) {
      return falhaInterna(res, 'tabela (dados)', e, 'Não foi possível ler a tabela.')
    }
  }

  let atual: Awaited<ReturnType<typeof obterTabela>>
  try {
    atual = await obterTabela(id)
  } catch (e) {
    return falhaInterna(res, 'tabela (leitura)', e, 'Não foi possível ler a tabela.')
  }
  if (!atual) return res.status(404).json({ error: 'Tabela não encontrada.' })

  if (req.method === 'PATCH') {
    const leitura = lerEdicaoDaTabela(req.body, atual.fornecedor_id)
    if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
    const ed = leitura.corpo
    try {
      if (ed.familia !== undefined && !(await listarFamilias()).some((f) => f.chave === ed.familia)) return res.status(400).json({ error: fraseDaFamiliaDesconhecida(ed.familia) })
      if (ed.arquivo && !(await objetoExiste(ed.arquivo.path))) return res.status(400).json({ error: 'O arquivo da tabela não chegou ao armazenamento. Envie de novo.' })
      if (ed.motor && !(await objetoExiste(ed.motor.path))) return res.status(400).json({ error: 'O arquivo do motor não chegou ao armazenamento. Envie de novo.' })
      const campos: Record<string, string | boolean | null> = {}
      if (ed.arquivo) { campos.arquivo_path = ed.arquivo.path; campos.arquivo_nome = ed.arquivo.nome }
      if (ed.motor) { campos.motor_path = ed.motor.path; campos.motor_nome = ed.motor.nome }
      if (ed.vigencia !== undefined) campos.vigencia = ed.vigencia
      if (ed.familia !== undefined) campos.familia = ed.familia
      if (ed.vigente !== undefined) campos.vigente = ed.vigente
      await atualizarTabela(id, campos)
      const trocados = [ed.arquivo && atual.arquivo_path, ed.motor && atual.motor_path].filter((p): p is string => typeof p === 'string')
      const { erro } = await removerObjetos(trocados)
      if (erro) {
        console.error('atendimentos-ia tabela PATCH: órfãos no Storage:', trocados.join(', '), erro)
        return res.status(200).json({ ok: true, aviso: avisoDeOrfaos(trocados) })
      }
      return res.status(200).json({ ok: true })
    } catch (e) {
      if (codigoDoErro(e) === '23503' && ehFkDaFamilia(e) && ed.familia !== undefined) return res.status(400).json({ error: fraseDaFamiliaDesconhecida(ed.familia) })
      if (codigoDoErro(e) === '23505' && ehIndiceDaVigente(e)) {
        const ja = await tabelaVigenteDoPar(id)
        return res.status(409).json({ error: fraseDaVigenteQueJaExiste(ja?.familia ?? null, ja?.arquivo_nome ?? 'outra tabela') })
      }
      return falhaInterna(res, 'tabela PATCH', e, 'Não foi possível alterar a tabela.')
    }
  }

  try {
    const n = await excluirTabela(id)
    if (n === 0) return res.status(404).json({ error: 'Tabela não encontrada.' })
  } catch (e) {
    if (codigoDoErro(e) !== '23503') return falhaInterna(res, 'tabela DELETE', e, 'Não foi possível excluir a tabela.')
    try {
      const contas = await contasQueUsamATabela(id)
      return res.status(409).json({ error: `A tabela está em uso e não pode ser excluída. ${emUsoPor(contas)}. Tire a tabela da conta primeiro.`, contas })
    } catch (e2) {
      return falhaInterna(res, 'tabela DELETE (quem usa)', e2, 'A tabela está em uso e não pode ser excluída; não foi possível listar as contas.')
    }
  }

  // A linha saiu. Agora os objetos — e uma falha aqui deixa órfão, nunca uma tabela sem arquivo.
  const caminhos = [atual.arquivo_path, atual.motor_path]
  const { erro } = await removerObjetos(caminhos)
  if (erro) {
    console.error('atendimentos-ia tabela DELETE: órfãos no Storage:', caminhos.join(', '), erro)
    return res.status(200).json({ ok: true, aviso: avisoDeOrfaos(caminhos) })
  }
  return res.status(200).json({ ok: true })
}
