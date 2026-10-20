/**
 * PATCH /api/super-admin/orcamentista/[tenantId] — liga, desliga e configura o Orçamentista de
 * UMA conta.
 *
 * O MOLDE é o das rotas que já fazem certo (`/api/cash-entries/baixa`, `/api/delete/sales`):
 * a sessão vem do cookie por `getCallerContext` (aqui via `requireSuperAdmin`, que o embrulha),
 * a autorização é checada ANTES de ler o corpo, a escrita é com `supabaseAdmin` no servidor, e o
 * corpo é lido SÓ pelas chaves do contrato (`lerCorpoDaConfig`). Autor e data vêm da sessão e do
 * relógio, nunca do corpo.
 *
 * UMA CONTA POR CHAMADA: o tenant vem da URL, e o upsert é por `tenant_id` (a PK). Não existe
 * caminho que escreva em duas contas — desligar uma não toca a outra.
 *
 * DUAS TRAVAS, e nenhuma substitui a outra: a rota usa `service_role` (que passa por cima da
 * RLS), então quem barra o não-super-admin AQUI é `requireSuperAdmin`; quem barra um tenant que
 * fale direto com o PostgREST são o PRIVILÉGIO (`authenticated` sem INSERT/UPDATE/DELETE) e, por
 * baixo dele, a política `is_super_admin()` da tabela — duas camadas independentes.
 *
 * DUAS GRAVAÇÕES, e uma não toca a outra (bloco 2C.1, 19/10/2026 — `lerCorpoDaConfig`):
 *   - o LIGA/DESLIGA (as quatro chaves) grava por UPSERT na PK, e o payload NÃO lista `modelo`
 *     nem `nicho_id` — o `ON CONFLICT DO UPDATE` só mexe nas colunas mandadas, e é isso que faz
 *     ligar ou desligar não apagar o modelo e o nicho;
 *   - o MODELO E O NICHO (`modelo`, `nicho_id`) gravam por UPDATE filtrado pela conta, e o payload NÃO
 *     lista `ativo` nem `ativado_*`. É UPDATE, e não upsert, para não criar linha: conta sem
 *     configuração não foi ligada, e gravar o modelo e o nicho não liga ninguém — 404.
 *
 * O 23503 tem DOIS donos, e a gravação diz qual é: no upsert do liga/desliga é a FK para
 * `tenants` (a conta não existe, 404); no UPDATE do modelo e do nicho a linha já existe, e o 23503 só
 * pode ser a FK composta `(modelo, nicho_id)` → `orcamentista_nicho(modelo, id)` — 409, dizendo
 * o que segura (`fraseDoParRecusado`), a convenção das rotas do catálogo.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'
import { listarTabelasDaConta, obterNicho, obterModeloENichoDaConta } from '@/lib/atendimentos-ia/repositorio'
import { fraseDasTabelasQueSeguram, nomeDaTabelaEmUso } from '@/utils/atendimentos-ia-catalogo'
import {
  ehModeloENicho,
  fraseDoParRecusado,
  leituraAceita,
  leituraRecusada,
  lerCorpoDaConfig,
  montarGravacao,
  montarGravacaoDoModeloENicho,
  type CorpoDoModeloENicho,
} from '@/utils/orcamentista-config'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  // A AUTORIZAÇÃO VEM ANTES DE TUDO: sem ela, nem o corpo é lido.
  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { tenantId } = req.query as { tenantId?: string }
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) {
    return res.status(400).json({ error: 'Conta inválida.' })
  }

  const leitura = lerCorpoDaConfig(req.body)
  // DOIS guardas explícitos: com `strictNullChecks` desligado, `if (!leitura.ok)` não estreita a
  // união — e o `tsc` acusa `leitura.erro` enquanto o jest passa verde.
  if (leituraRecusada(leitura)) return res.status(400).json({ error: leitura.erro })
  if (!leituraAceita(leitura)) return res.status(400).json({ error: 'Corpo inválido.' })

  if (ehModeloENicho(leitura.corpo)) return gravarModeloENicho(res, tenantId, leitura.corpo, caller.user_id)
  const corpo = leitura.corpo

  try {
    const { data: anterior, error: erroDeLeitura } = await supabaseAdmin
      .from('orcamentista_config')
      .select('ativo')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (erroDeLeitura) throw erroDeLeitura

    const linha = montarGravacao({
      tenantId,
      corpo,
      estavaAtivo: (anterior as { ativo?: boolean } | null)?.ativo === true,
      usuarioId: caller.user_id,
      agora: new Date().toISOString(),
    })

    const { data, error } = await supabaseAdmin
      .from('orcamentista_config')
      .upsert(linha, { onConflict: 'tenant_id' })
      .select('*')
      .single()
    if (error) {
      // 23503: a conta não existe (FK para `tenants`). 23514: uma CHECK do banco recusou.
      const codigo = (error as { code?: string }).code
      if (codigo === '23503') return res.status(404).json({ error: 'Conta não encontrada.' })
      if (codigo === '23514') return res.status(400).json({ error: 'O banco recusou a configuração: um dos valores está fora da regra.' })
      throw error
    }
    return res.status(200).json({ ok: true, config: data })
  } catch (err: unknown) {
    console.error('super-admin orcamentista PATCH:', (err as { message?: string })?.message ?? 'erro')
    return res.status(500).json({ error: 'Não foi possível gravar a configuração do Orçamentista.' })
  }
}

/**
 * O modelo e o nicho: UPDATE de `modelo` e `nicho_id` na linha DA conta, e nada mais.
 *
 * >>> TROCAR MODELO OU NICHO COM TABELA EM USO É RECUSADO (409), nomeando as tabelas <<<
 * É a ESCOLHA CONSERVADORA, a mesma postura do RESTRICT que o banco usa em toda esta área: nada
 * some por efeito colateral de um seletor. As tabelas em uso são de um fornecedor do nicho antigo,
 * e trocar o nicho por baixo delas deixaria a conta usando tabela de outro nicho. A alternativa —
 * apagar as tabelas na troca — NÃO foi feita. A decisão definitiva sobre o que a troca faz com as
 * tabelas da conta é do DONO DO PRODUTO, e está PENDENTE (EPIC §3.6). Até ela, a troca exige
 * remover as tabelas antes, uma a uma, pela tela.
 *
 * Regravar o MESMO modelo e o MESMO nicho não é troca, e passa. A conferência é da rota: o banco não tem
 * restrição entre `orcamentista_conta_tabela` e o nicho da conta.
 */
