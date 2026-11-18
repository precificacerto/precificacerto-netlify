#!/usr/bin/env python3
"""Mutações da FOTO e do PDF do vendedor (dono do produto, 18/11/2026): o leitor da mídia (payload-wuzapi.ts), os limites e as recusas
(midia-da-mensagem.ts), o download (midia-do-wuzapi.ts), a rota de entrada (inbound.ts) e a conversa (conversa-da-ia.ts).
Cada mutação troca um trecho; as suítes dela têm de ficar vermelhas. Roda SOZINHA ou numa worktree (mutacao-na-arvore-de-trabalho.md).
Uso: python3 -B scripts/mutacoes/midia-da-mensagem.py  (os arquivos voltam ao original no fim, sempre)."""
import os, subprocess, sys

LIB = 'src/lib/atendimentos-ia/'
PAYLOAD, MIDIA, WUZAPI = LIB + 'payload-wuzapi.ts', LIB + 'midia-da-mensagem.ts', LIB + 'midia-do-wuzapi.ts'
INBOUND, CONVERSA = 'src/pages/api/atendimentos-ia/inbound.ts', LIB + 'conversa-da-ia.ts'
T = 'src/utils/__tests__/'
PURA = [T + 'atendimentos-ia-midia-da-mensagem.test.ts']
ROTA = [T + 'atendimentos-ia-inbound.test.ts']
PONTA = [T + 'atendimentos-ia-levantamento-por-nome.test.ts', '-t', 'a FOTO e o PDF do vendedor']

