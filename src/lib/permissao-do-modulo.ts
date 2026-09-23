/**
 * permissao-do-modulo.ts — a checagem de permissão de edição, em UM lugar.
 *
 * >>> POR QUE ESTE ARQUIVO EXISTE, E A COLISÃO QUE ELE RESOLVE <<<
 *
 * O comando do PO de 23/09/2026 diz duas coisas que não cabem juntas ao pé da letra:
 *
 *   §6.5: "IMPORTE a checagem de `getCallerContext` + `user_module_permissions.can_edit` no
 *          módulo `cash_flow` de `cash-entries.ts`; não copie."
 *   §9:   "Não mexa em `/api/delete/cash-entries`."
 *
 * Para IMPORTAR de `cash-entries.ts` seria preciso que ele EXPORTASSE a checagem — e ela
 * vive inline no handler. Ou se toca naquele arquivo, ou se copia o bloco para a rota nova.
 *
 * O desempate é `copia-divergente.md`, que o próprio §0 manda ler:
 *
 *   > E o remédio, quando ela existe, **não é conferir as duas**: é apagar uma.
 *
 * Então a checagem saiu do handler e virou este módulo, e as DUAS rotas o leem. O
 * comportamento de `/api/delete/cash-entries` não muda em nada — mesmas consultas, mesmos
 * códigos, mesmas mensagens; o que mudou é de onde o código vem. A alternativa era ter a
 * regra escrita duas vezes, e a segunda deixaria de ser atualizada na primeira mudança de
 * papel ou de módulo.
 *
 * ISTO ESTÁ DECLARADO NO CORPO DO PR, com destaque, para que a escolha seja do PO e não
 * minha por omissão.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'

export interface ChamadorAutorizado {
  tenant_id: string
  user_id: string
  role?: string | null
  is_super_admin?: boolean | null
}

/**
 * O chamador pode editar aquele módulo?
 *
 * Admin e super admin passam direto; os demais dependem de `can_edit` em
 * `user_module_permissions`. É a checagem que vivia inline em `cash-entries.ts`, trazida
 * VERBATIM — mesmas colunas, mesmo filtro, mesma resposta para dado ausente.
 *
 * Ela NÃO responde ao cliente nem decide a ORDEM das verificações: quem chama escolhe se o
 * 404 vem antes ou depois do 403. Isso importa porque as duas rotas já tinham ordens
 * diferentes, e uniformizá-las aqui mudaria o código devolvido em casos que ninguém pediu
 * para mudar.
 */
export async function podeEditarModulo(
  caller: ChamadorAutorizado,
  modulo: string,
): Promise<boolean> {
  if (caller.is_super_admin || caller.role === 'admin') return true
  const { data: perms } = await supabaseAdmin
    .from('user_module_permissions')
    .select('can_edit')
    .eq('user_id', caller.user_id)
    .eq('tenant_id', caller.tenant_id)
    .eq('module', modulo)
    .single()
  return !!perms?.can_edit
}

/**
 * O atalho para quem quer o caminho completo: resolve o chamador, confere e responde 403.
 *
 * Devolve `null` quando JÁ respondeu ao cliente — `getCallerContext` responde sozinho no
 * caso dele, e o 403 é respondido aqui.
 */
export async function exigirPermissaoDeEdicao(
  req: NextApiRequest,
  res: NextApiResponse,
  modulo: string,
  mensagemDo403: string,
): Promise<ChamadorAutorizado | null> {
  const caller = await getCallerContext(req, res)
  if (!caller) return null
  const permitido = await podeEditarModulo(caller as ChamadorAutorizado, modulo)
  if (!permitido) {
    res.status(403).json({ error: mensagemDo403 })
    return null
  }
  return caller as ChamadorAutorizado
}
