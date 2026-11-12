#!/usr/bin/env python3
"""
As MUTAÇÕES do comando único (dono do produto, 12/11/2026, Nível 3): a escada da resolução de referência (ponte, exato com o sufixo, código + cor,
nome técnico) e o guarda; a cor pela palavra; a tradução do vidro; a falta nomeada que não recusa (o levantamento, o custo, a gravação); o PDF ao
vendedor (o carimbo, o rodapé no pé, o bloco do vendedor, a guarda do cliente desligada); e a conversa que manda só o arquivo depois do "sim".
Cada uma estraga UMA coisa, roda as suítes e DESFAZ. M0 é o controle. Roda SOZINHO ou numa worktree (`mutacao-na-arvore-de-trabalho.md`), e
confere TODAS as mutações antes de rodar qualquer suíte (`mutacao-que-nao-se-aplica.md`).

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py R1 V3      (só essas — e as outras são CONFERIDAS do mesmo jeito)
"""
import os, subprocess, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
L = 'src/lib/atendimentos-ia/'
RES, VID, LB, LC = L + 'resolucao-de-referencia.ts', L + 'vidro-da-tabela.ts', L + 'levantamento-de-barras.ts', L + 'levantamento-da-conversa.ts'
SRV, CALC, ARQ, ARQS = L + 'custo-do-orcamento-servidor.ts', L + 'orcamento-calculado.ts', L + 'arquivo-do-orcamento.ts', L + 'arquivo-do-orcamento-servidor.ts'
TRAV, CADEIA, CONV, ORC, TC = L + 'travessia-do-levantamento.ts', L + 'cadeia-do-sim.ts', L + 'conversa-da-ia.ts', L + 'orcamentos-ia.ts', L + 'tabelas-da-conta.ts'
T = 'src/utils/__tests__/'
SUITES = [T + s for s in [
    'resolucao-de-referencia.test.ts', 'resolucao-de-referencia-sem-copia.test.ts', 'conferencia-de-referencias.test.ts', 'vidro-da-tabela.test.ts',
    'levantamento-de-barras.test.ts', 'levantamento-caso-gerson-boss.test.ts', 'levantamento-da-conversa.test.ts', 'escopo-do-insumo-e-do-vidro.test.ts',
    'atendimentos-ia-orcamento-calculado.test.ts', 'atendimentos-ia-arquivo-do-orcamento.test.ts', 'atendimentos-ia-travessia-do-levantamento.test.ts',
    'atendimentos-ia-cadeia-do-sim.test.ts', 'atendimentos-ia-orcamentos-ia.test.ts', 'atendimentos-ia-levantamento-por-nome.test.ts',
    'avaliador-insumos-e-vidros.test.ts', 'custo-do-levantamento-tres-caminhos.test.ts', 'definicoes-do-item.test.ts',
]]

