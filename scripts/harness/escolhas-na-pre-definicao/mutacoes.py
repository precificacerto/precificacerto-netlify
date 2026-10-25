#!/usr/bin/env python3
"""
HARNESS da coluna escolhas — as MUTAÇÕES da migração 20261025000001. NÃO TOCA PRODUÇÃO.

Cada mutação estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório nunca é escrito) e
roda `run.sh` sobre ela. As V têm de ser barradas pela verificação de dentro da migração; as B tiram a
verificação junto, para provar que o CASO, sozinho, também pega. M0 é o controle e tem de sair verde.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py V1 B1      (só estas)
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261025000001_escolhas_na_pre_definicao.sql')

COLUNA = "ALTER TABLE public.orcamentista_pre_definicao ADD COLUMN IF NOT EXISTS escolhas jsonb;"
VERIF_COLUNA = "  IF v_tipo IS DISTINCT FROM 'jsonb' OR v_nulo IS DISTINCT FROM 'YES' OR v_padrao IS NOT NULL THEN"
VERIF_CHECK = "  IF NOT EXISTS (SELECT 1 FROM pg_constraint\n                  WHERE conrelid = 'public.orcamentista_pre_definicao'::regclass\n                    AND conname = 'orcamentista_pre_definicao_escolhas_objeto' AND contype = 'c') THEN"
CHECK = "      CHECK (escolhas IS NULL OR jsonb_typeof(escolhas) = 'object');"

MUTACOES = [
    ('V1', 'a coluna nasce com DEFAULT {} (afirma "perguntado e sem resposta")', [(COLUNA, COLUNA.replace('jsonb;', "jsonb DEFAULT '{}'::jsonb;"))], 'verificacao', False),
    ('B1', 'DEFAULT {} E sem a verificação da coluna — o CASO tem de pegar sozinho',
     [(COLUNA, COLUNA.replace('jsonb;', "jsonb DEFAULT '{}'::jsonb;")), (VERIF_COLUNA, "  IF false THEN")], 'FALHOU: caso 1', False),
    ('V2', 'a coluna nasce NOT NULL com DEFAULT {}', [(COLUNA, COLUNA.replace('jsonb;', "jsonb NOT NULL DEFAULT '{}'::jsonb;"))], 'verificacao', False),
    ('V3', 'a coluna é json, não jsonb', [(COLUNA, COLUNA.replace('jsonb;', 'json;')), (CHECK, "      CHECK (escolhas IS NULL OR json_typeof(escolhas) = 'object');")], 'verificacao', False),
    ('V4', 'sem a CHECK de objeto (uma CHECK vazia com o mesmo nome)', [(CHECK, "      CHECK (true);")], 'FALHOU: caso 3', False),
    ('B2', 'sem a CHECK E sem a verificação dela — o CASO tem de pegar sozinho',
     [(CHECK, "      CHECK (true);"), (VERIF_CHECK, "  IF false THEN")], 'FALHOU: caso 3', False),
    ('M0', 'CONTROLE: nada muda', [], None, False),
]


def mutar(texto, trocas):
    if callable(trocas):
        novo = trocas(texto)
        if novo == texto:
            raise SystemExit('a transformação não mudou nada — a mutação não exercitaria o que promete')
        return novo
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
        for ident, descricao, trocas, espera, so_aplicar, *ambiente in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            open(copia, 'w', encoding='utf-8').write(mutar(original, trocas))
            env = dict(os.environ)
            if so_aplicar:
                env['SO_APLICAR'] = '1'
            env.update(ambiente[0] if ambiente else {})
            p = subprocess.run(['bash', os.path.join(AQUI, 'run.sh'), copia], capture_output=True, text=True, env=env)
            saida = p.stdout + p.stderr
            if espera is None:   # o controle
                ok = p.returncode == 0
                falhas += 0 if ok else 1
                print(f"{'VERDE        ' if ok else 'VERMELHO(!)  '} {ident:4} {descricao}  [{saida.strip().splitlines()[-1]}]")
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
