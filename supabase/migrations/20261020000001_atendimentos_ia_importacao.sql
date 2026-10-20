-- ════════════════════════════════════════════════════════════════════════════════════════
-- Atendimentos I.A. — a IMPORTAÇÃO do conteúdo da tabela e do motor de um fornecedor
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ NÃO APLICADA. Escrita em 20/10/2026. Nenhum ambiente tem estas tabelas até alguém aplicar
-- ║ e conferir pelo catálogo (`migration-delivery.md`: o default é PENDENTE).
-- ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261020000001_atendimentos_ia_importacao.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ AVISO, EM VOZ ALTA: REIMPORTAR A MESMA TABELA SUBSTITUI AS LINHAS DAQUELA tabela_id.
-- ║
-- ║ Em orcamentista_tabela_item, orcamentista_motor_regra, orcamentista_motor_tipologia e
-- ║ orcamentista_motor_formula_familia, uma importação NÃO SOMA à anterior: as linhas daquela
-- ║ tabela_id são APAGADAS e as do arquivo novo entram no lugar. O que estava lá antes NÃO É
-- ║ GUARDADO em lugar nenhum — o arquivo de origem continua no bucket, e é a única cópia.
-- ║
-- ║ A exceção é orcamentista_importacao: ela é o REGISTRO de cada importação, e acumula — uma
-- ║ linha por vez que se importou, nunca substituída.
-- ║
-- ║ Esta migração não impõe a substituição (não há trigger): quem a faz é a rota de importação,
-- ║ apagando e inserindo na mesma transação. Está escrito aqui para que ninguém descubra depois.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- A ESTRUTURA FOI DERIVADA DA MEDIÇÃO DOS ARQUIVOS REAIS DA WOLFF, EM 20/10/2026 — medição da
-- SESSÃO DE VERIFICAÇÃO, NÃO do dono do produto, e NÃO refeita por quem escreveu este arquivo
-- (os arquivos não estão no repositório):
--   tabela de preço ...... 781 linhas, 756 códigos, 734 com valor
--   motor ................ 4.055 regras, 549 códigos, 157 tipologias, 28.199 aplicações
--   fórmulas da família .. 137 linhas
--
-- O que os números decidem aqui:
--   - 781 linhas = 756 códigos + 25 LINHAS DE CABEÇALHO. A aba de preço é dividida em SEÇÕES,
--     cada uma com o seu cabeçalho, e o cabeçalho repete a palavra "CÓDIGO" na coluna do
--     código. A importação tem de PULAR a linha de cabeçalho — ela não é item, e não há o que
--     escolher entre ela e uma linha de verdade.
--   - Duplicados medidos: 3 — IL4237, KT4237 e a palavra "CÓDIGO" (o cabeçalho).
--     IL4237 e KT4237 aparecem duas vezes, em SEÇÕES DIFERENTES — "LAMINADOS TOTAL —
--     AMADEIRADO NOGUEIRA" (linhas 556/557) e "LAMINADOS PARTE EXTERNA — AMADEIRADO NOGUEIRA"
--     (linhas 674/675) —, com alíquota 18% nas duas e valores IDÊNTICOS: interno 83,52, 12%
--     73,38, barra de 6 m (medição da sessão de verificação, 20/10/2026).
--
--     DECISÃO DA SESSÃO DE VERIFICAÇÃO, 20/10/2026, tomada sobre a medição acima — o dono do
--     produto NÃO foi consultado sobre este ponto, e pode derrubá-la. (A autoria saiu errada na
--     versão anterior: a instrução dizia "DECISÃO SOBRE OS DUPLICADOS" sem dizer de quem.)
--       (1) a chave única FICA (tabela_id, codigo) — a seção NÃO entra nela. O motor busca só
--           pelo código, e dois registros com o mesmo preço lhe dariam duas respostas para uma
--           pergunta;
--       (2) a importação GUARDA A PRIMEIRA ocorrência, conta a segunda em `normalizados`, e grava
--           em `avisos` o código, as duas seções e se os valores batiam;
--       (3) se um dia os valores NÃO baterem, o aviso tem de dizer isso EM VOZ ALTA — aí a decisão
--           volta para o dono do produto. Guardar a primeira só é seguro enquanto as duas forem
--           o mesmo preço.
--   - CORREÇÃO DE PREMISSA: a versão anterior deste cabeçalho dizia que havia código repetido
--     em quantidade e que a importação escolheria uma linha por código. Estava ERRADA. Segundo
--     o dono do produto, a indução veio da sessão de verificação; quem a escreveu aqui como
--     premissa foi a sessão que escreveu este arquivo, deduzindo-a de 781 − 756 sem medir.
--   - A ALÍQUOTA INTERNA NÃO É ÚNICA. Os 25 cabeçalhos NÃO dizem a mesma coisa: 9 dizem 17%,
--     15 dizem 18%, e 1 diz "VALOR UNIT / VALOR TOTAL" em vez de metro/barra. Por isso o item
--     guarda o valor "interno" com a alíquota da SEÇÃO de onde veio, e não um 17% fixo no nome
--     da coluna. Os 25 dizem 12% na outra alíquota, e as colunas de 12% ficam com o nome.
--   - A seção "VALOR UNIT / VALOR TOTAL" é vendida por UNIDADE, não por barra: `vendido_por`.
--   - 734 com valor de 756: 22 códigos SEM VALOR. Por isso toda coluna de valor é NULÁVEL e SEM
--     DEFAULT — NULL é "o arquivo não traz valor", e 0 afirmaria "vale zero"
--     (`ausente-vs-falso.md`). Vale para toda coluna lida do arquivo, salvo `codigo`.
--   - 4.055 regras para 549 códigos: a regra NÃO é única por código. Não há UNIQUE na regra.
--   - 28.199 aplicações: a soma, regra a regra, das tipologias em que ela se aplica — é o que
--     `tipologias text[]` guarda.
--   - `linha` NÃO CRUZA entre as abas do motor: a regra diz 'EUROPA 42', a família diz
--     'PVC EUROPA 42', interseção zero. A importação normaliza o nome; a família guarda também
--     `linha_original`, como veio do arquivo.
--
-- A ABA "Sem uso no motor" NÃO TEM TABELA, E NÃO PRECISA: os 185 códigos dela estão TODOS dentro
-- da aba de preço (medição da sessão de verificação). Não criar tabela para ela depois.
--
-- ADITIVA. Cinco tabelas novas, as políticas delas e os índices. Nenhum DROP, nenhum UPDATE,
-- nenhum GRANT. Os REVOKE são só sobre as cinco novas. `orcamentista_tabela` NÃO é tocada.
--
-- AS MESMAS REGRAS DO RESTO DA ÁREA (`20261019000001`, passos 6 e 8):
--   - RLS ligada, quatro políticas por tabela, todas `is_super_admin()`;
--   - REVOKE ALL de anon e authenticated, e NENHUM GRANT: o acesso é só pela rota de API, com
--     `service_role`. As políticas ficam como segunda camada;
--   - quem importou (`importado_por`) SEM FK: o autor é fato histórico (`fato-vs-referencia.md`).
--
-- TODAS PRESAS A orcamentista_tabela(id) COM ON DELETE CASCADE: excluir a tabela leva o
-- conteúdo importado dela e o registro das importações junto. (A tabela só pode ser excluída
-- quando nenhuma conta a usa — RESTRICT em orcamentista_conta_tabela, `20261019000001`.)
--
-- OS TIPOS DAS COLUNAS LIDAS DO ARQUIVO NÃO FORAM MEDIDOS — a medição trouxe contagens, não o
-- formato de cada campo. A escolha: `numeric` para o que é medida, peso, alíquota e valor;
-- `text` para o resto, inclusive `pacote`, `corte` e as fórmulas. Um campo numérico que vier
-- com texto no arquivo é problema da importação contar e avisar, não do banco adivinhar.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. O PREÇO — uma linha por código ──────────────────────────────────────────────────────
CREATE TABLE public.orcamentista_tabela_item (
  id                    uuid    NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id             uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  codigo                text    NOT NULL,
  descricao             text    NULL,
  medida_barra_m        numeric NULL,
  unidade               text    NULL,
  ncm                   text    NULL,
  peso                  numeric NULL,
  ipi                   numeric NULL,
  pacote                text    NULL,
  segmento              text    NULL,
  custo                 numeric NULL,
  secao                 text    NULL,
  aliquota_interna_pct  numeric NULL,
  vendido_por           text    NULL CHECK (vendido_por IN ('barra', 'unidade')),
  valor_metro_interno   numeric NULL,
  valor_barra_interno   numeric NULL,
  valor_metro_12        numeric NULL,
  valor_barra_12        numeric NULL,
  CONSTRAINT orcamentista_tabela_item_codigo_key UNIQUE (tabela_id, codigo)
);

