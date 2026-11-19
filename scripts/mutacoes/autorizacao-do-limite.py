#!/usr/bin/env python3
"""Mutações da AUTORIZAÇÃO DA MEDIDA FORA DO LIMITE (dono do produto, 18/11/2026, decisão 1): o pedido e a liberação no item
(autorizacao-do-limite.ts), a tipologia oferecida pelo padrão (tipologia-padrao.ts), a montagem que respeita a liberação
(levantamento-em-montagem.ts) e a conversa que pergunta, grava e responde (conversa-da-ia.ts).
Cada mutação troca um trecho; as suítes dela têm de ficar vermelhas. Roda SOZINHA ou numa worktree (mutacao-na-arvore-de-trabalho.md).
Uso: python3 -B scripts/mutacoes/autorizacao-do-limite.py  (os arquivos voltam ao original no fim, sempre)."""
import os, subprocess, sys

LIB = 'src/lib/atendimentos-ia/'
AUT, PADRAO, MONT, CONV = LIB + 'autorizacao-do-limite.ts', LIB + 'tipologia-padrao.ts', LIB + 'levantamento-em-montagem.ts', LIB + 'conversa-da-ia.ts'
T = 'src/utils/__tests__/'
PURA = [T + 'tipologia-padrao-atributo-por-atributo.test.ts']
MODULO = [T + 'autorizacao-do-limite.test.ts']
PONTA = [T + 'atendimentos-ia-levantamento-por-nome.test.ts', '-t', 'AUTORIZAÇÃO DA MEDIDA|OS LIMITES|CASO DAIANE|leituras antes do modelo']

