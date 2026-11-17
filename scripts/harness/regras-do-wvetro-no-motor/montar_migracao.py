"""Monta a 20261117000002 a partir do corpo de PRODUCAO de superadmin_criar_motor (o da 20261106000001, md5 88a3d866...).

As unicas mudancas no corpo sao as tres listas que ganham uma coluna (vidros e insumos: esp_vidro; variaveis_da_tipologia:
condicao_opcoes). O script confere o md5 do corpo de antes, aplica as trocas exatas (cada uma tem de casar uma vez), imprime o diff
e grava a migracao. Rodar da raiz do repositorio: python3 scripts/harness/regras-do-wvetro-no-motor/montar_migracao.py
"""
import difflib, hashlib, sys

FONTE = 'supabase/migrations/20261106000001_tempo_de_fabricacao_no_arquivo_do_motor.sql'
DESTINO = 'supabase/migrations/20261117000002_regras_do_wvetro_no_motor.sql'
ANTES = '88a3d866178a5309a098271f97dc090c'

s = open(FONTE, encoding='utf-8').read()
i = s.index('CREATE OR REPLACE FUNCTION public.superadmin_criar_motor(')
a = s.index('AS $fn$', i) + len('AS $fn$')
b = s.index('$fn$;', a)
cabeca_fn, corpo = s[i:a], s[a:b]
assert hashlib.md5(corpo.encode()).hexdigest() == ANTES, 'o corpo da fonte nao e o de producao'

TROCAS = [
    ("""  INSERT INTO public.orcamentista_motor_vidro (motor_id, ordem, linha, tipologia, vidro, largura, altura, qtd, fixacao, condicao)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.vidro, x.largura, x.altura, x.qtd, x.fixacao, x.condicao
  FROM jsonb_to_recordset(p_payload->'vidros') AS x(ordem integer, linha text, tipologia text, vidro text, largura text, altura text, qtd text, fixacao text, condicao text);""",
     """  -- 20261117000002: esp_vidro (R4), nula quando o arquivo nao traz a coluna
  INSERT INTO public.orcamentista_motor_vidro (motor_id, ordem, linha, tipologia, vidro, largura, altura, qtd, fixacao, condicao, esp_vidro)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.vidro, x.largura, x.altura, x.qtd, x.fixacao, x.condicao, x.esp_vidro
  FROM jsonb_to_recordset(p_payload->'vidros') AS x(ordem integer, linha text, tipologia text, vidro text, largura text, altura text, qtd text, fixacao text, condicao text, esp_vidro text);"""),
    ("""  INSERT INTO public.orcamentista_motor_insumo (motor_id, ordem, linha, tipologia, insumo, descricao, qtd, condicao, obs)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.insumo, x.descricao, x.qtd, x.condicao, x.obs
  FROM jsonb_to_recordset(p_payload->'insumos') AS x(ordem integer, linha text, tipologia text, insumo text, descricao text, qtd text, condicao text, obs text);""",
     """  -- 20261117000002: esp_vidro (R3), nula quando o arquivo nao traz a coluna
  INSERT INTO public.orcamentista_motor_insumo (motor_id, ordem, linha, tipologia, insumo, descricao, qtd, condicao, obs, esp_vidro)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.insumo, x.descricao, x.qtd, x.condicao, x.obs, x.esp_vidro
  FROM jsonb_to_recordset(p_payload->'insumos') AS x(ordem integer, linha text, tipologia text, insumo text, descricao text, qtd text, condicao text, obs text, esp_vidro text);"""),
    ("""  INSERT INTO public.orcamentista_motor_variavel (motor_id, ordem, linha, tipologia, variavel, descricao, padrao, min_max, condicao, opcoes)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.padrao, x.min_max, x.condicao, x.opcoes
  FROM jsonb_to_recordset(p_payload->'variaveis_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, padrao text, min_max text, condicao text, opcoes text);""",
     """  -- 20261117000002: condicao_opcoes (R2), nula quando o arquivo nao traz a coluna
  INSERT INTO public.orcamentista_motor_variavel (motor_id, ordem, linha, tipologia, variavel, descricao, padrao, min_max, condicao, opcoes, condicao_opcoes)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.padrao, x.min_max, x.condicao, x.opcoes, x.condicao_opcoes
  FROM jsonb_to_recordset(p_payload->'variaveis_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, padrao text, min_max text, condicao text, opcoes text, condicao_opcoes text);"""),
]
novo = corpo
for velho, troca in TROCAS:
    assert novo.count(velho) == 1, velho[:60]
    novo = novo.replace(velho, troca)
