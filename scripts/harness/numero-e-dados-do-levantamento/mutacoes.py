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
    ('B1', 'o contador não avança (o mesmo número duas vezes)', 'DO UPDATE SET ultimo = c.ultimo + 1', 'DO UPDATE SET ultimo = c.ultimo'),
    ('B2', 'o número informado no insert é aceito', "    IF NEW.numero IS NOT NULL THEN\n      RAISE EXCEPTION 'o numero do levantamento e dado pelo banco",
     "    IF false THEN\n      RAISE EXCEPTION 'o numero do levantamento e dado pelo banco"),
    ('B3', 'o número muda no update', 'IF NEW.numero IS DISTINCT FROM OLD.numero OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN',
     'IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN'),
    ('B4', 'o número é o maior + 1 (reaproveita o apagado)',
     "    INSERT INTO public.orcamentista_levantamento_contador AS c (tenant_id, ultimo) VALUES (NEW.tenant_id, 1)\n      ON CONFLICT (tenant_id) DO UPDATE SET ultimo = c.ultimo + 1\n      RETURNING c.ultimo INTO NEW.numero;",
     "    SELECT coalesce(max(l.numero), 0) + 1 INTO NEW.numero FROM public.orcamentista_levantamento l WHERE l.tenant_id = NEW.tenant_id;"),
    ('B5', 'o gatilho só no insert (o update do número passa)', 'BEFORE INSERT OR UPDATE OF numero, tenant_id ON', 'BEFORE INSERT ON'),
    ('B6', 'sem a UNIQUE do número por empresa', '  ADD CONSTRAINT orcamentista_levantamento_numero_key UNIQUE (tenant_id, numero),\n', ''),
    ('B7', 'o modo aceita outro valor', "comissao_modo IN ('PROPORCIONAL', 'CONGELADA')", "comissao_modo IN ('PROPORCIONAL', 'CONGELADA', 'INSTALLMENT')"),
    ('B8', 'a comissão até 1000', 'comissao_percentual >= 0 AND comissao_percentual <= 100', 'comissao_percentual >= 0 AND comissao_percentual <= 1000'),
    ('B9', 'o lucro aceita negativo', 'lucro_projetado_percentual >= 0 AND lucro_projetado_percentual <= 100', 'lucro_projetado_percentual >= -100 AND lucro_projetado_percentual <= 100'),
    ('B10', 'o telefone aceita espaço nas pontas', "telefone IS NULL OR (telefone ~ '^\\S(.*\\S)?$' AND", "telefone IS NULL OR (telefone ~ '.*' AND"),
    ('B11', 'o telefone até 41', 'char_length(telefone) <= 40', 'char_length(telefone) <= 41'),
    ('B12', 'o e-mail sem a forma', "email IS NULL OR (email ~ '^[^@\\s]+@[^@\\s]+$' AND", "email IS NULL OR (email ~ '.' AND"),
    ('B13', 'a data de entrega como texto', 'ADD COLUMN IF NOT EXISTS data_entrega date,', 'ADD COLUMN IF NOT EXISTS data_entrega text,'),
    ('B14', 'a comissão com DEFAULT 0', 'ADD COLUMN IF NOT EXISTS comissao_percentual numeric,', 'ADD COLUMN IF NOT EXISTS comissao_percentual numeric DEFAULT 0,'),
    ('B15', 'os ambientes aceitam a lista vazia', "IF jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) = 0 THEN RETURN false; END IF;", "IF jsonb_typeof(p) <> 'array' THEN RETURN false; END IF;"),
    ('B16', 'a quantidade do ambiente aceita zero', 'v_qtd < 1 OR', 'v_qtd < 0 OR'),
    ('B17', 'a quantidade do ambiente aceita decimal', 'IF v_qtd <> trunc(v_qtd) OR', 'IF false OR'),
    ('B18', 'o ambiente aceita chave a mais', "IF v_chaves IS DISTINCT FROM ARRAY['ambiente', 'quantidade'] THEN RETURN false; END IF;",
     "IF NOT (v_chaves @> ARRAY['ambiente', 'quantidade']) THEN RETURN false; END IF;"),
    ('B19', 'o nome do ambiente sem limite', ' OR char_length(v_nome) > 80 THEN', ' THEN'),
    ('B20', 'a obs do item aceita vazio', "obs IS NULL OR (obs ~ '^\\S(.*\\S)?$' AND", "obs IS NULL OR (obs ~ '.*' AND"),
    ('B21', 'as funções sem REVOKE do authenticated', 'REVOKE ALL ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) FROM PUBLIC, anon, authenticated;',
     'REVOKE ALL ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) FROM PUBLIC;'),
    # o GRANT ao service_role é redundante onde o privilégio padrão já o dá (produção e este harness): a mutação que importa é TIRAR o EXECUTE
    ('B22', 'a função dos ambientes sem EXECUTE para o service_role (a CHECK falha na gravação da conversa)',
     'GRANT EXECUTE ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) TO service_role;',
     'REVOKE EXECUTE ON FUNCTION public.orcamentista_levantamento_ambientes_validos(jsonb) FROM service_role;'),
    ('B23', 'o contador sem REVOKE do authenticated', 'REVOKE ALL ON TABLE public.orcamentista_levantamento_contador FROM PUBLIC, anon, authenticated;',
     'REVOKE ALL ON TABLE public.orcamentista_levantamento_contador FROM PUBLIC;'),
    ('B24', 'o contador sem RLS', 'ALTER TABLE public.orcamentista_levantamento_contador ENABLE ROW LEVEL SECURITY;\n', ''),
    ('B25', 'o apagamento não loga os itens', "      VALUES (r.tenant_id, 'orcamentista_levantamento_item', r.id::text, to_jsonb(r) || v_marca, NULL, NULL);",
     "      SELECT r.tenant_id, 'x', 'x', NULL::jsonb, NULL::jsonb, NULL::uuid WHERE false;"),
    ('B26', 'o apagamento não tira a pergunta em aberto que cita', '  DELETE FROM public.orcamentista_pergunta_em_aberto p WHERE p.levantamentos && v_ids;\n', ''),
    ('B27', 'o log sem a marca da remoção', "to_jsonb(r) || v_marca, NULL, NULL);\n    RAISE NOTICE '20261106000002 apagou o levantamento",
     "to_jsonb(r), NULL, NULL);\n    RAISE NOTICE '20261106000002 apagou o levantamento"),
    ('G1', 'a guarda sem o "fora dos 5"', "  IF v_achado IS NOT NULL THEN\n    RAISE EXCEPTION 'ha levantamento fora dos 5", "  IF false THEN\n    RAISE EXCEPTION 'ha levantamento fora dos 5"),
    ('G2', 'a guarda sem a empresa', "  IF v_achado IS NOT NULL THEN\n    RAISE EXCEPTION 'levantamento medido com outra empresa", "  IF false THEN\n    RAISE EXCEPTION 'levantamento medido com outra empresa"),
    ('G3', 'a guarda sem a contagem dos itens', '  IF v_n <> 11 THEN\n    RAISE EXCEPTION \'os 5 levantamentos tem', '  IF false THEN\n    RAISE EXCEPTION \'os 5 levantamentos tem'),
    ('G4', 'a guarda sem o tipo da coluna', '    IF FOUND AND v_tipo <> r.tipo THEN', '    IF false THEN'),
    ('G5', 'a guarda sem o corpo da função', '    IF FOUND AND v_achado <> r.md5 THEN', '    IF false THEN'),
    ('G6', 'a guarda sem a dependência (avisa e segue)', "    RAISE EXCEPTION 'dependencia ausente no banco", "    RAISE NOTICE 'dependencia ausente no banco"),
    ('G7', 'a guarda compara o md5 COM o \\r', "SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_achado", 'SELECT md5(p.prosrc) INTO v_achado'),
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
