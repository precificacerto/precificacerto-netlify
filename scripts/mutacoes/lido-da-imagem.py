#!/usr/bin/env python3
"""Mutações do LIDO SÓ DA IMAGEM (o defeito de 18/11/2026, 18:42: o nome escrito na foto caía na guarda do nome): o texto da imagem, a
confirmação curta (CONFIRMAR_DA_IMAGEM, migração 20261118000004), o "sim", o "não", o vidro e a cidade da foto, e a queda sem a migração.
Roda SOZINHA ou numa worktree (mutacao-na-arvore-de-trabalho.md)."""
import os, subprocess, sys
L = 'src/lib/atendimentos-ia/'
CONV, LIDO, PA, MID = L + 'conversa-da-ia.ts', L + 'lido-da-imagem.ts', L + 'pergunta-em-aberto.ts', L + 'midia-da-mensagem.ts'
PONTA = ['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts', '-t', '30b']
M = [
 ('L1 o texto da imagem sem anexo vale', LIDO, "    if (!temAnexo) return null\n", ""),
 ('L2 a cidade some da pergunta', LIDO, "${d.endereco ? `, de “${d.endereco}”` : ''}", ""),
 ('L3 o vidro some da pergunta', LIDO, "${d.vidros?.length ? `, com vidro ${juntarComE(d.vidros.map((v) => `“${v}”`))}` : ''}", ""),
 ('C1 o nome da imagem não é conferido no texto dela', CONV, ": nomeDaMensagem(proposta.nome, textoComImagem) ?? nomeDoCliente(proposta, textoComImagem)", ": (typeof proposta.nome === 'string' ? proposta.nome : null)"),
 ('C2 o nome da imagem grava direto (sem confirmação)', CONV, "            let lido = noTexto ?? naPergunta ?? retomado ?? doCliente\n", "            let lido = noTexto ?? naPergunta ?? retomado ?? doCliente ?? nomeDaImagem\n"),
 ('C3 a foto de outro cliente fica na montagem', CONV, "nomeDoCliente(proposta, c.texto) ?? nomeDaImagem\n", "nomeDoCliente(proposta, c.texto)\n"),
 ('C4 o "não" grava como o sim', CONV, "                    if (lido === null && confirma === false) {", "                    if (false) {"),
 ('C5 o que não é sim nem não confirma', CONV, "                    if (lido === null && confirma !== true) {", "                    if (false) {"),
 ('C6 a cidade da foto não entra no sim', CONV, "                    if (dadosAbertos.endereco && dadosDaMensagem.cliente.endereco === undefined) dadosDaMensagem.cliente.endereco = dadosAbertos.endereco\n", ""),
 ('C7 sem migração, a pergunta vai mesmo assim', CONV, "                    if (guardaPergunta && await gravarPerguntaEmAberto(c.tenantId, c.remetenteId, p)) {", "                    if (guardaPergunta && (await gravarPerguntaEmAberto(c.tenantId, c.remetenteId, p), true)) {"),
 ('C8 a confirmação guarda as esquadrias sem o vidro da foto', CONV, "levantamentos: [], itens: comImagem.itens, dadosDaImagem: dados }", "levantamentos: [], itens: emEspera, dadosDaImagem: dados }"),
 ('C9 o vidro da foto vale fora da confirmação', CONV, "                const podado = vidroPodado(item.vidro, comImagem ? textoComImagem : c.texto)", "                const podado = vidroPodado(item.vidro, textoComImagem)"),
 ('C10 a cidade não vai na pergunta', CONV, "                    const dados = { ...(endereco ? { endereco } : {}), ", "                    const dados = { "),
 ('C11 a pergunta refeita some (o "sim" não acha)', CONV, "    if (p.pergunta === 'CONFIRMAR_DA_IMAGEM') return p.nome ? { p, citados: [], texto: fraseDeConfirmarDaImagem(p.nome, p.dadosDaImagem ?? {}) } : null\n", ""),
 ('C12 o sim não marca o nome', CONV, "                    lido = nomeAberto\n", ""),
 ('P1 a CONFIRMAR_DA_IMAGEM não grava os dados', PA, "            ...(p.pergunta === 'CONFIRMAR_DA_IMAGEM' ? { dados_da_imagem: p.dadosDaImagem ?? {} } : {}) },", "            },"),
 ('P2 os dados da imagem não são lidos', PA, "    if (linha && linha.pergunta === 'CONFIRMAR_DA_IMAGEM') {", "    if (false) {"),
 ('P3 o 23514 da imagem lança', PA, "    if (tabelaAusente(error) || error.code === '23514' || error.code === 'PGRST204') return false", "    if (tabelaAusente(error) || error.code === 'PGRST204') return false"),
 ('I1 a instrução da foto sem o texto_da_imagem', MID, "    + ' Copie em texto_da_imagem todo o texto escrito na foto, linha a linha, como está.'\n", ""),
]
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'harness'))
from trecho_unico import exigir_trecho_unico
orig = {a: open(a, encoding='utf-8').read() for a in {m[1] for m in M}}
exigir_trecho_unico((nome, [(arq, orig[arq], de, para)]) for nome, arq, de, para in M)
jest = lambda s: subprocess.run(['npx', 'jest', '--ci', *s], capture_output=True, text=True)
vivas = []
try:
    for nome, arq, de, para in M:
        open(arq, 'w', encoding='utf-8').write(orig[arq].replace(de, para))
        morta = jest(PONTA).returncode != 0
        open(arq, 'w', encoding='utf-8').write(orig[arq])
        print(f"{'morta' if morta else 'VIVA '}  {nome}", flush=True)
        if not morta: vivas.append(nome)
finally:
    for a, t in orig.items(): open(a, 'w', encoding='utf-8').write(t)
controle = jest(PONTA).returncode == 0
print('controle (sem mutação):', 'verde' if controle else 'VERMELHO')
print(f'{len(M) - len(vivas)} de {len(M)} mortas' + (f'; vivas: {vivas}' if vivas else ''))
sys.exit(1 if vivas or not controle else 0)
