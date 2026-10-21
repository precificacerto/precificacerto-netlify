/**
 * /api/eduzz — INTEGRAÇÃO COM A EDUZZ DESCONTINUADA em 21/10/2026 (dono do produto, PR #113).
 *
 * Responde 410 Gone SEMPRE, em todo método e com qualquer corpo, e não emite NENHUMA operação:
 * nem leitura de banco, nem escrita, nem criação de usuário.
 *
 * ══ POR QUE FOI DESCONTINUADA ══
 * Era o CRÍT-2 de `SECURITY_AUDIT.md`. A rota comparava `api_key !== process.env.NEXT_PUBLIC_EDUZZ_API_KEY`,
 * e essa variável NÃO existia na Vercel (medido em 21/10/2026). Sem ela, uma requisição SEM
 * `api_key` virava `undefined !== undefined` → falso → ACEITA, e a rota criava conta e usuário com
 * `is_super_admin: true`: qualquer pessoa na internet se fazia super admin da plataforma com um POST.
 *
 * ══ A MEDIÇÃO QUE MOSTROU O DESUSO (21/10/2026) ══
 *   - nenhuma tela, rota ou plano do repositório dependia dela; a cobrança que roda é a da Stripe;
 *   - logs de produção dos últimos 3 dias, agrupados por caminho: ZERO requisições a `/api/eduzz`;
 *   - e ela não podia estar funcionando: sem a variável, a requisição LEGÍTIMA, com `api_key`
 *     preenchida, era recusada com 401 — só passava a requisição sem credencial.
 *
 * ══ SE UM DIA VOLTAR ══
 * Volta COM AUTENTICAÇÃO — segredo de servidor (sem o prefixo `NEXT_PUBLIC_`, que o navegador lê),
 * 503 quando ele não estiver configurado, comparação em tempo constante — e SEM CRIAR SUPER ADMIN:
 * o comprador é admin da própria conta, não da plataforma. A versão assim corrigida está no
 * histórico deste arquivo (commit `8e6fdd2`). Nenhuma variável `EDUZZ_API_KEY` ou
 * `NEXT_PUBLIC_EDUZZ_API_KEY` deve ser criada para a rota fechada: ela não precisa de nenhuma.
 *
 * Portão: `src/utils/__tests__/eduzz-sem-porta-aberta.test.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

export const MENSAGEM_DE_DESCONTINUADA = 'A integração com a Eduzz foi descontinuada.'

export default async function eduzzDescontinuada(_req: NextApiRequest, res: NextApiResponse) {
  return res.status(410).json({ result: null, error: MENSAGEM_DE_DESCONTINUADA })
}
