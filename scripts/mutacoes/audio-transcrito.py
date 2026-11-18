#!/usr/bin/env python3
"""Mutações do ÁUDIO TRANSCRITO (tarefa 0018 do bridge, 18/11/2026): o núcleo da Edge Function (supabase/functions/transcribe-audio/nucleo.ts),
o cliente do servidor (transcricao-do-audio.ts), a leitura e as frases da mídia (midia-da-mensagem.ts, payload-wuzapi.ts, midia-do-wuzapi.ts)
e a conversa. Roda SOZINHA ou numa worktree (mutacao-na-arvore-de-trabalho.md)."""
import os, subprocess, sys
N = 'supabase/functions/transcribe-audio/nucleo.ts'
L = 'src/lib/atendimentos-ia/'
CLI, MID, PAY, WUZ, CONV = L + 'transcricao-do-audio.ts', L + 'midia-da-mensagem.ts', L + 'payload-wuzapi.ts', L + 'midia-do-wuzapi.ts', L + 'conversa-da-ia.ts'
T = 'src/utils/__tests__/'
NUC = [T + 'transcricao-do-audio.test.ts']
MIDIA = [T + 'atendimentos-ia-midia-da-mensagem.test.ts']
PONTA = [T + 'atendimentos-ia-levantamento-por-nome.test.ts', '-t', 'ÁUDIO']
M = [
 ('N1 sem a liberação, transcreve', N, "    if (!(await deps.empresaLiberada(p.tenant_id))) return", "    if (false) return", NUC),
 ('N2 o limite declarado é >=', N, "p.segundos_declarados > LIMITE_DE_SEGUNDOS) return recusa('longo'", "p.segundos_declarados >= LIMITE_DE_SEGUNDOS) return recusa('longo'", NUC),
 ('N3 o limite medido não confere', N, "    if (segundos !== null && segundos > LIMITE_DE_SEGUNDOS) return recusa('longo', 'bloqueado_duracao', segundos, feito.provider, 'medido')\n", "", NUC),
 ('N4 o teto desligado bloqueia', N, "teto !== 'sem_migracao' && teto.ligado && teto.minutosDoMes", "teto !== 'sem_migracao' && teto.minutosDoMes", NUC),
 ('N5 uma tentativa só', N, "for (let k = 0; k <= ESPERAS_ENTRE_TENTATIVAS_MS.length && !feito; k++)", "for (let k = 0; k < 1 && !feito; k++)", NUC),
 ('N6 o 400 se repete', N, "repetir: r.status === 429 || r.status >= 500", "repetir: true", NUC),
 ('N7 a reserva sem a chave', N, "    if (!feito && openai) {", "    if (!feito) {", NUC),
 ('N8 o idioma fora', N, "    form.append('language', 'pt')\n", "", NUC),
 ('N9 o modelo da Groq trocado', N, "export const MODELO_DA_GROQ = 'whisper-large-v3-turbo'", "export const MODELO_DA_GROQ = 'whisper-large-v3'", NUC),
 ('N10 o uso ok não é gravado', N, "    const uso = await deps.gravarUso({ tenant_id: p.tenant_id, duration_seconds: segundos, provider: feito.provider, status: 'ok' })", "    const uso = 'ok' as const", NUC),
 ('N11 o texto vazio vale', N, "        if (!texto) return { ok: false, repetir: false, detalhe: 'sem_texto' }\n", "", NUC),
 ('N12 o UUID não confere', N, "    if (typeof c.tenant_id !== 'string' || !UUID.test(c.tenant_id)) return { erro: 'tenant_id inválido' }", "    if (typeof c.tenant_id !== 'string') return { erro: 'tenant_id inválido' }", NUC),
 ('K3 a legada antes da nova', CLI, "export const VARIAVEIS_DA_CHAVE = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const", "export const VARIAVEIS_DA_CHAVE = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'] as const", NUC),
 ('K4 a recusada não cede à seguinte', CLI, "            if (r.status === 401 || r.status === 403) {", "            if (false) {", NUC),
 ('K5 o log da recusa sem a variável', CLI, "return `variavel=${n} formato=${f} status=${st}`", "return `formato=${f} status=${st}`", NUC),
 ('K6 a ausência das duas cala', CLI, "        log(`${PREFIXO_DO_LOG_DA_CHAVE} recusada: ${!deps.url", "        void (`${PREFIXO_DO_LOG_DA_CHAVE} recusada: ${!deps.url", NUC),
 ('K7 a variável só de espaços conta', CLI, "const v = (deps.env(nome) ?? '').trim(); return v ?", "const v = deps.env(nome) ?? ''; return v ?", NUC),
 ('A1 a prova não decide', N, "    if (prova.status >= 200 && prova.status < 300) return { ok: true, formato }", "    return { ok: true, formato }", NUC),
 ('A2 a autorização pelo formato', N, "    if (!chave) return { ok: false, formato, status: 401,", "    if (!chave || formato !== 'jwt') return { ok: false, formato, status: 401,", NUC),
 ('A3 o sb_secret lido como outro', N, "    if (chave.startsWith('sb_secret_')) return 'sb_secret'\n", "", NUC),
 ('K1 o motivo da função não é mapeado', CLI, "const motivo = MOTIVO_DA_FUNCAO[String(corpo.motivo)] ?? 'audio_nao_transcrito'", "const motivo: MotivoDaRecusa = 'audio_nao_transcrito'", NUC),
 ('K2 sem o Authorization', CLI, "Authorization: `Bearer ${chave.valor}`, apikey", "apikey", NUC),
 ('M1 o áudio longo declarado não recusa', MID, "        if (m.segundos !== null && m.segundos > LIMITE_DO_AUDIO_SEGUNDOS) return", "        if (false) return", MIDIA),
 ('M2 o áudio volta a ser recusado', MID, "        return { lida: true, como: 'audio' }\n", "        return recusa('audio')\n", MIDIA),
 ('M3 a duração por extenso arredonda para baixo', MID, "    const s = Math.ceil(segundos)", "    const s = Math.floor(segundos)", MIDIA),
 ('P1 a duração declarada não é lida', PAY, "            segundos: tipo === 'audio' || tipo === 'video' ? campoSegundos(m) : null,", "            segundos: null,", MIDIA),
 ('W1 o áudio pelo endpoint do documento', WUZ, "m.tipo === 'audio' ? '/chat/downloadaudio' : ", "", MIDIA),
 ('C1 a transcrição não vira o texto', CONV, "                c = { ...c, texto: [c.texto, t.texto].filter((x) => x && x.trim()).join('\\n') }\n", "", PONTA),
 ('C2 a recusa da transcrição cala', CONV, "                    return await falar(fraseDaRecusa(c.midia, t.motivo, t.segundos !== null ? { segundos: t.segundos } : {}), 'midia-nao-lida', t.detalhe)", "                    return fim('midia-nao-lida')", PONTA),
]
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'harness'))
from trecho_unico import exigir_trecho_unico
orig = {a: open(a, encoding='utf-8').read() for a in {m[1] for m in M}}
exigir_trecho_unico((nome, [(arq, orig[arq], de, para)]) for nome, arq, de, para, _ in M)
jest = lambda s: subprocess.run(['npx', 'jest', '--ci', *s], capture_output=True, text=True)
vivas = []
try:
    for nome, arq, de, para, suites in M:
        open(arq, 'w', encoding='utf-8').write(orig[arq].replace(de, para))
        morta = jest(suites).returncode != 0
        open(arq, 'w', encoding='utf-8').write(orig[arq])
        print(f"{'morta' if morta else 'VIVA '}  {nome}", flush=True)
        if not morta: vivas.append(nome)
finally:
    for a, t in orig.items(): open(a, 'w', encoding='utf-8').write(t)
controle = [jest(s).returncode == 0 for s in (NUC, MIDIA, PONTA)]
print('controle (sem mutação):', 'verde' if all(controle) else f'VERMELHO {controle}')
print(f'{len(M) - len(vivas)} de {len(M)} mortas' + (f'; vivas: {vivas}' if vivas else ''))
sys.exit(1 if vivas or not all(controle) else 0)
