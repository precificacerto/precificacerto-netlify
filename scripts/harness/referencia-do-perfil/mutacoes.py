import subprocess, sys, os, tempfile
# MUTACOES da 20261124000002 contra o harness (run.sh com REUSA_BASE=1). Cada mutacao e uma COPIA da migracao num diretorio temporario: a arvore nao muda.
S = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(S, '..', '..', '..'))
MIG = os.path.join(R, 'supabase/migrations/20261124000002_referencia_do_perfil_do_item_da_tabela.sql')
OITO = "'vidro_escolhido'::text, 'vidro_traduzido'::text, 'vidro_padrao'::text, 'referencia'::text]));"
M = [
 ('a referencia fora do INSERT', "    cor, codigo_wvetro, referencia_perfil\n  )", "    cor, codigo_wvetro\n  )"),
 ('a referencia fora do recordset', "    cor text, codigo_wvetro text, referencia_perfil text\n  );", "    cor text, codigo_wvetro text\n  );"),
 ('sem a CHECK de forma', "CHECK (referencia_perfil IS NULL OR (referencia_perfil <> '' AND referencia_perfil = btrim(referencia_perfil) AND position('/' in referencia_perfil) = 0));", "CHECK (true);"),
 ('a CHECK deixa a barra passar', " AND position('/' in referencia_perfil) = 0));", "));"),
 ('a CHECK sem a ponta aparada', "(referencia_perfil <> '' AND referencia_perfil = btrim(referencia_perfil) AND", "(btrim(referencia_perfil) <> '' AND"),
 ('o indice sem ser unico', "CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_tabela_item_referencia_perfil_cor_key", "CREATE INDEX IF NOT EXISTS orcamentista_tabela_item_referencia_perfil_cor_key"),
 ('o indice sem a cor', "(tabela_id, referencia_perfil, cor) NULLS NOT DISTINCT WHERE referencia_perfil IS NOT NULL;", "(tabela_id, referencia_perfil) WHERE referencia_perfil IS NOT NULL;"),
 ('o indice sem a tabela', "(tabela_id, referencia_perfil, cor) NULLS NOT DISTINCT WHERE referencia_perfil IS NOT NULL;", "(referencia_perfil, cor) NULLS NOT DISTINCT WHERE referencia_perfil IS NOT NULL;"),
 ('o indice com nulos distintos', "(tabela_id, referencia_perfil, cor) NULLS NOT DISTINCT WHERE referencia_perfil IS NOT NULL;", "(tabela_id, referencia_perfil, cor) WHERE referencia_perfil IS NOT NULL;"),
 ('o indice sem ser parcial', "(tabela_id, referencia_perfil, cor) NULLS NOT DISTINCT WHERE referencia_perfil IS NOT NULL;", "(tabela_id, referencia_perfil, cor) NULLS NOT DISTINCT;"),
 ('a guarda aceita qualquer corpo', "  IF v_md5 NOT IN ('fc86097aae3ef437bbfd451c902b72a3',", "  IF false AND v_md5 NOT IN ('fc86097aae3ef437bbfd451c902b72a3',"),
 ('a guarda aceita qualquer CHECK da resolucao', "  IF v_chk IS DISTINCT FROM 'CHECK ((resolucao = ANY (ARRAY[''ponte''::text, ''exato''::text, ''cor''::text, ''nome_tecnico''::text, ''vidro_escolhido''::text, ''vidro_traduzido''::text, ''vidro_padrao''::text])))'\n", "  IF false AND v_chk IS DISTINCT FROM 'x'\n"),
 ('a verificacao 6 nao confere a ACL', "  IF v_acl IS DISTINCT FROM current_setting('migracao_20261124000002.acl', true) THEN", "  IF false THEN"),
 ('a coluna com default', "ADD COLUMN IF NOT EXISTS referencia_perfil text;", "ADD COLUMN IF NOT EXISTS referencia_perfil text DEFAULT 'HF88S';"),
 ('a resolucao sem o valor novo', OITO, "'vidro_escolhido'::text, 'vidro_traduzido'::text, 'vidro_padrao'::text]));"),
 ('a resolucao perde um valor de antes', "CHECK (resolucao = ANY (ARRAY['ponte'::text, 'exato'::text, 'cor'::text, 'nome_tecnico'::text,\n", "CHECK (resolucao = ANY (ARRAY['ponte'::text, 'exato'::text, 'cor'::text,\n"),
 ('a resolucao sem CHECK nenhuma', "  ADD CONSTRAINT orcamentista_orcamento_item_material_resolucao_check\n  CHECK (resolucao = ANY (ARRAY['ponte'::text,", "  ADD CONSTRAINT orcamentista_orcamento_item_material_resolucao_check\n  CHECK (true OR resolucao = ANY (ARRAY['ponte'::text,"),
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
