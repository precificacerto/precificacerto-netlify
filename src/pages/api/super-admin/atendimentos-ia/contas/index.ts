/**
 * GET /api/super-admin/atendimentos-ia/contas — as contas com o Atendimentos I.A. LIGADO, com o
 * nome, o modelo e o nicho (modelo · nicho). Bloco 2C.1, 19/10/2026.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a lista de contas e a tela de configuração mostram APENAS o
 * nome/identificação da conta e a configuração do Atendimentos I.A. NADA do conteúdo da conta —
 * nem clientes, nem orçamentos, nem funcionários, nem valores. O super admin não tem tenant e não
 * pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * POR QUE UMA ROTA NOVA, e não `GET /api/super-admin/orcamentista`: aquela devolve as linhas de
 * `orcamentista_config` SEM o nome da conta — quem a lê, a lista de Tenants, já tem os nomes.
 * Pôr o nome lá faria a coluna do Atendimentos I.A. em Tenants depender de uma segunda leitura
 * (falhou o nome, a coluna inteira vira "indisponível"), e levaria para Tenants valor, teto e
 * quem ligou que esta lista não usa. A alternativa de juntar com `/api/super-admin/tenants` foi
 * descartada pela regra acima: aquela rota devolve `tenants.*`, e a tela receberia o cadastro
 * inteiro da conta para mostrar só o nome. Aqui a linha é montada campo a campo
 * (`listarContasLigadas`), e de `tenants` só se lê `id, name`.
 *
 * Só o super admin, checado antes de qualquer leitura. Lê com `service_role` pelo repositório,
 * o mesmo das rotas do catálogo.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { falhaInterna, listarContasLigadas } from '@/lib/atendimentos-ia/repositorio'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  try {
    return res.status(200).json(await listarContasLigadas())
  } catch (e) {
    return falhaInterna(res, 'contas GET', e, 'Não foi possível ler as contas ligadas.')
  }
}
