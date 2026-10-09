/**
 * /agendar/[token] — a página pública do agendamento. Fase 2, comando do PO de 06/10/2026.
 *
 * >>> ELA NÃO IMPORTA O CLIENTE DO SUPABASE. NENHUMA LINHA. <<<
 *
 * Tudo passa por `/api/public/agenda/*`. Um `import { supabase }` aqui levaria a chave anon ao
 * navegador de QUALQUER visitante — e a regra do PO é "nunca pode ter nenhuma integração ou de
 * informação. Nada. Nunca." O portão afirma essa ausência por `grep` no arquivo, porque nenhum
 * caso de comportamento ficaria vermelho se alguém acrescentasse o import amanhã.
 *
 * Sem layout do sistema, sem menu, sem `useAuth`: é uma página para quem não tem conta.
 */

import React, { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import EscolhaDeDiaEHora from '@/components/agendar/escolha-de-dia-e-hora.component'

const MEMORIA = 'pc.agendar.v1'

interface Barbeiro { id: string; nome: string }
interface Servico { id: string; nome: string; duracaoMin: number }

/**
 * `localStorage` embrulhado nos dois sentidos.
 *
 * Em aba privada, com cookies bloqueados ou em SSR o acesso LANÇA — e um throw aqui deixaria a
 * página branca para quem só queria marcar um horário. Decisão do PO: a memória é do APARELHO e
 * nunca uma busca no servidor por telefone; perguntar ao servidor "quem é este número?" daria a
 * qualquer um um oráculo de clientes do salão.
 */
/**
 * O que a rota de validação devolve por agendamento.
 *
 * >>> CINCO CAMPOS, E NENHUM DELES IDENTIFICA O CLIENTE <<<
 * Sem nome, sem e-mail, sem `customer_id`. O `id` é do EVENTO, e só serve para quem já provou
 * o código — porque cancelar e remarcar o revalidam.
 */
type MeuAgendamento = {
  id: string
  servico: string
  profissional: string
  data: string
  hora: string
  /**
   * Os ids do barbeiro e do serviço, que a rota devolve e a tela usa para REUSAR
   * `GET …/horarios?barbeiro=&servico=&dia=` — a rota da Fase 2, que esta rodada não toca.
   * Os dois já são públicos: o índice lista todos os barbeiros com id, e `/servicos` idem.
   */
  barbeiro_id: string
  servico_id: string
}

function lerMemoria(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MEMORIA) || '{}') } catch { return {} }
}
function gravarMemoria(v: Record<string, string>): void {
  try { localStorage.setItem(MEMORIA, JSON.stringify(v)) } catch { /* sem memória, só não lembra */ }
}

/**
 * >>> `proximosDias` SAIU DAQUI EM 09/10/2026, PARA `@/utils/faixa-de-dias` <<<
 *
 * Ela devolvia `{ valor, rotulo }` com o rótulo numa string só — `"sex., 09/10"` — e a faixa
 * horizontal tem TRÊS linhas (`SEX` / `09` / `out`). Fatiar texto formatado por `Intl` para
 * tirar as três partes quebra quando a locale muda, então as partes passaram a sair da fonte.
 *
 * Ela foi para um módulo puro com `hoje` INJETADO, usado pelo componente único que serve os
 * DOIS fluxos — e tem portão próprio. Esta página não tem mais lista de dias escrita à mão:
 * nem a de 30 do agendar, nem a de 14 do remarcar.
 */

