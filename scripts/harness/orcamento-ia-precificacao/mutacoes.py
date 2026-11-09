#!/usr/bin/env python3
"""
As MUTAÇÕES da migração 20261109000002 (a provisão da precificação do orçamento I.A.). Cada uma estraga UMA coisa numa CÓPIA do .sql (nunca no
arquivo da árvore), roda o run.sh com a cópia e anota: morta = o run.sh falhou (um caso, um contraste ou a verificação da própria migração).
M0 é o controle. Quando a mutação muda uma CHECK, muda também a linha da verificação que a descreve, para que seja o CASO a matar, não a
verificação.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py N3 V2      (só estas)
"""
import os, re, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261109000002_orcamento_ia_precificacao.sql')

CHECKS = ['item_valores_nao_negativos', 'item_percentuais_na_faixa', 'item_liquido_derivado', 'item_fabricacao_derivada', 'item_total_derivado',
          'percentuais_na_faixa', 'comissao_modo_valido', 'valores_nao_negativos', 'liquido_derivado', 'venda_derivada',
          'aproveitamento_modo_valido', 'aproveitamento_origem_valida', 'aproveitamento_inteiro', 'aproveitamento_motivo',
          'aproveitamento_motivo_forma', 'aproveitamento_por', 'aproveitamento_fallback']


def neutraliza(nome):
    """A CHECK vira CHECK (true) nas duas listas (a que cria e a que a verificação compara)."""
    def f(texto):
        padrao = re.compile(r"(\|orcamentista_orcamento_" + re.escape(nome) + r"\|)CHECK [^\n]*?(',?\n)")
        novo, n = padrao.subn(lambda m: m.group(1) + 'CHECK (true)' + m.group(2), texto)
        if n != 2:
            raise SystemExit(f'N {nome}: {n} ocorrencia(s), e deviam ser 2')
        return novo
    return f


def troca(*pares):
    def f(texto):
        for velho, novo in pares:
            if texto.count(velho) != 1:
                raise SystemExit(f'o trecho aparece {texto.count(velho)} vez(es): {velho[:70]}')
            texto = texto.replace(velho, novo)
        return texto
    return f


MUTACOES = [(f'N{i + 1}', f'a CHECK {c} vira CHECK (true)', neutraliza(c)) for i, c in enumerate(CHECKS)] + [
    ('D1', 'cred_icms_pct ganha DEFAULT 0 e a verificação 1 deixa de olhar o default',
     troca(("cred_icms_pct           numeric NULL,", "cred_icms_pct           numeric NULL DEFAULT 0,"),
           ("AND is_nullable = 'YES' AND column_default IS NULL AND numeric_precision IS NULL", "AND is_nullable = 'YES' AND numeric_precision IS NULL"),
           ("and column_default is not null order by 1, 2;", "and column_default is not null order by 1, 2; "))),
    ('D2', 'valor_venda nasce NOT NULL DEFAULT 0 e a verificação 1 aceita', troca(
        ("valor_venda                 numeric NULL;", "valor_venda                 numeric NOT NULL DEFAULT 0;"),
        ("AND is_nullable = 'YES' AND column_default IS NULL AND numeric_precision IS NULL", "AND numeric_precision IS NULL"))),
    ('F1', 'o percentual 100 deixa de valer (<= 100 vira < 100 no item)', troca(
        ("((cred_icms_pct >= 0) AND (cred_icms_pct <= 100))", "((cred_icms_pct >= 0) AND (cred_icms_pct < 100))"),
        ("((cred_icms_pct >= (0)::numeric) AND (cred_icms_pct <= (100)::numeric))", "((cred_icms_pct >= (0)::numeric) AND (cred_icms_pct < (100)::numeric))"))),
    ('F2', 'o fallback passa a exigir COM', troca(
        ("OR (aproveitamento_modo = ''SEM''::text))'\n  ];\n  e text;", "OR (aproveitamento_modo = ''COM''::text))'\n  ];\n  e text;"),
        ("OR (aproveitamento_modo = ''SEM''::text)))'", "OR (aproveitamento_modo = ''COM''::text)))'"))),
    ('F3', 'o motivo aceita 501', troca(
        ("(char_length(aproveitamento_motivo) <= 500)))',\n    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_por|CHECK ((NOT", "(char_length(aproveitamento_motivo) <= 501)))',\n    'orcamentista_orcamento|orcamentista_orcamento_aproveitamento_por|CHECK ((NOT"),
        ("(char_length(aproveitamento_motivo) <= 500))))'", "(char_length(aproveitamento_motivo) <= 501))))'"))),
    ('G1', 'a guarda não confere as duas tabelas', troca(("  IF to_regclass('public.orcamentista_orcamento') IS NULL OR to_regclass('public.orcamentista_orcamento_item') IS NULL THEN", "  IF false THEN"))),
    ('G2', 'a guarda não confere a CHECK origem_amarrada', troca(("  IF NOT EXISTS (SELECT 1 FROM pg_constraint\n                  WHERE conrelid = to_regclass('public.orcamentista_orcamento') AND conname = 'orcamentista_orcamento_origem_amarrada') THEN", "  IF false THEN"))),
    ('V1', 'a verificação 1 deixa de olhar o default', troca(("AND is_nullable = 'YES' AND column_default IS NULL AND numeric_precision IS NULL", "AND is_nullable = 'YES' AND numeric_precision IS NULL"))),
    ('V3', 'a verificação 3 desligada', troca(("  IF faltam IS NOT NULL THEN\n    RAISE EXCEPTION 'verificacao 3:", "  IF false AND faltam IS NOT NULL THEN\n    RAISE EXCEPTION 'verificacao 3:"))),
    ('V4', 'a verificação 4 desligada', troca(("  IF n <> 40 THEN", "  IF false AND n <> 40 THEN"))),
    ('V5', 'a verificação 5 desligada', troca(("  IF n <> 0 THEN\n    RAISE EXCEPTION 'verificacao 5:", "  IF false AND n <> 0 THEN\n    RAISE EXCEPTION 'verificacao 5:"))),
    ('V6', 'a verificação 6 desligada', troca(("  IF faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN", "  IF false AND faltam IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN"))),
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
    for ident, descricao, mutar in MUTACOES:
        if pedidas and ident not in pedidas:
            continue
        texto = mutar(original)
        assert texto != original, ident
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
