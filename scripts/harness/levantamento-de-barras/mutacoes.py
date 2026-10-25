#!/usr/bin/env python3
"""
HARNESS do LEVANTAMENTO DE BARRAS — as MUTAÇÕES. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.

Cada mutação estraga UMA regra em `src/lib/atendimentos-ia/levantamento-de-barras.ts` e roda o portão
`src/utils/__tests__/levantamento-de-barras.test.ts`. A mutação tem de DERRUBAR pelo menos um CASO
(`teste-que-nao-exercita.md`). O 5º elemento é um trecho que TEM de aparecer na saída da falha — o nome
do caso que existe por causa daquela regra. Com `--silent` a saída do jest só lista os casos que
FALHARAM (medido em 24/10/2026, no harness do avaliador), então o nome exigido discrimina.

A mutação é escrita NO ARQUIVO DO REPOSITÓRIO, com cópia `.bak`, e restaurada em `finally`. Por isso:
  - o script RECUSA rodar se o arquivo-alvo tiver mudança não commitada;
  - no fim, confere que ele voltou byte a byte ao que era (sai com 2 se não voltou);
  - NÃO COMMITE enquanto ele roda.

Uso:   python3 -B scripts/harness/levantamento-de-barras/mutacoes.py          (todas)
       python3 -B scripts/harness/levantamento-de-barras/mutacoes.py M3 M9   (só estas)
Sai com 1 se alguma mutação real não derrubar (ou não derrubar o exigido), ou se o controle M0 não sair verde.
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

A = 'src/lib/atendimentos-ia/levantamento-de-barras.ts'
T = 'src/utils/__tests__/levantamento-de-barras.test.ts'
CONTROLE = 'M0'

# (id, o que estraga, arquivo, [(trecho, troca), ...], trecho exigido na saída) — o trecho tem de aparecer UMA vez
M = [
 ('M1', 'a cor é ignorada: vale o primeiro código do perfil', A, [("const daCor = distintos(linhas.filter((r) => r.cor === cor).map((r) => r.codigo))", "const daCor = distintos(linhas.map((r) => r.codigo)).slice(0, 1)")], 'COR SEM CÓDIGO'),
 ('M2', 'dois códigos: escolhe o primeiro', A, [("if (daCor.length > 1) return { ok: false,", "if (daCor.length > 1) return { ok: true, codigo: daCor[0], origem: 'COR' } as never\n    if (false) return { ok: false,")], 'DOIS CÓDIGOS para o mesmo perfil'),
 ('M3', 'perfil sem variante é recusado', A, [("if (unicos.length === 1) return { ok: true, codigo: unicos[0], origem: 'SEM_VARIANTE' }", "")], 'SEM VARIANTE'),
 ('M4', 'a cor vazia vira coringa ao lado de outras cores', A, [("if (linhas.every((r) => r.cor === null)) {", "if (linhas.some((r) => r.cor === null)) {\n        const linhas2 = linhas.filter((r) => r.cor === null); void linhas2")], 'não é coringa'),
 ('M5', 'a cor é comparada sem caixa', A, [("linhas.filter((r) => r.cor === cor)", "linhas.filter((r) => r.cor?.toUpperCase() === cor)")], 'EXATA'),
 ('M6', 'perfil sem regra vira o próprio perfil', A, [("    if (!linhas.length) {\n", "    if (!linhas.length) return { ok: true, codigo: perfil, origem: 'COR' }\n    if (false) {\n")], 'PERFIL SEM REGRA'),
 ('M7', 'a quantidade da esquadria não multiplica', A, [("quantidade: p.quantidade * e.quantidade", "quantidade: p.quantidade")], 'multiplica as peças'),
 ('M8', 'a quantidade da esquadria não é validada', A, [("if (!Number.isInteger(e.quantidade) || e.quantidade <= 0) {", "if (false) {")], 'QUANTIDADE DA ESQUADRIA'),
 ('M9', 'cada esquadria em barras próprias', A, [("pecas: prontas.map((b) => ({ codigo: codigoDoPerfil[b.perfil], comprimento_mm", "pecas: prontas.map((b) => ({ codigo: codigoDoPerfil[b.perfil] + (b.esquadria > 1 ? '#' + b.esquadria : ''), comprimento_mm")], 'dividem barra'),
 ('M10', 'item ausente: a peça some calada', A, [("        if (linhas.length === 1) { itemDoCodigo[codigo] = linhas[0]; continue }", "        if (linhas.length === 1) { itemDoCodigo[codigo] = linhas[0]; continue }\n        if (linhas.length === 0) continue")], 'ITEM AUSENTE'),
 ('M11', 'item em duas linhas: vale a primeira', A, [("if (linhas.length === 1) { itemDoCodigo[codigo] = linhas[0]; continue }", "if (linhas.length >= 1) { itemDoCodigo[codigo] = linhas[0]; continue }")], 'duas linhas'),
 ('M12', 'calcula com o que sobrou', A, [("if (parciais.length || 'recusas' in agrupado) return", "if ('recusas' in agrupado) return")], 'NÃO SAI BARRA NENHUMA'),
 ('M13', 'só a primeira recusa sai', A, [("return { ok: false, recusas: juntar(parciais) }", "return { ok: false, recusas: juntar(parciais).slice(0, 1) }")], 'TODAS AS RECUSAS'),
 ('M14', 'a mesma falta sai uma vez por esquadria', A, [("        const g = grupos.find((x) => chave(x.base) === chave(p))", "        const g = undefined as (typeof grupos)[number] | undefined")], 'UMA vez'),
 ('M15', 'as recusas saem na ordem da entrada', A, [("    recusas.sort(", "    if (false) recusas.sort(")], 'DETERMINÍSTICO'),
 ('M16', 'a recusa do avaliador sem a esquadria', A, [("perfil: x.perfil, esquadria: indice, comTipologia: true, texto: x.mensagem", "perfil: x.perfil, comTipologia: true, texto: x.mensagem")], 'recusa do AVALIADOR'),
 ('M17', 'a esquadria recusada pelo avaliador some calada', A, [("        if ('recusas' in r) {\n", "        if ('recusas' in r) {\n            if (r.recusas.length) return\n")], 'recusa do AVALIADOR'),
 ('M18', 'tipologia sem definição: a esquadria some calada', A, [("        if (!tipologia) {\n", "        if (!tipologia) return\n        if (false) {\n")], 'TIPOLOGIA SEM DEFINIÇÃO'),
 ('M19', 'a recusa do agrupador sem o perfil', A, [("parciais.push({ origem: 'AGRUPADOR', motivo: x.motivo, codigo: x.codigo, perfil, esquadria, texto })", "parciais.push({ origem: 'AGRUPADOR', motivo: x.motivo, codigo: x.codigo, esquadria, texto: x.mensagem })")], 'recusa do AGRUPADOR'),
 ('M20', 'o preço ausente não é nomeado', A, [("if (!Number.isFinite(it.valor_barra_interno as number)) falta.push(", "if (false) falta.push(")], 'PREÇO AUSENTE'),
 ('M21', 'dois códigos sem os valores na frase', A, [("`${c.codigo} (${formatarReais(c.valor_barra_interno)} a barra)`", "`${c.codigo}`")], 'os dois valores'),
 ('M22', 'cor sem código sem as variantes na frase', A, [("as variantes que existem são: ${variantes.join(', ')}", "há outras variantes")], 'nomeando a variante'),
 ('M23', 'a cor da entrada é ignorada: volta a BRANCO fixa', A, [("    const cor = entrada.cor\n", "    const cor = 'BRANCO'\n")], 'PRETO TEXTURADO'),
 ('M24', 'o real com ponto decimal', A, [("return `${v < 0 ? '−' : ''}R$ ${inteiro},${resto}`", "return `${v < 0 ? '−' : ''}R$ ${inteiro}.${resto}`")], 'ICU'),
 ('M25', 'o código do item sai sem o perfil', A, [("por_codigo: agrupado.por_codigo.map((c) => ({ ...c, perfil: perfilDoCodigo[c.codigo], descricao:", "por_codigo: agrupado.por_codigo.map((c) => ({ ...c, descricao:")], 'CÓDIGOS DO ITEM'),
 ('M26', 'o código WVetro vai ao agrupador', A, [("pecas: prontas.map((b) => ({ codigo: codigoDoPerfil[b.perfil], comprimento_mm", "pecas: prontas.map((b) => ({ codigo: b.perfil, comprimento_mm")], 'CÓDIGOS DO ITEM'),
 ('M27', 'os avisos do avaliador somem', A, [("H_mm: e.H_mm, quantidade: e.quantidade, avisos: r.avisos })", "H_mm: e.H_mm, quantidade: e.quantidade, avisos: [] })")], 'AVISOS'),
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
