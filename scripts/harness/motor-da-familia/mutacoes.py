#!/usr/bin/env python3
"""Mutações da 20261027000006: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0) — senão o instrumento não enxerga."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
MIG = AQUI.parents[2] / "supabase/migrations/20261027000006_motor_da_familia.sql"
ORIGINAL = MIG.read_text()

MUTACOES = [
    ("M01 fornecedor do motor segue obrigatório", "ALTER TABLE public.orcamentista_motor ALTER COLUMN fornecedor_id DROP NOT NULL;", "SELECT 1;"),
    ("M02 FK da etapa sem a família (só motor_id)", "FOREIGN KEY (motor_id, familia) REFERENCES public.orcamentista_motor (id, familia) ON DELETE RESTRICT;\n  END IF;\nEND\n$fk_etapa$;", "FOREIGN KEY (motor_id) REFERENCES public.orcamentista_motor (id) ON DELETE RESTRICT;\n  END IF;\nEND\n$fk_etapa$;"),
    ("M03 FK da etapa em cascata", "(id, familia) ON DELETE RESTRICT;\n  END IF;\nEND\n$fk_etapa$;", "(id, familia) ON DELETE CASCADE;\n  END IF;\nEND\n$fk_etapa$;"),
    ("M04 sem a chave única (id, familia)", "ALTER TABLE public.orcamentista_motor ADD CONSTRAINT orcamentista_motor_id_familia_key UNIQUE (id, familia);", "SELECT 1;"),
    ("M05 item sem a FK da família", "      FOREIGN KEY (familia) REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE RESTRICT;", "      CHECK (true);"),
    ("M06 item sem a FK composta com o motor", "      FOREIGN KEY (motor_id, familia) REFERENCES public.orcamentista_motor (id, familia) ON DELETE RESTRICT;\n  END IF;\nEND\n$fk_item$;", "      CHECK (true);\n  END IF;\nEND\n$fk_item$;"),
    ("M07 família do item obrigatória (NOT NULL)", "ADD COLUMN IF NOT EXISTS familia text;", "ADD COLUMN IF NOT EXISTS familia text NOT NULL DEFAULT 'PVC';"),
    ("M08 índice da vigente segue sem a categoria", "(fornecedor_id, familia, categoria_chave) NULLS NOT DISTINCT WHERE vigente;\n  END IF;", "(fornecedor_id, familia) NULLS NOT DISTINCT WHERE vigente;\n  END IF;"),
    ("M09 índice da vigente com nulos distintos", "ON public.orcamentista_tabela (fornecedor_id, familia, categoria_chave) NULLS NOT DISTINCT WHERE vigente;\n  END IF;", "ON public.orcamentista_tabela (fornecedor_id, familia, categoria_chave) WHERE vigente;\n  END IF;"),
    ("M10 índice da vigente sem WHERE", "ON public.orcamentista_tabela (fornecedor_id, familia, categoria_chave) NULLS NOT DISTINCT WHERE vigente;\n  END IF;", "ON public.orcamentista_tabela (fornecedor_id, familia, categoria_chave) NULLS NOT DISTINCT;\n  END IF;"),
    ("M11 mexe no índice da vigente do motor", "NOTIFY pgrst, 'reload schema';\n\nCOMMIT;", "DROP INDEX public.orcamentista_motor_uma_vigente;\nNOTIFY pgrst, 'reload schema';\n\nCOMMIT;"),
    ("M12 apaga dado (UPDATE de família nos itens)", "NOTIFY pgrst, 'reload schema';\n\nCOMMIT;", "UPDATE public.orcamentista_levantamento_item SET familia = 'PVC';\nNOTIFY pgrst, 'reload schema';\n\nCOMMIT;"),
    ("M13 coluna da etapa NOT NULL", "ALTER TABLE public.orcamentista_familia_etapa ADD COLUMN IF NOT EXISTS motor_id uuid;", "ALTER TABLE public.orcamentista_familia_etapa ADD COLUMN IF NOT EXISTS motor_id uuid NOT NULL DEFAULT gen_random_uuid();"),
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
        print(f"{nome}: TRECHO NAO ACHADO ({ORIGINAL.count(de)}x) — a mutação não se aplica"); vivas.append(nome); continue
    r = rodar(ORIGINAL.replace(de, para))
    print(f"{nome} {'MORTA' if r != 0 else 'SOBREVIVEU'} (exit {r})")
    if r == 0: vivas.append(nome)
print("SOBREVIVERAM:", vivas)

# SEGUNDA PASSADA — sem o bloco de verificação que aborta: os CASOS, sozinhos, têm de derrubar cada mutação.
# (Na primeira, quase todas morrem no aborto da verificação, o que prova a verificação, não os casos.)
def sem_verifica(t):
    i = t.index("DO $verifica$"); j = t.index("$verifica$;", i) + len("$verifica$;")
    return t[:i] + t[j:]
print("--- sem a verificação (só os casos):")
vivas2 = []
c2 = rodar(sem_verifica(ORIGINAL))
print(f"CONTROLE sem verificação: {'passa' if c2 == 0 else 'FALHOU exit ' + str(c2)}")
for nome, de, para in MUTACOES:
    r = rodar(sem_verifica(ORIGINAL.replace(de, para)))
    print(f"{nome} {'MORTA pelos casos' if r == 1 else ('abortou na base' if r == 2 else 'SOBREVIVEU')} (exit {r})")
    if r == 0: vivas2.append(nome)
print("SOBREVIVERAM sem verificação:", vivas2)
sys.exit(1 if (c != 0 or c2 != 0 or vivas or vivas2) else 0)
