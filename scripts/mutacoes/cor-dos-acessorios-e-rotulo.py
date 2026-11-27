import subprocess,sys
P='src/lib/atendimentos-ia/politica-da-empresa.ts'
Fr='src/lib/atendimentos-ia/fronteira-das-escolhas.ts'
M=[
(P,"const PREFIXO_DE_CODIGO = /^\\s*[A-Z0-9][A-Z0-9./]*\\s+-\\s+/i","const PREFIXO_DE_CODIGO = /^\\s*ZZZZ\\s+-\\s+/i"),
(P,"forma(rotulo).startsWith(texto) || forma(rotuloSemCodigo(rotulo)).startsWith(texto)","forma(rotulo).startsWith(texto)"),
(P,"forma(rotulo) === texto || forma(rotuloSemCodigo(rotulo)) === texto","forma(rotulo) === texto"),
(Fr,"semAcento(cor).toUpperCase().trim() === 'BRANCO' ? 'BRANCO' : 'PRETO'","semAcento(cor).toUpperCase().trim() === 'BRANCO' ? 'PRETO' : 'BRANCO'"),
(Fr,"return achadas.length === 1 ? achadas[0].valor : null","return achadas.length >= 1 ? achadas[0].valor : null"),
(Fr,"v.variavel !== VARIAVEL_DA_COR_DOS_ACESSORIOS) return null","false) return null"),
(Fr,"palhetaQueACorImpoe(v, cor) ?? corDosAcessoriosQueACorImpoe(v, cor)","palhetaQueACorImpoe(v, cor)"),
]
T=['src/utils/__tests__/fronteira-das-escolhas.test.ts','src/utils/__tests__/gabarito-wvetro-1207.test.ts','src/utils/__tests__/levantamento-da-conversa.test.ts','src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
for f,a,b in M:
    if open(f).read().count(a)!=1: print('NAO SE APLICA',a); sys.exit(3)
for i,(f,a,b) in enumerate(M,1):
    t=open(f).read(); open(f,'w').write(t.replace(a,b))
    r=subprocess.run(['npx','jest',*T],capture_output=True,text=True)
    open(f,'w').write(t)
    print(i,'MORTA' if r.returncode else 'VIVA')
