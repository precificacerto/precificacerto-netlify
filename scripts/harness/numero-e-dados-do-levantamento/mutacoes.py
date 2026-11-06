#!/usr/bin/env python3
"""
As MUTAÇÕES da 20261106000002. Cada uma estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório não é tocado) e roda o run.sh
contra a cópia. Morta = o harness vermelho (sai diferente de 0).

DUAS PASSADAS: (A) a migração inteira; (B) a migração SEM o bloco $verifica$ — porque a verificação final pega muita coisa sozinha, e a
mutação tem de morrer também pelos casos, não só por ela. As mutações da guarda e da verificação (G e V) só rodam na passada em que o
alvo existe; as outras rodam nas duas.

Uso:   python3 -B mutacoes.py            (todas, nas duas passadas)
       python3 -B mutacoes.py B1 G2      (só estas)
"""
import os, re, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261106000002_numero_cliente_e_percentuais_do_levantamento.sql')

# (id, descrição, trecho, troca)
MUTACOES = [
    # o número dos novos
    ('B1', 'o contador não avança (o mesmo número duas vezes)', 'DO UPDATE SET proximo = c.proximo + 1', 'DO UPDATE SET proximo = c.proximo'),
    ('B2', 'o número informado no insert é aceito', "    IF NEW.numero IS NOT NULL THEN\n      RAISE EXCEPTION 'o numero do levantamento e dado pelo banco",
     "    IF false THEN\n      RAISE EXCEPTION 'o numero do levantamento e dado pelo banco"),
    ('B3', 'o número muda no update', 'IF NEW.numero IS DISTINCT FROM OLD.numero OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN',
     'IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN'),
    ('B4', 'o número é o maior + 1 (reaproveita o apagado)',
     "    INSERT INTO public.orcamentista_levantamento_contador AS c (tenant_id, proximo) VALUES (NEW.tenant_id, 2)\n      ON CONFLICT (tenant_id) DO UPDATE SET proximo = c.proximo + 1\n      RETURNING c.proximo - 1 INTO NEW.numero;",
     "    SELECT coalesce(max(l.numero), 0) + 1 INTO NEW.numero FROM public.orcamentista_levantamento l WHERE l.tenant_id = NEW.tenant_id;"),
    ('B5', 'o gatilho só no insert (o update do número passa)', 'BEFORE INSERT OR UPDATE OF numero, tenant_id ON', 'BEFORE INSERT ON'),
    ('B6', 'sem a UNIQUE do número por empresa', '  ADD CONSTRAINT orcamentista_levantamento_numero_key UNIQUE (tenant_id, numero),\n', ''),
    ('B7', 'a empresa nova começa em 2', 'VALUES (NEW.tenant_id, 2)', 'VALUES (NEW.tenant_id, 3)'),
    # o número dos que existiam
    ('N1', 'os de antes numerados pelo id, não por criado_em', 'ORDER BY l.criado_em, l.id', 'ORDER BY l.id'),
    ('N2', 'os de antes numerados sem separar por empresa', 'row_number() OVER (PARTITION BY l.tenant_id ORDER BY', 'row_number() OVER (ORDER BY'),
    ('N3', 'o empate de criado_em sem desempate', 'ORDER BY l.criado_em, l.id)', 'ORDER BY l.criado_em, l.id DESC)'),
    ('N4', 'os de antes não recebem número (a guarda pega)', '    UPDATE public.orcamentista_levantamento l SET numero = r.n WHERE l.id = r.id AND l.numero IS NULL;\n    GET DIAGNOSTICS v_n = ROW_COUNT;\n    IF v_n <> 1 THEN',
     '    v_n := 1;\n    IF v_n <> 1 THEN'),
    ('N5', 'a numeração não loga', "              jsonb_build_object('numero', r.n, 'preenchimento', '20261106000002'), NULL);",
     "              jsonb_build_object('numero', r.n, 'preenchimento', '20261106000002'), NULL) ON CONFLICT DO NOTHING RETURNING 1 INTO v_n;\n    DELETE FROM public.superadmin_alteracao_log WHERE chave = r.id::text;"),
    ('N6', 'a numeração reescreve outra coluna (atualizado_em)', 'SET numero = r.n WHERE l.id = r.id', 'SET numero = r.n, atualizado_em = now() WHERE l.id = r.id'),
    ('N7', 'o contador semeado no maior (não no próximo)', 'SELECT l.tenant_id, max(l.numero) + 1 FROM', 'SELECT l.tenant_id, max(l.numero) FROM'),
    ('N8', 'o contador recua na reaplicação', 'ON CONFLICT (tenant_id) DO UPDATE SET proximo = greatest(c.proximo, excluded.proximo);',
     'ON CONFLICT (tenant_id) DO UPDATE SET proximo = excluded.proximo;'),
    ('N9', 'o contador não é semeado', "INSERT INTO public.orcamentista_levantamento_contador AS c (tenant_id, proximo)\n  SELECT l.tenant_id, max(l.numero) + 1 FROM public.orcamentista_levantamento l GROUP BY l.tenant_id",
     "INSERT INTO public.orcamentista_levantamento_contador AS c (tenant_id, proximo)\n  SELECT l.tenant_id, max(l.numero) + 1 FROM public.orcamentista_levantamento l WHERE false GROUP BY l.tenant_id"),
    # a forma
    ('F1', 'o modo aceita outro valor', "comissao_modo IN ('PROPORCIONAL', 'CONGELADA')", "comissao_modo IN ('PROPORCIONAL', 'CONGELADA', 'INSTALLMENT')"),
    ('F2', 'a comissão até 1000', 'comissao_percentual >= 0 AND comissao_percentual <= 100', 'comissao_percentual >= 0 AND comissao_percentual <= 1000'),
    ('F3', 'o lucro aceita negativo', 'lucro_projetado_percentual >= 0 AND lucro_projetado_percentual <= 100', 'lucro_projetado_percentual >= -100 AND lucro_projetado_percentual <= 100'),
    ('F4', 'o telefone aceita espaço nas pontas', "telefone IS NULL OR (telefone ~ '^\\S(.*\\S)?$' AND", "telefone IS NULL OR (telefone ~ '.*' AND"),
    ('F5', 'o telefone até 41', 'char_length(telefone) <= 40', 'char_length(telefone) <= 41'),
    ('F6', 'o e-mail sem a forma', "email IS NULL OR (email ~ '^[^@\\s]+@[^@\\s]+$' AND", "email IS NULL OR (email ~ '.' AND"),
    ('F7', 'a data de entrega como texto', 'ADD COLUMN IF NOT EXISTS data_entrega date,', 'ADD COLUMN IF NOT EXISTS data_entrega text,'),
    ('F8', 'a comissão com DEFAULT 0', 'ADD COLUMN IF NOT EXISTS comissao_percentual numeric,', 'ADD COLUMN IF NOT EXISTS comissao_percentual numeric DEFAULT 0,'),
    ('F9', 'a obs do item aceita vazio', "obs IS NULL OR (obs ~ '^\\S(.*\\S)?$' AND", "obs IS NULL OR (obs ~ '.*' AND"),
    # os ambientes
    ('A1', 'os ambientes aceitam a lista vazia', "IF jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) = 0 THEN RETURN false; END IF;", "IF jsonb_typeof(p) <> 'array' THEN RETURN false; END IF;"),
    ('A2', 'a quantidade do ambiente aceita zero', 'v_qtd < 1 OR', 'v_qtd < 0 OR'),
    ('A3', 'a quantidade do ambiente aceita decimal', 'IF v_qtd <> trunc(v_qtd) OR', 'IF false OR'),
    ('A4', 'o ambiente aceita chave a mais', "IF v_chaves IS DISTINCT FROM ARRAY['ambiente', 'quantidade'] THEN RETURN false; END IF;",
     "IF NOT (v_chaves @> ARRAY['ambiente', 'quantidade']) THEN RETURN false; END IF;"),
    ('A5', 'o nome do ambiente sem limite', ' OR char_length(v_nome) > 80 THEN', ' THEN'),
    ('A6', 'o mesmo ambiente duas vezes passa', '    IF lower(v_nome) = ANY (v_nomes) THEN RETURN false; END IF;\n', ''),
    ('A7', 'o mesmo ambiente comparado com a caixa (Cozinha e cozinha seriam dois)', '    IF lower(v_nome) = ANY (v_nomes) THEN RETURN false; END IF;\n    v_nomes := v_nomes || lower(v_nome);',
     '    IF v_nome = ANY (v_nomes) THEN RETURN false; END IF;\n    v_nomes := v_nomes || v_nome;'),
    # os privilégios
    ('P1', 'as funções sem REVOKE do authenticated', 'REVOKE ALL ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) FROM PUBLIC, anon, authenticated;',
     'REVOKE ALL ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) FROM PUBLIC;'),
    # o GRANT ao service_role é redundante onde o privilégio padrão já o dá (produção e este harness): a mutação que importa é TIRAR o EXECUTE
    ('P2', 'a função dos ambientes sem EXECUTE para o service_role (a CHECK falha na gravação da conversa)',
     'GRANT EXECUTE ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) TO service_role;',
     'REVOKE EXECUTE ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) FROM service_role;'),
    ('P3', 'o contador sem REVOKE do authenticated', 'REVOKE ALL ON TABLE public.orcamentista_levantamento_contador FROM PUBLIC, anon, authenticated;',
     'REVOKE ALL ON TABLE public.orcamentista_levantamento_contador FROM PUBLIC;'),
    ('P4', 'o contador sem RLS', 'ALTER TABLE public.orcamentista_levantamento_contador ENABLE ROW LEVEL SECURITY;\n', ''),
    # a guarda e a verificação
    ('G1', 'a guarda sem o tipo da coluna', '    IF FOUND AND v_tipo <> r.tipo THEN', '    IF false THEN'),
    ('G2', 'a guarda sem o estado parcial do número', "  IF FOUND AND (v_nula <> 'NO' OR NOT EXISTS", "  IF false AND (v_nula <> 'NO' OR NOT EXISTS"),
    ('G3', 'a guarda sem o corpo da função', '    IF FOUND AND v_achado <> r.md5 THEN', '    IF false THEN'),
    ('G4', 'a guarda sem a dependência (avisa e segue)', "    RAISE EXCEPTION 'dependencia ausente no banco", "    RAISE NOTICE 'dependencia ausente no banco"),
    ('G5', 'a guarda compara o md5 COM o \\r', "SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_achado", 'SELECT md5(p.prosrc) INTO v_achado'),
    ('V1', 'a verificação 3 compara o md5 COM o \\r', "(SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_proc p WHERE p.oid = to_regprocedure('public.orcamentista_levantamento_numerar()'))",
     "(SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid = to_regprocedure('public.orcamentista_levantamento_numerar()'))"),
]


