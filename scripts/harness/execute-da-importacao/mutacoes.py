#!/usr/bin/env python3
"""As mutações da 20261112000004 e da 20261112000005. Cada uma troca UM trecho, que tem de aparecer UMA vez no arquivo (senão a bateria
aborta com código 3, antes de rodar qualquer coisa), aplica numa cópia e roda o run.sh contra ela: a mutação tem de MORRER (run.sh falha).
A M5 (sem o REVOKE) exige também que a frase da verificação 3 apareça: é o contraste de que a verificação enxerga o corte que faltou."""
import os, subprocess, sys, tempfile
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
M4 = os.path.join(RAIZ, 'supabase/migrations/20261112000004_devolve_execute_da_importacao_ao_service_role.sql')
M5 = os.path.join(RAIZ, 'supabase/migrations/20261112000005_corta_o_caminho_por_fora_da_importacao.sql')
MUT = [
    ('M1 0004 sem o GRANT', M4, "GRANT EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) TO service_role;\n", "\n"),
    ('M2 0004 sem a guarda do md5', M4, "IF md5(corpo) <> 'd98800431ea61fede9cab6593d01f007' THEN", "IF false THEN"),
    ('M3 0004 sem a guarda da nova', M4, "IF to_regprocedure('public.superadmin_importar_tabela", "IF false AND to_regprocedure('public.superadmin_importar_tabela"),
    ('M4 0004 verificacao 2 cega', M4, "AND grantee IN ('PUBLIC', 'anon', 'authenticated');", "AND false;"),
    ('M5 0005 sem o REVOKE', M5, "REVOKE EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;\n", "\n"),
    ('M6 0005 REVOKE sem o service_role', M5, "FROM PUBLIC, anon, authenticated, service_role;\n", "FROM PUBLIC, anon, authenticated;\n"),
    ('M7 0005 sem a guarda do md5 da de dentro', M5, "IF md5(corpo) <> 'd98800431ea61fede9cab6593d01f007' THEN", "IF false THEN"),
    ('M8 0005 sem a guarda do corpo da nova', M5, "IF f.m <> 'afae80234ff0b5857b923b3403ad7ae6' THEN", "IF false THEN"),
    ('M9 0005 sem a guarda do SECURITY DEFINER', M5, "IF NOT f.prosecdef THEN", "IF false THEN"),
    ('M10 0005 sem a guarda do EXECUTE da nova', M5, "'EXECUTE') THEN\n    RAISE EXCEPTION 'o service_role nao executa", "'EXECUTE') AND false THEN\n    RAISE EXCEPTION 'o service_role nao executa"),
    ('M11 0005 sem a guarda da nova ausente', M5, "IF f IS NULL THEN", "IF false THEN"),
]
for nome, arq, de, para in MUT:
    n = open(arq).read().count(de)
    if n != 1:
        print(f'ABORTA: {nome}: o trecho aparece {n} vez(es)'); sys.exit(3)
mortas = 0
for nome, arq, de, para in MUT:
    with tempfile.TemporaryDirectory() as d:
        copia = os.path.join(d, os.path.basename(arq))
        open(copia, 'w').write(open(arq).read().replace(de, para))
        env = dict(os.environ, **({'MIG4': copia} if arq == M4 else {'MIG5': copia}))
        r = subprocess.run([os.path.join(AQUI, 'run.sh')], env=env, capture_output=True, text=True)
        morta = r.returncode != 0
        if nome.startswith('M5'):
            # o contraste: o caso "0005 aplica" falha e imprime a frase da verificação 3 (ela enxerga o corte que faltou)
            morta = morta and 'verificacao 3' in r.stdout
        print(('morta ' if morta else 'VIVA  ') + nome); mortas += morta
print(f'{mortas}/{len(MUT)} mortas'); sys.exit(0 if mortas == len(MUT) else 1)
