#!/usr/bin/env python3
"""Mutações do caso Daiane Pilger (dono do produto, 18/11/2026): a ficha por item (tipologias-candidatas.ts, `blocosDaFicha`), a linha de produto
dita (tipologia-padrao.ts, `daLinhaDita`) e a maxim-ar de um módulo com um caminho só (tipologia-padrao.ts, a modulação com N=1).
Cada mutação troca um trecho; as suítes dela têm de ficar vermelhas. Roda SOZINHA ou numa worktree (mutacao-na-arvore-de-trabalho.md).
Uso: python3 -B scripts/mutacoes/maxim-ar-de-um-modulo.py  (os arquivos voltam ao original no fim, sempre)."""
import os, subprocess, sys

LIB = 'src/lib/atendimentos-ia/'
CAND, PADRAO = LIB + 'tipologias-candidatas.ts', LIB + 'tipologia-padrao.ts'
T = 'src/utils/__tests__/'
SUITES = [T + 'tipologia-padrao-atributo-por-atributo.test.ts', T + 'tipologias-candidatas.test.ts', T + 'atendimentos-ia-levantamento-por-nome.test.ts', '-t', 'CASO DAIANE|tipologia padrão no código|ATRIBUTO POR ATRIBUTO|modula']
PURA = [T + 'tipologia-padrao-atributo-por-atributo.test.ts', T + 'tipologias-candidatas.test.ts']

# (nome, arquivo, de, para, suítes)
M = [
 # a ficha por item
 ('F1 o cabeçalho de item não abre bloco', CAND, "        if (CABECALHO_DE_ITEM.test(semAcento(linha)) && blocos[blocos.length - 1].length > 0) blocos.push([])\n", '', SUITES),
 ('F2 a medida do bloco não chega à linha', CAND, 'medidas: daFicha ? [...medidas, bloco.medida as Medidas] : medidas', 'medidas', SUITES),
 ('F3 duas larguras no bloco valem a primeira', CAND, 'larguras.length === 1 && alturas.length === 1', 'larguras.length >= 1 && alturas.length >= 1', SUITES),
 ('F4 a largura sem o rótulo de largura', CAND, "const LARGURA_ROTULADA = /\\blargura\\b\\s*(?:[:=-]\\s*)?(\\d+(?:[.,]\\d+)?)/g", "const LARGURA_ROTULADA = /\\baltura\\b\\s*(?:[:=-]\\s*)?(\\d+(?:[.,]\\d+)?)/g", SUITES),
 ('F5 o bloco não vai ao trecho', CAND, ", ...(bloco.medida !== null ? { bloco: bloco.texto } : {}) })", " })", SUITES),
 # a linha de produto dita
 ('L1 a linha dita não filtra', PADRAO, '    const comAtributos = daLinhaDita(candidatos, doItem).map(', '    const comAtributos = candidatos.map(', SUITES),
 ('L2 duas linhas ditas filtram pela primeira', PADRAO, 'return ditas.length === 1 ? candidatos.filter((c) => c.linha === ditas[0]) : candidatos', 'return ditas.length >= 1 ? candidatos.filter((c) => c.linha === ditas[0]) : candidatos', SUITES),
 ('L3 as palavras comuns (PVC WOLFF) contam', PADRAO, "        const proprio = palavras(l).filter((p) => !comuns.has(p))\n", "        const proprio = palavras(l)\n", SUITES),
 # a maxim-ar de um módulo
 ('U1 um módulo volta a perguntar', PADRAO, "        if (outrosExtras.length === 0 && (ditos.modulos === null || ditos.modulos === 1) && porModulacao", "        if (false && outrosExtras.length === 0 && (ditos.modulos === null || ditos.modulos === 1) && porModulacao", SUITES),
 ('U2 a escolha sem conferir o limite', PADRAO, '            const cabem = porModulacao.filter(({ c }) => cabeNosLimites(c, item))\n', '            const cabem = porModulacao\n', SUITES),
 ('U3 a escolha é a última do motor', PADRAO, "            return comRastro({ tipologia: cabem[0].c.tipologia })", "            return comRastro({ tipologia: cabem[cabem.length - 1].c.tipologia })", SUITES),
 ('U4 nenhuma cabendo vira a primeira', PADRAO, "            if (cabem.length === 0) return { motivo: 'LIMITES' }\n", "            if (cabem.length === 0) return comRastro({ tipologia: porModulacao[0].c.tipologia })\n", PURA),
]

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'harness'))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta com o código 3 (mutacao-que-nao-se-aplica.md)

orig = {a: open(a, encoding='utf-8').read() for a in {m[1] for m in M}}
exigir_trecho_unico((nome, [(arq, orig[arq], de, para)]) for nome, arq, de, para, _ in M)
jest = lambda suites: subprocess.run(['npx', 'jest', '--ci', *suites], capture_output=True, text=True)
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
controle = [jest(s).returncode == 0 for s in (SUITES, PURA)]
print('controle (sem mutação):', 'verde' if all(controle) else f'VERMELHO {controle}')
print(f'{len(M) - len(vivas)} de {len(M)} mortas' + (f'; vivas: {vivas}' if vivas else ''))
sys.exit(1 if vivas or not all(controle) else 0)
