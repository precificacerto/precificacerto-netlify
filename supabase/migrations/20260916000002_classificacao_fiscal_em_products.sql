-- Migration: a classificação fiscal do PRODUTO E DO SERVIÇO — CST, cClassTrib,
--            procedência e as DUAS reduções, gravadas como FATO
--
-- ══════════════════════════════════════════════════════════════════════════
-- DEPENDE DE `20260916000001_cst_ibs_cbs_e_cclass_trib.sql`
-- ══════════════════════════════════════════════════════════════════════════
-- Aquela migração cria as duas tabelas de referência. Esta não as referencia por
-- FK (ver decisão 2 abaixo), mas a tela lê as duas juntas — aplicar fora de ordem
-- deixa a tela consultando tabela inexistente.
--
-- E o default de toda migração é PENDENTE (`migration-delivery.md`): merge não
-- aplica nada, build verde não prova schema. A verificação está no fim do arquivo.
--
-- ══════════════════════════════════════════════════════════════════════════
-- A MUDANÇA DE NATUREZA — o fator de redução deixa de ser ENTRADA
-- ══════════════════════════════════════════════════════════════════════════
-- Formulação do dono do produto, registrada como está:
--
--   > O fator de redução NÃO é escolha do usuário. Ele DECORRE do cClassTrib.
--   > Na reforma, o contribuinte classifica a operação — escolhe CST e
--   > cClassTrib — e a redução vem junto, da tabela: pRedIBS e pRedCBS são
--   > atributos do código, não campos que o emitente preenche. Na NF-e, o grupo
--   > gRed é validado contra o que o código permite; escolher um percentual que
--   > o código não dá é nota rejeitada.
--   > É como o NCM: ninguém digita a alíquota do IPI, classifica o produto e a
--   > alíquota vem.
--
--   hoje:    o usuário escolhe 0/30/40/50/60/70/80/100
--   depois:  o usuário escolhe o cClassTrib, e o sistema LÊ p_red_ibs e p_red_cbs
--
-- ══════════════════════════════════════════════════════════════════════════
-- POR QUE AS DUAS REDUÇÕES SÃO GRAVADAS, e não relidas da tabela
-- ══════════════════════════════════════════════════════════════════════════
-- Porque o PREÇO FOI FORMADO COM ELAS. Se uma publicação futura mudar o
-- percentual de um código, o preço de ontem não pode mudar junto — é
-- `fato-vs-referencia.md` na forma mais direta, e a classe já tem seis
-- aparições nesta base: *"fato histórico congela; referência viva relê"*.
--
-- Derivar em tempo de leitura seria a SÉTIMA. O valor é derivado UMA VEZ, no
-- momento em que o produto é classificado, e congelado aqui.
--
-- São DOIS campos e não um, e a razão é medida: o código `200025` (serviços de
-- educação do ProUni) tem `p_red_ibs = 60` e `p_red_cbs = 100`. Um campo só não
-- teria como dizer isso. 1 em 164 — e é justamente o caso que o desenho anterior,
-- de um `iva_dual_reduction_factor` único, não comportava.
--
-- ══════════════════════════════════════════════════════════════════════════
-- TRÊS DECISÕES DE DESENHO
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. TODAS NULÁVEIS E SEM DEFAULT — `ausente-vs-falso.md`, corolário do schema:
--    *"NOT NULL DEFAULT 0 numa coluna que pode legitimamente valer zero apaga a
--    distinção para sempre"*. Aqui NULL significa "produto anterior a este campo",
--    que não é nem TABELA nem MANUAL, e não é redução zero. Um
--    `DEFAULT 'TABELA'` afirmaria que todo produto legado veio da tabela oficial
--    — afirmação sobre o passado que ninguém apurou. É o preço que o D8 pagou em
--    `rt_pct`.
--
-- 2. SEM FK PARA `cclass_trib`, DE PROPÓSITO.
--    Decisão do dono do produto: o usuário pode cadastrar código que não está na
--    tabela, mesmo padrão do fator de redução — A TELA SUGERE, O BANCO ACEITA. Se
--    um código novo for publicado antes da nossa atualização, ninguém fica
--    travado. Uma FK proibiria exatamente o caso que a decisão autoriza.
--    A validação do par (CST, cClassTrib) é da TELA e de função pura testável, e
--    o resultado dela é o que decide `cclass_trib_origem`.
--
-- 3. A PROCEDÊNCIA É COLUNA, NÃO DEDUÇÃO — e não é booleana.
--    "O código não encontrado se auto-identifica" foi considerado e RECUSADO:
--    ele afirma por ausência contra uma tabela que muda, e erra nos dois sentidos.
--      · código manual hoje, publicado amanhã  → vira OFICIAL retroativamente
--      · código oficial hoje, revogado amanhã  → vira MANUAL retroativamente
--    Nos dois casos a resposta a "quem cadastrou este código?" MUDA SOZINHA, sem
--    ninguém agir — de novo `fato-vs-referencia.md`.
--    Booleano `is_manual` erra por outro lado: `false` seria "veio da tabela" ou
--    "ninguém marcou"? Dois valores para três estados.
--    E `cclass_trib_source_published_at` é o que fecha a auditoria: "veio da
--    tabela de 22/06/2026" é verificável; "veio da tabela" não é.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ESCOPO — o que este arquivo NÃO faz
-- ══════════════════════════════════════════════════════════════════════════
-- Nenhum DROP, nenhum UPDATE, nenhuma linha existente alterada. As 160 linhas de
-- `products` ficam com NULL nas seis colunas novas, que é exatamente o que NULL
-- deve significar aqui.
--
-- `products.iva_dual_reduction_factor` NÃO é tocado. Ele continua existindo e
-- continua sendo o que o motor lê hoje. A travessia dele para as duas colunas
-- novas é decisão própria, e NÃO está tomada neste arquivo.
--
-- `services` RECEBE AS MESMAS SEIS COLUNAS E AS MESMAS TRÊS CHECK. A primeira
-- versão deste arquivo nomeava só `products`, e o dono do produto corrigiu:
-- *"minha instrução nomeou só products e isso foi omissão, não escopo"*. Serviço
-- tem `iva_dual_reduction_factor` próprio e cai na mesma mudança de natureza.
--
-- Fazer metade da travessia seria `copia-divergente.md` NASCENDO — o mesmo
-- mapeamento em dois cadastros, um deles esquecendo campos, e nada falha: o
-- serviço continuaria com um fator único enquanto o produto teria dois, e a
-- divergência só apareceria como apuração errada. As duas metades entram no
-- mesmo arquivo de propósito, para que não exista janela em que uma exista e a
-- outra não.
--
-- A COLUNA CHAMA-SE `cst_ibs_cbs_code`, e não `cst_ibs_cbs`. A tabela de
-- referência se chama `cst_ibs_cbs`, e uma coluna homônima é legal no Postgres
-- mas faz `select cst_ibs_cbs from products` ler igual a `from cst_ibs_cbs`. O
-- sufixo custa cinco caracteres e evita a leitura errada.

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cst_ibs_cbs_code                text,
  ADD COLUMN IF NOT EXISTS cclass_trib                     text,
  ADD COLUMN IF NOT EXISTS cclass_trib_origem              text,
  ADD COLUMN IF NOT EXISTS cclass_trib_source_published_at date,
  ADD COLUMN IF NOT EXISTS iva_reduction_ibs_pct           numeric,
  ADD COLUMN IF NOT EXISTS iva_reduction_cbs_pct           numeric;

