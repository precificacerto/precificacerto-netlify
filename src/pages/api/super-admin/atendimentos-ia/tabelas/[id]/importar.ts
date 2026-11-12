/**
 * POST /api/super-admin/atendimentos-ia/tabelas/[id]/importar — importa os dois arquivos da tabela.
 * GET  /api/super-admin/atendimentos-ia/tabelas/[id]/importar — a última importação, ou null; com
 *      `importado_por_nome`, o nome do super admin que importou.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * O PARÂMETRO DA URL É `[id]`, não `[tabelaId]`: o Next não aceita dois nomes diferentes para o
 * mesmo trecho dinâmico do caminho, e `tabelas/[id].ts` já existe. A URL é a mesma.
 *
 * A ORDEM DO POST, e cada recusa sai ANTES do passo seguinte:
 *   1. só super admin (401 sem sessão, 403 sem ser);
 *   2. a tabela existe (404);
 *   (A TRAVA DO TEMPO, que vivia aqui desde 24/10/2026, foi REMOVIDA em 25/10/2026 por decisão do
 *   dono do produto: o tempo mora em `orcamentista_motor_tipologia_tempo` (20261024000003), que a
 *   função do passo 6 não alcança. A prova, num Postgres real, é `scripts/harness/reimportacao-com-os-tempos/`:
 *   uma reimportação completa com os 164 tempos gravados roda até o fim e os 164 continuam lá.)
 *   3. os arquivos são de extensão importável — senão 409 com o arquivo, a extensão e o
 *      porquê (`fraseDoArquivoNaoImportavel`). `.xls`, `.csv` e `.pdf` são aceitos no ENVIO e
 *      não são importáveis;
 *   4. os dois objetos estão no bucket — senão 409 com o caminho que faltou;
 *   5. baixa os dois com `service_role` e lê com o leitor (`lerArquivosDaImportacao`). Planilha
 *      que o leitor recusa — aba que falta, arquivo que não abre — é 422 com a frase dele;
 *   5a. A PRÉVIA DA TROCA (dono do produto, 12/11/2026 — substitui a trava dos itens de 25/10/2026, que recusava todo arquivo sem algum
 *      código gravado e travaria todo reajuste): com a tabela já tendo itens, o POST sem `confirmar` NÃO grava e devolve a `previa` —
 *      entram N, saem M (os códigos, todos), ficam K — e o `sha256` do arquivo lido. A tela mostra e só grava com `confirmar: true` e o MESMO
 *      sha256 (outro é 409: o arquivo mudou desde a prévia). ENCOLHER o total exige `permitir_encolher: true` (409 sem ela, ANTES de gravar; a
 *      função do banco é a segunda trava, 23514). Tabela sem item (a primeira importação) grava direto: nada sai. O ARQUIVO NOVO vem no corpo
 *      (`arquivo_path`/`arquivo_nome`, o que a edição devolveu como pendente): a importação lê dele, e a troca do arquivo da tabela acontece
 *      na MESMA transação dos itens. O arquivo de antes fica no bucket (nada é apagado);
 *   5b. UMA TABELA, UMA CATEGORIA DO FORNECEDOR (27/10/2026, decisão do dono do produto): a tabela que DECLARA a
 *      categoria (`categoria_chave`, migração 20261027000005) recusa o arquivo cujos itens trazem mais de uma
 *      categoria do fornecedor — 422 nomeando as que achou, antes de gravar. "Não pode haver margem para o agente
 *      usar o preço de uma ramificação que ninguém escolheu." A tabela de antes, SEM categoria declarada (a da
 *      Wolff), NÃO é recusada retroativamente: importa como sempre, e o aviso `tabela_sem_categoria_declarada` diz
 *      que a regra não foi aplicada. Item sem a categoria do fornecedor preenchida vira o aviso
 *      `itens_sem_categoria_do_fornecedor`, nunca é somado a uma categoria;
 *   6. grava por UMA chamada a `superadmin_importar_tabela` (`20261112000003`), que trava a tabela, conta antes, recusa encolher sem a
 *      permissão, chama `importar_conteudo_da_tabela`, confere depois, troca o arquivo e loga com o sha256 e quem importou — numa transação;
 *   7. CONFERE o que a função gravou contra o que foi mandado. Diferente é 500 com os dois
 *      números lado a lado — nunca sucesso. A contagem dos itens a função já confere por dentro (exceção desfaz tudo); as outras listas
 *      são conferidas aqui, depois do COMMIT: o 500 torna a divergência visível, mas NÃO a desfaz.
 *
 * Medido pela sessão de verificação: 0,93 s para ler os dois arquivos da Wolff (antes das nove abas).
 * Medido em produção em 25/10/2026, com as nove abas: a rota rodou 38,4 s até a gravação ser
 * cancelada pelo limite de 8 s — ver o `maxDuration` abaixo.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { createHash } from 'crypto'
import {
  baixarObjeto,
  codigoDoErro,
  falhaInterna,
  importarTabela,
  codigosDosItensGravados,
  nomeDoUsuario,
  objetoExiste,
  obterArquivosDaTabela,
  ultimaImportacao,
} from '@/lib/atendimentos-ia/repositorio'
import { arquivoImportavel, ehUuid, fraseDoArquivo, fraseDoArquivoNaoImportavel, lerPedidoDeImportacao, recusada } from '@/utils/atendimentos-ia-catalogo'
import { categoriasDoFornecedorNosItens, FRASE_DA_TABELA_SEM_CATEGORIA_DECLARADA, fraseDoArquivoComMaisDeUmaCategoria, fraseDosItensSemCategoriaDoFornecedor } from '@/utils/atendimentos-ia-categoria-do-arquivo'
import {
  COLUNA_DA_CATEGORIA_DO_FORNECEDOR,
  conferirGravacao,
  FRASE_DO_ARQUIVO_QUE_MUDOU,
  fraseDaGravacaoQueFalhou,
  fraseDaPrevia,
  fraseDoEncolherSemPermissao,
  lerArquivosDaImportacao,
  montarPayloadDaImportacao,
  previaDaTroca,
  type ResultadoDaLeitura,
} from '@/utils/atendimentos-ia-importacao'

// 90 s: ~9 s lendo do Storage e parseando, ~19 s até o comando começar no banco (18,1 MB de corpo,
// medidos em produção em 25/10/2026), até LIMITE_DA_GRAVACAO_S (35 s) de gravação, e folga. Há portão
// que liga os dois números: com menos, a rota morre antes do banco e a tela perde o motivo.
export const config = { maxDuration: 90 }

type Recusa = Extract<ResultadoDaLeitura, { ok: false }>
type Lida = Extract<ResultadoDaLeitura, { ok: true }>

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id } = req.query as { id?: string }
  if (!ehUuid(id)) return res.status(400).json({ error: 'Tabela inválida.' })

  let tabela: Awaited<ReturnType<typeof obterArquivosDaTabela>>
  try {
    tabela = await obterArquivosDaTabela(id)
  } catch (e) {
    return falhaInterna(res, 'importação (tabela)', e, 'Não foi possível ler a tabela.')
  }
  if (!tabela) return res.status(404).json({ error: 'Tabela não encontrada.' })

  if (req.method === 'GET') {
    try {
      const ultima = await ultimaImportacao(id)
      if (!ultima) return res.status(200).json(null)
      // Quem importou é o super admin: o NOME dele, nunca dado de cliente.
      const importado_por_nome = ultima.importado_por ? await nomeDoUsuario(ultima.importado_por) : null
      return res.status(200).json({ ...ultima, importado_por_nome })
    } catch (e) {
      return falhaInterna(res, 'importação (última)', e, 'Não foi possível ler a última importação.')
    }
  }

  // O MOTOR É OPCIONAL (27/10/2026): a tabela de preço puro (Reforço, Acessórios…) não tem arquivo de motor, e a importação lê só o preço.
  // Nulo e VAZIO são a mesma coisa aqui: a Estrela está em produção com motor_path e motor_nome = '' (medido em 27/10/2026), e '' não é um arquivo.
  const pedido = lerPedidoDeImportacao(req.body, tabela.fornecedor_id)
  if (recusada(pedido)) return res.status(400).json({ error: pedido.erro })
  const { arquivo: pendente, confirmar, sha256: shaDaPrevia, permitirEncolher } = pedido.corpo
  // o arquivo NOVO (pendente) troca o de hoje só se for outro caminho; o mesmo caminho é reimportar o de hoje
  const arquivoNovo = pendente && pendente.path !== tabela.arquivo_path ? pendente : null
  const daTabela = arquivoNovo ?? { path: tabela.arquivo_path, nome: tabela.arquivo_nome }
  const comMotor = !!tabela.motor_path?.trim() && !!tabela.motor_nome?.trim()
  const arquivos = [
    { nome: daTabela.nome, caminho: daTabela.path },
    ...(comMotor ? [{ nome: tabela.motor_nome as string, caminho: tabela.motor_path as string }] : []),
  ]
  for (const a of arquivos) {
    if (!arquivoImportavel(a.nome)) return res.status(409).json({ error: fraseDoArquivoNaoImportavel(a.nome) })
  }

  let bytes: Uint8Array[]
  try {
    for (const a of arquivos) {
      if (!(await objetoExiste(a.caminho))) {
        return res.status(409).json({ error: fraseDoArquivo(a.nome, `não está no armazenamento — faltou o caminho ${a.caminho}. Envie o arquivo de novo.`) })
      }
    }
    bytes = await Promise.all(arquivos.map((a) => baixarObjeto(a.caminho)))
  } catch (e) {
    return falhaInterna(res, 'importação (download)', e, 'Não foi possível baixar os arquivos da tabela.')
  }

  const leitura = await lerArquivosDaImportacao({
    tabela: { nome: daTabela.nome, bytes: bytes[0] },
    motor: comMotor ? { nome: tabela.motor_nome as string, bytes: bytes[1] } : null,
  })
  if (!leitura.ok) return res.status(422).json({ error: (leitura as Recusa).erro })
  const lida = leitura as Lida

  // 5b. UMA TABELA, UMA CATEGORIA DO FORNECEDOR — antes de montar o payload e de qualquer gravação.
  const doArquivo = categoriasDoFornecedorNosItens(lida.itens.map((i) => i[COLUNA_DA_CATEGORIA_DO_FORNECEDOR]))
  // SEM `?? null`: um `undefined` (a leitura da tabela que esqueceu de pedir a coluna) NÃO vira "sem categoria" — falha FECHADA, recusando.
  const declarada = tabela.categoria_chave
  if (declarada !== null && doArquivo.categorias.length > 1) {
    return res.status(422).json({ error: fraseDoArquivoComMaisDeUmaCategoria(daTabela.nome, doArquivo.categorias) })
  }
  if (declarada === null) lida.avisos.push({ tipo: 'tabela_sem_categoria_declarada', mensagem: FRASE_DA_TABELA_SEM_CATEGORIA_DECLARADA })
  if (doArquivo.semCategoria > 0) lida.avisos.push({ tipo: 'itens_sem_categoria_do_fornecedor', itens: doArquivo.semCategoria, mensagem: fraseDosItensSemCategoriaDoFornecedor(doArquivo.semCategoria) })

  const payload = montarPayloadDaImportacao(lida, caller.user_id)

  const sha256 = createHash('sha256').update(bytes[0]).digest('hex')

  // 5a. A PRÉVIA: com itens gravados, nada grava sem a confirmação dela
  let previa: ReturnType<typeof previaDaTroca>
  try {
    previa = previaDaTroca(await codigosDosItensGravados(id), payload)
  } catch (e) {
    return falhaInterna(res, 'importação (itens gravados)', e, 'Não foi possível conferir os itens gravados da tabela. Nada foi alterado.')
  }
  const resumo = { ...previa, frase: fraseDaPrevia(previa), sha256, arquivo_nome: daTabela.nome, arquivo_trocado: arquivoNovo !== null }
  if (previa.antes > 0 && !confirmar) return res.status(200).json({ previa: resumo })
  if (confirmar && shaDaPrevia !== sha256) return res.status(409).json({ error: FRASE_DO_ARQUIVO_QUE_MUDOU, previa: resumo })
  if (previa.encolhe && !permitirEncolher) return res.status(409).json({ error: fraseDoEncolherSemPermissao(previa), previa: resumo })

  // A DURAÇÃO da gravação vai para o log, no sucesso e na falha: é o número que calibra o limite
  // da função (LIMITE_DA_GRAVACAO_S), e em produção ele só se mede assim.
  let gravado: Awaited<ReturnType<typeof importarTabela>>
  const inicio = Date.now()
  try {
    gravado = await importarTabela({ por: caller.user_id, tabelaId: id, sha256, payload, permitirEncolher, arquivo: arquivoNovo })
    console.log(`atendimentos-ia importação (gravação): ${Date.now() - inicio} ms, gravada`)
  } catch (e) {
    console.log(`atendimentos-ia importação (gravação): ${Date.now() - inicio} ms, falhou (${codigoDoErro(e) ?? 'sem código'})`)
    // a segunda trava, no banco: outra importação mudou a contagem entre a prévia e a gravação
    // (só a recusa dela: 23514 também é o código das CHECKs dos itens, que seguem a frase do código, abaixo)
    if (codigoDoErro(e) === '23514' && /encolheria/.test((e as { message?: string })?.message ?? '')) {
      return res.status(409).json({ error: fraseDoEncolherSemPermissao(previa), previa: resumo })
    }
    return falhaInterna(res, 'importação (gravação)', e, fraseDaGravacaoQueFalhou(codigoDoErro(e)))
  }

  const divergencia = conferirGravacao(payload, gravado)
  if (divergencia) {
    console.error('atendimentos-ia importação: contagem divergente', id, JSON.stringify(divergencia))
    return res.status(500).json({
      error: 'A gravação não conferiu com o que foi lido: as contagens diferem. A importação NÃO deve ser considerada válida.',
      ...divergencia,
    })
  }

  return res.status(200).json({
    importacao_id: gravado.importacao_id,
    previa: resumo,
    itens_antes: gravado.itens_antes,
    itens_depois: gravado.itens_depois,
    arquivo_trocado: gravado.arquivo_trocado,
    contagens: { ...lida.contagens, formulas: gravado.formulas },
    avisos: lida.avisos,
    // o layout lido e, SÓ no layout único, os seis campos da aba CABECALHO — lidos e devolvidos, sem gravar (dono do produto, 02/11/2026).
    // No layout de antes a chave nem vai: a resposta não carrega "null" que a tela leia como texto.
    layout: lida.layout,
    ...(lida.cabecalho ? { cabecalho: lida.cabecalho } : {}),
  })
}
