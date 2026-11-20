"""Mutações da PEÇA QUE NINGUÉM PEDIU (dono do produto, 19/11/2026: a travessa, UT, não entra por padrão).
Uso: python3 scripts/mutacoes/peca-nao-pedida.py <worktree>. Roda numa worktree, nunca na árvore de trabalho.
Cada trecho tem de aparecer UMA vez, ou a bateria aborta (código 3) antes de rodar suíte."""
import pathlib
import subprocess
import sys

R = pathlib.Path(sys.argv[1])
E = 'src/lib/atendimentos-ia/escolhas-da-tipologia.ts'
L = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
C = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
M = [
    ('M1 a lista vazia', E, r"= { UT: /\btravessas?\b/i }", '= {}'),
    ('M2 a escolha dita não vale', E, "if (!v || typeof explicitas?.[variavel] === 'number') continue", 'if (!v) continue'),
    ('M3 sem a ressalva do nome', E, '        if (descricao !== null && nome.test(semAcento_(descricao))) continue\n', ''),
    ('M4 a opção errada (a primeira)', E, r".find((o) => /^nao\b/i.test(semAcento_(o.rotulo).trim()))", '[0]'),
    ('M5 a palavra sem fronteira', E, r"/^nao\b/i", '/nao/i'),
    ('M6 a leitura descarta a gravada', E, ' || (k in PECAS_QUE_NAO_ENTRAM_POR_PADRAO && tipologia?.variaveis.some((x) => x.variavel === k))', ''),
    ('M7 o cálculo sem a regra', L, 'return t ? { ...semAsPecasNaoPedidas(t, lidasDoItem, null), ...lidasDoItem } : lidasDoItem', 'return lidasDoItem'),
    ('M8 o cálculo: a regra vence a escolha', L, '{ ...semAsPecasNaoPedidas(t, lidasDoItem, null), ...lidasDoItem }', '{ ...lidasDoItem, ...semAsPecasNaoPedidas(t, {}, null) }'),
    ('M9 a conversa não grava', C, '            if (Object.keys(acrescentadas).length === 0) return item\n', '            return item\n'),
    ('M10 o log sem a marca', C, "(r.pecasNaoPedidas > 0 ? ` sem_peca_nao_pedida=${r.pecasNaoPedidas}` : '')", "''"),
]
TESTES = ['src/utils/__tests__/peca-nao-pedida.test.ts', 'src/utils/__tests__/levantamento-da-conversa.test.ts', 'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
for nome, f, a, _ in M:
    n = (R / f).read_text().count(a)
    if n != 1:
        print(f'{nome}: o trecho aparece {n} vezes em {f}')
        sys.exit(3)
mortas = 0
for nome, f, a, b in M:
    p = R / f
    s = p.read_text()
    p.write_text(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', '--silent', *TESTES], cwd=R, capture_output=True, text=True, timeout=900)
        morta = r.returncode != 0
    finally:
        p.write_text(s)
    mortas += morta
    print(f"{nome}: {'MORTA' if morta else 'SOBREVIVEU'}", flush=True)
print(f'{mortas} de {len(M)} mortas')
