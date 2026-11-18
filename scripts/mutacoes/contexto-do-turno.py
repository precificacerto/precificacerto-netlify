#!/usr/bin/env python3
"""Mutações do CONTEXTO DO TURNO (dono do produto, 18/11/2026 — o "Sim" do Alfredo Soares que fechou o levantamento da Daiane Pilger): a montagem
só captura a mensagem quando é o levantamento da ÚLTIMA saída; a confirmação guardada que cita outro não vale; o "sim" solto diz que não entendeu;
a saída grava o levantamento do turno; sem a 20261118000005, a montagem só se alcança pelo nome. Roda SOZINHA ou numa worktree."""
import os, subprocess, sys
L = 'src/lib/atendimentos-ia/'
CONV, GRAV = L + 'conversa-da-ia.ts', L + 'conversa-gravada.ts'
T = ['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts', '-t', '(44)|\\(25\\)|DUAS montagens vivas']
M = [
 ('C1 a montagem volta a ser escolhida pelo estado', CONV, "        const emMontagem = contextoDoTurno === null ? undefined : montagensVivas.find((l) => l.id === contextoDoTurno)", "        const emMontagem = candidata"),
 ('C2 sem migração, a montagem captura', CONV, "        const contextoDoTurno = contextoLido === 'sem_migracao' ? null : contextoLido.levantamentoId", "        const contextoDoTurno = contextoLido === 'sem_migracao' ? (candidata?.id ?? null) : contextoLido.levantamentoId"),
 ('C3 a confirmação de outro levantamento vale', CONV, "            && valida.levantamentos[0] !== contextoDoTurno\n", "            && false\n"),
 ('C4 o sim solto pede o nome (escolhe seguir)', CONV, "                if (lido === null && confirma !== null && aberta === null && emEspera.length === 0) {", "                if (false) {"),
 ('C5 a saída não leva o levantamento', CONV, "texto, idDoEnvio, rastro.levantamento !== '-' ? rastro.levantamento : null)", "texto, idDoEnvio, null)"),
 ('C6 o sim solto na montagem mexe nela', CONV, "        if (emMontagem && !saiDaMontagem && confirma !== null && emEspera.length === 0 && !pendenciaAberta && perguntaDasCondicoesAberta === null) {", "        if (false) {"),
 ('C7 o log sem a marca da migração', CONV, "        if (contextoLido === 'sem_migracao') rastro.contextoDoTurno = 'sem_migracao'\n", ""),
 ('G1 o contexto é a primeira saída, não a última', GRAV, "        .eq('tenant_id', tenantId).eq('conversa_id', conversaId).eq('direcao', 'saida').gte('criado_em', desde)\n        .order('criado_em', { ascending: false }).limit(1).maybeSingle()", "        .eq('tenant_id', tenantId).eq('conversa_id', conversaId).eq('direcao', 'saida').gte('criado_em', desde)\n        .order('criado_em', { ascending: true }).limit(1).maybeSingle()"),
 ('G2 a saída grava sem a coluna mesmo com ela', GRAV, "    const comContexto = await supabaseAdmin.from('orcamentista_mensagem').insert({ ...linha, responde_a: respondeA, levantamento_id: levantamentoId })", "    const comContexto = await supabaseAdmin.from('orcamentista_mensagem').insert({ ...linha, responde_a: respondeA })"),
 ('G3 a coluna ausente lança', GRAV, "        if (colunaAusente(error)) return 'sem_migracao'\n        throw new Error(`orcamentista_mensagem: ${error.message}`)\n    }\n    const id", "        throw new Error(`orcamentista_mensagem: ${error.message}`)\n    }\n    const id"),
]
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'harness'))
from trecho_unico import exigir_trecho_unico
orig = {a: open(a, encoding='utf-8').read() for a in {m[1] for m in M}}
exigir_trecho_unico((nome, [(arq, orig[arq], de, para)]) for nome, arq, de, para in M)
jest = lambda: subprocess.run(['npx', 'jest', '--ci', *T], capture_output=True, text=True)
vivas = []
try:
    for nome, arq, de, para in M:
        open(arq, 'w', encoding='utf-8').write(orig[arq].replace(de, para))
        morta = jest().returncode != 0
        open(arq, 'w', encoding='utf-8').write(orig[arq])
        print(f"{'morta' if morta else 'VIVA '}  {nome}", flush=True)
        if not morta: vivas.append(nome)
finally:
    for a, t in orig.items(): open(a, 'w', encoding='utf-8').write(t)
controle = jest().returncode == 0
print('controle (sem mutação):', 'verde' if controle else 'VERMELHO')
print(f'{len(M) - len(vivas)} de {len(M)} mortas' + (f'; vivas: {vivas}' if vivas else ''))
sys.exit(1 if vivas or not controle else 0)
