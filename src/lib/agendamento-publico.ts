/**
 * agendamento-publico.ts — o que as rotas públicas podem saber, e nada além disso.
 *
 * Comando do PO de 06/10/2026, fase 2. Regra inviolável, registrada como está:
 *
 *   "Cada prestador de serviço vai ter uma tenant. Nunca pode ter nenhuma integração ou de
 *    informação. Nada. Nunca."
 *
 * >>> O TENANT SAI DO TOKEN. SEMPRE. SÓ. <<<
 *
 * Nenhuma função daqui aceita `tenant_id` como argumento de quem chama: ele é RESOLVIDO do token
 * e devolvido junto com o resto. Se as rotas pudessem receber o tenant, bastaria um parâmetro na
 * query para um cliente ler a agenda de outro salão — e o pior é que funcionaria, porque o
 * `supabaseAdmin` passa por cima da RLS.
 *
 * >>> POR QUE ESTE MÓDULO EXISTE, em vez de cada rota resolver o seu <<<
 *
 * São quatro rotas que precisam do mesmo tenant, do mesmo critério de barbeiro ativo e da mesma
 * amarração de serviço. Quatro cópias do critério divergiriam, e a divergência apareceria como
 * uma rota listando um barbeiro que outra recusa — `copia-divergente.md`, cujo remédio é apagar
 * as cópias, não conferi-las.
 */

import { supabaseAdmin } from '@/supabase/admin'
import { funcionarioAceitaAgendamento } from '@/utils/agendamento-config'
import { onlyPhoneDigits } from '@/utils/phone-br'

/** O corpo que TODA recusa pública devolve. Um só, e genérico. */
export const CORPO_INDISPONIVEL = { error: 'Agendamento indisponível.' } as const

export interface ContextoPublico {
  tenant_id: string
  grid_minutes: number
  lead_time_min: number
  horizon_days: number
  msg_confirmacao: string | null
  // >>> AS DUAS MENSAGENS NOVAS SÃO DA FASE 2B <<<
  // Elas vêm da MESMA consulta que o resto do contexto. Uma segunda consulta dentro das rotas de
  // cancelar e remarcar seriam duas cópias do critério de resolução do tenant, e a divergência
  // apareceria como uma rota usando o texto do tenant e outra caindo no padrão.
  msg_cancelamento: string | null
  msg_alteracao: string | null
  empresa: string
}

/**
 * Resolve o tenant a partir do token, ou devolve `null`.
 *
 * >>> TOKEN INEXISTENTE E TOKEN DESLIGADO DÃO O MESMO `null` <<<
 *
 * Não é economia de código: distinguir os dois na resposta diria a quem varre tokens que AQUELE
 * existe. Com a resposta idêntica, acertar um token desligado é indistinguível de errar o token,
 * e varrer não rende informação. O filtro `is_enabled` está na própria consulta justamente para
 * que não exista um ramo "existe mas está off" por onde a diferença possa escapar.
 */
export async function contextoDoToken(token: unknown): Promise<ContextoPublico | null> {
  const t = typeof token === 'string' ? token.trim() : ''
  // O token é `base64url` de 16 bytes = 22 caracteres. A guarda evita consulta com lixo e,
  // principalmente, evita que um token absurdamente longo vire carga no banco.
  if (!t || t.length > 64 || !/^[A-Za-z0-9_-]+$/.test(t)) return null

  const { data, error } = await supabaseAdmin
    .from('tenant_booking_settings')
    .select('tenant_id, grid_minutes, lead_time_min, horizon_days, msg_confirmacao, msg_cancelamento, msg_alteracao')
    .eq('public_token', t)
    .eq('is_enabled', true)
    .maybeSingle()
  if (error || !data) return null

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name')
    .eq('id', (data as any).tenant_id)
    .maybeSingle()

  return {
    tenant_id: (data as any).tenant_id,
    grid_minutes: (data as any).grid_minutes,
    lead_time_min: (data as any).lead_time_min,
    horizon_days: (data as any).horizon_days,
    msg_confirmacao: (data as any).msg_confirmacao ?? null,
    msg_cancelamento: (data as any).msg_cancelamento ?? null,
    msg_alteracao: (data as any).msg_alteracao ?? null,
    empresa: (tenant as any)?.name ?? 'Agendamento',
  }
}

