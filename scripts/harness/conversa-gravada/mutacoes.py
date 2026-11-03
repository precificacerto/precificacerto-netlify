#!/usr/bin/env python3
"""Mutações da 20261103000003 (responde_a na mensagem e o índice da conversa): cada cópia estragada tem de derrubar um caso ou um
contraste (exit 1) ou abortar na base (exit 2). O CONTROLE (sem mutação) tem de passar (exit 0). A segunda passada tira o bloco
$verifica$ e exige que os CASOS e os CONTRASTES, sozinhos, derrubem cada mutação (ou que a base aborte)."""
import os, pathlib, re, subprocess, sys, tempfile

AQUI = pathlib.Path(__file__).resolve().parent
ORIG = (AQUI.parents[2] / "supabase/migrations/20261103000003_responde_a_na_mensagem.sql").read_text()

MUTACOES = [
    ("M1 a FK sem ON DELETE SET NULL", [("      FOREIGN KEY (responde_a) REFERENCES public.orcamentista_mensagem(id) ON DELETE SET NULL;", "      FOREIGN KEY (responde_a) REFERENCES public.orcamentista_mensagem(id);")]),
    ("M2 a FK não é criada", [("    ALTER TABLE public.orcamentista_mensagem ADD CONSTRAINT orcamentista_mensagem_responde_a_fkey\n      FOREIGN KEY (responde_a) REFERENCES public.orcamentista_mensagem(id) ON DELETE SET NULL;\n", "    PERFORM 1;\n")]),
    ("M3 a FK aponta a conversa", [("REFERENCES public.orcamentista_mensagem(id) ON DELETE SET NULL;", "REFERENCES public.orcamentista_conversa(id) ON DELETE SET NULL;")]),
    ("M4 a coluna text", [("ADD COLUMN IF NOT EXISTS responde_a uuid NULL;", "ADD COLUMN IF NOT EXISTS responde_a text NULL;")]),
    ("M5 a coluna NOT NULL", [("ADD COLUMN IF NOT EXISTS responde_a uuid NULL;", "ADD COLUMN IF NOT EXISTS responde_a uuid NOT NULL;")]),
    ("M6 a coluna sem IF NOT EXISTS (a segunda aplicação aborta)", [("ADD COLUMN IF NOT EXISTS responde_a uuid NULL;", "ADD COLUMN responde_a uuid NULL;")]),
    ("M7 o índice de responde_a sem ser parcial", [("  ON public.orcamentista_mensagem USING btree (responde_a) WHERE (responde_a IS NOT NULL);", "  ON public.orcamentista_mensagem USING btree (responde_a);")]),
    ("M8 o índice da conversa sem o criado_em DESC (só o contraste 3 o vê: em produção ele já existe)", [("  ON public.orcamentista_conversa USING btree (tenant_id, remetente_id, criado_em DESC);", "  ON public.orcamentista_conversa USING btree (tenant_id, remetente_id);")]),
    ("M9 o índice da conversa não é criado", [("CREATE INDEX IF NOT EXISTS orcamentista_conversa_remetente_idx\n  ON public.orcamentista_conversa USING btree (tenant_id, remetente_id, criado_em DESC);\n", "")]),
    ("M10 a guarda do tipo removida", [("  IF tipo IS NOT NULL AND tipo <> 'uuid' THEN\n", "  IF false THEN\n")]),
    ("M11 sem o comentário", [("COMMENT ON COLUMN public.orcamentista_mensagem.responde_a IS\n  'Na saida: a entrada a que ela responde (20261103000003). Nula na entrada, e na saida gravada antes desta migracao.';\n", "")]),
    ("M12 a guarda das tabelas removida (a base sem a conversa aborta de outro jeito, sem a frase)", [("  IF to_regclass('public.orcamentista_mensagem') IS NULL OR to_regclass('public.orcamentista_conversa') IS NULL THEN\n", "  IF false THEN\n")]),
]

def sem_verifica(t): return re.sub(r"DO \$verifica\$.*?\$verifica\$;\n", "", t, flags=re.S)

def rodar(t):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f: f.write(t)
    return subprocess.run(["bash", str(AQUI / "run.sh"), f.name], capture_output=True, text=True).returncode

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
        # M12 só faz sentido com a guarda; sem a base ter as tabelas o resto aborta de qualquer jeito — ela entra nas duas passadas mesmo assim
        r = rodar(aplicar(trocas, tira))
        print(f"  [{'sem' if tira else 'com'} verificação] {nome}: {'MORTA (exit ' + str(r) + ')' if r != 0 else 'VIVA'}", flush=True)
        if r == 0: vivas.setdefault(nome, []).append("sem" if tira else "com")
print("VIVAS:", vivas or "nenhuma")
sys.exit(1 if vivas else 0)