COMMENT ON TABLE public.orcamentista_tabela_item IS
  'O preco importado do arquivo da tabela: uma linha por codigo. REIMPORTAR SUBSTITUI as linhas da tabela_id. Colunas de valor nulaveis e sem default: NULL = o arquivo nao traz valor, nunca zero. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_tabela_item.segmento IS
  'Coluna do ARQUIVO do fornecedor, gravada como veio. Nao e a segmentacao fiscal da conta.';
COMMENT ON COLUMN public.orcamentista_tabela_item.secao IS
  'O TITULO da secao de onde a linha veio - o texto ACIMA do cabecalho de colunas, ex.: TABELA PERFIS LAMINADOS TOTAL - AMADEIRADO NOGUEIRA. E ele que diz o que a secao e; nao e o rotulo das colunas. Como esta no arquivo. NULL = linha sem secao identificada.';
COMMENT ON COLUMN public.orcamentista_tabela_item.aliquota_interna_pct IS
  'A aliquota interna (17 ou 18) lida dos ROTULOS DAS COLUNAS do cabecalho da secao acima da linha, NAO de um valor global: o arquivo da Wolff tem secoes de 17% e de 18%. Linha sem secao identificada fica com NULL.';
COMMENT ON COLUMN public.orcamentista_tabela_item.vendido_por IS
  'barra ou unidade, lido da SECAO (a secao VALOR UNIT / VALOR TOTAL e por unidade). NULL quando a secao nao disser - nunca inventado.';
