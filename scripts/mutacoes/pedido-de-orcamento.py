"""Mutações do pedido de orçamento que traz o ORÇAMENTO (dono do produto, 19/11/2026, o caso da Daiane Pilger).
Uso: python3 scripts/mutacoes/pedido-de-orcamento.py <worktree>. Roda numa worktree, nunca na árvore de trabalho.
Cada trecho tem de aparecer UMA vez, ou a bateria aborta (código 3) antes de rodar suíte."""
import pathlib
import subprocess
import sys

R = pathlib.Path(sys.argv[1])
C = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
M = [
    ('M1 sem orçamento não marca o pedido', "if (orcamentos.length === 0 && levantamentosDoNome.length > 0) pedidoDoOrcamento = new Set(levantamentosDoNome.map((l) => l.id))", ''),
    ('M2 com o apanhado aberto, a mensagem com esquadria vale como pedido', "if (lido !== null && proposta.novo !== true && emEspera.length === 0 && pedidoDoResgate(c.texto) === 'orcamento') {\n                    const orcamentos = ordemDoOrcamento(await lerOrcamentosDosLevantamentos(c.tenantId, [doApanhado]))", "if (lido !== null && proposta.novo !== true && pedidoDoResgate(c.texto) === 'orcamento') {\n                    const orcamentos = ordemDoOrcamento(await lerOrcamentosDosLevantamentos(c.tenantId, [doApanhado]))"),
    # M3 (o `pedidoDoOrcamento.has(rastro.levantamento)` trocado por `true`) é EQUIVALENTE no fluxo de hoje: o conjunto só é montado com os levantamentos do nome dito,
    # e o levantamento do turno é resolvido pelo mesmo nome (o nome sem levantamento não monta o conjunto). Fica como guarda; fora da bateria.
    ('M4 o pedido não vai ao orçamento', 'const vaiAoOrcamento = confirmouApanhado || simVale || pediuOrcamento', 'const vaiAoOrcamento = confirmouApanhado || simVale'),
    ('M5 com o apanhado aberto, o existente não vai', 'if (orcamentos.length > 0) return await mandarOrcamento(orcamentos[0])', ''),
    ('M6 com o apanhado aberto, não marca o pedido', '                    pedidoDoOrcamento = new Set([doApanhado.id])', ''),
    ('M7 a travessia sem o pedido', "if (vaiAoOrcamento && levantamento.desfecho === 'levantou'", "if ((confirmouApanhado || simVale) && levantamento.desfecho === 'levantou'"),
    ('M8 o log sem a marca', " orcamento_pedido=sim`.trim()", "`.trim()"),
]
TESTES = ['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
s0 = (R / C).read_text()
for nome, a, _ in M:
    if s0.count(a) != 1:
        print(f'{nome}: o trecho aparece {s0.count(a)} vezes')
        sys.exit(3)
mortas = 0
for nome, a, b in M:
    (R / C).write_text(s0.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', '--silent', *TESTES], cwd=R, capture_output=True, text=True, timeout=600)
        morta = r.returncode != 0
    finally:
        (R / C).write_text(s0)
    mortas += morta
    print(f"{nome}: {'MORTA' if morta else 'SOBREVIVEU'}", flush=True)
print(f'{mortas} de {len(M)} mortas')
