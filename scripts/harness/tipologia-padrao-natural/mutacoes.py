#!/usr/bin/env python3
"""
As MUTAÇÕES do padrão atributo por atributo (dono do produto, 11/11/2026, "fechando a classe do apanhado", Nível 3): o natural de cada
atributo (extras ausentes, correr = 2 folhas, maxim-ar = 1 módulo, maxim-ar e fixo só na janela), as guardas (o fixo da bandeira, a palavra de
tipo sem o tipo no motor, o dito sem representação, os módulos ditos), a falta nomeada da LINHA, a linha CONSIDERADO na folha, as perguntas que
não existem mais e os textos do prompt. Cada uma estraga UMA coisa no arquivo de verdade, roda as suítes e DESFAZ. M0 é o controle. Roda
SOZINHO ou numa worktree (`mutacao-na-arvore-de-trabalho.md`), e confere TODAS as mutações antes de rodar qualquer suíte
(`mutacao-que-nao-se-aplica.md`).

Uso:   python3 -B mutacoes.py            (todas)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
TP = 'src/lib/atendimentos-ia/tipologia-padrao.ts'
CONV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
PRE = 'src/lib/atendimentos-ia/pre-definicao.ts'
FOLHA = 'src/lib/atendimentos-ia/folha-do-levantamento.ts'
ARQ = 'src/lib/atendimentos-ia/arquivo-do-levantamento.ts'
BASE = 'src/utils/atendimentos-ia-prompt-base.ts'
T = 'src/utils/__tests__/'
SUITES = [T + s for s in ['tipologia-padrao-atributo-por-atributo.test.ts', 'atendimentos-ia-levantamento-por-nome.test.ts',
          'folha-do-levantamento.test.ts', 'arquivo-do-levantamento.test.ts', 'levantamento-em-montagem.test.ts', 'tipologias-candidatas.test.ts']]

MUTACOES = [
    # o natural de cada atributo
    ('N1', 'os extras não precisam bater (o defeito central de volta, ao contrário)', [(TP, '    const exatas = doTipo.filter(({ a }) => mesmosExtras(a.extras, ditos.extras))', '    const exatas = doTipo')]),
    ('N2', 'os extras só precisam conter os ditos (a persiana dita traz bandeira junto)', [(TP, 'const mesmosExtras = (a: ReadonlySet<Extra>, b: ReadonlySet<Extra>) => a.size === b.size && [...a].every((e) => b.has(e))', 'const mesmosExtras = (a: ReadonlySet<Extra>, b: ReadonlySet<Extra>) => [...b].every((e) => a.has(e))')]),
    # a regra geral da quantidade (11/11/2026): correr 2, todo o resto 1, mais de um só se dito
    ('N3', 'o natural do correr vira 3 folhas', [(TP, '(tipo === TIPO_DE_DUAS_FOLHAS ? 2 : 1)', '(tipo === TIPO_DE_DUAS_FOLHAS ? 3 : 1)')]),
    ('N3b', 'o natural do resto vira 2', [(TP, '(tipo === TIPO_DE_DUAS_FOLHAS ? 2 : 1)', '(tipo === TIPO_DE_DUAS_FOLHAS ? 2 : 2)')]),
    ('N3c', 'a regra vira lista de tipos (só a maxim-ar ganha 1)', [(TP, '(tipo === TIPO_DE_DUAS_FOLHAS ? 2 : 1)', "(tipo === TIPO_DE_DUAS_FOLHAS ? 2 : tipo === 'maxim-ar' ? 1 : 0)")]),
    ('N4', 'as folhas ditas não valem: só o natural', [(TP, '    const folhasPedidas = ditos.folhas ?? naturalDaQuantidade(tipo)', '    const folhasPedidas = naturalDaQuantidade(tipo)')]),
    ('N5', 'a candidata sem folhas aceita qualquer número dito', [(TP, '(a.folhas === null && (ditos.folhas === null || ditos.folhas === 1))', '(a.folhas === null)')]),
    ('N6', 'os módulos não filtram', [(TP, '        && (!comModulos || a.modulos === null || a.modulos === naturalDaQuantidade(tipo)))', '        && true)')]),
    ('N7', 'os módulos ditos diferentes do natural passam', [(TP, "    if (comModulos && ditos.modulos !== null && ditos.modulos !== naturalDaQuantidade(tipo)) return { motivo: 'MODULOS_DITOS' }\n", '')]),
    # MAXIM-AR COM BANDEIRA CONTINUA 1 MÓDULO (11/11/2026): a bandeira não pode voltar a derrubar o módulo
    ('B1', 'a bandeira dita derruba o módulo (volta o tudo ou nada)', [(TP, "    if (comModulos && ditos.modulos !== null && ditos.modulos !== naturalDaQuantidade(tipo)) return { motivo: 'MODULOS_DITOS' }", "    if (comModulos && (ditos.extras.has('bandeira') || (ditos.modulos !== null && ditos.modulos !== naturalDaQuantidade(tipo)))) return { motivo: 'MODULOS_DITOS' }")]),
    ('B2', 'a folha perde o "1 módulo" quando há bandeira', [(TP, "    else if (a.modulos !== 'variavel' && modulosHorizontais !== null) {", "    else if (a.modulos !== 'variavel' && modulosHorizontais !== null && !a.extras.has('bandeira')) {")]),
    ('G8', '"janela fixa" (feminino) deixa de dizer o tipo Fixo', [('src/lib/atendimentos-ia/tipologias-candidatas.ts', "    const comGenero = (p: string) => (p.endsWith('o') ? `${p.slice(0, -1)}[oa]` : p)", '    const comGenero = (p: string) => p')]),
    ('L6', 'a gêmea na mesma linha vira falta de LINHA', [(TP, "        if (diferem.length === 0 && linhas.size < 2) diferem.push('descrição')\n", '')]),
    ('N8', 'a maxim-ar sem abertura vale também para porta', [(TP, "(a.abertura === null && abertura === 'janela')", '(a.abertura === null)')]),
    ('N9', 'a porta sem tipo não é de correr', [(TP, "    else if (abertura === 'porta') tipo = 'correr'\n", '')]),
    # as guardas
    ('G1', 'o fixo da bandeira vira o tipo Fixo', [(TP, "    if ([...tiposDoMotor].some((t) => tipoCurto(t) === 'fixo') && !/\\bfix[oa]s?\\b/.test(semAcento(texto).replace(FIXO_DE_ATRIBUTO, ' '))) {", "    if (false) {")]),
    ('G2', 'a palavra de tipo sem o tipo no motor cai no correr', [(TP, "    else if (PALAVRA_DE_TIPO.test(semAcento(texto).replace(FIXO_DE_ATRIBUTO, ' '))) return { motivo: 'TIPO_FORA_DO_MOTOR' }\n", '')]),
    ('G3', 'o dito sem representação passa em silêncio', [(TP, "    if (ditos.semRepresentacao) return { motivo: 'DITO_SEM_REPRESENTACAO' }\n", '')]),
    ('G4', 'o tipo fora do motor passa', [(TP, "    if (ditos.tipoForaDoMotor) return { motivo: 'TIPO_FORA_DO_MOTOR' }\n", '')]),
    ('G5', 'dois tipos ditos: vale o primeiro', [(TP, "    if (tiposDoMotor.size > 1) return { motivo: 'TIPOS_DITOS' }\n", '')]),
    ('G6', 'fora dos limites vale a única', [(TP, "    if (!cabeNosLimites(unica.c, item)) return { motivo: 'LIMITES' }\n", '')]),
    ('G7', 'a linha da descrição conta como atributo', [(TP, '    const corpo = semAcento((partes.length > 1 ? partes.slice(0, -1) : partes).join(\' | \'))', "    const corpo = semAcento(partes.join(' | '))")]),
    # o que sobra em mais de uma
    ('L1', 'duas candidatas: vale a primeira', [(TP, '    if (restantes.length > 1) {', '    if (false) {')]),
    ('L2', 'atributo sem natural vira falta de LINHA', [(TP, "        if (diferem.length) return { motivo: 'SEM_NATURAL', atributos: diferem, candidatas: codigos, descricoes: restantes.map(({ c }) => descricaoSemLinha(c)) }\n", '')]),
    ('L3', 'a conversa não guarda a falta do padrão', [(CONV, '                    if (frase !== null) faltasDoPadrao.push({ ordem: item.ordem, frase, motivo: padrao.motivo })', '                    void frase')]),
    ('L4', 'a conversa não responde a falta do padrão', [(CONV, '            if (semPadrao.length > 0) {', '            if (false) {')]),
    ('L7', 'a conversa só responde a LINHA (as outras faltas voltam a ser mudas)', [(CONV, '                    if (frase !== null) faltasDoPadrao.push(', "                    if (frase !== null && padrao.motivo === 'LINHA') faltasDoPadrao.push(")]),
    # a modulação (3a, 3b, 3c — 11/11/2026)
    ('M1', '3a: a única candidata pelo rótulo não é escolhida (o fixo volta a ficar sem padrão)', [(TP, '    if (porModulacao.length === 1) return decidir(porModulacao, item)\n', '')]),
    ('M2', '3b: com bandeira, a modulação não se pergunta', [(TP, "        if (outrosExtras.length > 0 && new Set(rotulos).size === porModulacao.length && rotulos.every((r) => r !== '')) {", "        if (false) {")]),
    ('M3', 'a modulação volta a contar no segundo passo', [(TP, '    const porModulacao = doTipo.filter(({ a }) => mesmosExtras(semModulacao(a.extras), semModulacao(ditos.extras)) && modulacaoDita.every((e) => a.extras.has(e)))', '    const porModulacao = doTipo.filter(({ a }) => mesmosExtras(a.extras, ditos.extras))')]),
    ('M4', 'a modulação é ignorada já no primeiro passo (a maxim-ar lisa vira ambígua)', [(TP, '    const exatas = doTipo.filter(({ a }) => mesmosExtras(a.extras, ditos.extras))', '    const exatas = doTipo.filter(({ a }) => mesmosExtras(semModulacao(a.extras), semModulacao(ditos.extras)))')]),
    ('M5', 'a modulação dita não restringe', [(TP, ' && modulacaoDita.every((e) => a.extras.has(e)))', ')')]),
    # a lacuna do motor (porta de giro de 1 folha — 11/11/2026)
    ('LC1', 'a lacuna do motor volta a ser muda', [(TP, '    if (comMais.length > 0) {', '    if (false) {')]),
    ('LC2', 'a lacuna lista também outra quantidade de folhas', [(TP, '    const comMais = doTipo.filter(({ a }) => [...ditos.extras].every((e) => a.extras.has(e)))', '    const comMais = comAtributos.filter(({ a }) => a.tipo === tipo && [...ditos.extras].every((e) => a.extras.has(e)))')]),
    ('LC3', 'a frase da falta mostra os códigos ao vendedor', [(TP, "d.descricoes.map((x) => `“${x}”`)", "d.candidatas.map((x) => `“${x}”`)")]),
    ('L5', 'a frase da LINHA sem as linhas', [(TP, "`nas linhas ${linhas.slice(0, -1).join(', ')} e ${linhas[linhas.length - 1]}`", "'nas linhas'")]),
    # a folha
    ('F1', 'a linha CONSIDERADO some da folha', [(FOLHA, "        ...(i.considerado ? [{ tipo: 'uma' as const, rotulo: ROTULO_DO_CONSIDERADO, texto: i.considerado }] : []),\n", '')]),
    ('F2', 'o arquivo não monta o considerado', [(ARQ, "            considerado: d && d.descricao ? oQueAEsquadriaE(", "            considerado: d && false ? oQueAEsquadriaE(")]),
    ('F3', 'a folha diz "com" o que não tem', [(TP, "partes.push(`${a.extras.has(e) ? 'com' : 'sem'} ${e}`)", "partes.push(`com ${e}`)")]),
    ('F4', 'os módulos da folha ignoram o número dito', [(TP, '        const total = modulosHorizontais * (a.modulos ?? 1)', '        const total = (a.modulos ?? 1)')]),
    ('F5', 'os módulos horizontais ignoram o dito', [(ARQ, '    if (typeof dita === \'number\' && Number.isInteger(dita) && dita > 0) return dita\n', '')]),
    # as perguntas que não existem mais e o prompt
    ('P1', 'a pergunta volta a pedir a persiana', [(PRE, "    'É janela ou porta? E como ela abre: de correr, de abrir, maxim-ar, pivotante ou fixa?',", "    'É janela ou porta? E como ela abre: de correr, de abrir, maxim-ar, pivotante ou fixa? Tem persiana?',")]),
    ('P2', 'a pergunta com o tipo dito volta a pedir folhas', [(PRE, "    'É janela ou porta?',\n", "    'É janela ou porta? Quantas folhas?',\n")]),
    ('P3', 'o prompt volta a pedir quantas folhas', [(BASE, 'é janela ou porta? como abre: de correr, de abrir, maxim-ar, pivotante ou fixa?', 'é janela ou porta? como abre? quantas folhas? tem persiana?')]),
    ('P4', 'o prompt base perde o SILÊNCIO NÃO É DÚVIDA', [(BASE, "    '- SILÊNCIO NÃO É DÚVIDA: É A FORMA NATURAL.", "    '- ")]),
    ('P5', 'a instrução da tipologia perde o APLIQUE E NÃO PERGUNTE', [(CONV, 'HAVENDO NATURAL, APLIQUE E NÃO PERGUNTE: ', '')]),
    ('P7', 'o prompt base perde o "todo o resto é de 1"', [(BASE, ', e todo o resto é de 1 — uma folha (abrir, giro, oscilo-batente, pivotante) ou um módulo (maxim-ar, fixa) —, mais de um só se ele disser;', ';')]),
    ('P8', 'a instrução da tipologia perde o "todo o resto = 1"', [(CONV, 'todo o resto = 1 folha ou 1 módulo, e mais de um só se dito; ', '')]),
    ('P6', 'a reformulação volta a pedir folhas e persiana', [(CONV, '(janela ou porta, como abre), nunca "qual a tipologia" — e nunca o que tem natural (folhas, módulos, persiana, bandeira, peitoril).', '(janela ou porta, como abre, quantas folhas, persiana), nunca "qual a tipologia".')]),
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


EQUIVALENTES: set = set()


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
