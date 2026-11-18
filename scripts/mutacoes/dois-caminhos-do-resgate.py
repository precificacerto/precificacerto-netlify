#!/usr/bin/env python3
"""Mutações dos DOIS CAMINHOS DO RESGATE (dono do produto, 18/11/2026): o pedido dito, o desempate e as frases (resgate-do-orcamento.ts), e a
conversa que busca orçamentos, pergunta QUAL_ORCAMENTO e manda o arquivo (conversa-da-ia.ts), mais o desempate da lista dos levantamentos.
Cada mutação troca um trecho; as suítes dela têm de ficar vermelhas. Roda SOZINHA ou numa worktree (mutacao-na-arvore-de-trabalho.md).
Uso: python3 -B scripts/mutacoes/dois-caminhos-do-resgate.py  (os arquivos voltam ao original no fim, sempre)."""
import os, subprocess, sys

LIB = 'src/lib/atendimentos-ia/'
RES, CONV = LIB + 'resgate-do-orcamento.ts', LIB + 'conversa-da-ia.ts'
T = 'src/utils/__tests__/'
PURA = [T + 'resgate-do-orcamento.test.ts']
PONTA = [T + 'atendimentos-ia-levantamento-por-nome.test.ts', '-t', r'\(43\)|\(25\)']

