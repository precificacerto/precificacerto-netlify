#!/usr/bin/env python3
"""
HARNESS do tempo no arquivo do motor — as MUTAÇÕES da migração 20261106000001. NÃO TOCA PRODUÇÃO.

Cada mutação estraga UMA coisa numa CÓPIA da migração (o arquivo do repositório nunca é escrito) e roda `run.sh` sobre ela, com a base
reaproveitada (REUSAR_BASE=1). As V têm de ser barradas pela GUARDA ou pela VERIFICAÇÃO de dentro da migração; as B estragam um CORPO e
desligam junto as duas conferências de md5 (a da guarda, na reaplicação, e a da verificação) — senão qualquer B morreria pelo md5 e não
provaria nada —, para provar que o CASO do harness, sozinho, pega. M0 é o controle e tem de sair verde.

Uso:   python3 -B mutacoes.py            (todas)
       python3 -B mutacoes.py B1 V2      (só estas)
"""
import os, subprocess, sys, tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..', '..'))
MIG = os.path.join(RAIZ, 'supabase', 'migrations', '20261106000001_tempo_de_fabricacao_no_arquivo_do_motor.sql')

# as duas conferências de md5, desligadas nas B
SEM_MD5 = [
    ("      IF achado NOT IN (r.antes, r.desta) THEN\n", "      IF false THEN\n"),
    ("\n                         AND md5(replace(p.prosrc, chr(13), '')) = r.desta) THEN\n", ") THEN\n"),
]
INSERT_TEMPOS = """  INSERT INTO public.orcamentista_motor_tipologia_tempo (motor_id, tipologia, tempo_fabricacao_min, tempo_origem, atualizado_por)
  SELECT v_motor, x.tipologia, x.tempo_fabricacao_min, x.tempo_origem, p_por
  FROM jsonb_to_recordset(coalesce(p_payload->'tempos', '[]'::jsonb)) AS x(tipologia text, tempo_fabricacao_min integer, tempo_origem text);
  GET DIAGNOSTICS v_tempos = ROW_COUNT;
"""
CHECK_ADD = "  CHECK (tempo_origem = btrim(tempo_origem) AND char_length(tempo_origem) BETWEEN 1 AND 120);\n"
CHECK_VERIFICA = "  IF def IS DISTINCT FROM $c$CHECK (((tempo_origem = btrim(tempo_origem)) AND ((char_length(tempo_origem) >= 1) AND (char_length(tempo_origem) <= 120))))$c$ THEN\n    RAISE EXCEPTION 'verificacao: a CHECK"
DROP_ADD = """ALTER TABLE public.orcamentista_motor_tipologia_tempo DROP CONSTRAINT IF EXISTS orcamentista_motor_tipologia_tempo_origem;
ALTER TABLE public.orcamentista_motor_tipologia_tempo ADD CONSTRAINT orcamentista_motor_tipologia_tempo_origem
  CHECK (tempo_origem = btrim(tempo_origem) AND char_length(tempo_origem) BETWEEN 1 AND 120);
"""
RECUSA_DA_TROCA = "  IF v_perdidos > 0 THEN\n"
EXISTE_NA_DETALHE = """             AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload->'detalhes') = 'array' THEN p_payload->'detalhes' ELSE '[]'::jsonb END) AS d(e)
                          WHERE d.e->>'tipologia' = t.tipologia)
"""
NAO_EXISTE_NOS_TEMPOS = """             AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload->'tempos') = 'array' THEN p_payload->'tempos' ELSE '[]'::jsonb END) AS x(e)
                              WHERE x.e->>'tipologia' = t.tipologia)) q;
"""
FORA_DA_DETALHE = "  IF v_msg IS NOT NULL THEN\n    RAISE EXCEPTION 'tempo de fabricacao para tipologia que nao esta na Detalhe"
REPETIDA = "  IF v_msg IS NOT NULL THEN\n    RAISE EXCEPTION 'a tipologia % tem mais de um tempo"
NAO_E_LISTA = "  IF p_payload ? 'tempos' AND jsonb_typeof(p_payload->'tempos') IS DISTINCT FROM 'array' THEN\n"
DECIMAL = "           WHEN (t.e->>'tempo_fabricacao_min')::numeric <> trunc((t.e->>'tempo_fabricacao_min')::numeric)\n             OR "
ORIGEM_120 = "OR char_length(t.e->>'tempo_origem') NOT BETWEEN 1 AND 120\n"
ESPACO = "           ELSE (t.e->>'tempo_origem') <> btrim(t.e->>'tempo_origem') OR "
RETORNO = "    'tempos',          v_tempos,\n"
GRANT_CRIAR = "GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb) TO service_role;\n"
GUARDA_CHECK = "    IF def IS NULL OR def NOT IN ("
GUARDA_INDICE = "    IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_motor_tipologia_tempo_tipologia_motor_key"
GUARDA_EXISTE = "    IF f IS NULL THEN\n      difere := difere || format(' %s nao existe;', r.assinatura);\n    ELSE\n"
GUARDA_CR = "      SELECT md5(replace(p.prosrc, chr(13), '')) INTO achado"

