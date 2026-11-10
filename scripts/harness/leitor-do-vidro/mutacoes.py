#!/usr/bin/env python3
"""
As MUTAÇÕES do leitor canônico do vidro (08/11/2026, o caso "Antonio Rock"): `lerVidro` e `vidroComEspessura` em `vidro.ts`, as espessuras
aceitas da tipologia e a falta do vidro ambíguo em `levantamento-da-conversa.ts`. Cada uma estraga UMA coisa no arquivo de verdade, roda as
suítes e DESFAZ (o arquivo volta byte a byte, também se o processo cair). Morta = alguma suíte vermelha. M0 é o controle.

Roda SOZINHO ou numa worktree (`docs/regras/mutacao-na-arvore-de-trabalho.md`): nada lê a árvore enquanto ele roda.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py V1 V7      (só estas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
VIDRO = 'src/lib/atendimentos-ia/vidro.ts'
CONVERSA = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
SUITES = ['src/utils/__tests__/vidro.test.ts', 'src/utils/__tests__/levantamento-da-conversa.test.ts', 'src/utils/__tests__/levantamento-caso-gerson-boss.test.ts',
          'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts', 'src/utils/__tests__/levantamento-em-montagem.test.ts']

MUTACOES = [
    ('V1', VIDRO, 'o número sem unidade vale sempre (sem olhar a lista)', "aceitas === null ? [] : distintos(numeros.flatMap((n) => (n.valor !== null && aceitas.includes(n.valor) ? [n.valor] : [])))",
     "distintos(numeros.flatMap((n) => (n.valor !== null ? [n.valor] : [])))"),
    ('V2', VIDRO, 'o número sem unidade nunca vale (o defeito do Antonio Rock volta)', "aceitas === null ? [] : distintos(", "true ? [] : distintos("),
    ('V3', VIDRO, 'a com unidade não ganha das sem unidade', "    const candidatas = comUnidade.length > 0\n", "    const candidatas = false\n"),
    ('V4', VIDRO, 'o ambíguo escolhe a primeira em vez de perguntar', "    if (candidatas.length > 1) return { espessura_mm: null, espessuras_ambiguas: candidatas }",
     "    if (candidatas.length > 1) return { espessura_mm: candidatas[0], espessuras_ambiguas: null }"),
    ('V5', VIDRO, 'o mesmo número dito duas vezes fica ambíguo', "const distintos = (ns: number[]) => [...new Set(ns)].sort((a, b) => a - b)", "const distintos = (ns: number[]) => [...ns].sort((a, b) => a - b)"),
    ('V6', VIDRO, '"milímetros" não é unidade', "(?:mm|mil[ií]metros?)", "(?:mm)"),
    ('V7', VIDRO, 'a vírgula decimal não é lida', ".replace(/,/g, '.'))", ")"),
    ('V8', VIDRO, 'a composição vira a primeira parte', "const valor = numero.includes('+') ? null : Number(numero)", "const valor = Number(numero.split('+')[0])"),
    ('V9', VIDRO, 'a composição não é laminado', "    if (leitura.tipo === null && leitura.numeros.some((n) => n.includes('+'))) leitura.tipo = 'laminado'\n", ""),
    ('V10', VIDRO, 'a frase de exemplo acrescenta sem tirar o número ("incolor 4 4 mm" volta)', "    if (numeros.length === 0) return `${texto} ${n}`", "    if (true) return `${texto} ${n}`"),
    ('V11', VIDRO, 'a frase de exemplo não tira os outros números', "        r = `${r.slice(0, x.inicio - (antes?.[0].length ?? 0))} ${r.slice(x.fim + (depois?.[0].length ?? 0))}`", "        void antes; void depois"),
    ('V12', VIDRO, 'o "ou" fica pendurado', "        r = `${r.slice(0, x.inicio - (antes?.[0].length ?? 0))} ${r.slice(x.fim + (depois?.[0].length ?? 0))}`",
     "        r = `${r.slice(0, x.inicio)} ${r.slice(x.fim)}`"),
    ('V13', VIDRO, 'o alvo da troca é sempre o primeiro número (não o com unidade)', "const alvo = numeros.find((x) => x.comUnidade) ?? numeros[0]", "const alvo = numeros[0]"),
    ('V14', VIDRO, 'a cor não sai do leitor', "        if (p in CORES) { leitura.cor ??= CORES[p]; continue }\n", "        if (p in CORES) continue\n"),
    ('V15', VIDRO, 'a forma canônica perde o número sem unidade', "espessura: l.numeros[0] ?? null,", "espessura: l.espessura_mm === null ? null : String(l.espessura_mm),"),
    ('V16', CONVERSA, 'o cálculo não passa as espessuras da tipologia ao leitor', "lerVidro(e.vidro, espessurasAceitasDaTipologia(lidas[dg.esquadrias[k].tipologia]))", "lerVidro(e.vidro)"),
    ('V17', CONVERSA, 'as aceitas são só as da primeira linha de baguete', "        if (lista.every((x) => /^\\d+$/.test(x))) for (const x of lista) aceitas.add(Number(x))\n",
     "        if (lista.every((x) => /^\\d+$/.test(x)) && aceitas.size === 0) for (const x of lista) aceitas.add(Number(x))\n"),
    ('V18', CONVERSA, 'o ambíguo não vira falta (segue sem espessura)', "    if (ambiguas.length) return { faltas: ambiguas,", "    if (false) return { faltas: ambiguas,"),
]
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
exigir_trecho_unico((i, [(a, open(os.path.join(RAIZ, a), encoding='utf-8').read(), v, n)]) for i, a, _d, v, n in MUTACOES)


def jest():
    return subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True).returncode


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda")
        vivas += 0 if verde else 1
    for ident, arquivo, descricao, velho, novo in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        caminho = os.path.join(RAIZ, arquivo)
        original = open(caminho, encoding='utf-8').read()
        if original.count(velho) != 1:
            raise SystemExit(f'{ident}: o trecho aparece {original.count(velho)} vez(es) em {arquivo} — a mutação precisa ser revista')
        try:
            open(caminho, 'w', encoding='utf-8').write(original.replace(velho, novo))
            morta = jest() != 0
        finally:
            open(caminho, 'w', encoding='utf-8').write(original)
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}")
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}")
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
