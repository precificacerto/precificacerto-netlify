#!/usr/bin/env python3
"""Mutações da 20261111000001 (arquivar): cada uma é aplicada a uma CÓPIA da migração (a árvore não muda) e passada ao run.sh;
viva = o run.sh sai 0. Quando a mutação muda a CHECK, muda também a linha da verificação que a descreve, para que seja o CASO a matar,
não a verificação. Antes de rodar, todo trecho tem de aparecer exatamente uma vez (mutacao-que-nao-se-aplica.md). M0 é o controle."""
import os, subprocess, sys, tempfile
S = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(S, '../../..'))
MIG = os.path.join(R, 'supabase/migrations/20261111000001_orcamento_ia_arquivar.sql')
def par(nome, *trocas): return (nome, list(trocas))
CK = "CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));"
CK_V = "'CHECK (((deleted_at IS NULL) = (deleted_by IS NULL)))'"
MUT = [
    par('C1 a CHECK vira OU (data sem autor passa)', (CK, "CHECK ((deleted_at IS NULL) OR (deleted_by IS NOT NULL));"),
        (CK_V, "'CHECK (((deleted_at IS NULL) OR (deleted_by IS NOT NULL)))'")),
    par('C2 a CHECK neutra', (CK, "CHECK (true);"), (CK_V, "'CHECK (true)'")),
    par('K1 deleted_at nasce com default (toda linha vira arquivada)', ("  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,", "  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL DEFAULT now(),"),
        ("AND column_name = 'deleted_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' AND column_default IS NULL) THEN",
         "AND column_name = 'deleted_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES') THEN")),
    par('K2 deleted_by com FK para tenants', ("  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;", "  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL REFERENCES public.tenants(id);"),
        ("  IF n <> 0 THEN\n    RAISE EXCEPTION 'verificacao 3", "  IF false THEN\n    RAISE EXCEPTION 'verificacao 3"),
        ("  IF n <> 53 THEN", "  IF n <> 54 THEN")),
    par('K3 deleted_by como text', ("  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;", "  ADD COLUMN IF NOT EXISTS deleted_by text NULL;"),
        ("AND column_name = 'deleted_by' AND data_type = 'uuid'", "AND column_name = 'deleted_by'")),
    par('G1 a guarda nao exige a 20261110000001', ("                  WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND column_name = 'valor_operacao_interna') THEN", "                  WHERE false) THEN")),
    par('G2 a guarda nao conta as colunas', ("  IF n <> 29 THEN", "  IF false THEN")),
    par('G3 a guarda nao conta as constraints', ("  IF n <> 52 THEN", "  IF false THEN")),
    par('V1 a verificacao 1 nao confere deleted_at', ("    RAISE EXCEPTION 'verificacao 1: deleted_at", "    NULL; -- 'verificacao 1: deleted_at"), ("ausente ou com outra forma (timestamptz, nula, sem default). Nada foi alterado.';", "';")),
    par('V3 a verificacao 3 nao confere a FK', ("  IF n <> 0 THEN\n    RAISE EXCEPTION 'verificacao 3", "  IF false THEN\n    RAISE EXCEPTION 'verificacao 3")),
    par('V4 a verificacao 4 nao confere a CHECK', ("AND pg_get_constraintdef(oid) = " + CK_V, "AND true")),
    par('V8 a verificacao 8 nao confere os grants', ("  IF n <> 0 THEN\n    RAISE EXCEPTION 'verificacao 8", "  IF false THEN\n    RAISE EXCEPTION 'verificacao 8")),
    par('V9 a verificacao 9 nao confere o service_role', ("  IF texto IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN", "  IF false THEN")),
    par('A1 a migracao arquiva as linhas de antes', ("COMMENT ON COLUMN public.orcamentista_orcamento.deleted_at IS", "UPDATE public.orcamentista_orcamento SET deleted_at = now(), deleted_by = '00000000-0000-0000-0000-000000000001';\nCOMMENT ON COLUMN public.orcamentista_orcamento.deleted_at IS"),
        ("  IF n <> 0 THEN\n    RAISE EXCEPTION 'verificacao 7", "  IF false THEN\n    RAISE EXCEPTION 'verificacao 7")),
    par('I1 a CHECK sem idempotencia', ("AND conname = 'orcamentista_orcamento_arquivado_com_autor') THEN\n    ALTER", "AND conname = 'orcamentista_orcamento_arquivado_com_autor' AND false) THEN\n    ALTER")),
]
sys.path.insert(0, os.path.dirname(S))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
exigir_trecho_unico((nome, [('a 20261111000001', open(MIG, encoding='utf-8').read(), de, para) for de, para in trocas]) for nome, trocas in MUT)
original = open(MIG, encoding='utf-8').read(); vivas = []
def rodar(texto):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as t: t.write(texto)
    r = subprocess.run([os.path.join(S, 'run.sh'), t.name], capture_output=True, text=True, env={**os.environ, 'HARNESS_DB': 'harness_arquivar_mut'})
    os.unlink(t.name); return r.returncode
controle = rodar(original)
print(f"  {'verde' if controle == 0 else 'VERMELHO'}: M0 controle", flush=True)
for nome, trocas in MUT:
    texto = original
    for de, para in trocas: texto = texto.replace(de, para)
    viva = rodar(texto) == 0
    print(f"  {'VIVA ' if viva else 'morta'}: {nome}", flush=True); viva and vivas.append(nome)
print(f'{len(MUT) - len(vivas)} de {len(MUT)} mortas, controle {"verde" if controle == 0 else "VERMELHO"}')
sys.exit(1 if vivas or controle else 0)
