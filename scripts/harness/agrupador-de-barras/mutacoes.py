#!/usr/bin/env python3
"""
HARNESS do AGRUPADOR DE BARRAS — as MUTAÇÕES. NÃO TOCA PRODUÇÃO nem banco nenhum: só jest.

Cada mutação estraga UMA regra em `src/lib/atendimentos-ia/agrupador-de-barras.ts` e roda o portão
`src/utils/__tests__/agrupador-de-barras.test.ts`. A mutação tem de DERRUBAR pelo menos um CASO
(`teste-que-nao-exercita.md`).

A mutação é escrita NO ARQUIVO DO REPOSITÓRIO, com cópia `.bak`, e restaurada em `finally`. Por isso:
  - o script RECUSA rodar se o arquivo-alvo tiver mudança não commitada;
  - no fim, confere que ele voltou byte a byte ao que era (sai com 2 se não voltou);
  - NÃO COMMITE enquanto ele roda.

Critério de VERMELHO: a linha `Tests:` do jest traz `N failed`, N > 0. Suíte que não carrega NÃO
conta — sai `NAO CARREGOU` (`portao-que-nao-alcanca.md`, aparição 6).

Uso:   python3 -B scripts/harness/agrupador-de-barras/mutacoes.py          (todas)
       python3 -B scripts/harness/agrupador-de-barras/mutacoes.py M3 M9   (só estas)
Sai com 1 se alguma mutação real não derrubar, ou se o controle M0 não sair verde.
"""
import hashlib, os, re, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
os.chdir(RAIZ)

A = 'src/lib/atendimentos-ia/agrupador-de-barras.ts'
T = 'src/utils/__tests__/agrupador-de-barras.test.ts'
CONTROLE = 'M0'

