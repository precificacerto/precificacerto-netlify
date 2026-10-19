/**
 * POST /api/super-admin/atendimentos-ia/tabelas/url-de-envio — { fornecedor_id, tipo, nome }
 * → { path, signedUrl }.
 *
 * O ENVIO É AUTORIZADO PELA ROTA, COM `service_role`, E OS BYTES NÃO PASSAM POR ELA. A rota
 * escolhe o caminho (`caminhoNoBucket`: a pasta do fornecedor primeiro, um id único, o nome
 * limpo), e assina UM envio para esse caminho e só para ele (`createSignedUploadUrl`). O
 * navegador manda o arquivo com essa URL — sem o cliente do Supabase, sem sessão, sem política.
 *
 * POR QUE NÃO OS BYTES PELA ROTA: uma função na Vercel tem limite de corpo de requisição (4,5 MB
 * pela documentação da plataforma — NÃO medido aqui), e a tabela de preço de um fornecedor é um
 * `.xlsx` que pode passar disso. A rota recusaria um arquivo legítimo por tamanho, e a tela
 * mostraria um erro de envio que não diz por quê. Assinar o envio mantém a decisão de ONDE e
 * QUEM na rota, e tira dela só o transporte.
 *
 * O que a rota da tabela faz DEPOIS (`tabelas/index.ts`): confere que os dois objetos chegaram
 * ao bucket antes de gravar a linha. URL assinada e não usada não deixa rastro nenhum.
 */
import { randomUUID } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { assinarEnvio, falhaInterna, fornecedorExiste } from '@/lib/atendimentos-ia/repositorio'
import { caminhoNoBucket, lerPedidoDeEnvio, recusada } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const leitura = lerPedidoDeEnvio(req.body)
  if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
  const { fornecedor_id, tipo, nome } = leitura.corpo

  try {
    if (!(await fornecedorExiste(fornecedor_id))) return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    const assinado = await assinarEnvio(caminhoNoBucket(fornecedor_id, tipo, nome, randomUUID()))
    return res.status(200).json(assinado)
  } catch (e) {
    return falhaInterna(res, 'url de envio', e, 'Não foi possível preparar o envio do arquivo.')
  }
}