export interface BarbeiroPublico { id: string; nome: string }

/**
 * Os barbeiros que o link oferece: ATIVOS no cadastro E com ao menos uma faixa ativa.
 *
 * O critério de "aceita agendamento pelo link" é `funcionarioAceitaAgendamento`, a MESMA função
 * que o painel usa para desenhar o switch. Reescrevê-lo aqui faria a tela interna dizer uma coisa
 * e o link outra, e o dono do salão não teria como saber qual das duas está certa.
 *
 * A resposta traz `id` e `nome`. Nada mais — nem telefone, nem e-mail, nem cargo.
 */
export async function barbeirosDoLink(tenant_id: string): Promise<BarbeiroPublico[]> {
  const { data: emps, error: e1 } = await supabaseAdmin
    .from('employees')
    .select('id, name')
    .eq('tenant_id', tenant_id)
    .eq('status', 'ACTIVE')
    .order('name')
  if (e1) throw e1

  const { data: faixas, error: e2 } = await supabaseAdmin
    .from('employee_working_hours')
    .select('employee_id, weekday, start_time, end_time, is_active')
    .eq('tenant_id', tenant_id)
  if (e2) throw e2

  const porEmp = new Map<string, any[]>()
  for (const f of (faixas ?? []) as any[]) {
    if (!porEmp.has(f.employee_id)) porEmp.set(f.employee_id, [])
    porEmp.get(f.employee_id)!.push(f)
  }

  return ((emps ?? []) as any[])
    .filter((e) => funcionarioAceitaAgendamento(porEmp.get(e.id) ?? []))
    .map((e) => ({ id: e.id, nome: e.name }))
}

/** O barbeiro pertence a este tenant E aceita agendamento? Toda rota passa por aqui. */
export async function barbeiroValido(tenant_id: string, employee_id: unknown): Promise<string | null> {
  const id = typeof employee_id === 'string' ? employee_id.trim() : ''
  if (!id) return null
  const lista = await barbeirosDoLink(tenant_id)
  return lista.some((b) => b.id === id) ? id : null
}

export interface ServicoPublico { id: string; nome: string; duracaoMin: number }

/**
 * Os serviços do barbeiro, pela amarração que o sistema JÁ usa:
 *   employees → employee_commission_tables → commission_tables (type='SERVICE') → services
 *
 * >>> COM DUAS TABELAS DE SERVIÇO, A ROTA RECUSA EM VEZ DE ESCOLHER <<<
 *
 * A tela interna escolhe a primeira (`agenda/index.tsx`), e ali há um humano conferindo o preço
 * antes de salvar. Aqui não há: adivinhar a tabela ofereceria ao cliente um preço que o salão não
 * cobra, e ele chegaria esperando pagar aquilo. `null` sobe como recusa genérica.
 */
export async function servicosDoBarbeiro(
  tenant_id: string, employee_id: string,
): Promise<ServicoPublico[] | null> {
  const { data: vinc, error: e1 } = await supabaseAdmin
    .from('employee_commission_tables')
    .select('commission_tables(id, type)')
    .eq('tenant_id', tenant_id)
    .eq('employee_id', employee_id)
  if (e1) throw e1

  const deServico = ((vinc ?? []) as any[])
    .map((r) => r.commission_tables)
    .filter((t) => t && t.type === 'SERVICE')

  if (deServico.length !== 1) return null   // zero ou ambígua: recusa

  const { data: svcs, error: e2 } = await supabaseAdmin
    .from('services')
    .select('id, name, estimated_duration_minutes')
    .eq('tenant_id', tenant_id)
    .eq('commission_table_id', deServico[0].id)
    .eq('status', 'ACTIVE')
    .order('name')
  if (e2) throw e2

  // `estimated_duration_minutes` é a fonte da duração (premissa (c) da fase 1). Serviço sem
  // duração NÃO entra na lista: oferecê-lo exigiria inventar um número, e um número inventado
  // aqui vira horário oferecido errado (`ausente-vs-falso.md`).
  return ((svcs ?? []) as any[])
    .filter((s) => Number(s.estimated_duration_minutes) > 0)
    .map((s) => ({ id: s.id, nome: s.name, duracaoMin: Number(s.estimated_duration_minutes) }))
}

