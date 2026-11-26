import subprocess,sys
M=[
('src/lib/atendimentos-ia/travessia-do-levantamento.ts',"e.message.replace(/\"/g, \"'\").replace(/\\s+/g, ' ').trim()","e.message.slice(0, 120)"),
('src/lib/atendimentos-ia/travessia-do-levantamento.ts',"fraseDoErroDoSistema('o cálculo', n)","`o cálculo do orçamento ${n} falhou. Para tentar de novo, abra o orçamento ${n} na seção Orçamentos I.A. e use Calcular`"),
('src/lib/atendimentos-ia/travessia-do-levantamento.ts',"fraseDoErroDoSistema('a precificação', n)","`a precificação do orçamento ${n} falhou`"),
('src/lib/atendimentos-ia/custo-do-orcamento.ts',"'calculo-2026-11-26b'","'barras-unicas-pedido-total-peca-exata-2026-11-26'"),
('src/utils/__tests__/fixtures/avaliador-de-check.ts',"&& avaliar(c.arvore, linha, c.definicao) === false)","&& avaliar(c.arvore, linha, c.definicao) === null)"),
('src/utils/__tests__/fixtures/avaliador-de-check.ts',"return a === false || b === false ? false : a === null || b === null ? null : true","return a === false && b === false ? false : a === null || b === null ? null : true"),
('src/utils/__tests__/fixtures/avaliador-de-check.ts',"if (n.op === '~') return new RegExp(String(b)).test(String(a))","if (n.op === '~') return true"),
('src/utils/__tests__/fixtures/avaliador-de-check.ts',"if (n.nome === 'char_length') return args[0] === null ? null : [...String(args[0])].length","if (n.nome === 'char_length') return 0"),
]
T=['src/utils/__tests__/atendimentos-ia-calculo-contra-as-checks.test.ts','src/utils/__tests__/atendimentos-ia-travessia-do-levantamento.test.ts']
for f,a,b in M:
    t=open(f).read()
    if t.count(a)!=1: print('NAO SE APLICA',a); sys.exit(3)
for i,(f,a,b) in enumerate(M,1):
    t=open(f).read(); open(f,'w').write(t.replace(a,b))
    r=subprocess.run(['npx','jest',*T],capture_output=True,text=True)
    open(f,'w').write(t)
    print(i,'MORTA' if r.returncode else 'VIVA')