# (nome, arquivo, de, para, suítes)
M = [
 # o módulo
 ('A1 a autorização vale com outra medida', AUT, "l !== undefined && l.autorizadoPor !== null && l.tipologia === i.tipologia && mesmaMedida(l, i)", "l !== undefined && l.autorizadoPor !== null && l.tipologia === i.tipologia", PONTA),
 ('A2 a autorização vale com outra tipologia', AUT, "l !== undefined && l.autorizadoPor !== null && l.tipologia === i.tipologia && mesmaMedida(l, i)", "l !== undefined && l.autorizadoPor !== null && mesmaMedida(l, i)", MODULO),
 ('A3 o pedido vale com o item já com tipologia', AUT, "l !== undefined && l.autorizadoPor === null && i.tipologia === null && mesmaMedida(l, i)", "l !== undefined && l.autorizadoPor === null && mesmaMedida(l, i)", MODULO),
 ('A4 o pedido vale com outra medida', AUT, "l !== undefined && l.autorizadoPor === null && i.tipologia === null && mesmaMedida(l, i)", "l !== undefined && l.autorizadoPor === null && i.tipologia === null", MODULO),
 ('A5 o vencido nunca sai', AUT, "l !== undefined && !autorizacaoVale(l, i) && !pedidoEmAberto(l, i)", "false", PONTA),
 ('A6 sem a coluna, a leitura quebra', AUT, "        if (colunaAusente(error)) return 'sem_migracao'\n        throw new Error(`orcamentista_levantamento_item (limite): ${error.message}`)\n    }\n    const linhas", "        throw new Error(`orcamentista_levantamento_item (limite): ${error.message}`)\n    }\n    const linhas", PONTA),
 ('A7 a sonda não vê a migração ausente', AUT, "    const { error } = await supabaseAdmin.from('orcamentista_levantamento_item').select('limite_tipologia').eq('tenant_id', tenantId).limit(1)", "    const error = null as { code?: string; message: string } | null", PONTA),
 ('A8 a autorização sem quem', AUT, "{ limite_autorizado_por: m.por, limite_autorizado_em: agora }", "{ limite_autorizado_por: nada, limite_autorizado_em: agora }", PONTA),
 ('A9 a autorização sem quando', AUT, "{ limite_autorizado_por: m.por, limite_autorizado_em: agora }", "{ limite_autorizado_por: m.por, limite_autorizado_em: nada }", PONTA),
 ('A10 o pedido sem a medida', AUT, "limite_largura_mm: m.largura_mm, limite_altura_mm: m.altura_mm, limite_pedido_em: agora", "limite_largura_mm: m.largura_mm, limite_altura_mm: nada, limite_pedido_em: agora", PONTA),
 # o padrão
 ('P1 a única fora do limite não oferece', PADRAO, "oferecer(unica.c, [unica.c]); return { motivo: 'LIMITES' } }", "return { motivo: 'LIMITES' } }", PURA),
 ('P2 a modulação oferece a última', PADRAO, "oferecer(porModulacao[0].c, porModulacao.map(({ c }) => c))", "oferecer(porModulacao[porModulacao.length - 1].c, porModulacao.map(({ c }) => c))", PURA),
 ('P4 a frase sem a pergunta da autorização', PADRAO, "fora do limite? `\n    + 'Se a medida estiver errada, me mande a certa.'", "fora do limite. `\n    + 'Se a medida estiver errada, me mande a certa.'", PURA),
 # a montagem
 ('N1 a liberação não protege a tipologia', MONT, " && !ctx.limiteAutorizado(alvo)) {", ") {", PONTA),
 # a conversa
 ('C1 o "sim" não põe a tipologia', CONV, "if (confirma) { item.tipologia = l.tipologia; autorizados.push(item.ordem);", "if (confirma) { autorizados.push(item.ordem);", PONTA),
 ('C2 o "sim" vale sem pedido em aberto', CONV, "                if (!l || !pedidoEmAberto(l, item)) continue\n                if (confirma)", "                if (!l) continue\n                if (confirma)", PONTA),
 ('C3 o pedido do padrão não vira autorização', CONV, "if (paraAutorizar && limites !== 'sem_migracao' && !negados.includes(item.ordem)) {", "if (false) {", PONTA),
 ('C4 o "não" pede a autorização de novo', CONV, "if (paraAutorizar && limites !== 'sem_migracao' && !negados.includes(item.ordem)) {", "if (paraAutorizar && limites !== 'sem_migracao') {", PONTA),
 ('C6 o pedido igual se regrava', CONV, "                    if (l && pedidoEmAberto(l, item) && l.tipologia === pedida) continue\n", "", PONTA),
 ('C7 o vencido não sai', CONV, "if (negados.includes(item.ordem) || limiteVencido(l, item)) {", "if (negados.includes(item.ordem)) {", PONTA),
 ('C8 sem resposta, a pergunta genérica', CONV, "        if (nadaMudou && alvo && comPedido.length > 0) {", "        if (false) {", PONTA),
 ('C9 o "não" não limpa o pedido', CONV, "                await gravarLimites(c.tenantId, alvo.id, negados.map((ordem) => ({ tipo: 'limpar' as const, ordem })))\n", "", PONTA),
 ('C10 o pedido em aberto não vai ao modelo', CONV, "pendenciaAberta ? [...pedidosDaMontagem, perguntaDasPendencias(", "pendenciaAberta ? [perguntaDasPendencias(", PONTA),
 ('C11 a recusa do modelo não vira pedido', CONV, "            if (item && item.tipologia === null && !negados.includes(r.ordem)) pedir.set(r.ordem, r.tipologia)\n", "", PONTA),
 ('C12 o log não diz o limite', CONV, " + (r.limite === '-' ? '' : ` limite=${r.limite}`)", "", PONTA),
 ('C14 o pedido anterior esquece a tipologia', CONV, "} else if (anterior && doAnterior.length && !doAnterior.some((x) => cabeNosLimites(x, item))) {", "} else if (false) {", PONTA),
 ('C13 sem migração, a autorização é oferecida', CONV, "        if (limites === 'sem_migracao') rastro.limite = 'sem_migracao'\n", "", PONTA),
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