assert all(ord(c) < 128 for c in novo), 'o corpo tem de ser ASCII'
DESTA = hashlib.md5(novo.encode()).hexdigest()
sys.stdout.writelines(difflib.unified_diff(corpo.splitlines(True), novo.splitlines(True), 'producao', 'desta'))
print('\nmd5 antes', ANTES, 'desta', DESTA)

COLUNAS = [('orcamentista_motor_vidro', 'esp_vidro',
            'R4 (20261117000002): as espessuras de vidro (mm) em que a linha da aba Vidros entra, como o arquivo do motor as escreve ("5,6,8,24"); nula = qualquer.'),
           ('orcamentista_motor_insumo', 'esp_vidro',
            'R3 (20261117000002): as espessuras de vidro (mm) em que a linha da aba Insumos entra, como o arquivo do motor as escreve ("5,6,8,24"); nula = qualquer.'),
           ('orcamentista_motor_variavel', 'condicao_opcoes',
            'R2 (20261117000002): a condicao de cada opcao da variavel, como o arquivo do motor a escreve ("1: (TI=1); 3: (TI=2)"); a opcao que nao aparece vale sempre; nula = todas valem.')]

alter = '\n'.join(f"ALTER TABLE public.{t} ADD COLUMN IF NOT EXISTS {c} text;\nCOMMENT ON COLUMN public.{t}.{c} IS '{m}';" for t, c, m in COLUNAS)
guarda_colunas = '\n'.join(f"""  SELECT data_type, is_nullable, column_default INTO r_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = '{t}' AND column_name = '{c}';
  IF FOUND AND (r_col.data_type <> 'text' OR r_col.is_nullable <> 'YES' OR r_col.column_default IS NOT NULL) THEN
    difere := difere || ' {t}.{c} existe com outra forma;';
  END IF;
  IF to_regclass('public.{t}') IS NULL THEN
    difere := difere || ' public.{t} nao existe;';
  END IF;""" for t, c, _ in COLUNAS)
verifica_colunas = '\n'.join(f"""  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '{t}' AND column_name = '{c}'
                  AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'verificacao: {t}.{c} nao existe como text nula sem default. Nada foi alterado.';
  END IF;""" for t, c, _ in COLUNAS)

