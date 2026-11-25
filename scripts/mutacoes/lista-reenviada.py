import subprocess, sys, os
# MUTACOES do pedido 0027 (dono do produto, 25/11/2026): o laminado A+B tem A+B mm; nenhum vidro que o vendedor nao escreveu; a lista da foto
# substitui antes de qualquer calculo; a mensagem que trouxe itens e nada valeu nao calcula; um envio, uma resposta.
# Roda SOZINHO na arvore (nada le a arvore enquanto roda). SO=<trecho> roda so as mutacoes cujo texto contem o trecho.
# O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar suite.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'atendimentos-ia-levantamento-por-nome.test.ts', U + 'levantamento-da-conversa.test.ts', U + 'vidro.test.ts']
L = 'src/lib/atendimentos-ia/'
CI, CG, PM, VI = (L + x for x in ['conversa-da-ia.ts', 'conversa-gravada.ts', 'pedido-ao-modelo.ts', 'vidro.ts'])
M = [
 # o laminado A+B
 (VI, "split('+').reduce((s, x) => s + Number(x), 0)", "split('+').reduce((s, x) => Math.max(s, Number(x)), 0)"),
 (VI, "comUnidade: m[2] !== undefined || composta", "comUnidade: m[2] !== undefined"),
 # nenhum vidro que o vendedor nao escreveu
 (CI, "        '- NUNCA proponha ao vendedor um vidro que ele não escreveu (nem \"troque para incolor 5 mm\", nem outra espessura, nem outro tipo): faltando algo do vidro, pergunte só o que falta.',\n", ""),
 # o vidro da foto
 (CI, "const contra = comImagem || (textoDaImagem !== null && nomeDaImagem === null) ? textoComImagem : c.texto", "const contra = comImagem ? textoComImagem : c.texto"),
 (CI, "const contra = comImagem || (textoDaImagem !== null && nomeDaImagem === null) ? textoComImagem : c.texto", "const contra = comImagem || textoDaImagem !== null ? textoComImagem : c.texto"),
 # a mensagem que trouxe itens e nada valeu
 (CI, "        const leuItensSemNada = lidosComCampos > 0 && emEspera.length === 0", "        const leuItensSemNada = false"),
 (CI, "        const leuItensSemNada = lidosComCampos > 0 && emEspera.length === 0", "        const leuItensSemNada = lidosComCampos >= 0 && emEspera.length === 0"),
 (CI, "        if (leuItensSemNada && confirma !== true) return await responder(fraseDosItensSemNada(lidosComCampos), 'nao-avancou')", "        if (leuItensSemNada) return await responder(fraseDosItensSemNada(lidosComCampos), 'nao-avancou')"),
 (CI, "fraseDosItensSemNada(lidosComCampos), 'nao-avancou')", "fraseDosItensSemNada(1), 'nao-avancou')"),
 # a lista substitui com "alterar"
 (CI, "(intencao === 'alterar' && alvo !== null && (inteirasDaLista >= 3 || inteirasDaLista >= alvo.itens.length))", "false"),
 (CI, "(inteirasDaLista >= 3 || inteirasDaLista >= alvo.itens.length)", "(inteirasDaLista >= 2)"),
 # um envio, uma resposta
 (CI, "                if (outra === true) return fim('prazo-esgotado', `${resposta.detalhe} aviso=suprimido_outra_respondeu`)\n", ""),
 (CG, "l.responde_a !== entrada.id)", "true)"),
 (CG, ".not('wuzapi_mensagem_id', 'is', null)", ""),
 (CG, ".not('wuzapi_mensagem_id', 'is', null).gte('criado_em', desde)", ".not('wuzapi_mensagem_id', 'is', null)"),
 (CG, "export const JANELA_DA_RAJADA_MS = 30_000", "export const JANELA_DA_RAJADA_MS = 3_000_000_000"),
 (PM, "[PRAZO_ATE_OS_CABECALHOS_MS, 20_000]", "[PRAZO_ATE_OS_CABECALHOS_MS, PRAZO_ATE_OS_CABECALHOS_MS]"),
 (CI, "prazo(PRAZOS_ATE_OS_CABECALHOS_MS[tentativa - 1] ?? PRAZO_ATE_OS_CABECALHOS_MS)", "prazo(PRAZO_ATE_OS_CABECALHOS_MS)"),
]
M = [x for x in M if os.environ.get('SO', '') in x[1]]
for arq, a, b in M:
    n = open(R + arq).read().count(a)
    if n != 1: print('ABORTA', arq, a[:70], n); sys.exit(3)
mortas = 0
for arq, a, b in M:
    s = open(R + arq).read()
    open(R + arq, 'w').write(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', *T], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:70].replace('\n', ' ') + '  =>  ' + b[:70].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
