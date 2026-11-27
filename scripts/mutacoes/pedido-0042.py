import subprocess,sys
A='src/lib/atendimentos-ia/avaliador-de-formulas.ts'
M=[
(A,"new Set(['FV', 'MD', 'ARI', 'MAE', 'MAI'])","new Set(['FV', 'MD', 'MAE', 'MAI'])"),
(A,"new Set(['FV', 'MD', 'ARI', 'MAE', 'MAI'])","new Set(['FV', 'MD', 'ARI', 'MAI'])"),
(A,"new Set(['FV', 'MD', 'ARI', 'MAE', 'MAI'])","new Set(['FV', 'MD', 'ARI', 'MAE'])"),
]
T=['src/utils/__tests__/gabarito-wvetro-1207.test.ts','src/utils/__tests__/corte-do-wvetro.test.ts']
for f,a,b in M:
    if open(f).read().count(a)!=1: print('NAO SE APLICA',a); sys.exit(3)
for i,(f,a,b) in enumerate(M,1):
    t=open(f).read(); open(f,'w').write(t.replace(a,b))
    r=subprocess.run(['npx','jest',*T],capture_output=True,text=True)
    open(f,'w').write(t)
    print(i,'MORTA' if r.returncode else 'VIVA',flush=True)
