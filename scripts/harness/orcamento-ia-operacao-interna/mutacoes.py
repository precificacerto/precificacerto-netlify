#!/usr/bin/env python3
"""Mutações da 20261110000001 (a operação interna): cada uma é aplicada a uma CÓPIA da migração (a árvore não muda) e passada ao run.sh;
viva = o run.sh sai 0. Quando a mutação muda uma CHECK, muda também a linha da verificação que a descreve, para que seja o CASO a matar,
não a verificação. Antes de rodar, todo trecho tem de aparecer exatamente uma vez (mutacao-que-nao-se-aplica.md)."""
import os, subprocess, sys, tempfile
S = os.path.dirname(os.path.abspath(__file__)); R = os.path.abspath(os.path.join(S, '../../..'))
MIG = os.path.join(R, 'supabase/migrations/20261110000001_orcamento_ia_operacao_interna.sql')
def par(nome, *trocas): return (nome, list(trocas))
CV = "CHECK ((valor_operacao_interna IS NULL) = (valor_venda IS NULL));"
CV_V = "'CHECK (((valor_operacao_interna IS NULL) = (valor_venda IS NULL)))'"
FX = "CHECK ((valor_operacao_interna IS NULL) OR ((valor_operacao_interna > 0) AND (valor_operacao_interna <= round(valor_venda, 2))));"
FX_V = "'CHECK (((valor_operacao_interna IS NULL) OR ((valor_operacao_interna > (0)::numeric) AND (valor_operacao_interna <= round(valor_venda, 2)))))'"
CT = "CHECK ((valor_operacao_interna IS NULL) OR (valor_operacao_interna = round(valor_operacao_interna, 2)));"
CT_V = "'CHECK (((valor_operacao_interna IS NULL) OR (valor_operacao_interna = round(valor_operacao_interna, 2))))'"
MUT = [
    par('C1 com_a_venda vira OU', (CV, "CHECK ((valor_operacao_interna IS NULL) OR (valor_venda IS NULL));"),
        (CV_V, "'CHECK (((valor_operacao_interna IS NULL) OR (valor_venda IS NULL)))'")),
    par('C2 com_a_venda neutra', (CV, "CHECK (true);"), (CV_V, "'CHECK (true)'")),
    par('F1 na_faixa aceita zero', (FX, FX.replace('> 0)', '>= 0)')), (FX_V, FX_V.replace('> (0)::numeric', '>= (0)::numeric'))),
    par('F2 na_faixa sem o teto da venda', (FX, "CHECK ((valor_operacao_interna IS NULL) OR (valor_operacao_interna > 0));"),
        (FX_V, "'CHECK (((valor_operacao_interna IS NULL) OR (valor_operacao_interna > (0)::numeric)))'")),
    par('F4 na_faixa com o teto na venda crua', (FX, FX.replace('round(valor_venda, 2)', 'valor_venda')), (FX_V, FX_V.replace('round(valor_venda, 2)', 'valor_venda'))),
    par('F5 na_faixa com o teto na venda truncada', (FX, FX.replace('round(valor_venda, 2)', 'trunc(valor_venda, 2)')), (FX_V, FX_V.replace('round(valor_venda, 2)', 'trunc(valor_venda, 2)'))),
    par('F3 na_faixa neutra', (FX, "CHECK (true);"), (FX_V, "'CHECK (true)'")),
    par('T1 ao_centavo com tres casas', (CT, CT.replace(', 2)', ', 3)')), (CT_V, CT_V.replace(', 2)', ', 3)'))),
    par('T2 ao_centavo neutra', (CT, "CHECK (true);"), (CT_V, "'CHECK (true)'")),
    par('K1 a coluna nasce com default', ("ADD COLUMN IF NOT EXISTS valor_operacao_interna numeric NULL;", "ADD COLUMN IF NOT EXISTS valor_operacao_interna numeric NULL DEFAULT 1;"),
        ("AND is_nullable = 'YES' AND column_default IS NULL) THEN\n    RAISE EXCEPTION 'verificacao 1", "AND is_nullable = 'YES') THEN\n    RAISE EXCEPTION 'verificacao 1")),
    par('G1 a guarda deixa passar orcamento com venda', ("  IF n <> 0 THEN\n    RAISE EXCEPTION 'guarda: % orcamento(s)", "  IF false THEN\n    RAISE EXCEPTION 'guarda: % orcamento(s)")),
    par('G2 a guarda nao exige a 0005', ("  IF to_regclass('public.orcamentista_orcamento_arquivo') IS NULL THEN", "  IF false THEN")),
    par('G3 a guarda nao conta as constraints', ("  IF n <> 49 THEN", "  IF false THEN")),
    par('G4 a guarda nao conta as colunas', ("  IF n <> 28 THEN", "  IF false THEN")),
    par('V1 a verificacao 2 nao confere a com_a_venda', ("AND pg_get_constraintdef(oid) = " + CV_V, "AND true")),
    par('V2 a verificacao 5 nao confere os grants', ("  IF n <> 0 THEN\n    RAISE EXCEPTION 'verificacao 5", "  IF false THEN\n    RAISE EXCEPTION 'verificacao 5")),
    par('V3 a verificacao 6 nao confere o service_role', ("  IF faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN", "  IF false THEN")),
    par('I1 a na_faixa sem idempotencia', ("AND conname = 'orcamentista_orcamento_operacao_interna_na_faixa') THEN\n    ALTER", "AND conname = 'orcamentista_orcamento_operacao_interna_na_faixa' AND false) THEN\n    ALTER")),
]
sys.path.insert(0, os.path.dirname(S))
from trecho_unico import exigir_trecho_unico  # a mutação que não se aplica aborta (mutacao-que-nao-se-aplica.md)
exigir_trecho_unico((nome, [('a 20261110000001', open(MIG, encoding='utf-8').read(), de, para) for de, para in trocas]) for nome, trocas in MUT)
original = open(MIG, encoding='utf-8').read(); vivas = []
for nome, trocas in MUT:
    texto = original
    for de, para in trocas: texto = texto.replace(de, para)
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as t: t.write(texto)
    r = subprocess.run([os.path.join(S, 'run.sh'), t.name], capture_output=True, text=True, env={**os.environ, 'HARNESS_DB': 'harness_interna_mut'})
    os.unlink(t.name)
    print(f"  {'VIVA ' if r.returncode == 0 else 'morta'}: {nome}", flush=True); r.returncode == 0 and vivas.append(nome)
print(f'{len(MUT) - len(vivas)} de {len(MUT)} mortas')
sys.exit(1 if vivas else 0)
