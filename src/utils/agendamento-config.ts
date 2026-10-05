/**
 * agendamento-config.ts — as REGRAS da configuração do agendamento público, fase 1.
 *
 * Comando do PO de 05/10/2026. Esta fase NÃO cria rota pública: ela cria a configuração que a
 * fase 2 vai ler. Exposição zero ao fim da rodada, de propósito — a porta nasce no mesmo
 * commit que a fechadura.
 *
 * >>> POR QUE ESTAS FUNÇÕES SÃO PURAS E VIVEM AQUI <<<
 *
 * Cada uma delas vai ser lida DUAS VEZES: pela tela de configuração (fase 1) e pela rota
 * pública (fase 2). O critério escrito duas vezes divergiria, e a divergência apareceria como
 * horário oferecido ao cliente que o barbeiro não trabalha — `copia-divergente.md`.
 *
 * E são puras para que o caso afirme o EFEITO — a recusa, o número — em vez de afirmar que a
 * tela chamou alguma coisa (`teste-que-nao-exercita.md`).
 */

// ═════════════════════════════════════════════════════════════════════════════════════════
// A CONVENÇÃO DO DIA DA SEMANA — e ela é uma ARMADILHA deste repositório
// ═════════════════════════════════════════════════════════════════════════════════════════

/**
 * `weekday` é **0 = DOMINGO … 6 = SÁBADO**.
 *
 * >>> ATENÇÃO: O MESMO ARQUIVO DA AGENDA USA A CONVENÇÃO CONTRÁRIA <<<
 *
 * `agenda/index.tsx:152` declara `recurWeekdays` como `0=Mon..6=Sun` — é a recorrência de
 * EVENTO, baseada em `isoWeekday`. São dois vocabulários para "dia da semana" no mesmo
 * produto, e trocá-los desloca a grade em um dia sem erro nenhum: o barbeiro que trabalha
 * segunda apareceria disponível no domingo.
 *
 * Esta é 0=Domingo porque é a de `Date.getDay()` e a de `EXTRACT(DOW)` do Postgres, que são
 * as duas pontas que vão ler a coluna — a do navegador montando a grade e a do SQL filtrando
 * por dia. Alinhar com o `recurWeekdays` obrigaria a converter nas duas pontas.
 *
 * A constante existe para que a conversão, quando precisar acontecer, aconteça num lugar só.
 */
export const WEEKDAY_DOMINGO = 0
export const WEEKDAY_SABADO = 6

/** Os sete dias, na ordem da coluna, com o rótulo que a tela mostra. */
export const DIAS_DA_SEMANA = [
  { weekday: 0, label: 'Domingo', curto: 'Dom' },
  { weekday: 1, label: 'Segunda', curto: 'Seg' },
  { weekday: 2, label: 'Terça', curto: 'Ter' },
  { weekday: 3, label: 'Quarta', curto: 'Qua' },
  { weekday: 4, label: 'Quinta', curto: 'Qui' },
  { weekday: 5, label: 'Sexta', curto: 'Sex' },
  { weekday: 6, label: 'Sábado', curto: 'Sáb' },
] as const

/**
 * Converte o `recurWeekdays` da agenda (0=Mon..6=Sun) para esta convenção (0=Sun..6=Sat).
 *
 * Não é usada na fase 1 — existe porque a fase 2 vai cruzar a grade com a recorrência de
 * evento, e nessa hora a conversão tem de sair daqui e não ser reescrita inline.
 */
