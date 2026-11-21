"""Mutações da PALAVRA QUE DECIDE (dono do produto, 20/11/2026): porta antes da medida é porta-janela; janela, ou nenhuma, é janela; o formato
padrão é de correr; a altura não decide. Uso: python3 scripts/mutacoes/palavra-decide.py <worktree>. Roda numa worktree.
Cada trecho tem de aparecer UMA vez, ou a bateria aborta (código 3) antes de rodar suíte."""
import pathlib
import subprocess
import sys

R = pathlib.Path(sys.argv[1])
T = 'src/lib/atendimentos-ia/tipologias-candidatas.ts'
P = 'src/lib/atendimentos-ia/tipologia-padrao.ts'
C = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
M = [
    ('M1 sem palavra é porta', T, "export const ABERTURA_SEM_PALAVRA: Abertura = 'janela'", "export const ABERTURA_SEM_PALAVRA: Abertura = 'porta'"),
    ('M2 sem palavra fica sem abertura', T, "const abertura = dita ?? (palavrasDeAbertura(linha).size === 0 ? ABERTURA_SEM_PALAVRA : null)", "const abertura = dita"),
    ('M3 a primeira palavra em vez da última', T, "for (const m of semAcento(texto).matchAll(/\\bporta[\\s-]+janelas?\\b|\\bportas?\\b|\\bjanelas?\\b/g)) ultima =", "for (const m of semAcento(texto).matchAll(/\\bporta[\\s-]+janelas?\\b|\\bportas?\\b|\\bjanelas?\\b/g)) if (ultima === null) ultima ="),
    ('M4 a linha com as duas palavras não se parte', T, "                if (porMedida) { trechos.push(...porMedida); continue }\n", ""),
    ('M5 a persiana sem palavra volta à altura', T, "    if (palavrasDeAbertura(linha).size === 0) acrescimo.push(ABERTURA_SEM_PALAVRA)", "    if (palavrasDeAbertura(linha).size === 0) acrescimo.push('porta')"),
    ('M6 a janela sem tipo não tem padrão', P, "    else { tipo = 'correr'; tipoDito = false }", "    else if (abertura === 'porta') { tipo = 'correr'; tipoDito = false }\n    else return falta({ motivo: 'JANELA_SEM_TIPO' }, fraseDaJanelaSemTipo(tiposDaEmpresa))"),
    ('M7 sem trecho ligado, nada vale', P, "doItem.length === 0 && deTodos.size === 1 ? [...deTodos][0] : ", ""),
    ('M8 a regra fora do prompt', C, 'A PALAVRA DECIDE ENTRE JANELA E PORTA', 'X'),
    ('M9 o formato padrão fora do prompt', C, 'O FORMATO PADRÃO É DE CORRER', 'X'),
]
TESTES = ['src/utils/__tests__/tipologias-candidatas.test.ts', 'src/utils/__tests__/tipologia-padrao-atributo-por-atributo.test.ts',
          'src/utils/__tests__/persiana-e-pano-confirmado.test.ts', 'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
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
