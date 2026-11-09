#!/usr/bin/env python3
"""Mutações da 20261109000004: cada uma aplicada a uma CÓPIA da migração (a árvore não muda) e passada ao run.sh; viva = run.sh sai 0."""
import os, subprocess, sys, tempfile
S = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(S, '../../..'))
MIG = os.path.join(R, 'supabase/migrations/20261109000004_orcamento_ia_fiscal.sql')
MUT = [
 ('F1 ncm_code com default', "ncm_code   text                   NULL,", "ncm_code   text                   NULL DEFAULT '0000.00.00',"),
 ('F2 sale_scope com default', "sale_scope public.sale_scope      NULL,", "sale_scope public.sale_scope      NULL DEFAULT 'INTRAESTADUAL',"),
 ('F3 buyer_type com default', "buyer_type public.buyer_type_enum NULL;", "buyer_type public.buyer_type_enum NULL DEFAULT 'CONSUMIDOR_FINAL';"),
 ('F4 sale_scope como text', "sale_scope public.sale_scope      NULL,", "sale_scope text                   NULL,"),
 ('F5 buyer_type como text', "buyer_type public.buyer_type_enum NULL;", "buyer_type text                   NULL;"),
 ('F6 ncm sem os pontos', "'^[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}$'::text));", "'^[0-9]{4}\\.?[0-9]{2}\\.?[0-9]{2}$'::text));"),
 ('F7 ncm sem ancora', "(ncm_code ~ '^[0-9]{4}", "(ncm_code ~ '[0-9]{4}"),
 ('F8 CHECK que aceita vazio', "CHECK ((ncm_code IS NULL) OR (ncm_code ~", "CHECK ((ncm_code IS NULL) OR (ncm_code = '') OR (ncm_code ~"),
 ('F9 sem a CHECK', "ADD CONSTRAINT orcamentista_orcamento_ncm_forma CHECK", "ADD CONSTRAINT orcamentista_orcamento_ncm_forma_x CHECK"),
 ('G1 guarda sem a 0002', "AND column_name = 'valor_venda') THEN", "AND column_name = 'valor_venda') AND false THEN"),
 ('G2 guarda do sale_scope desligada', "IS DISTINCT FROM 'INTRAESTADUAL,INTERESTADUAL' THEN", "IS DISTINCT FROM 'INTRAESTADUAL,INTERESTADUAL' AND false THEN"),
 ('G3 guarda do buyer_type desligada', "IS DISTINCT FROM 'CONSUMIDOR_FINAL,CONTRIBUINTE_PJ' THEN", "IS DISTINCT FROM 'CONSUMIDOR_FINAL,CONTRIBUINTE_PJ' AND false THEN"),
 ('V1 verificacao 1 desligada', "IF faltam IS NOT NULL THEN", "IF false THEN"),
 ('V2 verificacao 2 desligada', "AND pg_get_constraintdef(oid) = 'CHECK", "AND true OR pg_get_constraintdef(oid) = 'CHECK"),
 ('V3 verificacao 3 desligada', "IF n <> 45 THEN", "IF false THEN"),
 ('V4 verificacao 4 desligada', "IF n <> 27 THEN", "IF false THEN"),
 ('V5 verificacao 5 desligada', "IF n <> 0 THEN", "IF false THEN"),
 ('V6 verificacao 6 desligada', "IF faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN", "IF false THEN"),
 ('P1 grant a authenticated', "NOTIFY pgrst, 'reload schema';", "GRANT SELECT ON public.orcamentista_orcamento TO authenticated;\nNOTIFY pgrst, 'reload schema';"),
 ('C1 comentario com travessao', "a precificacao final recusa; nunca zera", "a precificacao final recusa — nunca zera"),
 ('I1 a CHECK sem idempotencia', "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_ncm_forma') THEN\n    ALTER", "IF true THEN\n    ALTER"),
]
original = open(MIG, encoding='utf-8').read(); vivas = []
for nome, de, para in MUT:
    if original.count(de) != 1: print(f'  NAO APLICADA: {nome} ({original.count(de)} ocorrencias)'); vivas.append(nome); continue
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as t: t.write(original.replace(de, para))
    r = subprocess.run([os.path.join(S, 'run.sh'), t.name], capture_output=True, text=True, env={**os.environ, 'HARNESS_DB': 'harness_fiscal_mut'})
    os.unlink(t.name)
    print(f"  {'VIVA ' if r.returncode == 0 else 'morta'}: {nome}"); r.returncode == 0 and vivas.append(nome)
print(f'{len(MUT) - len(vivas)} de {len(MUT)} mortas'); sys.exit(1 if vivas else 0)