# (id, o que estraga, arquivo, [(trecho, troca), ...]) — o trecho tem de aparecer UMA vez
M = [
 ('M1', 'a serra não entra na conta', A, [("const serraUm = valido(serra) && serra >= 0 ? paraUm(serra) : 0", "const serraUm = 0")]),
 ('M2', 'só os n − 1 cortes entre as peças: o corte da sobra nunca entra', A, [
     ("const ultimoCorteUm = Math.min(serraUm, restoUm)", "const ultimoCorteUm = 0"),
     ("b.pecasUm.length - 1 + (restoUm > 0 ? 1 : 0)", "b.pecasUm.length - 1")]),
 ('M3', 'encostar no fim da barra NÃO é permitido (< em vez de ≤)', A, [("b.ocupadoUm + serraUm + p.um <= barraUm", "b.ocupadoUm + serraUm + p.um < barraUm")]),
 ('M4', 'códigos diferentes com a mesma barra se misturam', A, [("const pecas = agrupadas.filter((x) => x.codigo === codigo)", "const pecas = agrupadas.filter((x) => entrada.barras[x.codigo]?.comprimento_mm === barraMm)")]),
 ('M5', 'empacota por LINHA DA ENTRADA (esquadria), não pelo levantamento', A, [
     ("const ja = agrupadas.find((x) => x.codigo === p.codigo && x.um === um)", "const ja = undefined as { quantidade: number } | undefined"),
     ("const destino = abertas.find((b) => b.ocupadoUm + serraUm + p.um <= barraUm)", "const destino = abertas.find((b) => (b as { dono?: unknown }).dono === p && b.ocupadoUm + serraUm + p.um <= barraUm)"),
     ("else abertas.push({ ocupadoUm: p.um, pecasUm: [p.um] })", "else abertas.push({ ocupadoUm: p.um, pecasUm: [p.um], dono: p } as { ocupadoUm: number; pecasUm: number[] })")]),
 ('M6', 'a barra é uma constante de 6000, não a do item', A, [("const barraUm = paraUm(barraMm)", "const barraUm = paraUm(6000)")]),
 ('M7', 'peça maior que a barra não é recusada como tal', A, [("            if (p.um > barraUm) {", "            if (false) {")]),
 ('M8', 'sem ordenar por tamanho (fica a ordem da entrada)', A, [("agrupadas.sort((a, b) => b.um - a.um || porTexto(a.codigo, b.codigo))", "agrupadas.sort(() => 0)")]),
 ('M9', 'ordena da MENOR para a maior', A, [("agrupadas.sort((a, b) => b.um - a.um || porTexto(a.codigo, b.codigo))", "agrupadas.sort((a, b) => a.um - b.um || porTexto(a.codigo, b.codigo))")]),
 ('M10', 'códigos na ordem da maior peça, não na ordem do código', A, [("const codigos = [...new Set(agrupadas.map((x) => x.codigo))].sort(porTexto)", "const codigos = [...new Set(agrupadas.map((x) => x.codigo))]")]),
 ('M11', 'consumo real sobre os metros COMPRADOS', A, [("total_por_consumo_real: vm === null ? null : (utilUm * vm) / 1_000_000", "total_por_consumo_real: vm === null ? null : (compradoUm * vm) / 1_000_000")]),
 ('M12', 'barra inteira valorada pelos metros úteis', A, [("total_por_barra_inteira: vb === null ? null : barras.length * vb", "total_por_barra_inteira: vb === null ? null : (utilUm / 1_000_000) * vb")]),
 ('M13', 'só um dos totais (consumo real sempre null)', A, [("total_por_consumo_real: vm === null ? null : (utilUm * vm) / 1_000_000", "total_por_consumo_real: null")]),
 ('M14', 'aproveitamento do levantamento = MÉDIA dos códigos', A, [("aproveitamento_pct: compradoTotalUm === 0 ? null : (utilTotalUm / compradoTotalUm) * 100", "aproveitamento_pct: porCodigo.reduce((s, c) => s + c.aproveitamento_pct, 0) / porCodigo.length")]),
 ('M15', 'a sobra não inclui a serra', A, [("sobra_mm: paraMm(compradoUm - utilUm)", "sobra_mm: paraMm(compradoUm - utilUm - barras.reduce((s, b) => s + b.serraUm, 0))")]),
 ('M16', 'milimetrosDaBarra ingênuo (m × 1000 em ponto flutuante)', A, [("return Math.round(medida_barra_m * 1_000_000) / 1000", "return medida_barra_m * 1000")]),
 ('M17', 'a recusa da peça maior não nomeia o código', A, [("`A peça de ${peca_mm} mm do código ${codigo} é maior", "`A peça de ${peca_mm} mm é maior")]),
 ('M18', 'código sem barra supõe 6 m', A, [("const barraMm = barra?.comprimento_mm", "const barraMm = barra?.comprimento_mm ?? 6000")]),
 ('M19', 'n cortes SEMPRE, um por peça — o modelo do #143', A, [
     ("            if (p.um > barraUm) {", "            if (p.um + serraUm > barraUm) {"),
     ("b.ocupadoUm + serraUm + p.um <= barraUm", "b.ocupadoUm + serraUm + p.um + serraUm <= barraUm"),
     ("const ultimoCorteUm = Math.min(serraUm, restoUm)", "const ultimoCorteUm = serraUm"),
     ("b.pecasUm.length - 1 + (restoUm > 0 ? 1 : 0)", "b.pecasUm.length")]),
 ('M20', 'o total soma o que tem (soma parcial)', A, [("porCodigo.every((c) => c[k] !== null) ?", "true ?")]),
 ('M21', 'preço ausente vira ZERO', A, [("const vb = valido(barra.valor_barra_interno) ? barra.valor_barra_interno : null", "const vb = valido(barra.valor_barra_interno) ? barra.valor_barra_interno : 0")]),
 ('M22', 'só a primeira recusa sai', A, [("return { ok: false, recusas: unicas }", "return { ok: false, recusas: unicas.slice(0, 1) }")]),
 ('M23', 'quantidade fracionária é aceita', A, [("if (!Number.isInteger(p.quantidade) || p.quantidade <= 0) {", "if (p.quantidade <= 0) {")]),
 ('M24', 'contas em MILÍMETROS com ponto flutuante, sem o micrômetro inteiro', A, [
     ("const paraUm = (mm: number) => Math.round(mm * UM)", "const paraUm = (mm: number) => mm"),
     ("const paraMm = (um: number) => um / UM", "const paraMm = (um: number) => um"),
     ("const paraMetros = (um: number) => um / 1_000_000", "const paraMetros = (um: number) => um / 1000"),
     ("(utilUm * vm) / 1_000_000", "(utilUm * vm) / 1000")]),
 ('M25', 'o último corte cobra a serra INTEIRA mesmo quando sobra menos que ela', A, [("const ultimoCorteUm = Math.min(serraUm, restoUm)", "const ultimoCorteUm = restoUm > 0 ? serraUm : 0")]),
 ('M26', 'sobra menor que a serra NÃO cabe (a leitura literal, que o dono do produto recusou)', A, [
     ("            if (p.um > barraUm) {", "            if (p.um > barraUm || (p.um < barraUm && p.um + serraUm > barraUm)) {"),
     ("b.ocupadoUm + serraUm + p.um <= barraUm", "(b.ocupadoUm + serraUm + p.um === barraUm || b.ocupadoUm + serraUm + p.um + serraUm <= barraUm)")]),
 ('M27', 'o corte da sobra é contado mesmo quando a soma fecha exata', A, [("b.pecasUm.length - 1 + (restoUm > 0 ? 1 : 0)", "b.pecasUm.length")]),
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
    for ident, desc, arq, trocas in M:
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
        if falhos and int(falhos.group(1)) > 0:
            veredito = 'VERMELHO'
        elif p.returncode:
            veredito = 'NAO CARREGOU'
        else:
            veredito = 'NAO DERRUBOU'
        print(f'{veredito:12} {ident:4} {desc} | ' + ' | '.join(linhas))
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
