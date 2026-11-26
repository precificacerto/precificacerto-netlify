import subprocess, sys, os
# MUTACOES do pedido 0031 (dono do produto, 26/11/2026): o trilho monovia (a linha REFILADA do marco) soma UM trilho aos do marco que vale.
# Roda SOZINHO na arvore. SO=<trecho> roda so as mutacoes cujo texto contem o trecho. O trecho que nao aparece UMA vez aborta (codigo 3).
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) + '/'
U = 'src/utils/__tests__/'
T = [U + 'trilhos-do-marco.test.ts']
TM = 'src/lib/atendimentos-ia/trilhos-do-marco.ts'
M = [
 (TM, "        return [REFILADO.test(p.obs ?? '') ? { ...marco, monovia: true } : marco]", "        return [marco]"),
 (TM, "        return [REFILADO.test(p.obs ?? '') ? { ...marco, monovia: true } : marco]", "        return REFILADO.test(p.obs ?? '') ? [] : [marco]"),
 (TM, "        if (marco.monovia) monovia = true", "        if (marco.monovia) monovia = false"),
 (TM, "    if (valem.size === 1) return { trilhos: [...valem][0] + (monovia ? 1 : 0) }", "    if (valem.size === 1) return { trilhos: [...valem][0] }"),
 (TM, "    if (valem.size === 1) return { trilhos: [...valem][0] + (monovia ? 1 : 0) }", "    if (valem.size === 1) return { trilhos: [...valem][0] + 1 }"),
 (TM, "        if (!v) continue", ""),
 (TM, "        if (typeof v === 'string') return { indeterminado: v }", ""),
 (TM, "    if (valem.size === 0 && daTipologia.marcos.every((m) => m.monovia)) return", "    if (false) return"),
 (TM, "`a condição \"${marco.condicao}\" ${marco.monovia ? 'do trilho monovia' : 'do marco'} não se avalia", "`a condição \"${marco.condicao}\" ${'do marco'} não se avalia"),
]
M = [x for x in M if os.environ.get('SO', '') in x[1]]
for arq, a, b in M:
    n = open(R + arq).read().count(a)
    if n != 1: print('ABORTA', arq, a[:70], n); sys.exit(3)
mortas = 0
for arq, a, b in M:
    s = open(R + arq).read()
    open(R + arq, 'w').write(s.replace(a, b))
    try:
        r = subprocess.run(['npx', 'jest', *T], cwd=R, capture_output=True, text=True)
    finally:
        open(R + arq, 'w').write(s)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + arq.split('/')[-1] + ' | ' + a[:70].replace('\n', ' ') + '  =>  ' + b[:70].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