/** O telefone no formato que o repositório grava: 11 dígitos, SEM DDI. Ver `phone-br.ts`. */
export function telefoneCanonico(raw: unknown): string {
  return onlyPhoneDigits(String(raw ?? ''))
}

/** Sanitiza texto livre que vai ao banco: sem controle, sem excesso. */
export function textoCurto(raw: unknown, max: number): string {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// FASE 2B — O ENVIO, MOVIDO PARA CÁ E GENERALIZADO
//
// >>> ELE MORAVA EM `agendar.ts` COMO `enviarConfirmacao`, E A MUDANÇA FOI AUTORIZADA <<<
//
// A Fase 2B manda quatro mensagens, não uma: confirmação, cancelamento ao cliente,
// cancelamento ao barbeiro, alteração aos dois. Deixar a função em `agendar.ts` obrigaria as
// rotas novas a escrever a segunda cópia do envio — `copia-divergente.md` nascendo com quatro
// produtores do mesmo gesto.
//
// Decisão do dono do produto: *"Crie src/lib/agendamento-publico.ts e mova para la a funcao de
// envio, generalizada. agendar.ts passa a IMPORTAR. Nao duplique, nao deixe a antiga la."*
// Este arquivo já existia desde a Fase 2, então a função foi acrescentada a ele.
//
// >>> E ELA DEVOLVE `{ enviado }` EM VEZ DE SÓ RETORNAR <<<
//
// A antiga era `Promise<void>`: dava `return` silencioso quando o tenant não tinha token, e
// jogava quando o WUZAPI recusava. Quem chamava não tinha como distinguir "mandou" de "não
// mandou por falta de token" — e sem essa distinção o array `avisos` do cancelamento não tem o
// que registrar, e voltamos à falha muda que três rodadas desta campanha fecharam.
// ═════════════════════════════════════════════════════════════════════════════════════════

import { aplicarVariaveis, textoOuPadrao } from '@/utils/mensagens-agendamento-padrao'
import { sendWuzapiText } from '@/lib/wuzapi-send'

export type ResultadoDoEnvio = {
  enviado: boolean
  /** Por que não foi. Para o LOG e para o array `avisos` — nunca para a resposta HTTP. */
  motivo?: 'sem_token' | 'sem_telefone' | 'falha_no_envio'
}

/**
 * Resolve o token WUZAPI do tenant e manda o texto.
 *
 * Tenant sem token NÃO é erro: devolve `{ enviado: false, motivo: 'sem_token' }` e o fluxo
 * segue. É a regra que a Fase 2 já tinha — um salão sem WhatsApp configurado continua
 * agendando —, agora dizível em vez de silenciosa.
 */
export async function enviarMensagemDoAgendamento(params: {
  tenantId: string
  telefone: string
  /** O template do tenant, ou `null` para cair no padrão. */
  texto: string | null
  vars: Record<string, string>
  /** A constante de fallback, passada de FORA: é ela que diz qual das quatro mensagens é. */
  padrao: string
}): Promise<ResultadoDoEnvio> {
  const telefone = telefoneCanonico(params?.telefone)
  // Barbeiro sem telefone cadastrado é o caso REAL em produção — 1 de 16 funcionários tem o
  // campo preenchido, medido em 08/10/2026. Ele não derruba nada: vira aviso.
  if (telefone.length < 10) return { enviado: false, motivo: 'sem_telefone' }

  const { data: settings } = await supabaseAdmin
    .from('tenant_settings')
    .select('whatsapp_instance_mode, whatsapp_shared_instance_user_id')
    .eq('tenant_id', params.tenantId)
    .maybeSingle()

  const modo = (settings as any)?.whatsapp_instance_mode || 'OWN'
  const dono = (settings as any)?.whatsapp_shared_instance_user_id ?? null
  let token: string | null = null

  if (modo === 'SHARED' && dono) {
    const { data: u } = await supabaseAdmin
      .from('users').select('wuzapi_token').eq('id', dono).eq('tenant_id', params.tenantId).maybeSingle()
    token = (u as any)?.wuzapi_token ?? null
  }
  if (!token) {
    const { data: qualquer } = await supabaseAdmin
      .from('users').select('wuzapi_token').eq('tenant_id', params.tenantId)
      .not('wuzapi_token', 'is', null).limit(1).maybeSingle()
    token = (qualquer as any)?.wuzapi_token ?? null
  }
  if (!token) return { enviado: false, motivo: 'sem_token' }

  // >>> UMA FUNÇÃO SÓ FAZ A INTERPOLAÇÃO E A LIMPEZA, E ESTE É O ÚNICO PONTO QUE A CHAMA <<<
  //
  // As quatro mensagens da Fase 2B, mais a do código, passam por aqui — então `aplicarVariaveis`
  // vale para as três editáveis sem que nenhuma rota precise lembrar de chamá-la. O comando de
  // 09/10/2026 pede *"uma unica funcao faz isso, usada pelos tres"*: a função é dela, e o ponto
  // de uso é este. Uma segunda chamada numa rota seria `copia-divergente.md` nascendo.
  //
  // O laço sequencial que havia aqui (`split(...).join(v)` por variável) saiu: ele deixava o
  // literal `{algo}` no texto quando a variável não tinha valor, e reexaminava o resultado de
  // cada substituição. A razão completa está no cabeçalho de `aplicarVariaveis`.
  const texto = aplicarVariaveis(textoOuPadrao(params.texto, params.padrao), params.vars ?? {})

  const r = await sendWuzapiText(token, telefone, texto)
  // O cast existe porque o `tsconfig.json` deste repositório tem `strictNullChecks: false`, e
  // com ele desligado o TypeScript não estreita união discriminada por literal booleano —
  // `r.error` não existe no tipo da união. É o mesmo motivo das guardas `faixaRecusada` e
  // `ausenciaRecusada`; aqui é um ponto só, então o cast local basta.
  if (!r.success) return { enviado: false, motivo: 'falha_no_envio' }
  return { enviado: true }
}

/** O nome do profissional, para interpolar nas mensagens. Vazio quando não achar. */
export async function nomeDoBarbeiro(tenant_id: string, employee_id: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('employees').select('name').eq('tenant_id', tenant_id).eq('id', employee_id).maybeSingle()
  return (data as any)?.name ?? ''
}

/**
 * O telefone do profissional, para o aviso da Fase 2B.
 *
 * >>> ELE É VAZIO EM PRODUÇÃO, E ISSO FOI MEDIDO <<<
 * 08/10/2026: 0 de 5 funcionários do Salão Eliane têm `phone` preenchido, e 1 de 16 no
 * repositório inteiro. O caminho "sem telefone" NÃO é exceção — é o normal, e é o primeiro
 * caso do portão. Nenhuma trava nova nasceu disso: cancelar não exige telefone do barbeiro.
 */
export async function telefoneDoBarbeiro(tenant_id: string, employee_id: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('employees').select('phone').eq('tenant_id', tenant_id).eq('id', employee_id).maybeSingle()
  return telefoneCanonico((data as any)?.phone)
}
