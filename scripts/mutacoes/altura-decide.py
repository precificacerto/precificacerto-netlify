"""Mutações das regras de 19/11/2026 (dono do produto): a altura é a segunda medida, a altura decide janela × porta-janela,
a persiana é de correr — e o texto da foto entra nos trechos.
Uso: python3 scripts/mutacoes/altura-decide.py <worktree>. Roda numa worktree, nunca na árvore de trabalho.
Cada trecho tem de aparecer UMA vez, ou a bateria aborta (código 3) antes de rodar suíte."""
import pathlib
import subprocess
import sys

R = pathlib.Path(sys.argv[1])
T = 'src/lib/atendimentos-ia/tipologias-candidatas.ts'
C = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
P = 'src/lib/atendimentos-ia/pergunta-em-aberto.ts'
M = [
    ('M1 a fronteira >= vira >', T, "alturaMm >= ALTURA_DA_PORTA_MM ? 'porta'", "alturaMm > ALTURA_DA_PORTA_MM ? 'porta'"),
    ('M2 a fronteira 2000 vira 2100', T, 'ALTURA_DA_PORTA_MM = 2000', 'ALTURA_DA_PORTA_MM = 2100'),
    ('M3 porta e janela trocadas', T, "? 'porta' : 'janela')", "? 'janela' : 'porta')"),
    ('M4 a palavra deixa de vencer', T, 'dita ?? (todas.length === 1', '(todas.length === 1'),
    ('M5 duas medidas decidem', T, 'todas.length === 1 ? aberturaPelaAltura', 'todas.length >= 1 ? aberturaPelaAltura'),
    ('M6 a persiana sem a altura', T, "medidas.length === 1 ? aberturaPelaAltura(medidas[0].altura_mm as number) : 'janela'", "'janela'"),
    ('M7 a ordem escrita ignorada', T, 'return trocada && !naOrdem ? { largura_mm: m.altura_mm, altura_mm: m.largura_mm } : m', 'return m'),
    ('M8 troca mesmo na ordem', T, 'trocada && !naOrdem ?', 'trocada ?'),
    ('M9 o texto da foto fora dos trechos', C, '[textoDaImagem, textoDaFotoGuardado]', '[]'),
    ('M10 o texto guardado fora', C, '[textoDaImagem, textoDaFotoGuardado]', '[textoDaImagem]'),
    ('M11 o texto não guardado na confirmação', C, 'texto: textoDaImagem', 'texto: undefined'),
    ('M12 a leitura do texto guardado', P, "if (typeof o.texto === 'string' && o.texto.trim()) d.texto = o.texto.trim()", ''),
    ('M13 a regra da altura fora do prompt', C, 'ALTURA DECIDE ENTRE JANELA E PORTA', 'X'),
    ('M14 a persiana fora do prompt', C, 'PERSIANA É SEMPRE DE CORRER', 'X'),
]
TESTES = [
    'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts',
    'src/utils/__tests__/tipologia-padrao-atributo-por-atributo.test.ts',
    'src/utils/__tests__/tipologias-candidatas.test.ts',
    'src/utils/__tests__/persiana-e-pano-confirmado.test.ts',
]
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
