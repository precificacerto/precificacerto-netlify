import subprocess, sys, os, tempfile
# MUTACOES da 20261125000001, sobre uma COPIA do arquivo (o original nao e tocado). Cada uma tem de deixar o run.sh vermelho.
# O trecho que nao aparece UMA vez aborta (codigo 3) antes de rodar.
S = os.path.dirname(os.path.abspath(__file__))
MIG = os.path.join(S, '..', '..', '..', 'supabase', 'migrations', '20261125000001_midia_da_entrada.sql')
M = [
 ("CHECK (midia IS NULL OR (jsonb_typeof(midia) = 'object' AND direcao = 'entrada'));", "CHECK (midia IS NULL OR jsonb_typeof(midia) = 'object');"),
 ("CHECK (midia IS NULL OR (jsonb_typeof(midia) = 'object' AND direcao = 'entrada'));", "CHECK (midia IS NULL OR direcao = 'entrada');"),
 ("ADD COLUMN IF NOT EXISTS midia jsonb NULL;", "ADD COLUMN IF NOT EXISTS midia json NULL;"),
 ("ADD COLUMN IF NOT EXISTS midia jsonb NULL;", "ADD COLUMN IF NOT EXISTS midia jsonb NULL DEFAULT '{}'::jsonb;"),
 ("ADD COLUMN IF NOT EXISTS midia jsonb NULL;", "ADD COLUMN midia jsonb NULL;"),
 ("  IF tipo IS NOT NULL AND tipo <> 'jsonb' THEN", "  IF false THEN"),
 ("  IF def IS NOT NULL AND def <> ", "  IF false AND def <> "),
 ("  IF n <> 7 THEN", "  IF false THEN"),
 ("  IF to_regclass('public.orcamentista_mensagem') IS NULL THEN\n    RAISE EXCEPTION 'dependencia ausente", "  IF false THEN\n    RAISE EXCEPTION 'dependencia ausente"),
 ("'Na entrada com foto, PDF, audio ou video: os dados de download da midia como o WUZAPI os entregou (20261125000001; pedido 0029).", "'Na entrada com foto, PDF, audio ou video: os dados de download da midia como o WUZAPI os entregou."),
 ("BEGIN;\n\nDO $guarda$", "DO $guarda$"),
]
texto = open(MIG).read()
for a, _ in M:
    if texto.count(a) != 1: print('ABORTA', a[:70], texto.count(a)); sys.exit(3)
mortas = 0
for a, b in M:
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False) as f:
        f.write(texto.replace(a, b)); caminho = f.name
    r = subprocess.run(['bash', os.path.join(S, 'run.sh'), caminho], capture_output=True, text=True)
    os.unlink(caminho)
    m = r.returncode != 0; mortas += m
    print(('MORTA ' if m else 'VIVA  ') + a[:60].replace('\n', ' ') + '  =>  ' + b[:60].replace('\n', ' '), flush=True)
print(f'{mortas}/{len(M)}')
