#!/usr/bin/env python3
"""
As MUTAÇÕES do rastro dos atributos assumidos (dono do produto, 12/11/2026, Nível 2): "cada atributo que entrou por PADRÃO vai nomeado no
rastro, com o valor e a origem". Cada uma estraga UMA coisa do trecho novo, roda as suítes e DESFAZ. M0 é o controle. Roda SOZINHO ou numa
worktree (`mutacao-na-arvore-de-trabalho.md`), e confere TODAS as mutações antes de rodar qualquer suíte (`mutacao-que-nao-se-aplica.md`).

Uso:   python3 -B mutacoes.py            (todas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
TP = 'src/lib/atendimentos-ia/tipologia-padrao.ts'
CONV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
MON = 'src/lib/atendimentos-ia/levantamento-em-montagem.ts'
T = 'src/utils/__tests__/'
SUITES = [T + s for s in ['tipologia-padrao-atributo-por-atributo.test.ts', 'atendimentos-ia-levantamento-por-nome.test.ts', 'levantamento-em-montagem.test.ts']]

MUTACOES = [
    ('R1', 'o tipo é sempre dito (a porta sem tipo esconde o padrão)', [(TP, "{ atributo: 'tipo', valor: tipoEscolhido, origem: origem(tipoDito) }", "{ atributo: 'tipo', valor: tipoEscolhido, origem: 'dito' }")]),
    ('R2', 'a porta sem tipo marca o tipo como dito', [(TP, "{ tipo = 'correr'; tipoDito = false }", "{ tipo = 'correr' }")]),
    ('R3', 'as folhas são sempre do padrão (o dito some)', [(TP, "origem: origem(ditos.folhas !== null) })", "origem: origem(false) })")]),
    ('R4', 'as folhas logam o natural, não as da escolhida', [(TP, "{ atributo: 'folhas', valor: String(a.folhas),", "{ atributo: 'folhas', valor: String(naturalDaQuantidade(tipoEscolhido)),")]),
    ('R5', 'os módulos somem do rastro', [(TP, "        else if (a.modulos !== 'variavel') lista.push(", "        else if (false) lista.push(")]),
    ('R6', 'os módulos ditos viram padrão', [(TP, "origem: origem(ditos.modulos !== null) })", "origem: origem(false) })")]),
    ('R7', 'o extra do considerado sai sempre "sem"', [(TP, "valor: a.extras.has(e) ? 'com' : 'sem', origem: origem(ditos.extras.has(e)) })", "valor: 'sem', origem: origem(ditos.extras.has(e)) })")]),
    ('R8', 'o extra dito vira padrão', [(TP, "valor: a.extras.has(e) ? 'com' : 'sem', origem: origem(ditos.extras.has(e)) })", "valor: a.extras.has(e) ? 'com' : 'sem', origem: origem(false) })")]),
    ('R9', 'o extra fora do considerado (a modulação) some do rastro', [(TP, "        for (const e of a.extras) if (!(EXTRAS_DO_CONSIDERADO as readonly string[]).includes(e)) lista.push(", "        for (const e of a.extras) if (false) lista.push(")]),
    ('R10', 'o caminho 3a (a modulação como rótulo) não registra', [(TP, "if (porModulacao.length === 1) return comRastro(decidir(porModulacao, item))", "if (porModulacao.length === 1) return decidir(porModulacao, item)")]),
    ('R11', 'o caminho exato não registra', [(TP, "if (exatas.length > 0) return comRastro(decidir(exatas, item))", "if (exatas.length > 0) return decidir(exatas, item)")]),
    # R12 saiu (12/11/2026): era equivalente — a guarda de `padraoDaEsquadria` nunca agia, porque só `comRastro` registra, e só com tipologia; a guarda saiu do código
    ('R12', 'o comRastro registra também o motivo', [(TP, "        if (!('tipologia' in d)) return d\n        const escolhida", "        const escolhida")]),
    ('R13', 'a cor da base não entra no rastro', [(CONV, "                assumir(item.ordem, [{ atributo: 'cor', valor: corPredominante, origem: 'base_de_conhecimento' }])\n", "")]),
    ('R14', 'o vidro da instrução não entra no rastro', [(CONV, "            if (typeof vidro === 'string') assumir(ordem, [{ atributo: 'vidro', valor: vidro, origem: 'base_de_conhecimento' }])", "            void vidro")]),
    ('R15', 'a quantidade da conversa não entra no rastro', [(CONV, "        for (const ordem of proposta_.quantidadesPadrao) assumir(ordem, [{ atributo: 'quantidade', valor: '1', origem: 'padrao_da_conversa' }])\n", "")]),
    ('R16', 'a quantidade da conversa vira padrão da tipologia (a origem que mente)', [(CONV, "valor: '1', origem: 'padrao_da_conversa' }", "valor: '1', origem: 'padrao_da_tipologia' }")]),
    ('R17', 'a montagem não diz em que esquadria o vidro padrão entrou', [(MON, "vidrosPadrao += 1; vidrosPadraoNas.push(alvo.ordem) }", "vidrosPadrao += 1 }")]),
    ('R18', 'a tipologia do padrão não registra os atributos', [(CONV, "                    assumir(item.ordem, atributos)\n", "")]),
    ('R19', 'o casar não leva os assumidos', [(CONV, "            + ` assumidos=${atributosNoLog(assumidos)}`\n", "")]),
    ('R20', 'o valor no log mantém o espaço', [(TP, "    const limpo = (v: string) => v.trim().replace(/[\\s,;=/]+/g, '_')", "    const limpo = (v: string) => v.trim()")]),
    ('R21', 'o log fora de ordem', [(TP, ".filter(([, xs]) => xs.length > 0).sort(([a], [b]) => a - b)", ".filter(([, xs]) => xs.length > 0)")]),
    ('R22', 'a esquadria sem atributo aparece vazia', [(TP, ".filter(([, xs]) => xs.length > 0).sort(", ".sort(")]),
]
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
_textos = {}
def _texto(a):
    if a not in _textos: _textos[a] = open(os.path.join(RAIZ, a), encoding='utf-8').read()
    return _textos[a]
exigir_trecho_unico((i, [(a, _texto(a), de, para) for a, de, para in trocas]) for i, _d, trocas in MUTACOES)


def jest():
    return subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True).returncode


# R12: a checagem `'tipologia' in d` estreita o tipo para o TypeScript; sem ela, com um motivo, `doTipo.find` não acha `undefined` e devolve sem
# registrar — equivalente em execução. O teste "sem tipologia (um motivo), nenhum atributo" prova o comportamento.
EQUIVALENTES: set = {'R12'}


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda", flush=True)
        vivas += 0 if verde else 1
    for ident, descricao, trocas in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        originais = {a: open(os.path.join(RAIZ, a), encoding='utf-8').read() for a, _de, _para in trocas}
        try:
            novos = dict(originais)
            for a, de, para in trocas:
                novos[a] = novos[a].replace(de, para)
            for a, t in novos.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
            morta = jest() != 0
        finally:
            for a, t in originais.items():
                open(os.path.join(RAIZ, a), 'w', encoding='utf-8').write(t)
        if ident in EQUIVALENTES:
            print(f"{'morta   ' if morta else 'equival.'} {ident}: {descricao}", flush=True)
            continue
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}", flush=True)
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}", flush=True)
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
