import subprocess, sys, os
# MUTACOES do pedido 0032 (dono do produto, 26/11/2026): toda falta do orcamento diz de qual bloco e (AGENTE, MOTOR, FORNECEDOR, COMERCIAL).
# Roda SOZINHO na arvore. SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA vez aborta (codigo 3).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'bloco-da-falta.test.ts', U + 'custo-do-levantamento-tres-caminhos.test.ts', U + 'levantamento-da-conversa.test.ts']
L = 'src/lib/atendimentos-ia/'
B, CS, LC, AO = L + 'bloco-da-falta.ts', L + 'custo-do-orcamento-servidor.ts', L + 'levantamento-da-conversa.ts', L + 'arquivo-do-orcamento.ts'
M = [
 (B, "    return Object.prototype.hasOwnProperty.call(BLOCO_DO_MOTIVO, motivo) ? BLOCO_DO_MOTIVO[motivo] : null", "    return BLOCO_DO_MOTIVO[motivo] ?? null"),
 (B, "    if (bloco === null || JA_TEM_BLOCO.test(frase)) return frase", "    if (bloco === null) return frase"),
 (B, "    if (bloco === null || JA_TEM_BLOCO.test(frase)) return frase", "    if (JA_TEM_BLOCO.test(frase)) return frase"),
 (B, "    return m ? { bloco: m[0], resto: frase.slice(m[0].length) } : { bloco: '', resto: frase }", "    return { bloco: '', resto: frase }"),
 (B, "    LINHA_NAO_AVALIADA: 'MOTOR',", "    LINHA_NAO_AVALIADA: 'FORNECEDOR',"),
 (B, "    SEM_COR: 'AGENTE',", ""),
 (B, "    ESPESSURA_DO_VIDRO_AUSENTE: 'AGENTE',", "    ESPESSURA_DO_VIDRO_AUSENTE: 'MOTOR',"),
 (B, "    NENHUM_BAGUETE_PARA_A_ESPESSURA: 'MOTOR',", "    NENHUM_BAGUETE_PARA_A_ESPESSURA: 'AGENTE',"),
 (CS, "            faltas.push({ ...doGrupo(j), cor, ...f, bloco, frase: fraseComBloco(bloco, f.frase) })", "            faltas.push({ ...doGrupo(j), cor, ...f, bloco, frase: f.frase })"),
 (CS, "            faltas.push({ ...doGrupo(j), cor, ...f, bloco, frase: fraseComBloco(bloco, f.frase) })", "            faltas.push({ ...doGrupo(j), cor, ...f, bloco: null, frase: fraseComBloco(bloco, f.frase) })"),
 (LC, "const ehCurta = (f: string) => /^(?:\\[(?:AGENTE|MOTOR|FORNECEDOR|COMERCIAL)\\] )?[a-zà-ÿ]/.test(f)", "const ehCurta = (f: string) => /^[a-zà-ÿ]/.test(f)"),
 (LC, "        const comBloco = (linha: string) => fraseComBloco(blocos[k] ?? null, linha)", "        const comBloco = (linha: string) => linha"),
 (LC, "...semTempo.map((): BlocoDaFalta => 'MOTOR'),", "...semTempo.map((): BlocoDaFalta => 'COMERCIAL'),"),
 (LC, "        const x = porCodigo.get(f.codigo_do_motor) ?? { frase: fraseComBloco(blocoDaFalta(f.motivo), f.frase), esquadrias: [] }", "        const x = porCodigo.get(f.codigo_do_motor) ?? { frase: f.frase, esquadrias: [] }"),
 (AO, "return `• ${bloco}${f.codigo} (", "return `• ${f.codigo} ("),
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
