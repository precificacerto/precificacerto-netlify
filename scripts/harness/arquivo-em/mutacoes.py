#!/usr/bin/env python3
"""Mutações da 20261101000002 ("Subido em" = arquivo_em): cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS, sozinhos, derrubem cada
mutação (ou que a base aborte). A base da tabela-soberana é construída uma vez (o controle) e reaproveitada (REUSA_BASE=1)."""
import os, pathlib, re, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
ORIG = (AQUI.parents[2] / "supabase/migrations/20261101000002_arquivo_em_da_tabela.sql").read_text()

MUTACOES = [
    ("S1 o semeio não loga", [("    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)\n    VALUES (NULL, 'orcamentista_tabela', v_t.id::text,",
                                "    PERFORM 1; INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por) SELECT NULL, 'orcamentista_tabela', v_t.id::text,"),
                               ("            NULL);\n    v_n := v_n + 1;", "            NULL WHERE false;\n    v_n := v_n + 1;")]),
    ("S2 o semeio com now()", [("    UPDATE public.orcamentista_tabela SET arquivo_em = criado_em WHERE id = v_t.id;", "    UPDATE public.orcamentista_tabela SET arquivo_em = now() WHERE id = v_t.id;")]),
    ("S3 o semeio regrava as já semeadas", [("FROM public.orcamentista_tabela t WHERE t.arquivo_em IS NULL ORDER BY", "FROM public.orcamentista_tabela t ORDER BY")]),
    ("S4 o log sem a origem", [("'origem_de_arquivo_em', 'criado_em: a troca", "'origem', 'criado_em: a troca")]),
    ("S5 o antes do log com arquivo_em", [("SELECT t.id, to_jsonb(t) - 'arquivo_em' AS antes", "SELECT t.id, to_jsonb(t) AS antes")]),
    ("C1 a coluna aceita nulo", [("ALTER TABLE public.orcamentista_tabela ALTER COLUMN arquivo_em SET NOT NULL;\n", "")]),
    ("C2 a coluna sem default", [("ALTER TABLE public.orcamentista_tabela ALTER COLUMN arquivo_em SET DEFAULT now();\n", "")]),
    ("G1 a troca não grava o instante", [("  ELSIF NEW.arquivo_path IS DISTINCT FROM OLD.arquivo_path THEN\n    NEW.arquivo_em := now();\n", "")]),
    ("G2 arquivo_em se escreve à mão", [("  ELSE\n    NEW.arquivo_em := OLD.arquivo_em;\n", "")]),
    ("G3 a criação aceita o arquivo_em mandado", [("    NEW.arquivo_em := NEW.criado_em;\n", "    NEW.arquivo_em := coalesce(NEW.arquivo_em, NEW.criado_em);\n")]),
    ("G4 o gatilho só na troca do arquivo", [("  BEFORE INSERT OR UPDATE ON public.orcamentista_tabela\n", "  BEFORE INSERT OR UPDATE OF arquivo_path ON public.orcamentista_tabela\n")]),
    ("G5 o gatilho só no UPDATE", [("  BEFORE INSERT OR UPDATE ON public.orcamentista_tabela\n", "  BEFORE UPDATE ON public.orcamentista_tabela\n")]),
    ("G6 o motor também conta como troca", [("  ELSIF NEW.arquivo_path IS DISTINCT FROM OLD.arquivo_path THEN", "  ELSIF NEW.arquivo_path IS DISTINCT FROM OLD.arquivo_path OR NEW.motor_path IS DISTINCT FROM OLD.motor_path THEN")]),
    ("G7 a função aberta", [("REVOKE ALL ON FUNCTION public.orcamentista_tabela_arquivo_em() FROM PUBLIC;\n", "")]),
    ("G8 a troca com clock_timestamp", [("    NEW.arquivo_em := now();\n  ELSE", "    NEW.arquivo_em := clock_timestamp();\n  ELSE")]),
]

def sem_verifica(t): return re.sub(r"DO \$verifica\$.*?\$verifica\$;\n", "", t, flags=re.S)

base_pronta = False
def rodar(t):
    global base_pronta
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f: f.write(t)
    env = dict(os.environ, REUSA_BASE="1") if base_pronta else dict(os.environ)
    r = subprocess.run(["bash", str(AQUI / "run.sh"), f.name], capture_output=True, text=True, env=env).returncode
    base_pronta = True
    return r

def aplicar(trocas, tira):
    t = ORIG
    for de, para in trocas: t = t.replace(de, para)
    return sem_verifica(t) if tira else t

if os.environ.get("SO"):
    MUTACOES = [m for m in MUTACOES if m[0].split(" ")[0] in os.environ["SO"].split(",")]
erro = [(n, de[:60]) for n, trocas in MUTACOES for de, _ in trocas if ORIG.count(de) != 1]
if erro or "$verifica$" not in ORIG or sem_verifica(ORIG) == ORIG:
    print("TRECHO NAO ACHADO ou repetido:", erro); sys.exit(1)
vivas = {}
for tira in (False, True):
    c = rodar(aplicar([], tira))
    print(f"CONTROLE {'sem' if tira else 'com'} verificação: {'passa' if c == 0 else 'FALHOU exit ' + str(c)}", flush=True)
    if c != 0: sys.exit(1)
    for nome, trocas in MUTACOES:
        r = rodar(aplicar(trocas, tira))
        print(f"{nome} {'MORTA' if r != 0 else 'SOBREVIVEU'} (exit {r}){' sem verificação' if tira else ''}", flush=True)
        if r == 0: vivas.setdefault(nome, []).append('sem verifica' if tira else 'com verifica')
print("SOBREVIVERAM:", vivas)
sys.exit(1 if vivas else 0)
