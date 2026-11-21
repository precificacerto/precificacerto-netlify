import subprocess, sys
import os
R=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))+'/'
T='src/utils/__tests__/tela-da-natureza.test.ts src/utils/__tests__/tela-da-natureza-linhas.test.tsx'.split()
M=[
 ('src/lib/atendimentos-ia/tela-da-natureza.ts','r.tipologias.add(tipologia)','void tipologia'),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts','if (r.descricao === null && v.descricao !== null','if (v.descricao !== null'),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"        if (!v) continue\n","        if (!v) { out.semOpcao.push(tipologia); continue }\n"),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"else if (t.recusa.includes('nenhuma opção')) out.semOpcao.push(tipologia)","else if (true) out.semOpcao.push(tipologia)"),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts','if (c.semOpcao.length === 0 && c.maisDeUma.length === 0) return null','if (c.semOpcao.length === 0) return null'),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"xs.length <= 10 ?","xs.length <= 12 ?"),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"for (const k of Object.keys(l)) if (!CHAVES_DO_CORPO.has(k))","for (const k of Object.keys(l)) if (false)"),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"if (formato !== null && variavel !== 'VIDRO')","if (false)"),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"opcao.length > 120","opcao.length > 121"),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"if (natureza === 'POLITICA' && opcao === null)","if (false)"),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"if (natureza !== 'POLITICA' && opcao !== null)","if (false)"),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"bruta.trim() !== '' ? bruta.trim() : null","bruta !== '' ? bruta : null"),
 ('src/lib/atendimentos-ia/tela-da-natureza.ts',"|| typeof linha !== 'object' || Array.isArray(linha))","|| typeof linha !== 'object')"),
 ('src/pages/api/super-admin/base-de-conhecimento/natureza.ts',"p_por: caller.user_id","p_por: (req.body as any)?.linha?.por ?? caller.user_id, p_x: 1"),
 ('src/pages/api/super-admin/base-de-conhecimento/natureza.ts',"p_linha: lida.linha","p_linha: (req.body as any).linha"),
 ('src/pages/api/super-admin/base-de-conhecimento/natureza.ts',"if (lida.ok === false) return","if (false) return"),
 ('src/page-parts/atendimentos-ia/natureza/natureza-da-variavel.component.tsx',"    return [...doMotor, ...foraDoMotor, ...vidros]","    return [...doMotor, ...vidros]"),
 ('src/page-parts/atendimentos-ia/natureza/natureza-da-variavel.component.tsx',"f.linhas.filter((l) => l.variavel === 'VIDRO' && l.formato !== null).map((l) => l.formato as string)","[] as string[]"),
 ('src/page-parts/atendimentos-ia/natureza/natureza-da-variavel.component.tsx',"f.variaveis.filter((v) => v.variavel !== 'VIDRO')","f.variaveis"),
]
mortas=0
for arq,a,b in M:
    s=open(R+arq).read()
    if s.count(a)!=1: print('ABORTA',arq,a,s.count(a)); sys.exit(3)
    open(R+arq,'w').write(s.replace(a,b))
    try:
        r=subprocess.run(['npx','jest',*T],cwd=R,capture_output=True,text=True)
    finally:
        open(R+arq,'w').write(s)
    m=r.returncode!=0; mortas+=m
    print(('MORTA ' if m else 'VIVA  ')+arq.split('/')[-1]+' | '+a[:70])
print(f'{mortas}/{len(M)}')
