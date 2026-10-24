#!/usr/bin/env python3
"""
HARNESS da TRAVA DO TEMPO na importação — as MUTAÇÕES. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.

Cada mutação estraga UMA parte da trava (a rota `tabelas/[id]/importar.ts` e a frase em
`atendimentos-ia-importacao.ts`) e roda o portão `atendimentos-ia-importar-rota.test.ts`. A mutação tem
de DERRUBAR pelo menos um CASO (`teste-que-nao-exercita.md`). O 5º elemento, quando existe, é um trecho
que TEM de aparecer na saída da falha: derrubar outro caso por outra razão não basta.

A mutação é escrita NO ARQUIVO DO REPOSITÓRIO, com cópia `.bak`, e restaurada em `finally`. Por isso:
  - o script RECUSA rodar se um arquivo-alvo tiver mudança não commitada;
  - no fim, confere que eles voltaram byte a byte ao que eram (sai com 2 se não voltaram);
  - NÃO COMMITE enquanto ele roda.

Critério de VERMELHO: a linha `Tests:` do jest traz `N failed`, N > 0. Suíte que não carrega NÃO conta.

LIMITE: o repositório é FALSO no portão. A consulta real (`contarTemposGravados`) não é mutada aqui,
porque nenhum caso a alcança — mutá-la daria "NAO DERRUBOU" por construção, não por defeito.

Uso:   python3 -B scripts/harness/trava-do-tempo/mutacoes.py          (todas)
       python3 -B scripts/harness/trava-do-tempo/mutacoes.py M3 M5   (só estas)
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

R = 'src/pages/api/super-admin/atendimentos-ia/tabelas/[id]/importar.ts'
F = 'src/utils/atendimentos-ia-importacao.ts'
T = 'src/utils/__tests__/atendimentos-ia-importar-rota.test.ts'
CONTROLE = 'M0'
TRAVA = "  let tempos: Awaited<ReturnType<typeof contarTemposGravados>>\n  try {\n    tempos = await contarTemposGravados(id)\n  } catch (e) {\n    return falhaInterna(res, 'importação (tempos)', e, 'Não foi possível conferir os tempos de fabricação gravados. Nada foi alterado.')\n  }\n  if (tempos.total > 0) return res.status(409).json({ error: fraseDaImportacaoTravadaPeloTempo(tempos) })\n\n"

# (id, o que estraga, arquivo, [(trecho, troca), ...], [trecho exigido na saída]) — o trecho tem de aparecer UMA vez
M = [
 ('M1', 'a trava não existe', R, [("  if (tempos.total > 0) return", "  if (false) return")]),
 ('M2', 'trava só pelo ESTIMADO', R, [("if (tempos.total > 0)", "if (tempos.ESTIMADO > 0)")], 'só IMPORTADO'),
 ('M3', 'trava pela soma das duas origens conhecidas, não pelo total', R, [("if (tempos.total > 0)", "if (tempos.ESTIMADO + tempos.IMPORTADO > 0)")], 'trava pelo TOTAL'),
 ('M4', 'erro do banco ao contar deixa a importação seguir (falha ABERTA)', R, [
     ("return falhaInterna(res, 'importação (tempos)', e, 'Não foi possível conferir os tempos de fabricação gravados. Nada foi alterado.')",
      "void e; tempos = { total: 0, ESTIMADO: 0, IMPORTADO: 0 }")], 'falha fechada'),
 ('M5', 'a trava vem DEPOIS de baixar os arquivos', R, [
     (TRAVA, ""),
     ("  const leitura = await lerArquivosDaImportacao({", TRAVA + "  const leitura = await lerArquivosDaImportacao({")], 'ANTES de baixar'),
 ('M6', 'a trava vale também para o GET', R, [
     (TRAVA, ""),
     ("  if (req.method === 'GET') {", TRAVA + "  if (req.method === 'GET') {")], 'o GET continua respondendo'),
 ('M7', 'a trava responde 200, não 409', R, [("if (tempos.total > 0) return res.status(409)", "if (tempos.total > 0) return res.status(200)")]),
 ('M8', 'a frase não diz a origem dos tempos', F, [("+ `(${partes.join(', ')}). A importação", "+ `. A importação")], 'de que origem'),
 ('M9', 'a frase esquece a origem que não é ESTIMADO nem IMPORTADO', F, [("...(outras > 0 ? [`${outras} de outra origem`] : [])", "")], 'de que origem'),
 ('M0', 'controle: nada muda', R, [("export", "export")]),
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
