import subprocess,sys,os
Fr='src/lib/atendimentos-ia/fronteira-das-escolhas.ts'
E='src/lib/atendimentos-ia/escolhas-da-tipologia.ts'
M=[
(Fr,"escolhas[la.variavel] = dividida ? ambos : unico","escolhas[la.variavel] = unico"),
(Fr,"if (!dividida) { escolhas[la.variavel] = unico; origem[la.variavel] = 'pelo_acionamento' }","if (true) { escolhas[la.variavel] = unico; origem[la.variavel] = 'pelo_acionamento' }"),
(Fr,"const dividida = mdSim !== undefined && escolhas[VARIAVEL_DO_DIVISOR_DA_PERSIANA] === mdSim","const dividida = false"),
(Fr,"        || (v.variavel === VARIAVEL_DO_TIPO_DE_ACIONAMENTO && temAcionamento)\n",""),
(Fr,"        if (v.variavel === VARIAVEL_DO_TIPO_DE_ACIONAMENTO && temAcionamento) continue // pela regra do acionamento, abaixo\n",""),
(Fr,"aeRotulo.startsWith('MOTOR') && unico","aeRotulo.startsWith('MOTOR') && false && unico"),
(E,"export const ESCOLHAS_DO_ITEM = ['MFI', 'MFE', 'AE', 'LA', 'LR'] as const","export const ESCOLHAS_DO_ITEM = ['MFI', 'MFE', 'AE', 'LR'] as const"),
(E,"doisPanos ? ', individual (1 motor por pano)' : ', simultâneo (1 motor para os 2 panos)'","doisPanos ? ', simultâneo (1 motor para os 2 panos)' : ', individual (1 motor por pano)'"),
(E,"(ditas ? ditas.has('LR') : escolhas.LR !== undefined) ? '' : ' (padrão da tipologia: confirme o lado)'","''"),
(E,"doisPanos ? ', 2 recolhedores, um por pano' : ', 1 recolhedor'","doisPanos ? ', 1 recolhedor' : ', 2 recolhedores, um por pano'"),
]
T=['src/utils/__tests__/gabarito-wvetro-1207-acionamento.test.ts']
for f,a,b in M:
    if open(f).read().count(a)!=1: print('NAO SE APLICA',a); sys.exit(3)
for i,(f,a,b) in enumerate(M,1):
    t=open(f).read(); open(f,'w').write(t.replace(a,b))
    r=subprocess.run(['npx','jest',*T],capture_output=True,text=True)
    open(f,'w').write(t)
    print(i,'MORTA' if r.returncode else 'VIVA',flush=True)