COMMENT ON COLUMN public.orcamentista_tabela_item.valor_metro_interno IS
  'Valor por metro na aliquota interna da secao (aliquota_interna_pct).';
COMMENT ON COLUMN public.orcamentista_tabela_item.valor_barra_interno IS
  'Valor por barra na aliquota interna da secao (aliquota_interna_pct).';

-- ── 2. O MOTOR — uma linha por regra de corte ──────────────────────────────────────────────
CREATE TABLE public.orcamentista_motor_regra (
  id              uuid    NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id       uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  codigo          text    NOT NULL,
  descricao       text    NULL,
  segmento        text    NULL,
  cor             text    NULL,
  codigo_wvetro   text    NULL,
  linha           text    NULL,
  tipo            text    NULL,
  eixo            text    NULL,
  corte           text    NULL,
  formula_medida  text    NULL,
  formula_em_lh   text    NULL,
  formula_qtde    text    NULL,
  condicao        text    NULL,
  obs             text    NULL,
  tipologias      text[]  NOT NULL
);

COMMENT ON TABLE public.orcamentista_motor_regra IS
  'As regras de corte importadas do arquivo do motor. Nao e unica por codigo: um codigo tem varias regras. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_motor_regra.tipologias IS
  'As tipologias em que a regra se aplica. NOT NULL e sem default: a importacao sempre diz quais sao, e uma lista vazia e uma afirmacao que ela tem de fazer, nao um default.';
COMMENT ON COLUMN public.orcamentista_motor_regra.segmento IS
  'Coluna do ARQUIVO do fornecedor, gravada como veio. Nao e a segmentacao fiscal da conta.';

-- ── 3. O RESUMO POR TIPOLOGIA — o que a tela de levantamento lê primeiro ───────────────────
CREATE TABLE public.orcamentista_motor_tipologia (
  id              uuid    NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id       uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  tipologia       text    NOT NULL,
  linha           text    NULL,
  n_regras        integer NOT NULL CHECK (n_regras >= 0),
  n_condicionais  integer NOT NULL CHECK (n_condicionais >= 0),
  variaveis       text[]  NOT NULL,
  CONSTRAINT orcamentista_motor_tipologia_key UNIQUE (tabela_id, tipologia)
);

COMMENT ON TABLE public.orcamentista_motor_tipologia IS
  'Resumo por tipologia, derivado das regras na importacao. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

