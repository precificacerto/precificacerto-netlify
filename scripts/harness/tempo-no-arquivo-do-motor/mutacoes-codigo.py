#!/usr/bin/env python3
"""
As MUTAÇÕES do CÓDIGO do tempo no arquivo do motor (o leitor, o caminho pelo leitor do motor, a conferência e as frases). Cada uma estraga UMA
coisa no arquivo de verdade, roda as três suítes e DESFAZ (o arquivo volta byte a byte, também se o processo cair). Morta = alguma suíte vermelha.

Uso:   python3 -B mutacoes-codigo.py            (todas)
       python3 -B mutacoes-codigo.py C1 C7      (só estas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
LEITOR = 'src/utils/atendimentos-ia-tempos-do-motor.ts'
IMPORTACAO = 'src/utils/atendimentos-ia-importacao.ts'
CATALOGO = 'src/utils/atendimentos-ia-catalogo-de-motores.ts'
SUITES = ['src/utils/__tests__/atendimentos-ia-tempos-do-motor.test.ts', 'src/utils/__tests__/atendimentos-ia-catalogo-de-motores.test.ts',
          'src/utils/__tests__/atendimentos-ia-catalogo-de-motores-rotas.test.ts']

MUTACOES = [
    ('C1', LEITOR, 'vazio vira 0 em vez de ficar sem linha', "            continue // vazio = não informado: sem linha de tempo, nunca 0\n",
     "            if (origem.valor === null) { const c = colCodigo === undefined ? null : valorDaCelula(row.getCell(colCodigo).value).valor; if (c !== null) tempos.push({ tipologia: String(c), tempo_fabricacao_min: 0, tempo_origem: ORIGEM_PADRAO_DO_TEMPO }) }\n            continue\n"),
    ('C2', LEITOR, 'zero passa', "        if (v <= 0) {", "        if (v < 0) {"),
    ('C3', LEITOR, 'decimal passa', "        if (!Number.isInteger(v)) {", "        if (false) {"),
    ('C4', LEITOR, 'texto numérico vira número', "        if (typeof v !== 'number') {", "        if (typeof v !== 'number' && Number.isNaN(Number(v))) {"),
    ('C5', LEITOR, 'a origem padrão é outra', "export const ORIGEM_PADRAO_DO_TEMPO = 'IMPORTADO'", "export const ORIGEM_PADRAO_DO_TEMPO = 'ESTIMADO'"),
    ('C6', LEITOR, 'o limite da origem é contado em unidades UTF-16', "const caracteres = (s: string) => [...s].length", "const caracteres = (s: string) => s.length"),
    ('C7', LEITOR, 'o limite da origem é 121', "            if (n > ORIGEM_DO_TEMPO_MAX) {", "            if (n > ORIGEM_DO_TEMPO_MAX + 1) {"),
    ('C8', LEITOR, 'a origem sem tempo passa em silêncio', "            if (origem.valor !== null) erros.push(", "            if (false) erros.push("),
    ('C9', LEITOR, 'o tempo sem Código passa em silêncio', "        if (codigo.valor === null || codigo.erro) {\n            erros.push(", "        if (codigo.valor === null || codigo.erro) {\n            continue; erros.push("),
    ('C10', LEITOR, 'o cabeçalho parecido é ignorado (lido como ausente)', "            if (cabecalhoReduzido(v) === cabecalhoReduzido(esperado)) {", "            if (false) {"),
    ('C11', LEITOR, 'o cabeçalho parecido é ACEITO como o exato', "        if (v === CABECALHO_DO_TEMPO || v === CABECALHO_DA_ORIGEM || v === CABECALHO_DO_CODIGO) {",
     "        if (v === CABECALHO_DO_TEMPO || v === CABECALHO_DA_ORIGEM || v === CABECALHO_DO_CODIGO || cabecalhoReduzido(v) === cabecalhoReduzido(CABECALHO_DO_TEMPO)) {"),
    ('C12', LEITOR, 'a redução não tira o acento', ".normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')", ""),
    ('C13', LEITOR, 'o cabeçalho repetido: fica o último em silêncio', "            if (colunas.has(v)) erros.push(", "            if (false) erros.push("),
    ('C14', LEITOR, 'erro da célula do tempo é ignorado', "        if (tempo.erro) erros.push(", "        if (false) erros.push("),
    ('C15', LEITOR, 'acima do integer passa', "        if (v > MAIOR_INTEIRO_DO_BANCO) {", "        if (false) {"),
    ('C16', IMPORTACAO, 'os tempos não vão ao payload', "...lido.abas, tempos: lido.tempos, contagens", "...lido.abas, contagens"),
    ('C17', IMPORTACAO, 'a conferência não exige a contagem dos tempos', "LISTAS_DA_GRAVACAO.filter((k) => k !== 'itens'), 'tempos']", "LISTAS_DA_GRAVACAO.filter((k) => k !== 'itens')]"),
    ('C18', IMPORTACAO, 'as recusas dos tempos não recusam o arquivo', "...('erros' in tempos ? tempos.erros : [])]", "]"),
    ('C19', IMPORTACAO, 'a tabela com motor colado aceita o arquivo com tempo', "    if (tempos.length > 0) return { ok: false, erro: fraseDoArquivo(arquivos.motor.nome, fraseDosTemposNaTabela(tempos.length)) }\n", ""),
    ('C20', CATALOGO, 'a frase do motor criado não conta os tempos', "        + (typeof r.tempos === 'number' ? `${fraseDosTempos(r.tempos, tip)} ` : '')\n", ""),
    ('C21', LEITOR, 'a frase dos tempos não diz as sem tempo', "        + (sem > 0 ? `; ${sem} sem tempo (a mão de obra delas não sai).` : '.')", "        + '.'"),
]


def jest():
    p = subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True)
    return p.returncode


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
