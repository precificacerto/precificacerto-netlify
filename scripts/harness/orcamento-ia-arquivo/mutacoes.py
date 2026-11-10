#!/usr/bin/env python3
"""Mutações da 20261109000005 (o arquivo "Orçamento"): cada uma é aplicada a uma CÓPIA da migração (a árvore não muda) e passada ao
run.sh; viva = o run.sh sai 0. Quando a mutação muda uma constraint, muda também a linha da verificação que a descreve, para que seja o
CASO a matar, não a verificação."""
import os, subprocess, sys, tempfile
S = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(S, '../../..'))
MIG = os.path.join(R, 'supabase/migrations/20261109000005_orcamento_ia_arquivo.sql')
def par(nome, *trocas): return (nome, list(trocas))
MUT = [
    # DEFAULT NULL nao grava default no Postgres (equivalente, medido na primeira passada): o default tem de ser um valor
    par('F1 ambientes com default', ("ADD COLUMN IF NOT EXISTS ambientes jsonb NULL,", "ADD COLUMN IF NOT EXISTS ambientes jsonb NULL DEFAULT '[{\"ambiente\": \"Sala\", \"quantidade\": 1}]'::jsonb,")),
    par('F2 escolhas como text', ("ADD COLUMN IF NOT EXISTS escolhas  jsonb NULL;", "ADD COLUMN IF NOT EXISTS escolhas  text NULL;")),
    par('F3 sem a CHECK dos ambientes', ("'orcamentista_orcamento_item_ambientes_forma|CHECK (public.orcamentista_levantamento_ambientes_validos(ambientes))',", "'orcamentista_orcamento_item_ambientes_forma_x|CHECK (public.orcamentista_levantamento_ambientes_validos(ambientes))',")),
    par('F4 as escolhas aceitam lista (e a verificacao junto)',
        ("CHECK ((escolhas IS NULL) OR (jsonb_typeof(escolhas) = ''object''::text))'", "CHECK ((escolhas IS NULL) OR (jsonb_typeof(escolhas) = ANY (ARRAY[''object''::text, ''array''::text])))'"),
        ("|CHECK (((escolhas IS NULL) OR (jsonb_typeof(escolhas) = ''object''::text)))',", "|CHECK (((escolhas IS NULL) OR (jsonb_typeof(escolhas) = ANY (ARRAY[''object''::text, ''array''::text]))))',")),
    par('F5 a FK do orcamento sem o tenant (e a verificacao junto)',
        ("CONSTRAINT orcamentista_orcamento_arquivo_orcamento_fkey FOREIGN KEY (orcamento_id, tenant_id)\n    REFERENCES public.orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT,", "CONSTRAINT orcamentista_orcamento_arquivo_orcamento_fkey FOREIGN KEY (orcamento_id)\n    REFERENCES public.orcamentista_orcamento(id) ON DELETE RESTRICT,"),
        ("|FOREIGN KEY (orcamento_id, tenant_id) REFERENCES orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT',", "|FOREIGN KEY (orcamento_id) REFERENCES orcamentista_orcamento(id) ON DELETE RESTRICT',")),
    par('F6 apagar o orcamento leva o arquivo (CASCADE, e a verificacao junto)',
        ("REFERENCES public.orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT,", "REFERENCES public.orcamentista_orcamento(id, tenant_id) ON DELETE CASCADE,"),
        ("REFERENCES orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT',", "REFERENCES orcamentista_orcamento(id, tenant_id) ON DELETE CASCADE',")),
    par('F7 o mesmo objeto duas vezes (sem a UNIQUE, e a verificacao junto)',
        ("  CONSTRAINT orcamentista_orcamento_arquivo_objeto_key UNIQUE (bucket, caminho),\n", ""),
        ("    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_objeto_key|UNIQUE (bucket, caminho)',\n", ""),
        ("  IF n <> 11 THEN\n    RAISE EXCEPTION 'verificacao 2:", "  IF n <> 10 THEN\n    RAISE EXCEPTION 'verificacao 2:")),
    par('F8 sha256 aceita maiuscula (e a verificacao junto)',
        ("CHECK (sha256 ~ '^[0-9a-f]{64}$'::text)", "CHECK (sha256 ~ '^[0-9a-fA-F]{64}$'::text)"),
        ("CHECK ((sha256 ~ ''^[0-9a-f]{64}$''::text))'", "CHECK ((sha256 ~ ''^[0-9a-fA-F]{64}$''::text))'")),
    par('F9 tamanho zero passa (e a verificacao junto)', ("CHECK (tamanho_bytes > 0)", "CHECK (tamanho_bytes >= 0)"), ("CHECK ((tamanho_bytes > 0))'", "CHECK ((tamanho_bytes >= 0))'")),
    par('F10 valor de venda zero passa (e a verificacao junto)', ("CHECK (valor_venda > (0)::numeric),\n", "CHECK (valor_venda >= (0)::numeric),\n"), ("CHECK ((valor_venda > (0)::numeric))'", "CHECK ((valor_venda >= (0)::numeric))'")),
    par('F11 o caminho aceita espaco e barra inicial (e a verificacao junto)',
        ("CHECK ((caminho ~ '^[^/\\s][^\\s]*$'::text) AND (char_length(caminho) <= 500))", "CHECK ((caminho ~ '^.+$'::text) AND (char_length(caminho) <= 500))"),
        ("CHECK (((caminho ~ ''^[^/\\s][^\\s]*$''::text) AND (char_length(caminho) <= 500)))'", "CHECK (((caminho ~ ''^.+$''::text) AND (char_length(caminho) <= 500)))'")),
    par('F12 o bucket aceita maiuscula (e a verificacao junto)',
        ("CHECK (bucket ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'::text)", "CHECK (bucket ~ '^.{3,63}$'::text)"),
        ("CHECK ((bucket ~ ''^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$''::text))'", "CHECK ((bucket ~ ''^.{3,63}$''::text))'")),
    par('A1 a amarracao do autor com OR em vez de = (e a verificacao junto)',
        ("CHECK ((gerado_origem = 'manual'::text) = (gerado_por IS NOT NULL))", "CHECK ((gerado_origem = 'manual'::text) OR (gerado_por IS NOT NULL))"),
        ("CHECK (((gerado_origem = ''manual''::text) = (gerado_por IS NOT NULL)))'", "CHECK (((gerado_origem = ''manual''::text) OR (gerado_por IS NOT NULL)))'")),
    par('A2 sem a amarracao do autor (e a verificacao e a contagem juntas)',
        ("  CONSTRAINT orcamentista_orcamento_arquivo_gerado_por_amarrado CHECK ((gerado_origem = 'manual'::text) = (gerado_por IS NOT NULL))\n", ""),
        ("    'orcamentista_orcamento_arquivo|orcamentista_orcamento_arquivo_gerado_por_amarrado|CHECK (((gerado_origem = ''manual''::text) = (gerado_por IS NOT NULL)))',\n", ""),
        ("CHECK (valor_venda > (0)::numeric),\n  CONSTRAINT orcamentista_orcamento_arquivo_gerado_origem_valida CHECK (gerado_origem = ANY (ARRAY['agente'::text, 'manual'::text])),\n  -- a pessoa que gerou tem autor; o agente nao tem e nao finge ter\n",
         "CHECK (valor_venda > (0)::numeric),\n  CONSTRAINT orcamentista_orcamento_arquivo_gerado_origem_valida CHECK (gerado_origem = ANY (ARRAY['agente'::text, 'manual'::text]))\n"),
        ("  IF n <> 11 THEN\n    RAISE EXCEPTION 'verificacao 2:", "  IF n <> 10 THEN\n    RAISE EXCEPTION 'verificacao 2:")),
    par('A3 a origem aceita outro valor (e a verificacao junto)',
        ("CHECK (gerado_origem = ANY (ARRAY['agente'::text, 'manual'::text]))", "CHECK (gerado_origem = ANY (ARRAY['agente'::text, 'manual'::text, 'whatsapp'::text]))"),
        ("CHECK ((gerado_origem = ANY (ARRAY[''agente''::text, ''manual''::text])))'", "CHECK ((gerado_origem = ANY (ARRAY[''agente''::text, ''manual''::text, ''whatsapp''::text])))'")),
    par('A4 gerado_por volta a ser obrigatorio', ("  gerado_por     uuid        NULL,", "  gerado_por     uuid        NOT NULL,")),
    par('A5 a origem pode ser nula', ("  gerado_origem  text        NOT NULL,", "  gerado_origem  text        NULL,")),
    par('P1 o service_role com UPDATE', ("GRANT SELECT, INSERT ON public.orcamentista_orcamento_arquivo TO service_role;", "GRANT SELECT, INSERT, UPDATE ON public.orcamentista_orcamento_arquivo TO service_role;")),
    par('P2 o REVOKE sem o service_role (o privilegio padrao fica)', ("REVOKE ALL ON public.orcamentista_orcamento_arquivo FROM PUBLIC, anon, authenticated, service_role;", "REVOKE ALL ON public.orcamentista_orcamento_arquivo FROM PUBLIC, anon, authenticated;")),
    par('P3 o REVOKE so de PUBLIC', ("REVOKE ALL ON public.orcamentista_orcamento_arquivo FROM PUBLIC, anon, authenticated, service_role;", "REVOKE ALL ON public.orcamentista_orcamento_arquivo FROM PUBLIC;")),
    par('P4 sem RLS', ("ALTER TABLE public.orcamentista_orcamento_arquivo ENABLE ROW LEVEL SECURITY;\n", "")),
    par('P5 o comentario com acento', ("'Cada arquivo Orcamento gerado", "'Cada arquivo Orçamento gerado")),
    par('G1 guarda sem a 0004', ("AND column_name = 'uf_destino') THEN", "AND column_name = 'uf_destino') AND false THEN")),
    par('G2 guarda da chave desligada', ("AND conname = 'orcamentista_orcamento_id_tenant_key' AND pg_get_constraintdef(oid) = 'UNIQUE (id, tenant_id)') THEN", "AND conname = 'orcamentista_orcamento_id_tenant_key' AND pg_get_constraintdef(oid) = 'UNIQUE (id, tenant_id)') AND false THEN")),
    par('G3 guarda da funcao desligada', ("IS DISTINCT FROM '39519b7c045dec627a6e5e47d7894409' THEN", "IS DISTINCT FROM '39519b7c045dec627a6e5e47d7894409' AND false THEN")),
    par('V1 verificacao 1 desligada', ("  IF faltam IS NOT NULL THEN\n    RAISE EXCEPTION 'verificacao 1:", "  IF false THEN\n    RAISE EXCEPTION 'verificacao 1:")),
    par('V3 verificacao 3 desligada', ("  IF n <> 49 THEN", "  IF false THEN")),
    par('V4 verificacao 4 desligada', ("  IF n <> 30 THEN", "  IF false THEN")),
    par('V5 verificacao 5 desligada', ("AND column_name IN ('ambientes', 'escolhas') AND data_type = 'jsonb' AND is_nullable = 'YES' AND column_default IS NULL) <> 2 THEN", "AND column_name IN ('ambientes', 'escolhas') AND data_type = 'jsonb' AND is_nullable = 'YES' AND column_default IS NULL) <> 2 AND false THEN")),
    par('V10 verificacao 10 desligada', ("  IF n <> 0 THEN\n    RAISE EXCEPTION 'verificacao 10:", "  IF false THEN\n    RAISE EXCEPTION 'verificacao 10:")),
    par('I1 a CHECK do item sem idempotencia', ("    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.orcamentista_orcamento_item') AND conname = p[1]) THEN\n      EXECUTE", "    IF true THEN\n      EXECUTE")),
]
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
exigir_trecho_unico((nome, [('a 20261109000005', open(MIG, encoding='utf-8').read(), de, para) for de, para in trocas]) for nome, trocas in MUT)
original = open(MIG, encoding='utf-8').read(); vivas = []
for nome, trocas in MUT:
    texto = original; aplicada = True
    for de, para in trocas:
        if texto.count(de) != 1: print(f'  NAO APLICADA: {nome} ({texto.count(de)} ocorrencias de {de[:50]!r})'); sys.exit(3)  # nunca vira viva (mutacao-que-nao-se-aplica.md)
        texto = texto.replace(de, para)
    if not aplicada: vivas.append(nome); continue
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as t: t.write(texto)
    r = subprocess.run([os.path.join(S, 'run.sh'), t.name], capture_output=True, text=True, env={**os.environ, 'HARNESS_DB': 'harness_arquivo_mut'})
    os.unlink(t.name)
    print(f"  {'VIVA ' if r.returncode == 0 else 'morta'}: {nome}"); r.returncode == 0 and vivas.append(nome)
print(f'{len(MUT) - len(vivas)} de {len(MUT)} mortas'); sys.exit(1 if vivas else 0)
