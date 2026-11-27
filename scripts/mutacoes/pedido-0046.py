import subprocess,sys
C='src/lib/atendimentos-ia/conversa-da-ia.ts'
T=['src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts']
M=[
(C,"const reformulacao = !porNumero && ((intencao === null","const reformulacao = ((intencao === null"),
(C,"(intencao === 'alterar' && retidas.length === 0))","(intencao === 'alterar'))"),
(C,".size < alvo.itens.length - 1 ||",".size <= alvo.itens.length - 1 ||"),
(C,"return n !== null && alvo.itens.some((i) => i.ordem === n)\n        }) &&","return n !== null\n        }) &&"),
(C,"(porNumero ? { ...itemVazio(i.ordem), cor_perfil: i.cor_perfil, vidro: i.vidro } : itemVazio(i.ordem))","itemVazio(i.ordem)"),
(C,"const DESFECHOS_SEM_FALA: ReadonlySet<string> = new Set(['contagem-nao-fecha'])","const DESFECHOS_SEM_FALA: ReadonlySet<string> = new Set([])"),
(C," && e.largura_mm === doItem.largura_mm && e.altura_mm === doItem.altura_mm && !escrito.includes("," && !escrito.includes("),
(C,"&& !escrito.includes(e.tipologia.toUpperCase()","&& escrito.includes(e.tipologia.toUpperCase()"),
(C,"for (const raw of juncao.itens) if (raw && typeof raw === 'object' && naoEscrita(raw as Record<string, unknown>)) delete (raw as Record<string, unknown>).tipologia\n","\n"),
]
for f,a,b in M:
    if open(f).read().count(a)!=1: print('NAO SE APLICA',a[:70]); sys.exit(3)
for i,(f,a,b) in enumerate(M,1):
    t=open(f).read(); open(f,'w').write(t.replace(a,b))
    r=subprocess.run(['npx','jest',*T,'-t','0046|ALTERAÇÃO POR NÚMERO|NÚMERO QUE NÃO EXISTE|UMA SÓ RESPOSTA|LISTA NOVA|LISTA INTEIRA|AUTORIZAÇÃO já dada|AMBÍGUA|0028|30c|0029'],capture_output=True,text=True)
    open(f,'w').write(t)
    print(i,'MORTA' if r.returncode else 'VIVA',flush=True)
