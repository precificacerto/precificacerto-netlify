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
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'
import { leituraAceita, leituraRecusada, lerCorpoDaConfig, montarGravacao } from '@/utils/orcamentista-config'

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

  try {
    const { data: anterior, error: erroDeLeitura } = await supabaseAdmin
      .from('orcamentista_config')
      .select('ativo')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (erroDeLeitura) throw erroDeLeitura

    const linha = montarGravacao({
      tenantId,
      corpo: leitura.corpo,
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
