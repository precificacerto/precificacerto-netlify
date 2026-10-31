/**
 * GET    /api/super-admin/atendimentos-ia/tabelas/[id] — a tabela, para a tela da importação: os
 *        nomes dos arquivos e o fornecedor (sem os caminhos do bucket).
 * PATCH  /api/super-admin/atendimentos-ia/tabelas/[id] — troca o arquivo, o motor, a vigência ou a
 *        FAMÍLIA (da lista, conferida aqui; ela se troca, e SÓ fora do Perfil se tira — `familia: null`, a tabela passa a servir qualquer
 *        linha; na tabela de PERFIL é obrigatória: 28/10/2026, migração 20261028000002), ou a marca de
 *        VIGENTE (no máximo uma por fornecedor, família e CATEGORIA, pelo índice único do banco; a recusa nomeia a
 *        vigente de hoje — migração 20261026000005). A `vigencia` continua sendo só texto. Dá a CATEGORIA da tabela
 *        (`categoria_chave`) — UMA VEZ: a tabela de antes não a tem, ganha uma e depois ela não se troca nem se
 *        apaga (409 com a frase; o gatilho do banco é a segunda trava — migração 20261027000005). A tabela cujos
 *        itens gravados têm mais de uma categoria do fornecedor NÃO pode declarar uma só (409, nomeando as que
 *        achou): é o caso da Wolff, que fica como está até o dono do produto decidir. O arquivo do motor é opcional em
 *        toda categoria (27/10/2026, à noite: o motor mora na família), e na edição ele troca inteiro e não se apaga.
 *        O ARQUIVO DA TABELA JÁ IMPORTADA NÃO SE TROCA (dono do produto, 29/10/2026): com algum item gravado, trocar o arquivo é 409, que manda
 *        criar tabela nova — antes de gravar e de apagar qualquer coisa. Em 29/10/2026, às 16:07, uma edição trocou o arquivo da tabela da
 *        Wolff (735 itens) e esta rota apagou o .xlsm original (a cópia do dono do produto o recuperou). E a edição RECUSADA tira do bucket o
 *        arquivo que a tela acabou de enviar, se ninguém o referencia (`descartarEnvioRecusado`).
 * DELETE /api/super-admin/atendimentos-ia/tabelas/[id] — exclui uma tabela que nenhuma conta usa.
 *
 * TABELA EM USO A ROTA RECUSA, ANTES de apagar: 409 com os NOMES das contas — "Em uso por: …" (EPIC §3.7).
 * O uso é DERIVADO (dono do produto, 26/10/2026): a conta usa a tabela quando a base de conhecimento dela
 * vincula o fornecedor da tabela — qualquer tabela dele, também a antiga não vigente, que explica um
 * orçamento do ano passado. Era o RESTRICT de `orcamentista_conta_tabela` que protegia; ela não é mais
 * escrita, e a proteção MUDOU DE LUGAR para cá (`atendimentos-ia-tabelas-derivadas.test.ts`, (3)). Um 23503
 * do banco ainda vira 409 — a linha parada de `orcamentista_conta_tabela` continua com a FK.
 *
 * >>> A ORDEM DA EXCLUSÃO, e é escolha registrada (bloco 2B.2, 19/10/2026) <<<
 * Primeiro a LINHA, depois os OBJETOS no Storage. Se o Storage falhar, os arquivos ficam no
 * bucket sem linha apontando para eles — ÓRFÃOS. Isso é desperdício de espaço, não erro de
 * cálculo: nenhuma conta enxerga uma tabela que não tem linha. A ordem contrária (objetos
 * primeiro) deixaria, numa falha do banco, uma linha apontando para arquivos que não existem —
 * uma tabela que a conta vê e que não calcula. A resposta diz quando sobrou órfão (`aviso`), e o
 * log leva os caminhos. A troca de arquivo no PATCH segue a mesma ordem: grava a linha nova,
 * depois remove o objeto antigo.
 *
 * >>> O OBJETO QUE UMA PLANILHA TAMBÉM USA NÃO SE REMOVE (27/10/2026, PR C) <<<
 * A migração `20261027000004` copiou o motor da Wolff para `orcamentista_motor`, e a planilha aponta o MESMO objeto do
 * bucket que `motor_path` desta tabela. Trocar o motor (PATCH) ou excluir a tabela (DELETE) removeria o arquivo de
 * uma planilha que continua de pé. Antes de remover, a rota tira da lista o que `orcamentista_motor.arquivo_path`
 * referencia, e AVISA que o objeto ficou. Se a conferência falhar, NADA é removido: um objeto órfão é desperdício de
 * espaço; uma planilha sem arquivo é perda (`caminhosDaPlanilha`).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import {
  atualizarTabela,
  caminhosDaPlanilha,
  caminhosDeTabela,
  codigoDoErro,
  contarItensDaTabela,
  contasQueUsamATabela,
  excluirTabela,
  falhaInterna,
  categoriasDoFornecedorDosItensGravados,
  listarCategorias,
  listarFamilias,
  objetoExiste,
  tabelaVigenteDoPar,
  obterDadosDaTabela,
  obterTabela,
  removerObjetos,
} from '@/lib/atendimentos-ia/repositorio'
import { MENSAGEM_FAMILIA_OBRIGATORIA, MENSAGEM_MOTOR_INCOMPLETO, ehFkDaCategoria, ehFkDaFamilia, ehIndiceDaVigente, ehTravaDaFamiliaNoPerfil, familiaObrigatoria, ehTravaDaCategoriaQueNaoSeTroca, ehTravaDoMotorPelaMetade, ehUuid, emUsoPor, fraseDaCategoriaDesconhecida, fraseDaCategoriaQueNaoSeTroca, fraseDaFamiliaDesconhecida, fraseDaVigenteQueJaExiste, fraseDoArquivoDaTabelaImportada, lerEdicaoDaTabela, recusada, type EdicaoDaTabela } from '@/utils/atendimentos-ia-catalogo'
import { categoriasDoFornecedorNosItens, fraseDaTabelaComMaisDeUmaCategoria } from '@/utils/atendimentos-ia-categoria-do-arquivo'

const fraseDaTabelaEmUso = (contas: string[]) =>
  `A tabela está em uso e não pode ser excluída. ${emUsoPor(contas)}. Para excluir, tire o fornecedor dela da base de conhecimento dessas contas.`

const avisoDeOrfaos = (caminhos: string[]) =>
  `Os arquivos não puderam ser apagados do armazenamento e ficaram sem uso: ${caminhos.join(', ')}.`

const avisoDosMantidos = (caminhos: string[]) =>
  `Mantido no armazenamento, porque uma planilha do motor usa o mesmo arquivo: ${caminhos.join(', ')}.`

const avisoSemConferir = (caminhos: string[]) =>
  `Não foi possível conferir se uma planilha do motor usa estes arquivos; nada foi removido do armazenamento: ${caminhos.join(', ')}.`

/** Remove do armazenamento só o que NENHUMA planilha referencia. Devolve o que a resposta precisa dizer. */
async function removerOsQueNinguemMaisUsa(contexto: string, caminhos: string[]): Promise<{ aviso?: string }> {
  let emUso: Set<string>
  try {
    emUso = await caminhosDaPlanilha(caminhos)
  } catch (e) {
    console.error(`atendimentos-ia ${contexto}: não conferiu as planilhas, nada removido:`, caminhos.join(', '), (e as { message?: string })?.message ?? 'erro')
    return { aviso: avisoSemConferir(caminhos) }
  }
  const mantidos = caminhos.filter((c) => emUso.has(c))
  const { erro } = await removerObjetos(caminhos.filter((c) => !emUso.has(c)))
  const sobrou = caminhos.filter((c) => !emUso.has(c))
  const avisos: string[] = []
  if (erro) {
    console.error(`atendimentos-ia ${contexto}: órfãos no Storage:`, sobrou.join(', '), erro)
    avisos.push(avisoDeOrfaos(sobrou))
  }
  if (mantidos.length > 0) avisos.push(avisoDosMantidos(mantidos))
  return avisos.length > 0 ? { aviso: avisos.join(' ') } : {}
}

