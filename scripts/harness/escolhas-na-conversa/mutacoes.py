#!/usr/bin/env python3
"""
HARNESS das ESCOLHAS NA CONVERSA — as MUTAÇÕES. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.

Cada mutação estraga UMA regra em `escolhas-da-tipologia.ts`, `conversa-da-ia.ts` ou
`levantamento-da-conversa.ts` e roda os três portões — `escolhas-da-tipologia.test.ts`,
`levantamento-da-conversa.test.ts` e `atendimentos-ia-conversa-da-ia.test.ts`. A mutação tem de
DERRUBAR pelo menos um caso, e o caso exigido (5º elemento) tem de aparecer na saída da falha
(`teste-que-nao-exercita.md`).

O arquivo-alvo é mutado no lugar, com `.bak`, e conferido por sha256 no fim; o script recusa rodar com
o alvo sujo. NÃO COMMITE enquanto ele roda.

Uso:   python3 -B scripts/harness/escolhas-na-conversa/mutacoes.py          (todas)
       python3 -B scripts/harness/escolhas-na-conversa/mutacoes.py E3 E8   (só estas)
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

ES = 'src/lib/atendimentos-ia/escolhas-da-tipologia.ts'
CV = 'src/lib/atendimentos-ia/conversa-da-ia.ts'
LC = 'src/lib/atendimentos-ia/levantamento-da-conversa.ts'
T = ['src/utils/__tests__/escolhas-da-tipologia.test.ts', 'src/utils/__tests__/levantamento-da-conversa.test.ts', 'src/utils/__tests__/atendimentos-ia-conversa-da-ia.test.ts']
CONTROLE = 'E0'

M = [
 ('E1', 'Condição falsa pergunta assim mesmo', ES, [("    return r.valor === true\n", "    return true\n")], 'MAE NÃO é perguntada'),
 ('E2', 'Condição que não dá para avaliar NÃO pergunta', ES, [("    if ('recusa' in r) return true\n", "    if ('recusa' in r) return false\n")], 'PERGUNTA'),
 ('E3', 'a escolha já feita volta a ser perguntada', ES, [("if (!capturada(v.variavel) || escolhas[v.variavel] !== undefined) continue", "if (!capturada(v.variavel)) continue")], 'só as que FALTAM'),
 ('E4', 'qualquer variável é capturada', ES, [("const capturada = (v: string) => (ESCOLHAS_CAPTURADAS as readonly string[]).includes(v)", "const capturada = (v: string) => v.length > 0")], 'fica no Padrão'),
 ('E5', 'qualquer opção numérica é aceita', ES, [(" && pendente.opcoes.some((o) => o.valor === opcao)", "")], 'opção que não existe'),
 ('E6', 'a escolha feita é sobrescrita', ES, [("const pendente = escolhasPendentes(tipologia, escolhas).find", "const pendente = escolhasPendentes(tipologia, {}).find")], 'não sobrescreve'),
 ('E7', 'o jsonb vira escolha com qualquer chave', ES, [("if (capturada(k) && typeof v === 'number'", "if (typeof v === 'number'")], 'não vira escolha'),
 ('E8', 'a pergunta sai sem as opções', ES, [("return `${p.descricao} — qual opção? ${p.opcoes.map((o) => `${o.valor} = ${o.rotulo}`).join('; ')}.`", "return `${p.descricao} — qual opção?`")], 'a pergunta da ARI, inteira'),
 ('E9', 'fecha com escolha pendente', CV, [("const fecha = proximo === null && pendentes.length === 0", "const fecha = proximo === null")], 'NÃO fecha'),
 ('E10', 'as pendentes não vão ao prompt', CV, [("...(pendentes.length ? pendentes.map((p) => `${p.variavel}: ${perguntaDaEscolha(p)}`) : ['(nenhuma)']),", "'(nenhuma)',")], 'vão ao prompt'),
 ('E11', 'o prompt não proíbe escolher sozinho', CV, [("NUNCA escolha sozinho, nem pelo Padrão", "Escolha a mais comum")], 'vão ao prompt'),
 ('E12', 'a escolha válida não é gravada', CV, [("...(escolha.gravar ? { escolhas: escolha.gravar } : {}), ", "")], 'GRAVADA em escolhas'),
 ('E13', 'a coluna escolhas não é lida', CV, [("${CAMPOS_DA_PRE_DEFINICAO.join(', ')}, escolhas`", "${CAMPOS_DA_PRE_DEFINICAO.join(', ')}`")], 'CHEGAM AO AVALIADOR'),
 ('E14', 'as escolhas não seguem para o levantamento', CV, [("            escolhas: gravada.escolhas,\n", "            escolhas: null,\n")], 'CHEGAM AO AVALIADOR'),
 ('E15', 'o levantamento ignora as escolhas gravadas', LC, [("    const escolhas = lerEscolhasGravadas(pre.escolhas)\n", "    const escolhas = lerEscolhasGravadas(null)\n")], 'a DP-02 FECHA'),
 ('E16', 'a linha das escolhas some do texto', LC, [("            : [`Escolhas: ${e.escolhas}. As outras variáveis ficaram no Padrão da tipologia.`]", "            : []")], 'com as escolhas'),
 ('E0', 'controle: nada muda', ES, [("export", "export")]),
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
            if n != 1 and velho != troca:
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
        linhas = [l for l in out.split('\n') if l.startswith('Tests:') or l.startswith('Test Suites:')]
        testes = next((l for l in linhas if l.startswith('Tests:')), '')
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
        print(f'{veredito:12} {ident:4} {desc} | ' + ' | '.join(linhas))
        if exige:
            print(f'       exige na saída: {exige!r} — ' + ('apareceu' if exige in out else 'NÃO apareceu'))
        for f in caidos[:4]:
            print('      ', f[:170])
        if ident == CONTROLE:
            if veredito != 'NAO DERRUBOU':
                print(f'FALHOU: o controle {CONTROLE} não saiu verde — a suíte está vermelha sem mutação nenhuma')
                sobreviveu.append(ident)
        elif veredito != 'VERMELHO':
            sobreviveu.append(ident)
    for a in alvos:
        if hash_de(a) != antes[a]:
            print(f'FALHOU: {a} não voltou ao que era')
            return 2
    print(('todas as mutações reais derrubaram pelo menos um caso; controle verde' if not sobreviveu
           else 'NÃO DERRUBARAM: ' + ', '.join(sobreviveu)))
    return 1 if sobreviveu else 0


if __name__ == '__main__':
    sys.exit(principal())
