import subprocess, sys, os, tempfile
# MUTACOES da 20261124000001 contra o harness (run.sh com REUSA_BASE=1). Cada mutacao e uma COPIA da migracao num diretorio temporario: a arvore nao muda.
S = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(S, '..', '..', '..'))
MIG = os.path.join(R, 'supabase/migrations/20261124000001_codigo_wvetro_do_item_da_tabela.sql')
M = [
 ('a referencia fora do INSERT', "    cor, codigo_wvetro\n  )", "    cor\n  )"),
 ('a referencia fora do recordset', "    cor text, codigo_wvetro text\n  );", "    cor text\n  );"),
 ('sem a CHECK', "CHECK (codigo_wvetro IS NULL OR (codigo_wvetro <> '' AND codigo_wvetro = btrim(codigo_wvetro)));", "CHECK (true);"),
 ('a CHECK sem a ponta aparada', "(codigo_wvetro <> '' AND codigo_wvetro = btrim(codigo_wvetro))", "(btrim(codigo_wvetro) <> '')"),
 ('o indice sem ser unico', "CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_tabela_item_codigo_wvetro_key", "CREATE INDEX IF NOT EXISTS orcamentista_tabela_item_codigo_wvetro_key"),
 ('o indice sem a tabela', "(tabela_id, codigo_wvetro) WHERE codigo_wvetro IS NOT NULL;", "(codigo_wvetro) WHERE codigo_wvetro IS NOT NULL;"),
 ('o indice sem ser parcial', "(tabela_id, codigo_wvetro) WHERE codigo_wvetro IS NOT NULL;", "(tabela_id, codigo_wvetro);"),
 ('a guarda aceita qualquer corpo', "  IF v_md5 NOT IN ('97abdae749f848c350152291f86b0eef',", "  IF false AND v_md5 NOT IN ('97abdae749f848c350152291f86b0eef',"),
 ('a verificacao 6 nao confere a ACL', "  IF v_acl IS DISTINCT FROM current_setting('migracao_20261124000001.acl', true) THEN", "  IF false THEN"),
 ('a coluna com default', "ADD COLUMN IF NOT EXISTS codigo_wvetro text;", "ADD COLUMN IF NOT EXISTS codigo_wvetro text DEFAULT 'VFIN05';"),
]
src = open(MIG).read()
for nome, a, b in M:
    if src.count(a) != 1: print('ABORTA', nome, src.count(a)); sys.exit(3)
T = tempfile.mkdtemp(); mortas = 0
for i, (nome, a, b) in enumerate(M):
    caminho = os.path.join(T, f'mut-{i}.sql')
    open(caminho, 'w').write(src.replace(a, b))
    r = subprocess.run(['bash', os.path.join(S, 'run.sh'), caminho], env={**os.environ, 'REUSA_BASE': '1'}, capture_output=True, text=True)
    m = r.returncode != 0; mortas += m
    ult = [l for l in r.stdout.strip().split('\n') if 'FALHOU' in l][:1]
    print(('MORTA ' if m else 'VIVA  ') + nome + (' <- ' + ult[0].strip()[:110] if ult else ''), flush=True)
print(f'{mortas}/{len(M)}')
sys.exit(0 if mortas == len(M) else 1)
