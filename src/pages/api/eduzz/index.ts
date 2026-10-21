/**
 * POST /api/eduzz — webhook de pagamento da Eduzz: em `invoice_paid`, cria a conta e o usuário do
 * comprador.
 *
 * ══ CORREÇÃO DE SEGURANÇA, 21/10/2026 ══
 * Até esta data a rota comparava `api_key !== process.env.NEXT_PUBLIC_EDUZZ_API_KEY`. Medido pelo
 * dono do produto: essa variável NÃO existe na Vercel. Sem ela, uma requisição SEM `api_key` virava
 * `undefined !== undefined` → falso → ACEITA — e a rota criava conta e usuário com
 * `is_super_admin: true`. Qualquer pessoa na internet podia se fazer super admin da plataforma.
 * (Já estava listado como CRÍT-2 em `SECURITY_AUDIT.md`.) Agora:
 *   - o segredo é de SERVIDOR: `EDUZZ_API_KEY`. Variável com prefixo `NEXT_PUBLIC_` é lida pelo
 *     navegador por definição, e a antiga NÃO é aceita nem como reserva;
 *   - variável AUSENTE (ou vazia) → 503, e NADA é processado. Falta de configuração nunca vira
 *     porta aberta;
 *   - a comparação é em TEMPO CONSTANTE: os dois lados passam por SHA-256 antes do
 *     `timingSafeEqual`, para terem o mesmo tamanho sem a comparação revelar o tamanho do segredo
 *     (o mesmo desenho da rota de captura, `src/pages/api/atendimentos-ia/captura.ts`);
 *   - a rota NUNCA cria super admin. A conta nasce com o comprador como admin DA PRÓPRIA CONTA,
 *     `is_super_admin: false` — promover a super admin não é coisa de webhook de pagamento.
 * Portão: `src/utils/__tests__/eduzz-sem-porta-aberta.test.ts`.
 */
import { METHODS } from '@/constants/http-methods'
import { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { supabaseAdmin } from '@/supabase/admin'

/** O nome da variável de SERVIDOR que guarda o segredo — sem o prefixo NEXT_PUBLIC_. */
export const VARIAVEL_DO_SEGREDO = 'EDUZZ_API_KEY'

/** O segredo da requisição contra a variável, em tempo constante. Vazio ou não-texto: não confere. */
function segredoConfere(recebido: unknown, esperado: string): boolean {
  if (typeof recebido !== 'string' || recebido === '') return false
  const a = crypto.createHash('sha256').update(recebido).digest()
  const b = crypto.createHash('sha256').update(esperado).digest()
  return crypto.timingSafeEqual(a, b)
}

export default async function webhook(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== METHODS.POST) {
    return res.status(405).json({ result: null, error: 'Método não autorizado!' })
  }

  // Lida a cada requisição, não no carregamento: a configuração é a de agora.
  const esperado = process.env[VARIAVEL_DO_SEGREDO]
  if (!esperado) {
    console.error(`[EDUZZ] recusado: ${VARIAVEL_DO_SEGREDO} não está configurada — nada foi processado.`)
    return res.status(503).json({ result: null, error: 'Integração Eduzz não configurada.' })
  }

  const { api_key, event_name, student_email } = (req.body ?? {}) as Record<string, unknown>
  if (!segredoConfere(api_key, esperado)) {
    return res.status(401).json({ result: null, error: 'Acesso negado! API Key inválida' })
  }

  try {
    if (event_name !== 'invoice_paid') {
      return res.status(200).json({
        result: null,
        error: null,
        message: `Sem suporte a eventos do tipo '${String(event_name)}'`,
      })
    }

    if (typeof student_email !== 'string' || !student_email.includes('@')) {
      return res.status(400).json({ result: null, error: 'student_email inválido.' })
    }

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', student_email)
      .maybeSingle()

    if (existingUser) {
      return res.status(200).json({
        result: null,
        error: 'Endereço de email já cadastrado!',
      })
    }

    const randomPassword = crypto.randomBytes(8).toString('hex')

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({ name: student_email.split('@')[0], email: student_email })
      .select('id')
      .single()

    if (tenantError) throw tenantError

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: student_email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { tenant_id: tenant.id, role: 'admin' },
    })

    if (authError) throw authError

    const { data: newUser, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUser.user.id,
        tenant_id: tenant.id,
        email: student_email,
        role: 'admin',
        is_active: true,
        // NUNCA true: o comprador é admin da PRÓPRIA conta, não da plataforma.
        is_super_admin: false,
      })
      .select()
      .single()

    if (userError) throw userError

    const { error: errMudo22 } = await supabaseAdmin.from('tenant_settings').insert({ tenant_id: tenant.id })
    if (errMudo22) throw errMudo22
    const { error: errMudo21 } = await supabaseAdmin.from('tenant_expense_config').insert({ tenant_id: tenant.id })
    if (errMudo21) throw errMudo21

    return res.json({
      result: { createdUser: newUser },
      error: null,
    })
  } catch (error) {
    console.error('Eduzz error:', error instanceof Error ? error.message : 'Unknown error')
    return res.status(500).json({ result: null, error: 'Erro inesperado!' })
  }
}