export function deRecurWeekdayParaWeekday(recur: number): number {
  return (recur + 1) % 7
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// §1 — A TABELA DE SERVIÇO DO BARBEIRO: UMA, e os TRÊS estados possíveis
// ═════════════════════════════════════════════════════════════════════════════════════════

export interface TabelaDeComissao {
  id: string
  name: string
  type: string
}

export type ResolucaoDaTabela =
  | { estado: 'UMA'; tabela: TabelaDeComissao }
  | { estado: 'NENHUMA'; tabelas: [] }
  | { estado: 'AMBIGUA'; tabelas: TabelaDeComissao[] }

/**
 * A tabela de SERVIÇO de um funcionário — e os três estados são TRÊS, não dois.
 *
 * >>> POR QUE `NENHUMA` E `AMBIGUA` NÃO PODEM COLAPSAR EM "ERRO" <<<
 *
 * As duas impedem o agendamento, mas pedem ações opostas de quem configura: `NENHUMA` é
 * "vincule uma tabela a este barbeiro"; `AMBIGUA` é "escolha qual das duas". Uma mensagem só
 * para as duas manda o dono do salão procurar o problema errado.
 *
 * >>> E POR QUE NÃO ESCOLHER A PRIMEIRA <<<
 *
 * `agenda/index.tsx:1287` faz `serviceTables[0]?.id` — a tela INTERNA escolhe a primeira
 * quando há várias. Ali um humano confere o preço antes de salvar. Na rota pública da fase 2
 * não há humano: adivinhar a tabela ofereceria ao cliente um preço que o salão não cobra, e
 * ele chegaria esperando pagar aquilo. Daí a fase 2 RECUSAR, e daí este tipo não ter um ramo
 * "primeira".
 *
 * `type` é comparado com `'SERVICE'` porque é o que `employee_commission_tables` guarda — a
 * de `'PRODUCT'` é separada e não participa do agendamento (§1 do comando).
 */
export function resolverTabelaDeServico(tabelas: readonly TabelaDeComissao[]): ResolucaoDaTabela {
  const deServico = tabelas.filter((t) => t?.type === 'SERVICE')
  if (deServico.length === 0) return { estado: 'NENHUMA', tabelas: [] }
  if (deServico.length === 1) return { estado: 'UMA', tabela: deServico[0] }
  return { estado: 'AMBIGUA', tabelas: deServico }
}

/** O aviso que a tela de configuração mostra para cada estado. `null` = nada a avisar. */
export function avisoDaTabelaDeServico(r: ResolucaoDaTabela): string | null {
  if (r.estado === 'UMA') return null
  if (r.estado === 'NENHUMA') {
    return 'Este profissional não tem tabela de comissão de SERVIÇO vinculada — ele não poderá '
      + 'receber agendamentos pelo link. Vincule uma em Comissões.'
  }
  return `Este profissional tem ${r.tabelas.length} tabelas de SERVIÇO vinculadas `
    + `(${r.tabelas.map((t) => t.name).join(', ')}). O link não vai oferecer os serviços dele `
    + 'até que sobre uma só — com duas, o preço oferecido seria um palpite.'
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// §3a — AS FAIXAS DE HORÁRIO, e a recusa de sobreposição
// ═════════════════════════════════════════════════════════════════════════════════════════

export interface FaixaDeHorario {
  /** `HH:mm` ou `HH:mm:ss` — o que a coluna `time` do Postgres devolve. */
  start_time: string
  end_time: string
  weekday: number
  /** Presente nas faixas já gravadas; ausente na que está sendo criada. */
  id?: string
  is_active?: boolean
}

/** `HH:mm[:ss]` → minutos desde a meia-noite. `NaN` para entrada que não é hora. */
export function horaParaMinutos(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(hhmm ?? '').trim())
  if (!m) return NaN
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return NaN
  return h * 60 + min
}

export type MotivoDaRecusa =
  | 'HORA_INVALIDA'
  | 'FIM_ANTES_DO_INICIO'
  | 'SOBREPOSICAO'

export type ValidacaoDaFaixa =
  | { ok: true }
  | { ok: false; motivo: MotivoDaRecusa; mensagem: string; conflito?: FaixaDeHorario }

export type FaixaRecusada = Extract<ValidacaoDaFaixa, { ok: false }>

/**
 * A faixa foi recusada?
 *
 * >>> ESTA GUARDA EXISTE POR UMA RAZÃO MEDIDA, NÃO POR GOSTO <<<
 *
 * O `tsconfig.json` deste repositório tem `strictNullChecks: false`, e com ele DESLIGADO o
 * TypeScript não estreita união discriminada por literal booleano: `if (!r.ok) r.mensagem`
 * falha com `TS2339: Property 'mensagem' does not exist on type 'ValidacaoDaFaixa'`. Medido ao
 * escrever o painel.
 *
 * A guarda de usuário (`v is ...`) estreita independentemente disso, e mantém o tipo honesto —
 * a alternativa seria tornar `mensagem` e `motivo` opcionais no ramo de sucesso, que é
 * `construtor-empobrecido.md`: campo opcional em contrato que decide comportamento.
 */
export function faixaRecusada(v: ValidacaoDaFaixa): v is FaixaRecusada {
  return v?.ok === false
}

/**
 * A faixa nova pode ser gravada para este funcionário neste dia?
 *
 * >>> A SOBREPOSIÇÃO É RECUSADA PELA ARITMÉTICA DOS MINUTOS, não por comparação de string <<<
 *
 * `'09:00' < '10:00'` funciona por acaso em string, e `'9:00' < '10:00'` é `false` — a forma
 * sem zero à esquerda inverte a comparação e a sobreposição passa. `horaParaMinutos` é a
 * travessia única, e é ela que recusa `'25:00'` e `'09:70'` em vez de aceitá-los como texto.
 *
 * O critério de sobreposição é `inicioA < fimB && inicioB < fimA` — com `<` e não `<=`, porque
 * faixa que ENCOSTA não sobrepõe: 09:00–12:00 e 12:00–18:00 são os dois turnos do barbeiro que
 * para para o almoço, e recusá-los tornaria a tabela inútil justamente no caso que ela existe
 * para representar (§2 do comando: "dois turnos no mesmo dia = duas linhas").
 *
 * `is_active = false` NÃO entra na checagem: faixa desativada não ocupa horário, e bloquear
 * contra ela obrigaria o dono a apagar para poder recadastrar.
 */
export function validarFaixa(
  nova: FaixaDeHorario,
  existentes: readonly FaixaDeHorario[],
): ValidacaoDaFaixa {
  const ini = horaParaMinutos(nova.start_time)
  const fim = horaParaMinutos(nova.end_time)

  if (Number.isNaN(ini) || Number.isNaN(fim)) {
    return {
      ok: false,
      motivo: 'HORA_INVALIDA',
      mensagem: 'Informe as horas no formato HH:MM.',
    }
  }
  if (fim <= ini) {
    return {
      ok: false,
      motivo: 'FIM_ANTES_DO_INICIO',
      mensagem: 'A hora de término tem de ser depois da hora de início.',
    }
  }

  for (const e of existentes) {
    if (e.weekday !== nova.weekday) continue
    if (e.is_active === false) continue
    if (nova.id && e.id === nova.id) continue // editar a própria faixa não é conflito
    const eIni = horaParaMinutos(e.start_time)
    const eFim = horaParaMinutos(e.end_time)
    if (Number.isNaN(eIni) || Number.isNaN(eFim)) continue
    if (ini < eFim && eIni < fim) {
      return {
        ok: false,
        motivo: 'SOBREPOSICAO',
        mensagem: `Esta faixa se sobrepõe a ${e.start_time.slice(0, 5)}–${e.end_time.slice(0, 5)} `
          + 'no mesmo dia. Faixas que apenas encostam (12:00 e 12:00) são permitidas.',
        conflito: e,
      }
    }
  }

  return { ok: true }
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// §4 — O PRÉ-REQUISITO QUE NÃO É CÓDIGO
// ═════════════════════════════════════════════════════════════════════════════════════════

/**
 * O aviso para funcionário sem `user_id`. `null` quando ele tem login.
 *
 * Medido em 05/10/2026: ZERO funcionários têm `user_id` (1 em Michele Campos, 5 no Salão
 * Eliane). A política de `calendar_events` é
 * `tenant_id = get_auth_tenant_id() AND (is_admin_or_manager() OR user_id = auth.uid())` —
 * sem `user_id` o barbeiro não vê a própria agenda, e não verá os agendamentos que o link
 * criar. Configurar a grade dele sem isso produz um link que funciona para o cliente e não
 * aparece para quem vai atender.
 *
 * O aviso NÃO cria convite: quem decide dar acesso é o dono, em Funcionários (§4 do comando).
 */
export function avisoDeFuncionarioSemAcesso(emp: { user_id?: string | null }): string | null {
  if (emp?.user_id) return null
  return 'Este profissional ainda não tem acesso ao sistema e não verá os próprios '
    + 'agendamentos. Envie o convite em Funcionários.'
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// Os limites da configuração — os mesmos CHECK da migração
// ═════════════════════════════════════════════════════════════════════════════════════════

/**
 * Os limites vivem AQUI e no `CHECK` da tabela, e isso é deliberado: a tela recusa antes de
 * ir ao banco (mensagem em português) e o banco recusa o que não passou pela tela
 * (importação, API). Os dois números são os mesmos de propósito, e o caso afirma a igualdade
 * contra o texto da migração — é o que impede que um lado afrouxe sozinho.
 */
export const LIMITES = {
  lead_time_min: { min: 0, max: null as number | null, default: 60 },
  horizon_days: { min: 1, max: 180, default: 30 },
  grid_minutes: { min: 5, max: 120, default: 30 },
} as const
