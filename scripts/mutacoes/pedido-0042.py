import subprocess,sys
A='src/lib/atendimentos-ia/avaliador-de-formulas.ts'
C='src/lib/atendimentos-ia/levantamento-da-conversa.ts'
B='src/lib/atendimentos-ia/levantamento-de-barras.ts'
P='src/lib/atendimentos-ia/politica-da-empresa.ts'
M=[
(A,"new Set(['ARI', 'MAE', 'MAI'])","new Set(['MAE', 'MAI'])"),
(A,"new Set(['ARI', 'MAE', 'MAI'])","new Set(['ARI', 'MAI'])"),
(A,"new Set(['ARI', 'MAE', 'MAI'])","new Set(['ARI', 'MAE'])"),
(C,"arremateNaMedidaDoVao: arremateNaMedidaDoVaoDaPolitica(politica),","arremateNaMedidaDoVao: false,"),
(B,"...(entrada.arremateNaMedidaDoVao ? { arremateNaMedidaDoVao: true } : {}),","..."+"{},"),
(P,"n.opcao !== null && forma(n.opcao) === 'SIM'","n.opcao !== null"),
(P,"n !== undefined && n.natureza === 'POLITICA' &&","n !== undefined &&"),
(P,"const n = politica.porVariavel?.[VARIAVEL_DO_ARREMATE_NA_MEDIDA_DO_VAO]","const n = politica.porVariavel?.['X']"),
]
T=['src/utils/__tests__/gabarito-wvetro-1207.test.ts','src/utils/__tests__/levantamento-da-conversa.test.ts']
for f,a,b in M:
    if open(f).read().count(a)!=1: print('NAO SE APLICA',a); sys.exit(3)
for i,(f,a,b) in enumerate(M,1):
    t=open(f).read(); open(f,'w').write(t.replace(a,b))
    r=subprocess.run(['npx','jest',*T],capture_output=True,text=True)
    open(f,'w').write(t)
    print(i,'MORTA' if r.returncode else 'VIVA',flush=True)
