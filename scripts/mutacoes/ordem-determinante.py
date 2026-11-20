"""Mutações da ORDEM DETERMINANTE (dono do produto, 20/11/2026): família > linha > formato > folhas/módulos > variações.
Uso: python3 scripts/mutacoes/ordem-determinante.py <worktree>. Roda numa worktree, nunca na árvore de trabalho.
Cada trecho tem de aparecer UMA vez, ou a bateria aborta (código 3) antes de rodar suíte."""
import pathlib
import subprocess
import sys

R = pathlib.Path(sys.argv[1])
O = 'src/lib/atendimentos-ia/ordem-das-tipologias.ts'
P = 'src/lib/atendimentos-ia/tipologia-padrao.ts'
C = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
M = [
    ('M1 a 60 antes da 42', O, r"[/\bEUROPA\s+42\b/, /\bEUROPA\s+60\b/, /\bDESIGN\b/]", r"[/\bEUROPA\s+60\b/, /\bEUROPA\s+42\b/, /\bDESIGN\b/]"),
    ('M2 a DESIGN antes da 60', O, r"/\bEUROPA\s+60\b/, /\bDESIGN\b/]", r"/\bDESIGN\b/, /\bEUROPA\s+60\b/]"),
    ('M3 o primeiro segmento conta como qualificador', O, "partes.length > 2 ? partes.slice(1, -1) : []", "partes.length > 1 ? partes.slice(0, -1) : []"),
    ('M4 o último segmento conta como qualificador', O, "partes.length > 2 ? partes.slice(1, -1) : []", "partes.length > 1 ? partes.slice(1) : []"),
    ('M5 o formato sem a família', O, "export const formatoDe = (p: PosicaoNaOrdem) => `${p.familia}|${p.formato}|${p.quantidade}`", "export const formatoDe = (p: PosicaoNaOrdem) => `${p.formato}|${p.quantidade}`"),
    ('M6 o formato sem as folhas', O, "export const formatoDe = (p: PosicaoNaOrdem) => `${p.familia}|${p.formato}|${p.quantidade}`", "export const formatoDe = (p: PosicaoNaOrdem) => `${p.familia}|${p.formato}`"),
    ('M7 sem as abreviações', O, "ABREVIACOES[p] ?? singular(p)", "singular(p)"),
    ('M8 sem o plural', O, "ABREVIACOES[p] ?? singular(p)", "ABREVIACOES[p] ?? p"),
    ('M9 sem os dois dígitos', O, "p.padStart(2, '0')", "p"),
    ('M10 o código pelo texto', O, "if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb\n", ""),
    ('M11 sem o desempate pelo código', O, "|| ka[2] - kb[2] || compararCodigo(a.tipologia, b.tipologia)", "|| ka[2] - kb[2]"),
    ('M12 o total de qualificadores não conta', O, "|| ka[1] - kb[1] ", ""),
    ('M13 as palavras que sobram não contam', O, "|| ka[2] - kb[2] ", ""),
    ('M14 o vidro pede', O, "'PVC', 'VIDRO'])", "'PVC'])"),
    ('M15 o pvc pede', O, "'MOVEI', 'PVC', 'VIDRO'", "'MOVEI', 'VIDRO'"),
    ('M16 o pedido não filtra', O, "return [...pedidas].every((p) => ps.has(p))", "return ps.size >= 0"),
    ('M17 a medida não conta', O, "=== melhor && cabeNosLimites(x, item))", "=== melhor)"),
    ('M18 a medida empurra para a variação', O, "=== melhor && cabeNosLimites(x, item))", "!== undefined && cabeNosLimites(x, item))"),
    ('M19 linhas desconhecidas não empatam', O, "        if (vencedoras.length > 1) return null\n", ""),
    ('M20 o módulo sem vertical vira variável', O, "vertical[1] === 'V' ? 'V' : Number(vertical[1])) : 1", "vertical[1] === 'V' ? 'V' : Number(vertical[1])) : 'variavel'"),
    ('M21 a quantidade sem número vira 1', O, "Number(folhas[1]) : 'variavel'", "Number(folhas[1]) : 1"),
    ('M22 o padrão sem a principal', P, "{ tipologia: tipologiaPrincipal(d.tipologia, comAtributos.map(({ c }) => c), item, texto) ?? d.tipologia }", "{ tipologia: d.tipologia }"),
    ('M23 o padrão sem o pedido', P, "comAtributos.map(({ c }) => c), item, texto)", "comAtributos.map(({ c }) => c), item, '')"),
    ('M24 LINHA sem a ordem', P, "        if (naMelhor.length === 1) return { tipologia: naMelhor[0].c.tipologia }\n", ""),
    ('M25 o modelo sem a principal', C, "            if (principal === null) return raw\n", "            if (principal === null || principal !== null) return raw\n"),
    ('M26 a mensagem inteira sempre', C, "const pedidas = daEsquadria.length ? daEsquadria.map((t) => t.texto).join(' ') : c.texto", "const pedidas = c.texto"),
    ('M27 o modelo sem o pedido', C, "const principal = tipologiaPrincipal(r.tipologia, tabela.candidatos, medidas, pedidas)", "const principal = tipologiaPrincipal(r.tipologia, tabela.candidatos, medidas)"),
    ('M28 a regra fora do prompt', C, 'A ORDEM DAS TIPOLOGIAS é família > linha > formato', 'X'),
]
TESTES = ['src/utils/__tests__/ordem-das-tipologias.test.ts', 'src/utils/__tests__/tipologia-padrao-atributo-por-atributo.test.ts', 'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
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
