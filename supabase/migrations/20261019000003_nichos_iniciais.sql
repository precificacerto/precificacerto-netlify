-- ════════════════════════════════════════════════════════════════════════════════════════
-- Atendimentos I.A., bloco 2B.2 — os NICHOS INICIAIS de cada modelo
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ NÃO APLICADA. Escrita em 19/10/2026 para revisão do dono do produto, que publica o md5 e
-- ║ decide. Depende da `20261019000001` (a tabela `orcamentista_nicho` e o índice único
-- ║ `orcamentista_nicho_modelo_nome_key`) — que está APLICADA em produção desde 19/10/2026.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
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
