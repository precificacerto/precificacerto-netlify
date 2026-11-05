#!/usr/bin/env python3
"""
HARNESS de várias montagens por remetente — as MUTAÇÕES da migração 20261105000001. NÃO TOCA PRODUÇÃO.

Cada mutação estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório nunca é escrito) e roda `run.sh`
sobre ela. As V têm de ser barradas pela verificação de dentro da migração; as B tiram a verificação junto, para
provar que o CASO (ou o contraste), sozinho, também pega. M0 é o controle e tem de sair verde.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py V1 B1      (só estas)
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261105000001_varias_montagens_por_remetente.sql')

DROP = "DROP INDEX IF EXISTS public.orcamentista_levantamento_um_em_montagem;\n"
V1 = "  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_levantamento_um_em_montagem') THEN\n    RAISE EXCEPTION 'verificacao 1"
GUARDA_DEF = "  IF def IS NOT NULL AND def <> "
GUARDA_DEP = "  IF to_regclass('public.orcamentista_levantamento') IS NULL THEN\n    RAISE EXCEPTION 'dependencia ausente"
V5 = "  IF n <> 3 THEN\n    RAISE EXCEPTION 'verificacao 5"
COMENTARIO = "Varios EM_MONTAGEM por remetente desde 20261105000001"
NOME_KEY = "    'orcamentista_levantamento_nome_key|UNIQUE (tenant_id, remetente_id, nome_normalizado)',\n"

MUTACOES = [
    ('V1', 'sem o DROP INDEX (a migração não faz nada)', [(DROP, '')], 'verificacao 1', False),
    ('B1', 'sem o DROP E sem as verificações 1 e 5 — o CASO 1 tem de pegar sozinho', [(DROP, ''), (V1, "  IF false THEN\n    RAISE EXCEPTION 'verificacao 1"), (V5, "  IF false THEN\n    RAISE EXCEPTION 'verificacao 5")], 'violates unique constraint "orcamentista_levantamento_um_em_montagem"', False),
    ('V2', 'derruba o índice de OUTRA definição às cegas (a guarda não compara a definição)', [(GUARDA_DEF, "  IF false AND def <> ")], 'FALHOU contraste 1', False),
    ('V3', 'sem a guarda da dependência (sem a tabela, o erro é outro)', [(GUARDA_DEP, "  IF false THEN\n    RAISE EXCEPTION 'dependencia ausente")], 'FALHOU contraste 2', False),
    ('V4', 'a verificação 5 aceita 4 índices (um índice a mais passa)', [(V5, "  IF n <> 3 AND n <> 4 THEN\n    RAISE EXCEPTION 'verificacao 5")], 'FALHOU contraste 3', False),
    ('V5', 'a verificação 2 espera o nome_key por TENANT (a definição medida está errada na lista)', [(NOME_KEY, "    'orcamentista_levantamento_nome_key|UNIQUE (tenant_id, nome_normalizado)',\n")], 'verificacao 2', False),
    ('V6', 'LIMITE DECLARADO: a lista da verificação 2 esquece o nome_key — a 3 conta 6 no banco e não vê a lista encurtada; a migração passa. Quem pega é o caso 3 do harness, que exercita a UNIQUE de fato', [(NOME_KEY, '')], None, False),
    ('V7', 'o comentário da tabela não é atualizado', [(COMENTARIO, 'Varios EM_MONTAGEM por remetente')], 'FALHOU: caso 7', False),
    ('M0', 'CONTROLE: nada muda', [], None, False),
]


def mutar(texto, trocas):
    for velho, novo in trocas:
        n = texto.count(velho)
        if n != 1:
            raise SystemExit(f'o trecho a mutar aparece {n} vez(es) — a migração mudou e a mutação precisa ser revista: {velho[:80]!r}')
        texto = texto.replace(velho, novo)
    return texto


def main():
    pedidas = set(sys.argv[1:])
    original = open(MIG, encoding='utf-8').read()
    falhas = 0
    with tempfile.TemporaryDirectory() as tmp:
        copia = os.path.join(tmp, 'mutada.sql')
        for ident, descricao, trocas, espera, _so_aplicar in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            open(copia, 'w', encoding='utf-8').write(mutar(original, trocas))
            p = subprocess.run(['bash', os.path.join(AQUI, 'run.sh'), copia], capture_output=True, text=True, env=dict(os.environ, HARNESS_DB='harness_varias_montagens_mut'))
            saida = p.stdout + p.stderr
            if ident == 'M0':
                ok = p.returncode == 0
                falhas += 0 if ok else 1
                print(f"{'VERDE        ' if ok else 'VERMELHO(!)  '} {ident:4} {descricao}  [{saida.strip().splitlines()[-1]}]")
                continue
            if espera is None:
                # V6 é a mutação que o harness NÃO enxerga por desenho: ela é documentada como VERDE ESPERADO — o limite do instrumento
                ok = p.returncode == 0
                print(f"{'VERDE (limite declarado)' if ok else 'VERMELHO(?) '} {ident:4} {descricao}")
                continue
            derrubou = p.returncode != 0 and espera in saida
            falhas += 0 if derrubou else 1
            linha = next((l for l in saida.splitlines() if espera in l), '')
            print(f"{'VERMELHO     ' if derrubou else 'NAO DERRUBOU '} {ident:4} {descricao}")
            print('      caiu: ' + linha.strip()[:200] if derrubou else '      esperado na saída: ' + espera)
            if not derrubou:
                print('      ' + '\n      '.join(l for l in saida.splitlines() if 'FALHOU' in l or 'ERRO' in l or 'casos ok' in l or 'ABORTOU' in l))
    if open(MIG, encoding='utf-8').read() != original:
        raise SystemExit('o arquivo da migração foi alterado durante as mutações — isto não deveria acontecer')
    print(f'{falhas} mutação(ões) que NÃO fizeram o que deviam')
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