MUTACOES = [
    # a escada e o guarda
    ('R1', 'a ponte depois do exato', [(RES, "export const COMO_ACHOU: readonly ComoAchou[] = ['ponte', 'exato', 'cor', 'nome_tecnico']", "export const COMO_ACHOU: readonly ComoAchou[] = ['exato', 'ponte', 'cor', 'nome_tecnico']")]),
    ('R2', 'o guarda desligado (a descrição não é conferida)', [(RES, "            if (emComum === 0) { if (!recusadas.some", "            if (emComum < 0) { if (!recusadas.some")]),
    ('R3', 'o sufixo do item não sai quando o motor não tem', [(RES, "semOSufixo(i.codigo, sufixo ?? sufixoDoFornecedor(i.codigo)) === sem", "sufixo !== null && semOSufixo(i.codigo, sufixo) === sem")]),
    ('R4', 'sem cor pedida, assume branco', [(RES, "        if (ref.corPedida === null || ref.corPedida.trim() === '') return { como, candidatas: [], pulado: 'SEM_COR' }\n", "")]),
    ('R5', 'o ".1" (face menor) tratado como cor', [(RES, "    return base.endsWith('.1') ? `${base.slice(0, -2)}${digito}.1` : `${base}${digito}`", "    return `${base}${digito}`")]),
    ('R6', 'o nome técnico como "contém" solto', [(RES, "    const m = new RegExp(`(?<![A-Z0-9])${corpo}(?![A-Z0-9])`).exec(d)", "    const m = new RegExp(corpo).exec(d)")]),
    ('R7', 'o nome técnico roda sem a tabela de cores', [(RES, "    if (doGrupo(ctx).length === 0) return { como, candidatas: [], pulado: 'SEM_TABELA_DE_CORES' }\n    return { como, candidatas: itens.filter(", "    return { como, candidatas: itens.filter(")]),
    ('R8', 'o item que É o produto não exclui o que só o cita (o reforço do SF92)', [(RES, "        const doDegrau = ancorados.length ? ancorados : d.candidatas", "        const doDegrau = d.candidatas")]),
    ('R9', 'a cor só pela frase inteira (LAMINADO GOLDEN OAK passa por sem cor)', [(RES, "    return [...new Set(d.trim().split(' ').filter((w) => cor.has(w) && w !== nome))]", "    return cores.filter((c) => d.includes(` ${descricaoNormalizada(c.nome)} `)).map((c) => c.nome)")]),
    ('R10', 'EXTERNO conta como cor (o ARREMATE EXTERNO recusado)', [(RES, "export const MODIFICADORES_DE_COR: ReadonlySet<string> = new Set(['EXTERNO', 'AMADEIRADO'])", "export const MODIFICADORES_DE_COR: ReadonlySet<string> = new Set(['AMADEIRADO'])")]),
    ('R11', 'a cor pedida não desempata', [(RES, "        const daCor = comAPedida.length ? comAPedida : passam", "        const daCor = passam")]),
    ('R12', 'o empate escolhe o primeiro', [(RES, "        if (vencedores.length === 1) return { achada: true, como, item: vencedores[0] }", "        if (vencedores.length >= 1) return { achada: true, como, item: vencedores[0] }")]),
    ('R13', 'a ambiguidade fora do nome técnico escolhe a primeira', [(RES, "        if (como !== 'nome_tecnico') {\n            return falta(ref, 'AMBIGUA'", "        if (como !== 'nome_tecnico') {\n            return { achada: true, como, item: passam[0] }\n            return falta(ref, 'AMBIGUA'")]),
    ('R14', 'a palavra de ligação conta como concordância', [(RES, "        p.length > 1 && !PALAVRAS_DE_LIGACAO.has(p) &&", "        p.length > 0 &&")]),
    ('R15', 'o nome técnico conta no guarda (o IL50 da escova)', [(RES, "!daCor.has(p) && p !== nome))", "!daCor.has(p)))")]),
    # a cor afirmada (12/11/2026, à noite)
    ('H1', 'o sufixo do código não decide', [(RES, "        if (daTabela) return { por: 'sufixo', cor: descricaoNormalizada(daTabela.nome) }\n", "")]),
    ('H2', 'o prefixo de coincidência vira família', [(RES, "daTabela.has(c.slice(p.length))).length >= 2 ? p : ''", "daTabela.has(c.slice(p.length))).length >= 0 ? p : ''")]),
    ('H3', 'a cor não afirmada serve à pedida', [(RES, "    if (a.por === 'nenhuma') return false\n", "    if (a.por === 'nenhuma') return true\n")]),
    ('H4', 'a frase da tabela não vence a palavra (EXTERNO PRETO TEXTURADO vira PRETO TEXTURADO)', [(RES, "    if (a.frases.some((f) => f !== pedida)) return false\n", "")]),
    # o vidro
    ('V1', 'o composto entra com espessura dita', [(VID, "        if (v.composto && (dito.espessura !== null || dito.tipo !== null)) return false\n", "")]),
    ('V2', 'o vidro ambíguo escolhe o primeiro', [(VID, "    if (candidatos.length === 1) return { item: candidatos[0], como: 'texto' }", "    if (candidatos.length >= 1) return { item: candidatos[0], como: 'texto' }")]),
    ('V3', 'o código escolhido não vence o texto', [(VID, "    if (codigoEscolhido) {", "    if (codigoEscolhido && false) {")]),
    ('V4', '"04" não é 4', [(VID, "    return String(Number(bruta.replace(',', '.')))", "    return bruta")]),
    # a falta que não recusa
    ('F1', 'o perfil sem valor volta a recusar o levantamento', [(LB, "        if (semValor.length) {\n            faltar('SEM_VALOR'", "        if (semValor.length) {\n            parciais.push({ origem: 'ITEM', caminho: null, motivo: 'ITEM_SEM_VALOR', codigo: it.codigo, perfil, texto: perfil, falta: perfil })\n            faltar('SEM_VALOR'")]),
    ('F2', 'o perfil sem preço entra nas barras', [(LB, "    const prontas = brutas.filter((b) => itemDoCodigo[codigoDoPerfil[b.perfil]] !== undefined)", "    const prontas = brutas.filter((b) => itemDoCodigo[codigoDoPerfil[b.perfil] ?? b.perfil] !== undefined || true)")]),
    ('F3', 'a mensagem cala as faltas', [(LC, "    linhas.push(...linhasDasFaltas(d, r.faltas, numerar))", "    void linhasDasFaltas")]),
    ('F4', 'a recusa do tempo esconde a falta de preço', [(LC, "            faltas: [...recusas.map(frase), ...semTempo.map((t) => t.frase), ...precoQueFalta], rotulos,", "            faltas: [...recusas.map(frase), ...semTempo.map((t) => t.frase)], rotulos,")]),
    ('F5', 'a falta não vai ao log (faltou)', [(LC, "    const etapa = resumo([...semPreco, ...semMao], {", "    const etapa = resumo(semMao, {")]),
    # o custo e a gravação
    ('G1', 'o insumo fora do principal da categoria', [(SRV, "p.principais.get(i.categoria) === i.fornecedor_id)", "p.principais.has(i.categoria))")]),
    ('G2', 'o vidro de qualquer fornecedor', [(SRV, "todos.filter((i) => i.categoria === 'VIDRO' && i.fornecedor_id === principal)", "todos.filter((i) => i.categoria === 'VIDRO')")]),
    ('G3', 'a área do vidro sem a quantidade da esquadria', [(SRV, "* p.quantidade * e.quantidade })", "* p.quantidade })")]),
    ('G4', 'o insumo sem a quantidade da esquadria', [(SRV, "insumos: e.insumos.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade * e.quantidade })),", "insumos: e.insumos.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade })),")]),
    ('G5', 'as faltas do avaliador somem', [(SRV, "            for (const f of e.faltasDoAvaliador) {", "            for (const f of [] as typeof e.faltasDoAvaliador) {")]),
    ('G6', 'a categoria com dois principais escolhe um', [(TC, "    for (const [c, fs] of porCategoria) { if (fs.size === 1) principais.set(c, [...fs][0]); else ambiguas.push(c) }", "    for (const [c, fs] of porCategoria) principais.set(c, [...fs][0])")]),
    ('G7', 'a falta não é gravada', [(CALC, "    if (faltas.length) {\n        const { error } = await db().from(TABELA_DA_FALTA).insert(", "    if (faltas.length && false) {\n        const { error } = await db().from(TABELA_DA_FALTA).insert(")]),
    ('G8', 'sem a tabela das faltas, a falta some em silêncio', [(CALC, "        if (sonda.error && tabelaAusente(sonda.error)) throw new ErroDoCalculo(custo.faltas.map((f) => f.frase))\n", "")]),
    ('G9', 'sem a migração, o insumo é gravado como perfil', [(CALC, "            if (linhas.some((l) => l.caminho !== 'perfil')) throw new ErroDoCalculo([FRASE_SEM_MIGRACAO_DOS_CAMINHOS])\n", "")]),
    ('G10', 'o texto da falta passa da CHECK', [(CALC, "codigo_do_motor: cabe(f.codigo_do_motor, 60)", "codigo_do_motor: f.codigo_do_motor")]),
    ('G11', 'o vidro escolhido não chega ao cálculo', [(CALC, "vidro_codigo: vidroCodigo.get(i.id) ?? null, escolhas:", "vidro_codigo: null, escolhas:")]),
    ('G12', 'trocar o texto do vidro não anula o código', [(ORC, "            const vidroMudou = antes !== undefined && (antes.vidro ?? null) !== (campos.vidro ?? null)", "            const vidroMudou = false && antes !== undefined")]),
    # o PDF ao vendedor
    ('A1', 'o parcial sem o carimbo', [(ARQ, "    if (d.faltas.length) carimbo(doc, d.faltas.length)\n", "")]),
    ('A2', 'o rodapé volta ao meio da página', [(ARQ, "    y = FIM - rodape\n", "")]),
    ('A3', 'o bloco do vendedor some', [(ARQ, "    if (d.paraOVendedor) blocos.push(['PARA O VENDEDOR', linhasParaOVendedor(d.paraOVendedor), null])\n", "")]),
    ('A4', 'a guarda do cliente ligada', [(ARQ, "export const GUARDA_DO_ENVIO_AO_CLIENTE_LIGADA = false", "export const GUARDA_DO_ENVIO_AO_CLIENTE_LIGADA = true")]),
    ('A5', 'as definições sem o "(padrão)"', [(ARQS, "${e.doVendedor ? '' : ' (padrão)'}`)", "`)")]),
    ('A6', 'as barras do vendedor pela soma do líquido', [(ARQS, "n_barras: Math.round(x.bruto / x.unidade)", "n_barras: Math.round(x.consumo / (x.medida ?? 1))")]),
    # a conversa depois do "sim"
    ('C1', 'depois do "sim" o texto inteiro volta junto com o arquivo', [(CONV, "            if (sim.enviadoPara && telefonesCasam(sim.enviadoPara, c.telefone)) {", "            if (sim.enviadoPara && false) {")]),
    ('C2', 'só o arquivo, e a saída não é gravada', [(CONV, "                await gravar(SAIDA_SO_O_ARQUIVO, sim.idDoEnvio ?? SEM_ID_DO_ARQUIVO)\n", "")]),
    ('C3', 'os questionamentos não saem', [(TRAV, "        questionamentos = fraseDosQuestionamentos(r.orcamento.numero, c.faltas)", "        questionamentos = null")]),
    ('C4', 'o enviadoPara não sai da etapa', [(CADEIA, ", enviadoPara: envio.destino ?? dono.telefone, idDoEnvio: envio.id ?? null }", " }")]),
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
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}", flush=True)
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}", flush=True)
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
