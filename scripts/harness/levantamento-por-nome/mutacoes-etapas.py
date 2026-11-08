#!/usr/bin/env python3
"""
A OBSERVABILIDADE POR ETAPA (06/11/2026) — as MUTAÇÕES DO CÓDIGO. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.

Cada mutação estraga UMA parte das cinco linhas [ETAPA n …] (`conversa-da-ia.ts`), do resumo do cálculo (`levantamento-da-conversa.ts`) ou
da variável na recusa (`levantamento-de-barras.ts`), e roda as suítes que as cobrem. Tem de DERRUBAR pelo menos um caso, e o caso exigido
(5º elemento) tem de aparecer na saída da falha. O alvo é mutado no lugar, com `.bak`, e conferido por sha256 no fim; o script recusa rodar
com o alvo sujo. NÃO COMMITE enquanto ele roda.

Uso:   python3 -B scripts/harness/levantamento-por-nome/mutacoes-etapas.py          (todas)
       python3 -B scripts/harness/levantamento-por-nome/mutacoes-etapas.py E3 E7    (só estas)
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
LB = 'src/lib/atendimentos-ia/levantamento-de-barras.ts'
T = ['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts', 'src/utils/__tests__/levantamento-da-conversa.test.ts', 'src/utils/__tests__/levantamento-de-barras.test.ts']
CONTROLE = 'M0'

M = [
 ('E1', 'as etapas 1 a 4 não saem no log', CV, [("for (const [n, nome] of ETAPAS_DO_LOG) console.error(", "for (const [n, nome] of ETAPAS_DO_LOG.slice(4)) console.error(")], '(39) observabilidade por etapa'),
 ('E2', 'a etapa não alcançada sai vazia, não "nao_chegou"', CV, [("${r.etapas[nome] ?? 'nao_chegou'}", "${r.etapas[nome] ?? ''}")], 'nao_chegou'),
 ('E3', 'a etapa 5 não diz o desfecho', CV, [("5 responder] desfecho=${desfecho} enviou=", "5 responder] enviou=")], 'o apanhado: coleta, casa, monta e grava'),
 ('E4', 'a falha da IA não aparece na coleta', CV, [("            rastro.etapas.coletar = `historico=${rastro.historico} ia=${resposta.tipo} faltou=ia`\n", "")], 'a IA que falha'),
 ('E5', 'a coleta não diz o que não foi dito', CV, [(" itens_sem_campos=${rastro.itensSemCampos} faltou=${listaNoLog(naoDitos)}`", " itens_sem_campos=${rastro.itensSemCampos} faltou=-`")], 'faltou=e1:vidro'),
 ('E6', 'o casar não diz a tipologia do padrão', CV, [("rastro.tipologiasPadrao += 1; tipologiasDoPadrao.push(`e${item.ordem}:${padrao.tipologia}`) }", "rastro.tipologiasPadrao += 1 }")], 'padrao=e1:DP-02'),
 ('E7', 'o casar não diz a recusa do código', CV, [("recusadas=${listaNoLog(aplicada.recusas.map((x) => `e${x.ordem}:${x.motivo}:${x.tipologia}`))}", "recusadas=-")], 'ABERTURA:DP-100'),
 ('E8', 'a montagem não é atualizada depois de gravar', CV, [("        gravado = true\n        rastro.etapas.montar = montagemNoLog(aplicada.itens.length)", "        gravado = true")], 'gravadas=1'),
 ('E9', 'a montagem inverte o estado', CV, [("estado=${gravadas > 0 ? (pendencia ? EM_MONTAGEM : COMPLETO) : '-'}", "estado=${gravadas > 0 ? (pendencia ? COMPLETO : EM_MONTAGEM) : '-'}")], 'estado=COMPLETO'),
 ('E10', 'a montagem não diz o que falta', CV, [("faltou=${listaNoLog(faltaNaMontagem)}`", "faltou=-`")], 'faltou=e1:vidro'),
 ('E11', 'o cálculo não sai no log', CV, [("        if (levantamento.etapa) {\n", "        if (false && levantamento.etapa) {\n")], 'o "sim"'),
 ('E12', 'o resumo conta peças por linha, não por quantidade', LC, [("e.pecas.reduce((u, p) => u + p.quantidade, 0)", "e.pecas.length")], 'O RESUMO DO CÁLCULO'),
 ('E13', 'a falta de cor não vira código', LC, [("faltou.push(`e${i + 1}:SEM_COR`)", "void 0")], 'SEM COR'),
 ('E14', 'a recusa do cálculo perde os códigos', LC, [("if (recusadas.length) return rotulado(recusa(recusadas, calculos.flatMap((c) => ('faltas' in c ? c.codigos : [])), calculos.flatMap((c) => ('faltas' in c ? c.caminhos : []))))", "if (recusadas.length) return rotulado(recusa(recusadas, [], calculos.flatMap((c) => ('faltas' in c ? c.caminhos : []))))")], 'ITEM_AUSENTE'),
 ('E15', 'a recusa do avaliador não carrega a variável', LB, [("...(x.variavel !== undefined ? { variavel: x.variavel } : {}), ", "")], 'carrega a VARIÁVEL'),
 ('M0', 'CONTROLE: nada muda', CV, []),
]

def hash_de(arq):
    return hashlib.sha256(open(arq, 'rb').read()).hexdigest()


def principal():
    alvos = sorted({m[2] for m in M})
    sujos = subprocess.run(['git', 'status', '--porcelain', '--', *alvos], capture_output=True, text=True).stdout.strip()
    if sujos:
        print('RECUSADO: arquivos-alvo com mudança não commitada — a mutação seria sobre outra coisa:\n' + sujos)
        return 1
    antes = {a: hash_de(a) for a in alvos}
    pedidas = set(sys.argv[1:])
    sobreviveu = []
    for ident, desc, arq, trocas, *exige in M:
        exige = exige[0] if exige else None
        if pedidas and ident not in pedidas:
            continue
        orig = open(arq, encoding='utf-8').read()
        novo = orig
        for velho, troca in trocas:
            n = novo.count(velho)
            if n != 1:
                print(f'{ident:4} TRECHO APARECE {n} VEZES (o código mudou; ajuste a mutação): {velho[:70]!r}')
                novo = None
                break
            novo = novo.replace(velho, troca)
        if novo is None:
            sobreviveu.append(ident)
            continue
        shutil.copy(arq, arq + '.bak')
        open(arq, 'w', encoding='utf-8').write(novo)
        try:
            p = subprocess.run(['npx', 'jest', *T, '--silent'], capture_output=True, text=True)
        finally:
            shutil.move(arq + '.bak', arq)
        out = p.stdout + p.stderr
        linhas = [l for l in out.split('\n') if l.startswith('Tests:')]
        testes = linhas[0] if linhas else ''
        falhos = re.search(r'(\d+) failed', testes)
        caidos = sorted(set(l.strip() for l in out.split('\n') if l.strip().startswith('●') and '›' in l))
        if falhos and int(falhos.group(1)) > 0 and exige and exige not in out:
            veredito = 'NAO DERRUBOU O EXIGIDO'
        elif falhos and int(falhos.group(1)) > 0:
            veredito = 'VERMELHO'
        elif p.returncode:
            veredito = 'NAO CARREGOU'
        else:
            veredito = 'NAO DERRUBOU'
        print(f'{veredito:12} {ident:4} {desc} | ' + ' | '.join(linhas), flush=True)
        if exige:
            print(f'       exige na saída: {exige!r} — ' + ('apareceu' if exige in out else 'NÃO apareceu'), flush=True)
        for f in caidos[:3]:
            print('      ', f[:170], flush=True)
        if ident == CONTROLE:
            if veredito != 'NAO DERRUBOU':
                print(f'FALHOU: o controle {CONTROLE} não saiu verde — a suíte está vermelha sem mutação nenhuma')
                sobreviveu.append(ident)
        elif veredito != 'VERMELHO':
            sobreviveu.append(ident)
    for a in alvos:
        if hash_de(a) != antes[a]:
            print(f'ALVO ALTERADO DEPOIS DAS MUTAÇÕES: {a} — restaure antes de commitar')
            return 2
    total = len([m for m in M if not pedidas or m[0] in pedidas])
    print(f'{total - len(sobreviveu)} de {total} como esperado; sobreviveram: {sobreviveu or "nenhuma"}')
    return 1 if sobreviveu else 0


if __name__ == '__main__':
    sys.exit(principal())
