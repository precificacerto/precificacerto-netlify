import subprocess, sys, os, tempfile
# MUTACOES da 20261121000003 contra o harness (run.sh): cada trecho aparece UMA vez, ou a bateria aborta (codigo 3) antes de rodar.
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
MIG = os.path.join(R, 'supabase/migrations/20261121000003_textos_do_caminho.sql')
TMP = tempfile.mkdtemp()
src = open(MIG).read()
M = [
 ('M1 familia de qualquer empresa', "WHERE tenant_id = p_tenant AND familia = v_familia) THEN", "WHERE familia = v_familia) THEN"),
 ('M2 vinculo de qualquer empresa', "        WHERE c.tenant_id = p_tenant AND cf.fornecedor_id = v_fornecedor", "        WHERE cf.fornecedor_id = v_fornecedor"),
 ('M3 motor de qualquer empresa', "        WHERE e.tenant_id = p_tenant AND m.fornecedor_id = v_fornecedor) THEN", "        WHERE m.fornecedor_id = v_fornecedor) THEN"),
 ('M4 sem o caminho do motor', "        WHERE e.tenant_id = p_tenant AND m.fornecedor_id = v_fornecedor) THEN", "        WHERE false) THEN"),
 ('M5 sem chave desconhecida', "  IF v_chave IS NOT NULL THEN", "  IF false THEN"),
 ('M6 sem o igual', "    IF v_antes.texto IS NOT DISTINCT FROM v_texto THEN", "    IF false THEN"),
 ('M7 sem aparar', "v_texto := NULLIF(btrim(coalesce(p_alvo->>'texto', '')), '');", "v_texto := NULLIF(coalesce(p_alvo->>'texto', ''), '');"),
 ('M8 limpar cria linha vazia', "    IF v_texto IS NULL THEN\n      -- nada escrito", "    IF false THEN\n      -- nada escrito"),
 ('M9 log sem tenant', "  VALUES (p_tenant, 'orcamentista_texto_do_caminho'", "  VALUES (NULL, 'orcamentista_texto_do_caminho'"),
 ('M10 sem trava', "  PERFORM pg_advisory_xact_lock(", "  PERFORM abs("),
 ('M11 revoke so de PUBLIC', "superadmin_gravar_texto_do_caminho(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;", "superadmin_gravar_texto_do_caminho(uuid, uuid, jsonb) FROM PUBLIC;"),
 ('M12 tabela sem revoke', "REVOKE ALL ON public.orcamentista_texto_do_caminho FROM PUBLIC, anon, authenticated;", ""),
 ('M13 sem o teto', "IF v_texto IS NOT NULL AND char_length(v_texto) > 1500 THEN", "IF false THEN"),
 ('M14 os dois alvos aceitos', "  IF (v_familia IS NULL) = (v_fornecedor IS NULL) THEN", "  IF v_familia IS NULL AND v_fornecedor IS NULL THEN"),
 ('M15 guarda de dependencia desligada', "     OR to_regclass('public.orcamentista_familia_etapa') IS NULL OR to_regclass('public.orcamentista_motor') IS NULL", "     OR to_regclass('public.orcamentista_motor') IS NULL"),
 ('M16 guarda da forma desligada', "  IF to_regclass('public.orcamentista_texto_do_caminho') IS NOT NULL\n     AND NOT EXISTS", "  IF false\n     AND NOT EXISTS"),
 ('M17 sem atualizado_por', "SET texto = v_texto, atualizado_por = p_por, atualizado_em = now()", "SET texto = v_texto, atualizado_em = now()"),
 ('M18 texto nao textual aceito', "  IF jsonb_typeof(p_alvo->'texto') NOT IN ('string', 'null') AND p_alvo ? 'texto' THEN", "  IF false THEN"),
]
mortas = 0
for nome, a, b in M:
    if src.count(a) != 1: print('ABORTA (trecho nao unico):', nome, src.count(a)); sys.exit(3)
    p = os.path.join(TMP, 'm.sql'); open(p, 'w').write(src.replace(a, b))
    r = subprocess.run(['bash', os.path.join(R, 'scripts/harness/textos-do-caminho/run.sh'), p], capture_output=True, text=True, env={**os.environ, 'HARNESS_DB': 'harness_mut_tc'})
    morta = r.returncode != 0; mortas += morta
    f = [l for l in r.stdout.splitlines() if l.startswith('FALHOU')][:2]
    print(('MORTA ' if morta else 'VIVA  ') + nome, '|', ' / '.join(x[:110] for x in f))
print(f'{mortas}/{len(M)} mortas')
