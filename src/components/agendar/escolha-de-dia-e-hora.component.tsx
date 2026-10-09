/**
 * EscolhaDeDiaEHora — a faixa de dias e os chips de horário da página pública.
 *
 * Comando do PO de 09/10/2026. É o padrão de mercado da escolha de dia e horário.
 *
 * ══ UM COMPONENTE, OS DOIS FLUXOS — E ESSA É A DECISÃO PRINCIPAL ═════════════════════════
 *
 * Antes desta rodada a página tinha **TRÊS formas** de mostrar a mesma coisa:
 *
 *   1. agendar, dia    — 30 botões de largura cheia, um por linha
 *   2. remarcar, dia   — 14 botões de largura cheia, um por linha
 *   3. remarcar, hora  — botões de largura cheia, um por linha (o agendar já embrulhava chips)
 *
 * As três viram UMA. A razão é a mesma que tirou o botão de replicar da grade na rodada de
 * 08/10: *"duas formas de montar grade divergem com o tempo"*. O portão tem caso afirmando que
 * o remarcar usa este componente — sem ele a terceira forma volta na próxima mudança.
 *
 * ══ A BUSCA É INJETADA ══════════════════════════════════════════════════════════════════
 *
 * `buscarHorarios` entra por prop. No agendar ela fecha sobre `barbeiro` e `servico` do estado;
 * no remarcar, sobre `alvo.barbeiro_id` e `alvo.servico_id`. As duas chamam o MESMO endpoint
 * `/horarios`, cuja assinatura esta rodada não toca. Um componente que resolvesse a URL por
 * conta própria precisaria conhecer os dois fluxos, e aí não seria um componente — seria a
 * página outra vez.
 *
 * >>> NENHUMA CHAMADA AO SUPABASE AQUI. NENHUMA LINHA. <<<
 * Igual à página: tudo passa pelas rotas, que resolvem o tenant pelo TOKEN. O portão da Fase 2
 * afirma essa ausência por `grep` NESTE arquivo também — foi estendido nesta rodada, porque um
 * portão que só lia a página deixaria de alcançar o código que saiu dela
 * (`portao-que-nao-alcanca.md`).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { agruparHorariosPorPeriodo } from '@/utils/agrupar-horarios-por-periodo'
import {
  diaCurtoBR, diaSemVaga, primeiroDiaComVaga, proximoDiaComVaga, proximosDias,
  type DiaDaFaixa, type VagasPorDia,
} from '@/utils/faixa-de-dias'

/** Quantos dias a faixa sonda de uma vez. Ver o comentário do pré-carregamento. */
const DIAS_POR_JANELA = 7

export type EscolhaDeDiaEHoraProps = {
  /** Vem de `GET /api/public/agenda/[token]` → `horizonteDias`. */
  horizonteDias: number
  /** `(dia) => horários livres`. Injetada: cada fluxo fecha sobre o seu barbeiro e serviço. */
  buscarHorarios: (dia: string) => Promise<string[]>
  /** Chamada quando o cliente escolhe o chip. */
  onEscolher: (dia: string, hora: string) => void
  /** Trava os chips durante um envio em curso. */
  ocupado?: boolean
  /** O chip que fica destacado, quando o chamador guarda a hora no estado dele. */
  horaSelecionada?: string
}

