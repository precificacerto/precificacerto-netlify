#!/usr/bin/env python3
"""Mutações da 20261102000001. Cada uma é aplicada a uma CÓPIA da migração; o run.sh tem de falhar (sair != 0).
Duas passadas: com o bloco $verifica$ e sem ele (aí os casos têm de pegar sozinhos). Na passada sem a verificação, a guarda recebe o md5 do corpo
mutado (senão a segunda aplicação abortaria pela guarda, e a mutação morreria por isso, não pelos casos). Não toca o arquivo do repositório."""
import hashlib, os, re, subprocess, sys, tempfile
S = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(S, '../../..'))
MIG = os.path.join(R, 'supabase/migrations/20261102000001_bloco_tributario_do_item.sql')
ORIG = open(MIG, encoding='utf-8').read()
MUT = [
    ('G1 guarda aceita qualquer corpo', "IF v_md5 NOT IN ('c412c59f708174d7a3a3f800aadd8e2c', 'd98800431ea61fede9cab6593d01f007') THEN", "IF false THEN"),
    ('C1 sem a CHECK do IPI', "CHECK (cred_ipi_pct IS NULL OR nc_ipi_pct IS NULL);", "CHECK (true);"),
    ('C2 faixa sem nc_is_pct', "\n    AND (nc_is_pct IS NULL OR (nc_is_pct >= 0 AND nc_is_pct <= 100))", ""),
    ('C3 faixa ate 1000', "(credito_pct IS NULL OR (credito_pct >= 0 AND credito_pct <= 100))", "(credito_pct IS NULL OR (credito_pct >= 0 AND credito_pct <= 1000))"),
    ('C4 faixa com credito_valor', "(credito_pct IS NULL OR (credito_pct >= 0 AND credito_pct <= 100))", "(credito_pct IS NULL OR (credito_pct >= 0 AND credito_pct <= 100))\n    AND (credito_valor IS NULL OR credito_valor <= 100)"),
    ('C5 faixa aceita negativo', "(cred_icms_pct IS NULL OR (cred_icms_pct >= 0 AND cred_icms_pct <= 100))", "(cred_icms_pct IS NULL OR (cred_icms_pct >= -1 AND cred_icms_pct <= 100))"),
    ('A1 DEFAULT 0', "ADD COLUMN IF NOT EXISTS cred_icms_pct numeric;", "ADD COLUMN IF NOT EXISTS cred_icms_pct numeric DEFAULT 0;"),
    ('A2 credito_valor integer', "ADD COLUMN IF NOT EXISTS credito_valor numeric;", "ADD COLUMN IF NOT EXISTS credito_valor integer;"),
    ('A3 custo_liquido gerado', "ADD COLUMN IF NOT EXISTS custo_liquido numeric;", "ADD COLUMN IF NOT EXISTS custo_liquido numeric GENERATED ALWAYS AS (custo) STORED;"),
    ('A4 semeia 0 nas linhas de antes', "\n-- 2. as CHECKs", "\nUPDATE public.orcamentista_tabela_item SET nc_difal_pct = 0;\n-- 2. as CHECKs"),
    ('F1 nc_icms_st fora do INSERT', "    x.nc_ipi_pct, x.nc_icms_st_pct, x.nc_difal_pct, x.nc_is_pct,", "    x.nc_ipi_pct, NULL, x.nc_difal_pct, x.nc_is_pct,"),
    ('F2 COALESCE no liquido', "    x.credito_pct, x.credito_valor, x.custo_liquido\n", "    x.credito_pct, x.credito_valor, coalesce(x.custo_liquido, 0)\n"),
    ('F3 sem statement_timeout', "SET statement_timeout TO '35s'\nAS $function$", "AS $function$"),
    # F4 sobrevive à passada SEM a verificação, e é esperado: em produção a função já existe, e o CREATE OR REPLACE preserva o ACL ({postgres,
    # service_role}) — a mutação não muda nada ali. Quem a pega é a verificação 4 (o contraste 2 recria a função, como se nascesse hoje).
    ('F4 REVOKE so de PUBLIC', "importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC, anon, authenticated;", "importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC;"),
    ('F5 sem SECURITY DEFINER', "LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path TO 'public'\nSET statement_timeout", "LANGUAGE plpgsql\nSET search_path TO 'public'\nSET statement_timeout"),
    ('F6 credito_pct trocado com credito_valor', "    x.credito_pct, x.credito_valor, x.custo_liquido\n", "    x.credito_valor, x.credito_pct, x.custo_liquido\n"),
]
def sem_verificacao(s):
    s = re.sub(r'\nDO \$verifica\$[\s\S]*?\$verifica\$;\n', '\n', s)
    corpo = re.search(r'AS \$function\$([\s\S]*?)\$function\$', s).group(1)
    return s.replace("'d98800431ea61fede9cab6593d01f007'", "'" + hashlib.md5(corpo.encode()).hexdigest() + "'", 1)
def roda(texto):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as f: f.write(texto); p = f.name
    r = subprocess.run(['bash', os.path.join(S, 'run.sh'), p], capture_output=True, text=True, env={**os.environ, 'REUSA_BASE': '1'})
    os.unlink(p); return r
# o controle: as duas passadas sem mutação passam
for nome, t in [('controle com verificacao', ORIG), ('controle sem verificacao', sem_verificacao(ORIG))]:
    r = roda(t); print(f'{nome}: {"PASSA" if r.returncode == 0 else "FALHA"} — {r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-200:]}', flush=True)
mortas = 0
for passada, prep in [('com verificacao', lambda s: s), ('sem verificacao', sem_verificacao)]:
    for nome, a, b in MUT:
        if ORIG.count(a) != 1: print(f'{passada} {nome}: TRECHO {ORIG.count(a)}x'); continue
        r = roda(prep(ORIG.replace(a, b)))
        ult = (r.stdout.strip().splitlines() or ['?'])[-1]
        print(f'{passada} {nome}: {"MORTA" if r.returncode != 0 else "SOBREVIVEU"} — {ult}', flush=True)
        mortas += r.returncode != 0
print(f'{mortas} de {2 * len(MUT)} mortas')
