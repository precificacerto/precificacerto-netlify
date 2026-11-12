import re, subprocess, hashlib, json, sys
# os arquivos: os da main depois de 20261025142857, os deste branch e os das duas branches com 20261111000001
fontes = {}
def ls(ref):
    out = subprocess.run(['git','ls-tree','--name-only',ref,'supabase/migrations/'],capture_output=True,text=True).stdout.split()
    return [o for o in out if o.split('/')[-1][:14] > '20261025142857' and o.endswith('.sql')]
for ref in ['origin/main','HEAD','origin/claude/desenhos-das-tipologias','origin/claude/orcamento-ia-arquivar']:
    for p in ls(ref):
        nome = p.split('/')[-1]
        if nome not in fontes:
            fontes[nome] = (ref, subprocess.run(['git','show',f'{ref}:{p}'],capture_output=True,text=True).stdout)
linhas = []
for nome,(ref,txt0) in sorted(fontes.items()):
    txt = re.sub(r'--[^\n]*', '', txt0)
    sondas = []
    for m in re.finditer(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)', txt, re.I):
        sondas.append(('tabela', m.group(1), f"to_regclass('public.{m.group(1)}') is not null"))
    for m in re.finditer(r'ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)', txt, re.I):
        sondas.append(('coluna', f'{m.group(1)}.{m.group(2)}', f"exists(select 1 from information_schema.columns where table_schema='public' and table_name='{m.group(1)}' and column_name='{m.group(2)}')"))
    for m in re.finditer(r'ADD\s+CONSTRAINT\s+(\w+)', txt, re.I):
        sondas.append(('constraint', m.group(1), f"exists(select 1 from pg_constraint where conname='{m.group(1)}')"))
    for m in re.finditer(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\w+)', txt, re.I):
        sondas.append(('indice', m.group(1), f"to_regclass('public.{m.group(1)}') is not null"))
    for m in re.finditer(r'^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(.*?\bAS\s+(\$\w*\$)(.*?)\2', txt0, re.I|re.S|re.M):
        md5 = hashlib.md5(m.group(3).replace('\r','').encode()).hexdigest()
        sondas.append(('funcao', m.group(1), f"exists(select 1 from pg_proc where proname='{m.group(1)}' and md5(replace(prosrc,chr(13),''))='{md5}')"))
    linhas.append((nome, ref, sondas))
json.dump([(n,r,[(t,o) for t,o,_ in s]) for n,r,s in linhas], open(sys.argv[1]+'/meta.json','w'))
partes = []
for i,(nome,ref,sondas) in enumerate(linhas):
    if not sondas: partes.append(f"select {i} i, '{nome}' arquivo, '[]'::jsonb r"); continue
    arr = ', '.join(f"({s[2]})" for s in sondas)
    partes.append(f"select {i} i, '{nome}' arquivo, to_jsonb(array[{arr}]) r")
open(sys.argv[1]+'/sonda.sql','w').write(' union all '.join(partes)+' order by 1')
print(len(linhas), sum(len(s) for _,_,s in linhas), len(open(sys.argv[1]+'/sonda.sql').read()))
