#!/usr/bin/env python3
"""Monta supabase/migrations/20261106000001_tempo_de_fabricacao_no_arquivo_do_motor.sql a partir dos DOIS CORPOS de produção
(`superadmin_criar_motor` e `superadmin_trocar_arquivo_do_motor`, como estão na 20261029000005 — md5 sem o \\r igual ao medido em produção em
06/11/2026), com trocas nomeadas e assertivas: cada âncora aparece uma vez, e o corpo novo é o de produção MAIS as linhas inseridas, com UMA linha
trocada declarada (o log da criação ganha a contagem dos tempos). A última conferência deste script prova isso pelo diff.

Os md5 dos corpos NOVOS são calculados aqui (o `prosrc` é o texto entre os `$fn$`), e entram na guarda (reaplicação) e na verificação.
Uso: python3 montar_migracao.py"""
import difflib, hashlib, pathlib, re

AQUI = pathlib.Path(__file__).resolve().parent
R = AQUI.parents[2]
ORIGEM = R / 'supabase/migrations/20261029000005_nome_do_motor_e_arquivar_em_uso.sql'
DESTINO = R / 'supabase/migrations/20261106000001_tempo_de_fabricacao_no_arquivo_do_motor.sql'
ANTES = {  # md5(replace(prosrc, chr(13), '')) medido em produção em 06/11/2026
    'superadmin_criar_motor': 'ae9f3fb4bffa605f714e1e1780af0b96',
    'superadmin_trocar_arquivo_do_motor': '0c8c72a82eebe1bc798d280c2a340af2',
}
ASSINATURA = {
    'superadmin_criar_motor': 'public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)',
    'superadmin_trocar_arquivo_do_motor': 'public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)',
}

def md5(s): return hashlib.md5(s.encode()).hexdigest()
def troca(s, a, b):
    assert s.count(a) == 1, (s.count(a), a[:90]); return s.replace(a, b)

def funcao(fn):
    """O CREATE inteiro (cabeçalho e corpo) da 20261029000005, e o corpo entre os $fn$."""
    t = ORIGEM.read_text()
    i = t.index(f'CREATE OR REPLACE FUNCTION public.{fn}(')
    a = t.index('AS $fn$', i) + len('AS $fn$')
    b = t.index('$fn$;', a)
    corpo = t[a:b]
    assert md5(corpo) == ANTES[fn], (fn, md5(corpo))
    return t[i:a], corpo