export default function EscolhaDeDiaEHora({
  horizonteDias, buscarHorarios, onEscolher, ocupado = false, horaSelecionada = '',
}: EscolhaDeDiaEHoraProps) {
  // >>> O RELÓGIO É LIDO UMA VEZ, NA MONTAGEM <<<
  // `proximosDias` recebe `hoje` injetado e é pura. Ler `new Date()` no corpo do render faria a
  // faixa inteira ser recalculada a cada tecla digitada depois, e na virada da meia-noite os
  // dias dançariam sob o dedo do usuário.
  const [hoje] = useState<Date>(() => new Date())
  const dias = useMemo<DiaDaFaixa[]>(() => proximosDias(horizonteDias, hoje), [horizonteDias, hoje])

  /** Quantos horários cada dia tem. Ausente = NÃO SONDADO, e o dia nasce habilitado. */
  const [vagas, setVagas] = useState<VagasPorDia>({})
  const [janela, setJanela] = useState(0)
  const [dia, setDia] = useState('')
  const [horarios, setHorarios] = useState<string[]>([])
  const [carregandoDia, setCarregandoDia] = useState(false)
  /** A pré-seleção acontece UMA vez. Sem isto ela brigaria com a escolha do usuário. */
  const jaPreSelecionou = useRef(false)
  const faixaRef = useRef<HTMLDivElement | null>(null)

  const visiveis = useMemo(
    () => dias.slice(janela, janela + DIAS_POR_JANELA),
    [dias, janela],
  )

  // ══ O PRÉ-CARREGAMENTO DA JANELA ════════════════════════════════════════════════════════
  //
  // >>> O CUSTO ESTÁ MEDIDO, E A SAÍDA NÃO É DESTA RODADA <<<
  //
  // Sete dias = sete requisições a `/horarios`, e cada uma faz 7 selects: 2 de
  // `contextoDoToken`, 1 de `barbeiroValido`, 1 de `servicosDoBarbeiro` e 3 de
  // `calcularHorarios` (faixas, ausências, ocupados). **~49 selects por janela, dos quais 28
  // são as quatro primeiras consultas repetidas para o MESMO token e o MESMO barbeiro.**
  //
  // Isso é desperdício real, e fica assim nesta rodada por decisão do dono do produto. A saída
  // é `/horarios` aceitar vários dias numa chamada — rodada própria, com a assinatura da rota
  // revista. Cache NÃO é a saída e não foi inventado aqui.
  //
  // E a latência só existe com o link ligado: medido em 09/10/2026, há 0 links `is_enabled`,
  // e `contextoDoToken` filtra `is_enabled = true`, então hoje toda chamada responde 404. O
  // número da janela de 7 dias será medido quando o primeiro link for ligado.
  useEffect(() => {
    let cancelado = false
    const aSondar = visiveis.filter((d) => vagas[d.valor] === undefined)
    if (aSondar.length === 0) return () => { cancelado = true }

    // >>> FALHA ABRE, NÃO FECHA — CONDIÇÃO (a) DO COMANDO <<<
    // `Promise.all` rejeitaria o lote inteiro na primeira falha e deixaria TODOS os dias sem
    // resposta. Com `allSettled`, o dia que respondeu desabilita se estiver cheio, e o que
    // falhou fica `undefined` — ou seja, HABILITADO, e o usuário descobre ao clicar, que é o
    // comportamento de hoje. Página que trava porque a sondagem não voltou é pior que página
    // que recusa um clique.
    void Promise.allSettled(aSondar.map((d) => buscarHorarios(d.valor))).then((rs) => {
      if (cancelado) return
      const novo: VagasPorDia = {}
      rs.forEach((r, i) => {
        // Só o `fulfilled` afirma algo. O `rejected` NÃO grava nada — nem zero.
        if (r.status === 'fulfilled') novo[aSondar[i].valor] = (r.value ?? []).length
      })
      if (Object.keys(novo).length > 0) setVagas((v) => ({ ...v, ...novo }))
    })

    return () => { cancelado = true }
  }, [visiveis, vagas, buscarHorarios])

  const escolherDia = useCallback(async (valor: string) => {
    setDia(valor)
    setHorarios([])
    setCarregandoDia(true)
    try {
      const hs = await buscarHorarios(valor)
      setHorarios(hs ?? [])
      // A sondagem da faixa aproveita a resposta: o dia clicado passa a ser dado CONHECIDO.
      setVagas((v) => ({ ...v, [valor]: (hs ?? []).length }))
    } catch {
      // >>> FALHA ABRE: a lista fica vazia e a frase do dia vazio aparece <<<
      // Não se grava `0` em `vagas` aqui: a falha não afirma que o dia está cheio.
      setHorarios([])
    } finally {
      setCarregandoDia(false)
    }
  }, [buscarHorarios])

  // ══ A PRÉ-SELEÇÃO: O PRIMEIRO DIA COM VAGA ══════════════════════════════════════════════
  //
  // Só dispara quando já houver um dia com vaga CONHECIDA, e só UMA vez. Pré-selecionar um dia
  // não sondado mostraria "Sem horários neste dia" na abertura — a pior primeira tela possível.
  useEffect(() => {
    if (jaPreSelecionou.current || dia) return
    const primeiro = primeiroDiaComVaga(visiveis, vagas)
    if (!primeiro) return
    jaPreSelecionou.current = true
    void escolherDia(primeiro)
  }, [visiveis, vagas, dia, escolherDia])

  const grupos = useMemo(() => agruparHorariosPorPeriodo(horarios), [horarios])
  const proximoComVaga = dia ? proximoDiaComVaga(dias, vagas, dia) : null

  function deslizar(passo: number) {
    const alvo = Math.min(Math.max(0, janela + passo), Math.max(0, dias.length - DIAS_POR_JANELA))
    setJanela(alvo)
    // O scroll nativo é o que vale no celular; as setas mexem na janela sondada.
    if (faixaRef.current) faixaRef.current.scrollLeft = 0
  }

  const temAnterior = janela > 0
  const temProxima = janela + DIAS_POR_JANELA < dias.length

  return (
    <>
      <h2 style={{ fontSize: 17, marginBottom: 8 }}>Escolha o dia e o horário</h2>

      {/* ══ A FAIXA DE DIAS ═══════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, marginBottom: 16 }}>
        <button
          type="button"
          aria-label="Dias anteriores"
          disabled={!temAnterior}
          onClick={() => deslizar(-DIAS_POR_JANELA)}
          style={{ ...seta, opacity: temAnterior ? 1 : 0.35 }}
        >‹</button>

        <div
          ref={faixaRef}
          role="group"
          aria-label="Dias disponíveis"
          style={{
            display: 'flex', gap: 6, overflowX: 'auto', flex: 1,
            scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
          }}
        >
          {visiveis.map((d) => {
            // >>> SÓ `0` DESABILITA. NÃO SONDADO NASCE HABILITADO <<<
            // `diaSemVaga` é a função pura que guarda esse critério, e ela tem portão.
            const semVaga = diaSemVaga(vagas, d.valor)
            const ativo = d.valor === dia
            return (
              <button
                key={d.valor}
                type="button"
                data-dia={d.valor}
                disabled={semVaga}
                aria-disabled={semVaga ? 'true' : undefined}
                aria-pressed={ativo ? 'true' : 'false'}
                aria-label={semVaga ? `${d.rotulo} — sem horários` : d.rotulo}
                onClick={() => void escolherDia(d.valor)}
                style={{
                  ...cartaoDoDia,
                  // O esmaecido é consequência do estado, nunca a fonte dele: o portão afirma o
                  // ATRIBUTO `disabled`, não a cor.
                  opacity: semVaga ? 0.4 : 1,
                  cursor: semVaga ? 'not-allowed' : 'pointer',
                  borderColor: ativo ? '#12B76A' : '#2A3344',
                  background: ativo ? '#0d2b1e' : '#131A26',
                  color: ativo ? '#E6F6EC' : '#D7DEE9',
                }}
              >
                <span style={{ fontSize: 11, letterSpacing: 0.5, color: ativo ? '#9BE8BE' : '#98A2B3' }}>
                  {d.diaSemana}
                </span>
                <span style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.1 }}>{d.dia}</span>
                <span style={{ fontSize: 11, color: ativo ? '#9BE8BE' : '#98A2B3' }}>{d.mes}</span>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          aria-label="Próximos dias"
          disabled={!temProxima}
          onClick={() => deslizar(DIAS_POR_JANELA)}
          style={{ ...seta, opacity: temProxima ? 1 : 0.35 }}
        >›</button>
      </div>

      {/* ══ OS CHIPS DE HORÁRIO, AGRUPADOS POR PERÍODO ════════════════════════════════════ */}
      {/*
        Só horários DISPONÍVEIS. É o padrão de Booksy, Fresha, Square e Calendly, e a razão não
        é estética: horário ocupado na tela pública entrega o movimento da barbearia a qualquer
        um com o link, e produz clique que só existe para ser recusado.

        Mostrar os ocupados NÃO é uma linha: `/horarios` devolve `string[]` somente com os
        livres, porque `horariosDisponiveis` já subtraiu ocupados, ausências e antecedência.
        Exigiria a rota devolver `{ livres, ocupados }` — rodada própria, com o portão da Fase 2
        revisto junto.
      */}
      {!dia && <p style={{ color: '#98A2B3' }}>Escolha um dia para ver os horários.</p>}

      {dia && carregandoDia && <p style={{ color: '#98A2B3' }}>Carregando horários…</p>}

      {dia && !carregandoDia && grupos.length === 0 && (
        <>
          <p style={{ color: '#98A2B3' }}>Sem horários neste dia.</p>
          {/* O botão só existe quando HÁ para onde ir — `proximoDiaComVaga` devolve `null`
              quando nenhum dia sondado adiante tem vaga, e aí ele não aparece. */}
          {proximoComVaga && (
            <button
              type="button"
              style={{ ...botaoDoProximo }}
              onClick={() => void escolherDia(proximoComVaga)}
            >
              Ver {diaCurtoBR(proximoComVaga)}, o próximo com vaga
            </button>
          )}
        </>
      )}

      {dia && !carregandoDia && grupos.map((g) => (
        <div key={g.periodo} style={{ marginBottom: 14 }}>
          {/* Período sem horário NÃO chega aqui: `agruparHorariosPorPeriodo` o omite, então o
              título não existe sem chip embaixo. A regra está na estrutura, não neste `map`. */}
          <div style={{
            fontSize: 11, letterSpacing: 1, color: '#98A2B3', marginBottom: 6, fontWeight: 600,
          }}>{g.periodo}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {g.horarios.map((h) => {
              const ativo = h === horaSelecionada
              return (
                <button
                  key={h}
                  type="button"
                  data-hora={h}
                  disabled={ocupado}
                  aria-pressed={ativo ? 'true' : 'false'}
                  aria-label={`${h}`}
                  onClick={() => onEscolher(dia, h)}
                  style={{
                    ...chip,
                    borderColor: ativo ? '#12B76A' : '#2A3344',
                    background: ativo ? '#0d2b1e' : '#131A26',
                    color: ativo ? '#E6F6EC' : '#D7DEE9',
                    fontWeight: ativo ? 600 : 400,
                  }}
                >{h}</button>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

const seta: React.CSSProperties = {
  width: 30, flex: '0 0 30px', borderRadius: 10, border: '1px solid #2A3344',
  background: '#131A26', color: '#D7DEE9', fontSize: 18, cursor: 'pointer',
}

const cartaoDoDia: React.CSSProperties = {
  flex: '0 0 auto', minWidth: 58, padding: '8px 6px', borderRadius: 10,
  border: '1px solid #2A3344', display: 'flex', flexDirection: 'column',
  alignItems: 'center', gap: 2,
}

const chip: React.CSSProperties = {
  minWidth: 78, padding: '9px 10px', borderRadius: 10, border: '1px solid #2A3344',
  cursor: 'pointer', fontSize: 15,
}

const botaoDoProximo: React.CSSProperties = {
  width: '100%', padding: '11px 12px', marginTop: 8, borderRadius: 10,
  border: '1px solid #2A3344', background: '#131A26', color: '#D7DEE9',
  cursor: 'pointer', fontSize: 15, textAlign: 'center',
}
