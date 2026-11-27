import subprocess,sys
T='src/lib/atendimentos-ia/tributos-manuais.ts'
S='src/lib/atendimentos-ia/orcamento-precificado.ts'
C='src/page-parts/products/content.component.tsx'
P='src/page-parts/products/product-price.component.tsx'
RAPIDO=['src/utils/__tests__/atendimentos-ia-tributos-manuais.test.ts','src/utils/__tests__/atendimentos-ia-orcamento-precificado.test.ts']
TELA=['src/utils/__tests__/atendimentos-ia-precificacao-do-orcamento-tela.test.tsx','src/utils/__tests__/o-servidor-forma-o-preco-da-tela.test.tsx']
M=[
(T,"n >= 0 && n <= 100 ? n : null","n >= 0 && n <= 101 ? n : null",RAPIDO),
(T,"n >= 0 && n <= 100 ? n : null","n > 0 && n <= 100 ? n : null",RAPIDO),
(T,"if (m) return { pct: m.pct, origem: 'manual', sugerido: sug }","if (m && m.pct > 0) return { pct: m.pct, origem: 'manual', sugerido: sug }",RAPIDO),
(T,"const refaz = icms.origem === 'manual' || pis.origem === 'manual'","const refaz = pis.origem === 'manual'",RAPIDO),
(T,": arredondar4(pis.pct * (1 - icms.pct / 100))",": pis.pct * (1 - icms.pct / 100)",RAPIDO),
(T,"const pisEfetivo = !refaz ? s.pisCofinsEfetivo","const pisEfetivo = !refaz ? s.pisCofinsNominal",RAPIDO),
(T,"return Object.keys(resto).length ? (resto as TributosManuais) : null","return resto as TributosManuais",RAPIDO),
(T,"return { tocado: true, tributos: Object.keys(saida).length ? saida : null }","return { tocado: true, tributos: saida }",RAPIDO),
(T,"if (bruto === undefined) return { tocado: false }","if (bruto === undefined) return { tocado: true, tributos: null }",RAPIDO),
(T,"return nominalPct * (1 - r / 100)","return nominalPct * (1 - r)",RAPIDO),
(S,"if (manuaisDaTela !== undefined) await","if (manuaisDaTela) await",RAPIDO),
(S,"if (valor === null) return\n","\n",RAPIDO),
(S,"if (colunaAusente(error)) return null\n        throw new Error(`${TABELA_DO_ORCAMENTO}: ${error.message}`)","throw new Error(`${TABELA_DO_ORCAMENTO}: ${error.message}`)",RAPIDO),
(S,"        tributos_manuais: tributosManuais,\n","",RAPIDO),
(S,"else g.tributos_manuais = manuais.tributos","else void 0",RAPIDO),
(C,"tributosUsados(sugeridosDasCredenciais, ehOrcamentoDeIndustrializacao ? tributosManuais : null)","tributosUsados(sugeridosDasCredenciais, null)",TELA),
(C,"JSON.stringify(tributosManuais) !== JSON.stringify(orcamento?.tributos_manuais ?? null)","true",TELA),
(C,"(v) => editarTributoManual('ibs', v)","(v) => editarTributoManual('cbs', v)",TELA),
(P,"<div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>{label}{marcaManual(chaveDoTributo)}</div>","<div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>{label}</div>",TELA),
(P,"disabled={impostosDaEmpresa && !manuais}","disabled={impostosDaEmpresa}",TELA),
(P,"<span style={{ fontSize: 11, color: '#94a3b8' }}>Fator de redução</span>","<span style={{ fontSize: 11, color: '#94a3b8' }}>Redução</span>",TELA),
(P,"onClick={() => manuais.onVoltar(k)}","onClick={() => manuais.onEditar(k, 0)}",TELA),
(P,"impostosDaEmpresa && !manuais ? undefined : 'icms'","impostosDaEmpresa ? undefined : 'icms'",TELA),
]
for f,a,b,t in M:
    if open(f).read().count(a)!=1: print('NAO SE APLICA',f,a[:70]); sys.exit(3)
for i,(f,a,b,t) in enumerate(M,1):
    o=open(f).read(); open(f,'w').write(o.replace(a,b))
    r=subprocess.run(['npx','jest',*t],capture_output=True,text=True)
    open(f,'w').write(o)
    print(i,'MORTA' if r.returncode else 'VIVA',flush=True)
