import subprocess, sys, os
# MUTACOES do pedido 0034-B (dono do produto, 26/11/2026): o modo PEDIDO TOTAL (as barras inteiras do pedido, rateadas pelo consumo), a
# gravacao do modo e de quem escolheu, a rota, a travessia e a palavra do vendedor. Roda SOZINHO na arvore. SO=<trecho>. Aborta (3) se o trecho
# nao aparece UMA vez.
# 1a passada 19/20: o residuo do bruto no maior item sobrevivia (o caso fechava ao centavo); ganhou o caso das tres partes iguais. 20/20.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'atendimentos-ia-custo-do-orcamento.test.ts', U + 'atendimentos-ia-orcamento-calculado.test.ts', U + 'atendimentos-ia-travessia-do-levantamento.test.ts',
     U + 'pedido-total-na-conversa.test.ts', U + 'atendimentos-ia-orcamentos-ia-tela.test.tsx']
L = 'src/lib/atendimentos-ia/'
CO, OC, TR, CV = L + 'custo-do-orcamento.ts', L + 'orcamento-calculado.ts', L + 'travessia-do-levantamento.ts', L + 'conversa-da-ia.ts'
RT = 'src/pages/api/atendimentos-ia/orcamentos/[id]/calcular.ts'
TL = 'src/pages/atendimentos-ia/orcamentos-ia/[id].tsx'
M = [
 (CO, "    if (e.aproveitamento === 'pedido_total') {\n        for (const [chave, u] of unidade) {", "    if (false) {\n        for (const [chave, u] of unidade) {"),
 (CO, "            const total = { bruto: n * (brutoDe(u.m) as number), liquido: n * u.liquido }", "            const total = { bruto: (brutoDe(u.m) as number), liquido: u.liquido }"),
 (CO, "            porItem.forEach((q, k) => { if (q > porItem[maior]) maior = k })", ""),
 (CO, "            const centavo = (v: number) => Math.round(v * 100) / 100", "            const centavo = (v: number) => v"),
 (CO, "                bruto: total.bruto - outros.reduce((t, x) => t + x.bruto, 0),", "                bruto: partes[maior].bruto,"),
 (CO, "            if (u.m.caminho !== 'perfil') continue", ""),
 (CO, "    if (e.aproveitamento === 'pedido_total') return { ok: true, modo: MODO_DO_PEDIDO_TOTAL,", "    if (false) return { ok: true, modo: MODO_DO_PEDIDO_TOTAL,"),
 (OC, "    const { orc, doLevantamento, fonte, custo } = await custoDeAgora(tenantId, id, escolha ? 'pedido_total' : 'consumo')", "    const { orc, doLevantamento, fonte, custo } = await custoDeAgora(tenantId, id, 'consumo')"),
 (OC, "        if (error && escolha && error.code === '23514') throw new ErroDoCalculo([FRASE_SEM_MIGRACAO_DO_PEDIDO_TOTAL])", ""),
 (OC, "        if (error && escolha && error.code === '23514') throw new ErroDoCalculo([FRASE_SEM_MIGRACAO_DO_PEDIDO_TOTAL])", "        if (error && error.code === '23514') throw new ErroDoCalculo([FRASE_SEM_MIGRACAO_DO_PEDIDO_TOTAL])"),
 (OC, "aproveitamento_motivo: MOTIVO_DO_PEDIDO_TOTAL, aproveitamento_por: escolha.por }", "aproveitamento_motivo: MOTIVO_DO_PEDIDO_TOTAL, aproveitamento_por: 'x' }"),
 (OC, "        ...aproveitamento,\n        valor_total_bruto,", "        valor_total_bruto,"),
 (RT, "pedido === 'pedido_total' ? { modo: 'pedido_total', por: caller.user_id } : null)", "null)"),
 (RT, "        if (pedido !== 'consumo' && pedido !== 'pedido_total') return", "        if (false) return"),
 (TR, "            if (a.semMudanca && reenviar && !escolha) {", "            if (a.semMudanca && reenviar) {"),
 (TR, "        const c = await calcularOrcamento(tenantId, r.orcamento.id, undefined, undefined, escolha)", "        const c = await calcularOrcamento(tenantId, r.orcamento.id, undefined, undefined, null)"),
 (TR, "        if (escolha) questionamentos = [fraseDoPedidoTotal(n), questionamentos].filter(Boolean).join('\\n\\n')", ""),
 (CV, "    return /\\bpedido\\s+total\\b/.test(t) || /\\bpelas?\\s+barras?(\\s+inteiras?)?\\b/.test(t)", "    return /\\bpedido\\s+total/.test(t) || /barras?/.test(t)"),
 (CV, "    const t = texto.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()", "    const t = texto"),
 (TL, "<Button loading={calculando} onClick={() => { void calcular('pedido_total') }}", "<Button loading={calculando} onClick={() => { void calcular('consumo') }}"),
]
M = [x for x in M if os.environ.get('SO', '') in x[1]]
for arq, a, b in M:
    n = open(R + arq).read().count(a)
    if n != 1: print('ABORTA', arq, a[:70], n); sys.exit(3)
mortas = 0
for arq, a, b in M:
    s = open(R + arq).read()
    open(R + arq, 'w').write(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', *T], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:70].replace('\n', ' ') + '  =>  ' + b[:70].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