type Saida = { status: (n: number) => { json: (b: unknown) => unknown } }

/** Guarda a resposta da edição, para a rota decidir o que fazer com o arquivo enviado antes de responder. */
function gravador() {
  const g = { status_: 0, corpo: undefined as unknown, status(n: number) { g.status_ = n; return g }, json(b: unknown) { g.corpo = b; return g } }
  return g
}

/**
 * (c) O ARQUIVO RECÉM-ENVIADO DE UMA EDIÇÃO RECUSADA SAI DO BUCKET (dono do produto, 29/10/2026). A tela manda os bytes ANTES do PATCH; se a
 * edição é recusada, o objeto fica sem ninguém. Só sai o que NINGUÉM referencia — nenhuma tabela (arquivo ou motor) e nenhuma planilha do motor:
 * um corpo que citasse o caminho de outra tabela não a deixa sem arquivo. Se a conferência falhar, nada é removido (órfão é desperdício; arquivo
 * de tabela apagado é perda). NUNCA lança: a resposta da edição é a recusa dela.
 */
async function descartarEnvioRecusado(caminho: string): Promise<void> {
  try {
    const [daTabela, daPlanilha] = await Promise.all([caminhosDeTabela([caminho]), caminhosDaPlanilha([caminho])])
    if (daTabela.has(caminho) || daPlanilha.has(caminho)) return
    const { erro } = await removerObjetos([caminho])
    if (erro) console.error('atendimentos-ia tabela PATCH: o arquivo da edição recusada ficou no Storage:', caminho, erro)
  } catch (e) {
    console.error('atendimentos-ia tabela PATCH: não conferiu quem usa o arquivo da edição recusada; nada removido:', caminho, (e as { message?: string })?.message ?? 'erro')
  }
}