MUTACOES = [
    # ── os CORPOS, com o md5 desligado: o caso pega ──
    ('B1', 'criar não grava os tempos (o INSERT some; a contagem volta nula)', SEM_MD5 + [(INSERT_TEMPOS, '')], 'FALHOU caso T2'),
    ('B2', 'criar grava os tempos sem o autor', SEM_MD5 + [("  SELECT v_motor, x.tipologia, x.tempo_fabricacao_min, x.tempo_origem, p_por\n", "  SELECT v_motor, x.tipologia, x.tempo_fabricacao_min, x.tempo_origem, NULL\n")], 'FALHOU caso T2'),
    ('B3', 'criar não devolve a contagem dos tempos', SEM_MD5 + [(RETORNO, '')], 'FALHOU caso T2'),
    ('B4', 'criar aceita a lista que não é lista', SEM_MD5 + [(NAO_E_LISTA, "  IF false THEN\n")], 'FALHOU caso T4 (lista)'),
    ('B5', 'criar aceita minutos decimais (o banco dá 22P02 sem a frase)', SEM_MD5 + [(DECIMAL, "           WHEN ")], 'FALHOU caso T4 (decimal)'),
    ('B6', 'criar aceita a origem acima de 120 (a CHECK dá 23514 sem a frase)', SEM_MD5 + [(ORIGEM_120, "OR char_length(t.e->>'tempo_origem') NOT BETWEEN 1 AND 200\n")], 'FALHOU caso T4 (origem 121)'),
    ('B7', 'criar aceita a origem com espaço na ponta', SEM_MD5 + [(ESPACO, "           ELSE false OR ")], 'FALHOU caso T4 (origem com espaco)'),
    ('B8', 'criar aceita a tipologia repetida (o índice dá 23505 sem a frase)', SEM_MD5 + [(REPETIDA, "  IF false THEN\n    RAISE EXCEPTION 'a tipologia % tem mais de um tempo")], 'FALHOU caso T4 (repetida)'),
    ('B9', 'criar aceita tempo de tipologia fora da Detalhe', SEM_MD5 + [(FORA_DA_DETALHE, "  IF false THEN\n    RAISE EXCEPTION 'tempo de fabricacao para tipologia que nao esta na Detalhe")], 'FALHOU caso T4 (fora da Detalhe)'),
    ('B10', 'trocar não recusa a troca que perde tempo', SEM_MD5 + [(RECUSA_DA_TROCA, "  IF false THEN\n")], 'FALHOU caso T6'),
    ('B11', 'trocar conta como perda a tipologia que SAIU do arquivo', SEM_MD5 + [(EXISTE_NA_DETALHE, '')], 'ERRO NAO PREVISTO: a troca perderia 1 tempo(s) de fabricacao: o motor atual tem tempo para T2,'),
    ('B12', 'trocar recusa sempre que o antigo tem tempo (não olha os tempos do arquivo novo)', SEM_MD5 + [(NAO_EXISTE_NOS_TEMPOS, "              ) q;\n")], 'ERRO NAO PREVISTO: a troca perderia 2 tempo(s) de fabricacao: o motor atual tem tempo para T1, T2,'),
    ('B13', 'trocar nomeia até vinte, não dez', SEM_MD5 + [("FILTER (WHERE q.n <= 10)", "FILTER (WHERE q.n <= 20)")], 'FALHOU caso T10'),
    ('B14', 'trocar confere o arquivo novo pela chave errada (detalhe em vez de tempos)', SEM_MD5 + [("CASE WHEN jsonb_typeof(p_payload->'tempos') = 'array' THEN p_payload->'tempos' ELSE", "CASE WHEN jsonb_typeof(p_payload->'detalhes') = 'array' THEN p_payload->'detalhes' ELSE")], 'FALHOU caso T6'),
    # ── a CHECK, com a verificação dela desligada: o caso pega ──
    ('B15', 'a CHECK nova não entra (fica a de antes)', [(DROP_ADD, ''), (CHECK_VERIFICA, "  IF false THEN\n    RAISE EXCEPTION 'verificacao: a CHECK")], 'FALHOU caso T'),
    ('B16', 'a CHECK aceita 200 caracteres', [(CHECK_ADD, "  CHECK (tempo_origem = btrim(tempo_origem) AND char_length(tempo_origem) BETWEEN 1 AND 200);\n"), (CHECK_VERIFICA, "  IF false THEN\n    RAISE EXCEPTION 'verificacao: a CHECK"), (GUARDA_CHECK, "    IF false AND def NOT IN (")], 'FALHOU caso T5'),
    ('B17', 'a CHECK aceita espaço na ponta', [(CHECK_ADD, "  CHECK (char_length(tempo_origem) BETWEEN 1 AND 120);\n"), (CHECK_VERIFICA, "  IF false THEN\n    RAISE EXCEPTION 'verificacao: a CHECK"), (GUARDA_CHECK, "    IF false AND def NOT IN (")], 'FALHOU caso T5'),
    # ── a guarda e a verificação, sozinhas ──
    ('V1', 'a CHECK aceita 200 caracteres, com a verificação ligada', [(CHECK_ADD, "  CHECK (tempo_origem = btrim(tempo_origem) AND char_length(tempo_origem) BETWEEN 1 AND 200);\n")], 'verificacao: a CHECK da origem'),
    ('V2', 'um corpo mutado (criar não grava os tempos), com o md5 ligado', [(INSERT_TEMPOS, '')], 'verificacao: public.superadmin_criar_motor'),
    ('V3', 'criar aberta a anon, com a verificação ligada', [(GRANT_CRIAR, GRANT_CRIAR + GRANT_CRIAR.replace('service_role', 'anon'))], 'verificacao: public.superadmin_criar_motor'),
    ('V4', 'a guarda aceita qualquer corpo de antes', [("      IF achado NOT IN (r.antes, r.desta) THEN\n", "      IF false THEN\n")], 'FALHOU guarda 1'),
    ('V5', 'a guarda não confere a CHECK da origem', [(GUARDA_CHECK, "    IF false AND def NOT IN (")], 'FALHOU guarda 2'),
    ('V6', 'a guarda não confere o índice único do motor', [(GUARDA_INDICE, "    IF false AND def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_motor_tipologia_tempo_tipologia_motor_key")], 'FALHOU guarda 3'),
    ('V7', 'a guarda não confere que a função existe', [(GUARDA_EXISTE, "    IF false THEN\n      difere := difere || format(' %s nao existe;', r.assinatura);\n    ELSE\n")], 'FALHOU guarda 4'),
    ('V8', 'a guarda compara o corpo COM o \\r (recusaria o de produção, colado em CRLF)', [(GUARDA_CR, "      SELECT md5(p.prosrc) INTO achado")], 'FALHOU contraste'),
    ('M0', 'CONTROLE: nada muda', [], None),
]