M = [
 # o pedido e o desempate
 ('R1 as duas palavras decidem pelo orçamento', RES, "return orcamento && !levantamento ? 'orcamento'", "return orcamento ? 'orcamento'", PURA),
 ('R2 "orçamentista" vira pedido', RES, "const orcamento = /\\borcamentos?\\b/.test(t)", "const orcamento = /orcament/.test(t)", PURA),
 ('R3 o critério ausente em todas entra', RES, "        if (opcoes.every((o) => c.valor(o) === null)) continue\n", "", PURA),
 ('R4 o critério que não separa entra', RES, "        if (grupos([...escolhidos, c]) > grupos(escolhidos)) escolhidos.push(c)", "        escolhidos.push(c)", PURA),
 ('R5 os critérios não param quando já separam', RES, "        if (grupos(escolhidos) === opcoes.length) break\n", "", PURA),
 ('R6 a família entra sem separar', RES, "        if (c.soQuandoSepara) { if (new Set(opcoes.map((o) => c.valor(o) ?? '')).size > 1) escolhidos.push(c); continue }", "        if (c.soQuandoSepara) { escolhidos.push(c); continue }", PURA),
 ('R7 a ordem do mais antigo ao mais recente', RES, "(a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : b.numero - a.numero)", "(a.criado_em < b.criado_em ? -1 : a.criado_em > b.criado_em ? 1 : b.numero - a.numero)", PURA),
 ('R8 a lista sem o número do orçamento', RES, "return `${k + 1}) ${o.nome}, nº ${o.numero}", "return `${k + 1}) ${o.nome}", PURA),
 ('R9 o orçamento sem valor entra na lista', RES, "        .filter((o) => typeof o.valor_venda === 'number' || (typeof o.valor_venda === 'string' && o.valor_venda !== ''))\n", "", [T + 'atendimentos-ia-levantamento-por-nome.test.ts', '-t', r'\(43\)']),
 ('R10 o arquivado entra na lista', RES, ".in('levantamento_id', ids).is('deleted_at', null),", ".in('levantamento_id', ids),", [T + 'atendimentos-ia-levantamento-por-nome.test.ts', '-t', r'\(43\)']),
 # a conversa
 ('C1 o pedido de orçamento não busca orçamentos', CONV, "emEspera.length === 0 && pedidoDoResgate(c.texto) === 'orcamento') {", "emEspera.length === 0 && false) {", PONTA),
 ('C2 o pedido de levantamento busca orçamentos', CONV, "emEspera.length === 0 && pedidoDoResgate(c.texto) === 'orcamento') {", "emEspera.length === 0 && pedidoDoResgate(c.texto) !== null) {", PONTA),
 ('C3 um orçamento só também pergunta', CONV, "                    if (orcamentos.length === 1) return await mandarOrcamento(orcamentos[0])\n", "", PONTA),
 ('C4 a escolha não manda o arquivo', CONV, "                    if (escolhido) { rastro.nome = 'da_pergunta'; return await mandarOrcamento(escolhido) }\n", "", PONTA),
 ('C5 a escolha manda o primeiro da lista', CONV, "return await mandarOrcamento(escolhido) }", "return await mandarOrcamento(lista[0]) }", PONTA),
 ('C6 a pergunta respondida fica guardada', CONV, "            if (temLinha) await apagarPerguntaEmAberto(c.tenantId, c.remetenteId)\n            const deps = dependenciasDoServidor", "            const deps = dependenciasDoServidor", PONTA),
 ('C7 sem migração, o log cala', CONV, " && p.pergunta === 'QUAL_ORCAMENTO') rastro.qualOrcamento = 'sem_migracao'", " && false) rastro.qualOrcamento = 'sem_migracao'", PONTA),
 ('C8 a lista repetida sai igual', CONV, "            if (p.pergunta === 'QUAL_ORCAMENTO' && p.nome && aberta?.orcamentos) return await falar(fraseDeQualOrcamentoEmOutrasPalavras(p.nome, aberta.orcamentos), 'nao-avancou')\n", "", PONTA),
 ('C9 o desempate dos levantamentos sem a cidade', CONV, "    { nome: 'cidade', valor: (o) => (typeof o.endereco === 'string' && o.endereco.trim() ? o.endereco.trim() : null) },\n", "", PONTA),
 ('C10 o desempate dos levantamentos sem os itens', CONV, "    { nome: 'itens', valor: (o) => (o.nItens === undefined ? null : `${o.nItens} ${o.nItens === 1 ? 'item' : 'itens'}`) },\n", "", PONTA),
 ('C11 a cidade não é lida com o levantamento', CONV, "select('id, nome, nome_normalizado, estado, criado_em, atualizado_em, endereco')", "select('id, nome, nome_normalizado, estado, criado_em, atualizado_em')", PONTA),
 ('C12 o desempate não lê os itens', CONV, "                    const opcoes = await comDesempate(c.tenantId, opcoesDeResgate(comparacao.existentes))", "                    const opcoes = opcoesDeResgate(comparacao.existentes)", PONTA),
 ('C13 o log não diz quantos orçamentos', CONV, " + (r.qualOrcamento === '-' ? '' : ` qual_orcamento=${r.qualOrcamento}`)", "", PONTA),
]

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'harness'))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta com o código 3 (mutacao-que-nao-se-aplica.md)

orig = {a: open(a, encoding='utf-8').read() for a in {m[1] for m in M}}
exigir_trecho_unico((nome, [(arq, orig[arq], de, para)]) for nome, arq, de, para, _ in M)
jest = lambda suites: subprocess.run(['npx', 'jest', '--ci', *suites], capture_output=True, text=True)
vivas = []
try:
    for nome, arq, de, para, suites in M:
        open(arq, 'w', encoding='utf-8').write(orig[arq].replace(de, para))
        morta = jest(suites).returncode != 0
        open(arq, 'w', encoding='utf-8').write(orig[arq])
        print(f"{'morta' if morta else 'VIVA '}  {nome}", flush=True)
        if not morta: vivas.append(nome)
finally:
    for a, t in orig.items(): open(a, 'w', encoding='utf-8').write(t)
controle = [jest(s).returncode == 0 for s in (PURA, PONTA)]
print('controle (sem mutação):', 'verde' if all(controle) else f'VERMELHO {controle}')
print(f'{len(M) - len(vivas)} de {len(M)} mortas' + (f'; vivas: {vivas}' if vivas else ''))
sys.exit(1 if vivas or not all(controle) else 0)
