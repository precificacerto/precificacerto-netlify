#!/usr/bin/env python3
"""Mutações da 20261109000004: cada uma aplicada a uma CÓPIA da migração (a árvore não muda) e passada ao run.sh; viva = run.sh sai 0."""
import os, subprocess, sys, tempfile
S = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(S, '../../..'))
MIG = os.path.join(R, 'supabase/migrations/20261109000004_orcamento_ia_fiscal.sql')
MUT = [
 ('F1 ncm_code com default', "ncm_code   text                   NULL,", "ncm_code   text                   NULL DEFAULT '0000.00.00',"),
 ('F2 sale_scope com default', "sale_scope public.sale_scope      NULL,", "sale_scope public.sale_scope      NULL DEFAULT 'INTRAESTADUAL',"),
 ('F3 buyer_type com default', "buyer_type public.buyer_type_enum NULL,", "buyer_type public.buyer_type_enum NULL DEFAULT 'CONSUMIDOR_FINAL',"),
 ('F4 sale_scope como text', "sale_scope public.sale_scope      NULL,", "sale_scope text                   NULL,"),
 ('F5 buyer_type como text', "buyer_type public.buyer_type_enum NULL,", "buyer_type text                   NULL,"),
 ('F6 ncm sem os pontos', "'^[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}$'::text));", "'^[0-9]{4}\\.?[0-9]{2}\\.?[0-9]{2}$'::text));"),
 ('F7 ncm sem ancora', "(ncm_code ~ '^[0-9]{4}", "(ncm_code ~ '[0-9]{4}"),
 ('F8 CHECK que aceita vazio', "CHECK ((ncm_code IS NULL) OR (ncm_code ~", "CHECK ((ncm_code IS NULL) OR (ncm_code = '') OR (ncm_code ~"),
 ('F9 sem a CHECK', "ADD CONSTRAINT orcamentista_orcamento_ncm_forma CHECK", "ADD CONSTRAINT orcamentista_orcamento_ncm_forma_x CHECK"),
 ('G1 guarda sem a 0002', "AND column_name = 'valor_venda') THEN", "AND column_name = 'valor_venda') AND false THEN"),
 ('G2 guarda do sale_scope desligada', "IS DISTINCT FROM 'INTRAESTADUAL,INTERESTADUAL' THEN", "IS DISTINCT FROM 'INTRAESTADUAL,INTERESTADUAL' AND false THEN"),
 ('G3 guarda do buyer_type desligada', "IS DISTINCT FROM 'CONSUMIDOR_FINAL,CONTRIBUINTE_PJ' THEN", "IS DISTINCT FROM 'CONSUMIDOR_FINAL,CONTRIBUINTE_PJ' AND false THEN"),
 ('V1 verificacao 1 desligada', "IF faltam IS NOT NULL THEN", "IF false THEN"),
 ('V2 verificacao 2 desligada', "AND pg_get_constraintdef(oid) = 'CHECK (((ncm_code", "AND true OR pg_get_constraintdef(oid) = 'CHECK (((ncm_code"),
 ('V3 verificacao 3 desligada', "IF n <> 47 THEN", "IF false THEN"),
 ('V4 verificacao 4 desligada', "IF n <> 28 THEN", "IF false THEN"),
 ('V5 verificacao 5 desligada', "IF n <> 0 THEN", "IF false THEN"),
 ('V6 verificacao 6 desligada', "IF faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN", "IF false THEN"),
 ('P1 grant a authenticated', "NOTIFY pgrst, 'reload schema';", "GRANT SELECT ON public.orcamentista_orcamento TO authenticated;\nNOTIFY pgrst, 'reload schema';"),
 ('C1 comentario com travessao', "a precificacao final recusa; nunca zera", "a precificacao final recusa — nunca zera"),
 ('U1 uf_destino com default', "uf_destino character(2)           NULL;", "uf_destino character(2)           NULL DEFAULT 'SP';"),
 ('U2 uf_destino como text', "uf_destino character(2)           NULL;", "uf_destino text                   NULL;"),
 ('U3 sem a FK da UF', "ADD CONSTRAINT orcamentista_orcamento_uf_destino_fkey FOREIGN KEY", "ADD CONSTRAINT orcamentista_orcamento_uf_destino_fkey_x FOREIGN KEY"),
 ('U4 escopo com = em vez de IS NOT DISTINCT FROM', "CHECK ((sale_scope IS NOT DISTINCT FROM 'INTERESTADUAL'::public.sale_scope) = (uf_destino IS NOT NULL));", "CHECK ((sale_scope = 'INTERESTADUAL'::public.sale_scope) = (uf_destino IS NOT NULL));"),
 ('U5 so a metade da amarracao (implicacao)', "CHECK ((sale_scope IS NOT DISTINCT FROM 'INTERESTADUAL'::public.sale_scope) = (uf_destino IS NOT NULL));", "CHECK ((sale_scope IS DISTINCT FROM 'INTERESTADUAL'::public.sale_scope) OR (uf_destino IS NOT NULL));"),
 ('U6 sem a CHECK da UF', "ADD CONSTRAINT orcamentista_orcamento_uf_destino_do_escopo\n", "ADD CONSTRAINT orcamentista_orcamento_uf_destino_do_escopo_x\n"),
 ('U7 guarda de brazilian_states desligada', "AND array_length(c.conkey, 1) = 1 AND a.attname = 'code') THEN", "AND array_length(c.conkey, 1) = 1 AND a.attname = 'code') AND false THEN"),
 ('U8 verificacao da FK desligada', "AND pg_get_constraintdef(oid) = 'FOREIGN KEY", "AND true OR pg_get_constraintdef(oid) = 'FOREIGN KEY"),
 ('U9 verificacao da CHECK da UF desligada', "AND pg_get_constraintdef(oid) = 'CHECK (((NOT", "AND true OR pg_get_constraintdef(oid) = 'CHECK (((NOT"),
 ('U10 verificacao 1 sem a uf_destino', "    faltam := concat_ws('; ', faltam, 'uf_destino');", "    NULL;"),
 ('U11 comentario da UF nao ASCII', "Obrigatoria exatamente quando", "Obrigat\u00f3ria exatamente quando"),
 ('I1 a CHECK sem idempotencia', "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_ncm_forma') THEN\n    ALTER", "IF true THEN\n    ALTER"),
]
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
exigir_trecho_unico((nome, [('a 20261109000004', open(MIG, encoding='utf-8').read(), de, para)]) for nome, de, para in MUT)
original = open(MIG, encoding='utf-8').read(); vivas = []
for nome, de, para in MUT:
    if original.count(de) != 1: print(f'  NAO APLICADA: {nome} ({original.count(de)} ocorrencias)'); sys.exit(3)
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as t: t.write(original.replace(de, para))
    r = subprocess.run([os.path.join(S, 'run.sh'), t.name], capture_output=True, text=True, env={**os.environ, 'HARNESS_DB': 'harness_fiscal_mut'})
    os.unlink(t.name)
    print(f"  {'VIVA ' if r.returncode == 0 else 'morta'}: {nome}"); r.returncode == 0 and vivas.append(nome)
print(f'{len(MUT) - len(vivas)} de {len(MUT)} mortas'); sys.exit(1 if vivas else 0)
