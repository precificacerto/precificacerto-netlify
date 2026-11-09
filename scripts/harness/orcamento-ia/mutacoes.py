#!/usr/bin/env python3
"""
As MUTAÇÕES da migração 20261109000001 (o orçamento I.A.). Cada uma estraga UMA coisa numa CÓPIA do .sql (nunca no arquivo da árvore), roda o
run.sh com a cópia e anota: morta = o run.sh falhou (um caso, um contraste ou a verificação da própria migração). M0 é o controle.
Quando a mutação muda o DDL, muda também a linha da verificação que o descreve, para que seja o CASO a matar, não a verificação.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py S1 S7      (só estas)
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261109000001_orcamento_ia.sql')

AMARRADA_DDL = "(origem = 'agente' AND levantamento_id IS NOT NULL AND criado_por IS NULL)"
AMARRADA_VER = "((origem = ''agente''::text) AND (levantamento_id IS NOT NULL) AND (criado_por IS NULL))"
MUTACOES = [
    ('S1', 'o orçamento do agente pode ter autor humano', [(AMARRADA_DDL, "(origem = 'agente' AND levantamento_id IS NOT NULL)"),
        (AMARRADA_VER, "((origem = ''agente''::text) AND (levantamento_id IS NOT NULL))")]),
    ('S2', 'apagar a empresa arrasta o orçamento', [("REFERENCES public.tenants(id) ON DELETE RESTRICT", "REFERENCES public.tenants(id) ON DELETE CASCADE"),
        ("REFERENCES tenants(id) ON DELETE RESTRICT'", "REFERENCES tenants(id) ON DELETE CASCADE'")]),
    ('S3', 'apagar o levantamento arrasta o orçamento', [("REFERENCES public.orcamentista_levantamento(id, tenant_id) ON DELETE RESTRICT", "REFERENCES public.orcamentista_levantamento(id, tenant_id) ON DELETE CASCADE"),
        ("REFERENCES orcamentista_levantamento(id, tenant_id) ON DELETE RESTRICT", "REFERENCES orcamentista_levantamento(id, tenant_id) ON DELETE CASCADE")]),
    ('S4', 'apagar o orçamento arrasta os itens', [("REFERENCES public.orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT", "REFERENCES public.orcamentista_orcamento(id, tenant_id) ON DELETE CASCADE"),
        ("REFERENCES orcamentista_orcamento(id, tenant_id) ON DELETE RESTRICT", "REFERENCES orcamentista_orcamento(id, tenant_id) ON DELETE CASCADE")]),
    ('S5', 'o item do levantamento apagado trava a conversa (RESTRICT no lugar de SET NULL)', [("REFERENCES public.orcamentista_levantamento_item(id) ON DELETE SET NULL", "REFERENCES public.orcamentista_levantamento_item(id) ON DELETE RESTRICT"),
        ("REFERENCES orcamentista_levantamento_item(id) ON DELETE SET NULL", "REFERENCES orcamentista_levantamento_item(id) ON DELETE RESTRICT")]),
    ('S6', 'dois orçamentos do mesmo levantamento', [("CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_orcamento_um_por_levantamento", "CREATE INDEX IF NOT EXISTS orcamentista_orcamento_um_por_levantamento"),
        ("'orcamentista_orcamento_um_por_levantamento|CREATE UNIQUE INDEX", "'orcamentista_orcamento_um_por_levantamento|CREATE INDEX")]),
    ('S7', 'o service_role ganha DELETE', [("GRANT SELECT, INSERT, UPDATE ON", "GRANT SELECT, INSERT, UPDATE, DELETE ON"),
        ("IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN\n    RAISE EXCEPTION 'verificacao 9: service_role em orcamentista_orcamento tem", "IS DISTINCT FROM 'DELETE,INSERT,SELECT,UPDATE' THEN\n    RAISE EXCEPTION 'verificacao 9: service_role em orcamentista_orcamento tem"),
        ("IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN\n    RAISE EXCEPTION 'verificacao 9: service_role em orcamentista_orcamento_item tem", "IS DISTINCT FROM 'DELETE,INSERT,SELECT,UPDATE' THEN\n    RAISE EXCEPTION 'verificacao 9: service_role em orcamentista_orcamento_item tem")]),
    ('S8', 'o REVOKE esquece o service_role (o privilégio padrão fica)', [("FROM PUBLIC, anon, authenticated, service_role;", "FROM PUBLIC, anon, authenticated;")]),
    ('S9', 'quantidade zero passa', [("CHECK (quantidade >= 1)", "CHECK (quantidade >= 0)"), ("CHECK ((quantidade >= 1))", "CHECK ((quantidade >= 0))")]),
    ('S10', 'o nome com espaço na ponta passa', [("CHECK ((nome ~ '^\\S(.*\\S)?$'::text) AND (char_length(nome) <= 120))", "CHECK (char_length(nome) <= 120)"),
        ("CHECK (((nome ~ ''^\\S(.*\\S)?$''::text) AND (char_length(nome) <= 120)))", "CHECK ((char_length(nome) <= 120))")]),
    ('S11', 'o número único na plataforma inteira, não por empresa', [("CONSTRAINT orcamentista_orcamento_numero_key UNIQUE (tenant_id, numero)", "CONSTRAINT orcamentista_orcamento_numero_key UNIQUE (numero)"),
        ("orcamentista_orcamento_numero_key|UNIQUE (tenant_id, numero)", "orcamentista_orcamento_numero_key|UNIQUE (numero)")]),
    ('S12', 'a RLS do item fica desligada', [("ALTER TABLE public.orcamentista_orcamento_item ENABLE ROW LEVEL SECURITY;\n", "")]),
    ('S13', 'a guarda não confere a UNIQUE do levantamento', [("  IF NOT EXISTS (SELECT 1 FROM pg_constraint\n                  WHERE conrelid = to_regclass('public.orcamentista_levantamento')", "  IF false AND NOT EXISTS (SELECT 1 FROM pg_constraint\n                  WHERE conrelid = to_regclass('public.orcamentista_levantamento')")]),
    ('S14', 'a marca pela metade passa', [("CHECK ((editado_manualmente_em IS NULL) = (editado_manualmente_por IS NULL))", "CHECK ((editado_manualmente_em IS NULL) OR true)"),
        ("CHECK (((editado_manualmente_em IS NULL) = (editado_manualmente_por IS NULL)))", "CHECK (((editado_manualmente_em IS NULL) OR true))")]),
    ('S15', 'o manual pode vir de levantamento', [("OR (origem = 'manual' AND levantamento_id IS NULL AND criado_por IS NOT NULL))", "OR (origem = 'manual' AND criado_por IS NOT NULL))"),
        ("OR ((origem = ''manual''::text) AND (levantamento_id IS NULL) AND (criado_por IS NOT NULL))))", "OR ((origem = ''manual''::text) AND (criado_por IS NOT NULL))))")]),
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
                raise SystemExit(f'{ident}: o trecho aparece {texto.count(velho)} vez(es) — a mutação precisa ser revista: {velho[:60]}')
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
