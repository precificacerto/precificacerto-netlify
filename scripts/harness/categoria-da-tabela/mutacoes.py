#!/usr/bin/env python3
"""Mutações da 20261027000005: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na
base (exit 2). O CONTROLE (sem mutação) tem de passar (exit 0) — senão o instrumento não enxerga."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIG = AQUI.parents[2] / "supabase/migrations/20261027000005_categoria_da_tabela_de_fornecedor.sql"
ORIGINAL = MIG.read_text()

MUTACOES = [
    ("M1 insert sem categoria passa", "    IF NEW.categoria_chave IS NULL THEN", "    IF false THEN"),
    ("M2 troca da categoria passa", "IF OLD.categoria_chave IS NOT NULL AND NEW.categoria_chave IS DISTINCT FROM OLD.categoria_chave THEN", "IF false THEN"),
    ("M3 apagar a categoria passa (<> no lugar de IS DISTINCT FROM)", "NEW.categoria_chave IS DISTINCT FROM OLD.categoria_chave THEN", "NEW.categoria_chave <> OLD.categoria_chave THEN"),
    ("M4 sem a FK", "ALTER TABLE public.orcamentista_tabela\n      ADD CONSTRAINT orcamentista_tabela_categoria_fkey\n      FOREIGN KEY (categoria_chave) REFERENCES public.orcamentista_categoria_catalogo (chave) ON DELETE RESTRICT;", "NULL;"),
    ("M5 gatilho dispara em qualquer UPDATE", "BEFORE INSERT OR UPDATE OF categoria_chave ON", "BEFORE INSERT OR UPDATE ON"),
    ("M6 gatilho só no INSERT", "BEFORE INSERT OR UPDATE OF categoria_chave ON", "BEFORE INSERT ON"),
    ("M7 coluna NOT NULL (recusa as de antes)", "ADD COLUMN IF NOT EXISTS categoria_chave text;", "ADD COLUMN IF NOT EXISTS categoria_chave text NOT NULL DEFAULT 'VIDRO';"),
    ("M8 código do erro outro", "USING ERRCODE = '23514';\n    END IF;\n    RETURN NEW;", "USING ERRCODE = '23502';\n    END IF;\n    RETURN NEW;"),
    ("M9 alarga o índice da vigente", "-- ── B e C. as travas", "CREATE UNIQUE INDEX IF NOT EXISTS x ON public.orcamentista_tabela (fornecedor_id) WHERE false;\nDROP INDEX public.orcamentista_tabela_uma_vigente;\nCREATE UNIQUE INDEX orcamentista_tabela_uma_vigente ON public.orcamentista_tabela (fornecedor_id, familia, categoria_chave) NULLS NOT DISTINCT WHERE vigente;\n-- ── B e C. as travas"),
    ("M10 função sem search_path fixo", "LANGUAGE plpgsql\nSET search_path = pg_catalog, public\n", "LANGUAGE plpgsql\n"),
    ("M11 ON DELETE CASCADE na FK", "(chave) ON DELETE RESTRICT;\n  END IF;", "(chave) ON DELETE CASCADE;\n  END IF;"),
]

def rodar(texto):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(texto)
    return subprocess.run(["bash", str(AQUI / "run.sh"), f.name], capture_output=True, text=True).returncode

c = rodar(ORIGINAL)
print(f"CONTROLE (sem mutação): {'passa' if c == 0 else 'FALHOU exit ' + str(c)}")
vivas = []
for nome, de, para in MUTACOES:
    if ORIGINAL.count(de) != 1:
        print(f"{nome}: TRECHO NAO ACHADO (ou repetido) — a mutação não se aplica"); vivas.append(nome); continue
    r = rodar(ORIGINAL.replace(de, para))
    estado = "MORTA" if r != 0 else "SOBREVIVEU"
    print(f"{nome} {estado} (exit {r})")
    if r == 0: vivas.append(nome)
print("SOBREVIVERAM:", vivas)
sys.exit(1 if (c != 0 or vivas) else 0)