async function gravarModeloENicho(res: NextApiResponse, tenantId: string, corpo: CorpoDoModeloENicho, usuarioId: string) {
  try {
    const atual = await obterModeloENichoDaConta(tenantId)
    const troca = !!atual && (atual.modelo !== corpo.modelo || atual.nicho_id !== corpo.nicho_id)
    if (troca) {
      const emUso = await listarTabelasDaConta(tenantId)
      if (emUso.length > 0) {
        return res.status(409).json({ error: fraseDasTabelasQueSeguram(emUso), tabelas: emUso.map(nomeDaTabelaEmUso) })
      }
    }
    const { data, error } = await supabaseAdmin
      .from('orcamentista_config')
      .update(montarGravacaoDoModeloENicho({ corpo, usuarioId, agora: new Date().toISOString() }))
      .eq('tenant_id', tenantId)
      .select('*')
    if (error) {
      const codigo = (error as { code?: string }).code
      if (codigo === '23503' && corpo.modelo) {
        const nicho = corpo.nicho_id ? await obterNicho(corpo.nicho_id) : null
        return res.status(409).json({ error: fraseDoParRecusado(corpo.modelo, nicho) })
      }
      if (codigo === '23514') return res.status(400).json({ error: 'O banco recusou o modelo e o nicho: não há nicho sem modelo.' })
      throw error
    }
    const linhas = (data ?? []) as unknown[]
    if (linhas.length === 0) {
      return res.status(404).json({ error: 'Esta conta não tem o Atendimentos I.A. configurado. Ligue em Tenants primeiro.' })
    }
    return res.status(200).json({ ok: true, config: linhas[0] })
  } catch (err: unknown) {
    console.error('super-admin orcamentista PATCH modelo e nicho:', (err as { message?: string })?.message ?? 'erro')
    return res.status(500).json({ error: 'Não foi possível gravar o modelo e o nicho da conta.' })
  }
}