# (nome, arquivo, de, para, suítes)
M = [
 # o leitor da mídia
 ('P1 o invólucro documentWithCaptionMessage não é aberto', PAYLOAD, "const INVOLUCROS = ['documentWithCaptionMessage', ", "const INVOLUCROS = [", PURA),
 ('P2 a legenda não é aparada', PAYLOAD, 'legenda: legenda === null ? null : legenda.trim(),', 'legenda,', PURA),
 ('P3 o download sem a chave da mídia', PAYLOAD, "download: (url || directPath) && mediaKey && fileEncSHA256", "download: (url || directPath) && fileEncSHA256", PURA),
 ('P4 fileLength zero vale', PAYLOAD, 'return Number.isSafeInteger(n) && n > 0 ? n : null', 'return Number.isSafeInteger(n) && n >= 0 ? n : null', PURA),
 ('P5 a grafia Url não é lida', PAYLOAD, "campoTexto(m, 'URL', 'url', 'Url')", "campoTexto(m, 'URL', 'url')", PURA),
 ('P6 o nome no que não é documento', PAYLOAD, "nome: tipo === 'documento' ? campoTexto(m, 'fileName', 'FileName') : null,", "nome: campoTexto(m, 'fileName', 'FileName'),", PURA),
 # os limites e as recusas
 ('L1 o limite da imagem no dobro', MIDIA, 'export const LIMITE_DA_IMAGEM_EM_BASE64 = 10_000_000', 'export const LIMITE_DA_IMAGEM_EM_BASE64 = 20_000_000', PURA),
 ('L2 a fronteira do tamanho declarado é >=', MIDIA, "if (como === 'imagem' && m.tamanho > LIMITE_DA_IMAGEM_BYTES)", "if (como === 'imagem' && m.tamanho >= LIMITE_DA_IMAGEM_BYTES)", PURA),
 ('L3 o PDF grande declarado não recusa', MIDIA, "        if (como === 'pdf' && m.tamanho > LIMITE_DO_PDF_BYTES) return recusa('pdf_grande', { bytes: m.tamanho })\n", '', PURA),
 ('L4 o lado máximo não é conferido', MIDIA, '    if (d && Math.max(d.largura, d.altura) > LADO_MAXIMO_DA_IMAGEM_PX) return recusa', '    if (false && d) return recusa', PURA),
 ('L5 o PDF com senha passa', MIDIA, "        if (pdfComSenha(bytes)) return recusa('pdf_com_senha')\n", '', PURA),
 ('L6 o tamanho real da imagem não é conferido', MIDIA, "    if (data.length > LIMITE_DA_IMAGEM_EM_BASE64) return recusa('imagem_grande', { bytes: bytes.length })\n", '', PURA),
 ('L7 o tipo declarado no lugar do dos bytes', MIDIA, "bloco: { type: 'image', source: { type: 'base64', media_type: tipo, data } }", "bloco: { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }", PURA),
 ('L8 o "PDF" que não é PDF passa', MIDIA, "        if (tipo !== PDF) return recusa('arquivo_nao_confere')\n", '', PURA),
 ('L9 a planilha lida como documento', MIDIA, '    } else if (ehPlanilha(m)) return recusa(\'planilha\')\n', '    }\n', PURA),
 ('L10 o áudio sem resposta própria', MIDIA, "    if (m.tipo === 'audio') return recusa('audio')\n", '', PURA),
 ('L11 emMB arredonda para baixo', MIDIA, 'Math.ceil(bytes / 100_000)', 'Math.floor(bytes / 100_000)', PURA),
 ('L12 o SOF do JPEG lido trocado (altura e largura)', MIDIA, 'return { largura: u16be(i + 7), altura: u16be(i + 5) }', 'return { largura: u16be(i + 5), altura: u16be(i + 7) }', PURA),
 ('L13 sem dados do download segue para baixar', MIDIA, "    if (m.download === null) return recusa('sem_dados_do_download')\n", '', PURA),
 ('L14 o marcador sem o nome do documento', MIDIA, "return m.nome ? `[documento: ${m.nome}]` : '[documento]'", "return '[documento]'", PURA),
 ('L15 a instrução sem o "não adivinhe"', MIDIA, "    + ' Medida ou número que não estiver legível na foto NÃO entra: pergunte. Nunca complete, arredonde nem adivinhe um número.'", "    + ''", PURA),
 # o download
 ('W1 o documento pelo endpoint da imagem', WUZAPI, "(m.tipo === 'imagem' ? '/chat/downloadimage' : '/chat/downloaddocument')", "'/chat/downloadimage'", PURA),
 ('W2 o token fora do header', WUZAPI, "headers: { 'Content-Type': 'application/json', token },", "headers: { 'Content-Type': 'application/json' },", PURA),
 ('W3 o erro do WUZAPI lido como arquivo', WUZAPI, "        if (!r.ok) return { ok: false, detalhe: `status=${r.status}` }\n", '', PURA),
 ('W4 o corpo sem a MediaKey', WUZAPI, 'MediaKey: d.mediaKey, ', '', PURA),
 # a rota
 ('R1 a legenda não vira texto', INBOUND, 'const texto = textoDaMensagem(event) ?? midia?.legenda ?? null', 'const texto = textoDaMensagem(event)', ROTA),
 ('R2 a mídia sem texto volta a ser ignorada', INBOUND, "if (texto === null && midia === null) return fim(200, 'ignorada-sem-texto')", "if (texto === null) return fim(200, 'ignorada-sem-texto')", ROTA),
 ('R3 grava a legenda sem o marcador', INBOUND, 'const textoDaEntrada = midia ? textoDaEntradaComMidia(midia, texto) : (texto as string)', 'const textoDaEntrada = (texto ?? \'\') as string', ROTA),
 ('R4 a conversa não recebe a mídia', INBOUND, ', ...(midia ? { midia } : {}) })', ' })', ROTA + ['-t', 'MÍDIA']),
 # a conversa
 ('C1 o bloco depois do texto', CONVERSA, "content: anexo ? [anexo.bloco, { type: 'text', text: anexo.instrucao }, { type: 'text', text: mensagem }] : mensagem", "content: anexo ? [{ type: 'text', text: mensagem }, anexo.bloco, { type: 'text', text: anexo.instrucao }] : mensagem", PONTA),
 ('C2 o anexo não vai ao modelo', CONVERSA, '        }, rastro.ia, historico, anexo)\n', '        }, rastro.ia, historico, null)\n', PONTA),
 ('C3 o áudio cai no modelo', CONVERSA, "            if ('motivo' in leitura) { rastro.midia = marcaNoLog(c.midia, leitura.motivo); return await falar(leitura.frase, 'midia-nao-lida') }\n", '', PONTA),
 ('C4 a falha do download fica em silêncio', CONVERSA, "            if ('detalhe' in baixada) { rastro.midia = marcaNoLog(c.midia, 'falhou_ao_baixar', leitura.como); return await falar(fraseDaRecusa(c.midia, 'falhou_ao_baixar'), 'midia-nao-lida', `download=${baixada.detalhe}`) }\n", "            if ('detalhe' in baixada) return fim('midia-nao-lida')\n", PONTA),
 ('C5 a recusa da API vira "não respondeu"', CONVERSA, '        if (anexo && (r.status === 400 || r.status === 413)) return', '        if (false && anexo) return', PONTA),
 ('C6 a recusa passa por responder(), sem a redação', CONVERSA, "return await falar(leitura.frase, 'midia-nao-lida') }", "return await responder(leitura.frase, 'midia-nao-lida') }", PONTA),
 ('C7 a linha [IA] sem a mídia', CONVERSA, "        + (r.midia === '-' ? '' : ` midia=${r.midia}`)\n", '', PONTA),
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
controle = [jest(s).returncode == 0 for s in (PURA, ROTA, PONTA)]
print('controle (sem mutação):', 'verde' if all(controle) else f'VERMELHO {controle}')
print(f'{len(M) - len(vivas)} de {len(M)} mortas' + (f'; vivas: {vivas}' if vivas else ''))
sys.exit(1 if vivas or not all(controle) else 0)
