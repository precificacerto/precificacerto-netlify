#!/usr/bin/env python3
"""
As MUTAÇÕES do trecho novo de 06/11/2026: a quantidade dita SUBSTITUI, nunca soma (o reenvio da Maria Cristina), o caminho de cada esquadria no
log, e o vidro com o rótulo uma vez. Cada uma estraga UMA coisa no arquivo de verdade, roda as suítes e DESFAZ (o arquivo volta byte a byte,
também se o processo cair). Morta = alguma suíte vermelha. M0 é o controle.

Uso:   python3 -B mutacoes-reenvio.py            (todas)
       python3 -B mutacoes-reenvio.py R1 R7      (só estas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
MONTAGEM = 'src/lib/atendimentos-ia/levantamento-em-montagem.ts'
CONVERSA = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
APANHADO = 'src/lib/atendimentos-ia/apanhado.ts'
SUITES = ['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts', 'src/utils/__tests__/tipologias-candidatas.test.ts',
          'src/utils/__tests__/apanhado.test.ts', 'src/utils/__tests__/levantamento-em-montagem.test.ts', 'src/utils/__tests__/atendimentos-ia-inbound.test.ts']

MUTACOES = [
    ('R1', MONTAGEM, 'a quantidade dita SOMA à gravada em vez de substituir', "        if (muda) g.alvo.quantidade = g.quantidade\n",
     "        if (muda) g.alvo.quantidade = (g.alvo.quantidade ?? 1) + g.quantidade\n"),
    ('R2', MONTAGEM, 'a igual à gravada é sempre ignorada (a dita não substitui)', "        const muda = (g.dita || g.linhas > 1) && g.quantidade !== g.alvo.quantidade\n",
     "        const muda = false\n"),
    ('R3', MONTAGEM, 'o 1 do padrão conta como dito', "        const dita = i.quantidade !== null && !origem.quantidadePadrao.has(original)\n", "        const dita = i.quantidade !== null\n"),
    ('R4', MONTAGEM, 'duas linhas sem quantidade não contam como total', "        const muda = (g.dita || g.linhas > 1) && g.quantidade !== g.alvo.quantidade\n",
     "        const muda = g.dita && g.quantidade !== g.alvo.quantidade\n"),
    ('R5', MONTAGEM, 'as linhas iguais da mesma mensagem não somam entre si', "            grupo.quantidade += q; grupo.linhas += 1;", "            grupo.linhas += 1;"),
    ('R6', MONTAGEM, 'o caminho diz SUBSTITUIU mesmo quando nada mudou', "caminho: muda ? 'SUBSTITUIU_QUANTIDADE' : 'IGNORADA_IGUAL' }", "caminho: 'SUBSTITUIU_QUANTIDADE' }"),
    ('R7', MONTAGEM, 'as novas iguais sem gravada perdem a soma (03/11)', "        if (!g.gravada) { if (g.linhas > 1) g.alvo.quantidade = g.quantidade; continue }\n", "        if (!g.gravada) continue\n"),
    ('R8', MONTAGEM, 'duas GRAVADAS iguais não somam mais', "        igual.quantidade = (igual.quantidade ?? 1) + (i.quantidade ?? 1)\n        fundidos += 1\n    }\n    // 2.",
     "        fundidos += 1\n    }\n    // 2."),
    ('R9', MONTAGEM, 'o caminho com a ordem errada (antes de renumerar)', "ordem: saida.indexOf(m.item) + 1,", "ordem: saida.indexOf(m.item),"),
    ('R10', MONTAGEM, 'a quantidade do padrão não é registrada', "i.quantidade = 1; quantidadesPadrao.push(i.ordem) }", "i.quantidade = 1 }"),
    ('R11', CONVERSA, 'a conversa não diz quais estavam gravadas (o defeito de antes volta)', "            gravadas: new Set(alvo ? alvo.itens.map((i) => i.ordem) : []), quantidadePadrao:",
     "            gravadas: new Set(), quantidadePadrao:"),
    ('R12', CONVERSA, 'a conversa não diz quais quantidades são do padrão', "quantidadePadrao: new Set(proposta_.quantidadesPadrao),", "quantidadePadrao: new Set(),"),
    ('R13', CONVERSA, 'o reenvio idêntico responde "não apliquei"', "        if (nadaMudou && aplicada.propostos > 0 && !reenvioIgual) return", "        if (nadaMudou && aplicada.propostos > 0) return"),
    ('R14', CONVERSA, 'o caminho não vai à linha [IA]', "(r.caminhos.length > 0 ? ` caminhos=${r.caminhos.join(',')}` : '')", "''"),
    ('R15', CONVERSA, 'o caminho não vai à linha da montagem', " caminhos=${listaNoLog(rastro.caminhos)} pendencias=", " pendencias="),
    ('R16', APANHADO, 'o rótulo vai sempre (o "vidro vidro" volta)', "    return /^vidros?\\b/.test(v.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()) ? v : `vidro ${v}`",
     "    return `vidro ${v}`"),
    ('R17', APANHADO, 'o rótulo nunca vai', "    return /^vidros?\\b/.test(v.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()) ? v : `vidro ${v}`", "    return v"),
    ('R18', APANHADO, 'a comparação olha a caixa', ".replace(/[\\u0300-\\u036f]/g, '').toLowerCase()) ? v", ".replace(/[\\u0300-\\u036f]/g, '')) ? v"),
    ('R19', APANHADO, 'a comparação olha o acento', "v.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()", "v.toLowerCase()"),
    ('R20', APANHADO, 'a linha do apanhado volta ao rótulo fixo', "mm, ${vidroNoApanhado(e.vidro)}.`)", "mm, vidro ${e.vidro ?? '?'}.`)"),
]


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
