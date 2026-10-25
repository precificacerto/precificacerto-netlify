#!/usr/bin/env python3
"""
HARNESS do levantamento por nome — as MUTAÇÕES da migração 20261025000003. NÃO TOCA PRODUÇÃO.

Cada mutação estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório nunca é escrito) e
roda `run.sh` sobre ela. As V têm de ser barradas pela verificação de dentro da migração; as B tiram a
verificação junto, para provar que o CASO, sozinho, também pega. M0 é o controle e tem de sair verde.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py V1 B1      (só estas)
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261025000003_levantamento_por_nome.sql')

REVOKE_ITEM = "REVOKE ALL ON public.orcamentista_levantamento_item FROM PUBLIC, anon, authenticated;\n"
RLS = "ALTER TABLE public.orcamentista_levantamento ENABLE ROW LEVEL SECURITY;\n"
PARCIAL = "  ON public.orcamentista_levantamento (tenant_id, remetente_id)\n  WHERE estado = 'EM_MONTAGEM';"
NOME = "UNIQUE (tenant_id, remetente_id, nome_normalizado)\n);"
ESTADO = "CHECK (estado IN ('EM_MONTAGEM', 'COMPLETO')),"
FK_ITEM = "FOREIGN KEY (levantamento_id, tenant_id)\n    REFERENCES public.orcamentista_levantamento (id, tenant_id) ON DELETE CASCADE,"
FK_REM = "FOREIGN KEY (remetente_id, tenant_id)\n    REFERENCES public.orcamentista_remetente_autorizado (id, tenant_id),"
V1 = "  IF faltam IS NOT NULL THEN\n    RAISE EXCEPTION 'verificacao 1"
V2 = "  IF NOT EXISTS (SELECT 1 FROM pg_indexes"

MUTACOES = [
    ('V1', 'sem o REVOKE do item (os DEFAULT PRIVILEGES abrem para anon)', [(REVOKE_ITEM, '')], 'verificacao 5', False),
    ('B1', 'sem o REVOKE E sem a verificação 5 — o CASO tem de pegar sozinho', [(REVOKE_ITEM, ''), ("RAISE EXCEPTION 'verificacao 5:", "RAISE NOTICE 'verificacao 5:")], 'FALHOU: caso 12', False),
    ('V2', 'sem RLS no levantamento', [(RLS, '')], 'verificacao 3', False),
    ('V3', 'o índice de "um em montagem" sem o WHERE (vale para todo estado)', [(PARCIAL, "  ON public.orcamentista_levantamento (tenant_id, remetente_id);")], 'verificacao 2', False),
    ('B2', 'sem o WHERE E sem a verificação 2 — o CASO tem de pegar sozinho', [(PARCIAL, "  ON public.orcamentista_levantamento (tenant_id, remetente_id);"), (V2, "  IF false AND NOT EXISTS (SELECT 1 FROM pg_indexes")], 'violates unique constraint "orcamentista_levantamento_um_em_montagem"', False),
    ('V4', 'o nome único por TENANT, não por vendedor (contra a decisão 2)', [(NOME, "UNIQUE (tenant_id, nome_normalizado)\n);")], 'verificacao 1', False),
    ('B3', 'nome por tenant E sem a verificação 1 — o CASO tem de pegar sozinho', [(NOME, "UNIQUE (tenant_id, nome_normalizado)\n);"), (V1, "  IF false THEN\n    RAISE EXCEPTION 'verificacao 1")], 'violates unique constraint "orcamentista_levantamento_nome_key"', False),
    ('V5', "o estado aceita 'COMPLETA'", [(ESTADO, "CHECK (estado IN ('EM_MONTAGEM', 'COMPLETO', 'COMPLETA')),")], 'verificacao 1', False),
    ('B4', "aceita 'COMPLETA' E sem a verificação 1", [(ESTADO, "CHECK (estado IN ('EM_MONTAGEM', 'COMPLETO', 'COMPLETA')),"), (V1, "  IF false THEN\n    RAISE EXCEPTION 'verificacao 1")], 'FALHOU: caso 6', False),
    ('B5', 'a FK do remetente sem o tenant E sem a verificação 1', [(FK_REM, "FOREIGN KEY (remetente_id)\n    REFERENCES public.orcamentista_remetente_autorizado (id),"), (V1, "  IF false THEN\n    RAISE EXCEPTION 'verificacao 1")], 'FALHOU: caso 7', False),
    ('B6', 'a FK do item sem o tenant E sem a verificação 1', [(FK_ITEM, "FOREIGN KEY (levantamento_id)\n    REFERENCES public.orcamentista_levantamento (id) ON DELETE CASCADE,"), (V1, "  IF false THEN\n    RAISE EXCEPTION 'verificacao 1")], 'FALHOU: caso 8', False),
    ('B7', 'a FK do item sem CASCADE E sem a verificação 1', [(FK_ITEM, "FOREIGN KEY (levantamento_id, tenant_id)\n    REFERENCES public.orcamentista_levantamento (id, tenant_id),"), (V1, "  IF false THEN\n    RAISE EXCEPTION 'verificacao 1")], 'violates foreign key constraint "orcamentista_levantamento_item_levantamento_fkey"', False),
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
