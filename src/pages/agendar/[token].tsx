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
function lerMemoria(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MEMORIA) || '{}') } catch { return {} }
}
function gravarMemoria(v: Record<string, string>): void {
  try { localStorage.setItem(MEMORIA, JSON.stringify(v)) } catch { /* sem memória, só não lembra */ }
}

function proximosDias(n: number): { valor: string; rotulo: string }[] {
  const out: { valor: string; rotulo: string }[] = []
  const hoje = new Date()
  for (let i = 0; i < n; i += 1) {
    const d = new Date(hoje.getTime() + i * 86400000)
    const valor = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(d)
    const rotulo = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit',
    }).format(d)
    out.push({ valor, rotulo })
  }
  return out
}

export default function PaginaDeAgendamento() {
  const router = useRouter()
  const token = typeof router.query.token === 'string' ? router.query.token : ''

  const [carregando, setCarregando] = useState(true)
  const [indisponivel, setIndisponivel] = useState(false)
  const [empresa, setEmpresa] = useState('')
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([])

  const [passo, setPasso] = useState(1)
  const [barbeiro, setBarbeiro] = useState<Barbeiro | null>(null)
  const [servicos, setServicos] = useState<Servico[]>([])
  const [servico, setServico] = useState<Servico | null>(null)
  const [dia, setDia] = useState('')
  const [horarios, setHorarios] = useState<string[]>([])
  const [hora, setHora] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)

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

  const carregarHorarios = useCallback(async (d: string) => {
    setErro(''); setHorarios([]); setHora('')
    if (!barbeiro || !servico) return
    try {
      const qs = `barbeiro=${encodeURIComponent(barbeiro.id)}&servico=${encodeURIComponent(servico.id)}&dia=${encodeURIComponent(d)}`
      const r = await fetch(`/api/public/agenda/${encodeURIComponent(token)}/horarios?${qs}`)
      if (!r.ok) { setErro('Não foi possível carregar os horários.'); return }
      setHorarios(await r.json())
    } catch { setErro('Não foi possível carregar os horários.') }
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

        {pronto ? (
          <div>
            <h2 style={{ fontSize: 18, color: '#12B76A' }}>Agendamento confirmado</h2>
            <p style={{ fontSize: 16, lineHeight: 1.6 }}>
              {servico?.nome}<br />
              com {barbeiro?.nome}<br />
              {dia.split('-').reverse().join('/')} às {hora}
            </p>
            <p style={{ color: '#98A2B3', fontSize: 14 }}>
              Guarde esta informação. Para cancelar ou mudar o horário, fale com o estabelecimento.
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

            {passo === 3 && (
              <>
                <h2 style={{ fontSize: 17 }}>Escolha o dia</h2>
                {proximosDias(30).map((d) => (
                  <button key={d.valor} style={botao} onClick={async () => {
                    setDia(d.valor); setPasso(4); await carregarHorarios(d.valor)
                  }}>{d.rotulo}</button>
                ))}
                <button style={{ ...botao, textAlign: 'center' }} onClick={() => setPasso(2)}>Voltar</button>
              </>
            )}

            {passo === 4 && (
              <>
                <h2 style={{ fontSize: 17 }}>Escolha o horário</h2>
                {horarios.length === 0
                  ? <p style={{ color: '#98A2B3' }}>Sem horário livre neste dia. Escolha outro.</p>
                  : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {horarios.map((h) => (
                        <button key={h} style={{ ...botao, width: 'auto', marginBottom: 0, textAlign: 'center', minWidth: 86 }}
                          onClick={() => { setHora(h); setPasso(5) }}>{h}</button>
                      ))}
                    </div>
                  )}
                <button style={{ ...botao, textAlign: 'center' }} onClick={() => setPasso(3)}>Voltar</button>
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
                <button style={{ ...botao, textAlign: 'center' }} onClick={() => setPasso(4)}>Voltar</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
