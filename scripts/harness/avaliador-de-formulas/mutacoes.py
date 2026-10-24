#!/usr/bin/env python3
"""
HARNESS do AVALIADOR DE FÓRMULAS — as MUTAÇÕES. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.

Cada mutação estraga UMA regra em `src/lib/atendimentos-ia/avaliador-de-formulas.ts` e roda o portão
`src/utils/__tests__/avaliador-de-formulas.test.ts`. A mutação tem de DERRUBAR pelo menos um CASO
(`teste-que-nao-exercita.md`). O 5º elemento, quando existe, é um trecho que TEM de aparecer na saída
da falha — o nome do caso que existe por causa daquela regra. Medido em 24/10/2026: com `--silent` a
saída do jest só lista os casos que FALHARAM, então um nome exigido discrimina.

A mutação é escrita NO ARQUIVO DO REPOSITÓRIO, com cópia `.bak`, e restaurada em `finally`. Por isso:
  - o script RECUSA rodar se o arquivo-alvo tiver mudança não commitada;
  - no fim, confere que ele voltou byte a byte ao que era (sai com 2 se não voltou);
  - NÃO COMMITE enquanto ele roda.

Uso:   python3 -B scripts/harness/avaliador-de-formulas/mutacoes.py          (todas)
       python3 -B scripts/harness/avaliador-de-formulas/mutacoes.py M3 M9   (só estas)
Sai com 1 se alguma mutação real não derrubar (ou não derrubar o exigido), ou se o controle M0 não sair verde.
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

A = 'src/lib/atendimentos-ia/avaliador-de-formulas.ts'
T = 'src/utils/__tests__/avaliador-de-formulas.test.ts'
CONTROLE = 'M0'

IIF = "                return condicaoDe(valorDo(no.args[0], amb, pilha), 'O primeiro argumento do IIF')\n                    ? valorDo(no.args[1], amb, pilha) : valorDo(no.args[2], amb, pilha)"
AND = "                return { tipo: 'b', b: condicaoDe(valorDo(no.a, amb, pilha), 'O lado esquerdo do and') && condicaoDe(valorDo(no.b, amb, pilha), 'O lado direito do and') }"
SOMA = "        let a = prodOuQuoc()\n        while (ehOp('+') || ehOp('-')) { const op = olha().v; i++; a = { k: 'bin', op, a, b: prodOuQuoc() } }"

# (id, o que estraga, arquivo, [(trecho, troca), ...], [trecho exigido na saída]) — o trecho tem de aparecer UMA vez
M = [
 ('M1', 'o IIF avalia OS DOIS ramos', A, [(IIF, "                const sim = valorDo(no.args[1], amb, pilha)\n                const nao = valorDo(no.args[2], amb, pilha)\n                return condicaoDe(valorDo(no.args[0], amb, pilha), 'O primeiro argumento do IIF') ? sim : nao")], 'SÓ AVALIA O RAMO ESCOLHIDO'),
 ('M2', 'o and avalia os dois lados', A, [(AND, "                { const x = condicaoDe(valorDo(no.a, amb, pilha), 'O lado esquerdo do and'); const y = condicaoDe(valorDo(no.b, amb, pilha), 'O lado direito do and'); return { tipo: 'b', b: x && y } }")], 'só avaliam o lado que decide'),
 ('M3', '&X sem colchete vira ZERO', A, [("            if (opcao.medida === null) {\n", "            if (opcao.medida === null) return racional(Z)\n            if (false) {\n")], 'OS PADRÕES'),
 ('M4', 'ARREDMAIOR é o piso, não o teto', A, [("(a.n + a.d - UM) / a.d", "a.n / a.d")], 'ARREDMAIOR é o teto'),
 ('M5', 'a soma em ponto flutuante', A, [("const soma = (a: Q, b: Q) => racional(a.n * b.d + b.n * a.d, a.d * b.d)", "const soma = (a: Q, b: Q) => deNumero(paraNumero(a) + paraNumero(b)) as Q")], 'a conta é EXATA'),
 ('M6', 'sem precedência: * e / no mesmo nível de + e -', A, [(SOMA, "        let a = prim()\n        while (ehOp('+') || ehOp('-') || ehOp('*') || ehOp('/')) { const op = olha().v; i++; a = { k: 'bin', op, a, b: prim() } }")], 'precedência'),
 ('M7', 'sem detecção de ciclo', A, [("            if (pilha.includes(nome)) {", "            if (false) {")], 'CICLO'),
 ('M8', 'WOLSPVC = 0, e não 6', A, [("WOLFIH: 0, WOLSPVC: 6 }", "WOLFIH: 0, WOLSPVC: 0 }")], 'as constantes do Leia-me'),
 ('M9', 'o Padrão é ignorado', A, [("const padrao = variavel.padrao?.trim() ?? ''", "const padrao = ''")], 'X e Y saem do Padrão'),
 ('M10', 'a escolha é ignorada (vale sempre o Padrão)', A, [("if (escolha !== undefined) return deNumero(escolha) as Q", "if (false) return deNumero(escolha as number) as Q")], 'A ESCOLHA vale sobre o Padrão'),
 ('M11', 'a espessura do vidro não filtra o baguete', A, [("if (!lista.map(Number).includes(esp)) {", "if (false) {")], 'vidro de 20 mm'),
 ('M12', 'sem a espessura, o baguete sai sem recusa', A, [("            if (esp === null) {", "            if (false) {")], 'sem a espessura'),
 ('M13', 'espessura que nenhum baguete atende passa calada', A, [("if (esp !== null && baguetesComCondicao > 0 && baguetesAtendidos === 0) {", "if (false) {")], 'nenhum baguete atende'),
 ('M14', 'Qtd fracionária é aceita', A, [("if (!ehInteiro(quantidade)) {", "if (false) {")], 'Qtd fracionária'),
 ('M15', 'comprimento zero ou negativo é aceito', A, [("if (medida.n <= Z) {", "if (false) {")], 'comprimento zero ou negativo'),
 ('M16', 'a validação falsa não vira aviso', A, [("            if (condicaoDe(avaliar(v.condicao, amb, []), 'A validação')) return", "            return")], 'H = 380'),
 ('M17', 'os limites do detalhe são ignorados', A, [("            if (lim === null) continue\n", "            continue\n")], 'H = 380'),
 ('M18', 'limite NULL vira limite ZERO', A, [("            if (lim === null) continue\n            const l = deNumero(lim) as Q", "            const l = deNumero(lim ?? 0) as Q")], 'largura sem limite'),
 ('M19', 'o percentual do excesso sobre o valor, e não sobre o limite', A, [("produto(quociente(excesso, l), racional(BigInt(100)))", "produto(quociente(excesso, v), racional(BigInt(100)))")], 'H = 380'),
 ('M20', 'a recusa não diz a linha, o perfil nem o campo', A, [("    const r: RecusaDoAvaliador = { motivo: e.motivo, mensagem: e.message, ...onde }", "    const r: RecusaDoAvaliador = { motivo: e.motivo, mensagem: e.message }")], 'OS PADRÕES'),
 ('M21', 'só a primeira recusa sai', A, [("    if (recusas.length) return { ok: false, recusas }\n    return { ok: true, pecas, linhas, avisos }", "    if (recusas.length) return { ok: false, recusas: recusas.slice(0, 1) }\n    return { ok: true, pecas, linhas, avisos }")], 'todas as recusas saem'),
 ('M22', 'o cabeçalho não é conferido', A, [("if (!(a.cabecalho ?? []).includes(coluna))", "if (false)")], 'coluna que falta no cabeçalho'),
 ('M23', 'o número de argumentos da função não é conferido', A, [("            if (args.length !== aridade) {", "            if (false) {")], 'RECUSAS NOMEADAS'),
 ('M24', 'função desconhecida não é recusada como tal', A, [("            if (aridade === undefined) {", "            if (false) {")], 'RECUSAS NOMEADAS'),
 ('M25', 'a vírgula decimal da família é lida como número', A, [(r"const num = /^\d+(?:\.\d+)?/.exec(texto.slice(i))", r"const num = /^\d+(?:[.,]\d+)?/.exec(texto.slice(i))")], 'vírgula decimal da família'),
 ('M26', '"sempre" não é reconhecido como verdadeiro', A, [("p.condicao.trim() === 'sempre' ? true :", "false ? true :")], 'as 17 peças'),
 ('M27', 'o comprimento sai arredondado ao mm, não ao micrômetro', A, [("    return Number(r) / 1000\n}", "    return Math.round(Number(r) / 1000)\n}")], 'as 17 peças'),
 ('M28', 'Qtd zero vira peça de quantidade zero', A, [("if (quantidade.n === Z) { linhas.push({ linha, perfil: p.perfil, entrou: false, motivo: 'QUANTIDADE_ZERO' }); return }", "")], 'Qtd zero'),
 ('M29', 'a escolha fora das opções é aceita', A, [("if (deNumero(valor) === null || (lidas && !lidas.some((o) => o.valor === valor))) {", "if (deNumero(valor) === null) {")], 'escolha fora das opções'),
 ('M30', 'nome sem valor vira ZERO', A, [("            throw new ErroDeAvaliacao('VARIAVEL_SEM_VALOR', `\"${nome}\" não é medida, fórmula, variável nem constante desta tipologia: não tem valor.`, { variavel: nome })", "            return racional(Z)")], 'variável sem valor nem padrão'),
 ('M0', 'controle: nada muda', A, [("export", "export")]),
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
            p = subprocess.run(['npx', 'jest', T, '--silent'], capture_output=True, text=True)
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
