/**
 * cash-entry-series.ts — a exclusão de SÉRIE, e o veto quando alguma parcela foi paga.
 *
 * Comando do PO de 23/09/2026, §6.
 *
 * >>> A CLASSIFICAÇÃO É AQUI, SOBRE A SÉRIE RELIDA <<<
 *
 *   > A tela não manda lista de ids: lista montada no cliente é a que apaga a parcela que
 *   > alguém pagou entre o clique e o confirm.
 *
 * O corpo aceita `id` e `escopo`, e mais nada. Quem decide quais lançamentos saem é
 * `classificarExclusao`, sobre o que o banco devolve NESTE instante.
 *
 * >>> NUNCA `DELETE` <<<
 *
 * A exclusão desta base é `is_active = false`, e há telas que contam com isso. Um `delete()`
 * aqui não quebraria nada hoje e levaria o histórico junto.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { exigirPermissaoDeEdicao } from '@/lib/permissao-do-modulo'
import {
  classificarExclusao,
  notaDeveSerDesativada,
  vinculoDaSerie,
  type EscopoDaExclusao,
  type LancamentoDaSerie,
} from '@/utils/serie-e-estorno'

const ESCOPOS: EscopoDaExclusao[] = ['SERIE', 'SO_ESTE']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { id, escopo } = req.body as { id?: string; escopo?: EscopoDaExclusao }
  if (!id) return res.status(400).json({ error: 'id é obrigatório' })
  if (!escopo || !ESCOPOS.includes(escopo)) {
    return res.status(400).json({ error: "escopo deve ser 'SERIE' ou 'SO_ESTE'" })
  }

  try {
    const caller = await exigirPermissaoDeEdicao(
      req, res, 'cash_flow', 'Sem permissão para excluir lançamentos',
    )
    if (!caller) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any

    const { data: alvo } = await admin
      .from('cash_entries')
      .select('id, tenant_id, origin_type, purchase_invoice_id, installment_group_id, due_date, amount, paid_date, is_active')
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
      .single()

    if (!alvo) return res.status(404).json({ error: 'Lançamento não encontrado' })

    /*
      LANÇAMENTO DE VENDA CONTINUA FORA.
      A decisão registrada no Fluxo de Caixa segue de pé: caixa e venda não podem discordar
      sobre o mesmo fato, e por isso a venda se exclui pela venda. Aceitar aqui abriria a
      porta que aquele comentário fechou.
    */
    if (alvo.origin_type === 'SALE') {
      return res.status(409).json({
        error: 'Lançamento de venda se exclui pela venda, em "Excluir venda".',
      })
    }

    /*
      A SÉRIE, na ordem do §6.2: nota → grupo → sozinho.
      `vinculoDaSerie` é a mesma função que a tela usa para decidir o texto do aviso — se
      cada lado tivesse a sua, o usuário leria "só ele será excluído" e cinco sairiam.
    */
    const vinculo = vinculoDaSerie(alvo)
    let serie: LancamentoDaSerie[] = [alvo as LancamentoDaSerie]

    if (vinculo !== 'SOZINHO') {
      const coluna = vinculo === 'NOTA' ? 'purchase_invoice_id' : 'installment_group_id'
      const valor = vinculo === 'NOTA' ? alvo.purchase_invoice_id : alvo.installment_group_id
      const { data: irmas } = await admin
        .from('cash_entries')
        .select('id, due_date, amount, paid_date, is_active')
        .eq('tenant_id', caller.tenant_id)
        .eq(coluna, valor)
      if (irmas?.length) serie = irmas as LancamentoDaSerie[]
    }

    const decisao = classificarExclusao({ escopo, serie, alvo: id })

    if (!decisao.permitido) {
      // 409, e NADA é desativado. Não é o código que protege o dado: é `aDesativar` vazio.
      return res.status(409).json({
        error: decisao.motivo === 'ALVO_PAGO'
          ? 'Este vencimento está pago. Use "Estornar" para desfazer o pagamento.'
          : 'A série tem parcela paga. Exclua só o vencimento pendente, ou estorne a paga.',
        motivo: decisao.motivo,
        desativadas: 0,
        pagas: decisao.pagas,
        nota_desativada: false,
      })
    }

    const { error: erroUpdate } = await admin
      .from('cash_entries')
      .update({ is_active: false })
      .in('id', decisao.aDesativar)
      .eq('tenant_id', caller.tenant_id)
    if (erroUpdate) throw erroUpdate

    /*
      §6.4 — A NOTA SÓ CAI QUANDO NÃO SOBRA NADA ATIVO APONTANDO PARA ELA.
      Sobrou parcela paga, a nota fica INTEIRA, com o crédito inteiro: o crédito é da entrada
      da mercadoria, não da parcela, e reduzi-lo proporcionalmente inventaria um rateio que a
      lei não faz.
    */
    let notaDesativada = false
    if (alvo.purchase_invoice_id) {
      const { count } = await admin
        .from('cash_entries')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', caller.tenant_id)
        .eq('purchase_invoice_id', alvo.purchase_invoice_id)
        .neq('is_active', false)
      if (notaDeveSerDesativada(count ?? 0)) {
        const { error: erroNota } = await admin
          .from('purchase_invoices')
          // `deactivated_at`, e não `is_active`: a coluna não existia, e a data diz QUANDO
          // a nota saiu. Ver o cabeçalho da migração `20260923000003`.
          .update({ deactivated_at: new Date().toISOString().slice(0, 10) })
          .eq('id', alvo.purchase_invoice_id)
          .eq('tenant_id', caller.tenant_id)
        if (erroNota) throw erroNota
        notaDesativada = true
      }
    }

    return res.status(200).json({
      desativadas: decisao.aDesativar.length,
      pagas: decisao.pagas,
      nota_desativada: notaDesativada,
    })
  } catch (error: any) {
    console.error('Deactivate cash entry series error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao desativar a série' })
  }
}