-- ── 4. AS FÓRMULAS DA FAMÍLIA ──────────────────────────────────────────────────────────────
-- Sem UNIQUE: a medição trouxe 137 linhas e não disse se (linha, variavel) se repete.
CREATE TABLE public.orcamentista_motor_formula_familia (
  id              uuid    NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id       uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  linha           text    NULL,
  linha_original  text    NULL,
  variavel        text    NULL,
  descricao       text    NULL,
  formula         text    NULL,
  formula_em_lh   text    NULL,
  pct_padrao      numeric NULL
);

COMMENT ON TABLE public.orcamentista_motor_formula_familia IS
  'As formulas da familia importadas do arquivo do motor. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_motor_formula_familia.linha IS
  'O nome da linha NORMALIZADO pela importacao, para cruzar com orcamentista_motor_regra.linha. No arquivo da Wolff os dois nao cruzam como vieram: a regra diz EUROPA 42, a familia diz PVC EUROPA 42.';
COMMENT ON COLUMN public.orcamentista_motor_formula_familia.linha_original IS
  'O nome da linha como veio do arquivo, antes da normalizacao.';

-- ── 5. O REGISTRO DE CADA IMPORTAÇÃO — acumula, nunca é substituído ────────────────────────
-- As contagens são MEDIDAS pela importação, e por isso NOT NULL e SEM DEFAULT: um zero aqui
-- tem de ser o que a importação contou, nunca o que o banco preencheu.
CREATE TABLE public.orcamentista_importacao (
  id              uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id       uuid        NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  importado_em    timestamptz NOT NULL DEFAULT now(),
  importado_por   uuid        NULL,
  itens           integer     NOT NULL CHECK (itens >= 0),
  regras          integer     NOT NULL CHECK (regras >= 0),
  tipologias      integer     NOT NULL CHECK (tipologias >= 0),
  cruzam          integer     NOT NULL CHECK (cruzam >= 0),
  nao_cruzam      integer     NOT NULL CHECK (nao_cruzam >= 0),
  normalizados    integer     NOT NULL CHECK (normalizados >= 0),
  avisos          jsonb       NOT NULL
);

COMMENT ON TABLE public.orcamentista_importacao IS
  'Uma linha por importacao, com as contagens medidas. ACUMULA: reimportar acrescenta uma linha aqui, enquanto substitui o conteudo nas outras quatro. So pela rota, com service_role.';
COMMENT ON COLUMN public.orcamentista_importacao.importado_por IS
  'O super admin que importou. Sem FK: o autor e fato historico.';
COMMENT ON COLUMN public.orcamentista_importacao.cruzam IS
  'Codigos do motor que existem no preco da mesma tabela.';
COMMENT ON COLUMN public.orcamentista_importacao.nao_cruzam IS
  'Codigos do motor que NAO existem no preco da mesma tabela.';
COMMENT ON COLUMN public.orcamentista_importacao.normalizados IS
  'Linhas que a importacao ajustou para caber (ex.: codigo repetido no arquivo de preco). O detalhe vai em avisos.';
COMMENT ON COLUMN public.orcamentista_importacao.avisos IS
  'Os avisos da importacao, em jsonb. NOT NULL e sem default: sem aviso, a importacao grava uma lista vazia. Codigo repetido no preco: o codigo, as duas secoes e se os valores batiam - e, se NAO batiam, o aviso diz isso em voz alta.';

-- ── 6. ÍNDICES — pelo que vai ser consultado ───────────────────────────────────────────────
-- (tabela_id, codigo) do PREÇO e (tabela_id, tipologia) do RESUMO já são as UNIQUE acima.
CREATE INDEX orcamentista_motor_regra_codigo_idx
  ON public.orcamentista_motor_regra (tabela_id, codigo);
-- A regra guarda as tipologias num array: "as regras desta tipologia" é `tipologias @> ARRAY[x]`,
-- e é o GIN que atende essa busca. O filtro por tabela_id vem do índice acima.
CREATE INDEX orcamentista_motor_regra_tipologias_idx
  ON public.orcamentista_motor_regra USING gin (tipologias);
CREATE INDEX orcamentista_motor_formula_familia_tabela_idx
  ON public.orcamentista_motor_formula_familia (tabela_id, linha);
CREATE INDEX orcamentista_importacao_tabela_idx
  ON public.orcamentista_importacao (tabela_id, importado_em DESC);

-- ── 7. RLS — a segunda camada ──────────────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_tabela_item           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_motor_regra           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_motor_tipologia       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_motor_formula_familia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentista_importacao            ENABLE ROW LEVEL SECURITY;

