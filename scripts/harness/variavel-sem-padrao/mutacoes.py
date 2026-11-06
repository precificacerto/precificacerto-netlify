#!/usr/bin/env python3
"""
As MUTAÇÕES do código da variável SEM PADRÃO (dono do produto, 06/11/2026: "variável sem padrão vira pergunta ao vendedor"). Cada uma estraga
UMA coisa no arquivo de verdade, roda as três suítes e DESFAZ (o arquivo volta byte a byte, também se o processo cair). Morta = alguma suíte
vermelha.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py V1 V7      (só estas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
ESCOLHAS = 'src/lib/atendimentos-ia/escolhas-da-tipologia.ts'
MONTAGEM = 'src/lib/atendimentos-ia/levantamento-em-montagem.ts'
CONVERSA = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
CALCULO = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
SUITES = ['src/utils/__tests__/escolhas-da-tipologia.test.ts', 'src/utils/__tests__/levantamento-em-montagem.test.ts',
          'src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']

MUTACOES = [
    ('V1', ESCOLHAS, 'a variável COM opções conta como sem padrão', " && !(opcoesDaVariavel(v.opcoes)?.length))", ")"),
    ('V2', ESCOLHAS, 'o Padrão só de espaço conta como padrão', ".filter((v) => (v.padrao ?? '').trim() === ''", ".filter((v) => (v.padrao ?? '') === ''"),
    ('V3', ESCOLHAS, 'a Condição não é avaliada', "dadas[v.variavel] === undefined && condicaoPede(v.condicao, efetivas))", "dadas[v.variavel] === undefined)"),
    ('V4', ESCOLHAS, 'a Condição sem os padrões numéricos da aba', "        if (/^-?\\d+(\\.\\d+)?$/.test(p)) efetivas[v.variavel] = Number(p)\n", ""),
    ('V5', ESCOLHAS, 'a variável já dada é perguntada de novo', "dadas[v.variavel] === undefined && condicaoPede", "condicaoPede"),
    ('V6', ESCOLHAS, 'zero vale como valor', "Number.isInteger(opcao) || opcao <= 0) return null", "Number.isInteger(opcao) || opcao < 0) return null"),
    ('V7', ESCOLHAS, 'o valor de qualquer variável vale', "if (typeof variavel !== 'string' || !variaveisSemPadrao(tipologia).some((v) => v.variavel === variavel)) return null",
     "if (typeof variavel !== 'string') return null"),
    ('V8', ESCOLHAS, 'o gravado ignora o valor da sem padrão', "if (capturada(k) || (deValor.has(k) && v > 0)) lidas[k] = v", "if (capturada(k)) lidas[k] = v"),
    ('V9', ESCOLHAS, 'o gravado aceita zero na sem padrão', "if (capturada(k) || (deValor.has(k) && v > 0)) lidas[k] = v", "if (capturada(k) || deValor.has(k)) lidas[k] = v"),
    ('V10', ESCOLHAS, 'o item relido perde o valor da sem padrão', "if (!capturada(k)) { if (inteiro && v > 0) lidas[k] = v; continue }", "if (!capturada(k)) continue"),
    ('V11', ESCOLHAS, 'o "(em mm)" sempre', "return /^(altura|largura|comprimento|medida)\\b/.test(nome) ? `${nome} (em mm)` : nome", "return `${nome} (em mm)`"),
    ('V12', ESCOLHAS, 'a seção do prompt sai mesmo sem variável', "    if (porLinha.size === 0) return []\n", ""),
    ('V13', MONTAGEM, 'a sem padrão não vira pendência', "        for (const variavel of variaveisAPerguntar(def, lerEscolhasGravadas(item.escolhas, def))) todas.push(", "        for (const variavel of [] as VariavelSemPadrao[]) todas.push("),
    ('V14', MONTAGEM, 'o valor dito é copiado a todas as esquadrias', "if (valor) { propostos += 1; alvo.escolhas = { ...(alvo.escolhas ?? {}), [valor.variavel]: valor.valor }; continue }",
     "if (valor) { propostos += 1; for (const i of itens) i.escolhas = { ...(i.escolhas ?? {}), [valor.variavel]: valor.valor }; continue }"),
    ('V15', MONTAGEM, 'o valor dito não entra', "if (valor) { propostos += 1; alvo.escolhas = { ...(alvo.escolhas ?? {}), [valor.variavel]: valor.valor }; continue }", ""),
    ('V16', MONTAGEM, 'a pergunta não nomeia a esquadria', "`Falta, na ${tipologia}: ${eLista(nomes)}.", "`Falta: ${eLista(nomes)}."),
    ('V17', MONTAGEM, 'a pergunta do turno não cobre a sem padrão', "        if (valores.length) partes.push(perguntaDasVariaveis(", "        if (false) partes.push(perguntaDasVariaveis("),
    ('V18', CONVERSA, 'o log não diz qual variável falta', "`e${p.ordem}:variavel:${p.variavel.variavel}`", "`e${p.ordem}:variavel`"),
    ('V19', CONVERSA, 'o prompt não leva as variáveis sem padrão', "        ...variaveisSemPadraoNoPrompt(c.variaveisSemPadraoPorTipologia),\n", ""),
    ('V20', CALCULO, 'o cálculo não recebe o valor (lê sem a tipologia)', "lerEscolhasGravadas(e.escolhas, lidas[dg.esquadrias[k].tipologia] ?? null)", "lerEscolhasGravadas(e.escolhas)"),
]


def jest():
    p = subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True)
    return p.returncode


def main():
    pedidas = set(sys.argv[1:])
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = jest() == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda", flush=True)
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
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}", flush=True)
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}")
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
