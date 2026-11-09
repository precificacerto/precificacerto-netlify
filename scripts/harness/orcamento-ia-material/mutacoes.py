#!/usr/bin/env python3
"""
As MUTAÇÕES da migração 20261109000003 (o material consumido no item do orçamento I.A.). Cada uma estraga UMA coisa numa CÓPIA do .sql (nunca
no arquivo da árvore), roda o run.sh com a cópia e anota: morta = o run.sh falhou. M0 é o controle. Quando a mutação muda o DDL, muda também a
linha da verificação que o descreve, para que seja o CASO a matar, não a verificação.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py M1 M7      (só estas)
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261109000003_orcamento_ia_material.sql')

FK_DDL = "FOREIGN KEY (orcamento_item_id, tenant_id)\n    REFERENCES public.orcamentista_orcamento_item(id, tenant_id) ON DELETE RESTRICT,"
FK_VER = "FOREIGN KEY (orcamento_item_id, tenant_id) REFERENCES orcamentista_orcamento_item(id, tenant_id) ON DELETE RESTRICT'"
SEM_DDL = "CHECK (((cred_icms_pct IS NOT NULL) OR (cred_pis_cofins_pct IS NOT NULL)) OR (custo_liquido_unidade = custo_bruto_unidade))\n"
SEM_VER = "CHECK (((cred_icms_pct IS NOT NULL) OR (cred_pis_cofins_pct IS NOT NULL) OR (custo_liquido_unidade = custo_bruto_unidade)))'"
FAL_DDL = "CHECK ((((cred_icms_pct IS NOT NULL) AND (cred_pis_cofins_pct IS NOT NULL) AND ((cred_ipi_pct IS NOT NULL) OR (nc_ipi_pct IS NOT NULL))) = (credito_nao_apurado IS NULL))),"
FAL_VER = "CHECK ((((cred_icms_pct IS NOT NULL) AND (cred_pis_cofins_pct IS NOT NULL) AND ((cred_ipi_pct IS NOT NULL) OR (nc_ipi_pct IS NOT NULL))) = (credito_nao_apurado IS NULL)))'"
COM_DDL = "CHECK ((calculo_id IS NOT NULL) OR ((custo_bruto_materiais IS NULL) AND (custo_liquido_materiais IS NULL) AND (custo_fabricacao IS NULL) AND (custo_liquido_total IS NULL)))'"
COM_VER = "CHECK (((calculo_id IS NOT NULL) OR ((custo_bruto_materiais IS NULL) AND (custo_liquido_materiais IS NULL) AND (custo_fabricacao IS NULL) AND (custo_liquido_total IS NULL))))'"
MUTACOES = [
    ('M1', 'a FK do material volta a ser de coluna única (o furo de isolamento)', [
        ("CONSTRAINT orcamentista_orcamento_item_material_item_fkey " + FK_DDL, "CONSTRAINT orcamentista_orcamento_item_material_item_fkey FOREIGN KEY (orcamento_item_id)\n    REFERENCES public.orcamentista_orcamento_item(id) ON DELETE RESTRICT,"),
        (FK_VER, "FOREIGN KEY (orcamento_item_id) REFERENCES orcamentista_orcamento_item(id) ON DELETE RESTRICT'")]),
    ('M2', 'apagar o item arrasta o material (CASCADE)', [
        (FK_DDL, FK_DDL.replace('RESTRICT', 'CASCADE')), (FK_VER, FK_VER.replace('RESTRICT', 'CASCADE'))]),
    ('M3', 'o crédito não apurado pode baratear', [(SEM_DDL, "CHECK (true)\n"), (SEM_VER, "CHECK (true)'")]),
    ('M11', 'a falta pode sumir (a cascata parcial sem o que faltou)', [(FAL_DDL, "CHECK (true),"), (FAL_VER, "CHECK (true)'")]),
    ('M12', 'a falta só vale num sentido (tudo resolvido com falta passa)', [(FAL_DDL, "CHECK ((credito_nao_apurado IS NOT NULL) OR ((cred_icms_pct IS NOT NULL) AND (cred_pis_cofins_pct IS NOT NULL) AND ((cred_ipi_pct IS NOT NULL) OR (nc_ipi_pct IS NOT NULL)))),"),
        (FAL_VER, "CHECK (((credito_nao_apurado IS NOT NULL) OR ((cred_icms_pct IS NOT NULL) AND (cred_pis_cofins_pct IS NOT NULL) AND ((cred_ipi_pct IS NOT NULL) OR (nc_ipi_pct IS NOT NULL)))))'")]),
    ('M13', 'o par do IPI exige os DOIS (o OR do par vira AND)', [(FAL_DDL, FAL_DDL.replace("(cred_ipi_pct IS NOT NULL) OR (nc_ipi_pct IS NOT NULL)", "(cred_ipi_pct IS NOT NULL) AND (nc_ipi_pct IS NOT NULL)")),
        (FAL_VER, FAL_VER.replace("(cred_ipi_pct IS NOT NULL) OR (nc_ipi_pct IS NOT NULL)", "(cred_ipi_pct IS NOT NULL) AND (nc_ipi_pct IS NOT NULL)"))]),
    ('M14', 'a falta esquece o par do IPI', [(FAL_DDL, "CHECK (((cred_icms_pct IS NOT NULL) AND (cred_pis_cofins_pct IS NOT NULL)) = (credito_nao_apurado IS NULL)),"),
        (FAL_VER, "CHECK ((((cred_icms_pct IS NOT NULL) AND (cred_pis_cofins_pct IS NOT NULL)) = (credito_nao_apurado IS NULL)))'")]),
    ('M4', 'o valor do item sem cálculo apontado passa', [(COM_DDL, "CHECK (true)'"), (COM_VER, "CHECK (true)'")]),
    ('M5', 'o cálculo sem a data passa', [("'orcamentista_orcamento_item_calculo_inteiro|CHECK ((calculo_id IS NULL) = (calculado_em IS NULL))'", "'orcamentista_orcamento_item_calculo_inteiro|CHECK (true)'"),
        ("orcamentista_orcamento_item_calculo_inteiro|CHECK (((calculo_id IS NULL) = (calculado_em IS NULL)))'", "orcamentista_orcamento_item_calculo_inteiro|CHECK (true)'")]),
    ('M6', 'o service_role ganha UPDATE no material', [("GRANT SELECT, INSERT ON public.orcamentista_orcamento_item_material TO service_role;", "GRANT SELECT, INSERT, UPDATE ON public.orcamentista_orcamento_item_material TO service_role;"),
        ("IF faltam IS DISTINCT FROM 'INSERT,SELECT' THEN", "IF faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN")]),
    ('M7', 'o REVOKE esquece o service_role (o privilégio padrão dá ALL)', [("REVOKE ALL ON public.orcamentista_orcamento_item_material FROM PUBLIC, anon, authenticated, service_role;", "REVOKE ALL ON public.orcamentista_orcamento_item_material FROM PUBLIC, anon, authenticated;"),
        ("IF faltam IS DISTINCT FROM 'INSERT,SELECT' THEN", "IF false THEN")]),
    ('M8', 'a RLS fica desligada', [("ALTER TABLE public.orcamentista_orcamento_item_material ENABLE ROW LEVEL SECURITY;\n", ""),
        ("  IF NOT (SELECT relrowsecurity", "  IF false AND NOT (SELECT relrowsecurity")]),
    ('M9', 'o mesmo código duas vezes no mesmo cálculo', [("  CONSTRAINT orcamentista_orcamento_item_material_codigo_key UNIQUE (orcamento_item_id, calculo_id, codigo),\n", ""),
        ("    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_codigo_key|UNIQUE (orcamento_item_id, calculo_id, codigo)',\n", ""),
        ("  IF n <> 15 THEN", "  IF n <> 14 THEN")]),
    ('M10', 'o percentual de ICMS aceita até 1000', [("((cred_icms_pct >= 0) AND (cred_icms_pct <= 100))", "((cred_icms_pct >= 0) AND (cred_icms_pct <= 1000))"),
        ("((cred_icms_pct >= (0)::numeric) AND (cred_icms_pct <= (100)::numeric))) AND ((cred_pis_cofins_pct IS NULL) OR ((cred_pis_cofins_pct >= (0)::numeric) AND (cred_pis_cofins_pct <= (100)::numeric))) AND ((cred_ipi_pct IS NULL) OR ((cred_ipi_pct >= (0)::numeric) AND (cred_ipi_pct <= (100)::numeric))) AND ((nc_ipi_pct IS NULL) OR ((nc_ipi_pct >= (0)::numeric) AND (nc_ipi_pct <= (100)::numeric))) AND ((cred_ibs_pct IS NULL) OR ((cred_ibs_pct >= (0)::numeric) AND (cred_ibs_pct <= (100)::numeric))) AND ((cred_cbs_pct IS NULL) OR ((cred_cbs_pct >= (0)::numeric) AND (cred_cbs_pct <= (100)::numeric)))))',\n    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_pkey",
         "((cred_icms_pct >= (0)::numeric) AND (cred_icms_pct <= (1000)::numeric))) AND ((cred_pis_cofins_pct IS NULL) OR ((cred_pis_cofins_pct >= (0)::numeric) AND (cred_pis_cofins_pct <= (100)::numeric))) AND ((cred_ipi_pct IS NULL) OR ((cred_ipi_pct >= (0)::numeric) AND (cred_ipi_pct <= (100)::numeric))) AND ((nc_ipi_pct IS NULL) OR ((nc_ipi_pct >= (0)::numeric) AND (nc_ipi_pct <= (100)::numeric))) AND ((cred_ibs_pct IS NULL) OR ((cred_ibs_pct >= (0)::numeric) AND (cred_ibs_pct <= (100)::numeric))) AND ((cred_cbs_pct IS NULL) OR ((cred_cbs_pct >= (0)::numeric) AND (cred_cbs_pct <= (100)::numeric)))))',\n    'orcamentista_orcamento_item_material|orcamentista_orcamento_item_material_pkey")]),
    ('G1', 'a guarda não confere as tabelas da 20261109000001', [("  IF to_regclass('public.orcamentista_orcamento_item') IS NULL OR to_regclass('public.tenants') IS NULL THEN", "  IF false THEN")]),
    ('G2', 'a guarda não confere a 20261109000002', [("  IF NOT EXISTS (SELECT 1 FROM information_schema.columns\n                  WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento_item' AND column_name = 'custo_liquido_total') THEN", "  IF false THEN")]),
    ('V3', 'a verificação 3 (a contagem do item) desligada', [("  IF n <> 44 THEN", "  IF false AND n <> 44 THEN")]),
    ('V4', 'a verificação 4 (as chaves do item) desligada', [("  IF faltam IS DISTINCT FROM 'orcamentista_orcamento_item_id_tenant_key", "  IF false AND faltam IS DISTINCT FROM 'orcamentista_orcamento_item_id_tenant_key")]),
]


def rodar(caminho):
    return subprocess.run(['bash', os.path.join(AQUI, 'run.sh'), caminho], capture_output=True, text=True).returncode


def main():
    pedidas = set(sys.argv[1:])
    original = open(MIG, encoding='utf-8').read()
    vivas = 0
    if not pedidas or 'M0' in pedidas:
        verde = rodar(MIG) == 0
        print(f"{'verde   ' if verde else 'VERMELHO'} M0: CONTROLE: nada muda")
        vivas += 0 if verde else 1
    for ident, descricao, trocas in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        texto = original
        for velho, novo in trocas:
            if texto.count(velho) != 1:
                raise SystemExit(f'{ident}: o trecho aparece {texto.count(velho)} vez(es) — a mutação precisa ser revista: {velho[:70]}')
            texto = texto.replace(velho, novo)
        with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as f:
            f.write(texto)
            copia = f.name
        try:
            morta = rodar(copia) != 0
        finally:
            os.unlink(copia)
        print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}")
        vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}")
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