SIG = 'public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, text, jsonb)'
sql = f"""-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261117000002 — as regras do WVetro no motor: as colunas que o arquivo do motor (6) traz para R2, R3 e R4 passam a ser GRAVADAS.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão:
-- ║ 20261117000002_regras_do_wvetro_no_motor.
-- ║ SEM ELA, o código do PR continua funcionando: a leitura é por select('*') e a coluna ausente vale nulo (R2, R3 e R4 não agem, como
-- ║ hoje); a criação do motor manda as três colunas no payload, e a função de antes as IGNORA (jsonb_to_recordset não lê a chave que não
-- ║ conhece) — o motor nasce sem elas, em silêncio. Por isso: aplicar ANTES do merge e, DEPOIS do deploy, TROCAR O ARQUIVO do motor da
-- ║ família PVC Wolf pelo mesmo arquivo (6), para as três colunas chegarem ao banco. Até a troca, R1 e R5 já valem; R2, R3 e R4 não.
-- ║ NÃO GRAVA NEM APAGA DADO NENHUM ao ser aplicada: acrescenta três colunas nulas, sem default, e troca o corpo de uma função.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário fora do corpo.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 17/11/2026: "a regra é a definição do WVetro, e o motor do Precifica Certo deve ter isso na
-- concepção da tipologia, como regra inviolável [...] cada tipologia tem suas variáveis". O motor (6), coletado do WVetro (licença 7076),
-- traz três colunas novas e opcionais: "Condição das opções" na aba Variáveis (R2: cada opção tem condição — ARI 1 e 2 só com TI=1, 3 só
-- com TI=2) e "Esp. vidro" nas abas Insumos e Vidros (R3/R4: a borracha 3349 só com vidro de 5, 6, 8 ou 24 mm; a 919 só com 18, 20 ou 21).
-- O avaliador (`avaliador-de-formulas.ts`) já as lê pelo nome; sem esta migração elas não chegam ao banco.
--
-- O QUE FAZ:
--   1. orcamentista_motor_vidro.esp_vidro, orcamentista_motor_insumo.esp_vidro e orcamentista_motor_variavel.condicao_opcoes: text,
--      nulas, sem default (texto literal da célula, como as demais colunas das abas; vazio é NULL — ausente-vs-falso.md);
--   2. superadmin_criar_motor grava as três. O resto do corpo é o de produção, linha por linha
--      (`scripts/harness/regras-do-wvetro-no-motor/montar_migracao.py` prova pelo diff que só as três listas mudaram).
--      superadmin_trocar_arquivo_do_motor chama a criação: herda a mudança sem ser tocada.
--   NÃO muda importar_conteudo_da_tabela (o caminho de antes, motor colado na tabela de preço): desde o PR D a conversa lê o motor pelo
--   catálogo (motor_id), e o motor não sobe mais pela tabela.
-- MEDIDO em produção em 17/11/2026: o corpo de superadmin_criar_motor tem o md5 {ANTES} (sem o \\r); as três colunas não existem.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE; REVOKE/GRANT repetíveis. A guarda aceita o corpo de antes OU o desta.
-- GUARDA (aborta, nomeando o banco, o usuário e o que difere): a função existe pela assinatura de entrada com o corpo de produção ou o
-- desta; as três tabelas existem; a coluna, se já existir, é text nula sem default.
-- VERIFICAÇÃO (aborta): as três colunas; o corpo com o md5 desta; SECURITY DEFINER, search_path e statement_timeout (35 s) de antes;
-- fechada (só service_role executa).
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  f      regprocedure;
  achado text;
  r_col  record;
  difere text := '';
BEGIN
  f := to_regprocedure('{SIG}');
  IF f IS NULL THEN
    difere := difere || ' {SIG} nao existe;';
  ELSE
    SELECT md5(replace(p.prosrc, chr(13), '')) INTO achado FROM pg_proc p WHERE p.oid = f;
    IF achado NOT IN ('{ANTES}', '{DESTA}') THEN
      difere := difere || format(' {SIG} tem o corpo %s (esperado {ANTES} ou {DESTA});', achado);
    END IF;
  END IF;
{guarda_colunas}
  IF difere <> '' THEN
    RAISE EXCEPTION 'guarda: este banco nao esta como o medido (banco %, usuario %):%  Nada foi alterado.', current_database(), current_user, difere;
  END IF;
END
$guarda$;

-- ── 1. as três colunas ──
{alter}

-- ── 2. CRIAR o motor: grava as três colunas ──
{cabeca_fn}{novo}$fn$;

REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION {SIG} TO service_role;

DO $verifica$
DECLARE
  f regprocedure;
BEGIN
{verifica_colunas}
  f := to_regprocedure('{SIG}');
  IF f IS NULL
     OR has_function_privilege('public', f, 'EXECUTE')
     OR has_function_privilege('anon', f, 'EXECUTE')
     OR has_function_privilege('authenticated', f, 'EXECUTE')
     OR NOT has_function_privilege('service_role', f, 'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)
                       AND 'statement_timeout=35s' = ANY (p.proconfig) AND md5(replace(p.prosrc, chr(13), '')) = '{DESTA}') THEN
    RAISE EXCEPTION 'verificacao: {SIG} nao existe, nasceu aberta, perdeu o search_path ou o prazo, ou nao tem o corpo desta migracao. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'regras do WVetro no motor: esp_vidro em vidros e insumos, condicao_opcoes nas variaveis; criar o motor grava as tres.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and (table_name, column_name) in (('orcamentista_motor_vidro','esp_vidro'),
--        ('orcamentista_motor_insumo','esp_vidro'), ('orcamentista_motor_variavel','condicao_opcoes'));
--   esperado: 3 linhas, text, YES, sem default
-- select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'superadmin_criar_motor';
--   esperado: {DESTA}
"""
open(DESTINO, 'w', encoding='utf-8', newline='\n').write(sql)
print('gravada', DESTINO)
