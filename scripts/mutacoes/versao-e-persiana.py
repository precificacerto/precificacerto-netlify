import subprocess, sys, os
# MUTACOES do pedido 0039 (dono do produto, 26/11/2026): a versao do calculo cabe na CHECK do banco, e na persiana a cor vence a politica.
# Roda SOZINHO na arvore. SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA vez aborta (codigo 3).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'fronteira-das-escolhas.test.ts', U + 'atendimentos-ia-travessia-do-levantamento.test.ts']
V = 'src/lib/atendimentos-ia/custo-do-orcamento.ts'
F = 'src/lib/atendimentos-ia/fronteira-das-escolhas.ts'
M = [
 (V, "export const VERSAO_DO_CALCULO = 'calculo-2026-11-26b'", "export const VERSAO_DO_CALCULO = 'barras-unicas-pedido-total-peca-exata-2026-11-26'"),
 (V, "export const TAMANHO_MAXIMO_DA_VERSAO_DO_CALCULO = 40", "export const TAMANHO_MAXIMO_DA_VERSAO_DO_CALCULO = 60"),
 (F, "        if (palhetaPelaCorVence(v)) continue", ""),
 (F, "    return pelaCor !== 37 && (opcoesDaVariavel(v.opcoes) ?? []).some((o) => o.valor === pelaCor) ? pelaCor : null", "    return (opcoesDaVariavel(v.opcoes) ?? []).some((o) => o.valor === pelaCor) ? pelaCor : null"),
 (F, "    if (cor === null || cor === undefined || cor.trim() === '' || v.variavel !== VARIAVEL_DA_PALHETA) return null", "    if (cor === null || cor === undefined || cor.trim() === '') return null"),
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
