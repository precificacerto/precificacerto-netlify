import subprocess,sys
F='src/utils/__tests__/gabarito-wvetro-1207.test.ts'
M=[
("'DP-17': { MD: 2 }","'DP-17': { MD: 1 }"),
("'DP-69': { ID: 1 }","'DP-69': { ID: 2 }"),
("'DP-73': { PTM: 2 }","'DP-73': { PTM: 1 }"),
("TA: 2, AT: 1180","TA: 1, AT: 1180"),
("TA: 2, AT: 1180","TA: 2, AT: 1050"),
("const ARREMATES = new Set(['BZ1770', 'BZ0010'])","const ARREMATES = new Set(['BZ1770'])"),
("['GB34|320|45/45', 4], ['GB34|570|45/45', 4]","['GB34|320|45/45', 4]"),
("['4661|1108|90/90', 2]","['4661|1108|90/90', 3]"),
]
t=open(F).read()
for a,b in M:
    if t.count(a)!=1: print('NAO SE APLICA',a); sys.exit(3)
for i,(a,b) in enumerate(M,1):
    open(F,'w').write(t.replace(a,b))
    r=subprocess.run(['npx','jest',F],capture_output=True,text=True)
    open(F,'w').write(t)
    print(i,'MORTA' if r.returncode else 'VIVA')
