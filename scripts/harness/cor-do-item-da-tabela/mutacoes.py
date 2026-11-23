import subprocess, sys, os
# MUTACOES da 20261123000004 contra o harness (run.sh com REUSA_BASE=1). Cada mutacao e uma COPIA da migracao em /tmp: a arvore nao muda.
# 1a passada: 6/6 mortas (as duas que tiram a cor do INSERT morrem ja na verificacao 3, pelo md5 do corpo).
S = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(S, '..', '..', '..'))
MIG = os.path.join(R, 'supabase/migrations/20261123000004_cor_do_item_da_tabela.sql')
M = [
 ('a cor fora do INSERT', "    credito_pct, credito_valor, custo_liquido,\n    cor\n  )", "    credito_pct, credito_valor, custo_liquido\n  )"),
 ('a cor fora do recordset', "    credito_pct numeric, credito_valor numeric, custo_liquido numeric,\n    cor text\n  );", "    credito_pct numeric, credito_valor numeric, custo_liquido numeric\n  );"),
 ('sem a CHECK', "ADD CONSTRAINT orcamentista_tabela_item_cor_forma CHECK (cor IS NULL OR btrim(cor) <> '');", "ADD CONSTRAINT orcamentista_tabela_item_cor_forma CHECK (true);"),
 ('a guarda aceita qualquer corpo', "  IF v_md5 NOT IN ('d98800431ea61fede9cab6593d01f007',", "  IF false AND v_md5 NOT IN ('d98800431ea61fede9cab6593d01f007',"),
 ('a verificacao 6 nao confere a ACL', "  IF v_acl IS DISTINCT FROM current_setting('migracao_20261123000004.acl', true) THEN", "  IF false THEN"),
 ('a coluna com default', "ADD COLUMN IF NOT EXISTS cor text;", "ADD COLUMN IF NOT EXISTS cor text DEFAULT 'INCOLOR';"),
]
src = open(MIG).read()
mortas = 0
for nome, a, b in M:
    if src.count(a) != 1: print('ABORTA', nome, src.count(a)); sys.exit(3)
    caminho = f'/tmp/mut-cor-{M.index((nome, a, b))}.sql'
    open(caminho, 'w').write(src.replace(a, b))
    r = subprocess.run(['bash', os.path.join(S, 'run.sh'), caminho], env={**os.environ, 'REUSA_BASE': '1'}, capture_output=True, text=True)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + nome, flush=True)
print(f'{mortas}/{len(M)}')