export default function PaginaDeAgendamento() {
  const router = useRouter()
  const token = typeof router.query.token === 'string' ? router.query.token : ''

  const [carregando, setCarregando] = useState(true)
  const [indisponivel, setIndisponivel] = useState(false)
  const [empresa, setEmpresa] = useState('')
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([])
  /**
   * O horizonte do link, lido de `GET /api/public/agenda/[token]` → `horizonteDias`.
   *
   * >>> O 30 É FALLBACK, NÃO VERDADE <<<
   *
   * Até 09/10/2026 esta página CHUTAVA 30 no agendar e 14 no remarcar. Medido naquele dia:
   * existe uma linha em `tenant_booking_settings`, com `horizon_days = 30`, e o
   * `column_default` da coluna também é 30 — o 30 batia por COINCIDÊNCIA com o default, não
   * por leitura. A rota passou a devolver o campo, e os dois números saíram do código.
   *
   * O valor inicial 30 cobre a janela de um deploy intermediário, em que o navegador já tem o
   * JavaScript novo e a função serverless antiga ainda responde sem o campo. Ele é FALLBACK:
   * quando a resposta traz `horizonteDias`, é ele que vale.
   */
  const [horizonteDias, setHorizonteDias] = useState(30)

  const [passo, setPasso] = useState(1)
  const [barbeiro, setBarbeiro] = useState<Barbeiro | null>(null)
  const [servicos, setServicos] = useState<Servico[]>([])
  const [servico, setServico] = useState<Servico | null>(null)
  const [dia, setDia] = useState('')
  /**
   * >>> O ESTADO `horarios` SAIU DA PÁGINA EM 09/10/2026 <<<
   * A lista de horários do dia vive dentro de `EscolhaDeDiaEHora`, que a busca e a agrupa. A
   * página guarda só a ESCOLHA — `dia` e `hora` —, que é o que o passo 5 e o POST precisam.
   */
  const [hora, setHora] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)

  // ══ FASE 2B — O SEGUNDO CAMINHO: "MEUS AGENDAMENTOS" ═══════════════════════════════
  //
  // >>> NENHUMA CHAMADA AO SUPABASE DO NAVEGADOR, NEM AQUI NEM EM NENHUM LUGAR DESTE ARQUIVO <<<
  // Tudo passa pelas rotas, que resolvem o tenant pelo TOKEN. A página não tem cliente de banco
  // e não conhece `tenant_id` — há caso no portão da Fase 2 afirmando isso lendo o arquivo.
  //
  // >>> E O ERRO É SEMPRE A MESMA FRASE <<<
  // 'Código inválido ou expirado.' para os quatro motivos. Distinguir 'expirado' de 'errado'
  // diria que o código EXISTIU — logo, que o telefone é cliente daqui.
  //
  // `modo` começa em `'ESCOLHA'`: a tela inicial oferece os dois caminhos.
  const [modo, setModo] = useState<'ESCOLHA' | 'AGENDAR' | 'MEUS'>('ESCOLHA')
  const [meuPasso, setMeuPasso] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [meuFone, setMeuFone] = useState('')
  const [meuCodigo, setMeuCodigo] = useState('')
  const [meusAgendamentos, setMeusAgendamentos] = useState<MeuAgendamento[]>([])
  const [alvo, setAlvo] = useState<MeuAgendamento | null>(null)
  const [meuErro, setMeuErro] = useState('')
  const [meuEnviando, setMeuEnviando] = useState(false)
  const [meuFeito, setMeuFeito] = useState('')

  useEffect(() => {
    const m = lerMemoria()
    if (m.nome) setNome(m.nome)
    if (m.telefone) setTelefone(m.telefone)
    if (m.email) setEmail(m.email)
  }, [])

  useEffect(() => {
    if (!token) return
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}`)
        if (!r.ok) { if (vivo) { setIndisponivel(true); setCarregando(false) } return }
        const j = await r.json()
        if (!vivo) return
        setEmpresa(j.empresa || '')
        setBarbeiros(j.barbeiros || [])
        // Campo novo de 09/10/2026. Resposta sem ele (deploy intermediário) mantém o 30 do
        // estado inicial, que é FALLBACK e está documentado como tal na declaração.
        if (Number.isFinite(j.horizonteDias) && j.horizonteDias > 0) {
          setHorizonteDias(Math.floor(j.horizonteDias))
        }
        // O último barbeiro escolhido no aparelho sobe pré-selecionado, se ainda existir.
        const m = lerMemoria()
        const ant = (j.barbeiros || []).find((b: Barbeiro) => b.id === m.barbeiro)
        if (ant) { setBarbeiro(ant) }
        setCarregando(false)
      } catch { if (vivo) { setIndisponivel(true); setCarregando(false) } }
    })()
    return () => { vivo = false }
  }, [token])

  const carregarServicos = useCallback(async (b: Barbeiro) => {
    setErro('')
    setServicos([]); setServico(null)
    try {
      const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}/servicos?barbeiro=${encodeURIComponent(b.id)}`)
      if (!r.ok) { setErro('Não foi possível carregar os serviços deste profissional.'); return }
      setServicos(await r.json())
    } catch { setErro('Não foi possível carregar os serviços deste profissional.') }
  }, [token])

  /**
   * Os horários livres de um dia, para o fluxo de AGENDAR.
   *
   * >>> ELA DEVOLVE A LISTA, E **LANÇA** QUANDO NÃO SABE — NÃO DEVOLVE `[]` <<<
   *
   * É a injeção de `buscarHorarios` do componente, e a distinção importa: `[]` AFIRMA que o dia
   * está cheio, e o componente desabilita o cartão do dia. Um `[]` devolvido por falha de rede
   * desabilitaria um dia que talvez tenha vaga — `ausente-vs-falso.md` na faixa.
   *
   * Lançando, o `Promise.allSettled` do pré-carregamento registra `rejected`, nada é gravado em
   * `vagas`, e o dia nasce HABILITADO: a condição (a) do comando, *"falha ABRE, não fecha"*.
   */
  const buscarHorariosDoAgendar = useCallback(async (d: string): Promise<string[]> => {
    if (!barbeiro || !servico) return []
    const qs = `barbeiro=${encodeURIComponent(barbeiro.id)}&servico=${encodeURIComponent(servico.id)}&dia=${encodeURIComponent(d)}`
    const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}/horarios?${qs}`)
    if (!r.ok) throw new Error('horarios')
    return await r.json()
  }, [token, barbeiro, servico])

  async function confirmar() {
    if (!barbeiro || !servico || !dia || !hora) return
    setErro(''); setEnviando(true)
    try {
      const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}/agendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barbeiro: barbeiro.id, servico: servico.id, dia, hora,
          nome: nome.trim(), telefone: telefone.replace(/\D/g, ''), email: email.trim(),
        }),
      })
      if (!r.ok) {
        // A rota devolve o MESMO corpo genérico para todas as recusas, de propósito. A tela
        // oferece a saída prática em vez de adivinhar o motivo.
        setErro('Não foi possível concluir. O horário pode ter sido ocupado — escolha outro.')
        setEnviando(false)
        return
      }
      gravarMemoria({ nome: nome.trim(), telefone: telefone.replace(/\D/g, ''), email: email.trim(), barbeiro: barbeiro.id })
      setPronto(true)
      setPasso(6)
    } catch {
      setErro('Não foi possível concluir. Tente de novo.')
    } finally { setEnviando(false) }
  }

  /** A frase ÚNICA de recusa. Uma só, para os quatro motivos. */
  const RECUSA = 'Código inválido ou expirado.'

  async function pedirCodigo() {
    setMeuErro(''); setMeuEnviando(true)
    try {
      const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}/codigo-solicitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: meuFone.replace(/\D/g, '') }),
      })
      // >>> A ROTA RESPONDE `{ ok: true }` PARA CONHECIDO E DESCONHECIDO <<<
      // A tela segue para o passo do código nos dois casos, com a MESMA frase. Mostrar
      // "número não encontrado" aqui desfaria do lado do navegador tudo o que a rota protege.
      if (!r.ok) { setMeuErro('Não foi possível continuar. Tente de novo.'); return }
      setMeuPasso(2)
    } catch {
      setMeuErro('Não foi possível continuar. Tente de novo.')
    } finally { setMeuEnviando(false) }
  }

  async function validarCodigoNaTela() {
    setMeuErro(''); setMeuEnviando(true)
    try {
      const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}/codigo-validar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: meuFone.replace(/\D/g, ''), codigo: meuCodigo.trim() }),
      })
      if (!r.ok) { setMeuErro(RECUSA); return }
      const corpo = await r.json()
      setMeusAgendamentos((corpo?.agendamentos ?? []) as MeuAgendamento[])
      setMeuPasso(3)
    } catch {
      setMeuErro(RECUSA)
    } finally { setMeuEnviando(false) }
  }

  async function cancelarAgendamento(a: MeuAgendamento) {
    setMeuErro(''); setMeuEnviando(true)
    try {
      const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: meuFone.replace(/\D/g, ''), codigo: meuCodigo.trim(), agendamento_id: a.id,
        }),
      })
      if (!r.ok) { setMeuErro(RECUSA); return }
      setMeuFeito('Agendamento cancelado.')
      setMeuPasso(5)
    } catch {
      setMeuErro(RECUSA)
    } finally { setMeuEnviando(false) }
  }

  /**
   * Remarcar REUSA o fluxo de dia → horário que já existe.
   *
   * >>> ELE NÃO ESCREVE UM SEGUNDO SELETOR DE DIA E HORA <<<
   * `proximosDias` e `carregarHorarios` são os mesmos do caminho de agendar — e por isso o
   * `barbeiro` e o `servico` do agendamento alvo precisam ser semeados antes, senão
   * `carregarHorarios` retorna sem fazer nada. É o preço de reusar, e é menor que o de ter
   * duas listas de horário que divergem (`copia-divergente.md`).
   */
  /**
   * Os horários do dia, para o alvo da remarcação.
   *
   * >>> ELE NÃO É UMA SEGUNDA `carregarHorarios` <<<
   *
   * `carregarHorarios` depende de `barbeiro` e `servico` do ESTADO do caminho de AGENDAR, que no
   * caminho de remarcar está vazio. Esta lê os ids do AGENDAMENTO ALVO, que a rota de validação
   * devolve — e chama o MESMO endpoint `/horarios`, que esta rodada não pode tocar.
   *
   * A primeira versão desta função inventou um parâmetro `agendamento` em `/horarios`. Isso
   * exigiria alterar uma rota da Fase 2, e a única alteração autorizada nesta rodada era a de
   * `agendar.ts`. A saída foi devolver os dois ids na validação — eles já são públicos.
   */
  const buscarHorariosDoAlvo = useCallback(async (d: string): Promise<string[]> => {
    if (!alvo) return []
    const qs = `barbeiro=${encodeURIComponent(alvo.barbeiro_id)}`
      + `&servico=${encodeURIComponent(alvo.servico_id)}&dia=${encodeURIComponent(d)}`
    const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}/horarios?${qs}`)
    // Lança por não saber, igual à do agendar — ver o cabeçalho dela.
    if (!r.ok) throw new Error('horarios')
    return await r.json()
  }, [token, alvo])

  async function confirmarRemarcacao(d: string, h: string) {
    if (!alvo) return
    setMeuErro(''); setMeuEnviando(true)
    try {
      const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}/remarcar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: meuFone.replace(/\D/g, ''), codigo: meuCodigo.trim(),
          agendamento_id: alvo.id, dia: d, hora: h,
        }),
      })
      if (!r.ok) {
        setMeuErro('Não foi possível remarcar. O horário pode ter sido ocupado — escolha outro.')
        return
      }
      setMeuFeito(`Agendamento remarcado para ${d.split('-').reverse().join('/')} às ${h}.`)
      setMeuPasso(5)
    } catch {
      setMeuErro('Não foi possível remarcar. Tente de novo.')
    } finally { setMeuEnviando(false) }
  }

  const fundo: React.CSSProperties = {
    minHeight: '100vh', background: '#0a1628', color: '#E9EDF5',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '20px 16px', boxSizing: 'border-box',
  }
  const caixa: React.CSSProperties = { maxWidth: 480, margin: '0 auto' }
  const botao: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 10,
    background: '#111c2e', color: '#E9EDF5', border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12, fontSize: 16, cursor: 'pointer',
  }
  const campo: React.CSSProperties = {
    width: '100%', padding: '12px 14px', marginBottom: 12, boxSizing: 'border-box',
    background: '#111c2e', color: '#E9EDF5', border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 10, fontSize: 16,
  }

  if (carregando) {
    return <div style={fundo}><div style={caixa}>Carregando…</div></div>
  }

  // >>> TOKEN INVÁLIDO E TOKEN DESLIGADO CAEM AQUI, NA MESMA PÁGINA <<<
  // Sem nome de empresa, sem detalhe, sem stack. Dizer "este salão existe mas está desligado"
  // confirmaria o token a quem o está varrendo.
  if (indisponivel) {
    return (
      <div style={fundo}>
        <Head><title>Agendamento indisponível</title><meta name="robots" content="noindex" /></Head>
        <div style={caixa}>
          <h1 style={{ fontSize: 20 }}>Agendamento indisponível</h1>
          <p style={{ color: '#98A2B3' }}>Este link não está ativo. Fale com o estabelecimento.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={fundo}>
      <Head>
        <title>{empresa ? `Agendar — ${empresa}` : 'Agendar'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <div style={caixa}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>{empresa}</h1>

        {/* ══ A TELA INICIAL — OS DOIS CAMINHOS ════════════════════════════════════════
            Fase 2B. Antes a página abria direto no passo 1 de agendar; agora ela pergunta
            primeiro. Quem só quer agendar dá um clique a mais, e quem quer cancelar tem para
            onde ir — antes o rodapé da confirmação prometia "acesse pelo mesmo link" e o link
            não tinha esse caminho. */}
        {modo === 'ESCOLHA' && !pronto && (
          <>
            <p style={{ color: '#98A2B3', marginTop: 0, fontSize: 14 }}>O que você quer fazer?</p>
            <button style={botao} onClick={() => { setModo('AGENDAR'); setPasso(1) }}>
              Agendar
            </button>
            <button style={botao} onClick={() => { setModo('MEUS'); setMeuPasso(1) }}>
              Meus agendamentos
            </button>
          </>
        )}

        {/* ══ O CAMINHO DE "MEUS AGENDAMENTOS" ═════════════════════════════════════════ */}
        {modo === 'MEUS' && (
          <>
            {meuErro && (
              <div style={{ background: '#3b1d1d', border: '1px solid #7a2d2d', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                {meuErro}
              </div>
            )}

            {meuPasso === 1 && (
              <>
                <h2 style={{ fontSize: 17 }}>Seu WhatsApp</h2>
                <input
                  style={campo}
                  inputMode="numeric"
                  placeholder="DDD + número"
                  aria-label="Telefone para receber o código"
                  value={meuFone}
                  onChange={(e) => setMeuFone(e.target.value)}
                />
                <button
                  style={{ ...botao, textAlign: 'center', background: '#1570EF', borderColor: '#1570EF' }}
                  disabled={meuEnviando || meuFone.replace(/\D/g, '').length < 10}
                  onClick={() => void pedirCodigo()}
                >
                  {meuEnviando ? 'Enviando…' : 'Receber código'}
                </button>
                <button style={botao} onClick={() => setModo('ESCOLHA')}>Voltar</button>
              </>
            )}

            {meuPasso === 2 && (
              <>
                {/* >>> A MESMA FRASE PARA NÚMERO CONHECIDO E DESCONHECIDO <<< */}
                <h2 style={{ fontSize: 17 }}>Enviamos um código para o seu WhatsApp.</h2>
                <p style={{ color: '#98A2B3', fontSize: 14 }}>Ele vale por 10 minutos.</p>
                <input
                  style={campo}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  aria-label="Código de 6 dígitos"
                  value={meuCodigo}
                  onChange={(e) => setMeuCodigo(e.target.value.replace(/\D/g, ''))}
                />
                <button
                  style={{ ...botao, textAlign: 'center', background: '#1570EF', borderColor: '#1570EF' }}
                  disabled={meuEnviando || meuCodigo.length !== 6}
                  onClick={() => void validarCodigoNaTela()}
                >
                  {meuEnviando ? 'Conferindo…' : 'Continuar'}
                </button>
              </>
            )}

            {meuPasso === 3 && (
              <>
                <h2 style={{ fontSize: 17 }}>Seus agendamentos</h2>
                {meusAgendamentos.length === 0 && (
                  <p style={{ color: '#98A2B3' }}>Você não tem agendamento futuro.</p>
                )}
                {meusAgendamentos.map((a) => (
                  <div
                    key={a.id}
                    style={{ ...botao, cursor: 'default' }}
                  >
                    <div style={{ fontSize: 16 }}>{a.servico}</div>
                    <div style={{ color: '#98A2B3', fontSize: 14 }}>
                      com {a.profissional}<br />{a.data} às {a.hora}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        style={{ ...campo, marginBottom: 0, width: 'auto', flex: 1, cursor: 'pointer' }}
                        disabled={meuEnviando}
                        aria-label={`Cancelar ${a.id}`}
                        onClick={() => void cancelarAgendamento(a)}
                      >
                        Cancelar
                      </button>
                      <button
                        style={{ ...campo, marginBottom: 0, width: 'auto', flex: 1, cursor: 'pointer' }}
                        disabled={meuEnviando}
                        aria-label={`Remarcar ${a.id}`}
                        onClick={() => {
                          // >>> REMARCAR REUSA O FLUXO DE DIA → HORÁRIO QUE JÁ EXISTE <<<
                          // Desde 09/10/2026 o reuso é o COMPONENTE `EscolhaDeDiaEHora`, o
                          // mesmo do caminho de agendar, com a busca injetada. O barbeiro e o
                          // serviço do alvo são resolvidos pela ROTA a partir do próprio
                          // evento — a tela não os conhece, e não deve.
                          setAlvo(a)
                          setDia(''); setHora('')
                          setMeuPasso(4)
                        }}
                      >
                        Remarcar
                      </button>
                    </div>
                  </div>
                ))}
                <button style={botao} onClick={() => setModo('ESCOLHA')}>Voltar</button>
              </>
            )}

            {meuPasso === 4 && alvo && (
              <>
                <h2 style={{ fontSize: 17 }}>Novo horário</h2>
                <p style={{ color: '#98A2B3', fontSize: 14 }}>
                  {alvo.servico} com {alvo.profissional}
                </p>
                {/*
                  >>> O MESMO COMPONENTE DO AGENDAR, COM A BUSCA DO ALVO INJETADA <<<

                  Antes de 09/10/2026 este bloco tinha a SEGUNDA lista de dias da página (14 em
                  vez de 30) e a TERCEIRA forma de mostrar horário (botões de largura cheia, um
                  por linha). As duas saíram. O portão tem caso afirmando que o remarcar usa
                  este componente — sem ele a terceira forma volta na próxima mudança.

                  `buscarHorariosDoAlvo` lê os ids do AGENDAMENTO ALVO, que a rota de validação
                  devolve, e chama o MESMO endpoint `/horarios` — cuja assinatura esta rodada
                  não toca.
                */}
                <EscolhaDeDiaEHora
                  horizonteDias={horizonteDias}
                  buscarHorarios={buscarHorariosDoAlvo}
                  ocupado={meuEnviando}
                  onEscolher={(d, h) => void confirmarRemarcacao(d, h)}
                />
              </>
            )}

            {meuPasso === 5 && (
              <div>
                <h2 style={{ fontSize: 18, color: '#12B76A' }}>Pronto</h2>
                <p style={{ fontSize: 16, lineHeight: 1.6 }}>{meuFeito}</p>
                <p style={{ color: '#98A2B3', fontSize: 14 }}>
                  Você recebeu a confirmação no WhatsApp.
                </p>
              </div>
            )}
          </>
        )}

        {modo === 'AGENDAR' && (pronto ? (
          <div>
            <h2 style={{ fontSize: 18, color: '#12B76A' }}>Agendamento confirmado</h2>
            <p style={{ fontSize: 16, lineHeight: 1.6 }}>
              {servico?.nome}<br />
              com {barbeiro?.nome}<br />
              {dia.split('-').reverse().join('/')} às {hora}
            </p>
            {/* >>> A FRASE MUDOU: AGORA O LINK TEM O CAMINHO <<<
                Até a Fase 2B ela dizia "fale com o estabelecimento", porque cancelar pelo link
                não existia. Com as quatro rotas no ar, mandar o cliente ligar seria mandá-lo
                fazer o trabalho que a tela passou a fazer. */}
            <p style={{ color: '#98A2B3', fontSize: 14 }}>
              Para cancelar ou mudar o horário, volte a este link e escolha
              {' '}<strong>Meus agendamentos</strong>.
            </p>
          </div>
        ) : (
          <>
            <p style={{ color: '#98A2B3', marginTop: 0, fontSize: 14 }}>Passo {passo} de 5</p>

            {erro && (
              <div style={{ background: '#3b1d1d', border: '1px solid #7a2d2d', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                {erro}
              </div>
            )}

            {passo === 1 && (
              <>
                <h2 style={{ fontSize: 17 }}>Escolha o profissional</h2>
                {barbeiros.length === 0 && <p style={{ color: '#98A2B3' }}>Nenhum profissional disponível agora.</p>}
                {barbeiros.map((b) => (
                  <button key={b.id} style={botao} onClick={async () => {
                    setBarbeiro(b); await carregarServicos(b); setPasso(2)
                  }}>{b.nome}</button>
                ))}
              </>
            )}

            {passo === 2 && (
              <>
                <h2 style={{ fontSize: 17 }}>Escolha o serviço</h2>
                {servicos.length === 0 && <p style={{ color: '#98A2B3' }}>Nenhum serviço disponível.</p>}
                {servicos.map((s) => (
                  <button key={s.id} style={botao} onClick={() => { setServico(s); setPasso(3) }}>
                    {s.nome} <span style={{ color: '#98A2B3' }}>· {s.duracaoMin} min</span>
                  </button>
                ))}
                <button style={{ ...botao, textAlign: 'center' }} onClick={() => setPasso(1)}>Voltar</button>
              </>
            )}

            {/*
              >>> DIA E HORÁRIO NUM PASSO SÓ, PELO COMPONENTE ÚNICO <<<

              Eram DOIS passos — 30 botões de dia num, chips de horário noutro. A faixa
              horizontal mostra os dois ao mesmo tempo, que é o padrão de mercado e o que o
              comando de 09/10/2026 pediu. O passo 4 deixou de existir: a escolha do chip vai
              direto para os dados do cliente.

              O MESMO componente serve o remarcar, mais abaixo. As TRÊS formas de mostrar
              horário que esta página tinha viraram UMA — a razão é a que tirou o botão de
              replicar da grade: duas formas da mesma coisa divergem com o tempo.
            */}
            {passo === 3 && (
              <>
                <EscolhaDeDiaEHora
                  horizonteDias={horizonteDias}
                  buscarHorarios={buscarHorariosDoAgendar}
                  horaSelecionada={hora}
                  onEscolher={(d, h) => { setDia(d); setHora(h); setPasso(5) }}
                />
                <button style={{ ...botao, textAlign: 'center' }} onClick={() => setPasso(2)}>Voltar</button>
              </>
            )}

            {passo === 5 && (
              <>
                <h2 style={{ fontSize: 17 }}>Seus dados</h2>
                <p style={{ color: '#98A2B3', fontSize: 14 }}>
                  {servico?.nome} com {barbeiro?.nome}, {dia.split('-').reverse().join('/')} às {hora}
                </p>
                <input style={campo} placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
                <input style={campo} placeholder="Telefone com DDD" inputMode="numeric" value={telefone}
                  onChange={(e) => setTelefone(e.target.value.replace(/\D/g, '').slice(0, 11))} />
                <input style={campo} placeholder="E-mail (opcional)" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} />
                <button
                  style={{ ...botao, textAlign: 'center', background: '#12B76A', borderColor: '#12B76A', color: '#06281a', fontWeight: 600 }}
                  disabled={enviando || nome.trim().length < 2 || telefone.length < 10}
                  onClick={confirmar}
                >{enviando ? 'Confirmando…' : 'Confirmar agendamento'}</button>
                {/* Volta para o 3: o passo 4 deixou de existir quando dia e horário se juntaram. */}
                <button style={{ ...botao, textAlign: 'center' }} onClick={() => setPasso(3)}>Voltar</button>
              </>
            )}
          </>
        ))}
      </div>
    </div>
  )
}
