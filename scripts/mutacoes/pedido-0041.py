import subprocess,sys
A='src/lib/atendimentos-ia/avaliador-de-formulas.ts'
Fr='src/lib/atendimentos-ia/fronteira-das-escolhas.ts'
E='src/lib/atendimentos-ia/escolhas-da-tipologia.ts'
V='src/lib/atendimentos-ia/vidro.ts'
C='src/lib/atendimentos-ia/levantamento-da-conversa.ts'
B='src/lib/atendimentos-ia/levantamento-de-barras.ts'
M=[
(A,"new Set(['FV', 'MD'])","new Set(['MD'])"),
(A,"new Set(['FV', 'MD'])","new Set(['FV'])"),
(A,"if (entrada.semBagueteDoVidro === true) {","if (entrada.semBagueteDoVidro === false) {"),
(Fr,"export const LARGURA_MINIMA_DO_DIVISOR_MM = 1800","export const LARGURA_MINIMA_DO_DIVISOR_MM = 1500"),
(Fr,"larguraMm >= LARGURA_MINIMA_DO_DIVISOR_MM) return null","larguraMm > LARGURA_MINIMA_DO_DIVISOR_MM) return null"),
(Fr,"|| opcaoQueALarguraImpoe(v, larguraMm) !== null","|| false"),
(V,"espessuraMm === 4 &&","espessuraMm !== null &&"),
(V,".includes('BOREAL')",".includes('')"),
(E,"['ARI', 'ARE', 'MAE', 'ID', 'TA'] as const","['ARI', 'ARE', 'MAE', 'ID'] as const"),
(E,"export const MEDIDAS_PERGUNTADAS = ['AT'] as const","export const MEDIDAS_PERGUNTADAS = [] as const"),
(C,"semBagueteDoVidro: vidroSemBaguete(itensDoGrupo[k].vidro, vidros[k].espessura_mm),","semBagueteDoVidro: false,"),
(C,"corDe(itensDoGrupo[k]), itensDoGrupo[k].largura_mm)","corDe(itensDoGrupo[k]), null)"),
(B,"...(e.semBagueteDoVidro ? { semBagueteDoVidro: true } : {}),","")
]
T=['src/utils/__tests__/gabarito-wvetro-1207.test.ts','src/utils/__tests__/fronteira-das-escolhas.test.ts','src/utils/__tests__/escolhas-da-tipologia.test.ts','src/utils/__tests__/vidro.test.ts','src/utils/__tests__/levantamento-da-conversa.test.ts']
import os
INI=int(os.environ.get('DESDE','0'))
for f,a,b in M:
    if open(f).read().count(a)!=1: print('NAO SE APLICA',a); sys.exit(3)
for i,(f,a,b) in enumerate(M,1):
    if i<=INI: continue
    t=open(f).read(); open(f,'w').write(t.replace(a,b))
    r=subprocess.run(['npx','jest',*T],capture_output=True,text=True)
    open(f,'w').write(t)
    print(i,'MORTA' if r.returncode else 'VIVA',flush=True)
