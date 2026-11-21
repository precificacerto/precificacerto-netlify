import subprocess, sys, os, tempfile
# MUTACOES da 20261121000002 contra o harness (run.sh): cada trecho aparece UMA vez, ou a bateria aborta (codigo 3) antes de rodar.
R=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
TMP=tempfile.mkdtemp()
MIG=os.path.join(R,'supabase/migrations/20261121000002_gravar_natureza.sql')
src=open(MIG).read()
M=[
 ('M1 sem conferir a familia da empresa', "  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_materia_prima WHERE tenant_id = p_tenant AND familia = v_familia) THEN", "  IF false THEN"),
 ('M2 familia de qualquer empresa', "WHERE tenant_id = p_tenant AND familia = v_familia) THEN", "WHERE familia = v_familia) THEN"),
 ('M3 sem chave desconhecida', "  IF v_chave IS NOT NULL THEN\n    RAISE EXCEPTION 'natureza: chave desconhecida", "  IF false THEN\n    RAISE EXCEPTION 'natureza: chave desconhecida"),
 ('M4 sem o igual', "    IF v_antes.natureza = v_natureza AND v_antes.opcao_padrao IS NOT DISTINCT FROM v_opcao THEN", "    IF false THEN"),
 ('M5 sem aparar a opcao', "NULLIF(btrim(p_linha->>'opcao_padrao'), '')", "NULLIF(p_linha->>'opcao_padrao', '')"),
 ('M6 sem log', ["  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n  VALUES (p_tenant,", "p_por);\n  RETURN jsonb_build_object('resultado', CASE"], ["  IF false THEN INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n  VALUES (p_tenant,", "p_por); END IF;\n  RETURN jsonb_build_object('resultado', CASE"]),
 ('M7 log sem tenant', "  VALUES (p_tenant, 'orcamentista_natureza_da_variavel'", "  VALUES (NULL, 'orcamentista_natureza_da_variavel'"),
 ('M8 formato nao entra na busca', "AND formato IS NOT DISTINCT FROM v_formato AND variavel", "AND variavel"),
 ('M9 sem trava', "  PERFORM pg_advisory_xact_lock(", "  PERFORM abs("),
 ('M10 grant a authenticated', "GRANT EXECUTE ON FUNCTION public.superadmin_gravar_natureza(uuid, uuid, jsonb) TO service_role;", "GRANT EXECUTE ON FUNCTION public.superadmin_gravar_natureza(uuid, uuid, jsonb) TO service_role, authenticated;"),
 ('M11 revoke so de PUBLIC', "FROM PUBLIC, anon, authenticated;", "FROM PUBLIC;"),
 ('M12 sem atualizado_por', "atualizado_por = p_por, atualizado_em = now()", "atualizado_em = now()"),
 ('M13 guarda da forma desligada', "     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_natureza_opcao_so_na_politica')\n", ""),
 ('M14 guarda da tabela desligada', "  IF to_regclass('public.orcamentista_natureza_da_variavel') IS NULL THEN", "  IF false THEN"),
]
mortas=0
for nome,a,b in M:
    a=a if isinstance(a,list) else [a]; b=b if isinstance(b,list) else [b]
    t=src
    for x,y in zip(a,b):
        if t.count(x)!=1: print('ABORTA (trecho nao unico):',nome, t.count(x)); sys.exit(3)
        t=t.replace(x,y)
    p=os.path.join(TMP,'m.sql')
    open(p,'w').write(t)
    r=subprocess.run(['bash',os.path.join(R,'scripts/harness/gravar-natureza/run.sh'),p],capture_output=True,text=True,env={**os.environ,'HARNESS_DB':'harness_mut_gn'})
    morta=r.returncode!=0
    mortas+=morta
    falhas=[l for l in r.stdout.splitlines() if l.startswith('FALHOU')][:2]
    print(('MORTA ' if morta else 'VIVA  ')+nome, '|', ' / '.join(x[:110] for x in falhas))
print(f'{mortas}/{len(M)} mortas')