CREATE POLICY orcamentista_tabela_item_select_super_admin ON public.orcamentista_tabela_item
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_tabela_item_insert_super_admin ON public.orcamentista_tabela_item
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_tabela_item_update_super_admin ON public.orcamentista_tabela_item
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_tabela_item_delete_super_admin ON public.orcamentista_tabela_item
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_motor_regra_select_super_admin ON public.orcamentista_motor_regra
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_regra_insert_super_admin ON public.orcamentista_motor_regra
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_regra_update_super_admin ON public.orcamentista_motor_regra
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_regra_delete_super_admin ON public.orcamentista_motor_regra
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_motor_tipologia_select_super_admin ON public.orcamentista_motor_tipologia
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_tipologia_insert_super_admin ON public.orcamentista_motor_tipologia
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_tipologia_update_super_admin ON public.orcamentista_motor_tipologia
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_tipologia_delete_super_admin ON public.orcamentista_motor_tipologia
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_motor_formula_familia_select_super_admin ON public.orcamentista_motor_formula_familia
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_formula_familia_insert_super_admin ON public.orcamentista_motor_formula_familia
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_formula_familia_update_super_admin ON public.orcamentista_motor_formula_familia
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_formula_familia_delete_super_admin ON public.orcamentista_motor_formula_familia
  FOR DELETE USING (public.is_super_admin());

CREATE POLICY orcamentista_importacao_select_super_admin ON public.orcamentista_importacao
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_importacao_insert_super_admin ON public.orcamentista_importacao
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_importacao_update_super_admin ON public.orcamentista_importacao
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_importacao_delete_super_admin ON public.orcamentista_importacao
  FOR DELETE USING (public.is_super_admin());

-- ── 8. PRIVILÉGIOS — REVOKE ALL, e NENHUM GRANT ────────────────────────────────────────────
-- A mesma razão do passo 8 da `20261019000001`: o default ACL dá os sete privilégios a
-- `authenticated` em toda tabela nova; aqui eles saem todos. Só a rota lê e escreve, com
-- `service_role`.
REVOKE ALL ON public.orcamentista_tabela_item           FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_motor_regra           FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_motor_tipologia       FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_motor_formula_familia FROM anon, authenticated;
REVOKE ALL ON public.orcamentista_importacao            FROM anon, authenticated;

COMMIT;

-- Depois do COMMIT, passo SEPARADO (`migration-delivery.md`):
--   NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar DEPOIS de aplicar.
--
-- (1) As cinco tabelas existem, com RLS LIGADA:
--   select c.relname, c.relrowsecurity
--     from pg_class c
--    where c.relnamespace = 'public'::regnamespace
--      and c.relname in ('orcamentista_tabela_item','orcamentista_motor_regra',
--                        'orcamentista_motor_tipologia','orcamentista_motor_formula_familia',
--                        'orcamentista_importacao')
--    order by 1;
--   esperado: 5 linhas, relrowsecurity = true em todas.
--
-- (2) Quatro políticas por tabela, todas com is_super_admin():
--   select tablename, count(*) from pg_policies
--    where schemaname = 'public'
--      and tablename in ('orcamentista_tabela_item','orcamentista_motor_regra',
--                        'orcamentista_motor_tipologia','orcamentista_motor_formula_familia',
--                        'orcamentista_importacao')
--    group by 1 order by 1;
--   esperado: 4 em cada uma das 5.
--
-- (3) anon e authenticated SEM privilégio nenhum nas cinco:
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('orcamentista_tabela_item','orcamentista_motor_regra',
--                         'orcamentista_motor_tipologia','orcamentista_motor_formula_familia',
--                         'orcamentista_importacao')
--      and grantee in ('anon','authenticated');
--   esperado: 0 linhas.
--
-- (4) As cinco FK para orcamentista_tabela, todas ON DELETE CASCADE:
--   select conrelid::regclass, confdeltype
--     from pg_constraint
--    where contype = 'f' and confrelid = 'public.orcamentista_tabela'::regclass
--      and conrelid::regclass::text in ('orcamentista_tabela_item','orcamentista_motor_regra',
--                                       'orcamentista_motor_tipologia',
--                                       'orcamentista_motor_formula_familia',
--                                       'orcamentista_importacao');
--   esperado: 5 linhas, confdeltype = 'c' em todas.
-- ════════════════════════════════════════════════════════════════════════════════════════