def mutar(texto, trocas):
    for velho, novo in trocas:
        n = texto.count(velho)
        if n != 1:
            raise SystemExit(f'o trecho a mutar aparece {n} vez(es) — a migração mudou e a mutação precisa ser revista: {velho[:90]!r}')
        texto = texto.replace(velho, novo)
    return texto


def main():
    pedidas = set(sys.argv[1:])
    original = open(MIG, encoding='utf-8').read()
    vivas = 0
    with tempfile.TemporaryDirectory() as tmp:
        copia = os.path.join(tmp, 'mutada.sql')
        for ident, descricao, trocas, espera in MUTACOES:
            if pedidas and ident not in pedidas:
                continue
            open(copia, 'w', encoding='utf-8').write(mutar(original, trocas))
            p = subprocess.run(['bash', os.path.join(AQUI, 'run.sh'), copia], capture_output=True, text=True,
                               env=dict(os.environ, HARNESS_DB='harness_tempo_mut', REUSAR_BASE='1'))
            saida = p.stdout + p.stderr
            if ident == 'M0':
                ok = p.returncode == 0
                print(f"{'verde   ' if ok else 'VERMELHO'} {ident}: {descricao}")
                vivas += 0 if ok else 1
                continue
            morta = p.returncode != 0 and espera in saida
            print(f"{'morta   ' if morta else 'VIVA    '} {ident}: {descricao}" + ('' if morta else f"\n          esperado {espera!r}; saída: {saida.strip().splitlines()[-3:] if saida.strip() else '(vazia)'}"))
            vivas += 0 if morta else 1
    print(f"{'todas mortas, controle verde' if vivas == 0 else f'{vivas} viva(s) ou controle vermelho'}")
    sys.exit(1 if vivas else 0)


if __name__ == '__main__':
    main()