-- A procedência só tem três estados, e os três são distinguíveis.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_cclass_trib_origem_chk;
ALTER TABLE products
  ADD CONSTRAINT products_cclass_trib_origem_chk
  CHECK (cclass_trib_origem IS NULL OR cclass_trib_origem IN ('TABELA', 'MANUAL'));

-- O PAR anda junto. Um cClassTrib sem CST não é classificável: o mesmo código só
-- é válido dentro do seu CST, e sem o CST não há como validar o par nem derivar
-- a redução. Meio par gravado seria dado que não responde à pergunta que o campo
-- existe para responder.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_cclass_trib_par_chk;
ALTER TABLE products
  ADD CONSTRAINT products_cclass_trib_par_chk
  CHECK ((cst_ibs_cbs_code IS NULL) = (cclass_trib IS NULL));

-- Classificou, declarou de onde veio. Sem isto a coluna de procedência volta a
-- ser opcional na prática, e a auditoria volta a depender de dedução.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_cclass_trib_procedencia_chk;
ALTER TABLE products
  ADD CONSTRAINT products_cclass_trib_procedencia_chk
  CHECK ((cclass_trib IS NULL) = (cclass_trib_origem IS NULL));

-- As reduções, na mesma unidade da tela, do banco e da tabela oficial:
-- percentual inteiro em [0, 100]. R4 de `cascata-lucro-real.md`.
-- NÃO há CHECK amarrando a redução ao cClassTrib: o código MANUAL é justamente o
-- caso em que a derivação não tem de onde sair, e exigir o par aqui proibiria o
-- que a decisão 2 autoriza.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_iva_reduction_ibs_pct_chk;
ALTER TABLE products
  ADD CONSTRAINT products_iva_reduction_ibs_pct_chk
  CHECK (iva_reduction_ibs_pct IS NULL
         OR (iva_reduction_ibs_pct >= 0 AND iva_reduction_ibs_pct <= 100));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_iva_reduction_cbs_pct_chk;