async function editarTabela(saida: Saida, id: string, atual: NonNullable<Awaited<ReturnType<typeof obterTabela>>>, ed: EdicaoDaTabela) {
  try {
    // (a) o ARQUIVO da tabela já importada não se troca (29/10/2026): ANTES de qualquer outra conferência, gravação ou remoção
    if (ed.arquivo) {
      const itens = await contarItensDaTabela(id)
      if (itens > 0) return saida.status(409).json({ error: fraseDoArquivoDaTabelaImportada(itens) })
    }
    if (typeof ed.familia === 'string' && !(await listarFamilias()).some((f) => f.chave === ed.familia)) return saida.status(400).json({ error: fraseDaFamiliaDesconhecida(ed.familia) })
    if (ed.categoria !== undefined) {
      if (!(await listarCategorias()).some((c) => c.chave === ed.categoria)) return saida.status(400).json({ error: fraseDaCategoriaDesconhecida(ed.categoria) })
      if (atual.categoria_chave != null && atual.categoria_chave !== ed.categoria) return saida.status(409).json({ error: fraseDaCategoriaQueNaoSeTroca(atual.categoria_chave, ed.categoria) })
      if (atual.categoria_chave == null) {
        const { categorias } = categoriasDoFornecedorNosItens(await categoriasDoFornecedorDosItensGravados(id))
        if (categorias.length > 1) return saida.status(409).json({ error: fraseDaTabelaComMaisDeUmaCategoria(categorias) })
      }
    }
    // a tabela de PERFIL tem família: nem se tira a dela, nem se dá PERFIL a uma tabela sem família (sem dar a família junto)
    const familiaDepois = ed.familia !== undefined ? ed.familia : (atual.familia ?? null)
    const categoriaDepois = atual.categoria_chave ?? ed.categoria ?? null
    if (familiaDepois === null && familiaObrigatoria(categoriaDepois)) return saida.status(400).json({ error: MENSAGEM_FAMILIA_OBRIGATORIA })
    if (ed.arquivo && !(await objetoExiste(ed.arquivo.path))) return saida.status(400).json({ error: 'O arquivo da tabela não chegou ao armazenamento. Envie de novo.' })
    if (ed.motor && !(await objetoExiste(ed.motor.path))) return saida.status(400).json({ error: 'O arquivo do motor não chegou ao armazenamento. Envie de novo.' })
    const campos: Record<string, string | boolean | null> = {}
    if (ed.arquivo) { campos.arquivo_path = ed.arquivo.path; campos.arquivo_nome = ed.arquivo.nome }
    if (ed.motor) { campos.motor_path = ed.motor.path; campos.motor_nome = ed.motor.nome }
    if (ed.vigencia !== undefined) campos.vigencia = ed.vigencia
    if (ed.familia !== undefined) campos.familia = ed.familia
    // a MESMA categoria de novo não é troca nem escrita: só vai quando a tabela ainda não tem
    if (ed.categoria !== undefined && atual.categoria_chave == null) campos.categoria_chave = ed.categoria
    if (ed.vigente !== undefined) campos.vigente = ed.vigente
    if (Object.keys(campos).length > 0) await atualizarTabela(id, campos)
    const trocados = [ed.arquivo && atual.arquivo_path, ed.motor && atual.motor_path].filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    const { aviso } = await removerOsQueNinguemMaisUsa('tabela PATCH', trocados)
    return saida.status(200).json(aviso ? { ok: true, aviso } : { ok: true })
  } catch (e) {
    if (codigoDoErro(e) === '23503' && ehFkDaFamilia(e) && typeof ed.familia === 'string') return saida.status(400).json({ error: fraseDaFamiliaDesconhecida(ed.familia) })
    if (codigoDoErro(e) === '23514' && ehTravaDaFamiliaNoPerfil(e)) return saida.status(400).json({ error: MENSAGEM_FAMILIA_OBRIGATORIA })
    if (codigoDoErro(e) === '23514' && ehTravaDoMotorPelaMetade(e)) return saida.status(400).json({ error: MENSAGEM_MOTOR_INCOMPLETO })
    if (codigoDoErro(e) === '23503' && ehFkDaCategoria(e) && ed.categoria !== undefined) return saida.status(400).json({ error: fraseDaCategoriaDesconhecida(ed.categoria) })
    if (codigoDoErro(e) === '23514' && ehTravaDaCategoriaQueNaoSeTroca(e) && ed.categoria !== undefined) {
      // duas gravações ao mesmo tempo: a outra deu a categoria entre a leitura e a escrita
      const agora = await obterTabela(id).catch((): null => null)
      return saida.status(409).json({ error: fraseDaCategoriaQueNaoSeTroca(agora?.categoria_chave ?? 'já dada', ed.categoria) })
    }
    if (codigoDoErro(e) === '23505' && ehIndiceDaVigente(e)) {
      const ja = await tabelaVigenteDoPar(id)
      return saida.status(409).json({ error: fraseDaVigenteQueJaExiste(ja?.familia ?? null, ja?.arquivo_nome ?? 'outra tabela', ja?.categoria_chave ?? null) })
    }
    return falhaInterna(saida, 'tabela PATCH', e, 'Não foi possível alterar a tabela.')
  }
}

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
    const saida = gravador()
    await editarTabela(saida, id, atual, ed)
    // (c) a edição RECUSADA não deixa o arquivo recém-enviado sobrando no bucket (29/10/2026: três ficaram)
    if (saida.status_ !== 200 && ed.arquivo) await descartarEnvioRecusado(ed.arquivo.path)
    return res.status(saida.status_).json(saida.corpo)
  }

  let contas: string[]
  try {
    contas = await contasQueUsamATabela(id)
  } catch (e) {
    return falhaInterna(res, 'tabela DELETE (quem usa)', e, 'Não foi possível conferir quem usa a tabela; ela não foi excluída.')
  }
  if (contas.length > 0) return res.status(409).json({ error: fraseDaTabelaEmUso(contas), contas })

  try {
    const n = await excluirTabela(id)
    if (n === 0) return res.status(404).json({ error: 'Tabela não encontrada.' })
  } catch (e) {
    if (codigoDoErro(e) !== '23503') return falhaInterna(res, 'tabela DELETE', e, 'Não foi possível excluir a tabela.')
    return res.status(409).json({ error: 'A tabela está em uso e não pode ser excluída: o banco recusou a exclusão.', contas: [] })
  }

  // A linha saiu. Agora os objetos — e uma falha aqui deixa órfão, nunca uma tabela sem arquivo.
  const { aviso } = await removerOsQueNinguemMaisUsa('tabela DELETE', [atual.arquivo_path, atual.motor_path].filter((p): p is string => typeof p === 'string' && p.trim() !== ''))
  return res.status(200).json(aviso ? { ok: true, aviso } : { ok: true })
}