def sem_verifica(s):
    i = s.index('DO $verifica$'); j = s.index('$verifica$;', i) + len('$verifica$;')
    return s[:i] + s[j:]


def roda(conteudo):
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as f:
        f.write(conteudo); nome = f.name
    try:
        p = subprocess.run(['bash', os.path.join(AQUI, 'run.sh'), nome], capture_output=True, text=True,
                           env={**os.environ, 'HARNESS_DB': 'harness_numero_levantamento_mut'})
        return p.returncode, p.stdout
    finally:
        os.unlink(nome)


def main():
    pedidas = set(sys.argv[1:])
    original = open(MIG, encoding='utf-8').read()
    vivas = 0
    for passada, base in (('A', original), ('B', sem_verifica(original))):
        if not pedidas or 'M0' in pedidas:
            rc, _ = roda(base)
            print(f"{'verde   ' if rc == 0 else 'VERMELHO'} {passada} M0: CONTROLE: nada muda", flush=True)
            vivas += 0 if rc == 0 else 1
        for ident, descricao, velho, novo in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            if ident.startswith('V') and passada == 'B':
                continue
            n = base.count(velho)
            if n != 1:
                raise SystemExit(f'{ident} ({passada}): o trecho aparece {n} vez(es) — a mutação precisa ser revista')
            rc, saida = roda(base.replace(velho, novo))
            morta = rc != 0
            falhas = [l for l in saida.splitlines() if l.startswith(('FALHOU', 'ERRO NAO PREVISTO', 'BASE FALHOU'))]
            print(f"{'morta   ' if morta else 'VIVA    '} {passada} {ident}: {descricao}" + (f"  [{falhas[0][:110]}]" if falhas else ''), flush=True)
            vivas += 0 if morta else 1
    print('todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho')
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
