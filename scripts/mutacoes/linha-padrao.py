"""Mutações da LINHA PADRÃO EUROPA 60 (dono do produto, 19/11/2026, o levantamento 25 do Dirceu).
Uso: python3 scripts/mutacoes/linha-padrao.py <worktree>. Roda numa worktree, nunca na árvore de trabalho.
Cada trecho tem de aparecer UMA vez, ou a bateria aborta (código 3) antes de rodar suíte."""
import pathlib
import subprocess
import sys

R = pathlib.Path(sys.argv[1])
P = 'src/lib/atendimentos-ia/tipologia-padrao.ts'
C = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
M = [
    ('M1 a linha padrão é outra', P, r"const LINHA_PADRAO_RE = /\beuropa\s+60\b/", r"const LINHA_PADRAO_RE = /\beuropa\s+42\b/"),
    ('M2 sem a fronteira da palavra', P, r"const LINHA_PADRAO_RE = /\beuropa\s+60\b/", r"const LINHA_PADRAO_RE = /\beuropa\s+60/"),
    ('M3 a escolhida da 60 também troca', P, 'if (c === undefined || ehDaLinhaPadrao(c.linha)) return null', 'if (c === undefined) return null'),
    ('M4 a 60 que não cabe conta', P, 'if (!ehDaLinhaPadrao(x.linha) || !cabeNosLimites(x, item)) return false', 'if (!ehDaLinhaPadrao(x.linha)) return false'),
    ('M5 o extra não conta', P, '&& mesmosExtras(semModulacao(b.extras), semModulacao(a.extras)) && modulacaoDela', '&& modulacaoDela'),
    ('M6 os módulos não contam', P, 'b.folhas === a.folhas && b.modulos === a.modulos', 'b.folhas === a.folhas'),
    ('M7 com extra, a primeira em silêncio', P, 'iguais.length > 1 && semModulacao(a.extras).size === 0 &&', 'iguais.length > 1 &&'),
    ('M8 a primeira pela ordem de entrada', P, 'const primeira = [...iguais].sort((x, y) => (x.tipologia < y.tipologia ? -1 : x.tipologia > y.tipologia ? 1 : 0))[0]', 'const primeira = iguais[0]'),
    ('M9 LINHA: a que cabe sozinha não decide', P, '        if (cabem.length === 1) return { tipologia: cabem[0].c.tipologia }\n', ''),
    ('M10 LINHA: a 60 não decide', P, '        if (da60.length === 1) return { tipologia: da60[0].c.tipologia }\n', ''),
    ('M11 o padrão sem a linha', P, "('tipologia' in d ? { tipologia: tipologiaNaLinhaPadrao(d.tipologia, doTipo.map(({ c }) => c), item) ?? d.tipologia } : d)", 'd'),
    ('M12 o modelo sem a linha', C, '            if (da60 === null) return raw\n', '            if (da60 === null || da60 !== null) return raw\n'),
    ('M13 o dito também troca', C, "if (typeof r.tipologia !== 'string' || origemDaTipologiaProposta(r.tipologia, c.texto) !== 'escolha_do_modelo') return raw", "if (typeof r.tipologia !== 'string') return raw"),
    ('M14 o log sem a linha', C, "(r.linhaPadrao > 0 ? ` linha_padrao=${r.linhaPadrao}` : '')", "''"),
    ('M15 a regra fora do prompt', C, 'LINHA PADRÃO É A EUROPA 60', 'X'),
]
TESTES = ['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts', 'src/utils/__tests__/tipologia-padrao-atributo-por-atributo.test.ts']
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
        r = subprocess.run(['npx', 'jest', '--silent', *TESTES], cwd=R, capture_output=True, text=True, timeout=600)
        morta = r.returncode != 0
    finally:
        p.write_text(s)
    mortas += morta
    print(f"{nome}: {'MORTA' if morta else 'SOBREVIVEU'}", flush=True)
print(f'{mortas} de {len(M)} mortas')