# ── criar: valida a lista de tempos, grava, conta, loga e devolve ─────────────────────────────────────
CAB_CRIAR, CRIAR = funcao('superadmin_criar_motor')
novo_criar = CRIAR
novo_criar = troca(novo_criar, "  v_otimizacao    integer;\n", "  v_otimizacao    integer;\n  v_tempos        integer;\n")
novo_criar = troca(novo_criar, """    RAISE EXCEPTION 'O arquivo nao traz nenhuma tipologia: um motor sem tipologia nao e motor. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
""", """    RAISE EXCEPTION 'O arquivo nao traz nenhuma tipologia: um motor sem tipologia nao e motor. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- os TEMPOS de fabricacao (20261106000001): a lista e opcional (o codigo de antes desta migracao nao a manda, e o motor nasce sem tempo, como
  -- antes); presente, e lista, e cada tempo tem a tipologia de uma linha da Detalhe, minutos inteiros maiores que zero e a origem de 1 a 120
  -- caracteres, sem espaco nas pontas. O padrao IMPORTADO e do leitor, e so dele: aqui a origem vazia e recusa.
  IF p_payload ? 'tempos' AND jsonb_typeof(p_payload->'tempos') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Payload invalido: tempos tem de ser uma lista. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(coalesce(t.e->>'tipologia', '(sem tipologia)'), ', ' ORDER BY t.n) INTO v_msg
    FROM jsonb_array_elements(coalesce(p_payload->'tempos', '[]'::jsonb)) WITH ORDINALITY AS t(e, n)
   WHERE CASE
           WHEN jsonb_typeof(t.e) IS DISTINCT FROM 'object' THEN true
           WHEN jsonb_typeof(t.e->'tipologia') IS DISTINCT FROM 'string' THEN true
           WHEN jsonb_typeof(t.e->'tempo_fabricacao_min') IS DISTINCT FROM 'number' THEN true
           WHEN (t.e->>'tempo_fabricacao_min')::numeric <> trunc((t.e->>'tempo_fabricacao_min')::numeric)
             OR (t.e->>'tempo_fabricacao_min')::numeric NOT BETWEEN 1 AND 2147483647 THEN true
           WHEN jsonb_typeof(t.e->'tempo_origem') IS DISTINCT FROM 'string' THEN true
           ELSE (t.e->>'tempo_origem') <> btrim(t.e->>'tempo_origem') OR char_length(t.e->>'tempo_origem') NOT BETWEEN 1 AND 120
         END;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'tempo de fabricacao invalido para %: minutos inteiros maiores que zero, e origem de 1 a 120 caracteres sem espaco nas pontas. Nada foi gravado.', v_msg
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(d.tip, ', ' ORDER BY d.tip) INTO v_msg
    FROM (SELECT t.e->>'tipologia' AS tip FROM jsonb_array_elements(coalesce(p_payload->'tempos', '[]'::jsonb)) AS t(e) GROUP BY 1 HAVING count(*) > 1) d;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'a tipologia % tem mais de um tempo de fabricacao. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(t.e->>'tipologia', ', ' ORDER BY t.e->>'tipologia') INTO v_msg
    FROM jsonb_array_elements(coalesce(p_payload->'tempos', '[]'::jsonb)) AS t(e)
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'detalhes') AS d(e) WHERE d.e->>'tipologia' = t.e->>'tipologia');
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'tempo de fabricacao para tipologia que nao esta na Detalhe: %. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;
""")
novo_criar = troca(novo_criar, """  GET DIAGNOSTICS v_detalhes = ROW_COUNT;
""", """  GET DIAGNOSTICS v_detalhes = ROW_COUNT;

  -- os tempos, em orcamentista_motor_tipologia_tempo, por motor_id (a tabela propria desde a 20261024000003; nenhum processo a apaga)
  INSERT INTO public.orcamentista_motor_tipologia_tempo (motor_id, tipologia, tempo_fabricacao_min, tempo_origem, atualizado_por)
  SELECT v_motor, x.tipologia, x.tempo_fabricacao_min, x.tempo_origem, p_por
  FROM jsonb_to_recordset(coalesce(p_payload->'tempos', '[]'::jsonb)) AS x(tipologia text, tempo_fabricacao_min integer, tempo_origem text);
  GET DIAGNOSTICS v_tempos = ROW_COUNT;
""")
LINHA_DO_LOG_ANTES = "                             'importacao_id', v_importacao_id, 'regras', v_regras, 'tipologias', v_detalhes),\n"
LINHA_DO_LOG_DEPOIS = "                             'importacao_id', v_importacao_id, 'regras', v_regras, 'tipologias', v_detalhes, 'tempos', v_tempos),\n"
novo_criar = troca(novo_criar, LINHA_DO_LOG_ANTES, LINHA_DO_LOG_DEPOIS)
novo_criar = troca(novo_criar, "    'otimizacao',      v_otimizacao\n", "    'tempos',          v_tempos,\n    'otimizacao',      v_otimizacao\n")

# ── trocar: recusa a troca que perderia tempo, antes de qualquer escrita ──────────────────────────────
CAB_TROCAR, TROCAR = funcao('superadmin_trocar_arquivo_do_motor')
novo_trocar = TROCAR
novo_trocar = troca(novo_trocar, "  v_n       integer := 0;\n", "  v_n       integer := 0;\n  v_perdidos integer;\n  v_msg     text;\n")
novo_trocar = troca(novo_trocar, """    RAISE EXCEPTION 'o arquivo novo e o mesmo objeto do motor atual: envie o arquivo de novo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
""", """    RAISE EXCEPTION 'o arquivo novo e o mesmo objeto do motor atual: envie o arquivo de novo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 0. a troca que PERDERIA TEMPO e recusada (20261106000001; dono do produto, 05/11/2026): o antigo tem tempo numa tipologia que o arquivo novo
  --    traz na Detalhe SEM tempo (a coluna ausente, ou a celula vazia). A tipologia que saiu do arquivo nao conta: o motor novo nao a tem, e o
  --    tempo dela nao teria onde valer. Antes de qualquer escrita, com o antigo travado; nomeia ate dez, e diz quantas sobram.
  SELECT count(*), string_agg(q.tipologia, ', ' ORDER BY q.tipologia) FILTER (WHERE q.n <= 10) INTO v_perdidos, v_msg
    FROM (SELECT t.tipologia, row_number() OVER (ORDER BY t.tipologia) AS n
            FROM public.orcamentista_motor_tipologia_tempo t
           WHERE t.motor_id = p_motor
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload->'detalhes') = 'array' THEN p_payload->'detalhes' ELSE '[]'::jsonb END) AS d(e)
                          WHERE d.e->>'tipologia' = t.tipologia)
             AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_payload->'tempos') = 'array' THEN p_payload->'tempos' ELSE '[]'::jsonb END) AS x(e)
                              WHERE x.e->>'tipologia' = t.tipologia)) q;
  IF v_perdidos > 0 THEN
    RAISE EXCEPTION 'a troca perderia % tempo(s) de fabricacao: o motor atual tem tempo para %, e o arquivo novo traz essa(s) tipologia(s) sem tempo. Preencha o tempo delas no arquivo e envie de novo. Nada foi gravado.',
      v_perdidos, v_msg || CASE WHEN v_perdidos > 10 THEN ' e mais ' || (v_perdidos - 10) ELSE '' END
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
""")

