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
 *   3. os dois arquivos são de extensão importável — senão 409 com o arquivo, a extensão e o
 *      porquê (`fraseDoArquivoNaoImportavel`). `.xls`, `.csv` e `.pdf` são aceitos no ENVIO e
 *      não são importáveis;
 *   4. os dois objetos estão no bucket — senão 409 com o caminho que faltou;
 *   5. baixa os dois com `service_role` e lê com o leitor (`lerArquivosDaImportacao`). Planilha
 *      que o leitor recusa — aba que falta, arquivo que não abre — é 422 com a frase dele;
 *   5a. A TRAVA DOS ITENS (25/10/2026, decisão do dono do produto): se a tabela tem item gravado
 *      cujo código o arquivo NÃO traz, 409 com `fraseDaImportacaoTravadaPorItensForaDoArquivo` —
 *      DEPOIS de ler (é a leitura que diz o que o arquivo traz) e ANTES de gravar. O caso: 24 vidros
 *      inseridos à mão na tabela 5f7acebf. Erro do banco ao ler os códigos é 500: falha FECHADA.
 *      Cobre os ITENS; regras, tipologias e fórmulas só existem vindas do arquivo;
 *   6. grava por UMA chamada à função `importar_conteudo_da_tabela` (`20261020000002`), que
 *      apaga e insere numa transação;
 *   7. CONFERE o que a função gravou contra o que foi mandado. Diferente é 500 com os dois
 *      números lado a lado — nunca sucesso. LIMITE: a função já fez COMMIT quando a conferência
 *      acontece; o 500 torna a divergência visível, mas NÃO a desfaz.
 *
 * Medido pela sessão de verificação: 0,93 s para ler os dois arquivos da Wolff. 60 s é folga.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import {
  baixarObjeto,
  falhaInterna,
  importarConteudo,
  codigosDosItensGravados,
  nomeDoUsuario,
  objetoExiste,
  obterArquivosDaTabela,
  ultimaImportacao,
} from '@/lib/atendimentos-ia/repositorio'
import { arquivoImportavel, ehUuid, fraseDoArquivo, fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'
import {
  conferirGravacao,
  fraseDaImportacaoTravadaPorItensForaDoArquivo,
  itensQueOArquivoNaoTraz,
  lerArquivosDaImportacao,
  montarPayloadDaImportacao,
  type ResultadoDaLeitura,
} from '@/utils/atendimentos-ia-importacao'

export const config = { maxDuration: 60 }

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

  const arquivos = [
    { nome: tabela.arquivo_nome, caminho: tabela.arquivo_path },
    { nome: tabela.motor_nome, caminho: tabela.motor_path },
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
    tabela: { nome: tabela.arquivo_nome, bytes: bytes[0] },
    motor: { nome: tabela.motor_nome, bytes: bytes[1] },
  })
  if (!leitura.ok) return res.status(422).json({ error: (leitura as Recusa).erro })
  const lida = leitura as Lida

  const payload = montarPayloadDaImportacao(lida, caller.user_id)

  let foraDoArquivo: string[]
  try {
    foraDoArquivo = itensQueOArquivoNaoTraz(await codigosDosItensGravados(id), payload)
  } catch (e) {
    return falhaInterna(res, 'importação (itens gravados)', e, 'Não foi possível conferir os itens gravados da tabela. Nada foi alterado.')
  }
  if (foraDoArquivo.length > 0) return res.status(409).json({ error: fraseDaImportacaoTravadaPorItensForaDoArquivo(foraDoArquivo) })
  let gravado: Awaited<ReturnType<typeof importarConteudo>>
  try {
    gravado = await importarConteudo(id, payload)
  } catch (e) {
    return falhaInterna(res, 'importação (gravação)', e, 'A importação não foi gravada. O conteúdo anterior da tabela continua como estava.')
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
    contagens: { ...lida.contagens, formulas: gravado.formulas },
    avisos: lida.avisos,
  })
}
