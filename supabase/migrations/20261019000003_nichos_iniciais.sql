-- ════════════════════════════════════════════════════════════════════════════════════════
-- Atendimentos I.A., bloco 2B.2 — os NICHOS INICIAIS de cada modelo
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ APLICADA EM PRODUÇÃO em 19/10/2026, pelo SQL Editor do Supabase, projeto
-- ║ jvthwpkwzpangnwhuyvj. Depende da `20261019000001` (a tabela `orcamentista_nicho` e o
-- ║ índice único `orcamentista_nicho_modelo_nome_key`), também APLICADA em 19/10/2026.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- >>> O QUE FOI MEDIDO DEPOIS DA APLICAÇÃO <<<
-- Medição em produção em 19/10/2026, pela sessão de verificação:
--   public.orcamentista_nicho: 12 linhas — FABRICACAO=4, REVENDA=4, SERVICO=4
--   pg_stat_user_tables.n_tup_ins em orcamentista_nicho: 12
--
-- md5 do arquivo COMO APLICADO: 27243af99c468b8e2e31ab11e8ee84c4
-- Este cabeçalho foi corrigido DEPOIS da aplicação, então o md5 atual do arquivo difere do
-- md5 como aplicado. O SQL não foi tocado: conferido pelo md5 das linhas não-comentário,
-- idêntico antes e depois (d3dcc4829f8777177892cdba51baf155). O md5 atual do arquivo está
-- publicado no commit que fez esta correção.
--
-- >>> A PRIMEIRA APLICAÇÃO FOI RELATADA COMO "Sucesso" E NÃO INSERIU NADA <<<
-- Na medição seguinte: 0 linhas, n_tup_ins = 0. O verde da tela pertencia a outro statement
-- da mesma aba. Foi reaplicada, e aí inseriu. "Sucesso" na tela não é prova de aplicação —
-- a prova está no banco.
--
-- >>> NÃO REGISTRADA NO LEDGER DE MIGRATIONS <<<
-- supabase_migrations.schema_migrations não contém nenhuma das três migrations de 19/10: a
-- aplicação foi pelo SQL Editor, que não grava no ledger. Em 19/10/2026 o ledger vai até
-- 20261017185237. Consequência: um `supabase db push` tentaria aplicar as três de novo.
-- Esta sobrevive (ON CONFLICT DO NOTHING); as irmãs não — a 20261019000001 tem CREATE TABLE
-- sem IF NOT EXISTS, e a 20261019000002 tem DROP POLICY sem IF EXISTS.
--
-- POR QUE EXISTE: o catálogo nasceu vazio, e sem nicho não se credencia fornecedor — o seletor
-- do credenciamento dizia "Nenhum nicho cadastrado". Medido em 19/10/2026, 18:38 UTC: 0 nichos,
-- 0 fornecedores, 0 tabelas, 0 objetos no bucket `atendimentos-ia`.
--
-- >>> QUEM ESCOLHEU CADA NOME — e a diferença importa <<<
-- Decisão do dono do produto, 19/10/2026: ele nomeou os primeiros de cada modelo e autorizou o
-- assistente a PROPOR os demais. Os marcados (proposto) são SUGESTÃO, não decisão: quem for
-- revisar a lista de nichos não deve lê-los como escolha do produto.
--
--   modelo        nome                      origem
--   FABRICACAO    Esquadrias                dono do produto
--   FABRICACAO    Móveis personalizados     dono do produto
--   FABRICACAO    Marcenaria                (proposto)
--   FABRICACAO    Serralheria               (proposto)
--   SERVICO       Mecânicas                 dono do produto
--   SERVICO       Salões de beleza          dono do produto
--   SERVICO       Assistência técnica       (proposto)
--   SERVICO       Manutenção predial        (proposto)
--   REVENDA       Materiais de construção   (proposto)
--   REVENDA       Loja de roupas            (proposto)
--   REVENDA       Autopeças                 (proposto)
--   REVENDA       Distribuidora             (proposto)
--
-- `criado_por` fica NULL: nenhum usuário criou estes nichos, a migração criou. Um id de usuário
-- aqui afirmaria uma autoria que não houve (`ausente-vs-falso.md`).
--
-- PODE RODAR DUAS VEZES: `ON CONFLICT (modelo, lower(nome)) DO NOTHING`, contra o índice único
-- `orcamentista_nicho_modelo_nome_key`. Um nicho que já exista com o mesmo nome no mesmo modelo
-- — inclusive com outra caixa, criado pela tela — fica como está, e a semente não o duplica nem
-- o sobrescreve.
--
-- Os nomes têm acento e cedilha, e o catálogo os guarda como TEXTO: quem aplicar por cópia
-- confere que "Móveis", "Mecânicas", "Salões", "Assistência", "Manutenção" e "Autopeças" chegaram
-- intactos (`transformacao-quebra-a-cadeia-de-hash.md`, a normalização para ASCII).
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO public.orcamentista_nicho (modelo, nome, criado_por) VALUES
  ('FABRICACAO', 'Esquadrias',              NULL),  -- dono do produto
  ('FABRICACAO', 'Móveis personalizados',   NULL),  -- dono do produto
  ('FABRICACAO', 'Marcenaria',              NULL),  -- (proposto)
  ('FABRICACAO', 'Serralheria',             NULL),  -- (proposto)
  ('SERVICO',    'Mecânicas',               NULL),  -- dono do produto
  ('SERVICO',    'Salões de beleza',        NULL),  -- dono do produto
  ('SERVICO',    'Assistência técnica',     NULL),  -- (proposto)
  ('SERVICO',    'Manutenção predial',      NULL),  -- (proposto)
  ('REVENDA',    'Materiais de construção', NULL),  -- (proposto)
  ('REVENDA',    'Loja de roupas',          NULL),  -- (proposto)
  ('REVENDA',    'Autopeças',               NULL),  -- (proposto)
  ('REVENDA',    'Distribuidora',           NULL)   -- (proposto)
ON CONFLICT (modelo, lower(nome)) DO NOTHING;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar.
--
-- (1) Os doze, por modelo, sem autor:
--   select modelo, nome, ativo, criado_por from public.orcamentista_nicho order by modelo, nome;
--   -- esperado: 12 linhas (ANTES: 0) — 4 FABRICACAO, 4 REVENDA, 4 SERVICO; ativo = true;
--   --   criado_por NULL nas doze
--
-- (2) Os acentos chegaram:
--   select count(*) from public.orcamentista_nicho
--    where nome in ('Móveis personalizados', 'Mecânicas', 'Salões de beleza',
--                   'Assistência técnica', 'Manutenção predial', 'Autopeças');
--   -- esperado: 6
--
-- (3) Rodar a migração de novo não muda nada: depois da segunda vez, a contagem de (1)
--     continua 12.
-- ════════════════════════════════════════════════════════════════════════════════════════
