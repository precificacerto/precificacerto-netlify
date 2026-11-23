import subprocess, sys, os, tempfile
# MUTACOES da 20261123000001 contra o harness (run.sh): cada trecho aparece UMA vez, ou a bateria aborta (codigo 3) antes de rodar.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
MIG = os.path.join(R, 'supabase/migrations/20261123000001_formato_da_familia.sql')
TMP = tempfile.mkdtemp()
src = open(MIG).read()
M = [
 ('M1 materia-prima de qualquer empresa', "WHERE id = p_materia_prima AND tenant_id = p_tenant FOR UPDATE;", "WHERE id = p_materia_prima FOR UPDATE;"),
 ('M2 sem a trava da linha', "WHERE id = p_materia_prima AND tenant_id = p_tenant FOR UPDATE;", "WHERE id = p_materia_prima AND tenant_id = p_tenant;"),
 ('M3 sem o igual', "  IF v_antes.formato IS NOT DISTINCT FROM v_formato THEN", "  IF false THEN"),
 ('M4 sem normalizar a caixa', "v_formato := upper(btrim(coalesce(p_formato, '')));", "v_formato := btrim(coalesce(p_formato, ''));"),
 ('M5 SERVICO aceito', "  IF v_formato NOT IN ('FABRICACAO', 'REVENDA') THEN", "  IF v_formato NOT IN ('FABRICACAO', 'REVENDA', 'SERVICO') THEN"),
 ('M6 nulo aceito', "  IF v_formato NOT IN ('FABRICACAO', 'REVENDA') THEN", "  IF v_formato <> '' AND v_formato NOT IN ('FABRICACAO', 'REVENDA') THEN"),
 ('M7 log sem tenant', "  VALUES (p_tenant, 'orcamentista_materia_prima', v_antes.id::text,", "  VALUES (NULL, 'orcamentista_materia_prima', v_antes.id::text,"),
 ('M8 sem atualizado_por', "SET formato = v_formato, atualizado_por = p_por, atualizado_em = now()", "SET formato = v_formato, atualizado_em = now()"),
 ('M9 revoke so de PUBLIC', "superadmin_definir_formato_da_materia_prima(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;", "superadmin_definir_formato_da_materia_prima(uuid, uuid, uuid, text) FROM PUBLIC;"),
 ('M10 CHECK aceita qualquer texto', "CHECK (formato IS NULL OR formato IN ('FABRICACAO', 'REVENDA'));", "CHECK (true);"),
 ('M11 preenchimento sem log', "    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n    SELECT", "    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n    SELECT * FROM (SELECT"),
 ('M12 sem o preenchimento', "    UPDATE public.orcamentista_materia_prima SET formato = 'FABRICACAO' WHERE id = '79d764fe-4acd-43e2-bed9-38e20667ca3d'::uuid;", ""),
 ('M13 default que finge escolha', "    ALTER TABLE public.orcamentista_materia_prima ADD COLUMN formato text;", "    ALTER TABLE public.orcamentista_materia_prima ADD COLUMN formato text DEFAULT 'FABRICACAO';"),
 ('M14 guarda da medida desligada', "    IF v_fora > 0 THEN", "    IF false THEN"),
 ('M15 guarda do modelo desligada', "       AND mp.familia = 'PVC' AND c.modelo = 'FABRICACAO';", "       AND mp.familia = 'PVC';"),
 ('M16 guarda da forma desligada', "     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_materia_prima_formato_valido') THEN", "     AND false THEN"),
 ('M17 guarda de dependencia desligada', "     OR to_regclass('public.orcamentista_config') IS NULL OR", "     OR"),
 ('M18 reaplica e preenche de novo', "  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_materia_prima' AND column_name = 'formato') THEN\n    ALTER", "  IF true THEN\n    ALTER TABLE public.orcamentista_materia_prima DROP COLUMN IF EXISTS formato;\n    ALTER"),
]
mortas = 0
for nome, a, b in M:
    if src.count(a) != 1: print('ABORTA (trecho nao unico):', nome, src.count(a)); sys.exit(3)
for nome, a, b in M:
    p = os.path.join(TMP, 'm.sql'); open(p, 'w').write(src.replace(a, b))
    r = subprocess.run(['bash', os.path.join(R, 'scripts/harness/formato-da-familia/run.sh'), p], capture_output=True, text=True, env={**os.environ, 'HARNESS_DB': 'harness_mut_ff'})
    morta = r.returncode != 0; mortas += morta
    f = [l for l in r.stdout.splitlines() if l.startswith('FALHOU')][:2]
    print(('MORTA ' if morta else 'VIVA  ') + nome, '|', ' / '.join(x[:110] for x in f))
print(f'{mortas}/{len(M)} mortas')
