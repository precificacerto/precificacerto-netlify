#!/usr/bin/env python3
"""Mutações da 20261027000009: cada cópia estragada tem de derrubar um caso (exit 1) ou abortar na base (exit 2).
O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco $verifica$ e exige que os CASOS, sozinhos, derrubem
cada mutação (ou que a base aborte)."""
import pathlib, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
O9 = (AQUI.parents[2] / "supabase/migrations/20261027000009_tira_perfil_exige_motor.sql").read_text()
DROP = "ALTER TABLE public.orcamentista_tabela DROP CONSTRAINT IF EXISTS orcamentista_tabela_perfil_exige_motor;"

MUTACOES = [
    ("9-1 a CHECK do Perfil não sai", DROP, "SELECT 1;"),
    ("9-2 sai a do par em vez da do Perfil", DROP, "ALTER TABLE public.orcamentista_tabela DROP CONSTRAINT IF EXISTS orcamentista_tabela_motor_par;"),
    ("9-3 saem as duas", DROP, DROP + "\nALTER TABLE public.orcamentista_tabela DROP CONSTRAINT IF EXISTS orcamentista_tabela_motor_par;"),
    ("9-4 apaga dado (zera o motor da Estrela)", DROP, DROP + "\nUPDATE public.orcamentista_tabela SET motor_path = NULL, motor_nome = NULL WHERE id = '5f7acebf-3c91-46de-af00-57a47f8be288';"),
    ("9-5 sai a trava da categoria junto", DROP, DROP + "\nDROP TRIGGER IF EXISTS orcamentista_tabela_categoria_guarda ON public.orcamentista_tabela;"),
    ("9-6 as colunas voltam a ser obrigatórias", DROP, DROP + "\nALTER TABLE public.orcamentista_tabela ALTER COLUMN motor_path SET NOT NULL;"),
    ("9-7 outra CHECK nasce (PERFIL exige o nome)", DROP, DROP + "\nALTER TABLE public.orcamentista_tabela DROP CONSTRAINT IF EXISTS orcamentista_tabela_perfil_exige_nome;\nALTER TABLE public.orcamentista_tabela ADD CONSTRAINT orcamentista_tabela_perfil_exige_nome CHECK (categoria_chave IS DISTINCT FROM 'PERFIL' OR motor_nome IS NOT NULL);"),
]

def sem_verifica(t):
    i = t.index("DO $verifica$"); j = t.index("$verifica$;", i) + len("$verifica$;")
    return t[:i] + t[j:]

def rodar(t):
    f = tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False); f.write(t); f.close()
    return subprocess.run(["bash", str(AQUI / "run.sh"), f.name], capture_output=True, text=True).returncode

c = rodar(O9)
print(f"CONTROLE (sem mutação): {'passa' if c == 0 else 'FALHOU exit ' + str(c)}")
vivas = []
for nome, de, para in MUTACOES:
    if O9.count(de) != 1:
        print(f"{nome}: TRECHO NAO ACHADO ({O9.count(de)}x)"); vivas.append(nome); continue
    r = rodar(O9.replace(de, para))
    print(f"{nome} {'MORTA' if r != 0 else 'SOBREVIVEU'} (exit {r})", flush=True)
    if r == 0: vivas.append(nome)
print("SOBREVIVERAM:", vivas)
print("--- sem a verificação (só os casos):")
c2 = rodar(sem_verifica(O9))
print(f"CONTROLE sem verificação: {'passa' if c2 == 0 else 'FALHOU exit ' + str(c2)}")
vivas2 = []
for nome, de, para in MUTACOES:
    r = rodar(sem_verifica(O9.replace(de, para)))
    print(f"{nome} {'MORTA pelos casos' if r == 1 else ('abortou na base' if r == 2 else 'SOBREVIVEU')} (exit {r})", flush=True)
    if r == 0: vivas2.append(nome)
print("SOBREVIVERAM sem verificação:", vivas2)
sys.exit(1 if (c != 0 or c2 != 0 or vivas or vivas2) else 0)