ALTER TABLE products
  ADD CONSTRAINT products_iva_reduction_cbs_pct_chk
  CHECK (iva_reduction_cbs_pct IS NULL
         OR (iva_reduction_cbs_pct >= 0 AND iva_reduction_cbs_pct <= 100));

COMMENT ON COLUMN products.cst_ibs_cbs_code IS
  'CST do IBS/CBS escolhido para o produto. Texto livre, SEM FK para cst_ibs_cbs: a tela sugere, o banco aceita. NULL = não classificado, que não é o mesmo que CST 000.';
COMMENT ON COLUMN products.cclass_trib IS
  'cClassTrib do produto. Só é válido DENTRO do seu CST — o par é a chave em cclass_trib, e par incompatível é rejeitado pela SEFAZ. SEM FK de propósito: código publicado antes da nossa atualização precisa passar.';
COMMENT ON COLUMN products.cclass_trib_origem IS
  'Procedência do código, gravada como FATO no momento do cadastro: TABELA (existia na tabela oficial) ou MANUAL (o usuário digitou um código que a tabela não tinha). NULL = produto anterior a este campo, que não é nenhum dos dois. NÃO é derivável depois: a tabela muda, e a resposta mudaria sozinha.';
COMMENT ON COLUMN products.cclass_trib_source_published_at IS
  'Publicação da tabela oficial vigente no momento em que o produto foi classificado. É o que torna a procedência verificável: "veio da tabela de 22/06/2026" se confere; "veio da tabela" não.';
COMMENT ON COLUMN products.iva_reduction_ibs_pct IS
  'Percentual de REDUÇÃO do IBS, DERIVADO do cClassTrib (cclass_trib.p_red_ibs) e CONGELADO aqui: o preço foi formado com ele. Reler da tabela seria a 7a aparição de fato-vs-referencia.md. Inteiro em [0, 100]: efetiva = original × (1 − pct/100).';
COMMENT ON COLUMN products.iva_reduction_cbs_pct IS
  'Percentual de REDUÇÃO da CBS, DERIVADO do cClassTrib (cclass_trib.p_red_cbs) e CONGELADO aqui. Separado do IBS porque a tabela oficial os separa: o código 200025 (ProUni) tem 60 no IBS e 100 na CBS.';