for fn, antes, depois in (('superadmin_criar_motor', CRIAR, novo_criar), ('superadmin_trocar_arquivo_do_motor', TROCAR, novo_trocar)):
    assert all(ord(c) < 128 for c in depois), f'{fn}: o corpo novo tem caractere fora do ASCII'
    # o corpo novo e o de producao MAIS linhas; a unica linha que muda e a do log da criacao, declarada
    sm = difflib.SequenceMatcher(a=antes.splitlines(True), b=depois.splitlines(True), autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == 'equal' or op == 'insert': continue
        assert op == 'replace' and antes.splitlines(True)[i1:i2] == [LINHA_DO_LOG_ANTES] and depois.splitlines(True)[j1:j2] == [LINHA_DO_LOG_DEPOIS], (fn, op, antes.splitlines(True)[i1:i2])

DESTA = {'superadmin_criar_motor': md5(novo_criar), 'superadmin_trocar_arquivo_do_motor': md5(novo_trocar)}
CHECK_DA_ORIGEM = "CHECK (((tempo_origem = btrim(tempo_origem)) AND ((char_length(tempo_origem) >= 1) AND (char_length(tempo_origem) <= 120))))"
CHECK_DE_ANTES = "CHECK ((tempo_origem = ANY (ARRAY['ESTIMADO'::text, 'IMPORTADO'::text])))"

def corpos_esperados(fn):
    return f"('{fn}', '{ANTES[fn]}', '{DESTA[fn]}')"

MIGRACAO = f"""-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261106000001 — o tempo de fabricação vem no ARQUIVO do motor: a criação grava os tempos, a troca de arquivo que perderia tempo é recusada,
-- e a origem do tempo passa a ser texto livre de 1 a 120 caracteres.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão:
-- ║ 20261106000001_tempo_de_fabricacao_no_arquivo_do_motor.
-- ║ SEM ELA, o código do PR cria o motor e responde ERRO: a função de antes ignora a lista `tempos` (jsonb_to_recordset não lê a
-- ║ chave que não conhece), não devolve a contagem, e a conferência da rota trata a contagem ausente como divergência — 500 com os
-- ║ dois lados, nunca sucesso com o tempo descartado. O motor fica criado (a função já fez COMMIT), sem tempo e sem etapa.
-- ║ NÃO GRAVA NEM APAGA DADO NENHUM ao ser aplicada: troca uma CHECK e o corpo de duas funções.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário fora dos corpos.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 05/11/2026 (a dívida de 27/10/2026: "o tempo de fabricação de cada tipologia virá na tabela das
-- tipologias [...] tudo dentro do motor, em uma coluna específica"). O arquivo traz, na aba "Detalhe Tipologias", depois de "Nº insumos",
-- "Tempo fabricação (min)" (minutos inteiros por unidade de esquadria; vazio = não informado, nunca 0) e "Origem do tempo" (opcional; vazia,
-- o leitor grava IMPORTADO). O leitor é `src/utils/atendimentos-ia-tempos-do-motor.ts`.
--
-- O QUE FAZ:
--   1. a CHECK `orcamentista_motor_tipologia_tempo_origem` passa de ('ESTIMADO', 'IMPORTADO') para texto de 1 a 120 caracteres, sem espaço
--      nas pontas (dono do produto, 05/11/2026: "origem é texto livre de 1 a 120 caracteres"). Os dois valores de antes continuam válidos.
--   2. `superadmin_criar_motor` aceita a lista `tempos` (opcional: o código de antes não a manda), confere cada tempo (a tipologia de uma
--      linha da Detalhe, sem repetir; minutos inteiros de 1 ao maior integer; a origem como a CHECK), grava-os por `motor_id` na mesma
--      transação, loga a contagem e a DEVOLVE (`tempos`).
--   3. `superadmin_trocar_arquivo_do_motor` RECUSA, antes de qualquer escrita, a troca em que o motor antigo tem tempo numa tipologia que o
--      arquivo novo traz na Detalhe sem tempo — nomeando até dez e quantas sobram (dono do produto, 05/11/2026: "troca de arquivo que
--      perderia tempos é RECUSADA e nomeada"). Leitura do assistente, dita no PR: a tipologia que SAIU do arquivo não conta como perda (o
--      motor novo não a tem; o tempo dela não teria onde valer). Os tempos do antigo ficam nele, intactos, como o resto do conteúdo.
-- O resto dos dois corpos é o de produção, linha por linha (`scripts/harness/tempo-no-arquivo-do-motor/montar_migracao.py` prova pelo diff
-- que só se acrescentaram linhas, e que a única linha trocada é a do log da criação, que ganhou a contagem dos tempos).
-- MEDIDO em produção em 06/11/2026: os dois corpos têm o md5 abaixo (sem o \\r); a tabela de tempos tem 0 linhas, a CHECK de antes, o índice
-- único parcial (motor_id, tipologia) e a CHECK do positivo; 1 motor (`20f66b59…`), sem tempo.
--
-- IDEMPOTENTE: DROP CONSTRAINT IF EXISTS + ADD; CREATE OR REPLACE; REVOKE/GRANT repetíveis. A guarda aceita os corpos de antes OU os desta.
-- GUARDA (aborta, nomeando o banco, o usuário e o que difere): as duas funções existem pela assinatura de entrada com o corpo de produção ou o
-- desta; a tabela de tempos existe, com a CHECK da origem de antes ou a desta, e com o índice único parcial e a CHECK do positivo.
-- VERIFICAÇÃO (aborta): a CHECK nova; os dois corpos com o md5 desta; SECURITY DEFINER, search_path e statement_timeout (35 s e 40 s) de antes;
-- fechadas (só service_role executa).
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  r      record;
  f      regprocedure;
  achado text;
  def    text;
  difere text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('{ASSINATURA['superadmin_criar_motor']}', '{ANTES['superadmin_criar_motor']}', '{DESTA['superadmin_criar_motor']}'),
      ('{ASSINATURA['superadmin_trocar_arquivo_do_motor']}', '{ANTES['superadmin_trocar_arquivo_do_motor']}', '{DESTA['superadmin_trocar_arquivo_do_motor']}')
    ) AS v(assinatura, antes, desta) LOOP
    f := to_regprocedure(r.assinatura);
    IF f IS NULL THEN
      difere := difere || format(' %s nao existe;', r.assinatura);
    ELSE
      SELECT md5(replace(p.prosrc, chr(13), '')) INTO achado FROM pg_proc p WHERE p.oid = f;
      IF achado NOT IN (r.antes, r.desta) THEN
        difere := difere || format(' %s tem o corpo %s (esperado %s ou %s);', r.assinatura, achado, r.antes, r.desta);
      END IF;
    END IF;
  END LOOP;
  IF to_regclass('public.orcamentista_motor_tipologia_tempo') IS NULL THEN
    difere := difere || ' public.orcamentista_motor_tipologia_tempo nao existe;';
  ELSE
    SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
     WHERE c.conrelid = 'public.orcamentista_motor_tipologia_tempo'::regclass AND c.conname = 'orcamentista_motor_tipologia_tempo_origem';
    IF def IS NULL OR def NOT IN ($c${CHECK_DE_ANTES}$c$, $c${CHECK_DA_ORIGEM}$c$) THEN
      difere := difere || format(' a CHECK da origem e %s;', coalesce(def, '(ausente)'));
    END IF;
    SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
     WHERE c.conrelid = 'public.orcamentista_motor_tipologia_tempo'::regclass AND c.conname = 'orcamentista_motor_tipologia_tempo_positivo';
    IF def IS DISTINCT FROM 'CHECK ((tempo_fabricacao_min > 0))' THEN
      difere := difere || format(' a CHECK do positivo e %s;', coalesce(def, '(ausente)'));
    END IF;
    SELECT indexdef INTO def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_motor_tipologia_tempo_tipologia_motor_key';
    IF def IS DISTINCT FROM 'CREATE UNIQUE INDEX orcamentista_motor_tipologia_tempo_tipologia_motor_key ON public.orcamentista_motor_tipologia_tempo USING btree (motor_id, tipologia) WHERE (motor_id IS NOT NULL)' THEN
      difere := difere || format(' o indice unico do motor e %s;', coalesce(def, '(ausente)'));
    END IF;
  END IF;
  IF difere <> '' THEN
    RAISE EXCEPTION 'guarda: este banco nao esta como o medido (banco %, usuario %):%  Nada foi alterado.', current_database(), current_user, difere;
  END IF;
END
$guarda$;

-- ── 1. a ORIGEM do tempo: texto livre de 1 a 120 caracteres, sem espaço nas pontas ──
ALTER TABLE public.orcamentista_motor_tipologia_tempo DROP CONSTRAINT IF EXISTS orcamentista_motor_tipologia_tempo_origem;
ALTER TABLE public.orcamentista_motor_tipologia_tempo ADD CONSTRAINT orcamentista_motor_tipologia_tempo_origem
  CHECK (tempo_origem = btrim(tempo_origem) AND char_length(tempo_origem) BETWEEN 1 AND 120);
COMMENT ON COLUMN public.orcamentista_motor_tipologia_tempo.tempo_origem IS
  'De onde veio o tempo, como a empresa escreveu na coluna Origem do tempo do arquivo do motor (1 a 120 caracteres); IMPORTADO quando a coluna veio vazia; ESTIMADO nos tempos de antes de 20261106000001.';

-- ── 2. CRIAR o motor: grava os tempos do arquivo ──
{CAB_CRIAR}{novo_criar}$fn$;

REVOKE ALL ON FUNCTION {ASSINATURA['superadmin_criar_motor']} FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION {ASSINATURA['superadmin_criar_motor']} TO service_role;

-- ── 3. TROCAR o arquivo: recusa a troca que perderia tempo ──
{CAB_TROCAR}{novo_trocar}$fn$;

REVOKE ALL ON FUNCTION {ASSINATURA['superadmin_trocar_arquivo_do_motor']} FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION {ASSINATURA['superadmin_trocar_arquivo_do_motor']} TO service_role;

DO $verifica$
DECLARE
  r   record;
  f   regprocedure;
  def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conrelid = 'public.orcamentista_motor_tipologia_tempo'::regclass AND c.conname = 'orcamentista_motor_tipologia_tempo_origem';
  IF def IS DISTINCT FROM $c${CHECK_DA_ORIGEM}$c$ THEN
    RAISE EXCEPTION 'verificacao: a CHECK da origem e %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  FOR r IN SELECT * FROM (VALUES
      ('{ASSINATURA['superadmin_criar_motor']}', '{DESTA['superadmin_criar_motor']}', 'statement_timeout=35s'),
      ('{ASSINATURA['superadmin_trocar_arquivo_do_motor']}', '{DESTA['superadmin_trocar_arquivo_do_motor']}', 'statement_timeout=40s')
    ) AS v(assinatura, desta, prazo) LOOP
    f := to_regprocedure(r.assinatura);
    IF f IS NULL
       OR has_function_privilege('public', f, 'EXECUTE')
       OR has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig) AND r.prazo = ANY (p.proconfig)
                         AND md5(replace(p.prosrc, chr(13), '')) = r.desta) THEN
      RAISE EXCEPTION 'verificacao: % nao existe, nasceu aberta, perdeu o search_path ou o prazo, ou nao tem o corpo desta migracao. Nada foi alterado.', r.assinatura;
    END IF;
  END LOOP;
  RAISE NOTICE 'tempo no arquivo do motor: a origem de 1 a 120 caracteres; criar grava os tempos; trocar recusa a troca que perderia tempo.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'orcamentista_motor_tipologia_tempo_origem';
--   esperado: {CHECK_DA_ORIGEM}
-- select proname, md5(replace(prosrc, chr(13), '')) from pg_proc where proname in ('superadmin_criar_motor', 'superadmin_trocar_arquivo_do_motor') order by 1;
--   esperado: superadmin_criar_motor = {DESTA['superadmin_criar_motor']}; superadmin_trocar_arquivo_do_motor = {DESTA['superadmin_trocar_arquivo_do_motor']}
-- select count(*) from public.orcamentista_motor_tipologia_tempo;
--   esperado: o mesmo de antes (a migração não grava nem apaga tempo); 0 em 06/11/2026
"""
DESTINO.write_text(MIGRACAO)
print(DESTINO.relative_to(R), md5(MIGRACAO), len(MIGRACAO.encode()), 'bytes', MIGRACAO.count('\n'), 'linhas')
print('corpos desta:', DESTA)