-- ─────────────────────────────────────────────────────────────────────────
-- O MESMO EM `services` — as seis colunas e as três CHECK, sem exceção
-- ─────────────────────────────────────────────────────────────────────────
-- As razões estão escritas uma vez, no bloco de `products` acima, e valem
-- inteiras aqui: nuláveis e sem default, sem FK, e as três CHECK de coerência.
-- Repeti-las seria a segunda cópia que `copia-divergente.md` manda não criar.
--
-- O que NÃO se repete e precisa ser dito: serviço tem `iva_dual_reduction_factor`
-- próprio, e deixá-lo de fora faria o produto ter duas reduções e o serviço uma,
-- sem nada falhar. É por isso que as duas metades entram no MESMO arquivo.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS cst_ibs_cbs_code                text,
  ADD COLUMN IF NOT EXISTS cclass_trib                     text,
  ADD COLUMN IF NOT EXISTS cclass_trib_origem              text,
  ADD COLUMN IF NOT EXISTS cclass_trib_source_published_at date,
  ADD COLUMN IF NOT EXISTS iva_reduction_ibs_pct           numeric,
  ADD COLUMN IF NOT EXISTS iva_reduction_cbs_pct           numeric;

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_cclass_trib_origem_chk;
ALTER TABLE services
  ADD CONSTRAINT services_cclass_trib_origem_chk
  CHECK (cclass_trib_origem IS NULL OR cclass_trib_origem IN ('TABELA', 'MANUAL'));

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_cclass_trib_par_chk;
ALTER TABLE services
  ADD CONSTRAINT services_cclass_trib_par_chk
  CHECK ((cst_ibs_cbs_code IS NULL) = (cclass_trib IS NULL));

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_cclass_trib_procedencia_chk;
ALTER TABLE services
  ADD CONSTRAINT services_cclass_trib_procedencia_chk
  CHECK ((cclass_trib IS NULL) = (cclass_trib_origem IS NULL));

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_iva_reduction_ibs_pct_chk;
ALTER TABLE services
  ADD CONSTRAINT services_iva_reduction_ibs_pct_chk
  CHECK (iva_reduction_ibs_pct IS NULL
         OR (iva_reduction_ibs_pct >= 0 AND iva_reduction_ibs_pct <= 100));

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_iva_reduction_cbs_pct_chk;
ALTER TABLE services
  ADD CONSTRAINT services_iva_reduction_cbs_pct_chk
  CHECK (iva_reduction_cbs_pct IS NULL
         OR (iva_reduction_cbs_pct >= 0 AND iva_reduction_cbs_pct <= 100));

COMMENT ON COLUMN services.cst_ibs_cbs_code IS
  'CST do IBS/CBS escolhido para o serviço. Texto livre, SEM FK para cst_ibs_cbs: a tela sugere, o banco aceita. NULL = não classificado, que não é o mesmo que CST 000.';
COMMENT ON COLUMN services.cclass_trib IS
  'cClassTrib do serviço. Só é válido DENTRO do seu CST — o par é a chave em cclass_trib, e par incompatível é rejeitado pela SEFAZ. SEM FK de propósito: código publicado antes da nossa atualização precisa passar.';
COMMENT ON COLUMN services.cclass_trib_origem IS
  'Procedência do código, gravada como FATO no momento do cadastro: TABELA (existia na tabela oficial) ou MANUAL (o usuário digitou um código que a tabela não tinha). NULL = serviço anterior a este campo, que não é nenhum dos dois. NÃO é derivável depois: a tabela muda, e a resposta mudaria sozinha.';
COMMENT ON COLUMN services.cclass_trib_source_published_at IS
  'Publicação da tabela oficial vigente no momento em que o serviço foi classificado. É o que torna a procedência verificável: "veio da tabela de 22/06/2026" se confere; "veio da tabela" não.';
COMMENT ON COLUMN services.iva_reduction_ibs_pct IS
  'Percentual de REDUÇÃO do IBS, DERIVADO do cClassTrib (cclass_trib.p_red_ibs) e CONGELADO aqui: o preço foi formado com ele. Reler da tabela seria a 7a aparição de fato-vs-referencia.md. Inteiro em [0, 100]: efetiva = original × (1 − pct/100).';
COMMENT ON COLUMN services.iva_reduction_cbs_pct IS
  'Percentual de REDUÇÃO da CBS, DERIVADO do cClassTrib (cclass_trib.p_red_cbs) e CONGELADO aqui. Separado do IBS porque a tabela oficial os separa: o código 200025 (ProUni) tem 60 no IBS e 100 na CBS.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO — obrigatória, e NÃO é o retorno do comando de aplicação
-- ─────────────────────────────────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name in ('products', 'services')
--     and column_name in ('cst_ibs_cbs_code','cclass_trib','cclass_trib_origem',
--                         'cclass_trib_source_published_at',
--                         'iva_reduction_ibs_pct','iva_reduction_cbs_pct')
--   order by table_name, column_name;
--
-- Espera SEIS linhas POR TABELA (products e services), todas com
-- is_nullable = 'YES' e column_default NULL.
-- Zero linhas = não aplicada, independentemente do que o merge diga.
--
--   NOTIFY pgrst, 'reload schema';
